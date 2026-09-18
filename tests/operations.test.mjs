import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { localNode } from './local-node.mjs'
import { createPublicClient, createWalletClient, defineChain, http, maxUint256, encodeFunctionData, keccak256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const execute=promisify(execFile)
test('mainnet deployment journaling and keeper collection against a local chain',async t=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'flowsub-operations-'))
  const node=await localNode(677)
  const server={provider:node.provider,close:node.close}
  let ticker
  t.after(async()=>{clearInterval(ticker);await server.close();assert.ok(path.resolve(cwd).startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(cwd).startsWith('flowsub-operations-'));fs.rmSync(cwd,{recursive:true,force:true})})
  const rpc=node.rpc
  const chain=defineChain({id:677,name:'Local BOT',nativeCurrency:{name:'BOT',symbol:'BOT',decimals:18},rpcUrls:{default:{http:[rpc]}}})
  const accounts=node.accounts
  const client=createPublicClient({chain,pollingInterval:50,transport:http(rpc)})
  const wallets=accounts.map(account=>createWalletClient({account,chain,transport:http(rpc)}))
  fs.mkdirSync(path.join(cwd,'artifacts'));fs.mkdirSync(path.join(cwd,'deployments'))
  for(const name of ['FlowSub.json','MockUSDT.json','standard-input.json','compiler-version.txt']) fs.copyFileSync(`artifacts/${name}`,path.join(cwd,'artifacts',name))
  const tokenArtifact=JSON.parse(fs.readFileSync('artifacts/MockUSDT.json'))
  const hash=await wallets[0].deployContract(tokenArtifact), token=(await client.waitForTransactionReceipt({hash})).contractAddress
  const env={...process.env,BOTCHAIN_NETWORK:'mainnet',BOTCHAIN_ENV_FILE:path.join(cwd,'.nonexistent'),BOTCHAIN_RPC_URL:rpc,BOTCHAIN_LOG_RPC_URL:rpc,PAYMENT_TOKEN_ADDRESS:token,PAYMENT_TOKEN_REVIEWED:'true',DEPLOYER_PRIVATE_KEY:node.keys[0],KEEPER_PRIVATE_KEY:node.keys[2],KEEPER_MIN_BALANCE_BOT:'0',KEEPER_MAX_CHECKS:'50'}
  delete env.FLOWSUB_ADDRESS
  const root=process.cwd()
  const run=name=>execute(process.execPath,[path.join(root,'scripts',name)],{cwd,env,timeout:60000})
  ticker=setInterval(()=>server.provider.request({method:'evm_mine',params:[]}).catch(()=>{}),500)
  const deployed=await run('deploy-mainnet.mjs');assert.match(deployed.stdout,/Deployment confirmed/)
  const manifest=JSON.parse(fs.readFileSync(path.join(cwd,'deployments/bot-mainnet.json')))
  assert.equal(manifest.chainId,677);assert.equal(manifest.token.address.toLowerCase(),token.toLowerCase())
  const journal=JSON.parse(fs.readFileSync(path.join(cwd,'deployments/bot-mainnet.pending.json')))
  assert.equal(journal.hash,manifest.flowSub.transactionHash)
  await assert.rejects(run('deploy-mainnet.mjs'))
  // Simulate a restart after confirmation but before the manifest was saved.
  const nonceBefore=await client.getTransactionCount({address:accounts[0].address})
  fs.unlinkSync(path.join(cwd,'deployments/bot-mainnet.json'))
  await run('deploy-mainnet.mjs')
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd,'deployments/bot-mainnet.json'))).flowSub.address,manifest.flowSub.address)
  assert.equal(await client.getTransactionCount({address:accounts[0].address}),nonceBefore)
  assert.match((await run('check-deployment.mjs')).stdout,/validated/)
  env.PUBLIC_LOG_RPC_URL=rpc;env.PUBLIC_ENV_OUTPUT=path.join(cwd,'.env.production')
  await run('export-mainnet-env.mjs')
  const publicEnv=fs.readFileSync(env.PUBLIC_ENV_OUTPUT,'utf8')
  assert.match(publicEnv,/VITE_NETWORK="mainnet"/);assert.ok(!publicEnv.includes(node.keys[0]));assert.ok(!publicEnv.includes(node.keys[2]))
  await assert.rejects(run('export-mainnet-env.mjs'))
  const flow=manifest.flowSub.address, {abi}=JSON.parse(fs.readFileSync('artifacts/FlowSub.json'))
  async function write(index,address,abi,functionName,args) {const {request}=await client.simulateContract({account:accounts[index],address,abi,functionName,args});const hash=await wallets[index].writeContract(request);assert.equal((await client.waitForTransactionReceipt({hash})).status,'success')}
  await write(0,flow,abi,'createPlan',['Keeper','',100n,60,0])
  await write(1,token,tokenArtifact.abi,'mint',[accounts[1].address,1000n]);await write(1,token,tokenArtifact.abi,'approve',[flow,maxUint256]);await write(1,flow,abi,'subscribe',[1n])
  await server.provider.request({method:'evm_increaseTime',params:[60]});await server.provider.request({method:'evm_mine',params:[]})
  const result=await run('run-keeper.mjs');assert.match(result.stdout,/"collected":1/)
  assert.match((await run('run-keeper.mjs')).stdout,/"collected":0/)
  const sub=await client.readContract({address:flow,abi,functionName:'getSubscription',args:[accounts[1].address,1n]});assert.equal(sub.totalPaid,200n)
  // Simulate a worker restart after saving signed bytes and before broadcast.
  await server.provider.request({method:'evm_increaseTime',params:[60]});await server.provider.request({method:'evm_mine',params:[]})
  const request=await wallets[2].prepareTransactionRequest({account:accounts[2],to:flow,data:encodeFunctionData({abi,functionName:'executePayment',args:[accounts[1].address,1n]})})
  const raw=await wallets[2].signTransaction(request)
  const statePath=path.join(cwd,`.runtime/keeper-mainnet-${flow.toLowerCase()}.json`)
  const state=JSON.parse(fs.readFileSync(statePath));state.pending={id:`1:${accounts[1].address.toLowerCase()}`,hash:keccak256(raw),raw};fs.writeFileSync(statePath,JSON.stringify(state))
  assert.match((await run('run-keeper.mjs')).stdout,/"collected":1/)
  assert.match((await run('run-keeper.mjs')).stdout,/"collected":0/)
  assert.equal((await client.readContract({address:flow,abi,functionName:'getSubscription',args:[accounts[1].address,1n]})).totalPaid,300n)
  env.KEEPER_PRIVATE_KEY=node.keys[0];await assert.rejects(run('run-keeper.mjs'),/different wallet from the deployer/)
  env.KEEPER_PRIVATE_KEY='';await assert.rejects(run('run-keeper.mjs'))
})
