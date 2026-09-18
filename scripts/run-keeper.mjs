import fs from 'node:fs'
import { createWalletClient, http, parseEther, encodeFunctionData, keccak256, decodeEventLog } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { networkName, chain, client, manifestPath, address, artifact, assertDeployment, atomicJson, integer } from './lib/network.mjs'

const key = process.env.KEEPER_PRIVATE_KEY
if(!/^0x[0-9a-f]{64}$/i.test(key || '')) throw new Error('A dedicated KEEPER_PRIVATE_KEY is required')
const deployment = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
await assertDeployment(deployment)
const flow = address(process.env.FLOWSUB_ADDRESS || deployment.flowSub.address, 'FLOWSUB_ADDRESS')
if(flow.toLowerCase() !== deployment.flowSub.address.toLowerCase()) throw new Error('Keeper address differs from manifest')
const account = privateKeyToAccount(key), wallet = createWalletClient({account,chain,transport:http()}), {abi} = artifact()
if(networkName==='mainnet' && account.address.toLowerCase()===deployment.deployer.toLowerCase()) throw new Error('Mainnet keeper must use a different wallet from the deployer')
const minBalance = parseEther(process.env.KEEPER_MIN_BALANCE_BOT || '0.01')
if(await client.getBalance({address:account.address}) < minBalance) throw new Error('Keeper BOT balance below alert threshold')
fs.mkdirSync('.runtime', {recursive:true})
const base = `.runtime/keeper-${networkName}-${flow.toLowerCase()}`
const lockPath=`.runtime/keeper-wallet-${chain.id}-${account.address.toLowerCase()}.lock`
const lock = fs.openSync(lockPath, 'wx')
fs.writeSync(lock, JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}))
const statePath = `${base}.json`
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath,'utf8')) : {plan:1,offset:0,retries:{}}
const save = () => atomicJson(statePath,state)
const maxTx=integer('KEEPER_MAX_TRANSACTIONS',20), maxChecks=integer('KEEPER_MAX_CHECKS',200), maxPlans=integer('KEEPER_MAX_PLANS',100), maxGas=BigInt(integer('KEEPER_MAX_GAS',5000000))
const maxCost=process.env.KEEPER_MAX_COST_BOT?parseEther(process.env.KEEPER_MAX_COST_BOT):null
let checked=0,plansChecked=0,collected=0,expired=0,failed=0,skipped=0,txs=0,gasUsed=0n,costWei=0n,budgetExhausted=false
const read = (functionName,args=[]) => client.readContract({address:flow,abi,functionName,args})
async function settle() {
  if(!state.pending) return
  const pending=state.pending
  try { await client.getTransaction({hash:pending.hash}) }
  catch { await client.sendRawTransaction({serializedTransaction:pending.raw}) }
  const receipt=await client.waitForTransactionReceipt({hash:pending.hash,confirmations:integer('BOTCHAIN_CONFIRMATIONS',2),timeout:60000})
  if(receipt.status !== 'success') { failed++; state.retries[pending.id]={attempt:1,next:Date.now()+60000} }
  else { delete state.retries[pending.id] }
  if(receipt.status === 'success') for(const log of receipt.logs) {
    if(log.address.toLowerCase() !== flow.toLowerCase()) continue
    try { const event=decodeEventLog({abi,data:log.data,topics:log.topics}); if(event.eventName === 'PaymentExecuted') collected++; if(event.eventName === 'SubscriptionExpired') expired++ } catch {}
  }
  delete state.pending; save()
}
try {
  await settle()
  const next=await read('nextPlanId')
  const timestamp=Number((await client.getBlock()).timestamp)
  // A persistent cursor bounds discovery and rotates fairly across plans.
  while(!budgetExhausted && plansChecked<maxPlans && checked<maxChecks && txs<maxTx && gasUsed<maxGas && BigInt(state.plan)<next) {
    plansChecked++
    const id=BigInt(state.plan), plan=await read('getPlan',[id])
    if(!plan.active) {state.plan++;state.offset=0;continue}
    let subscribers
    try { subscribers=await read('getPlanSubscribersPage',[id,BigInt(state.offset),100n]) }
    catch(error) { if(networkName === 'mainnet') throw error; subscribers=(await read('getPlanSubscribers',[id])).slice(state.offset,state.offset+100) }
    if(!subscribers.length) {state.plan++;state.offset=0;continue}
    for(const subscriber of subscribers) {
      if(checked>=maxChecks || txs>=maxTx || gasUsed>=maxGas) break
      checked++;state.offset++
      const retryId=`${id}:${subscriber.toLowerCase()}`
      const sub=await read('getSubscription',[subscriber,id])
      if(!sub.active || Number(sub.nextPayment)>timestamp || (state.retries[retryId]?.next || 0)>Date.now()) {skipped++;continue}
      try {
        await client.simulateContract({address:flow,abi,functionName:'executePayment',args:[subscriber,id],account})
        const data=encodeFunctionData({abi,functionName:'executePayment',args:[subscriber,id]})
        const gas=await client.estimateGas({account,to:flow,data})
        if(gasUsed+gas>maxGas) {state.offset--;budgetExhausted=true;break}
        const request=await wallet.prepareTransactionRequest({account,to:flow,data,gas})
        const cost=gas*(request.maxFeePerGas || request.gasPrice || 0n)
        if(maxCost!==null && costWei+cost>maxCost) {state.offset--;budgetExhausted=true;break}
        const raw=await wallet.signTransaction(request)
        state.pending={id:retryId,hash:keccak256(raw),raw};save()
        txs++;gasUsed+=gas;costWei+=cost
        await settle()
      } catch(error) {
        if(state.pending) throw error // unresolved transaction must be reconciled before a retry
        const current=await read('getSubscription',[subscriber,id])
        if(!current.active || Number(current.nextPayment)>timestamp) skipped++
        else {failed++;const attempt=(state.retries[retryId]?.attempt || 0)+1;state.retries[retryId]={attempt,next:Date.now()+Math.min(3600000,60000*2**Math.min(attempt,6))};console.error(`Collection ${retryId}: ${error.shortMessage || error.message}`)}
      }
      save()
    }
    save()
    if(gasUsed>=maxGas) break
  }
  if(BigInt(state.plan)>=next) {state.plan=1;state.offset=0}
  state.heartbeat=new Date().toISOString();save()
  console.log(JSON.stringify({heartbeat:state.heartbeat,checked,plansChecked,collected,expired,skipped,failed,transactions:txs,estimatedGas:String(gasUsed),maximumCostWei:String(costWei)}))
  if(budgetExhausted) console.error('Gas budget exhausted; pending discovery will resume next run')
  if(failed || (budgetExhausted && txs===0)) process.exitCode=1
} finally { fs.closeSync(lock);fs.unlinkSync(lockPath) }
