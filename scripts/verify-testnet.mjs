import { manifestPath, networkName, network, assertDeployment } from './lib/network.mjs'
import fs from 'node:fs'
import { encodeAbiParameters } from 'viem'

const apiKey=process.env.BLOCKSCOUT_API_KEY

if(!fs.existsSync(manifestPath)){console.error(`Missing ${manifestPath}; deploy the selected network first.`);process.exit(1)}
const deployment=JSON.parse(fs.readFileSync(manifestPath,'utf8'))
const sourceCode=fs.readFileSync('artifacts/standard-input.json','utf8')
const compilerVersion=fs.readFileSync('artifacts/compiler-version.txt','utf8').trim()
if(deployment.sourceHash){const crypto=await import('node:crypto');if(crypto.createHash('sha256').update(sourceCode).digest('hex')!==deployment.sourceHash || compilerVersion!==deployment.compilerVersion) throw new Error('Verification artifacts do not match deployment')}
await assertDeployment(deployment)
const apiBase=process.env.BLOCKSCOUT_API_URL || `${network.explorer}/api`

async function call(params){
  const body=new URLSearchParams({...params,...(apiKey?{apikey:apiKey}:{})})
  const response=await fetch(apiBase,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body})
  const text=await response.text()
  try{return JSON.parse(text)}catch{throw new Error(`Blockscout returned HTTP ${response.status}: ${text.slice(0,240)}`)}
}

async function verify(label,address,contractName,constructorArgs=''){
  console.log(`Submitting ${label} (${address}) for verification...`)
  const submitted=await call({module:'contract',action:'verifysourcecode',contractaddress:address,sourceCode,codeformat:'solidity-standard-json-input',contractname:contractName,compilerversion:compilerVersion,optimizationUsed:'1',runs:'200',constructorArguements:constructorArgs})
  if(submitted.status!=='1'){
    const message=String(submitted.result||submitted.message)
    if(/already verified/i.test(message)){console.log(`${label} is already verified.`);return}
    throw new Error(`${label} verification submission failed: ${message}`)
  }
  const guid=submitted.result
  for(let attempt=0;attempt<20;attempt++){
    await new Promise(resolve=>setTimeout(resolve,3000))
    const status=await call({module:'contract',action:'checkverifystatus',guid})
    const message=String(status.result||status.message)
    if(/pass|already verified/i.test(message)){console.log(`${label} verified successfully.`);return}
    if(!/pending|queue/i.test(message))throw new Error(`${label} verification failed: ${message}`)
  }
  throw new Error(`${label} verification timed out; check the explorer manually.`)
}

if(networkName === 'testnet') await verify('MockUSDT',deployment.token.address,'MockUSDT.sol:MockUSDT')
const constructorArgs=encodeAbiParameters([{type:'address'}],[deployment.token.address]).slice(2)
await verify('FlowSub',deployment.flowSub.address,'FlowSub.sol:FlowSub',constructorArgs)
console.log('FlowSub verification completed for the selected network.')
