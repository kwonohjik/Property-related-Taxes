"use client";

/**
 * AuthMigrationListener — 비로그인 → 로그인 전환 시 pendingResult를 DB에 이관
 *
 * 루트 layout.tsx에 삽입. Supabase onAuthStateChange를 감지하여
 * zustand store의 result가 있으면 자동 저장 후 "이전 계산 결과가 저장되었습니다" 알림.
 */

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";

export function AuthMigrationListener() {
  const { result, formData, pendingMigration, clearPendingMigration } = useCalcWizardStore();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // 로그인 완료 이벤트 + 대기 이관 플래그가 있을 때만 실행
      if (
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
        session?.user &&
        pendingMigration &&
        result
      ) {
        try {
          const { migratePendingResult } = await import("@/actions/calculations");
          const saveResult = await migratePendingResult({
            taxType: "transfer",
            inputData: formData as unknown as Record<string, unknown>,
            resultData: result,
          });

          if (saveResult.success) {
            clearPendingMigration();
            // 간단한 알림 (toast 없이 console + alert 대신 DOM 이벤트)
            window.dispatchEvent(
              new CustomEvent("calc:migrated", { detail: { id: saveResult.id } }),
            );
          }
        } catch {
          // 이관 실패는 silent — 사용자에게 큰 영향 없음
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [result, formData, pendingMigration, clearPendingMigration]);

  return null;
}
