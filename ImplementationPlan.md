# FlowSub: BOT Chain mainnet implementation plan

Draft date: 2026-09-18. Scope: prepare the contracts, frontend, deployment tooling, and recurring-payment worker for mainnet. This document does not deploy contracts or submit transactions.

## What you need

1. A dedicated deployment wallet funded with real BOT for contract deployment, plus a separate keeper wallet funded for recurring transaction fees. Merchants and subscribers also need BOT for their own transactions. Estimate gas against the final bytecode and current network fees; no fixed BOT budget is established yet.
2. A verified mainnet ERC-20 payment token and enough of that token for smoke testing. FlowSub accepts ERC-20 allowances and transfers, so native BOT cannot be passed as its payment token. Supporting native BOT directly requires a separate contract design; a verified wrapped token can use the existing ERC-20 model.
3. Mainnet RPC access for reads and transactions, and a provider or indexer that supports historical event logs. The official mainnet RPC alone is insufficient for the current payment-history implementation.
4. Secure server-side key storage, an always-running scheduled keeper service, monitoring, and an HTTPS frontend host/domain.
5. Contract tests, a production security review, reproducible builds, and a successful rehearsal on testnet before accepting real payments.
6. Mainnet explorer verification access. Confirm the supported BOTScan verification API and whether credentials are required before implementation.

### Confirmed network settings

| Setting | Mainnet | Existing testnet |
| --- | --- | --- |
| Chain ID | `677` (`0x2a5`) | `968` (`0x3c8`) |
| Network | BOT Chain Mainnet | BOT Chain Testnet |
| Native gas currency | BOT, 18 decimals | BOT, 18 decimals |
| Official RPC | `https://rpc.botchain.ai` | `https://rpc.bohr.life` |
| Explorer | `https://scan.botchain.ai` | `https://scan.bohr.life` |

