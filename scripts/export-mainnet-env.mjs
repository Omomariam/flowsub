import fs from 'node:fs'
import { networkName, manifestPath, assertDeployment } from './lib/network.mjs'
if(networkName !== 'mainnet') throw new Error('This export is mainnet-only')
const deployment=JSON.parse(fs.readFileSync(manifestPath,'utf8'))
await assertDeployment(deployment)
const logRpc=process.env.PUBLIC_LOG_RPC_URL
if(!logRpc) throw new Error('PUBLIC_LOG_RPC_URL must be a browser-safe RPC or proxy URL; server credentials must never be exported')
const url=new URL(logRpc)
if(url.username || url.password || !['https:','http:'].includes(url.protocol)) throw new Error('Invalid public RPC URL')
const output=process.env.PUBLIC_ENV_OUTPUT || '.env.production'
const values={VITE_NETWORK:'mainnet',VITE_BOTCHAIN_RPC_URL:'https://rpc.botchain.ai',VITE_BOTCHAIN_LOG_RPC_URL:logRpc,VITE_FLOWSUB_ADDRESS:deployment.flowSub.address,VITE_PAYMENT_TOKEN_ADDRESS:deployment.token.address,VITE_DEPLOYMENT_BLOCK:String(deployment.flowSub.blockNumber),VITE_PAYMENT_TOKEN_MINTABLE:'false'}
fs.writeFileSync(output,Object.entries(values).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n',{flag:'wx'})
console.log(`Public mainnet settings written to ${output}; existing files are never overwritten.`)
