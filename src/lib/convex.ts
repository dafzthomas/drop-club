import { ConvexHttpClient } from "convex/browser";

import { api } from "@/convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
}

export const convex = new ConvexHttpClient(convexUrl);
export { api };

export function requireConvexApiSecret(): string {
  const secret = process.env.CONVEX_API_SECRET;
  if (!secret) throw new Error("CONVEX_API_SECRET is not configured");
  return secret;
}
