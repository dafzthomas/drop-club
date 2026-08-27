/**
 * Public API for Drop Club's provably fair draw.
 *
 * # Trust model
 *
 * A room publishes a SHA-256 commitment to a secret server seed before entries
 * open. The server cannot know or choose the future external block hash, and
 * it publishes an ordered list of opaque entrant digests before the draw. At
 * close, it reveals the committed seed, combines that seed with the external
 * block hash and canonically ordered entrant digests using HMAC-SHA256, then
 * converts the random output into an entrant index using rejection sampling.
 *
 * The seed commitment prevents changing the seed after seeing entries; the
 * block hash prevents choosing a convenient seed at close; canonical digest
 * ordering prevents changing entrant order after close; and rejection sampling
 * removes modulo bias. Anyone can replay {@link verifyProof} from the inputs
 * published in a {@link DrawProof}.
 *
 * @module
 *
 * Vendored verbatim from ../draw-engine/src/index because this Next/Turbopack
 * build cannot bundle files above the app root and the package manifest points
 * at an unbuilt dist directory. Keep this copy byte-for-byte in sync until the
 * package is linked or its dist build is wired up.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';

/** Lowercase hexadecimal representation of exactly 32 bytes. */
export type Hex32 = string;

/** Non-empty lowercase hexadecimal digest of at most 1024 bytes. */
export type EntrantDigest = string;

/** Published inputs and result needed to replay one winner selection. */
export interface DrawProof {
  /** Revealed pre-committed server seed. */
  revealedSeed: Hex32;
  /**
   * SHA-256 of revealedSeed. Proofs from generateSeed always contain this.
   * Verification checks it whenever it is present.
   */
  seedHash?: Hex32;
  /** External post-close block hash, already normalized by the caller. */
  blockHash: string;
  /** Entrant digests in their published deterministic order. */
  entrantDigests: EntrantDigest[];
  /** HMAC-SHA256 output as lowercase hexadecimal. */
  hmacDigest: Hex32;
  /** Zero-based index into entrantDigests. */
  winningIndex: number;
}

/** Inputs for computing a new draw result. */
export interface ComputeWinnerInput {
  /** Secret server seed revealed only after entry freeze. */
  revealedSeed: Hex32;
  /**
   * Optional commitment made before entries opened. When supplied, mismatch is
   * rejected rather than silently producing a draw.
   */
  expectedSeedHash?: Hex32;
  /** External block hash selected after close. */
  blockHash: string;
  /** Ordered opaque entrant identities or ticket digests. */
  entrantDigests: EntrantDigest[];
}

const HEX_64_PATTERN = /^[0-9a-f]{64}$/;
const HEX_DIGEST_PATTERN = /^[0-9a-f]{1,2048}$/;

function assertHex(value: string, label: string): void {
  if (!HEX_DIGEST_PATTERN.test(value)) {
    throw new TypeError(
      label + ' must be non-empty lowercase hexadecimal no longer than 1024 bytes.',
    );
  }
}

