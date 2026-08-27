export function assertServiceSecret(secret: string): void {
  const expected = process.env.CONVEX_API_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized Convex service request");
  }
}
