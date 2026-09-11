import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import {
  AGENT_IDS,
  ERC8004_REGISTRATION_V1,
  GENESIS_LAUNCH_URL,
  bindAgentToken,
  buildCreateFungibleAndMint,
  buildDelegateExecution,
  buildMintMore,
  buildRegisterExecutive,
  buildRegisterIdentity,
  buildRevokeExecution,
  buildRwaTransferOwnership,
  buildSetAgentToken,
  buildTransferTokens,
  buildUpdateMetadata,
  createAgentUmiWithIdentity,
  deriveAgentIdentityPda,
  deriveAssetSignerPda,
  findAgentIdentityV1Pda,
  findAssetSignerPda,
  getAgent,
  instructionPubkeys,
  listAgents,
  pairAgentWithRwa,
  PairingRegistry,
  rwaTraderAgent,
  runPairAndLaunchDryRun,
  shapeCreateAndRegisterLaunch,
  submitGenesisLaunch,
  defaultAgentToken,
} from '../agents';

const WSOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SYSTEM = '11111111111111111111111111111111';

test('catalog agent emits EIP-8004 registration-v1', () => {
  const agents = listAgents();
  assert.equal(agents.length, 1);
  assert.deepEqual(
    agents.map((a) => a.id),
    [...AGENT_IDS],
  );
  const agent = getAgent('rwa-trader');
  assert.equal(agent.registration.type, ERC8004_REGISTRATION_V1);
  assert.equal(rwaTraderAgent().registration.type, 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
  assert.ok(agent.registration.services.some((s) => s.name === 'MCP'));
  assert.ok(agent.registration.registrations.some((r) => r.agentRegistry === 'solana:101:metaplex'));
});

test('identity and Asset Signer PDAs are derived via the SDK and are distinct', () => {
  const umi = createAgentUmiWithIdentity();
  const asset = publicKey(WSOL);
  const identity = deriveAgentIdentityPda(umi, asset);
  const signer = deriveAssetSignerPda(umi, asset);
  assert.deepEqual(identity, findAgentIdentityV1Pda(umi, { asset }));
  assert.deepEqual(signer, findAssetSignerPda(umi, { asset }));
  assert.notEqual(String(identity[0]), String(asset));
  assert.notEqual(String(signer[0]), String(asset));
  assert.notEqual(String(identity[0]), String(signer[0]));
});

test('registerIdentity / registerExecutive / delegateExecution / revokeExecution builders include asset and PDAs', () => {
  const umi = createAgentUmiWithIdentity();
  const asset = generateSigner(umi).publicKey;
  const executive = generateSigner(umi).publicKey;

  const identityIx = buildRegisterIdentity(umi, {
    asset,
    agentRegistrationUri: rwaTraderAgent().coreUri,
  });
  assert.ok(identityIx.getInstructions().length >= 1);
  const identityKeys = identityIx.getInstructions()[0].keys.map((k) => String(k.pubkey));
  assert.ok(identityKeys.includes(String(asset)));

  const execIx = buildRegisterExecutive(umi, {});
  assert.ok(execIx.getInstructions().length >= 1);

  const delegated = buildDelegateExecution(umi, { agentAsset: asset, executiveAuthority: executive });
  assert.ok(delegated.builder.getInstructions().length >= 1);
  const delKeys = delegated.builder.getInstructions()[0].keys.map((k) => String(k.pubkey));
  assert.ok(delKeys.includes(String(asset)));
  assert.ok(delKeys.includes(String(delegated.agentIdentity[0])));
  assert.ok(delKeys.includes(String(delegated.executiveProfile[0])));
  assert.deepEqual(delegated.agentIdentity, findAgentIdentityV1Pda(umi, { asset }));

  const revoked = buildRevokeExecution(umi, { agentAsset: asset, executiveAuthority: executive });
  assert.ok(revoked.builder.getInstructions().length >= 1);
  const revKeys = revoked.builder.getInstructions()[0].keys.map((k) => String(k.pubkey));
  assert.ok(revKeys.includes(String(asset)));
  assert.ok(revKeys.includes(String(revoked.executionDelegateRecord[0])));
});

test('pairing stores agent asset, Asset Signer, and RWA asset/mint and is consumed by launch/trade', () => {
  const umi = createAgentUmiWithIdentity();
  const agentAsset = generateSigner(umi).publicKey;
  const rwaAsset = generateSigner(umi).publicKey;
  const rwaId = generateSigner(umi).publicKey;
  const registry = new PairingRegistry();
  const pairing = pairAgentWithRwa(umi, {
    agentAsset,
    rwaAsset,
    rwaAssetId: rwaId,
    rwaMint: USDC,
    registry,
  });

  const signer = deriveAssetSignerPda(umi, agentAsset);
  const identity = deriveAgentIdentityPda(umi, agentAsset);
  assert.equal(pairing.agentAsset, String(agentAsset));
  assert.equal(pairing.assetSigner, String(signer[0]));
  assert.equal(pairing.agentIdentity, String(identity[0]));
  assert.equal(pairing.rwaAsset, String(rwaAsset));
  assert.equal(pairing.rwaMint, USDC);
  assert.equal(pairing.agentTokenBound, false);
  assert.equal(registry.getByRwa(pairing.rwaAsset)?.agentAsset, pairing.agentAsset);

  const payload = shapeCreateAndRegisterLaunch(pairing, defaultAgentToken(pairing));
  assert.equal(payload.agent.mint, pairing.agentAsset);
  assert.equal(payload.wallet, pairing.assetSigner);

  const transfer = buildRwaTransferOwnership(umi, pairing, {
    destinationOwner: SYSTEM,
    amount: 10,
  });
  assert.equal(transfer.accounts.from, pairing.assetSigner);
  assert.equal(transfer.accounts.asset, pairing.rwaAsset);
  assert.equal(transfer.accounts.mint, pairing.rwaMint);
});

test('pairing is one agent per RWA asset unless replaced', () => {
  const umi = createAgentUmiWithIdentity();
  const registry = new PairingRegistry();
  const rwaAsset = generateSigner(umi).publicKey;
  const rwaId = generateSigner(umi).publicKey;
  const first = pairAgentWithRwa(umi, {
    agentAsset: generateSigner(umi).publicKey,
    rwaAsset,
    rwaAssetId: rwaId,
    registry,
  });
  assert.throws(
    () =>
      pairAgentWithRwa(umi, {
        agentAsset: generateSigner(umi).publicKey,
        rwaAsset,
        rwaAssetId: rwaId,
        registry,
      }),
    /already paired/,
  );
  assert.throws(
    () =>
      pairAgentWithRwa(umi, {
        agentAsset: generateSigner(umi).publicKey,
        rwaAsset,
        rwaAssetId: rwaId,
        registry,
        replace: false,
      }),
    /already paired/,
  );
  const second = pairAgentWithRwa(umi, {
    agentAsset: generateSigner(umi).publicKey,
    rwaAsset,
    rwaAssetId: rwaId,
    registry,
    replace: true,
  });
  assert.notEqual(second.agentAsset, first.agentAsset);
  assert.equal(registry.getByRwa(String(rwaAsset))?.agentAsset, second.agentAsset);
});

test('replacing a pairing drops the old agent so bindAgentToken cannot resurrect it', () => {
  const umi = createAgentUmiWithIdentity();
  const registry = new PairingRegistry();
  const rwaX = generateSigner(umi).publicKey;
  const rwaY = generateSigner(umi).publicKey;
  const rwaIdX = generateSigner(umi).publicKey;
  const rwaIdY = generateSigner(umi).publicKey;
  const agentA = generateSigner(umi).publicKey;
  const agentB = generateSigner(umi).publicKey;

  const first = pairAgentWithRwa(umi, {
    agentAsset: agentA,
    rwaAsset: rwaX,
    rwaAssetId: rwaIdX,
    registry,
  });
  pairAgentWithRwa(umi, {
    agentAsset: agentB,
    rwaAsset: rwaY,
    rwaAssetId: rwaIdY,
    registry,
  });
  const replacement = pairAgentWithRwa(umi, {
    agentAsset: agentB,
    rwaAsset: rwaX,
    rwaAssetId: rwaIdX,
    registry,
    replace: true,
  });

  assert.equal(registry.getByRwa(String(rwaX))?.agentAsset, replacement.agentAsset);
  assert.equal(registry.getByAgent(String(agentB))?.rwaAsset, String(rwaX));
  assert.equal(registry.getByAgent(String(agentA)), undefined);
  assert.equal(registry.getByRwa(String(rwaY)), undefined);
  assert.throws(() => registry.bindAgentToken(first.agentAsset, USDC), /No pairing for agent/);
  assert.equal(registry.getByRwa(String(rwaX))?.agentAsset, String(agentB));
});

test('Genesis payload is bondingCurve with agent.setToken true and HTTP is injectable', async () => {
  const umi = createAgentUmiWithIdentity();
  const pairing = pairAgentWithRwa(umi, {
    agentAsset: generateSigner(umi).publicKey,
    rwaAsset: generateSigner(umi).publicKey,
    rwaAssetId: generateSigner(umi).publicKey,
    rwaMint: USDC,
  });
  const payload = shapeCreateAndRegisterLaunch(pairing, {
    name: 'Agent Token',
    symbol: 'AGT',
    image: 'https://gateway.irys.xyz/test-image',
  });
  assert.equal(payload.launchType, 'bondingCurve');
  assert.equal(payload.agent.setToken, true);
  assert.equal(payload.agent.mint, pairing.agentAsset);

  const calls: string[] = [];
  const http = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body || '{}'));
    assert.equal(body.launchType, 'bondingCurve');
    assert.equal(body.agent.setToken, true);
    return new Response(JSON.stringify({ ok: true, mintAddress: USDC }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const dry = await submitGenesisLaunch(payload, { fetch: http, execute: false });
  assert.equal(dry.submitted, false);
  assert.equal(calls.length, 0);

  const live = await submitGenesisLaunch(payload, { fetch: http, execute: true });
  assert.equal(live.submitted, true);
  assert.equal(calls[0], GENESIS_LAUNCH_URL);
});

test('second setToken bind on the same agent is rejected', () => {
  const umi = createAgentUmiWithIdentity();
  const registry = new PairingRegistry();
  const pairing = pairAgentWithRwa(umi, {
    agentAsset: generateSigner(umi).publicKey,
    rwaAsset: generateSigner(umi).publicKey,
    rwaAssetId: generateSigner(umi).publicKey,
    registry,
  });
  const bound = bindAgentToken(pairing, USDC);
  assert.equal(bound.agentTokenBound, true);
  assert.throws(() => bindAgentToken(bound, WSOL), /irreversible/);
  registry.pair(bound);
  assert.throws(() => registry.bindAgentToken(bound.agentAsset, WSOL), /irreversible/);
  assert.throws(
    () => shapeCreateAndRegisterLaunch(bound, defaultAgentToken(bound), { setToken: true }),
    /irreversible/,
  );
  assert.throws(
    () => buildSetAgentToken(umi, bound, generateSigner(umi).publicKey),
    /irreversible/,
  );
});

test('setAgentTokenV1 builder wraps Asset Signer as authority', () => {
  const umi = createAgentUmiWithIdentity();
  const pairing = pairAgentWithRwa(umi, {
    agentAsset: generateSigner(umi).publicKey,
    rwaAsset: generateSigner(umi).publicKey,
    rwaAssetId: generateSigner(umi).publicKey,
  });
  const genesisAccount = generateSigner(umi).publicKey;
  const built = buildSetAgentToken(umi, pairing, genesisAccount);
  assert.ok(built.builder.getInstructions().length >= 1);
  const keys = instructionPubkeys(built.builder);
  assert.ok(keys.includes(pairing.agentAsset));
  assert.equal(String(built.assetSigner), pairing.assetSigner);
});

test('createFungible, mint, transfer, and update builders include mint and destination ATA', () => {
  const umi = createAgentUmiWithIdentity();
  const pairing = pairAgentWithRwa(umi, {
    agentAsset: generateSigner(umi).publicKey,
    rwaAsset: generateSigner(umi).publicKey,
    rwaAssetId: generateSigner(umi).publicKey,
    rwaMint: USDC,
  });

  const created = buildCreateFungibleAndMint(umi, pairing, {
    name: 'RWA Fraction',
    symbol: 'RWAF',
    uri: 'https://example.com/rwa.json',
    decimals: 9,
    amount: 1_000_000_000,
  });
  const createKeys = instructionPubkeys(created.builder);
  assert.ok(createKeys.includes(String(created.mint.publicKey)));
  assert.ok(createKeys.includes(String(created.token[0])));
  assert.equal(String(created.owner), pairing.assetSigner);

  const minted = buildMintMore(umi, pairing, {
    mint: USDC,
    destinationOwner: SYSTEM,
    amount: 100,
  });
  const mintKeys = instructionPubkeys(minted.builder);
  assert.ok(mintKeys.includes(String(minted.mint)));
  assert.ok(mintKeys.includes(String(minted.token[0])));

  const transferred = buildTransferTokens(umi, pairing, {
    mint: USDC,
    destinationOwner: SYSTEM,
    amount: 50,
  });
  const xferKeys = instructionPubkeys(transferred.builder);
  assert.ok(xferKeys.includes(String(transferred.mint)));
  assert.ok(xferKeys.includes(String(transferred.destination[0])));
  assert.ok(xferKeys.includes(String(transferred.source[0])));

  const updated = buildUpdateMetadata(umi, pairing, {
    mint: USDC,
    name: 'Updated Token Name',
    symbol: 'UTN',
    uri: 'https://example.com/updated-metadata.json',
  });
  const updateKeys = instructionPubkeys(updated.builder);
  assert.ok(updateKeys.includes(String(updated.mint)));
});

test('RWA transfer_ownership uses the paired Asset Signer as from', () => {
  const umi = createAgentUmiWithIdentity();
  const pairing = pairAgentWithRwa(umi, {
    agentAsset: generateSigner(umi).publicKey,
    rwaAsset: generateSigner(umi).publicKey,
    rwaAssetId: generateSigner(umi).publicKey,
    rwaMint: USDC,
  });
  const plan = buildRwaTransferOwnership(umi, pairing, {
    destinationOwner: SYSTEM,
    amount: 7,
  });
  assert.equal(plan.instruction, 'transfer_ownership');
  assert.equal(plan.accounts.from, pairing.assetSigner);
  assert.equal(plan.accounts.asset, pairing.rwaAsset);
  assert.equal(plan.accounts.mint, USDC);
  assert.notEqual(plan.accounts.fromTokenAccount, plan.accounts.toTokenAccount);
});

test('dry-run entry prints EIP-8004 type, paired RWA id, bondingCurve, setToken, and mint/transfer', () => {
  const chunks: string[] = [];
  const text = runPairAndLaunchDryRun({
    stdout: { write: (chunk) => chunks.push(String(chunk)) },
  });
  assert.equal(text, chunks.join(''));
  assert.match(text, /https:\/\/eips\.ethereum\.org\/EIPS\/eip-8004#registration-v1/);
  assert.match(text, /Paired RWA asset id:/);
  assert.match(text, /bondingCurve/);
  assert.match(text, /setToken/);
  assert.match(text, /"action": "mint"/);
  assert.match(text, /"action": "transfer"/);
  assert.match(text, /transfer_ownership/);
});
