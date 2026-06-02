/**
 * 증여세 부표1(별지 제10호서식 부표 1) 계 영역 산식·코드 라벨 — 화면·PDF 단일 출처.
 *
 * 소비처:
 *   - 화면: components/calc/results/GiftTaxValuationFormTable.tsx
 *   - PDF : lib/pdf/GiftValuationFormPdfDocument.tsx (PR-B2)
 * dual-truth 0: ⑩·⑭ 산식과 ② 재산종류코드 라벨을 한 곳에서 도출.
 *
 * KoreanLaw MCP 검증 (2026-05-20): ② 재산종류코드 14종 (시행규칙 별지 제10호서식 부표 1 뒷면 §2).
 */

/**
 * ② 재산종류코드 14종 라벨.
 * 결과 화면/PDF 표시는 가독성을 위해 약식 (예: "공동주택 (부수토지 포함)" → "공동주택").
 */
export const PROPERTY_TYPE_LABEL: Record<string, string> = {
  "01": "현금",
  "02": "토지",
  "03": "토지(부수)",
  "04": "개별주택",
  "05": "공동주택",
  "06": "오피스텔ㆍ상업용",
  "07": "일반건물",
  "08": "부동산 취득권리",
  "09": "상장주식",
  "10": "비상장주식",
  "11": "금융재산",
  "12": "기타재산",
  "13": "가상자산",
  "14": "서화ㆍ골동품",
};

/**
 * ⑩ 비과세재산가액 표시값 (음수 가드) — exemptAmount > ⑪+⑫+⑬ 일 때 차이 표시.
 *   ⑩ = max(0, 비과세 − ⑪ 공익법인 − ⑫ 공익신탁 − ⑬ 장애인신탁)
 */
export function computeRow10(
  exemptAmount: number,
  excl11: number,
  excl12: number,
  excl13: number,
): number {
  return Math.max(0, exemptAmount - excl11 - excl12 - excl13);
}

/**
 * ⑭ 증여재산가산액 표시값 (사전증여 가산분 역산).
 * 엔진 산식: aggregatedGiftValue = max(0, grossGiftValue − exemptAmount) + priorAggregation
 * 역산:      ⑭ = max(0, aggregatedGiftValue − max(0, grossGiftValue − exemptAmount))
 */
export function computeRow14(
  aggregated: number,
  gross: number,
  exempt: number,
): number {
  return Math.max(0, aggregated - Math.max(0, gross - exempt));
}
