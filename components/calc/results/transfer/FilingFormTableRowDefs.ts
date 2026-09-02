/**
 * FilingFormTable 행 정의 + 셀 포맷 헬퍼
 *
 * FilingFormTableHelpers.ts 800줄 정책 초과로 분리 (사례 37 ColumnMode 추가 시).
 * buildRows() 함수의 rowOrder 배열 + fmtCell을 담당.
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { RowDef, ColumnKey } from "./FilingFormTableHelpers";

// ── 셀 포맷 ───────────────────────────────────────────────────

export function fmtCell(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "string") return v;
  if (v === 0) return "0";
  return formatKRW(v);
}

/**
 * 세율 표시 (신고서 ⑨ 세율).
 *
 * ⚠️ `appliedRate`는 **이미 중과를 포함한 실효세율**이다 —
 * `transfer-tax-rate-calc.ts`가 `baseRate + additionalRate × ratio`로 만든다.
 * 여기에 `surchargeRate`를 더하면 중과분이 **두 번** 계상된다
 * (실측: 비사업용 토지 기본 45% + 10%p → 실효 55%인데 합산 표시는 65%).
 *
 * 세율이 0이면(집계에서 자산별 세율군이 둘 이상이라 단일 세율이 없는 경우 등)
 * 「0%」로 찍지 않고 `null`을 돌려 「-」로 비운다.
 */
export function fmtRatePct(appliedRate: number | null | undefined): string | null {
  if (appliedRate === null || appliedRate === undefined || appliedRate <= 0) return null;
  return `${(appliedRate * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

// ── rowOrder 빌더 ────────────────────────────────────────────

/**
 * buildRows()의 rowOrder 배열 + values/roseNotes 매핑 로직을 담당.
 * FilingFormTableHelpers.ts 에서 호출됨.
 */
export function buildRowsFromOrder(
  v: Record<string, Record<ColumnKey, number | string | null>>,
  roseNotesMap: Record<string, Record<ColumnKey, string>>,
  acqDateRowLabel: string,
  singleTaxNotes: Record<ColumnKey, string> | undefined,
): RowDef[] {
  const rowOrder: Array<[string, string, Partial<RowDef>?]> = [
    ["transferDate", "양도일자"],
    ["acquisitionDate", acqDateRowLabel],
    ["holdingPeriod", "보유기간"],
    ["moveOut", "퇴거일"],
    ["moveIn", "입주일"],
    ["residencePeriod", "거주기간", { separatorAfter: true }],
    ["transferPrice", "양도가액"],
    ["acquisitionPrice", "취득가액"],
    ["expenses", "필요경비", { separatorAfter: true }],
    ["transferGain", "전체 양도차익"],
    ["exemptGain", "비과세 양도차익"],
    ["taxableGain", "과세대상 양도차익", { separatorAfter: true }],
    ["ltDeduction", "장기보유특별공제"],
    ["ltHoldingPart", " 보유 기간분 장특", { indent: true }],
    ["ltResidencePart", " 거주 기간분 장특", { indent: true, separatorAfter: true }],
    ["incomeAmount", "양도소득금액"],
    ["nontaxableIncome", "비과세 양도소득금액 (소령 §161①)", { indent: true }],
    ["reductionTargetIncome", "세액감면대상금액"],
    ["reductionTargetIncome2", "소득금액 감면대상"],
    ["incomeAmountAfter", "감면후 소득금액"],
    ["priorIncomeAmount", "기신고 양도소득금액"],
    ["basicDeduction", "기본공제", { separatorAfter: true }],
    ["taxBase", "과세표준", { highlight: true }],
    // 신고서 정본(별지 제84호서식) ⑧과세표준 → ⑨세율 → ⑩산출세액 순서를 따른다.
    // ③세율구분 코드는 정본에서 표 머리에 있으나, 이 표는 자산별 열 구조라
    // 세율과 붙여 두는 편이 읽기 쉽다(값의 출처는 같은 판정이다).
    ["rateCode", "세율구분 코드"],
    ["taxRate", "세율"],
    ["calculatedTax", "산출세액", singleTaxNotes ? { notes: singleTaxNotes } : undefined],
    ["reductionTax", "감면세액"],
    ["determinedTax", "결정세액", { highlight: true }],
    ["penaltyTax", "가산세액"],
    ["totalDeterminedTax", "총결정세액", { highlight: true, separatorAfter: true }],
    ["ruralSurtax", "농어촌특별세"],
    ["localCalculatedTax", "지방소득세 산출세액"],
    ["localReduction", "지방세 감면세액"],
    ["localDeterminedTax", "지방세 결정세액", { highlight: true }],
  ];

  return rowOrder.map(([key, label, opts]) => ({
    label,
    values: v[key] ?? {},
    ...(opts ?? {}),
    ...(roseNotesMap[key] ? { roseNotes: roseNotesMap[key] } : {}),
  }));
}
