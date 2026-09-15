# BOT Chain Project Integration Guide

# Welcome to BOT Chain

BOT Chain is a high-performance and **EVM-compatible Layer 1** blockchain specifically designed for AI Agents, DePIN, verifiable computing, and the protocol economy.&nbsp;

This guide provides project teams with complete, step-by-step instructions to integrate and launch on BOT Chain Mainnet quickly, securely, and efficiently.

&nbsp;

* **Wallet Configuration**  
  * **Test net**  
* Chain ID：968  
  RPC：[https://rpc.bohr.life](https://rpc.bohr.life)  
  Native Token：BOT  
  Total Supply：150 Million  
  Explorer：[https://scan.bohr.life/](https://scan.bohr.life/)  
  * **Main net**  
* Chain ID：677  
  RPC：[https://rpc.botchain.ai](https://rpc.botchain.ai)  
  Native Token：BOT  
  Total Supply：150 Million  
  Explorer：[https://scan.botchain.ai](https://scan.botchain.ai)

**DEPLOY A VERIFIED CONTRACT**

forge script script/DeployBotchain.s.sol:DeployBotchain \\

&nbsp;&nbsp;\--rpc-url $BOTCHAIN\_RPC\_URL \\

&nbsp;&nbsp;\--broadcast \\

&nbsp;&nbsp;\--verify \\

&nbsp;&nbsp;\--verifier blockscout \\

&nbsp;&nbsp;\--verifier-url $BOTCHAIN\_VERIFIER\_URL \\

&nbsp;&nbsp;\--slow

&nbsp;

## Official Links

| Resource | Link |
| ----- | ----- |
| Website | [https://www.botchain.ai](https://www.botchain.ai) |
| Testnet Faucet (Get test BOT) | [https://faucet.botchain.ai](https://faucet.botchain.ai) |
| DEX | [https://dex.botchain.ai/\#/swap](https://dex.botchain.ai/#/swap) https://dev-docs.botchain.ai/docs/DEX/ |
| Cross-Chain Bridge | [https://bridge.botchain.ai](https://bridge.botchain.ai) |
| Official Wallet | [https://wallet.botchain.ai](https://wallet.botchain.ai) |
| Block Explorer | [https://scan.botchain.ai](https://scan.botchain.ai) |
| Developer Documentation | [https://dev-docs.botchain.ai/docs/Developers/quick-guide/](https://dev-docs.botchain.ai/docs/Developers/quick-guide/) |
| GitHub | [https://github.com/BOTChain-bot](https://github.com/BOTChain-bot) |
| BOT contract | Native Coin, no contract address |
| BOT Price API | [https://api.coinstore.com/api/v1/ticker/price;symbol=BOTUSDT](https://api.coinstore.com/api/v1/ticker/price;symbol=BOTUSDT) [https://api.coinstore.com/v3/public/orderbook/market\_pair?market\_pair=BOT\_USDT\&depth=100](https://api.coinstore.com/v3/public/orderbook/market_pair?market_pair=BOT_USDT&depth=100) |
| BOT on Coingecko and coinmarketcap | [https://www.coingecko.com/en/coins/bot](https://www.coingecko.com/en/coins/bot)  [https://coinmarketcap.com/currencies/bot-chain/](https://coinmarketcap.com/currencies/bot-chain/)&nbsp; |
| WBOT contract | 0xD5452816194a3784dBa983426cCe7c122F4abd30 [https://scan.botchain.ai/token/0xD5452816194a3784dBa983426cCe7c122F4abd30](https://scan.botchain.ai/token/0xD5452816194a3784dBa983426cCe7c122F4abd30) |
| WBOT Price API | [https://dex-wallet.botchain.ai/api/graph/price?token=0xD5452816194a3784dBa983426cCe7c122F4abd30](https://dex-wallet.botchain.ai/api/graph/price?token=0xD5452816194a3784dBa983426cCe7c122F4abd30)&nbsp; |
| USDT contract on BOT Chain | 0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C [https://scan.botchain.ai/token/0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C](https://scan.botchain.ai/token/0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C) |
| BOT Chain Brand Kit | [https://drive.google.com/drive/folders/1AYVj\_gvnffA4T-QyXN3opgWNG5M7oD\_1](https://drive.google.com/drive/folders/1AYVj_gvnffA4T-QyXN3opgWNG5M7oD_1)&nbsp; |
| ERC4337 testnet bundler point | https://bundler.bohr.life/rpc |
| ERC4337 mainnet bundler point | https://bundler.botchain.ai/rpc |
| BDEX Universal Router | &nbsp;Mainnet，chainId 677：0xaE6ae8630f7A888dEc0B9195C85F7515d5887655 Testnet，chainId 968：0x73Be0A1d8011B335A7aBeF6c45544E8ca4448AB5 |
|  |  |

&nbsp;

## Add BOT Chain to Your Wallet

## Supporting EVM Wallets

Wallets Integration

- [x] Bitget Wallet [https://web3.bitget.com/](https://web3.bitget.com/)  
- [x] TokenPocket [https://www.tokenpocket.pro](https://www.tokenpocket.pro)  
- [ ] OKX Wallet  
- [ ] MetaMask&nbsp;

## Add BOT Chain through Chainlist

1. Visit [https://chainlist.org/?search=bot+chain\&testnets=true](https://chainlist.org/?search=bot+chain&testnets=true)&nbsp;  
2. Connect Wallet  
3. Add BOT Chain to your wallet

## Add BOT Chain Manually

1. Open your wallet  
2. Select Network, Add Custom Network  
3. Fill in the following Mainnet information

| Item | Parameter |
| ----- | ----- |
| Network Name | BOT Chain |
| Default RPC URL | [https://rpc.botchain.ai](https://rpc.botchain.ai) |
| Chain ID | 677 |
| Currency symbol/Native Token | BOT |
| Block Explorer URL | [https://scan.botchain.ai/](https://scan.botchain.ai/) |

&nbsp;

## Project Integration Steps

Step 1: Add BOT Chain Mainnet to your wallet (see instructions above)

Step 2: Obtain test tokens from the faucet for testing

Step 3: Deploy your smart contracts using Hardhat / Foundry / Remix via the official RPC

Step 4: Verify your contracts on the block explorer and test your product

&nbsp;

## Security & Audit Reports

All core contracts of BOT Chain have been professionally audited by CertiK:

BOT Chain Audit Report: [https://www.botchain.ai/docs/Chain.pdf](https://www.botchain.ai/docs/Chain.pdf)&nbsp;

BOT DEX Audit Report: [https://dex.botchain.ai/docs/Dex-Audit-Report.pdf](https://dex.botchain.ai/docs/Dex-Audit-Report.pdf)

BOT Bridge Audit Report: [https://bridge.botchain.ai/docs/Bridge-Audit-Report.pdf](https://bridge.botchain.ai/docs/Bridge-Audit-Report.pdf)

CertiK Skynet Project Insight: [https://skynet.certik.com/projects/botchain](https://skynet.certik.com/projects/botchain)&nbsp;

Welcome to build the future of an intelligent economy together on BOT Chain\!

If you need any assistance during integration, please feel free to contact the BOT Chain team.

&nbsp;

&nbsp;

| Inform | details |
| :---- | :---- |
| CA token on mainnet | [https://scan.botchain.ai/token/0x546307af427902A75771434Df831d88219784E19](https://scan.botchain.ai/token/0x546307af427902A75771434Df831d88219784E19)&nbsp; |
| WSS endpoint | wss://ws-rpc.botchain.ai  wss://[ws-rpc-debug.botchain.ai/](http://ws-rpc-debug.botchain.ai/)&nbsp; |
| contract addresses on BDEX | "mainnet": {     "chainId": 677,     "deployer": "0xf0A2f56505f0dfea980567DA88830146B6b5c0b2",     "tokens": {       "wbot": "0xD5452816194a3784dBa983426cCe7c122F4abd30",       "usdt": "0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C"     },     "v3": {       "deployedAt": "2026-02-26T05:57:53.573Z",       "factory": "0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419",       "swapRouter": "0x07032d47A1b9f8460cBeE9dC17c1d3E438693929",       "quoter": "0x1e8bb093ade678ABAa49623D4c3a1a7F37716DEd",       "quoterV2": "0x034A705b36067cff99ABf5C662Be881cBd8d0176",       "botdexMulticall": "0x5FC578616301E56137dc3872593d496668525362",       "nftDescriptor": "0x829D215662e89881adE3C7b15a0af812c4364dA4",       "nftPositionDescriptor": "0x89b084964AF60BeE7bEc324Ea62267C97f6656E3",       "nftPositionManager": "0xDAc3FcFF004d8a8675b94E44941A1a2e3b240090"     }   }&nbsp; |

&nbsp;

&nbsp;