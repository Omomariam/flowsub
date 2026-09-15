import 'dotenv/config'
import fs from 'node:fs'
import { createPublicClient, defineChain, http } from 'viem'

const deployment=JSON.parse(fs.readFileSync('deployments/bot-testnet.json','utf8'))
const {abi}=JSON.parse(fs.readFileSync('artifacts/FlowSub.json','utf8'))
const rpc=process.env.BOTCHAIN_RPC_URL||'https://rpc.bohr.life'
const chain=defineChain({id:968,name:'BOT Chain Testnet',nativeCurrency:{name:'BOT',symbol:'BOT',decimals:18},rpcUrls:{default:{http:[rpc]}},testnet:true})
const client=createPublicClient({chain,transport:http(rpc)})
const [tokenCode,flowSubCode,boundToken]=await Promise.all([
  client.getCode({address:deployment.token.address}),
  client.getCode({address:deployment.flowSub.address}),
  client.readContract({address:deployment.flowSub.address,abi,functionName:'paymentToken'}),
])
if(!tokenCode||tokenCode==='0x')throw new Error('MockUSDT bytecode is missing')
if(!flowSubCode||flowSubCode==='0x')throw new Error('FlowSub bytecode is missing')
if(boundToken.toLowerCase()!==deployment.token.address.toLowerCase())throw new Error('FlowSub is bound to the wrong token')
console.log(`Deployment check passed on chain ${await client.getChainId()}. FlowSub is bound to ${boundToken}.`)
