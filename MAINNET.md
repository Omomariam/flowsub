# FlowSub mainnet release and operations

## Prepare

Use Node 22.13 or newer and `npm ci`. Contract and operations tests require Foundry Anvil 1.7.1 (or a compatible installed version) on PATH, or an explicit `ANVIL_BINARY` path. On Windows, use the official native Anvil release. Only local test wallets are used. Copy `.env.mainnet.example` to `.env.mainnet`, fill in the server settings, and keep this file in a secret store or on the secured deployment host. Mainnet scripts do not load the existing testnet `.env`. A custom server file can be selected with `BOTCHAIN_ENV_FILE`; injected runtime variables take precedence.

Confirm payment-token provenance, verified source, decimals, approval behavior, transfer restrictions, and issuer/bridge risks. The token address in the integration guide is a candidate, not an approved production default. Set `PAYMENT_TOKEN_REVIEWED=true` only after completing this review. Fee-on-transfer and rebasing assets are unsupported. FlowSub transfers ERC-20 tokens, not native BOT.

Fund separate deployer and keeper wallets with BOT. Use `DEPLOYER_PRIVATE_KEY` only for deployment and `KEEPER_PRIVATE_KEY` only on the worker. Store neither key in `VITE_*` settings. Testnet deployment continues to support the existing `PRIVATE_KEY` setting.

