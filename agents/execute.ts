import { execute } from '@metaplex-foundation/mpl-core';
import { Umi, TransactionBuilder } from '@metaplex-foundation/umi';
import { AgentRwaPairing } from './types';
import { asPublicKey } from './identity';
import { buildTransferTokens, buildUpdateMetadata } from './trade';

// Asset Signer PDAs sign via Core CPI. A raw inner instruction cannot be sent
// as a wallet transaction: wallets cannot sign for this PDA.
export function buildAgentExecution(umi: Umi, pairing: AgentRwaPairing, instructions: TransactionBuilder, collection?: string): TransactionBuilder {
  return execute(umi, { asset: { publicKey: asPublicKey(pairing.agentAsset) }, collection: collection ? { publicKey: asPublicKey(collection) } : undefined, instructions: instructions.getInstructions() });
}
export function buildExecuteTransferTokens(umi: Umi, pairing: AgentRwaPairing, input: Parameters<typeof buildTransferTokens>[2], collection?: string) {
  const inner = buildTransferTokens(umi, pairing, input);
  return { ...inner, builder: buildAgentExecution(umi, pairing, inner.builder, collection) };
}
export function buildExecuteUpdateMetadata(umi: Umi, pairing: AgentRwaPairing, input: Parameters<typeof buildUpdateMetadata>[2], collection?: string) {
  const inner = buildUpdateMetadata(umi, pairing, input);
  return { ...inner, builder: buildAgentExecution(umi, pairing, inner.builder, collection) };
}
