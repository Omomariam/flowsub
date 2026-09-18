import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWalletClient, custom, formatUnits, parseUnits, type Address, type Hash } from 'viem'
import { mapBounded } from './bounded'
import { paymentEvents } from './paymentEvents'
import { botChain, erc20Abi, flowSubAbi, flowSubAddress, injectedProvider, isAddressConfigured, paymentTokenAddress, paymentTokenMintable, publicClient, validateDeployment } from './web3'

export type ChainPlan = { id: number; name: string; description: string; price: string; interval: string; subscribers: number; color: string; merchant: Address; token: Address; rawPrice: bigint; intervalSeconds: number; duration: number; active: boolean }
export type ChainSubscription = { id: number; planId: number; plan: string; merchant: string; subscriber: Address; price: string; interval: string; due: Date; startedAt: Date; expiresAt?: Date; totalPaid: string; status: 'Active' | 'Canceled' | 'Expired'; color: string }
export type ChainPayment = { logIndex: number; name: string; plan: string; amount: string; date: string; status: 'Confirmed'; hash: Hash; subscriber: Address; merchant: Address; planId: number }
export type ChainCustomer = { address: Address; plan: string; planId: number; since: string; paid: string; status: 'Active' | 'Canceled' | 'Expired' }

const colors = ['#22D3EE', '#A3E635', '#8B5CF6', '#FB7185', '#FBBF24']
const timestampCache = new Map<Hash, Promise<bigint>>()
function blockTimestamp(blockNumber: bigint, blockHash: Hash) {
  if(!timestampCache.has(blockHash)) timestampCache.set(blockHash,publicClient.getBlock({blockHash}).then(b=>b.timestamp).catch(e=>{timestampCache.delete(blockHash);throw e}))
  return timestampCache.get(blockHash)!
}
const intervals: Record<number, string> = { 86400: 'Daily', 604800: 'Weekly', 2592000: 'Monthly', 7776000: 'Quarterly', 31536000: 'Yearly' }
const shortError = (error: unknown) => {
  const candidate = error as { shortMessage?: string; message?: string }
  return candidate.shortMessage || candidate.message?.split('\n')[0] || 'Transaction failed'
}

async function subscriberCount(id: bigint) {
  try { return await publicClient.readContract({address:flowSubAddress,abi:flowSubAbi,functionName:'getPlanSubscriberCount',args:[id]}) }
  catch (e) { if(!botChain.testnet) throw e; return BigInt((await publicClient.readContract({address:flowSubAddress,abi:flowSubAbi,functionName:'getPlanSubscribers',args:[id]})).length) }
}
async function subscriberPage(id: bigint, offset: number) {
  try { return await publicClient.readContract({address:flowSubAddress,abi:flowSubAbi,functionName:'getPlanSubscribersPage',args:[id,BigInt(offset),100n]}) }
  catch (e) { if(!botChain.testnet) throw e; return (await publicClient.readContract({address:flowSubAddress,abi:flowSubAbi,functionName:'getPlanSubscribers',args:[id]})).slice(offset,offset+100) }
}
async function subscriberIds(owner: Address, offset: number) {
  try { return await publicClient.readContract({address:flowSubAddress,abi:flowSubAbi,functionName:'getSubscriberPlanIdsPage',args:[owner,BigInt(offset),100n]}) }
  catch (e) { if(!botChain.testnet) throw e; return (await publicClient.readContract({address:flowSubAddress,abi:flowSubAbi,functionName:'getSubscriberPlanIds',args:[owner]})).slice(offset,offset+100) }
}
async function assertWallet(owner: Address) {
  const provider=injectedProvider()
  if(!provider) throw new Error('Wallet unavailable')
  const [id,accounts]=await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})])
  if(Number(id)!==botChain.id) throw new Error('Wallet network changed; switch to the configured network')
  if((accounts as Address[])[0]?.toLowerCase()!==owner.toLowerCase()) throw new Error('Wallet account changed; reconnect')
}

