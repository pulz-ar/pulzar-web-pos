"use client";
import { OrganizationList, useOrganizationList } from "@clerk/nextjs";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ensureOrganization } from "./actions";

export default function OnboardingPage() {
  const [loading, startTransition] = useTransition();
  const { setActive, isLoaded } = useOrganizationList();
  const router = useRouter();

  const handleAutoCreate = () => {
    startTransition(async () => {
      const res = await ensureOrganization();
      if (res.organizationId && isLoaded) {
        await setActive({ organization: res.organizationId });
      }
      router.push("/platform");
    });
  };

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-xl flex flex-col gap-6">
        <OrganizationList
          hidePersonal
          afterCreateOrganizationUrl="/platform"
          afterSelectOrganizationUrl="/platform"
        />
        <button
          onClick={handleAutoCreate}
          disabled={loading}
          className="px-4 py-2 border rounded"
        >
          {loading ? "Creando organización..." : "Crear organización automáticamente"}
        </button>
      </div>
    </main>
  );
}