Configure a mainnet RPC for transactions and a log-capable mainnet RPC for `BOTCHAIN_LOG_RPC_URL`. Confirm rate/range limits, historical retention, and chain ID 677. The [official RPC documentation](https://dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint/) states that historical log queries are disabled on the official endpoint. Frontend history needs a browser-safe provider URL or an HTTPS proxy with CORS and rate limiting; privileged provider credentials stay on the server.

The compiler and package versions are pinned. Compilation targets the conservative `paris` EVM instruction set; deployment preflight estimates the exact creation bytecode on the configured network. Confirm chain compatibility and finality policy in a testnet rehearsal and a controlled mainnet pilot. Tests do not substitute for an independent review of the final contract and deployment process.

## Validate and deploy

```bash
npm test
npm run test:contracts
npm run test:operations
npm run preflight:mainnet
npm run deploy:mainnet
npm run verify:mainnet
npm run check:mainnet
npm run check:verification:mainnet
```

Preflight is read-only. It checks chain identity, token bytecode/metadata, log support, deployer balance, and deployment gas. The estimated budget includes a 2x gas-price margin; optionally set `DEPLOYMENT_MAX_COST_BOT` to reject estimates above your budget. This estimate is not a guaranteed future fee quote. No mock token is deployed by the mainnet command.

Deployment saves signed transaction bytes and the hash before broadcasting, then saves a receipt-backed `deployments/bot-mainnet.json`. Rerunning with a pending journal resumes the same transaction; an existing final manifest prevents redeployment. The wallet lock prevents concurrent deployments. Keep release artifacts and the journal backed up; do not delete a pending journal to retry an uncertain transaction. The journal contains signed transaction data, not a private key, and should still be access-controlled until deployment is resolved.

BOTScan verification submits the exact standard JSON input and constructor arguments and polls for completion. Mainnet releases reject verification artifacts that differ from the recorded source/compiler. Confirm the explorer API/credential requirements; `BLOCKSCOUT_API_KEY` is optional for explorers that permit unauthenticated verification.

## Publish the frontend

Set `PUBLIC_LOG_RPC_URL` in server configuration to a browser-safe RPC or proxy. Then:

```bash
npm run export:mainnet
npm run build:mainnet
```

Export creates `.env.production` from the confirmed manifest and refuses to overwrite an existing file. Alternatively, populate `.env.production.example` manually with the same public values. Server `BOTCHAIN_LOG_RPC_URL` is never copied automatically. Public URLs can still contain provider credentials in paths or query strings; explicitly use a public/restricted credential or proxy. Every `VITE_*` value ships to browsers.

The mainnet build rejects missing/zero addresses, missing deployment block/log provider, sensitive public variable names, and enabled minting. Publish only `dist/` to the chosen HTTPS host. `FLOWSUB_BUILD_DIR` optionally selects a separate output directory for build verification. The frontend checks RPC chain identity, contract code, and immutable token binding before writes, and rechecks wallet chain/account. Existing testnet deployments can still use legacy array getters; mainnet requires the new pagination getters.

Run a low-value smoke test using wallets you control: create a short-interval plan, approve and subscribe, verify the immediate merchant transfer, collect once via the keeper, cancel, revoke allowance, and confirm further collection fails. Check explorer links, exact amounts, history, rejected transactions, and wrong-network handling. Pause the smoke-test plan afterward.

## Billing and UI behavior

- Subscription immediately charges the first payment. Default new approval authorizes 12 payments; the user can choose 1–120. The shared contract allowance is reset to the selected budget when it differs; nonzero allowances are first reset to zero for token compatibility. Allowance can be revoked from Payment method.
- Allowance is shared across this contract's plans, so the payment count is an approval budget, not a per-plan allocation. Cancellation stops that subscription but does not revoke allowance. Revoke separately to remove contract authorization.
- Collection schedules the next payment from the actual collection timestamp. Missed periods are not charged in a catch-up loop. Total paid accumulates across resubscriptions.
- At or after finite expiry, collection marks the subscription expired without a transfer. The keeper reports this separately from a payment.
- Insufficient funds or allowance leaves the due date unchanged. There is no on-chain grace period, automatic cancellation, or entitlement system. Merchants must define service access and recovery policies before offering paid service.
- Plans use 20-record pages. Subscription lists use 100-record pages, and customer pages contain up to 100 addresses per displayed merchant plan. Customer totals and counts are scoped to displayed records; payment totals cover indexed confirmed history.
- History backfills 500-block ranges, at most 20 ranges per refresh, caches a cursor/logs in browser storage, and replays a 20-block trailing window with a two-block confirmation lag. It shows backfill progress and provider failures. Adjust `VITE_CONFIRMATIONS`, `VITE_REORG_WINDOW`, `VITE_LOG_BLOCK_RANGE`, and `VITE_LOG_MAX_RANGES` for the selected provider/finality policy. Set server `BOTCHAIN_CONFIRMATIONS` consistently for deployment/keeper receipts. This is a confirmation policy, not an assertion of protocol finality. Browser storage capacity limits make a backend indexer appropriate for large deployments; disable browser cache access only with the expectation that backfill may repeat. Validate this policy before production use.

## Run the keeper

Schedule `npm run keeper:mainnet:once` on a secured worker more frequently than the shortest billing interval. Use a persistent working directory so `.runtime/` survives restarts. One keeper key should have no other transaction-producing job. A wallet-level lock prevents overlapping keeper processes on this network.

The worker validates the manifest and token binding, checks BOT balance, scans paginated records using a persistent cursor, simulates calls, and bounds checks, transactions, and estimated gas per run. Defaults are 100 plan pages, 200 subscription checks, 20 transactions, and 5,000,000 estimated gas. Optional `KEEPER_MAX_COST_BOT` caps the combined maximum fee estimate of newly submitted transactions per run. Already-journaled transactions are reconciled before applying new-work budgets. Configure `KEEPER_MAX_PLANS`, `KEEPER_MAX_CHECKS`, `KEEPER_MAX_TRANSACTIONS`, `KEEPER_MAX_GAS`, and `KEEPER_MIN_BALANCE_BOT` as needed. Low balance, collection failures, unresolved transactions, and incompatible mainnet getters produce a nonzero exit status. Failed collections use persisted exponential backoff capped at one hour; competing collectors are handled by rereading state.

Pending signed bytes/hash are persisted before broadcast and reconciled before new work after a restart. Never delete pending transaction state merely because a RPC timed out. Investigate dropped/replaced transactions and nonce usage, and reconcile the original hash on chain before manual intervention. Automatic fee replacement is not implemented; alert on unresolved pending work.

For hard process termination, a lock can remain. Read its PID/time, verify the recorded process is no longer running, inspect pending state, and remove only that stale lock before restarting. State/journal JSON updates use temporary files and rename. Back up `.runtime/`; do not run multiple hosts against separate copies of the same keeper wallet state.

Configure your scheduler/monitoring system to alert on nonzero exit status, missing heartbeat, low BOT, repeated failed collection, pending transaction age, and incomplete history indexing. Successful runs emit JSON with heartbeat, checks, payments, expirations, skips, failures, and gas estimate. Monitor overdue subscriptions against your promised billing cadence. Alert delivery and wallet top-ups require your hosting/monitoring provider setup; no outbound messaging integration is assumed.

## Incident response and migration

The contract has no global pause, upgrade administrator, or global owner. Stopping the keeper or taking down the UI does not stop permissionless collection. Merchants can pause their own plans; subscribers can cancel subscriptions or revoke allowance directly through the contract/token if the UI is unavailable.

For a contract defect, coordinate those actions and deploy a newly reviewed contract under a distinct release manifest. Existing plans, subscriptions, and allowances do not migrate automatically. Users must opt into new plans and approvals. A frontend rollback does not reverse chain state.

Before public launch, complete token verification, testnet rehearsal, independent security review, measured gas funding, controlled mainnet smoke testing, HTTPS publication, persistent keeper scheduling, and external monitoring. None of these external approvals or live deployments is asserted by the local implementation.

## Mainnet deployment record ? 2026-09-18

FlowSub deployed on chain 677 at `0xa1a3f61d532ad5ef961cdf36812c1f19c05a39c7`, block 23686256, transaction `0x06e988df75677b5d06939d8e86fbca03df161cdeff804a59e29183b3fff6670e`. Payment token: `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` (USDT, six decimals). Deployment fee: 0.03813046 BOT. Receipt, bytecode presence, and immutable token binding passed validation. BOTScan verification passed as a partial match: deployed compiler v0.8.37+commit.f401782d; comparison compiler v0.8.36+commit.8a079791; identical executable bytecode, different compiler metadata. Exact/full metadata verification awaits BOTScan support for the deployed compiler.

The manifest and verification evidence are recorded in deployments/bot-mainnet.json and deployments/bot-mainnet-verification.json. Public production settings were exported to .env.production and the mainnet frontend build completed. Frontend publication, keeper funding/configuration/scheduling, a real-payment smoke test, and independent security review remain separate launch tasks. No second contract was deployed.
