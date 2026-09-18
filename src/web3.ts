import { createPublicClient, defineChain, http, parseAbi, type Address, type EIP1193Provider } from 'viem'
import networks from './networks.json'

const networkName = import.meta.env.VITE_NETWORK || 'testnet'
if (networkName !== 'mainnet' && networkName !== 'testnet') throw new Error('VITE_NETWORK must be mainnet or testnet')
const network = networks[networkName as keyof typeof networks]
export const explorerUrl = network.explorer
export const botChain = defineChain({
  id: network.id,
  name: network.name,
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_BOTCHAIN_RPC_URL || network.rpc] } },
  blockExplorers: { default: { name: 'BOTScan', url: explorerUrl } },
  testnet: network.testnet,
})

export const publicClient = createPublicClient({ chain: botChain, transport: http() })
export const logRpc = import.meta.env.VITE_BOTCHAIN_LOG_RPC_URL || (network.testnet ? botChain.rpcUrls.default.http[0] : '')
export const logClient = createPublicClient({ chain: botChain, transport: http(logRpc || botChain.rpcUrls.default.http[0]) })
export const flowSubAddress = (import.meta.env.VITE_FLOWSUB_ADDRESS || '') as Address
export const paymentTokenAddress = (import.meta.env.VITE_PAYMENT_TOKEN_ADDRESS || '') as Address
export const deploymentBlock = BigInt(import.meta.env.VITE_DEPLOYMENT_BLOCK || '0')
function positiveInteger(value: string | undefined, fallback: number) {
  const number=Number(value || fallback)
  if(!Number.isSafeInteger(number) || number<1) throw new Error('Invalid indexing configuration')
  return number
}
export const confirmations=positiveInteger(import.meta.env.VITE_CONFIRMATIONS,2)
export const reorgWindow=positiveInteger(import.meta.env.VITE_REORG_WINDOW,20)
export const logBlockRange=positiveInteger(import.meta.env.VITE_LOG_BLOCK_RANGE,500)
export const logMaxRanges=positiveInteger(import.meta.env.VITE_LOG_MAX_RANGES,20)
if(reorgWindow<confirmations) throw new Error('Reorg window must cover the confirmation lag')
if (!network.testnet && import.meta.env.VITE_PAYMENT_TOKEN_MINTABLE === 'true') throw new Error('Mainnet token minting is forbidden')
export const paymentTokenMintable = network.testnet && import.meta.env.VITE_PAYMENT_TOKEN_MINTABLE === 'true'
export const isAddressConfigured = (value: string): value is Address => /^0x[a-fA-F0-9]{40}$/.test(value) && !/^0x0{40}$/.test(value)

export const flowSubAbi = parseAbi([
  'function paymentToken() view returns (address)',
  'function getPlanSubscribersPage(uint256 planId,uint256 offset,uint256 limit) view returns (address[])',
  'function getPlanSubscriberCount(uint256 planId) view returns (uint256)',
  'function getSubscriberPlanCount(address subscriber) view returns (uint256)',
  'function getSubscriberPlanIdsPage(address subscriber,uint256 offset,uint256 limit) view returns (uint256[])',
  'function nextPlanId() view returns (uint256)',
  'function createPlan(string name,string description,uint96 price,uint32 interval,uint32 duration) returns (uint256 planId)',
  'function setPlanActive(uint256 planId,bool active)',
  'function subscribe(uint256 planId)',
  'function executePayment(address subscriber,uint256 planId)',
  'function cancel(uint256 planId)',
  'function getPlan(uint256 planId) view returns ((address merchant,address token,uint96 price,uint32 interval,uint32 duration,bool active,string name,string description))',
  'function getSubscription(address subscriber,uint256 planId) view returns ((uint64 planId,uint64 startedAt,uint64 nextPayment,uint64 expiresAt,uint128 totalPaid,bool active))',
  'function getMerchantPlanIds(address merchant) view returns (uint256[])',
  'function getSubscriberPlanIds(address subscriber) view returns (uint256[])',
  'function getPlanSubscribers(uint256 planId) view returns (address[])',
  'event PlanCreated(uint256 indexed planId,address indexed merchant,address indexed token,uint256 price,uint256 interval,uint256 duration,string name,string description)',
  'event PlanStatusChanged(uint256 indexed planId,bool active)',
  'event Subscribed(uint256 indexed planId,address indexed subscriber,uint256 nextPayment,uint256 expiresAt)',
  'event PaymentExecuted(uint256 indexed planId,address indexed subscriber,address indexed merchant,uint256 amount,uint256 nextPayment)',
  'event SubscriptionCanceled(uint256 indexed planId,address indexed subscriber)',
  'event SubscriptionExpired(uint256 indexed planId,address indexed subscriber)',
])

export async function validateDeployment() {
  if (!isAddressConfigured(flowSubAddress) || !isAddressConfigured(paymentTokenAddress)) throw new Error('Contract addresses are not configured')
  if (!botChain.testnet && (!logRpc || deploymentBlock<=0n)) throw new Error('Mainnet requires a log provider and nonzero deployment block')
  const [id, code, tokenCode, bound] = await Promise.all([
    publicClient.getChainId(), publicClient.getCode({address:flowSubAddress}), publicClient.getCode({address:paymentTokenAddress}),
    publicClient.readContract({address:flowSubAddress,abi:flowSubAbi,functionName:'paymentToken'}),
  ])
  if (id !== botChain.id) throw new Error('RPC is connected to the wrong chain')
  if (!code || code === '0x' || !tokenCode || tokenCode === '0x') throw new Error('Configured contract bytecode is missing')
  if (bound.toLowerCase() !== paymentTokenAddress.toLowerCase()) throw new Error('Payment token binding mismatch')
}

export const erc20Abi = parseAbi([
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function mint(address to,uint256 amount)',
])

export function injectedProvider(): EIP1193Provider | null {
  const ethereum = (window as typeof window & { ethereum?: EIP1193Provider & { providers?: EIP1193Provider[] } }).ethereum
  return ethereum?.providers?.[0] || ethereum || null
}
