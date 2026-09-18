import fs from 'node:fs'
import crypto from 'node:crypto'
import { createWalletClient, http, encodeAbiParameters, encodeDeployData, keccak256 } from 'viem'
import { chain, client, manifestPath, atomicJson, assertDeployment, integer } from './lib/network.mjs'
import { preflight } from './preflight-mainnet.mjs'
if (fs.existsSync(manifestPath)) throw new Error('Mainnet manifest exists; use a reviewed migration for redeployment')
fs.mkdirSync('.runtime', {recursive:true})
const lockPath='.runtime/deploy-mainnet.lock'
const lock=fs.openSync(lockPath,'wx')
fs.writeSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}))
try {
const { account, token, contract } = await preflight({resume:fs.existsSync('deployments/bot-mainnet.pending.json')})
fs.mkdirSync('deployments', { recursive: true })
const journalPath = 'deployments/bot-mainnet.pending.json'
const digest = crypto.createHash('sha256').update(JSON.stringify(contract)).digest('hex')
let journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath)) : null
if (journal && (journal.deployer !== account.address || journal.token !== token.address || journal.artifactHash !== digest)) throw new Error('Pending deployment does not match this release')
const wallet = createWalletClient({ account, chain, transport: http() })
if (!journal) {
  const request = await wallet.prepareTransactionRequest({ account, data: encodeDeployData({ abi: contract.abi, bytecode: contract.bytecode, args: [token.address] }) })
  const serializedTransaction = await wallet.signTransaction(request)
  journal = { chainId: chain.id, deployer: account.address, token: token.address, artifactHash: digest, hash: keccak256(serializedTransaction), serializedTransaction }
  atomicJson(journalPath, journal)
}
try { await client.getTransaction({ hash: journal.hash }) }
catch { await client.sendRawTransaction({ serializedTransaction: journal.serializedTransaction }) }
const receipt = await client.waitForTransactionReceipt({ hash: journal.hash, confirmations: integer('BOTCHAIN_CONFIRMATIONS',2) })
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment reverted; journal retained')
const source = fs.readFileSync('artifacts/standard-input.json', 'utf8')
const deployment = { chainId: chain.id, explorer: chain.blockExplorers.default.url, deployer: account.address, token, flowSub: { address: receipt.contractAddress, transactionHash: receipt.transactionHash, blockNumber: String(receipt.blockNumber) }, compilerVersion: fs.readFileSync('artifacts/compiler-version.txt', 'utf8').trim(), compilerSettings: JSON.parse(source).settings, artifactHash: digest, sourceHash: crypto.createHash('sha256').update(source).digest('hex'), constructorArguments: encodeAbiParameters([{ type: 'address' }], [token.address]), deployedAt: new Date().toISOString() }
await assertDeployment(deployment)
atomicJson(manifestPath, deployment)
console.log(`Deployment confirmed: ${deployment.flowSub.address}. Populate .env.production from deployments/bot-mainnet.json.`)

} finally {fs.closeSync(lock);fs.unlinkSync(lockPath)}
