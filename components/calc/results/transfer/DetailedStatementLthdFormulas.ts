/**
 * 장기보유특별공제 보유분·거주분 **fallback 산식** 조립
 *
 * `DetailedStatementHelpers.ts`에서 분리 (800줄 정책, 2026-08-05 Phase G).
 *
 * ⚠️ 여기 산식은 **엔진이 sub-step을 emit하지 않은 경우에만** 쓰인다.
 *    엔진 sub-step("보유 기간분 장특"·"거주 기간분 장특")이 있으면 그쪽 `formula`가 우선이며,
 *    §95⑤ 용도변경 케이스는 항상 sub-step을 낳으므로 이 fallback에 도달하지 않는다.
 *    도달하는 것은 표1 단독·차손 자산·겸용 합산·이력에서 불러온 과거 결과다.
 */

import { LTHD_EXCLUSION_LABEL } from "@/lib/tax-engine/legal-codes/transfer";
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
}

export interface LthdFallbackFormulas {
  /** 배제 사유 라벨 — 미등기·분양권·승계입주권·중과 등. 없으면 undefined */
  exclusionLabel: string | undefined;
  holdingFormula: string;
  residenceFormula: string;
}

export function buildLthdFallbackFormulas(args: LthdFallbackArgs): LthdFallbackFormulas {
  const { result, isAggregate, totalHoldingMs, residenceMs, useTable2, totalLth, lthSplit } = args;

  const holdingYears = Math.floor(totalHoldingMs / 12);
  const residenceYears = Math.floor(residenceMs / 12);
  const holdingPct = Math.min(holdingYears * 4, 40);
  const residencePct = Math.min(residenceYears * 4, 40);

  // 배제 케이스(§95② 본문 괄호 — 미등기·분양권·승계입주권·§104⑦ 중과): 산식 대신 사유 표시
  const exclusionLabel =
    !isAggregate && result.lthdExclusionReason
      ? LTHD_EXCLUSION_LABEL[result.lthdExclusionReason]
      : undefined;

  const holdingFormula = exclusionLabel
    ? `0원 — ${exclusionLabel}`
    : useTable2
      ? `총 장특공제 ${totalLth.toLocaleString()}원 − 거주 기간분 ${lthSplit.residenceAmount.toLocaleString()}원 = ${lthSplit.holdingAmount.toLocaleString()}원 (§95② 표2 — 거주분 직접 산정 후 잔액을 보유분에 귀속, 보유 ${holdingYears}년 공제율 ${holdingPct}%)`
      : `총 장특공제 ${totalLth.toLocaleString()}원 = 보유 기간분 전액 ${lthSplit.holdingAmount.toLocaleString()}원 (§95② 표1 — 보유기간별 공제만, 거주기간분 없음)`;

  const residenceFormula = exclusionLabel
    ? `0원 — ${exclusionLabel}`
    : useTable2
      ? `총 장특공제 ${totalLth.toLocaleString()}원 × 거주율 ${residencePct}% ÷ (보유율 ${holdingPct}% + 거주율 ${residencePct}%) = ${lthSplit.residenceAmount.toLocaleString()}원 (§95② 표2 — 거주 ${residenceYears}년 직접 산정)`
      : `0원 (§95② 표1 적용 — 거주기간 공제 대상 아님)`;

  return { exclusionLabel, holdingFormula, residenceFormula };
}
