import { Connection, PublicKey } from '@solana/web3.js';
import { defaultRpcUrl } from './umi';

export function createQuicknodeConnection(env: NodeJS.ProcessEnv = process.env): Connection {
  const rpc = defaultRpcUrl(env);
  const ws = env.WSS_URL || env.WEBSOCKET_URL || rpc.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  if (!/^wss?:\/\//.test(ws)) throw new Error('WSS_URL must be a WebSocket URL; use QUICKNODE_WEBHOOK_URL for HTTPS callbacks');
  return new Connection(rpc, { commitment: 'confirmed', wsEndpoint: ws });
}

export interface MetisRequest {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}

// Returns quotes or unsigned transactions. Wallet authorization stays with the caller.
export async function requestMetis(input: MetisRequest, userPublicKey?: string,
  env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): Promise<Record<string, unknown>> {
  new PublicKey(input.inputMint); new PublicKey(input.outputMint);
  if (userPublicKey) new PublicKey(userPublicKey);
  if (input.inputMint === input.outputMint || !/^[1-9]\d{0,19}$/.test(input.amount)
    || BigInt(input.amount) > 18446744073709551615n) throw new Error('Invalid swap amount or mints');
  const slippageBps = input.slippageBps ?? 50;
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10000) throw new Error('Invalid slippage');
  const direct = Boolean(env.QUICKNODE_METIS_URL);
  const base = new URL(env.QUICKNODE_METIS_URL || env.MUSEBOOK_API_URL || 'https://musebook.trade');
  if (base.protocol !== 'https:') throw new Error('Metis requires HTTPS');
  const prefix = base.href.replace(/\/$/, '') + (direct ? '' : '/api/quicknode/metis');
  const params = new URLSearchParams({ ...input, slippageBps: String(slippageBps), swapMode: 'ExactIn' });
  const call = async (url: string, body?: unknown): Promise<Record<string, unknown>> => {
    let response: Response;
    try { response = await transport(url, { method: body ? 'POST' : 'GET',
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error('Metis provider request failed'); }
    if (!response.ok) throw new Error(`Metis unavailable (HTTP ${response.status}); check add-on configuration`);
    try { return await response.json() as Record<string, unknown>; }
    catch { throw new Error('Invalid Metis response'); }
  };
  const result = !direct && userPublicKey
    ? await call(prefix + '/swap', { ...input, slippageBps, userPublicKey })
    : await call(prefix + '/quote?' + params);
  const quote = (direct ? result : result.quote) as Record<string, unknown>;
  if (!quote || quote.inputMint !== input.inputMint || quote.outputMint !== input.outputMint
    || quote.inAmount !== input.amount || !/^[1-9]\d*$/.test(String(quote.outAmount))
    || quote.swapMode !== 'ExactIn') throw new Error('Invalid Metis quote');
  if (!userPublicKey) return direct ? { quote, source: 'quicknode-metis' } : result;
  if (!direct) {
    if (typeof result.swapTransaction !== 'string' || !result.swapTransaction) throw new Error('Invalid Metis transaction');
    return { ...result, requiresWalletSignature: true };
  }
  const transaction = await call(prefix + '/swap', { quoteResponse: quote, userPublicKey,
    wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true });
  if (typeof transaction.swapTransaction !== 'string' || !transaction.swapTransaction) throw new Error('Invalid Metis transaction');
  return { ...transaction, quote, requiresWalletSignature: true };
}