These settings were checked against the [official Quick Guide](https://dev-docs.botchain.ai/docs/Developers/quick-guide/) and [official mainnet wallet instructions](https://www.botchain.ai/en/help-center/docs/getting-started/add-bot-chain-metamask/). The [official RPC documentation](https://dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint/) states that `eth_getLogs` is disabled on the listed mainnet endpoint. Validate the chosen provider's actual capabilities before launch; WebSocket live events alone do not provide historical backfill.

## Repository findings

| Area | Current behavior | Required change |
| --- | --- | --- |
| `src/web3.ts` | Defines only chain 968 and uses its default public RPC | Add explicit network selection and validated public configuration |
| `src/useFlowSub.ts` | Hardcodes wallet chain switching, chain checks, and signer to testnet | Derive all wallet operations from the selected chain and recheck the wallet before writes |
| `src/App.tsx` | Contains testnet labels, explorer URLs, and chain checks | Use shared network metadata and the token's actual symbol |
| `scripts/deploy-testnet.mjs` | Deploys unrestricted-mint `MockUSDT`, then FlowSub, and rewrites `.env` | Add a separate mainnet deployment path using an existing verified token |
| Verification/check/redeploy scripts | Assume testnet manifests and explorer endpoints | Make them explicitly network-aware and validate chain identity |
| `scripts/run-keeper.mjs` | Uses testnet, can fall back to deployer key, scans all plans/subscribers | Use a dedicated key, bounded discovery, persistent processing, retries, and alerts |
| Event history | Queries from deployment block to latest on every load and suppresses failures as empty history | Add bounded indexing/backfill and visible failure states |
| `contracts/FlowSub.sol` | Immutable token, permissionless collection, merchant-controlled plan pause; no upgrade or global pause | Test and review these constraints and document incident response |
| Tests and build | No test command configured; compiler target is implicit and several dependencies use `latest` | Add meaningful contract/integration tests and pin the production toolchain |

The local `Acunetix BOTChain Integration Guide.md` lists USDT at `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C`. Treat this as a candidate only: confirm its provenance with BOT Chain, inspect verified source and bytecode on mainnet, read its metadata, and exercise its approval/transfer behavior before selecting it. This plan has not independently verified that token or executed RPC probes.

## Implementation sequence

### 1. Establish production configuration

- Add a shared network registry for mainnet and testnet, consumable by the Vite app and Node scripts. Use an explicit selector such as `VITE_NETWORK=mainnet` for the frontend and `BOTCHAIN_NETWORK=mainnet` for scripts.
- Keep mainnet and testnet addresses/manifests separate. Missing mainnet values must fail validation rather than fall back to testnet or zero addresses.
- Validate configured addresses, deployment block, RPC chain ID, contract bytecode, and `FlowSub.paymentToken()` binding before enabling writes. Add the token getter to the frontend ABI.
- Re-read `eth_chainId` after wallet add/switch and immediately before signing; do not optimistically set the expected chain ID. Handle rejected switches and account changes.
- Define public RPC/explorer metadata and separate log-provider configuration. Browser-visible provider URLs must not contain privileged credentials; use a backend proxy when required.
- Extend `.gitignore` to exclude secret environment variants while allowing sanitized examples. Existing `.env` ignore coverage does not automatically cover `.env.mainnet` or `.env.production`.

Proposed public mainnet configuration, populated with deployment results:

```dotenv
VITE_NETWORK=mainnet
VITE_BOTCHAIN_RPC_URL=https://rpc.botchain.ai
VITE_BOTCHAIN_LOG_RPC_URL=<public-log-capable-mainnet-rpc-or-proxy>
VITE_FLOWSUB_ADDRESS=<deployed-mainnet-flowsub-address>
VITE_PAYMENT_TOKEN_ADDRESS=<verified-mainnet-erc20-address>
VITE_DEPLOYMENT_BLOCK=<flowsub-receipt-block>
VITE_PAYMENT_TOKEN_MINTABLE=false
```

Proposed server/deployment configuration:

```dotenv
BOTCHAIN_NETWORK=mainnet
BOTCHAIN_RPC_URL=https://rpc.botchain.ai
BOTCHAIN_LOG_RPC_URL=<log-capable-mainnet-rpc>
PAYMENT_TOKEN_ADDRESS=<verified-mainnet-erc20-address>
FLOWSUB_ADDRESS=<deployed-mainnet-flowsub-address>
DEPLOYER_PRIVATE_KEY=<secret-injected-for-deployment-only>
KEEPER_PRIVATE_KEY=<separate-worker-secret>
BLOCKSCOUT_API_URL=<confirmed-mainnet-verification-endpoint>
BLOCKSCOUT_API_KEY=<if-required-by-mainnet-explorer>
```

These are proposed variables, not all supported by the current code. Load server secrets explicitly through the runtime secret store or a designated ignored environment file. Build the frontend from public configuration only. Every `VITE_*` value is exposed to users.

Acceptance: both networks work independently, invalid mainnet settings block writes, and production artifacts contain no private keys or privileged provider credentials.

### 2. Confirm the token and harden payment behavior

- Select the payment asset, confirm token provenance and metadata, and document any bridge/issuer dependencies, freezing, upgrade, or transfer restrictions.
- Test the selected token's `approve` and `transferFrom` behavior. Support allowance-reset requirements where applicable; handle reverted and unsuccessful approval receipts explicitly.
- Keep `MockUSDT` deployment and mint controls available only on testnet. Reject mainnet mint configuration and prevent the mint action itself from executing on mainnet.
- Wait for token metadata before accepting price input; do not use the initial six-decimal default for mainnet writes. Preserve amounts as bigint/decimal strings for financial calculations, history, and CSV export instead of floating-point `Number` values.
- Explain recurring allowance authorization and offer a bounded approval option plus allowance revocation. Cancellation currently stops the subscription but leaves the token allowance unchanged.
- Reject or explicitly design support for fee-on-transfer/rebasing tokens: current accounting records the requested transfer amount, which may differ from merchant receipts for such tokens.
- Review non-reentrancy, external token calls, integer bounds, and token trust assumptions. Use established safe-transfer utilities if the review identifies a benefit.

Acceptance: metadata, approvals, payment amounts, merchant receipts, and cancellation/revocation behavior match the chosen production token.

### 3. Add contract tests and decide billing policy

Use a Solidity test framework such as Foundry or an equivalent local EVM runner. Test behaviors and financial invariants, including:

- Invalid constructor tokens and invalid plan fields; merchant-only pause/reactivation.
- First payment, due payment, attempted early payment, duplicate collection, cancellation, and resubscription without duplicate subscriber records.
- Insufficient balance/allowance, false-return and no-return tokens, and malicious token callbacks. Failed transfers must not advance subscription state.
- Finite expiry, exact due/expiry boundaries, unlimited duration, and paused plans.
- Total-paid accounting and bounds; payments always reach the plan merchant.
- Arbitrary callers can execute due payments but cannot change the merchant or charge before the contract permits it.

Explicitly accept or revise these current semantics before deploying: the first charge is immediate; late collection schedules the next charge from collection time; missed periods are not charged in a catch-up loop; expiry is processed when collection is invoked; and `totalPaid` accumulates across resubscriptions. The UI must distinguish expired subscriptions rather than treating all inactive states as canceled.

Pin compiler/dependency versions and the supported EVM target after confirming BOT Chain compatibility. Preserve compiler version, optimizer settings, standard JSON input, constructor arguments, and source/build hashes for verification. Obtain an independent security review of the final contract and resolve material findings before public real-value use.

Acceptance: behavioral tests pass, billing policy is documented, bytecode is reproducible, and the release has completed security review.

### 4. Implement mainnet deployment and verification

- Add `scripts/deploy-mainnet.mjs` and `deploy:mainnet`; deploy only FlowSub with the approved existing token as its constructor argument.
- Add a read-only preflight command that checks RPC chain 677, token code and metadata, compiler artifacts, deployer address/balance, gas estimate, and required configuration. Abort before broadcasting on mismatch.
- Record a receipt-backed `deployments/bot-mainnet.json` with chain ID, RPC/explorer metadata, deployer, token address/metadata, FlowSub address, transaction hash, block, compiler settings, source/build hashes, and constructor arguments. Never include keys.
- Write only an explicitly selected public environment output; do not silently replace the existing testnet `.env`. Preserve a submitted transaction hash immediately so retries can reconcile a pending deployment without deploying twice.
- Parameterize `verify-testnet.mjs`, `check-verification.mjs`, and `check-deployment.mjs` or add mainnet equivalents. Verify FlowSub against the confirmed mainnet BOTScan API; inspect the existing token's verification instead of submitting MockUSDT.
- Check chain ID strictly, deployment receipt success, contract code, immutable token binding, and verification status. Do not equate an explorer submission with completed verification.
- Make `redeploy-flowsub.mjs` explicitly testnet-only unless a reviewed mainnet migration path is implemented.

Acceptance: preflight succeeds, the final release deploys once, the manifest matches on-chain state, and BOTScan shows the exact verified source.

### 5. Make indexing and the frontend reliable

- Add a log client/provider or backend indexer with historical `eth_getLogs` support on chain 677. Probe range limits, rate limits, browser CORS, and live-event support.
- Backfill from the recorded deployment block in bounded ranges, persist a cursor, and fetch only new blocks afterward. Use configurable confirmation/finality handling and reconcile reorganizations.
- Identify events with chain ID, transaction hash, and log index; a single transaction can emit multiple payment events. Cache block timestamps and paginate wallet history.
- Replace silent empty history on RPC failure with a visible unavailable/retry state. Adapt `watchContractEvent` to supported transport capabilities or poll indexed state.
- Replace full plan/subscriber enumeration with indexed or paginated queries. Existing getters return whole arrays; scale may require an indexer or new contract pagination functions before deployment.
- Derive explorer links, network labels, connection status, and token labels from shared configuration. Show receipt success/revert explicitly for every write and approval.

Acceptance: history survives reloads, logs are not duplicated or dropped, provider failures are visible, and realistic data volumes do not overwhelm the RPC or UI.

### 6. Operate the recurring-payment keeper

- Require a dedicated keeper key on mainnet; remove fallback to the deployer key. Validate chain ID and contract/token binding at startup.
- Discover due subscriptions through indexed/paginated data and bound each run's work, gas budget, and concurrency. Use chain timestamps for due decisions and contract simulation before sending.
- Persist transaction hashes and processing status, coordinate worker nonces, and reconcile pending/replaced transactions before retrying. Use a lock so scheduled runs cannot overlap unintentionally.
- Recheck subscription state after competing collectors. A duplicate or no-longer-due attempt should be classified separately from infrastructure failure.
- Separate expiry processing from actual collection: current `executePayment` can succeed while emitting only `SubscriptionExpired` and transferring no funds.
- Add retry backoff and actionable status for insufficient allowance/balance. Notify users through in-app status; decide grace-period/service-entitlement rules before promising automatic billing recovery.
- Schedule runs more frequently than the shortest supported billing interval. Monitor BOT balance, successful collections, missed due payments, pending transactions, RPC failures, worker heartbeat, and indexer lag; return a meaningful failure status to the scheduler.

Acceptance: repeated scheduled runs collect once per permitted period, survive restarts and competing collectors, and raise actionable alerts.

### 7. Rehearse, deploy, and release

1. Finish configuration, token selection, tests, security review, provider setup, and operational setup.
2. Rehearse the full release on testnet, including indexing, verification, keeper recovery, and frontend build.
3. Freeze the reviewed commit and artifacts. Run mainnet preflight and review the deployer, token, gas estimate, and manifest destination.
4. Deploy FlowSub, verify it, and populate the mainnet public build configuration from the confirmed receipt/manifest.
5. Run a controlled low-value smoke test with wallets you control: create a plan, approve, subscribe, observe the initial transfer, execute one due payment through the keeper, cancel, and verify no further collection is permitted. Check merchant balance deltas, logs, history, and explorer links. Use a short-interval test plan and pause it afterward.
6. Build and publish `dist/` to the selected HTTPS host; never upload server environment files. Test wallet connection, rejected/wrong-network flows, all transaction outcomes, refresh/history, and absence of mint controls on the deployed site.
7. Enable scheduled collection and alerts, begin with a limited pilot, and expand after stable operation.

Proposed commands to add during implementation (currently unavailable):

```bash
npm run test:contracts
npm run preflight:mainnet
npm run deploy:mainnet
npm run verify:mainnet
npm run check:mainnet
npm run keeper:mainnet:once
npm run build:mainnet
```

Retain existing testnet commands. The new build command must explicitly load public mainnet settings, and keeper/deployment commands must explicitly load the appropriate server configuration.

## Incident response and migration

FlowSub has no global administrator, upgrade mechanism, or global pause. Stopping the keeper or disabling frontend writes cannot stop other accounts from calling permissionless collection. Merchants can pause their own plans, and subscribers can cancel or revoke allowances. Document these steps and contact paths before launch.

If a contract change is needed after deployment, deploy a new contract, verify it, and publish a new manifest/build. Existing subscriptions and approvals remain attached to the old contract; users must opt into new plans and approvals. Do not imply that rolling back the frontend rolls back chain state. If a global pause or upgrade mechanism is required, design, test, and review its permissions and governance before the initial deployment.

## Outstanding inputs and launch gates

- Confirm the payment token and provenance; the local USDT address is a candidate pending verification.
- Select deployment and keeper wallets, fund BOT balances, and establish a top-up budget from measured gas costs.
- Choose a log-capable provider/indexer, secret store, keeper runtime/schedule, and frontend host/domain.
- Confirm explorer API/credential requirements and chain EVM/finality behavior through documented checks.
- Accept billing, approval, expiry, retry, and incident policies; complete security review and resolve findings.
- Complete receipt-backed deployment verification, controlled smoke testing, and operational alert checks before public launch.

No mainnet address, gas budget, deployment success, or security approval is asserted by this draft.

## Implementation status

Implemented locally: shared network registry and fail-closed mainnet settings; wallet/receipt validation; exact decimal amounts and CSV escaping; bounded approval and revocation; mainnet mint prevention; contract pagination; mainnet preflight/deployment journaling and locking; network-aware verification/checks; public environment export and validated mainnet build; bounded cached event backfill; persistent keeper discovery, signed-transaction recovery, retry backoff, wallet locking, and JSON health output. Dependencies/compiler settings are pinned and MAINNET.md documents release/operations procedures.

Validation includes local contract behavior, production configuration rejection, exact totals, concurrency limits, CSV safety, and end-to-end deployment/keeper execution and restart recovery against an isolated local chain 677. External launch gates remain: confirmed token/provider, funded wallets, independent security review, testnet rehearsal, real mainnet smoke test, HTTPS hosting, worker scheduling, and monitoring/alert delivery. Browser indexing uses finite local storage and a configurable deployment-specific provider; a backend indexer is still the appropriate scale-up path. Pending transaction fee replacement remains a manual monitored operation.

## Mainnet deployment record ? 2026-09-18

FlowSub deployed on chain 677 at `0xa1a3f61d532ad5ef961cdf36812c1f19c05a39c7`, block 23686256, transaction `0x06e988df75677b5d06939d8e86fbca03df161cdeff804a59e29183b3fff6670e`. Payment token: `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` (USDT, six decimals). Deployment fee: 0.03813046 BOT. Receipt, bytecode presence, and immutable token binding passed validation. BOTScan verification passed as a partial match: deployed compiler v0.8.37+commit.f401782d; comparison compiler v0.8.36+commit.8a079791; identical executable bytecode, different compiler metadata. Exact/full metadata verification awaits BOTScan support for the deployed compiler.

The manifest and verification evidence are recorded in deployments/bot-mainnet.json and deployments/bot-mainnet-verification.json. Public production settings were exported to .env.production and the mainnet frontend build completed. Frontend publication, keeper funding/configuration/scheduling, a real-payment smoke test, and independent security review remain separate launch tasks. No second contract was deployed.
