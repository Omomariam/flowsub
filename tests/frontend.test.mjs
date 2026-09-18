import test from 'node:test'
import assert from 'node:assert/strict'
import { sumAmounts } from '../src/amounts.ts'
import { csvCell } from '../src/csv.ts'
import { mapBounded } from '../src/bounded.ts'
import { syncHistory } from '../src/syncHistory.ts'
test('payment totals preserve ERC-20 precision beyond Number limits',()=>{
  assert.equal(sumAmounts(['9007199254740993.000000000000000001','0.000000000000000009']),'9007199254740993.00000000000000001')
  assert.equal(sumAmounts(['0.1','0.2']),'0.3')
  assert.equal(sumAmounts(['10.00','0.00']),'10')
  assert.equal(sumAmounts([]),'0')
})
test('CSV preserves names with delimiters and prevents formula interpretation',()=>{
  assert.equal(csvCell('Plan, "Gold"'),'"Plan, ""Gold"""')
  assert.equal(csvCell('=SUM(A1)'),'"\'=SUM(A1)"')
})
test('RPC mapping bounds concurrency while preserving order',async()=>{
  let active=0,max=0
  const results=await mapBounded(Array.from({length:20},(_,i)=>i),async i=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return i*2})
  assert.ok(max<=5);assert.deepEqual(results,Array.from({length:20},(_,i)=>i*2))
})
test('history sync bounds ranges and resumes backfill',async()=>{
  const ranges=[]
  const options={start:100n,head:1000n,cursor:100n,logs:[],confirmations:2,rewind:20,range:100,maxPages:2,fetchRange:async(from,to)=>{ranges.push([from,to]);return []}}
  const first=await syncHistory(options)
  assert.equal(first.cursor,300n);assert.equal(first.complete,false);assert.deepEqual(ranges,[[100n,199n],[200n,299n]])
  const next=await syncHistory({...options,cursor:first.cursor})
  assert.equal(next.cursor,480n)
})
test('history replay removes reorganized logs and preserves distinct log indexes',async()=>{
  const old={blockNumber:105n,transactionHash:'removed',logIndex:0}
  const keep={blockNumber:101n,transactionHash:'earlier',logIndex:0}
  const replacement={blockNumber:105n,transactionHash:'replacement',logIndex:0}
  const second={...replacement,logIndex:1}
  const result=await syncHistory({start:100n,head:110n,cursor:109n,logs:[keep,old],confirmations:2,rewind:5,range:100,maxPages:1,fetchRange:async()=>[replacement,replacement,second]})
  assert.deepEqual(result.logs,[keep,replacement,second]);assert.equal(result.complete,true);assert.equal(result.confirmedHead,108n)
})
