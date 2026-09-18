import { botChain, deploymentBlock, flowSubAbi, flowSubAddress, logClient, logRpc, confirmations, reorgWindow, logBlockRange, logMaxRanges } from './web3'
import { syncHistory } from './syncHistory'

// Confirmed history is cached per deployment; replay the trailing window on every sync.
function fetchRange(fromBlock: bigint, toBlock: bigint) {
  return logClient.getContractEvents({address:flowSubAddress,abi:flowSubAbi,eventName:'PaymentExecuted',fromBlock,toBlock})
}
type Log = Awaited<ReturnType<typeof fetchRange>>[number]
const memoryCache=new Map<string,{cursor:bigint;logs:Log[]}>()
let running: ReturnType<typeof syncEvents> | null = null
export function paymentEvents() {
  if (!running) running = syncEvents().finally(()=>{running=null})
  return running
}
async function syncEvents() {
  if (!logRpc) throw new Error('Configure a mainnet log-capable RPC or public proxy')
  if (await logClient.getChainId() !== botChain.id) throw new Error('Log provider network mismatch')
  const key = `flowsub-events:${botChain.id}:${flowSubAddress}:${deploymentBlock}`
  let cached: { cursor: bigint; logs: Log[] } = memoryCache.get(key) || {cursor:deploymentBlock,logs:[]}
  if(!memoryCache.has(key)) try { const raw=localStorage.getItem(key); if(raw) { const decoded=JSON.parse(raw, (_,v)=>typeof v==='string' && /^bigint:\d+$/.test(v)?BigInt(v.slice(7)):v); if(typeof decoded.cursor==='bigint' && Array.isArray(decoded.logs)) cached=decoded } } catch { /* corrupt cache is rebuilt */ }
  const result=await syncHistory({start:deploymentBlock,head:await logClient.getBlockNumber(),...cached,confirmations,rewind:reorgWindow,range:logBlockRange,maxPages:logMaxRanges,fetchRange})
  memoryCache.set(key,{cursor:result.cursor,logs:result.logs})
  try { localStorage.setItem(key,JSON.stringify({cursor:result.cursor,logs:result.logs},(_,v)=>typeof v==='bigint'?`bigint:${v}`:v)) } catch { /* storage may be unavailable; reads still work */ }
  return result
}
