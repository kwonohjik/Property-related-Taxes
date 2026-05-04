"use client";

import { useState } from "react";
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
 * - 세무사 모드 + activeClientId 있음: children 렌더
 * 의뢰인 배너는 헤더(HeaderClientBanner)에서 전역 표시.
 */
export function ProfessionalClientGate({ children }: Props) {
  const { mode, loading } = useUserProfile();
  const { activeClientId } = useProfessionalStore();
  // 사용자가 ClientSelectStep에서 의뢰인을 선택했는지 여부 (내부 게이트 제어용)
  const [userClicked, setUserClicked] = useState(false);
  // manualPassed는 (사용자 선택) && (선택한 의뢰인이 유효)로 도출
  // activeClientId가 null이 되면(헤더 "변경" 클릭) 자동으로 false가 됨
  const manualPassed = userClicked && !!activeClientId;

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
        <ClientSelectStep onNext={() => setUserClicked(true)} />
      </div>
    );
  }

  return <>{children}</>;
}