function sha256Hex(value: string): Hex32 {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const LIMIT_256 = BigInt(
  '115792089237316195423570985008687907853269984665640564039457584007913129639936',
);

function drawHmac(
  revealedSeed: Hex32,
  blockHash: string,
  sortedEntrantDigests: readonly string[],
  nonce?: bigint,
): Hex32 {
  let message = blockHash + ':' + [...sortedEntrantDigests].join(',');
  if (nonce !== undefined) {
    message += ':' + nonce.toString(16);
  }
  return createHmac('sha256', revealedSeed).update(message, 'utf8').digest('hex');
}

/**
 * Converts a full 256-bit HMAC value into an index below count without modulo
 * bias.
 *
 * A naive digest % count treats values in the final incomplete range more often
 * than values in earlier ranges. Instead, find the largest multiple of count
 * below 2^256, reject values at or above that boundary, and derive fresh HMAC
 * bytes for each retry by appending an integer retry nonce to the original
 * public message. Accepted values map uniformly onto count buckets because the
 * accepted range is an exact multiple of count.
 */
function unbiasedIndex(
  initialDigest: Hex32,
  count: number,
  revealedSeed: Hex32,
  blockHash: string,
  sortedEntrantDigests: readonly string[],
): { index: number; hmacDigest: Hex32 } {
  const limit = LIMIT_256;
  const usableRange = limit - (limit % BigInt(count));
  let digest = initialDigest;
  let nonce = BigInt(0);

  while (true) {
    const value = BigInt('0x' + digest);
    if (value < usableRange) {
      return { index: Number(value % BigInt(count)), hmacDigest: digest };
    }

    nonce += BigInt(1);
    digest = drawHmac(revealedSeed, blockHash, sortedEntrantDigests, nonce);
  }
}

/** Generates a new server seed and its publishable SHA-256 commitment. */
export function generateSeed(): { seed: Hex32; seedHash: Hex32 } {
  const seed = randomBytes(32).toString('hex');
  return { seed, seedHash: sha256Hex(seed) };
}

/**
 * Computes the winning entrant index and a proof that can be independently
 * replayed.
 *
 * Entrant digests are copied and lexicographically sorted before hashing, so a
 * caller cannot change fairness merely by supplying entries in a different
 * order. The returned proof records that canonical order.
 */
export function computeWinner(input: ComputeWinnerInput): DrawProof {
  const { revealedSeed, blockHash, entrantDigests } = input;

  assertHex(revealedSeed, 'revealedSeed');
  assertHex(blockHash, 'blockHash');
  if (!Array.isArray(entrantDigests) || entrantDigests.length === 0) {
    throw new TypeError('entrantDigests must be a non-empty array.');
  }
  if (new Set(entrantDigests).size !== entrantDigests.length) {
    throw new TypeError('entrantDigests must not contain duplicates.');
  }
  for (const entrantDigest of entrantDigests) {
    assertHex(entrantDigest, 'each entrantDigest');
  }

  const seedHash = sha256Hex(revealedSeed);
  if (
    input.expectedSeedHash !== undefined &&
    input.expectedSeedHash.toLowerCase() !== seedHash
  ) {
    throw new TypeError('revealedSeed does not match the committed seedHash.');
  }

  const sortedEntrantDigests = [...entrantDigests].sort((left, right) =>
    // Compare Unicode code units rather than using locale-sensitive ordering,
    // so every independent verifier computes the same canonical sequence.
    left < right ? -1 : left > right ? 1 : 0,
  );
  const initialDigest = drawHmac(revealedSeed, blockHash, sortedEntrantDigests);
  const { index, hmacDigest } = unbiasedIndex(
    initialDigest,
    entrantDigests.length,
    revealedSeed,
    blockHash,
    sortedEntrantDigests,
  );

  const proof: DrawProof = {
    revealedSeed,
    blockHash,
    entrantDigests: sortedEntrantDigests,
    hmacDigest,
    winningIndex: index,
  };
  if (input.expectedSeedHash !== undefined) {
    proof.seedHash = input.expectedSeedHash.toLowerCase();
  }
  return proof;
}

/**
 * Independently replays every field of a proof against its published inputs.
 *
 * Returns false when any value has been changed, when the optional commitment
 * does not match the revealed seed, or when the recorded winning index does not
 * point at the recomputed position.
 */
export function verifyProof(proof: DrawProof): boolean {
  try {
    if (
      !proof ||
      typeof proof !== 'object' ||
      typeof proof.revealedSeed !== 'string' ||
      typeof proof.blockHash !== 'string' ||
      typeof proof.hmacDigest !== 'string' ||
      typeof proof.winningIndex !== 'number' ||
      !Number.isSafeInteger(proof.winningIndex) ||
      proof.winningIndex < 0 ||
      !Array.isArray(proof.entrantDigests)
    ) {
      return false;
    }

    assertHex(proof.revealedSeed, 'revealedSeed');
    assertHex(proof.blockHash, 'blockHash');
    assertHex(proof.hmacDigest, 'hmacDigest');
    if (proof.entrantDigests.length === 0) return false;
    if (new Set(proof.entrantDigests).size !== proof.entrantDigests.length) {
      return false;
    }
    for (const entrantDigest of proof.entrantDigests) {
      assertHex(entrantDigest, 'each entrantDigest');
    }
    if (
      proof.seedHash !== undefined &&
      (!HEX_64_PATTERN.test(proof.seedHash) ||
        sha256Hex(proof.revealedSeed) !== proof.seedHash.toLowerCase())
    ) {
      return false;
    }

    const expectedDigest = drawHmac(
      proof.revealedSeed,
      proof.blockHash,
      proof.entrantDigests,
    );
    if (expectedDigest !== proof.hmacDigest) {
      return false;
    }

    // Replay the same rejection rule without trusting the recorded digest's
    // numeric interpretation.
    const limit = LIMIT_256;
    const usableRange = limit - (limit % BigInt(proof.entrantDigests.length));
    const value = BigInt('0x' + expectedDigest);
    if (value >= usableRange) {
      return false; // A valid proof would record the nonce-derived digest.
    }
    return value % BigInt(proof.entrantDigests.length) === BigInt(proof.winningIndex);
  } catch {
    return false;
  }
}
