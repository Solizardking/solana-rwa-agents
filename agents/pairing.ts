import { Umi } from '@metaplex-foundation/umi';
import { asPublicKey, deriveAgentIdentityPda, deriveAssetSignerPda, pdaAddress, AssetRef } from './identity';
import { AgentRwaPairing } from './types';

export class PairingRegistry {
  private byRwa = new Map<string, AgentRwaPairing>();
  private byAgent = new Map<string, AgentRwaPairing>();

  getByRwa(rwaAsset: string): AgentRwaPairing | undefined {
    return this.byRwa.get(rwaAsset);
  }

  getByAgent(agentAsset: string): AgentRwaPairing | undefined {
    return this.byAgent.get(agentAsset);
  }

  list(): AgentRwaPairing[] {
    return [...this.byRwa.values()];
  }

  pair(pairing: AgentRwaPairing, options: { replace?: boolean } = {}): AgentRwaPairing {
    const replace = options.replace === true;
    const existing = this.byRwa.get(pairing.rwaAsset);
    if (existing && existing.agentAsset !== pairing.agentAsset && !replace) {
      throw new Error(`RWA asset ${pairing.rwaAsset} is already paired with agent ${existing.agentAsset}`);
    }
    if (existing && existing.agentAsset !== pairing.agentAsset) {
      this.byAgent.delete(existing.agentAsset);
    }
    const prior = this.byAgent.get(pairing.agentAsset);
    if (prior && prior.rwaAsset !== pairing.rwaAsset) {
      this.byRwa.delete(prior.rwaAsset);
    }
    this.byRwa.set(pairing.rwaAsset, pairing);
    this.byAgent.set(pairing.agentAsset, pairing);
    return pairing;
  }

  bindAgentToken(agentAsset: string, mint: string): AgentRwaPairing {
    const current = this.byAgent.get(agentAsset);
    if (!current) {
      throw new Error(`No pairing for agent ${agentAsset}`);
    }
    const next = bindAgentToken(current, mint);
    this.pair(next, { replace: true });
    return next;
  }
}

export function pairAgentWithRwa(
  umi: Umi,
  input: {
    agentAsset: AssetRef;
    rwaAsset: AssetRef;
    rwaAssetId: AssetRef;
    rwaMint?: AssetRef;
    registry?: PairingRegistry;
    replace?: boolean;
  },
): AgentRwaPairing {
  const agentAsset = String(asPublicKey(input.agentAsset));
  const identity = deriveAgentIdentityPda(umi, agentAsset);
  const signer = deriveAssetSignerPda(umi, agentAsset);
  const pairing: AgentRwaPairing = {
    agentAsset,
    agentIdentity: pdaAddress(identity),
    assetSigner: pdaAddress(signer),
    rwaAsset: String(asPublicKey(input.rwaAsset)),
    rwaAssetId: String(asPublicKey(input.rwaAssetId)),
    rwaMint: input.rwaMint ? String(asPublicKey(input.rwaMint)) : undefined,
    agentTokenBound: false,
  };
  if (input.registry) {
    input.registry.pair(pairing, { replace: input.replace });
  }
  return pairing;
}

export function bindAgentToken(pairing: AgentRwaPairing, mint: string): AgentRwaPairing {
  if (pairing.agentTokenBound) {
    throw new Error('setToken is irreversible; this agent already has a bound token');
  }
  return {
    ...pairing,
    agentToken: mint,
    agentTokenBound: true,
  };
}

export function requirePairingMint(pairing: AgentRwaPairing): string {
  if (!pairing.rwaMint) {
    throw new Error('Pairing has no RWA mint; tokenize the asset before trading');
  }
  return pairing.rwaMint;
}
