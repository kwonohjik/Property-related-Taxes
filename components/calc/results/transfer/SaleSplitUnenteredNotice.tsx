"use client";

/**
 * «구분 기재를 골랐으나 양도가액 두 칸이 비어 안분했다» 결과 카드 안내 한 줄.
 *
 * 계획서: `docs/00-pm/sale-split-actual-both-empty.plan.md` §10.3 ① — `SaleSplitJudgmentBlock`(§100③ 30% 판정)이 서는 바로 그 자리에 선다.
 * 판정은 구분 기재가 **있을 때만** 뜨고 이 안내는 **없을 때만** 뜨므로 한 자리에 둘 중 하나만 보인다.
 *
 * 문장은 `sale-split-unentered-notice.ts`가 만든다(신고서 각주·상세명세서와 같은 함수) — 여기서 조립하지 않는다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";

export function SaleSplitUnenteredNotice({ text }: { text: string }) {
  return (
    // ⚠️ `ToneCard`는 `data-testid`를 DOM으로 흘리지 않는다 — 래퍼 div에 붙인다.
    <div data-testid="sale-split-unentered-notice">
      <ToneCard tone="amber" title={text} className="mt-1" />
    </div>
  );
}
