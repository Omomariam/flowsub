export async function mapBounded<T, R>(items: readonly T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({length:Math.min(5,items.length)},async()=>{
    while(cursor<items.length) { const index=cursor++; results[index]=await fn(items[index],index) }
  }))
  return results
}
