import 'dotenv/config'
import fs from 'node:fs'
import { encodeAbiParameters } from 'viem'

const apiKey=process.env.BLOCKSCOUT_API_KEY
if(!apiKey){console.error('Set BLOCKSCOUT_API_KEY in .env.');process.exit(1)}
if(!fs.existsSync('deployments/bot-testnet.json')){console.error('Run npm run deploy:testnet first.');process.exit(1)}
const deployment=JSON.parse(fs.readFileSync('deployments/bot-testnet.json','utf8'))
const sourceCode=fs.readFileSync('artifacts/standard-input.json','utf8')
const compilerVersion=fs.readFileSync('artifacts/compiler-version.txt','utf8').trim()
const apiBase=process.env.BLOCKSCOUT_API_URL||'https://scan.bohr.life/api'

async function call(params){
  const body=new URLSearchParams({...params,apikey:apiKey})
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
    if(status.status==='1'||/pass|already verified/i.test(message)){console.log(`${label} verified successfully.`);return}
    if(!/pending|queue/i.test(message))throw new Error(`${label} verification failed: ${message}`)
  }
  throw new Error(`${label} verification timed out; check the explorer manually.`)
}

await verify('MockUSDT',deployment.token.address,'MockUSDT.sol:MockUSDT')
const constructorArgs=encodeAbiParameters([{type:'address'}],[deployment.token.address]).slice(2)
await verify('FlowSub',deployment.flowSub.address,'FlowSub.sol:FlowSub',constructorArgs)
console.log('All BOT Chain testnet contracts are verified.')
