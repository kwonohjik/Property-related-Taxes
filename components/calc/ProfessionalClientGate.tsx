"use client";

import { useEffect, useState } from "react";
import { useUserProfile } from "@/lib/storage/use-user-profile";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { ClientSelectStep } from "./ClientSelectStep";

interface Props {
  children: React.ReactNode;
}

/**
 * 세무사 모드에서 계산기 진입 시 의뢰인 선택을 강제하는 게이트.
 * - 일반 납세자 모드: children 바로 렌더
 * - 세무사 모드 + activeClientId 없음: ClientSelectStep 표시
 * - 세무사 모드 + activeClientId 있음: children 렌더 (의뢰인 배너 포함)
 */
export function ProfessionalClientGate({ children }: Props) {
  const { mode, loading } = useUserProfile();
  const { activeClientId, clearActiveClient } = useProfessionalStore();
  const [manualPassed, setManualPassed] = useState(false);

  const passed =
    manualPassed ||
    !loading && mode !== "professional" ||
    !loading && mode === "professional" && !!activeClientId;

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
        불러오는 중...
      </div>
    );
  }

  // 세무사 모드, 의뢰인 미선택
  if (mode === "professional" && !activeClientId && !passed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <ClientSelectStep onNext={() => setManualPassed(true)} />
      </div>
    );
  }

  return (
    <>
      {mode === "professional" && activeClientId && (
        <ActiveClientBanner
          clientId={activeClientId}
          onClear={() => {
            clearActiveClient();
            setManualPassed(false);
          }}
        />
      )}
      {children}
    </>
  );
}

function ActiveClientBanner({ clientId, onClear }: { clientId: string; onClear: () => void }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    import("@/lib/storage/client-repository").then(({ clientRepository }) =>
      clientRepository.get(clientId).then((c) => setName(c?.name ?? null))
    );
  }, [clientId]);

  if (!name) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 mb-4 mx-auto max-w-3xl">
      <p className="text-sm">
        <span className="text-muted-foreground">의뢰인: </span>
        <span className="font-semibold text-primary">{name}</span>
      </p>
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        변경
      </button>
    </div>
  );
}
