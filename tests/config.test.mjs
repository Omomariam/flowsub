import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
test('mainnet commands reject missing production settings without broadcasting',()=>{
  const result=spawnSync(process.execPath,['scripts/build-mainnet.mjs'],{encoding:'utf8',env:{...process.env,VITE_NETWORK:'mainnet',VITE_FLOWSUB_ADDRESS:'',VITE_PAYMENT_TOKEN_ADDRESS:''}})
  assert.notEqual(result.status,0);assert.match(result.stderr,/VITE_FLOWSUB_ADDRESS is required/)
})
test('unknown network fails before any RPC use',()=>{
  const result=spawnSync(process.execPath,['scripts/check-deployment.mjs'],{encoding:'utf8',env:{...process.env,BOTCHAIN_NETWORK:'unknown',BOTCHAIN_ENV_FILE:'.nonexistent'}})
  assert.notEqual(result.status,0);assert.match(result.stderr,/BOTCHAIN_NETWORK must be mainnet or testnet/)
})
test('mainnet build rejects test-token minting even with complete address settings',()=>{
  const result=spawnSync(process.execPath,['scripts/build-mainnet.mjs'],{encoding:'utf8',env:{...process.env,VITE_NETWORK:'mainnet',VITE_FLOWSUB_ADDRESS:`0x${'1'.repeat(40)}`,VITE_PAYMENT_TOKEN_ADDRESS:`0x${'2'.repeat(40)}`,VITE_DEPLOYMENT_BLOCK:'100',VITE_BOTCHAIN_LOG_RPC_URL:'https://example.invalid',VITE_PAYMENT_TOKEN_MINTABLE:'true'}})
  assert.notEqual(result.status,0);assert.match(result.stderr,/Mainnet minting must be false/)
})
