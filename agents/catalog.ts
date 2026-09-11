import {
  AGENT_IDS,
  AgentId,
  AgentService,
  ERC8004_REGISTRATION_V1,
  METAPLEX_AGENT_REGISTRY,
  RwaAgent,
} from './types';

export { AGENT_IDS };

const HOST = 'https://rwa.local/agents';

function discoveryServices(id: AgentId): AgentService[] {
  return [
    { name: 'web', endpoint: `${HOST}/${id}` },
    { name: 'A2A', endpoint: `${HOST}/${id}/agent-card.json`, version: '0.3.0' },
    {
      name: 'MCP',
      endpoint: `${HOST}/${id}/mcp`,
      version: '2025-06-18',
      skills: ['rwa-pair', 'rwa-trade', 'genesis-launch'],
      domains: ['rwa', 'solana'],
    },
  ];
}

export function rwaTraderAgent(): RwaAgent {
  const id: AgentId = 'rwa-trader';
  const name = 'RWA Pairing Trader';
  const description =
    'Pairs a Metaplex-registered AI agent with a tokenized real-world asset, launches a Genesis bonding-curve agent token, and trades fractional RWA ownership from the agent Asset Signer PDA.';
  const image = 'https://api.metaplex.com/static/agents/rwa-trader.png';
  const coreUri = 'https://api.metaplex.com/v1/agents/metadata/rwa-trader.json';
  return {
    id,
    name,
    description,
    image,
    coreUri,
    registration: {
      type: ERC8004_REGISTRATION_V1,
      name,
      description,
      image,
      services: discoveryServices(id),
      active: true,
      registrations: [{ agentId: id, agentRegistry: METAPLEX_AGENT_REGISTRY }],
      supportedTrust: ['reputation', 'crypto-economic'],
    },
  };
}

export function listAgents(): RwaAgent[] {
  return [rwaTraderAgent()];
}

export function getAgent(id: AgentId): RwaAgent {
  const found = listAgents().find((agent) => agent.id === id);
  if (!found) {
    throw new Error(`Unknown agent "${id}"`);
  }
  return found;
}
