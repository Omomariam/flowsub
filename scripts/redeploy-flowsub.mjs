import { networkName, assertChain } from './lib/network.mjs'
if(networkName !== 'testnet') throw new Error('This command is testnet-only')
await assertChain()
import fs from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const key=process.env.PRIVATE_KEY||process.env.DEPLOYER_PRIVATE_KEY
const tokenAddress=process.env.VITE_PAYMENT_TOKEN_ADDRESS
if(!/^0x[0-9a-fA-F]{64}$/.test(key||'')){console.error('Set PRIVATE_KEY in .env.');process.exit(1)}
if(!/^0x[0-9a-fA-F]{40}$/.test(tokenAddress||'')){console.error('VITE_PAYMENT_TOKEN_ADDRESS is missing.');process.exit(1)}
const rpc=process.env.BOTCHAIN_RPC_URL||'https://rpc.bohr.life'
const chain=defineChain({id:968,name:'BOT Chain Testnet',nativeCurrency:{name:'BOT',symbol:'BOT',decimals:18},rpcUrls:{default:{http:[rpc]}},blockExplorers:{default:{name:'BOTScan',url:'https://scan.bohr.life'}},testnet:true})
const account=privateKeyToAccount(key),wallet=createWalletClient({account,chain,transport:http(rpc)}),client=createPublicClient({chain,transport:http(rpc)})
const artifact=JSON.parse(fs.readFileSync('artifacts/FlowSub.json','utf8'))
console.log(`Deploying replacement FlowSub from ${account.address}...`)
const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,args:[tokenAddress]})
const receipt=await client.waitForTransactionReceipt({hash,confirmations:2})
if(receipt.status!=='success'||!receipt.contractAddress)throw new Error('FlowSub deployment reverted')
const deployment=fs.existsSync('deployments/bot-testnet.json')?JSON.parse(fs.readFileSync('deployments/bot-testnet.json','utf8')):{chainId:968,deployer:account.address,token:{address:tokenAddress}}
deployment.flowSub={address:receipt.contractAddress,transactionHash:receipt.transactionHash,blockNumber:Number(receipt.blockNumber)}
fs.writeFileSync('deployments/bot-testnet.json',JSON.stringify(deployment,null,2))
let envText=fs.readFileSync('.env','utf8')
const setEnv=(name,value)=>{const line=`${name}=${value}`;const pattern=new RegExp(`^${name}=.*$`,'m');envText=pattern.test(envText)?envText.replace(pattern,line):`${envText.trimEnd()}\n${line}\n`}
setEnv('VITE_FLOWSUB_ADDRESS',receipt.contractAddress)
setEnv('VITE_DEPLOYMENT_BLOCK',String(receipt.blockNumber))
setEnv('FLOWSUB_ADDRESS',receipt.contractAddress)
fs.writeFileSync('.env',envText)
console.log(`FlowSub: ${receipt.contractAddress}`)
console.log(`Deployment block: ${receipt.blockNumber}`)
console.log('Updated .env and deployments/bot-testnet.json.')
