export type HistoryLog = {blockNumber:bigint | null;transactionHash:string | null;logIndex:number | null}
export async function syncHistory<T extends HistoryLog>(options: {
  start: bigint; head: bigint; cursor: bigint; logs: T[]; confirmations: number; rewind: number; range: number; maxPages: number;
  fetchRange: (from: bigint, to: bigint) => Promise<T[]>;
}) {
  const {start,head,confirmations,rewind,range,maxPages,fetchRange}=options
  const confirmed=head>BigInt(confirmations)?head-BigInt(confirmations):0n
  const candidate=options.cursor>BigInt(rewind)?options.cursor-BigInt(rewind):start
  const from=candidate>start && candidate<=confirmed?candidate:start
  const logs=options.logs.filter(l=>l.blockNumber!==null && l.blockNumber<from)
  let cursor=from
  for(let page=0;page<maxPages && cursor<=confirmed;page++) {
    const end=cursor+BigInt(range)-1n<confirmed?cursor+BigInt(range)-1n:confirmed
    logs.push(...await fetchRange(cursor,end));cursor=end+1n
  }
  const unique=[...new Map(logs.map(l=>[`${l.transactionHash}:${l.logIndex}`,l])).values()]
  return {logs:unique,cursor,complete:cursor>confirmed,syncedThrough:cursor-1n,confirmedHead:confirmed}
}
