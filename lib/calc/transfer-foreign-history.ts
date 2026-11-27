/**
 * 국외자산 부동산 이력 — 상세 드로어의 «계산 결과 요약» 항목.
 *
 * 국외 결과는 `{ mode: "foreign", result }`(`ForeignTransferResult`)로 저장된다. 국내 양도세 결과 키(`transferGain`·`longTermDeduction` 등)와
 * 이름이 달라 드로어의 공통 분기로는 양도차익·양도소득금액·외국납부세액공제가 비어 보인다 — 국외 필드명으로 따로 뽑는다.
 * 금액만 낸다(산식은 인쇄/결과 화면 몫) · 0원 항목은 줄을 만들지 않는다(사이드바와 같은 규칙).
 */
export interface HistorySummaryItem {
  label: string;
  value: string;
}

/** 저장된 resultData가 국외 결과인가 */
export function isForeignResultData(resultData: Record<string, unknown> | null | undefined): boolean {
  return resultData?.mode === "foreign" && typeof resultData.result === "object" && resultData.result !== null;
}

/** 국외 결과의 요약 항목 — 국외 결과가 아니면 null(호출부가 국내 분기로 간다) */
export function foreignResultSummaryItems(resultData: Record<string, unknown>): HistorySummaryItem[] | null {
  if (!isForeignResultData(resultData)) return null;
  const r = resultData.result as Record<string, unknown>;
  const items: HistorySummaryItem[] = [];
  const add = (label: string, key: string) => {
    const v = r[key];
    if (typeof v === "number" && v !== 0) items.push({ label, value: v.toLocaleString() });
  };
  if (r.isLiable === false) {
    items.push({ label: "과세 여부", value: "납세의무 없음 (국외자산 양도 5년 거주 요건 미충족)" });
    return items;
  }
  add("양도차익 합계", "capitalGainTotal");
  add("양도소득금액 합계", "incomeAmountTotal");
  add("기본공제", "basicDeduction");
  add("양도소득 과세표준", "taxBase");
  add("산출세액", "calculatedTax");
  add("외국납부세액공제", "foreignTaxCreditApplied");
  add("결정세액", "determinedTax");
  add("지방소득세", "localIncomeTax");
  add("납부세액", "totalTax");
  return items;
}