export function useFlowSub() {
  const [planPage,setPlanPage]=useState(0),[customerPage,setCustomerPage]=useState(0),[subscriptionPage,setSubscriptionPage]=useState(0)
  const [hasMorePlans,setHasMorePlans]=useState(false),[hasMoreCustomers,setHasMoreCustomers]=useState(false),[hasMoreSubscriptions,setHasMoreSubscriptions]=useState(false)
  const [account, setAccount] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [plans, setPlans] = useState<ChainPlan[]>([])
  const [subscriptions, setSubscriptions] = useState<ChainSubscription[]>([])
  const [payments, setPayments] = useState<ChainPayment[]>([])
  const [customers, setCustomers] = useState<ChainCustomer[]>([])
  const [tokenBalance, setTokenBalance] = useState('0')
  const [tokenSymbol, setTokenSymbol] = useState('TOKEN')
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState('')
  const [historyStatus,setHistoryStatus]=useState('Loading confirmed history...')
  const [error, setError] = useState('')
  const loadGeneration=useRef(0)
  const configured = isAddressConfigured(flowSubAddress) && isAddressConfigured(paymentTokenAddress)

  const switchNetwork = useCallback(async () => {
    const provider = injectedProvider()
    if (!provider) throw new Error('No injected EVM wallet found. Install Bitget Wallet, TokenPocket, or another compatible wallet.')
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${botChain.id.toString(16)}` }] }) }
    catch (e) {
      const code = (e as { code?: number }).code
      if (code !== 4902) throw e
      await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: `0x${botChain.id.toString(16)}`, chainName: botChain.name, nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, rpcUrls: [...botChain.rpcUrls.default.http], blockExplorerUrls: [botChain.blockExplorers.default.url] }] })
    }
    const actual = Number(await provider.request({ method: 'eth_chainId' }))
    if (actual !== botChain.id) throw new Error('Wallet did not switch to the required network')
    setChainId(actual)
  }, [])

  const connect = useCallback(async () => {
    setError('')
    const provider = injectedProvider()
    if (!provider) { setError('No injected EVM wallet found. Install Bitget Wallet or TokenPocket.'); return }
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as Address[]
      if (!accounts[0]) throw new Error('Wallet returned no account')
      await switchNetwork()
      setAccount(accounts[0])
    } catch (e) { setError(shortError(e)) }
  }, [switchNetwork])

  const disconnect = useCallback(() => { loadGeneration.current++; setAccount(null); setPlans([]); setSubscriptions([]); setPayments([]); setCustomers([]) }, [])

  useEffect(() => {
    const provider = injectedProvider() as (ReturnType<typeof injectedProvider> & { on?: Function; removeListener?: Function })
    if (!provider) return
    provider.request({ method: 'eth_accounts' }).then((a) => { const list = a as Address[]; if (list[0]) setAccount(list[0]) }).catch(() => {})
    provider.request({ method: 'eth_chainId' }).then((id) => setChainId(Number(id))).catch(() => {})
    const accountsChanged = (a: Address[]) => { loadGeneration.current++; setCustomers([]); setSubscriptions([]); setPayments([]); setPlanPage(0); setCustomerPage(0); setSubscriptionPage(0); setAccount(a[0] || null) }
    const chainChanged = (id: string) => setChainId(Number(id))
    provider.on?.('accountsChanged', accountsChanged); provider.on?.('chainChanged', chainChanged)
    return () => { provider.removeListener?.('accountsChanged', accountsChanged); provider.removeListener?.('chainChanged', chainChanged) }
  }, [])

  const load = useCallback(async () => {
    if (!configured) return
    const generation=++loadGeneration.current
    setLoading(true); setError('')
    try {
      await validateDeployment()
      const [decimals, symbol, nextId] = await Promise.all([
        publicClient.readContract({ address: paymentTokenAddress, abi: erc20Abi, functionName: 'decimals' }),
        publicClient.readContract({ address: paymentTokenAddress, abi: erc20Abi, functionName: 'symbol' }),
        publicClient.readContract({ address: flowSubAddress, abi: flowSubAbi, functionName: 'nextPlanId' }),
      ])
      if(generation !== loadGeneration.current) return
      setTokenDecimals(decimals); setTokenSymbol(symbol)
      setHasMorePlans(Number(nextId)-1 > (planPage+1)*20)
      const ids = Array.from({ length: Math.min(20, Math.max(0, Number(nextId) - 1-planPage*20)) }, (_, i) => BigInt(i + 1+planPage*20))
      const rawPlans = await mapBounded(ids,async id => {
        const [p, subscribers] = await Promise.all([
          publicClient.readContract({ address: flowSubAddress, abi: flowSubAbi, functionName: 'getPlan', args: [id] }),
          subscriberCount(id),
        ])
        return { id, p, subscribers }
      })
      const mappedPlans: ChainPlan[] = rawPlans.map(({ id, p, subscribers }, i) => ({ id:Number(id), merchant:p.merchant, token:p.token, rawPrice:p.price, price:formatUnits(p.price, decimals), interval:intervals[p.interval] || `${Math.round(p.interval / 86400)} days`, intervalSeconds:p.interval, duration:p.duration, active:p.active, name:p.name, description:p.description, subscribers:Number(subscribers), color:colors[i % colors.length] }))
      if(generation !== loadGeneration.current) return
      setPlans(mappedPlans)
      if (account) {
        const [subIds, balance] = await Promise.all([
          subscriberIds(account,subscriptionPage*100),
          publicClient.readContract({ address: paymentTokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
        ])
        setTokenBalance(formatUnits(balance, decimals))
        setHasMoreSubscriptions(subIds.length === 100)
        const subRows = await mapBounded(subIds,async id => ({ id, sub: await publicClient.readContract({ address: flowSubAddress, abi: flowSubAbi, functionName: 'getSubscription', args: [account, id] }), p: await publicClient.readContract({address:flowSubAddress,abi:flowSubAbi,functionName:'getPlan',args:[id]}) }))
        if(generation !== loadGeneration.current) return
        setSubscriptions(subRows.map(({ id, sub, p }) => { const presentation = mappedPlans.find(x => x.id === Number(id)); return { id:Number(id), planId:Number(id), plan:p?.name || `Plan #${id}`, merchant:p?.merchant || '0x', subscriber:account, price:formatUnits(p.price,decimals), interval:presentation?.interval.toLowerCase() || `${p.interval}s`, due:new Date(Number(sub.nextPayment)*1000), startedAt:new Date(Number(sub.startedAt)*1000), expiresAt:sub.expiresAt ? new Date(Number(sub.expiresAt)*1000) : undefined, totalPaid:formatUnits(sub.totalPaid, decimals), status:sub.expiresAt && Number(sub.expiresAt)*1000 <= Date.now() ? 'Expired' : sub.active ? 'Active' : 'Canceled', color:presentation?.color || colors[0] } }))

        const owned = mappedPlans.filter(p => p.merchant.toLowerCase() === account.toLowerCase())
        setHasMoreCustomers(owned.some(p=>p.subscribers>(customerPage+1)*100))
        const customerRows = (await mapBounded(owned,async p => {
          const addresses = await subscriberPage(BigInt(p.id),customerPage*100)
          return mapBounded(addresses,async address => ({ address, plan:p, sub:await publicClient.readContract({ address:flowSubAddress, abi:flowSubAbi, functionName:'getSubscription', args:[address,BigInt(p.id)] }) }))
        })).flat()
        if(generation !== loadGeneration.current) return
        setCustomers(customerRows.map(({address,plan,sub}) => ({ address, plan:plan.name, planId:plan.id, since:new Date(Number(sub.startedAt)*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}), paid:formatUnits(sub.totalPaid,decimals), status:sub.expiresAt && Number(sub.expiresAt)*1000<=Date.now() ? 'Expired' : sub.active?'Active':'Canceled' })))
      }
      try {
        const sync = await paymentEvents()
        const logs=sync.logs
        setHistoryStatus(sync.complete ? `Confirmed history indexed through block ${sync.syncedThrough}` : `History backfill in progress: ${sync.syncedThrough} / ${sync.confirmedHead}`)
        const relevant=logs.filter(l => !account || l.args.merchant?.toLowerCase() === account.toLowerCase() || l.args.subscriber?.toLowerCase() === account.toLowerCase())
        const mappedPayments=await mapBounded(relevant,async l => { const p=mappedPlans.find(x=>x.id===Number(l.args.planId));const timestamp=await blockTimestamp(l.blockNumber,l.blockHash);return { name:l.args.merchant || '0x' as Address, plan:p?.name || `Plan #${l.args.planId}`, amount:formatUnits(l.args.amount || 0n,decimals), date:new Date(Number(timestamp)*1000).toLocaleString(), status:'Confirmed' as const, hash:l.transactionHash, logIndex:l.logIndex, subscriber:l.args.subscriber!, merchant:l.args.merchant!, planId:Number(l.args.planId) } })
        if(generation !== loadGeneration.current) return
        setPayments(mappedPayments)
      } catch (e) { if(generation === loadGeneration.current) setError(`Payment history unavailable: ${shortError(e)}`) }
    } catch (e) { if(generation === loadGeneration.current) setError(shortError(e)) } finally { if(generation === loadGeneration.current) setLoading(false) }
  }, [account, configured,planPage,customerPage,subscriptionPage])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!configured) return
    const timer = setInterval(() => load(), 15_000)
    return () => clearInterval(timer)
  }, [configured, load])

  const transact = useCallback(async (label:string, fn:(wallet:ReturnType<typeof createWalletClient>, account:Address)=>Promise<Hash>) => {
    if (!account) throw new Error('Connect your wallet first')
    const provider=injectedProvider(); if(!provider) throw new Error('Wallet unavailable')
    setPending(label); setError('')
    try { if(Number(await provider.request({method:'eth_chainId'})) !== botChain.id) await switchNetwork(); await validateDeployment(); const actualAccounts = await provider.request({ method:'eth_accounts' }) as Address[]; if(actualAccounts[0]?.toLowerCase() !== account.toLowerCase()) throw new Error('Wallet account changed; reconnect'); if(Number(await provider.request({method:'eth_chainId'})) !== botChain.id) throw new Error('Wrong wallet network'); const wallet=createWalletClient({ account, chain:botChain, transport:custom(provider) }); const hash=await fn(wallet,account); const receipt=await publicClient.waitForTransactionReceipt({hash}); if(receipt.status !== 'success') throw new Error('Transaction reverted'); await load(); return hash }
    catch(e){ const message=shortError(e); setError(message); throw new Error(message) } finally { setPending('') }
  },[account,chainId,load,switchNetwork])

  const createPlan = useCallback((input:{name:string;description:string;price:string;interval:number;duration:number}) => transact('Creating plan…', async(wallet,owner) => {
    if (!Number.isInteger(input.duration) || input.duration < 0 || input.duration > 4294967295) throw new Error('Expiry must be a whole number of seconds within the supported range.')
    if (input.duration !== 0 && input.duration < input.interval) throw new Error(`Expiry must be 0 (no expiry) or at least ${Math.ceil(input.interval / 86400)} days for the selected billing interval.`)
    if(tokenDecimals === null) throw new Error('Token metadata is not ready'); const value=parseUnits(input.price,tokenDecimals); if(value <= 0n || value >= 2n**96n) throw new Error('Price is outside the supported range'); const {request}=await publicClient.simulateContract({address:flowSubAddress,abi:flowSubAbi,functionName:'createPlan',args:[input.name,input.description,value,input.interval,input.duration],account:owner}); await assertWallet(owner);return wallet.writeContract(request)
  }),[tokenDecimals,transact])

  const setAllowance = async (wallet: ReturnType<typeof createWalletClient>, owner: Address, amount: bigint) => {
    const current = await publicClient.readContract({ address:paymentTokenAddress, abi:erc20Abi, functionName:'allowance', args:[owner,flowSubAddress] })
    const approve = async (value: bigint) => {
      const {request, result} = await publicClient.simulateContract({address:paymentTokenAddress,abi:erc20Abi,functionName:'approve',args:[flowSubAddress,value],account:owner})
      if(result === false) throw new Error('Token rejected approval')
      await assertWallet(owner)
      const hash = await wallet.writeContract(request)
      const receipt = await publicClient.waitForTransactionReceipt({hash})
      if(receipt.status !== 'success') throw new Error('Token approval reverted')
    }
    if(current !== 0n && amount !== 0n) await approve(0n)
    await approve(amount)
    const confirmed = await publicClient.readContract({address:paymentTokenAddress,abi:erc20Abi,functionName:'allowance',args:[owner,flowSubAddress]})
    if(confirmed !== amount) throw new Error('Token allowance does not match requested approval')
  }
  const subscribe = useCallback((plan:ChainPlan, payments = 12) => transact('Checking token approval...', async(wallet,owner) => {
    if(!Number.isSafeInteger(payments) || payments < 1 || payments > 120) throw new Error('Choose between 1 and 120 authorized payments')
    const allowance=await publicClient.readContract({address:plan.token,abi:erc20Abi,functionName:'allowance',args:[owner,flowSubAddress]})
    if(allowance !== plan.rawPrice * BigInt(payments)) await setAllowance(wallet,owner,plan.rawPrice * BigInt(payments))
    const {request}=await publicClient.simulateContract({address:flowSubAddress,abi:flowSubAbi,functionName:'subscribe',args:[BigInt(plan.id)],account:owner}); await assertWallet(owner);return wallet.writeContract(request)
  }),[transact])

  const cancel = useCallback((planId:number) => transact('Canceling subscription…',async(wallet,owner)=>{const {request}=await publicClient.simulateContract({address:flowSubAddress,abi:flowSubAbi,functionName:'cancel',args:[BigInt(planId)],account:owner});await assertWallet(owner);return wallet.writeContract(request)}),[transact])
  const setPlanActive = useCallback((planId:number,active:boolean) => transact(active?'Reactivating plan…':'Pausing plan…',async(wallet,owner)=>{const {request}=await publicClient.simulateContract({address:flowSubAddress,abi:flowSubAbi,functionName:'setPlanActive',args:[BigInt(planId),active],account:owner});await assertWallet(owner);return wallet.writeContract(request)}),[transact])
  const executePayment = useCallback((subscriber:Address,planId:number) => transact('Executing due payment…',async(wallet,owner)=>{const {request}=await publicClient.simulateContract({address:flowSubAddress,abi:flowSubAbi,functionName:'executePayment',args:[subscriber,BigInt(planId)],account:owner});await assertWallet(owner);return wallet.writeContract(request)}),[transact])
  const approveToken = useCallback(() => transact('Revoking token allowance...',async(wallet,owner)=>{const {request,result}=await publicClient.simulateContract({address:paymentTokenAddress,abi:erc20Abi,functionName:'approve',args:[flowSubAddress,0n],account:owner});if(result === false) throw new Error('Token rejected approval');await assertWallet(owner);return wallet.writeContract(request)}),[transact])
  const mintTestTokens = useCallback(() => transact('Minting test tokens...',async(wallet,owner)=>{if(!botChain.testnet || !paymentTokenMintable) throw new Error('Token minting is disabled'); if(tokenDecimals === null) throw new Error('Token metadata unavailable');const {request}=await publicClient.simulateContract({address:paymentTokenAddress,abi:erc20Abi,functionName:'mint',args:[owner,parseUnits('1000',tokenDecimals)],account:owner});await assertWallet(owner);return wallet.writeContract(request)}),[tokenDecimals,transact])

  return useMemo(()=>({planPage,setPlanPage,customerPage,setCustomerPage,subscriptionPage,setSubscriptionPage,hasMorePlans,hasMoreCustomers,hasMoreSubscriptions,account,chainId,connected:!!account,configured,metadataReady:tokenDecimals !== null,plans,subscriptions,payments,customers,tokenBalance,tokenSymbol,tokenMintable:paymentTokenMintable,loading,pending,error,historyStatus,connect,disconnect,switchNetwork,refresh:load,createPlan,subscribe,cancel,setPlanActive,executePayment,approveToken,mintTestTokens}),[planPage,customerPage,subscriptionPage,hasMorePlans,hasMoreCustomers,hasMoreSubscriptions,account,chainId,configured,tokenDecimals,plans,subscriptions,payments,customers,tokenBalance,tokenSymbol,loading,pending,error,historyStatus,connect,disconnect,switchNetwork,load,createPlan,subscribe,cancel,setPlanActive,executePayment,approveToken,mintTestTokens])
}
