# QuickNode integration

The ignored `.env` contains the RPC endpoint, matching `wss://` endpoint, callback URL and webhook signing token. Credentials stay server-side. Node 22+ is required for the environment loader and verification command.

- `npm run agents:dry-run` loads `.env` and builds plans without broadcasting.
- `createQuicknodeConnection()` uses RPC_URL/RPC_ENDPOINT and WSS_URL/WEBSOCKET_URL.
- `requestMetis(input, userPublicKey?)` fetches a validated quote or unsigned swap. Without QUICKNODE_METIS_URL it uses the Musebook server proxy. It does not sign or submit transactions.
- `npm run quicknode:verify` checks live RPC, a slot notification, signed synthetic webhook delivery, replay deduplication, unsigned rejection, and a Metis quote. Results are saved to `docs/quicknode-verification.json`; any failed check exits nonzero.
- `npm run test:quicknode` and `npm run check:quicknode` validate the new client.

## Provider activation still required

Install QuickNode Metis/Swap API in the QuickNode dashboard and copy the dedicated HTTPS add-on URL into QUICKNODE_METIS_URL. The supplied Solana RPC URL and webhook security token do not grant account-management access. To enable the Musebook proxy too, configure its Worker QUICKNODE_METIS_URL secret using the same add-on URL.

Register a QuickNode Solana-mainnet webhook with destination `https://musebook.trade/webhook/quick`, the supplied signing token, and the intended account/event filters. No real wallet filters are inferred from the repository's example asset addresses. A signed synthetic delivery verifies the receiver but does not prove provider registration or actual provider delivery. The live status endpoint exposes lastProviderDeliveryAt separately.

QuickNode reference: https://www.quicknode.com/docs/solana/swap-api

## Account-access check

No QuickNode management credentials are present in the project environment or process environment. The browser connector could not inspect the dashboard because its shared browser profile is already in use. Provider activation remains pending account access; no other browser session was stopped.

## Public Swap API configured

The local agent now uses QuickNode documented public Swap API at `https://public.jupiterapi.com`. This enables quotes and unsigned swaps without private add-on credentials. Enhanced paid endpoints and provider webhook registration still require account access. The Musebook Worker Metis proxy remains separately unconfigured.
