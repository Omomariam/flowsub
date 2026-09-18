import { createPublicClient, http, encodeDeployData, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { networkName, chain, client, assertChain, address, tokenInfo, artifact } from './lib/network.mjs'
export async function preflight({resume = false} = {}) {
  if (networkName !== 'mainnet') throw new Error('Set BOTCHAIN_NETWORK=mainnet')
  await assertChain()
  const token = await tokenInfo(address(process.env.PAYMENT_TOKEN_ADDRESS, 'PAYMENT_TOKEN_ADDRESS'))
  if (process.env.PAYMENT_TOKEN_REVIEWED !== 'true') throw new Error('Review token provenance and transfers, then set PAYMENT_TOKEN_REVIEWED=true')
  if (!process.env.BOTCHAIN_LOG_RPC_URL) throw new Error('BOTCHAIN_LOG_RPC_URL is required')
  const logs = createPublicClient({ chain, transport: http(process.env.BOTCHAIN_LOG_RPC_URL) })
  await assertChain(logs)
  const head = await logs.getBlockNumber()
  await logs.getLogs({ address: token.address, fromBlock: head, toBlock: head })
  const key = process.env.DEPLOYER_PRIVATE_KEY
  if (!/^0x[\da-f]{64}$/i.test(key || '')) throw new Error('DEPLOYER_PRIVATE_KEY is required')
  const account = privateKeyToAccount(key), contract = artifact()
  if(!resume) {
    const gas = await client.estimateGas({ account, data: encodeDeployData({ abi: contract.abi, bytecode: contract.bytecode, args: [token.address] }) })
    const gasPrice = await client.getGasPrice(), balance = await client.getBalance({ address: account.address }), budget = gas * gasPrice * 2n
    if (balance < budget) throw new Error('Deployer BOT balance below estimated budget with 2x margin')
    if (process.env.DEPLOYMENT_MAX_COST_BOT && budget > parseEther(process.env.DEPLOYMENT_MAX_COST_BOT)) throw new Error('Estimate exceeds BOT budget')
    console.log(JSON.stringify({ chainId: chain.id, deployer: account.address, token, gas: String(gas), budgetWei: String(budget), balanceWei: String(balance) }, null, 2))
  }
  return { account, token, contract }
}
if (process.argv[1]?.endsWith('preflight-mainnet.mjs')) await preflight()
