import { useCallback, useEffect, useMemo, useState } from 'react'
import { createWalletClient, custom, formatUnits, maxUint256, parseUnits, type Address, type Hash } from 'viem'
import { botTestnet, deploymentBlock, erc20Abi, flowSubAbi, flowSubAddress, injectedProvider, isAddressConfigured, paymentTokenAddress, paymentTokenMintable, publicClient } from './web3'

export type ChainPlan = { id: number; name: string; description: string; price: number; interval: string; subscribers: number; color: string; merchant: Address; token: Address; rawPrice: bigint; intervalSeconds: number; duration: number; active: boolean }
export type ChainSubscription = { id: number; planId: number; plan: string; merchant: string; subscriber: Address; price: number; interval: string; due: Date; startedAt: Date; expiresAt?: Date; totalPaid: number; status: 'Active' | 'Canceled'; color: string }
export type ChainPayment = { name: string; plan: string; amount: number; date: string; status: 'Confirmed'; hash: Hash; subscriber: Address; merchant: Address; planId: number }
export type ChainCustomer = { address: Address; plan: string; planId: number; since: string; paid: number; status: 'Active' | 'Canceled' }

const colors = ['#22D3EE', '#A3E635', '#8B5CF6', '#FB7185', '#FBBF24']
const intervals: Record<number, string> = { 86400: 'Daily', 604800: 'Weekly', 2592000: 'Monthly', 7776000: 'Quarterly', 31536000: 'Yearly' }
const shortError = (error: unknown) => {
  const candidate = error as { shortMessage?: string; message?: string }
  return candidate.shortMessage || candidate.message?.split('\n')[0] || 'Transaction failed'
}

