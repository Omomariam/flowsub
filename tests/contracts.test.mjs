import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { localNode } from './local-node.mjs'
import solc from 'solc'
import { createPublicClient, createWalletClient, custom, defineChain, maxUint256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

test('recurring payment invariants on a local EVM', async t => {
  const node=await localNode(1337),provider=node.provider
  t.after(()=>provider.disconnect())
  const chain=defineChain({id:1337,name:'Local',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://localhost']}}})
  const accounts=node.accounts
  const client=createPublicClient({chain,pollingInterval:50,transport:custom(provider)})
  const wallets=accounts.map(account=>createWalletClient({account,chain,transport:custom(provider)}))
  const artifact=name=>JSON.parse(fs.readFileSync(`artifacts/${name}.json`,'utf8'))
  async function deploy(contract,args=[]) { const hash=await wallets[0].deployContract({...contract,args});const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return r.contractAddress }
  const tokenArtifact=artifact('MockUSDT'), flowArtifact=artifact('FlowSub')
  const token=await deploy(tokenArtifact), flow=await deploy(flowArtifact,[token])
  const read=(functionName,args=[])=>client.readContract({address:flow,abi:flowArtifact.abi,functionName,args})
  async function write(index,address,abi,functionName,args=[]) {
    const {request}=await client.simulateContract({account:accounts[index],address,abi,functionName,args})
    const hash=await wallets[index].writeContract(request), r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return r
  }
  const call=(index,name,args=[])=>write(index,flow,flowArtifact.abi,name,args)
  const rejects=(index,name,args=[])=>assert.rejects(()=>call(index,name,args))
  const balance=who=>client.readContract({address:token,abi:tokenArtifact.abi,functionName:'balanceOf',args:[accounts[who].address]})
  const advance=async seconds=>{await provider.request({method:'evm_increaseTime',params:[seconds]});await provider.request({method:'evm_mine',params:[]})}

  await t.test('rejects EOAs as token and invalid plan terms', async()=>{
    await assert.rejects(()=>deploy(flowArtifact,[accounts[1].address]))
    await rejects(0,'createPlan',['','',1n,10,0]);await rejects(0,'createPlan',['Plan','',0n,10,0]);await rejects(0,'createPlan',['Plan','',1n,0,0]);await rejects(0,'createPlan',['Plan','',1n,10,9])
  })
  await call(0,'createPlan',['Recurring','',25_000_000n,60,0])
  await write(1,token,tokenArtifact.abi,'mint',[accounts[1].address,200_000_000n])
  await t.test('failed allowance preserves state, first charge pays merchant',async()=>{
    await rejects(1,'subscribe',[1n]);assert.equal((await read('getSubscription',[accounts[1].address,1n])).active,false)
    await write(1,token,tokenArtifact.abi,'approve',[flow,maxUint256])
    const before=await balance(0);await call(1,'subscribe',[1n]);assert.equal(await balance(0)-before,25_000_000n)
    const sub=await read('getSubscription',[accounts[1].address,1n]);assert.equal(sub.totalPaid,25_000_000n);assert.equal(sub.active,true)
    await rejects(1,'subscribe',[1n]);await rejects(2,'executePayment',[accounts[1].address,1n]);await rejects(2,'setPlanActive',[1n,false])
  })
  await t.test('permissionless due payment, duplicate protection, cancellation and deduplication',async()=>{
    await advance(60);const before=await balance(0);await call(2,'executePayment',[accounts[1].address,1n]);assert.equal(await balance(0)-before,25_000_000n)
    await rejects(2,'executePayment',[accounts[1].address,1n]);await call(1,'cancel',[1n]);await advance(60);await rejects(2,'executePayment',[accounts[1].address,1n])
    await call(1,'subscribe',[1n]);assert.equal((await read('getSubscription',[accounts[1].address,1n])).totalPaid,75_000_000n)
    assert.deepEqual(await read('getPlanSubscribers',[1n]),[accounts[1].address]);assert.equal(await read('getPlanSubscriberCount',[1n]),1n)
    assert.equal(await read('getSubscriberPlanCount',[accounts[1].address]),1n)
    assert.deepEqual(await read('getSubscriberPlanIdsPage',[accounts[1].address,0n,1n]),[1n])
    assert.deepEqual(await read('getPlanSubscribersPage',[1n,0n,1n]),[accounts[1].address]);assert.deepEqual(await read('getPlanSubscribersPage',[1n,1n,1n]),[]);await rejects(0,'getPlanSubscribersPage',[1n,0n,101n])
  })
  await t.test('pause blocks collection; failed funds do not advance schedule',async()=>{
    await call(0,'setPlanActive',[1n,false]);await advance(60);await rejects(2,'executePayment',[accounts[1].address,1n]);await call(0,'setPlanActive',[1n,true])
    await write(1,token,tokenArtifact.abi,'approve',[flow,0n]);const prior=await read('getSubscription',[accounts[1].address,1n]);await rejects(2,'executePayment',[accounts[1].address,1n]);assert.deepEqual(await read('getSubscription',[accounts[1].address,1n]),prior)
    await write(1,token,tokenArtifact.abi,'approve',[flow,maxUint256]);await write(1,token,tokenArtifact.abi,'transfer',[accounts[3].address,await balance(1)]);await rejects(2,'executePayment',[accounts[1].address,1n]);assert.deepEqual(await read('getSubscription',[accounts[1].address,1n]),prior)
  })
  await t.test('expiry processes without transferring funds',async()=>{
    await call(0,'createPlan',['Finite','',1n,10,10]);await write(1,token,tokenArtifact.abi,'mint',[accounts[1].address,10n]);await call(1,'subscribe',[2n]);const before=await balance(0);await advance(10);await call(2,'executePayment',[accounts[1].address,2n]);assert.equal(await balance(0),before);assert.equal((await read('getSubscription',[accounts[1].address,2n])).active,false)
  })
  await t.test('false/no-return transfers and reentrant callbacks',async()=>{
    const source=`pragma solidity ^0.8.24; contract EdgeToken { uint public mode; address public target; bool public blocked; function set(uint m,address t) external {mode=m;target=t;} function transferFrom(address,address,uint) external returns(bool) { if(mode==1)return false; if(mode==2)assembly{return(0,0)} if(mode==3){(bool ok,)=target.call(abi.encodeWithSignature("subscribe(uint256)",1));blocked=!ok;} return true; } }`
    const input={language:'Solidity',sources:{'Edge.sol':{content:source}},settings:{evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}
    const output=JSON.parse(solc.compile(JSON.stringify(input))).contracts['Edge.sol'].EdgeToken
    const edgeAbi=output.abi, edge=await deploy({abi:edgeAbi,bytecode:`0x${output.evm.bytecode.object}`}), edgeFlow=await deploy(flowArtifact,[edge])
    const edgeWrite=(name,args)=>write(0,edgeFlow,flowArtifact.abi,name,args)
    await edgeWrite('createPlan',['Edge','',1n,10,0]);await write(0,edge,edgeAbi,'set',[1n,edgeFlow]);await assert.rejects(()=>edgeWrite('subscribe',[1n]))
    await write(0,edge,edgeAbi,'set',[2n,edgeFlow]);await edgeWrite('subscribe',[1n]);await edgeWrite('cancel',[1n]);await write(0,edge,edgeAbi,'set',[3n,edgeFlow]);await edgeWrite('subscribe',[1n]);assert.equal(await client.readContract({address:edge,abi:edgeAbi,functionName:'blocked'}),true)
  })
})
