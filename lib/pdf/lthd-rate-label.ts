/**
 * PDF 「장기보유특별공제 (N%)」 라벨에 율을 붙일지 — 순수 leaf.
 *
 * 가업상속공제 자산 §95④ 후단(`fbLthdDetail`)은 부분별 양도차익 × 부분별 공제율이라 하나의 율이 없다.
 * `longTermHoldingRate`는 공제액 ÷ 과세대상 양도차익(표시 전용)이어서 소수 1자리로 찍으면 공제액과 어긋난다
 * (교재 사례 970,000,000 × 26.3% = 255,110,000 ≠ 255,400,000). 부분별 율은 계산 단계 문구가 싣는다.
 *
 * @param byAggregation 합산 어댑터가 아닌 단건·구 이력에서만 율을 적는 기존 규칙(`ResultPdfTransferSections`)의 판정값
 */
export function lthdRateShownInPdf(r: { fbLthdDetail?: unknown }, byAggregation: boolean): boolean {
  return byAggregation && r.fbLthdDetail === undefined;
}
