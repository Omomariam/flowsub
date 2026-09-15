import fs from 'node:fs'

const deployment=JSON.parse(fs.readFileSync('deployments/bot-testnet.json','utf8'))
const contracts=[['MockUSDT',deployment.token.address],['FlowSub',deployment.flowSub.address]]
for(const [label,address] of contracts){
  const response=await fetch(`https://scan.bohr.life/api/v2/smart-contracts/${address}`)
  if(!response.ok)throw new Error(`${label}: BOTScan returned HTTP ${response.status}`)
  const record=await response.json()
  const verified=Boolean(record.source_code&&record.abi&&record.name)
  console.log(`${label}: verified=${verified}, name=${record.name||'missing'}, compiler=${record.compiler_version||'missing'}, address=${address}`)
  if(!verified)process.exitCode=1
}
