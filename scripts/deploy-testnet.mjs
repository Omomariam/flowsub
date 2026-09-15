import 'dotenv/config'
import fs from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const key=process.env.PRIVATE_KEY||process.env.DEPLOYER_PRIVATE_KEY
if(!/^0x[0-9a-fA-F]{64}$/.test(key||'')){console.error('Set PRIVATE_KEY in .env to a funded BOT Chain testnet key.');process.exit(1)}
const rpc=process.env.BOTCHAIN_RPC_URL||'https://rpc.bohr.life'
const chain=defineChain({id:968,name:'BOT Chain Testnet',nativeCurrency:{name:'BOT',symbol:'BOT',decimals:18},rpcUrls:{default:{http:[rpc]}},blockExplorers:{default:{name:'BOTScan',url:'https://scan.bohr.life'}},testnet:true})
const account=privateKeyToAccount(key)
const wallet=createWalletClient({account,chain,transport:http(rpc)})
const client=createPublicClient({chain,transport:http(rpc)})
const artifact=name=>JSON.parse(fs.readFileSync(new URL(`../artifacts/${name}.json`,import.meta.url),'utf8'))

async function deploy(name,args=[]){
  const contract=artifact(name)
  console.log(`Deploying ${name} from ${account.address}...`)
  const hash=await wallet.deployContract({abi:contract.abi,bytecode:contract.bytecode,args})
  const receipt=await client.waitForTransactionReceipt({hash,confirmations:2})
  if(receipt.status!=='success')throw new Error(`${name} deployment reverted`)
  console.log(`${name}: ${receipt.contractAddress}`)
  return receipt
}

const token=await deploy('MockUSDT')
const flowSub=await deploy('FlowSub',[token.contractAddress])
fs.mkdirSync('deployments',{recursive:true})
fs.writeFileSync('deployments/bot-testnet.json',JSON.stringify({chainId:968,deployer:account.address,token:{address:token.contractAddress,transactionHash:token.transactionHash,blockNumber:Number(token.blockNumber)},flowSub:{address:flowSub.contractAddress,transactionHash:flowSub.transactionHash,blockNumber:Number(flowSub.blockNumber)}},null,2))
const envPath='.env'
let envText=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8'):''
const setEnv=(name,value)=>{const line=`${name}=${value}`;const pattern=new RegExp(`^${name}=.*$`,'m');envText=pattern.test(envText)?envText.replace(pattern,line):`${envText.trimEnd()}\n${line}\n`}
setEnv('VITE_FLOWSUB_ADDRESS',flowSub.contractAddress)
setEnv('VITE_PAYMENT_TOKEN_ADDRESS',token.contractAddress)
setEnv('VITE_DEPLOYMENT_BLOCK',String(flowSub.blockNumber))
setEnv('VITE_PAYMENT_TOKEN_MINTABLE','true')
setEnv('FLOWSUB_ADDRESS',flowSub.contractAddress)
fs.writeFileSync(envPath,envText)
console.log('\nAdd these values to .env:')
console.log(`VITE_FLOWSUB_ADDRESS=${flowSub.contractAddress}`)
console.log(`VITE_PAYMENT_TOKEN_ADDRESS=${token.contractAddress}`)
console.log(`VITE_DEPLOYMENT_BLOCK=${flowSub.blockNumber}`)
console.log('VITE_PAYMENT_TOKEN_MINTABLE=true')
console.log('Deployment addresses were written to .env and deployments/bot-testnet.json.')
