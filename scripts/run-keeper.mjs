import 'dotenv/config'
import fs from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const key=process.env.KEEPER_PRIVATE_KEY||process.env.DEPLOYER_PRIVATE_KEY
const address=process.env.FLOWSUB_ADDRESS||process.env.VITE_FLOWSUB_ADDRESS
if(!/^0x[0-9a-fA-F]{64}$/.test(key||'')){console.error('Set KEEPER_PRIVATE_KEY to a funded BOT Chain testnet key.');process.exit(1)}
if(!/^0x[0-9a-fA-F]{40}$/.test(address||'')){console.error('Set FLOWSUB_ADDRESS or VITE_FLOWSUB_ADDRESS.');process.exit(1)}
const rpc=process.env.BOTCHAIN_RPC_URL||'https://rpc.bohr.life'
const chain=defineChain({id:968,name:'BOT Chain Testnet',nativeCurrency:{name:'BOT',symbol:'BOT',decimals:18},rpcUrls:{default:{http:[rpc]}},testnet:true})
const account=privateKeyToAccount(key), client=createPublicClient({chain,transport:http(rpc)}), wallet=createWalletClient({account,chain,transport:http(rpc)})
const {abi}=JSON.parse(fs.readFileSync(new URL('../artifacts/FlowSub.json',import.meta.url),'utf8'))
const nextId=await client.readContract({address,abi,functionName:'nextPlanId'})
let checked=0,executed=0,failed=0

for(let id=1n;id<nextId;id++){
  const plan=await client.readContract({address,abi,functionName:'getPlan',args:[id]})
  if(!plan.active)continue
  const subscribers=await client.readContract({address,abi,functionName:'getPlanSubscribers',args:[id]})
  for(const subscriber of subscribers){
    const sub=await client.readContract({address,abi,functionName:'getSubscription',args:[subscriber,id]})
    checked++
    if(!sub.active||Number(sub.nextPayment)>Math.floor(Date.now()/1000))continue
    try{
      const {request}=await client.simulateContract({address,abi,functionName:'executePayment',args:[subscriber,id],account})
      const hash=await wallet.writeContract(request)
      const receipt=await client.waitForTransactionReceipt({hash})
      if(receipt.status==='success'){executed++;console.log(`Collected plan ${id} from ${subscriber}: ${hash}`)}else failed++
    }catch(error){failed++;console.error(`Could not collect plan ${id} from ${subscriber}: ${error.shortMessage||error.message}`)}
  }
}
console.log(`Keeper complete: checked=${checked}, executed=${executed}, failed=${failed}`)
