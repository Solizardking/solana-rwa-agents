import { Umi } from '@metaplex-foundation/umi';
import { AgentRwaPairing, GENESIS_LAUNCH_URL, GenesisLaunchPayload, GenesisTokenInput } from './types';

export type ShapeLaunchOptions = {
  wallet?: string;
  setToken?: boolean;
  launch?: Record<string, unknown>;
  network?: string;
};

export function shapeCreateAndRegisterLaunch(
  pairing: AgentRwaPairing,
  token: GenesisTokenInput,
  options: ShapeLaunchOptions = {},
): GenesisLaunchPayload {
  const setToken = options.setToken !== false;
  if (setToken && pairing.agentTokenBound) {
    throw new Error('setToken is irreversible; this agent already has a bound token');
  }
  return {
    wallet: options.wallet ?? pairing.assetSigner,
    agent: {
      mint: pairing.agentAsset,
      setToken,
    },
    launchType: 'bondingCurve',
    token,
    launch: options.launch ?? {},
    network: options.network,
  };
}

export type SubmitLaunchOptions = {
  fetch?: typeof fetch;
  execute?: boolean;
  url?: string;
  umi?: Umi;
};

export async function submitGenesisLaunch(
  payload: GenesisLaunchPayload,
  options: SubmitLaunchOptions = {},
): Promise<{ payload: GenesisLaunchPayload; submitted: boolean; response?: unknown }> {
  if (!options.execute) {
    return { payload, submitted: false };
  }
  const fetchFn = options.fetch ?? fetch;
  const response = await fetchFn(options.url ?? GENESIS_LAUNCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { payload, submitted: true, response: body };
}

export function defaultAgentToken(pairing: AgentRwaPairing): GenesisTokenInput {
  return {
    name: 'RWA Agent Token',
    symbol: 'RWAA',
    image: 'https://gateway.irys.xyz/rwa-agent-token',
    description: `Canonical agent token bound to ${pairing.agentAsset} for RWA ${pairing.rwaAssetId}`,
  };
}
