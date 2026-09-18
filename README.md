# FlowSub

FlowSub is a non-custodial recurring ERC-20 payment application for BOT Chain. The interface contains no simulated blockchain state: plans, subscriptions, balances, subscribers, and payment history are read from the configured contracts.

## What is live

- Injected EVM wallet connection and account/chain event handling
- Automatic add/switch to BOT Chain Testnet (`968`)
- Plan creation with wallet confirmation
- ERC-20 approval and first subscription payment
- Recurring payment execution by a merchant or keeper
- Subscription cancellation and plan pause/reactivation
- Token balances, subscriber records, totals, and analytics from contract state
- Payment history reconstructed from confirmed `PaymentExecuted` events
- Direct BOTScan links and CSV export
- Optional on-chain test-token minting

## Deploy to BOT Chain testnet

1. Copy `.env.example` to `.env`.
2. Put a testnet-only private key with faucet BOT in `PRIVATE_KEY`. Never use a production key.
3. Compile and deploy:

```bash
npm install
npm run deploy:testnet
```

4. Copy the addresses and deployment block printed by the script into `.env`.
5. Start the application:

```bash
npm run dev
```

The deployment script also writes the public deployment values into `.env`. Verify both contracts on BOTScan with:

```bash
npm run verify:testnet
npm run check:testnet
```

The deployment script deploys [`MockUSDT.sol`](contracts/MockUSDT.sol) and [`FlowSub.sol`](contracts/FlowSub.sol). If you configure a non-mintable token instead, set `VITE_PAYMENT_TOKEN_MINTABLE=false`.

## Run recurring collection

Smart contracts do not wake themselves up. A keeper must submit `executePayment` transactions when payments become due. Configure `KEEPER_PRIVATE_KEY` and `FLOWSUB_ADDRESS`, then run:

```bash
npm run keeper:once
```

Run that command on a secure scheduled worker at the frequency appropriate for your shortest billing interval. The keeper never holds subscriber funds; it only calls the public contract function, which transfers within each subscriber's ERC-20 allowance.

## BOT Chain configuration

- RPC: `https://rpc.bohr.life`
- Chain ID: `968`
- Currency: `BOT`
- Explorer: `https://scan.bohr.life`
- Faucet: `https://faucet.botchain.ai`

## Production notes

The contracts are functional prototypes, not audited production financial infrastructure. Mainnet tooling now includes contract tests, paginated reads, cached history, and a persistent keeper. Public real-value use still requires token provenance checks, a supported log provider, an independent security review, measured gas funding, live smoke testing, and configured hosting/monitoring. See MAINNET.md for the launch gates.

## BOT Chain mainnet

Mainnet configuration, deployment, verification, browser-safe history providers, keeper scheduling, billing behavior, and incident response are documented in [MAINNET.md](MAINNET.md). Start with `.env.mainnet.example` for server secrets and `.env.production.example` for public frontend settings. Mainnet commands use chain 677 and do not deploy MockUSDT or inherit the existing testnet `.env`.

Run `npm test`, `npm run test:contracts`, and `npm run test:operations` before release. The operations suite uses a local EVM with chain ID 677; it does not send transactions to the real mainnet.
