"use node";

import { createHash, createHmac, randomBytes } from "node:crypto";

export type DrawProof = {
  revealedSeed: string;
  seedHash?: string;
  blockHash: string;
  entrantDigests: string[];
  hmacDigest: string;
  winningIndex: number;
};

const HEX_DIGEST_PATTERN = /^[0-9a-f]{1,2048}$/;
const HEX_64_PATTERN = /^[0-9a-f]{64}$/;
const LIMIT_256 = BigInt(
  "115792089237316195423570985008687907853269984665640564039457584007913129639936",
);

function assertHex(value: string, label: string): void {
  if (!HEX_DIGEST_PATTERN.test(value)) {
    throw new TypeError(
      label + " must be non-empty lowercase hexadecimal no longer than 1024 bytes.",
    );
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function drawHmac(
  revealedSeed: string,
  blockHash: string,
  entrantDigests: readonly string[],
  nonce?: bigint,
): string {
  let message = blockHash + ":" + [...entrantDigests].join(",");
  if (nonce !== undefined) message += ":" + nonce.toString(16);
  return createHmac("sha256", revealedSeed)
    .update(message, "utf8")
    .digest("hex");
}

function unbiasedIndex(
  initialDigest: string,
  count: number,
  revealedSeed: string,
  blockHash: string,
  entrantDigests: readonly string[],
): { index: number; hmacDigest: string } {
  const usableRange = LIMIT_256 - LIMIT_256 % BigInt(count);
  let digest = initialDigest;
  let nonce = BigInt(0);
  while (true) {
    const value = BigInt("0x" + digest);
    if (value < usableRange) {
      return { index: Number(value % BigInt(count)), hmacDigest: digest };
    }
    nonce += BigInt(1);
    digest = drawHmac(revealedSeed, blockHash, entrantDigests, nonce);
  }
}

export function generateSeed(): { seed: string; seedHash: string } {
  const seed = randomBytes(32).toString("hex");
  return { seed, seedHash: sha256Hex(seed) };
}

export function computeWinner(input: {
  revealedSeed: string;
  expectedSeedHash?: string;
  blockHash: string;
  entrantDigests: string[];
}): DrawProof {
  assertHex(input.revealedSeed, "revealedSeed");
  assertHex(input.blockHash, "blockHash");
  if (!input.entrantDigests.length) {
    throw new TypeError("entrantDigests must be a non-empty array.");
  }
  if (new Set(input.entrantDigests).size !== input.entrantDigests.length) {
    throw new TypeError("entrantDigests must not contain duplicates.");
  }
  for (const digest of input.entrantDigests) assertHex(digest, "each entrantDigest");

  const seedHash = sha256Hex(input.revealedSeed);
  if (
    input.expectedSeedHash !== undefined &&
    input.expectedSeedHash.toLowerCase() !== seedHash
  ) {
    throw new TypeError("revealedSeed does not match the committed seedHash.");
  }

  const entrantDigests = [...input.entrantDigests].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const initialDigest = drawHmac(input.revealedSeed, input.blockHash, entrantDigests);
  const selected = unbiasedIndex(
    initialDigest,
    entrantDigests.length,
    input.revealedSeed,
    input.blockHash,
    entrantDigests,
  );
  const proof: DrawProof = {
    revealedSeed: input.revealedSeed,
    blockHash: input.blockHash,
    entrantDigests,
    hmacDigest: selected.hmacDigest,
    winningIndex: selected.index,
  };
  if (input.expectedSeedHash !== undefined) {
    proof.seedHash = input.expectedSeedHash.toLowerCase();
  }
  return proof;
}

export function verifyProof(proof: DrawProof): boolean {
  try {
    if (
      !proof ||
      typeof proof.revealedSeed !== "string" ||
      typeof proof.blockHash !== "string" ||
      typeof proof.hmacDigest !== "string" ||
      !Number.isSafeInteger(proof.winningIndex) ||
      proof.winningIndex < 0 ||
      !Array.isArray(proof.entrantDigests) ||
      proof.entrantDigests.length === 0
    ) {
      return false;
    }
    assertHex(proof.revealedSeed, "revealedSeed");
    assertHex(proof.blockHash, "blockHash");
    assertHex(proof.hmacDigest, "hmacDigest");
    if (new Set(proof.entrantDigests).size !== proof.entrantDigests.length) return false;
    for (const digest of proof.entrantDigests) assertHex(digest, "each entrantDigest");
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
    if (expectedDigest !== proof.hmacDigest) return false;
    const usableRange =
      LIMIT_256 - LIMIT_256 % BigInt(proof.entrantDigests.length);
    const value = BigInt("0x" + expectedDigest);
    if (value >= usableRange) return false;
    return (
      value % BigInt(proof.entrantDigests.length) === BigInt(proof.winningIndex)
    );
  } catch {
    return false;
  }
}
