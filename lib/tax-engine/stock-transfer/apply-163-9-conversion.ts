/**
 * apply163_9Conversion — 시행령 §163⑨ 환산취득가 합성 헬퍼 (sibling)
 *
 * §163⑨: 환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가)
 *
 * 호출 분기:
 *   - 일반 상장 환산(§163⑨ 직접) — calcListedValuation 내부에서 적용됨 (별도)
 *   - 취득 후 상장(§165⑤ + §163⑨ 합성) — stock-transfer-tax.ts에서 본 헬퍼 사용
 *
 * 본 헬퍼는 "1주당 취득기준시가 + 양도시 1주당 기준시가 → 총액 환산취득가" 변환 책임.
 * 입력값 누락 시 fallbackTotal 반환 (방어 처리).
 *
 * 800줄 정책 회피로 stock-transfer-tax.ts에서 분리.
 */

import { safeMultiply } from "@/lib/tax-engine/tax-utils";

/**
 * §163⑨ 환산취득가 산식 — 1주당 기준시가 비율 × 양도가
 *
 * @param transferPrice — 양도가액 총액 (원)
 * @param acqStdPerShare — 취득시 1주당 기준시가 (§165⑤ 보정 후, 원)
 * @param transferStd — 양도시 1주당 기준시가 (양도일 직전 1개월 평균, 원)
 * @param fallbackTotal — transferStd 또는 acqStdPerShare가 0일 때 반환할 fallback 값
 * @returns 총액 환산취득가 (floor 1회 적용, 원)
 */
export function apply163_9Conversion(
  transferPrice: number,
  acqStdPerShare: number,
  transferStd: number,
  fallbackTotal: number,
): number {
  if (transferStd <= 0 || acqStdPerShare <= 0) {
    return fallbackTotal;
  }
  // 총액 단위 floor 1회 — 1주당 비율 적용 (1주당 × 비율 → 총액 단위로 환산)
  // safeMultiply: 양도가 5조+ 케이스 BigInt 안전망. 일반 범위에서는 일반 곱셈과 동일.
  return Math.floor(safeMultiply(transferPrice, acqStdPerShare) / transferStd);
}

/**
 * 양도시 1주당 기준시가 해석 — transferDatePriceAvg1Month 우선,
 * 미입력 시 1주당 양도가(transferPrice / shareCount)를 자동 fallback으로 사용한다.
 *
 * 사용자가 양도일 직전 1개월 평균을 미입력해도 §163⑨ 산식이 작동하도록 보장.
 * (취득기준시가가 그대로 취득가로 표시되는 버그 차단)
 *
 * @returns { transferStd, usedFallback } — usedFallback이 true면 fallback 사용됨
 */
export function resolveTransferStd(
  transferPrice: number,
  shareCount: number,
  transferDatePriceAvg1Month: number | undefined,
): { transferStd: number; usedFallback: boolean } {
  if (transferDatePriceAvg1Month && transferDatePriceAvg1Month > 0) {
    return { transferStd: transferDatePriceAvg1Month, usedFallback: false };
  }
  if (shareCount > 0) {
    return { transferStd: Math.floor(transferPrice / shareCount), usedFallback: true };
  }
  return { transferStd: 0, usedFallback: false };
}
