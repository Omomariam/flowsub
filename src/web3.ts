import { createPublicClient, defineChain, http, parseAbi, type Address, type EIP1193Provider } from 'viem'

export const botTestnet = defineChain({
  id: 968,
  name: 'BOT Chain Testnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.bohr.life'] } },
  blockExplorers: { default: { name: 'BOTScan', url: 'https://scan.bohr.life' } },
  testnet: true,
})

export const publicClient = createPublicClient({ chain: botTestnet, transport: http() })
export const flowSubAddress = (import.meta.env.VITE_FLOWSUB_ADDRESS || '') as Address
export const paymentTokenAddress = (import.meta.env.VITE_PAYMENT_TOKEN_ADDRESS || '') as Address
export const deploymentBlock = BigInt(import.meta.env.VITE_DEPLOYMENT_BLOCK || '0')
export const paymentTokenMintable = import.meta.env.VITE_PAYMENT_TOKEN_MINTABLE === 'true'
export const isAddressConfigured = (value: string): value is Address => /^0x[a-fA-F0-9]{40}$/.test(value) && !/^0x0{40}$/.test(value)

export const flowSubAbi = parseAbi([
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
