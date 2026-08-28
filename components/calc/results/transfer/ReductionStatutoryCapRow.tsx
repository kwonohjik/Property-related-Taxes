"use client";

/**
 * 조특법 §133 **5년 누적 한도**가 깎은 금액을 §77 계열 카드에 밝히는 행 — 공용 leaf.
 *
 * ## 왜 필요한가
 *
 * §77·§77의2·§77의3 detail의 `reductionAmount`는 **연간 한도까지만** 반영된 값이다.
 * 5년 누적 한도(STEP 8.5 `applyReductionStatutoryCap`)는 그 뒤에 한 번 더 깎는데, 그 결과를
 * detail에 되쓰는 코드가 하이브리드(§98·§99 계열)에만 있어 §77 계열 카드는 갱신되지 않았다.
 *
 * 실측(2025년 양도 · §77 · 2023년 공익수용 250,000,000 사용 이력):
 *   카드 마지막 줄 65,540,250 · 요약·신고서의 감면세액 50,000,000
 *   → 15,540,250 차이가 아무 설명 없이 남았다. `cappedByAnnualLimit`은 false라
 *     「한도 적용」 블록조차 뜨지 않았다(결과탭 코드리뷰 #046).
 *
 * ⇒ 최종 적용액은 이미 `result.reductionAmount`에 있다. 엔진을 고칠 필요 없이 **그 값을
 *   카드에 내려** 차이를 밝힌다. 엔진 `steps`의 「§133 종합한도」 step이 산식 문구를 갖고 있어
 *   상세명세서와도 어긋나지 않는다.
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export function ReductionStatutoryCapRow({
  /** detail이 말하는 금액 — 연간 한도까지만 반영된 값 */
  detailAmount,
  /** 최종 적용 감면세액 (§133 연간·5년 누적 한도 반영 후) */
  appliedAmount,
}: {
  detailAmount: number;
  appliedAmount?: number;
}) {
  // 미전달이거나 깎이지 않았으면 말할 것이 없다.
  if (appliedAmount === undefined || appliedAmount >= detailAmount) return null;
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-red-600">
          ※ 조특법 §133 종합한도(5년 누적) 반영 — 과거 4개 과세연도 감면 이력 차감
        </p>
        <LawArticleModal legalBasis="조세특례제한법 §133" label="§133" />
      </div>
      <p className="font-medium">→ 적용 감면세액 (한도 후) = {formatKRW(appliedAmount)}</p>
    </div>
  );
}
