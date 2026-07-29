"use client";

/**
 * CommercialPre1990LandNotice — 상가 §164⑥ 경로에서 취득이 개별공시지가 고시 전인 경우 안내.
 *
 * §164⑥ 산식의 기준시가합 토지 성분은 「법 §99①1호 가목의 가액」(개별공시지가)이고
 * (시행규칙 §80③3호가 다목 자산 환산의 합계액을 "가목의 가액 + 나목의 가액"으로 명시),
 * 1990.8.30. 이전 취득이면 그 가액이 없어 §164④(토지등급 환산)가 이를 정한다.
 *
 * 검증: docs/01-plan/features/commercial-164-4-appurtenant-land-verification.md
 */

import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export function CommercialPre1990LandNotice({ acquisitionDate }: { acquisitionDate?: string }) {
  const year = acquisitionDate?.slice(0, 4);
  return (
    <ToneCard tone="amber" noDark className="mb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 시행령 §164 ④" label="§164④" />
      </div>
      <p className="text-xs text-amber-800">
        취득당시{year ? `(${year}년)` : ""} <b>개별공시지가가 없습니다</b> — 최초 고시일이 1990.8.30.
        입니다. §164⑥ 기준시가합의 토지 성분은 개별공시지가이므로, 아래 <b>토지등급 환산(§164④)</b>으로
        취득시 ㎡당 가액을 산정합니다.
      </p>
      <p className="text-caption text-amber-700">
        환산값은 아래 「취득시 개별공시지가」에 자동 반영됩니다. 직접 입력한 값이 있으면 그 값이 우선합니다.
      </p>
    </ToneCard>
  );
}
