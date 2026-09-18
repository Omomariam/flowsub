import fs from 'node:fs'
import { config } from 'dotenv'
import { createPublicClient, defineChain, http, getAddress, parseAbi } from 'viem'

// Mainnet never inherits the existing testnet .env implicitly.
config({ path: process.env.BOTCHAIN_ENV_FILE || (process.env.BOTCHAIN_NETWORK === 'mainnet' ? '.env.mainnet' : '.env'), quiet: true })
export const networks = JSON.parse(fs.readFileSync(new URL('../../src/networks.json', import.meta.url)))
export const networkName = process.env.BOTCHAIN_NETWORK || 'testnet'
if (!Object.hasOwn(networks, networkName)) throw new Error('BOTCHAIN_NETWORK must be mainnet or testnet')
export const network = networks[networkName]
export const rpc = process.env.BOTCHAIN_RPC_URL || network.rpc
export const chain = defineChain({ ...network, nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, rpcUrls: { default: { http: [rpc] } }, blockExplorers: { default: { name: 'BOTScan', url: network.explorer } } })
export const client = createPublicClient({ chain, transport: http(rpc, { timeout: 20_000 }) })
export const manifestPath = `deployments/bot-${networkName}.json`
export const artifact = () => JSON.parse(fs.readFileSync('artifacts/FlowSub.json', 'utf8'))
export const tokenAbi = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)'])
export function address(value, label) {
  if (!value || /^0x0{40}$/i.test(value)) throw new Error(`${label} must be a nonzero address`)
  return getAddress(value)
}
export async function assertChain(target = client) {
  const id = await target.getChainId()
  if (id !== network.id) throw new Error(`Wrong RPC chain: expected ${network.id}, received ${id}`)
}
export async function tokenInfo(token) {
  if (!await client.getCode({ address: token }) || await client.getCode({ address: token }) === '0x') throw new Error('Payment token has no bytecode')
  const [symbol, decimals] = await Promise.all(['symbol', 'decimals'].map(functionName => client.readContract({ address: token, abi: tokenAbi, functionName })))
  return { address: token, symbol, decimals }
}
export async function assertDeployment(deployment) {
  await assertChain()
  if (deployment.chainId !== network.id) throw new Error('Manifest network mismatch')
  const flow = address(deployment.flowSub.address, 'FlowSub')
  const token = address(deployment.token.address, 'Token')
  if (!await client.getCode({ address: flow }) || await client.getCode({ address: flow }) === '0x') throw new Error('FlowSub bytecode missing')
  const bound = await client.readContract({ address: flow, abi: artifact().abi, functionName: 'paymentToken' })
  if (bound.toLowerCase() !== token.toLowerCase()) throw new Error('Payment token binding mismatch')
  await tokenInfo(token)
}
export function atomicJson(path, value) {
  fs.writeFileSync(`${path}.tmp`, JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2))
  fs.renameSync(`${path}.tmp`, path)
}
export function integer(name, fallback, min = 1) {
  const value = Number(process.env[name] || fallback)
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${name} must be an integer >= ${min}`)
  return value
}
