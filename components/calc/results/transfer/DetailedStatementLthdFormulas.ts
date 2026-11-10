/**
 * 장기보유특별공제 보유분·거주분 **fallback 산식** 조립
 *
 * `DetailedStatementHelpers.ts`에서 분리 (800줄 정책, 2026-08-05 Phase G).
 *
 * ⚠️ 여기 산식은 **엔진이 sub-step을 emit하지 않은 경우에만** 쓰인다.
 *    엔진 sub-step("보유 기간분 장특"·"거주 기간분 장특")이 있으면 그쪽 `formula`가 우선이며,
 *    §95⑤ 용도변경 케이스는 항상 sub-step을 낳으므로 이 fallback에 도달하지 않는다.
 *    도달하는 것은 표1 단독·차손 자산·겸용 합산·이력에서 불러온 과거 결과다.
 *    조특법 §98의2 특칙(표2 보유기간별 공제율 단독)도 sub-step이 없어 여기에 도달한다 — 그때는 표1 문구가 아니라
 *    특칙 문구를 쓴다(`lthd982HoldingRatePct`).
 */

import { LTHD_EXCLUSION_LABEL } from "@/lib/tax-engine/legal-codes/transfer";
import { TRANSFER_REDUCTION_ARTICLE } from "@/lib/tax-engine/legal-codes/transfer";
import { isLthdTable2HoldingOnlyEra, table2ResidencePct } from "@/lib/tax-engine/data/lthd-table2-era";
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

interface LthdFallbackArgs {
  result: TransferTaxResult;
  isAggregate: boolean;
  /** 총 보유 개월 */
  totalHoldingMs: number;
  /** 거주 개월 */
  residenceMs: number;
  /** 거주 ≥ 24개월 — 1세대1주택 고가주택 표2 적용 신호 */
  useTable2: boolean;
  totalLth: number;
  lthSplit: { holdingAmount: number; residenceAmount: number };
  /** 양도일 — 2020.12.31. 이전 표2는 보유 기간분 한 열뿐이라 거주분 산식 문구가 달라진다(`splitLtDeduction`과 같은 술어). */
  transferDate?: string;
  /**
   * 조특법 §98의2① 특칙으로 표2 보유기간별 공제율만 적용한 단건 결과의 공제율(정수 %) —
   * 엔진 echo `unsold982Detail.lthd982Echo`(outcome `table2_holding`)의 `holdingRatePct`. 아니면 undefined.
   */
  lthd982HoldingRatePct?: number;
}

/** §98의2 특칙 보유분·거주분 문구 — 공제율은 엔진 echo 값이다(양도일 시행 표2: 2020.12.31.까지 연 8%, 이후 연 4%) */
export function lthd982HoldingFormula(totalLth: number, holdingAmount: number, ratePct: number): string {
  return `총 장특공제 ${totalLth.toLocaleString()} = 보유 기간분 전액 ${holdingAmount.toLocaleString()} (${TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_2}① 특칙 — §95② 표2 보유기간별 공제율 ${ratePct}%만 적용, 거주기간분 없음)`;
}
export const LTHD_982_RESIDENCE_FORMULA = `0 (${TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_2}① 특칙 — 표2 보유기간별 공제율만 적용, 거주기간 공제 대상 아님)`;

export interface LthdFallbackFormulas {
  /** 배제 사유 라벨 — 미등기·분양권·승계입주권·중과 등. 없으면 undefined */
  exclusionLabel: string | undefined;
  holdingFormula: string;
  residenceFormula: string;
}

export function buildLthdFallbackFormulas(args: LthdFallbackArgs): LthdFallbackFormulas {
  const { result, isAggregate, totalHoldingMs, residenceMs, useTable2, totalLth, lthSplit, lthd982HoldingRatePct, transferDate } = args;

  // §98의2 특칙 — 엔진 표시 step도 특칙 적용 시 장특 배제로 보지 않는다(`transfer-tax-lthd-steps.ts` lthdExcluded 술어). 배제 문구보다 먼저 본다.
  if (lthd982HoldingRatePct !== undefined) {
    return {
      exclusionLabel: undefined,
      holdingFormula: lthd982HoldingFormula(totalLth, lthSplit.holdingAmount, lthd982HoldingRatePct),
      residenceFormula: LTHD_982_RESIDENCE_FORMULA,
    };
  }

  const holdingYears = Math.floor(totalHoldingMs / 12);
  const residenceYears = Math.floor(residenceMs / 12);
  const holdingPct = Math.min(holdingYears * 4, 40);
  const residencePct = table2ResidencePct(residenceYears);

  // 배제 케이스(§95② 본문 괄호 — 미등기·분양권·승계입주권·§104⑦ 중과): 산식 대신 사유 표시
  const exclusionLabel =
    !isAggregate && result.lthdExclusionReason
      ? LTHD_EXCLUSION_LABEL[result.lthdExclusionReason]
      : undefined;

  // 2020.12.31. 이전 양도분 표2 — 보유기간별 연 8%(80% 한도) 한 열뿐: 보유분 전액·거주분 0 (엔진 sub-step이 없는 옛 이력).
  const transferAt = toOptionalDate(transferDate);
  const holdingOnlyTable2 = useTable2 && transferAt !== undefined && isLthdTable2HoldingOnlyEra(transferAt);

  const holdingFormula = exclusionLabel
    ? `0 — ${exclusionLabel}`
    : holdingOnlyTable2
      ? `총 장특공제 ${totalLth.toLocaleString()} = 보유 기간분 전액 ${lthSplit.holdingAmount.toLocaleString()} (§95② 표2 — 2020.12.31. 이전 양도분은 보유기간별 연 8%·80% 한도 한 열뿐, 거주기간분 없음)`
    : useTable2
      ? `총 장특공제 ${totalLth.toLocaleString()} − 거주 기간분 ${lthSplit.residenceAmount.toLocaleString()} = ${lthSplit.holdingAmount.toLocaleString()} (§95② 표2 — 거주분 직접 산정 후 잔액을 보유분에 귀속, 보유 ${holdingYears}년 공제율 ${holdingPct}%)`
      : `총 장특공제 ${totalLth.toLocaleString()} = 보유 기간분 전액 ${lthSplit.holdingAmount.toLocaleString()} (§95② 표1 — 보유기간별 공제만, 거주기간분 없음)`;

  const residenceFormula = exclusionLabel
    ? `0 — ${exclusionLabel}`
    : holdingOnlyTable2
      ? "0 (§95② 표2 — 2020.12.31. 이전 양도분은 거주기간별 공제율이 없음, 거주기간 공제 대상 아님)"
    : useTable2
      ? `총 장특공제 ${totalLth.toLocaleString()} × 거주율 ${residencePct}% ÷ (보유율 ${holdingPct}% + 거주율 ${residencePct}%) = ${lthSplit.residenceAmount.toLocaleString()} (§95② 표2 — 거주 ${residenceYears}년 직접 산정)`
      : `0 (§95② 표1 적용 — 거주기간 공제 대상 아님)`;

  return { exclusionLabel, holdingFormula, residenceFormula };
}
