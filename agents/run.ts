import { Umi, publicKey } from '@metaplex-foundation/umi';
import { rwaTraderAgent } from './catalog';
import { createAgentUmiWithIdentity } from './umi';
import { pairAgentWithRwa, PairingRegistry } from './pairing';
import { defaultAgentToken, shapeCreateAndRegisterLaunch } from './launch';
import {
  buildCreateFungibleAndMint,
  buildMintMore,
  buildRwaTransferOwnership,
  buildTransferTokens,
  buildUpdateMetadata,
  instructionPubkeys,
} from './trade';
import { ERC8004_REGISTRATION_V1 } from './types';

export const DEFAULT_SAMPLE_AGENT_ASSET = 'So11111111111111111111111111111111111111112';
export const DEFAULT_SAMPLE_RWA_ASSET = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const DEFAULT_SAMPLE_RWA_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const DEFAULT_SAMPLE_RWA_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DEFAULT_SAMPLE_DESTINATION = '11111111111111111111111111111111';

export type DryRunOptions = {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  umi?: Umi;
  stdout?: { write: (chunk: string) => unknown };
};

function argValue(args: string[], flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }
  return fallback;
}

export function runPairAndLaunchDryRun(options: DryRunOptions = {}): string {
  const env = options.env ?? process.env;
  const args = options.args ?? [];
  const umi = options.umi ?? createAgentUmiWithIdentity(undefined, env);
  const agent = rwaTraderAgent();
  const agentAsset = argValue(args, '--agent', env.AGENT_ASSET || DEFAULT_SAMPLE_AGENT_ASSET);
  const rwaAsset = argValue(args, '--rwa', env.RWA_ASSET || DEFAULT_SAMPLE_RWA_ASSET);
  const rwaAssetId = argValue(args, '--rwa-id', env.RWA_ASSET_ID || DEFAULT_SAMPLE_RWA_ID);
  const rwaMint = argValue(args, '--mint', env.RWA_MINT || DEFAULT_SAMPLE_RWA_MINT);
  const destination = argValue(args, '--to', env.TRADE_DESTINATION || DEFAULT_SAMPLE_DESTINATION);

  publicKey(agentAsset);
  publicKey(rwaAsset);
  publicKey(rwaMint);

  const registry = new PairingRegistry();
  const pairing = pairAgentWithRwa(umi, {
    agentAsset,
    rwaAsset,
    rwaAssetId,
    rwaMint,
    registry,
  });

  const launchPayload = shapeCreateAndRegisterLaunch(pairing, defaultAgentToken(pairing), {
    wallet: String(umi.identity.publicKey),
  });

  const created = buildCreateFungibleAndMint(umi, pairing, {
    name: 'RWA Fraction',
    symbol: 'RWAF',
    uri: 'https://example.com/rwa-fraction.json',
    decimals: 9,
    amount: 1_000_000_000,
  });
  const minted = buildMintMore(umi, pairing, {
    mint: rwaMint,
    amount: 100,
    destinationOwner: destination,
  });
  const transferred = buildTransferTokens(umi, pairing, {
    mint: rwaMint,
    destinationOwner: destination,
    amount: 50,
  });
  const updated = buildUpdateMetadata(umi, pairing, {
    mint: rwaMint,
    name: 'Updated RWA Fraction',
    symbol: 'URWA',
    uri: 'https://example.com/updated-rwa.json',
  });
  const rwaTransfer = buildRwaTransferOwnership(umi, pairing, {
    destinationOwner: destination,
    amount: 25,
  });

  const report = {
    agent: {
      id: agent.id,
      name: agent.registration.name,
      type: agent.registration.type,
    },
    pairing: {
      agentAsset: pairing.agentAsset,
      assetSigner: pairing.assetSigner,
      agentIdentity: pairing.agentIdentity,
      rwaAsset: pairing.rwaAsset,
      rwaAssetId: pairing.rwaAssetId,
      rwaMint: pairing.rwaMint,
    },
    launch: launchPayload,
    tradePlan: {
      createFungible: {
        action: 'mint',
        mint: String(created.mint.publicKey),
        destinationAta: String(created.token[0]),
        keys: instructionPubkeys(created.builder),
      },
      mintMore: {
        action: 'mint',
        mint: String(minted.mint),
        destinationAta: String(minted.token[0]),
        keys: instructionPubkeys(minted.builder),
      },
      transfer: {
        action: 'transfer',
        mint: String(transferred.mint),
        destinationAta: String(transferred.destination[0]),
        keys: instructionPubkeys(transferred.builder),
      },
      update: {
        action: 'update',
        mint: String(updated.mint),
        keys: instructionPubkeys(updated.builder),
      },
      rwaTransferOwnership: rwaTransfer,
    },
  };

  const text = [
    `ERC-8004 type: ${ERC8004_REGISTRATION_V1}`,
    `Paired RWA asset id: ${pairing.rwaAssetId}`,
    `Agent asset: ${pairing.agentAsset}`,
    `Asset signer: ${pairing.assetSigner}`,
    `Genesis launchType: ${launchPayload.launchType}`,
    `Genesis setToken: ${launchPayload.agent.setToken}`,
    `Trade plan: mint + transfer of mint ${pairing.rwaMint}`,
    JSON.stringify(report, null, 2),
    '',
  ].join('\n');

  const out = options.stdout ?? process.stdout;
  out.write(text);
  return text;
}


