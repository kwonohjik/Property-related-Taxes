/**
 * 법인 영농·가업상속 주식 — 사업무관자산 차감 엔진
 *
 * 법령: 시행령 §15⑤2호 + §16⑤2호 (KoreanLaw MCP 검증 2026-05-21)
 *
 * 산식: adjustedValue = floor(stockValue × (totalAssets − sumOfNonBusiness) / totalAssets)
 *
 * BigInt 정수 연산 — 1조 단위 자산 곱셈 정밀도 보장.
 * Number 한계 분석:
 *   - stockValue ≤ Number.MAX_SAFE_INTEGER (사용자 입력)
 *   - businessAssets × stockValue ≤ 1e30 (BigInt 무제한)
 *   - adjustedBigInt ≤ stockValue (ratio ≤ 1) → Number 변환 안전
 */

import type {
  CorporateNonBusinessAssets,
  CorporateStockAdjustedResult,
} from "./types/inheritance-corporate-non-business.types";

function sumNonBusinessAssets(
  assets: CorporateNonBusinessAssets | undefined,
): number {
  if (!assets) return 0;
  return (
    Math.max(0, assets.nonBusinessLand ?? 0) +
    Math.max(0, assets.rentedRealEstate ?? 0) +
    Math.max(0, assets.externalLoans ?? 0) +
    Math.max(0, assets.excessCash ?? 0) +
    Math.max(0, assets.nonOperatingFinancial ?? 0)
  );
}

/**
 * 법인 영농·가업상속 주식 사업무관자산 차감.
 *
 * @param stockValue       주식 평가가액 (한도 적용 전)
 * @param totalAssets      법인 총자산 (분모)
 * @param nonBusinessAssets 사업무관자산 5종
 * @returns adjustedValue / sumOfNonBusiness / ratio
 *
 * 경계:
 *   - totalAssets ≤ 0: ratio=0, adjustedValue=0
 *   - sumOfNonBusiness > totalAssets: businessAssets=0 → adjustedValue=0
 *   - nonBusinessAssets=undefined: sumOfNonBusiness=0 → adjustedValue=stockValue
 */
export function calcCorporateStockAdjustedValue(
  stockValue: number,
  totalAssets: number,
  nonBusinessAssets: CorporateNonBusinessAssets | undefined,
): CorporateStockAdjustedResult {
  const sum = sumNonBusinessAssets(nonBusinessAssets);

  if (totalAssets <= 0) {
    return { adjustedValue: 0, sumOfNonBusiness: sum, ratio: 0 };
  }
  if (stockValue <= 0) {
    return { adjustedValue: 0, sumOfNonBusiness: sum, ratio: 0 };
  }

  const businessAssets = Math.max(0, totalAssets - sum);
  if (businessAssets === 0) {
    return { adjustedValue: 0, sumOfNonBusiness: sum, ratio: 0 };
  }

  // BigInt 곱셈 — 1조 × 1조까지 정밀도 보장
  const adjustedBigInt =
    (BigInt(stockValue) * BigInt(businessAssets)) / BigInt(totalAssets);

  // adjustedBigInt ≤ stockValue (ratio ≤ 1) → Number 변환 안전
  const adjustedValue = Number(adjustedBigInt);

  return {
    adjustedValue,
    sumOfNonBusiness: sum,
    ratio: businessAssets / totalAssets,
  };
}
