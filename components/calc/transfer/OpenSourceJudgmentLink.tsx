"use client";

/**
 * 「원본 판정 열기」 (2026-11 리뷰 I-14) — 판정 메뉴에서 넘겨받은 사실을 고치라는 안내(「판정 메뉴로 돌아가 다시 판정하세요」)를 따라가면
 * 그 탭의 다른 물건이나 빈 폼이 열렸다. 출처 판정 record를 이력 재개 진입점(`resumeCalculationRecord`)으로 연다 — 재개가 두 메뉴 결과를 함께
 * 비운다(D-15). 다건 편집 화면에서는 숨긴다(결정 Q-12 — 그 화면을 떠나면 다건 편집 맥락이 끊긴다).
 */
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";

export const MULTI_TRANSFER_ROUTE_PREFIX = "/calc/transfer-tax/multi";

/** 출처 id는 단건 계산기 store에서 읽는다(카드마다 prop을 내려 보내지 않는다 — 다건 편집에서는 숨기므로 단건 store만 본다). */
export function OpenSourceJudgmentLink() {
  const sourceJudgmentId = useCalcWizardStore((s) => s.formData.sourceJudgmentId);
  const pathname = usePathname();
  if (!sourceJudgmentId || pathname?.startsWith(MULTI_TRANSFER_ROUTE_PREFIX)) return null;
  // 라우터는 링크를 그릴 때만 잡는다 — 출처 없는 카드(라우터 없는 렌더 포함)에서 useRouter를 부르지 않는다.
  return <OpenSourceJudgmentButton sourceJudgmentId={sourceJudgmentId} />;
}

function OpenSourceJudgmentButton({ sourceJudgmentId }: { sourceJudgmentId: string }) {
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  const open = async () => {
    const [{ calculationRepository }, { resumeCalculationRecord }] = await Promise.all([
      import("@/lib/storage/calculation-repository"),
      import("@/lib/calc/history-resume-entry"),
    ]);
    const rec = await calculationRepository.get(sourceJudgmentId).catch(() => null);
    if (!rec || rec.taxType !== "one_house_exemption") {
      setMissing(true);
      return;
    }
    await resumeCalculationRecord(rec, router);
  };

  return (
    <span className="inline-flex items-center gap-2 print:hidden">
      <Button type="button" variant="link" size="xs" className="h-auto p-0" data-testid="open-source-judgment" onClick={() => void open()}>
        원본 판정 열기 →
      </Button>
      {missing && (
        <span className="text-caption text-muted-foreground" data-testid="open-source-judgment-missing">
          원본 판정 기록을 찾지 못했습니다(지웠거나 다른 기기의 기록입니다).
        </span>
      )}
    </span>
  );
}
