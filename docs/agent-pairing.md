# Pair Metaplex AI agents with RWA assets

This client binds a registered Metaplex agent to a tokenized real-world asset, shapes a Genesis bonding-curve launch, and builds trade instructions that spend from the agent's Asset Signer PDA. Nothing is broadcast unless you pass `execute: true`.

## Identity

`createAgentUmiWithIdentity` loads Umi with Core, Agent Identity, Agent Tools, and Token Metadata plugins.

Builders (instruction lists, not sent):

- `buildRegisterIdentity` → `registerIdentityV1`
- `buildRegisterExecutive` → `registerExecutiveV1`
- `buildDelegateExecution` → `delegateExecutionV1`
- `buildRevokeExecution` → `revokeExecutionV1`

PDAs:

- AgentIdentity: `findAgentIdentityV1Pda(umi, { asset })`
- Asset Signer: `findAssetSignerPda(umi, { asset })` from seeds `["mpl-core-execute", asset]`

EIP-8004 metadata `type` is exactly `https://eips.ethereum.org/EIPS/eip-8004#registration-v1`.

## Pairing

`pairAgentWithRwa` records:

- agent Core asset
- AgentIdentity PDA
- Asset Signer PDA
- RWA asset account and asset id
- RWA mint when the asset is tokenized

One agent per RWA asset unless `replace: true`. Launch and trade functions take this pairing object — not an unbound wallet.

## Launch

`shapeCreateAndRegisterLaunch(pairing, token)` produces the Genesis `createAndRegisterLaunch` input:

```json
{
  "launchType": "bondingCurve",
  "agent": { "mint": "<agent Core asset>", "setToken": true }
}
```

`setToken: true` is irreversible. `bindAgentToken` / a second launch with `setToken: true` on the same pairing throws. `buildSetAgentToken` wraps `setAgentTokenV1` in Core `execute` so the Asset Signer is the authority (non-atomic bind path).

`submitGenesisLaunch` posts to `https://api.metaplex.com/v1/genesis/launch` only when `execute: true`. Inject `fetch` in tests.

## Trade

From a pairing:

| Builder | What it does |
| --- | --- |
| `buildCreateFungibleAndMint` | Token Metadata `createFungible` + ATA + `mintTokensTo` to the Asset Signer |
| `buildMintMore` | `createTokenIfMissing` + `mintTokensTo` |
| `buildTransferTokens` | `transferTokens` between ATAs (source = Asset Signer) |
| `buildUpdateMetadata` | `updateV1` name/symbol/uri |
| `buildRwaTransferOwnership` | RWA `transfer_ownership` with `from` = paired Asset Signer |

## CLI

```bash
npm run agents:dry-run
```

Optional flags: `--agent`, `--rwa`, `--rwa-id`, `--mint`, `--to`.
