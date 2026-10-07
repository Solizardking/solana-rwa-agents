import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuicknodeConnection, requestMetis } from '../agents/quicknode';
const input = { inputMint: 'So11111111111111111111111111111111111111112', outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: '1000000' };
test('HTTP callback cannot be used as WebSocket transport', () => {
  assert.throws(() => createQuicknodeConnection({ RPC_URL: 'https://example.com', WSS_URL: 'https://musebook.trade/webhook/quick' }), /WebSocket/);
});
test('Metis rejects mismatched quotes and redacts provider errors', async () => {
  await assert.rejects(requestMetis(input, undefined, { QUICKNODE_METIS_URL: 'https://example.com/secret' },
    async () => Response.json({ ...input, inAmount: '99', outAmount: '10', swapMode: 'ExactIn' })), /Invalid Metis quote/);
  await assert.rejects(requestMetis(input, undefined, { QUICKNODE_METIS_URL: 'https://example.com/secret' },
    async () => { throw new Error('https://example.com/secret'); }), { message: 'Metis provider request failed' });
});
test('Metis builds an unsigned transaction with a validated quote', async () => {
  const bodies: unknown[] = [];
  const result = await requestMetis(input, input.inputMint, { QUICKNODE_METIS_URL: 'https://example.com/addon' }, async (_url, init) => {
    if (init?.body) { bodies.push(JSON.parse(String(init.body))); return Response.json({ swapTransaction: 'unsigned' }); }
    return Response.json({ ...input, inAmount: input.amount, outAmount: '10', swapMode: 'ExactIn' });
  });
  assert.equal(result.requiresWalletSignature, true);
  assert.equal(bodies.length, 1);
});
test('Musebook proxy swaps validate quotes and require wallet authorization', async () => {
  const env = { MUSEBOOK_API_URL: 'https://musebook.trade' };
  await assert.rejects(requestMetis(input, input.inputMint, env, async () => Response.json({
    quote: { ...input, inAmount: '99', outAmount: '10', swapMode: 'ExactIn' }, swapTransaction: 'unsigned',
  })), /Invalid Metis quote/);
  await assert.rejects(requestMetis(input, input.inputMint, env, async () => Response.json({
    quote: { ...input, inAmount: input.amount, outAmount: '10', swapMode: 'ExactIn' },
  })), /Invalid Metis transaction/);
  const result = await requestMetis(input, input.inputMint, env, async () => Response.json({
    quote: { ...input, inAmount: input.amount, outAmount: '10', swapMode: 'ExactIn' },
    swapTransaction: 'unsigned', requiresWalletSignature: false,
  }));
  assert.equal(result.requiresWalletSignature, true);
});
