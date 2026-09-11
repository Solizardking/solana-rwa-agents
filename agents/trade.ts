import {
  createTokenIfMissing,
  findAssociatedTokenPda,
  mintTokensTo,
  transferTokens,
} from '@metaplex-foundation/mpl-toolbox';
import { createFungible, updateV1 } from '@metaplex-foundation/mpl-token-metadata';
import {
  createNoopSigner,
  generateSigner,
  none,
  percentAmount,
  PublicKey,
  Signer,
  some,
  TransactionBuilder,
  transactionBuilder,
  Umi,
} from '@metaplex-foundation/umi';
import { asPublicKey, AssetRef, pdaAddress } from './identity';
import { requirePairingMint } from './pairing';
import {
  AgentRwaPairing,
  RWA_PROGRAM_ID,
  RwaTransferOwnershipPlan,
  SYSVAR_CLOCK,
  TOKEN_PROGRAM_ID,
} from './types';

export function assetSignerKey(pairing: AgentRwaPairing): PublicKey {
  return asPublicKey(pairing.assetSigner);
}

export function pairingMintAta(umi: Umi, pairing: AgentRwaPairing, mint: AssetRef) {
  return findAssociatedTokenPda(umi, {
    mint: asPublicKey(mint),
    owner: assetSignerKey(pairing),
  });
}

export function buildCreateFungibleAndMint(
  umi: Umi,
  pairing: AgentRwaPairing,
  input: {
    name: string;
    symbol: string;
    uri: string;
    decimals?: number;
    amount: number | bigint;
    mint?: Signer;
  },
): {
  builder: TransactionBuilder;
  mint: Signer;
  token: ReturnType<typeof findAssociatedTokenPda>;
  owner: PublicKey;
} {
  const mint = input.mint ?? generateSigner(umi);
  const owner = assetSignerKey(pairing);
  const token = findAssociatedTokenPda(umi, { mint: mint.publicKey, owner });
  const builder = createFungible(umi, {
    mint,
    name: input.name,
    symbol: input.symbol,
    uri: input.uri,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: some(input.decimals ?? 9),
  })
    .add(
      createTokenIfMissing(umi, {
        mint: mint.publicKey,
        owner,
      }),
    )
    .add(
      mintTokensTo(umi, {
        mint: mint.publicKey,
        token,
        amount: input.amount,
      }),
    );
  return { builder, mint, token, owner };
}

export function buildMintMore(
  umi: Umi,
  pairing: AgentRwaPairing,
  input: {
    mint: AssetRef;
    destinationOwner?: AssetRef;
    amount: number | bigint;
  },
): {
  builder: TransactionBuilder;
  token: ReturnType<typeof findAssociatedTokenPda>;
  mint: PublicKey;
} {
  const mint = asPublicKey(input.mint);
  const owner = input.destinationOwner ? asPublicKey(input.destinationOwner) : assetSignerKey(pairing);
  const token = findAssociatedTokenPda(umi, { mint, owner });
  const builder = transactionBuilder()
    .add(
      createTokenIfMissing(umi, {
        mint,
        owner,
      }),
    )
    .add(
      mintTokensTo(umi, {
        mint,
        token,
        amount: input.amount,
      }),
    );
  return { builder, token, mint };
}

export function buildTransferTokens(
  umi: Umi,
  pairing: AgentRwaPairing,
  input: {
    mint?: AssetRef;
    destinationOwner: AssetRef;
    amount: number | bigint;
  },
): {
  builder: TransactionBuilder;
  source: ReturnType<typeof findAssociatedTokenPda>;
  destination: ReturnType<typeof findAssociatedTokenPda>;
  mint: PublicKey;
} {
  const mint = asPublicKey(input.mint ?? requirePairingMint(pairing));
  const sourceOwner = assetSignerKey(pairing);
  const destOwner = asPublicKey(input.destinationOwner);
  const source = findAssociatedTokenPda(umi, { mint, owner: sourceOwner });
  const destination = findAssociatedTokenPda(umi, { mint, owner: destOwner });
  const builder = transactionBuilder()
    .add(
      createTokenIfMissing(umi, {
        mint,
        owner: destOwner,
      }),
    )
    .add(
      transferTokens(umi, {
        source,
        destination,
        amount: input.amount,
        authority: createNoopSigner(sourceOwner),
      }),
    );
  return { builder, source, destination, mint };
}

export function buildUpdateMetadata(
  umi: Umi,
  pairing: AgentRwaPairing,
  input: {
    mint?: AssetRef;
    name: string;
    symbol: string;
    uri: string;
  },
): { builder: TransactionBuilder; mint: PublicKey } {
  const mint = asPublicKey(input.mint ?? requirePairingMint(pairing));
  const builder = updateV1(umi, {
    mint,
    authority: createNoopSigner(assetSignerKey(pairing)),
    data: {
      name: input.name,
      symbol: input.symbol,
      uri: input.uri,
      sellerFeeBasisPoints: 0,
      creators: none(),
    },
  });
  return { builder, mint };
}

export function buildRwaTransferOwnership(
  umi: Umi,
  pairing: AgentRwaPairing,
  input: {
    destinationOwner: AssetRef;
    amount: number | bigint;
    mint?: AssetRef;
  },
): RwaTransferOwnershipPlan {
  const mint = asPublicKey(input.mint ?? requirePairingMint(pairing));
  const from = assetSignerKey(pairing);
  const to = asPublicKey(input.destinationOwner);
  const fromTokenAccount = pairingMintAta(umi, pairing, mint);
  const toTokenAccount = findAssociatedTokenPda(umi, { mint, owner: to });
  return {
    programId: RWA_PROGRAM_ID,
    instruction: 'transfer_ownership',
    accounts: {
      asset: pairing.rwaAsset,
      from: pairing.assetSigner,
      fromTokenAccount: pdaAddress(fromTokenAccount),
      toTokenAccount: pdaAddress(toTokenAccount),
      mint: String(mint),
      tokenProgram: TOKEN_PROGRAM_ID,
      clock: SYSVAR_CLOCK,
    },
    amount: input.amount,
  };
}

export function instructionPubkeys(builder: TransactionBuilder): string[] {
  return builder.getInstructions().flatMap((ix) => ix.keys.map((key) => String(key.pubkey)));
}
