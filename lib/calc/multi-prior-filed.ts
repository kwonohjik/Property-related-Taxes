import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";

/**
 * 다건 양도세 — 신고일 비교 필터 (§103·§111③).
 *
 * 가장 늦은 신고일(확정신고분)보다 신고일이 빠른 자산 = 기신고분(예정신고).
 * 기신고 양도소득금액(FilingFormTableAggregateHelpers.priorIncome)과 기납부세액이
 * 동일한 대상 자산 집합을 쓰도록 필터 로직을 단일 출처로 둔다.
 */

/** 신고일이 가장 늦은 자산(확정신고분)보다 빠른 자산의 인덱스 (strict <). 빈 신고일은 제외. */
export function selectPriorFiledIndices(filingDates: string[]): number[] {
  const maxFilingDate = [...filingDates].filter(Boolean).sort().at(-1) ?? "";
  return filingDates.flatMap((d, i) => (d && maxFilingDate && d < maxFilingDate ? [i] : []));
}

/**
 * 기납부세액(예정신고, §111③) 자동 산정 — 기신고분 자산들의 standalone 예정신고 세액 합.
 * 신고일 = form.filingDate → 없으면 statutoryFilingDeadline(법정신고기한) fallback.
 * 세액 basis = 이력 불러오기 시 포착한 자산별 실제 결정세액(국세·지방).
 */
export function computeAutoPriorPaid(properties: PropertyItem[]): {
  national: number;
  local: number;
} {
  const filingDates = properties.map(
    (p) => p.form.filingDate || p.form.statutoryFilingDeadline || "",
  );
  const priorIdx = new Set(selectPriorFiledIndices(filingDates));
  let national = 0;
  let local = 0;
  properties.forEach((p, i) => {
    if (priorIdx.has(i)) {
      national += p.priorPaidNational ?? 0;
      local += p.priorPaidLocal ?? 0;
    }
  });
  return { national, local };
}
