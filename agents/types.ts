export const ERC8004_REGISTRATION_V1 = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
export const METAPLEX_AGENT_REGISTRY = 'solana:101:metaplex';
export const METAPLEX_API_BASE = 'https://api.metaplex.com';
export const GENESIS_LAUNCH_PATH = '/v1/genesis/launch';
export const GENESIS_LAUNCH_URL = `${METAPLEX_API_BASE}${GENESIS_LAUNCH_PATH}`;

export const RWA_PROGRAM_ID = 'RWA1111111111111111111111111111111111111111';
export const RWA_ASSET_SEED = 'rwa_asset';
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const SYSVAR_CLOCK = 'SysvarC1ock11111111111111111111111111111111';

export const AGENT_IDS = ['rwa-trader'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export type AgentService = {
  name: string;
  endpoint: string;
  version?: string;
  skills?: string[];
  domains?: string[];
};

export type AgentRegistrationLink = {
  agentId: string;
  agentRegistry: string;
};

export type Erc8004Registration = {
  type: typeof ERC8004_REGISTRATION_V1;
  name: string;
  description: string;
  image: string;
  services: AgentService[];
  active: boolean;
  registrations: AgentRegistrationLink[];
  supportedTrust: string[];
};

export type RwaAgent = {
  id: AgentId;
  name: string;
  description: string;
  image: string;
  coreUri: string;
  registration: Erc8004Registration;
};

export type AgentRwaPairing = {
  agentAsset: string;
  agentIdentity: string;
  assetSigner: string;
  rwaAsset: string;
  rwaAssetId: string;
  rwaMint?: string;
  agentToken?: string;
  agentTokenBound: boolean;
};

export type GenesisLaunchPayload = {
  wallet: string;
  agent: {
    mint: string;
    setToken: boolean;
  };
  launchType: 'bondingCurve';
  token: GenesisTokenInput;
  launch: Record<string, unknown>;
  network?: string;
};

export type GenesisTokenInput = {
  name: string;
  symbol: string;
  image: string;
  description?: string;
  externalLinks?: {
    website?: string;
    twitter?: string;
    telegram?: string;
  };
};

export type RwaTransferOwnershipPlan = {
  programId: string;
  instruction: 'transfer_ownership';
  accounts: {
    asset: string;
    from: string;
    fromTokenAccount: string;
    toTokenAccount: string;
    mint: string;
    tokenProgram: string;
    clock: string;
  };
  amount: number | bigint;
};
