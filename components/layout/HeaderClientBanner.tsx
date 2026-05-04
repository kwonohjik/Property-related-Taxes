"use client";

import { useEffect, useState } from "react";
import { useUserProfile } from "@/lib/storage/use-user-profile";
import { useProfessionalStore } from "@/lib/stores/professional-store";

export function HeaderClientBanner() {
  const { mode } = useUserProfile();
  const { activeClientId, clearActiveClient } = useProfessionalStore();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!activeClientId) {
      setName(null);
      return;
    }
    import("@/lib/storage/client-repository").then(({ clientRepository }) =>
      clientRepository.get(activeClientId).then((c) => setName(c?.name ?? null))
    );
  }, [activeClientId]);

  if (mode !== "professional" || !activeClientId || !name) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">의뢰인:</span>
      <span className="font-semibold text-primary">{name}</span>
      <button
        type="button"
        onClick={clearActiveClient}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        변경
      </button>
    </div>
  );
}
