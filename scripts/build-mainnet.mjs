import { loadEnv, build } from 'vite'
import { spawnSync } from 'node:child_process'
import { isAddress } from 'viem'
const env = {...loadEnv('production',process.cwd(),'VITE_'),...Object.fromEntries(Object.entries(process.env).filter(([k])=>k.startsWith('VITE_')))}
if(env.VITE_NETWORK !== 'mainnet') throw new Error('Set VITE_NETWORK=mainnet in .env.production')
for(const name of ['VITE_FLOWSUB_ADDRESS','VITE_PAYMENT_TOKEN_ADDRESS']) if(!isAddress(env[name] || '') || /^0x0{40}$/i.test(env[name])) throw new Error(`${name} is required`)
if(!/^\d+$/.test(env.VITE_DEPLOYMENT_BLOCK || '') || BigInt(env.VITE_DEPLOYMENT_BLOCK) === 0n) throw new Error('A nonzero deployment block is required')
if(!env.VITE_BOTCHAIN_LOG_RPC_URL) throw new Error('A public log-capable provider is required')
if(env.VITE_PAYMENT_TOKEN_MINTABLE !== 'false') throw new Error('Mainnet minting must be false')
for(const [name,value] of Object.entries(env)) if(/private.?key|secret|api.?key/i.test(name) || /^0x[\da-f]{64}$/i.test(value || '')) throw new Error(`Sensitive public configuration: ${name}`)
const check=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-b'],{stdio:'inherit'})
if(check.status !== 0) process.exit(check.status || 1)
await build({mode:'production',build:{outDir:process.env.FLOWSUB_BUILD_DIR || 'dist'}})
