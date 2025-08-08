"use server";
import { auth } from "@clerk/nextjs/server";

export async function ensureOrganization(): Promise<{ created: boolean; organizationId?: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/onboarding`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Onboarding failed: ${res.status}`);
  const data = (await res.json()) as { status: string; organizationId?: string };
  return { created: data.status === "created", organizationId: data.organizationId };
}


