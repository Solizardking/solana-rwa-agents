import './load-env.cjs';
import { createHmac, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const report = { checkedAt: new Date().toISOString(), checks: {} };
async function check(name, action) {
  try { report.checks[name] = await action(); }
  catch { report.checks[name] = { passed: false, error: 'Check failed; provider details withheld' }; }
  console.log(name, JSON.stringify(report.checks[name]));
}
await check('rpc', async () => {
  const r = await fetch(process.env.RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }), signal: AbortSignal.timeout(10000) });
  const data = await r.json(); return { passed: r.ok && Boolean(data.result?.value?.blockhash), slot: data.result?.context?.slot };
});
await check('websocket', () => new Promise(resolve => {
  const ws = new WebSocket(process.env.WSS_URL);
  const finish = result => { clearTimeout(timer); ws.close(); resolve(result); };
  const timer = setTimeout(() => finish({ passed: false }), 15000);
  ws.addEventListener('open', () => ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'slotSubscribe', params: [] })));
  ws.addEventListener('error', () => finish({ passed: false }));
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'slotNotification') finish({ passed: true, slot: data.params.result.slot });
  });
}));
await check('webhook', async () => {
  const url = process.env.QUICKNODE_WEBHOOK_URL;
  const body = JSON.stringify({ musebookVerification: true, source: 'solana-rwa-agents', id: randomUUID() });
  const nonce = randomUUID(), timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', process.env.SECURITY_TOKEN).update(nonce + timestamp + body).digest('hex');
  const options = { method: 'POST', headers: { 'content-type': 'application/json', 'x-qn-nonce': nonce,
    'x-qn-timestamp': timestamp, 'x-qn-signature': signature }, body, signal: AbortSignal.timeout(10000) };
  const first = await fetch(url, options), data = await first.json();
  const again = await fetch(url, options), duplicate = await again.json();
  const unsigned = await fetch(url, { method: 'POST', body: '{}' });
  return { passed: first.ok && data.received === true && duplicate.duplicate === true && unsigned.status === 401,
    synthetic: true, duplicateRejected: duplicate.duplicate === true, unsignedRejected: unsigned.status === 401 };
});
await check('metis', async () => {
  const base = process.env.QUICKNODE_METIS_URL || (process.env.MUSEBOOK_API_URL + '/api/quicknode/metis');
  const params = new URLSearchParams({ inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: '1000000', slippageBps: '50' });
  const r = await fetch(base.replace(/\/$/, '') + '/quote?' + params, { signal: AbortSignal.timeout(15000) });
  const data = await r.json(); const quote = data.quote || data;
  return { passed: r.ok && Boolean(quote.outAmount), status: r.status, endpointMode: process.env.QUICKNODE_METIS_URL === 'https://public.jupiterapi.com' ? 'public' : process.env.QUICKNODE_METIS_URL ? 'dedicated' : 'musebook-proxy' };
});
const status = await fetch(process.env.MUSEBOOK_API_URL + '/api/quicknode/status').then(r => r.json());
report.providerDeliveryVerified = Boolean(status.lastProviderDeliveryAt);
await writeFile(new URL('../docs/quicknode-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
if (Object.values(report.checks).some(result => !result.passed)) process.exitCode = 1;
