import fs from 'node:fs'
import { manifestPath, assertDeployment, client } from './lib/network.mjs'
const deployment = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
await assertDeployment(deployment)
const receipt = await client.getTransactionReceipt({ hash: deployment.flowSub.transactionHash })
if (receipt.status !== 'success' || receipt.contractAddress?.toLowerCase() !== deployment.flowSub.address.toLowerCase() || String(receipt.blockNumber) !== String(deployment.flowSub.blockNumber)) throw new Error('Deployment receipt does not match manifest')
console.log('Deployment receipt, chain, code and token binding validated.')
