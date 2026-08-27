import "server-only";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/src/lib/auth";

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    redirect("/login");
  }
  return user;
}
