import { manifestPath, networkName, network, assertDeployment } from './lib/network.mjs'
import fs from 'node:fs'

const deployment=JSON.parse(fs.readFileSync(manifestPath,'utf8'))
await assertDeployment(deployment)
const contracts=[['Payment token',deployment.token.address],['FlowSub',deployment.flowSub.address]]
for(const [label,address] of contracts){
  const response=await fetch(`${network.explorer}/api/v2/smart-contracts/${address}`)
  if(!response.ok)throw new Error(`${label}: BOTScan returned HTTP ${response.status}`)
  const record=await response.json()
  const verified=Boolean(record.source_code&&record.abi&&record.name)
  console.log(`${label}: verified=${verified}, name=${record.name||'missing'}, compiler=${record.compiler_version||'missing'}, address=${address}`)
  if(!verified)process.exitCode=1
  if(label==='FlowSub' && networkName==='mainnet') {
    const full=record.is_fully_verified===true && record.is_partially_verified!==true && record.compiler_version===deployment.compilerVersion
    console.log(`FlowSub: full verification=${full}`)
    if(!full)process.exitCode=1
  }
}
