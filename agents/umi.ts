import { mplAgentIdentity, mplAgentTools } from '@metaplex-foundation/mpl-agent-registry';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { generateSigner, signerIdentity, Umi } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';

export function defaultRpcUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.RPC_ENDPOINT || env.RPC_URL || 'http://127.0.0.1:8899';
}

export function createAgentUmi(rpcUrl?: string, env: NodeJS.ProcessEnv = process.env): Umi {
  return createUmi(rpcUrl || defaultRpcUrl(env))
    .use(mplCore())
    .use(mplAgentIdentity())
    .use(mplAgentTools())
    .use(mplTokenMetadata());
}

export function createAgentUmiWithIdentity(rpcUrl?: string, env: NodeJS.ProcessEnv = process.env): Umi {
  const umi = createAgentUmi(rpcUrl, env);
  const signer = generateSigner(umi);
  return umi.use(signerIdentity(signer));
}