export function useFlowSub() {
  const [account, setAccount] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [plans, setPlans] = useState<ChainPlan[]>([])
  const [subscriptions, setSubscriptions] = useState<ChainSubscription[]>([])
  const [payments, setPayments] = useState<ChainPayment[]>([])
  const [customers, setCustomers] = useState<ChainCustomer[]>([])
  const [tokenBalance, setTokenBalance] = useState(0)
  const [tokenSymbol, setTokenSymbol] = useState('TOKEN')
  const [tokenDecimals, setTokenDecimals] = useState(6)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const configured = isAddressConfigured(flowSubAddress) && isAddressConfigured(paymentTokenAddress)

  const switchNetwork = useCallback(async () => {
    const provider = injectedProvider()
    if (!provider) throw new Error('No injected EVM wallet found. Install Bitget Wallet, TokenPocket, or another compatible wallet.')
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x3c8' }] }) }
    catch (e) {
      const code = (e as { code?: number }).code
      if (code !== 4902) throw e
      await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x3c8', chainName: 'BOT Chain Testnet', nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, rpcUrls: ['https://rpc.bohr.life'], blockExplorerUrls: ['https://scan.bohr.life'] }] })
    }
    setChainId(968)
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

  const disconnect = useCallback(() => { setAccount(null); setPlans([]); setSubscriptions([]); setPayments([]); setCustomers([]) }, [])

  useEffect(() => {
    const provider = injectedProvider() as (ReturnType<typeof injectedProvider> & { on?: Function; removeListener?: Function })
    if (!provider) return
    provider.request({ method: 'eth_accounts' }).then((a) => { const list = a as Address[]; if (list[0]) setAccount(list[0]) }).catch(() => {})
    provider.request({ method: 'eth_chainId' }).then((id) => setChainId(Number(id))).catch(() => {})
    const accountsChanged = (a: Address[]) => setAccount(a[0] || null)
    const chainChanged = (id: string) => setChainId(Number(id))
    provider.on?.('accountsChanged', accountsChanged); provider.on?.('chainChanged', chainChanged)
    return () => { provider.removeListener?.('accountsChanged', accountsChanged); provider.removeListener?.('chainChanged', chainChanged) }
  }, [])

  const load = useCallback(async () => {
    if (!configured) return
    setLoading(true); setError('')
    try {
      const [decimals, symbol, nextId] = await Promise.all([
        publicClient.readContract({ address: paymentTokenAddress, abi: erc20Abi, functionName: 'decimals' }),
        publicClient.readContract({ address: paymentTokenAddress, abi: erc20Abi, functionName: 'symbol' }),
        publicClient.readContract({ address: flowSubAddress, abi: flowSubAbi, functionName: 'nextPlanId' }),
      ])
      setTokenDecimals(decimals); setTokenSymbol(symbol)
      const ids = Array.from({ length: Math.max(0, Number(nextId) - 1) }, (_, i) => BigInt(i + 1))
      const rawPlans = await Promise.all(ids.map(async id => {
        const [p, subscribers] = await Promise.all([
          publicClient.readContract({ address: flowSubAddress, abi: flowSubAbi, functionName: 'getPlan', args: [id] }),
          publicClient.readContract({ address: flowSubAddress, abi: flowSubAbi, functionName: 'getPlanSubscribers', args: [id] }),
        ])
        return { id, p, subscribers }
      }))
      const mappedPlans: ChainPlan[] = rawPlans.map(({ id, p, subscribers }, i) => ({ id:Number(id), merchant:p.merchant, token:p.token, rawPrice:p.price, price:Number(formatUnits(p.price, decimals)), interval:intervals[p.interval] || `${Math.round(p.interval / 86400)} days`, intervalSeconds:p.interval, duration:p.duration, active:p.active, name:p.name, description:p.description, subscribers:subscribers.length, color:colors[i % colors.length] }))
      setPlans(mappedPlans)
      if (account) {
        const [subIds, balance] = await Promise.all([
          publicClient.readContract({ address: flowSubAddress, abi: flowSubAbi, functionName: 'getSubscriberPlanIds', args: [account] }),
          publicClient.readContract({ address: paymentTokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
        ])
        setTokenBalance(Number(formatUnits(balance, decimals)))
        const subRows = await Promise.all(subIds.map(async id => ({ id, sub: await publicClient.readContract({ address: flowSubAddress, abi: flowSubAbi, functionName: 'getSubscription', args: [account, id] }) })))
        setSubscriptions(subRows.map(({ id, sub }) => { const p = mappedPlans.find(x => x.id === Number(id))!; return { id:Number(id), planId:Number(id), plan:p?.name || `Plan #${id}`, merchant:p?.merchant || '0x', subscriber:account, price:p?.price || 0, interval:p?.interval.toLowerCase() || '', due:new Date(Number(sub.nextPayment)*1000), startedAt:new Date(Number(sub.startedAt)*1000), expiresAt:sub.expiresAt ? new Date(Number(sub.expiresAt)*1000) : undefined, totalPaid:Number(formatUnits(sub.totalPaid, decimals)), status:sub.active ? 'Active' : 'Canceled', color:p?.color || colors[0] } }))

        const owned = mappedPlans.filter(p => p.merchant.toLowerCase() === account.toLowerCase())
        const customerRows = (await Promise.all(owned.map(async p => {
          const addresses = await publicClient.readContract({ address: flowSubAddress, abi: flowSubAbi, functionName: 'getPlanSubscribers', args: [BigInt(p.id)] })
          return Promise.all(addresses.map(async address => ({ address, plan:p, sub:await publicClient.readContract({ address:flowSubAddress, abi:flowSubAbi, functionName:'getSubscription', args:[address,BigInt(p.id)] }) })))
        }))).flat()
        setCustomers(customerRows.map(({address,plan,sub}) => ({ address, plan:plan.name, planId:plan.id, since:new Date(Number(sub.startedAt)*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}), paid:Number(formatUnits(sub.totalPaid,decimals)), status:sub.active?'Active':'Canceled' })))
      }
      try {
        const logs = await publicClient.getContractEvents({ address:flowSubAddress, abi:flowSubAbi, eventName:'PaymentExecuted', fromBlock:deploymentBlock, toBlock:'latest' })
        const relevant=logs.filter(l => !account || l.args.merchant?.toLowerCase() === account.toLowerCase() || l.args.subscriber?.toLowerCase() === account.toLowerCase())
        const mappedPayments=await Promise.all(relevant.map(async l => { const p=mappedPlans.find(x=>x.id===Number(l.args.planId));const block=await publicClient.getBlock({blockNumber:l.blockNumber});return { name:l.args.merchant || '0x' as Address, plan:p?.name || `Plan #${l.args.planId}`, amount:Number(formatUnits(l.args.amount || 0n,decimals)), date:new Date(Number(block.timestamp)*1000).toLocaleString(), status:'Confirmed' as const, hash:l.transactionHash, subscriber:l.args.subscriber!, merchant:l.args.merchant!, planId:Number(l.args.planId) } }))
        setPayments(mappedPayments)
      } catch { setPayments([]) }
    } catch (e) { setError(shortError(e)) } finally { setLoading(false) }
  }, [account, configured])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!configured) return
    return publicClient.watchContractEvent({ address:flowSubAddress, abi:flowSubAbi, pollingInterval:8_000, onLogs:() => load() })
  }, [configured, load])

  const transact = useCallback(async (label:string, fn:(wallet:ReturnType<typeof createWalletClient>, account:Address)=>Promise<Hash>) => {
    if (!account) throw new Error('Connect your wallet first')
    if (chainId !== 968) await switchNetwork()
    const provider=injectedProvider(); if(!provider) throw new Error('Wallet unavailable')
    setPending(label); setError('')
    try { const wallet=createWalletClient({ account, chain:botTestnet, transport:custom(provider) }); const hash=await fn(wallet,account); await publicClient.waitForTransactionReceipt({hash}); await load(); return hash }
    catch(e){ const message=shortError(e); setError(message); throw new Error(message) } finally { setPending('') }
  },[account,chainId,load,switchNetwork])

  const createPlan = useCallback((input:{name:string;description:string;price:string;interval:number;duration:number}) => transact('Creating plan…', async(wallet,owner) => {
    const value=parseUnits(input.price,tokenDecimals); const {request}=await publicClient.simulateContract({address:flowSubAddress,abi:flowSubAbi,functionName:'createPlan',args:[input.name,input.description,value,input.interval,input.duration],account:owner}); return wallet.writeContract(request)
  }),[tokenDecimals,transact])

  const subscribe = useCallback((plan:ChainPlan) => transact('Checking token approval…', async(wallet,owner) => {
    const allowance=await publicClient.readContract({address:plan.token,abi:erc20Abi,functionName:'allowance',args:[owner,flowSubAddress]})
    if(allowance<plan.rawPrice){ setPending('Approve recurring token access…'); const {request}=await publicClient.simulateContract({address:plan.token,abi:erc20Abi,functionName:'approve',args:[flowSubAddress,maxUint256],account:owner}); const approval=await wallet.writeContract(request); await publicClient.waitForTransactionReceipt({hash:approval}) }
    setPending('Confirm subscription…'); const {request}=await publicClient.simulateContract({address:flowSubAddress,abi:flowSubAbi,functionName:'subscribe',args:[BigInt(plan.id)],account:owner}); return wallet.writeContract(request)
  }),[transact])

  const cancel = useCallback((planId:number) => transact('Canceling subscription…',async(wallet,owner)=>{const {request}=await publicClient.simulateContract({address:flowSubAddress,abi:flowSubAbi,functionName:'cancel',args:[BigInt(planId)],account:owner});return wallet.writeContract(request)}),[transact])
  const setPlanActive = useCallback((planId:number,active:boolean) => transact(active?'Reactivating plan…':'Pausing plan…',async(wallet,owner)=>{const {request}=await publicClient.simulateContract({address:flowSubAddress,abi:flowSubAbi,functionName:'setPlanActive',args:[BigInt(planId),active],account:owner});return wallet.writeContract(request)}),[transact])
  const executePayment = useCallback((subscriber:Address,planId:number) => transact('Executing due payment…',async(wallet,owner)=>{const {request}=await publicClient.simulateContract({address:flowSubAddress,abi:flowSubAbi,functionName:'executePayment',args:[subscriber,BigInt(planId)],account:owner});return wallet.writeContract(request)}),[transact])
  const approveToken = useCallback(() => transact('Updating token allowance…',async(wallet,owner)=>{const {request}=await publicClient.simulateContract({address:paymentTokenAddress,abi:erc20Abi,functionName:'approve',args:[flowSubAddress,maxUint256],account:owner});return wallet.writeContract(request)}),[transact])
  const mintTestTokens = useCallback(() => transact('Minting test tokens…',async(wallet,owner)=>{const {request}=await publicClient.simulateContract({address:paymentTokenAddress,abi:erc20Abi,functionName:'mint',args:[owner,parseUnits('1000',tokenDecimals)],account:owner});return wallet.writeContract(request)}),[tokenDecimals,transact])

  return useMemo(()=>({account,chainId,connected:!!account,configured,plans,subscriptions,payments,customers,tokenBalance,tokenSymbol,tokenMintable:paymentTokenMintable,loading,pending,error,connect,disconnect,switchNetwork,refresh:load,createPlan,subscribe,cancel,setPlanActive,executePayment,approveToken,mintTestTokens}),[account,chainId,configured,plans,subscriptions,payments,customers,tokenBalance,tokenSymbol,loading,pending,error,connect,disconnect,switchNetwork,load,createPlan,subscribe,cancel,setPlanActive,executePayment,approveToken,mintTestTokens])
}
