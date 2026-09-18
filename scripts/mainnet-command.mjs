import { spawnSync } from 'node:child_process'
const scripts = { preflight: 'preflight-mainnet.mjs', deploy: 'deploy-mainnet.mjs', verify: 'verify-testnet.mjs', check: 'check-deployment.mjs', keeper: 'run-keeper.mjs', verification: 'check-verification.mjs', export: 'export-mainnet-env.mjs' }
if (!scripts[process.argv[2]]) throw new Error('Unknown mainnet command')
const result = spawnSync(process.execPath, [`scripts/${scripts[process.argv[2]]}`], { stdio: 'inherit', env: { ...process.env, BOTCHAIN_NETWORK: 'mainnet' } })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
