import {
  delegateExecutionV1,
  findAgentIdentityV1Pda,
  findExecutionDelegateRecordV1Pda,
  findExecutiveProfileV1Pda,
  registerExecutiveV1,
  registerIdentityV1,
  revokeExecutionV1,
  setAgentTokenV1,
} from '@metaplex-foundation/mpl-agent-registry';
import { execute, findAssetSignerPda } from '@metaplex-foundation/mpl-core';
import {
  createNoopSigner,
  Pda,
  PublicKey,
  TransactionBuilder,
  Umi,
  publicKey,
} from '@metaplex-foundation/umi';
import { AgentRwaPairing, RwaAgent } from './types';

export {
  delegateExecutionV1,
  findAgentIdentityV1Pda,
  findAssetSignerPda,
  findExecutionDelegateRecordV1Pda,
  findExecutiveProfileV1Pda,
  registerExecutiveV1,
  registerIdentityV1,
  revokeExecutionV1,
  setAgentTokenV1,
};

export type AssetRef = PublicKey | Pda | string;

export function asPublicKey(value: AssetRef): PublicKey {
  if (typeof value === 'string') {
    return publicKey(value);
  }
  if (Array.isArray(value)) {
    return publicKey(value[0]);
  }
  return value;
}

export function pdaAddress(pda: Pda): string {
  return String(pda[0]);
}

export function deriveAgentIdentityPda(umi: Umi, asset: AssetRef): Pda {
  return findAgentIdentityV1Pda(umi, { asset: asPublicKey(asset) });
}

export function deriveAssetSignerPda(umi: Umi, asset: AssetRef): Pda {
  return findAssetSignerPda(umi, { asset: asPublicKey(asset) });
}

export function deriveExecutiveProfilePda(umi: Umi, authority: AssetRef): Pda {
  return findExecutiveProfileV1Pda(umi, { authority: asPublicKey(authority) });
}

export function deriveExecutionDelegateRecordPda(
  umi: Umi,
  input: { executiveProfile: AssetRef; agentAsset: AssetRef },
): Pda {
  return findExecutionDelegateRecordV1Pda(umi, {
    executiveProfile: asPublicKey(input.executiveProfile),
    agentAsset: asPublicKey(input.agentAsset),
  });
}

export function buildRegisterIdentity(
  umi: Umi,
  input: {
    asset: AssetRef;
    collection?: AssetRef;
    agentRegistrationUri: string;
  },
): TransactionBuilder {
  return registerIdentityV1(umi, {
    asset: asPublicKey(input.asset),
    collection: input.collection ? asPublicKey(input.collection) : undefined,
    agentRegistrationUri: input.agentRegistrationUri,
  });
}

export function buildRegisterIdentityForAgent(
  umi: Umi,
  agent: RwaAgent,
  asset: AssetRef,
  collection?: AssetRef,
): TransactionBuilder {
  return buildRegisterIdentity(umi, {
    asset,
    collection,
    agentRegistrationUri: agent.coreUri,
  });
}

export function buildRegisterExecutive(
  umi: Umi,
  input: Parameters<typeof registerExecutiveV1>[1] = {},
): TransactionBuilder {
  return registerExecutiveV1(umi, input);
}

export function buildDelegateExecution(
  umi: Umi,
  input: {
    agentAsset: AssetRef;
    executiveAuthority: AssetRef;
  },
): {
  builder: TransactionBuilder;
  agentIdentity: Pda;
  executiveProfile: Pda;
} {
  const agentAsset = asPublicKey(input.agentAsset);
  const agentIdentity = deriveAgentIdentityPda(umi, agentAsset);
  const executiveProfile = deriveExecutiveProfilePda(umi, input.executiveAuthority);
  return {
    builder: delegateExecutionV1(umi, {
      agentAsset,
      agentIdentity,
      executiveProfile,
    }),
    agentIdentity,
    executiveProfile,
  };
}

export function buildRevokeExecution(
  umi: Umi,
  input: {
    agentAsset: AssetRef;
    executiveAuthority: AssetRef;
    destination?: AssetRef;
  },
): {
  builder: TransactionBuilder;
  executionDelegateRecord: Pda;
  executiveProfile: Pda;
} {
  const agentAsset = asPublicKey(input.agentAsset);
  const executiveProfile = deriveExecutiveProfilePda(umi, input.executiveAuthority);
  const executionDelegateRecord = deriveExecutionDelegateRecordPda(umi, {
    executiveProfile,
    agentAsset,
  });
  return {
    builder: revokeExecutionV1(umi, {
      executionDelegateRecord,
      agentAsset,
      destination: input.destination ? asPublicKey(input.destination) : umi.payer.publicKey,
    }),
    executionDelegateRecord,
    executiveProfile,
  };
}

export function buildSetAgentToken(
  umi: Umi,
  pairing: AgentRwaPairing,
  genesisAccount: AssetRef,
  collection?: AssetRef,
): {
  builder: TransactionBuilder;
  assetSigner: PublicKey;
  agentIdentity: Pda;
} {
  if (pairing.agentTokenBound) {
    throw new Error('setToken is irreversible; this agent already has a bound token');
  }
  const asset = asPublicKey(pairing.agentAsset);
  const assetSigner = asPublicKey(pairing.assetSigner);
  const agentIdentity = deriveAgentIdentityPda(umi, asset);
  const inner = setAgentTokenV1(umi, {
    asset,
    genesisAccount: asPublicKey(genesisAccount),
    authority: createNoopSigner(assetSigner),
  });
  const builder = execute(umi, {
    asset: { publicKey: asset },
    collection: collection ? { publicKey: asPublicKey(collection) } : undefined,
    instructions: inner,
  });
  return { builder, assetSigner, agentIdentity };
}

export async function sendBuilderIfExecute(
  builder: TransactionBuilder,
  umi: Umi,
  executeFlag = false,
): Promise<{ execute: boolean; instructions: ReturnType<TransactionBuilder['getInstructions']> }> {
  if (executeFlag) {
    await builder.sendAndConfirm(umi);
  }
  return { execute: executeFlag, instructions: builder.getInstructions() };
}
