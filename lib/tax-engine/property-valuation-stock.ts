/**
 * 재산평가 — 주식 평가 (상증법 §63)
 *
 * 상장주식 (§63 ①1호 가목):
 *   평가기준일 전후 2개월(총 4개월) 최종 시세 평균액
 *
 * 비상장주식 (§63 ①1호 다목 + 시행령 §54):
 *   1주당 가치 = (순손익가치 × 3 + 순자산가치 × 2) ÷ 5
 *   부동산과다보유법인: (순손익가치 × 2 + 순자산가치 × 3) ÷ 5
 *   최솟값: 순자산가치 × 80%
 *   최댓값: 순자산가치 × 300% (상한 적용 여부는 실무 논란 → 상한 미적용 원칙)
 */

import { VALUATION } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { applyRate } from "./tax-utils";
import type {
  EstateItem,
  PropertyValuationResult,
  UnlistedStockData,
} from "./types/inheritance-gift.types";

// ============================================================
// 비상장주식 평가 가중치 상수 (시행령 §54)
// ============================================================

/** 일반법인: 순손익가치 60%, 순자산가치 40% */
const GENERAL_NET_INCOME_WEIGHT = 3;   // 3/5 = 60%
const GENERAL_NET_ASSET_WEIGHT  = 2;   // 2/5 = 40%

/** 부동산과다보유법인: 순손익가치 40%, 순자산가치 60% */
const REAL_ESTATE_HEAVY_INCOME_WEIGHT = 2; // 2/5 = 40%
const REAL_ESTATE_HEAVY_ASSET_WEIGHT  = 3; // 3/5 = 60%

/** 최소 평가 비율: 순자산가치의 80% */
const MIN_VALUE_RATE = 0.80;

/** 자본환원율 기본값 (연 10%) */
const DEFAULT_CAPITALIZATION_RATE = 0.10;

// ============================================================
// 상장주식 평가 (§63 ①1호 가목)
// ============================================================

/**
 * 상장주식: 전후 2개월 종가 단순 평균 × 보유 주식 수
 *
 * @param avgClosingPrice 평가기준일 전후 2개월 종가 단순 평균 (원/주)
 * @param shares 보유 주식 수
 */
export function evaluateListedStockValue(
  avgClosingPrice: number,
  shares: number,
): number {
  if (avgClosingPrice <= 0 || shares <= 0) return 0;
  return Math.floor(avgClosingPrice) * shares;
}

export function evaluateListedStock(item: EstateItem): PropertyValuationResult {
  if (item.category !== "listed_stock") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateListedStock: 상장주식 자산이 아닙니다.",
    );
  }

  const avgPrice = item.listedStockAvgPrice ?? 0;
  const shares = item.listedStockShares ?? 0;

  if (avgPrice <= 0 || shares <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.MARKET_VALUE_UNAVAILABLE,
      "상장주식 평가: 전후 2개월 종가 평균가와 주식 수가 필요합니다.",
    );
  }

  const totalValue = evaluateListedStockValue(avgPrice, shares);

  return {
    estateItemId: item.id,
    method: "market_value",
    valuatedAmount: totalValue,
    breakdown: [
      {
        label: "전후 2개월 종가 평균",
        amount: Math.floor(avgPrice),
        lawRef: VALUATION.LISTED_STOCK,
        note: "주당 평균 종가 (원)",
      },
      {
        label: "보유 주식 수",
        amount: shares,
        note: "주",
      },
      {
        label: "상장주식 평가액",
        amount: totalValue,
        lawRef: VALUATION.LISTED_STOCK,
      },
    ],
    warnings: [],
  };
}

// ============================================================
// 비상장주식 평가 (§63 ①1호 다목 + 시행령 §54)
// ============================================================

/**
 * 1주당 순손익가치 계산
 * = 가중평균순손익 ÷ 자본환원율
 */
export function calcPerShareNetIncomeValue(
  weightedNetIncome: number,
  capitalizationRate: number,
): number {
  if (capitalizationRate <= 0) return 0;
  // 음수 순손익 방어 (적자법인 → 0 처리)
  if (weightedNetIncome <= 0) return 0;
  return Math.floor(weightedNetIncome / capitalizationRate);
}

/**
 * 1주당 순자산가치 계산
 * = 총 순자산가치 ÷ 총 발행주식 수
 */
export function calcPerShareNetAssetValue(
  netAssetValue: number,
  totalShares: number,
): number {
  if (totalShares <= 0) return 0;
  return Math.floor(netAssetValue / totalShares);
}

/**
 * 비상장주식 1주당 평가액 계산 (시행령 §54)
 *
 * @param data 비상장주식 평가 데이터
 * @param isRealEstateHeavy 부동산과다보유법인 여부 (순자산가치 비중 증가)
 */
export function calcUnlistedStockPerShareValue(
  data: UnlistedStockData,
  isRealEstateHeavy: boolean,
): {
  perShareIncomeValue: number;
  perShareAssetValue: number;
  perShareWeightedValue: number;
  perShareMinValue: number;
  perShareFinalValue: number;
} {
  const capRate = data.capitalizationRate > 0
    ? data.capitalizationRate
    : DEFAULT_CAPITALIZATION_RATE;

  // 회사 전체 가중평균 순손익 → 1주당 순손익 → 1주당 순손익가치
  const perShareWeightedNetIncome = Math.floor(data.weightedNetIncome / data.totalShares);
  const perShareIncomeValue = calcPerShareNetIncomeValue(
    perShareWeightedNetIncome,
    capRate,
  );
  const perShareAssetValue = calcPerShareNetAssetValue(
    data.netAssetValue,
    data.totalShares,
  );

  // 가중 평균 산식
  const [iw, aw] = isRealEstateHeavy
    ? [REAL_ESTATE_HEAVY_INCOME_WEIGHT, REAL_ESTATE_HEAVY_ASSET_WEIGHT]
    : [GENERAL_NET_INCOME_WEIGHT, GENERAL_NET_ASSET_WEIGHT];

  // 분자 합산 후 나눗셈 (정밀도 유지)
  const totalWeight = iw + aw; // 항상 5
  const perShareWeightedValue = Math.floor(
    (perShareIncomeValue * iw + perShareAssetValue * aw) / totalWeight,
  );

  // 최솟값: 순자산가치의 80%
  const perShareMinValue = applyRate(perShareAssetValue, MIN_VALUE_RATE);

  // 최종: 가중평균과 최솟값 중 큰 값
  const perShareFinalValue = Math.max(perShareWeightedValue, perShareMinValue);

  return {
    perShareIncomeValue,
    perShareAssetValue,
    perShareWeightedValue,
    perShareMinValue,
    perShareFinalValue,
  };
}

export function evaluateUnlistedStock(
  item: EstateItem,
  isRealEstateHeavy = false,
): PropertyValuationResult {
  if (item.category !== "unlisted_stock") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateUnlistedStock: 비상장주식 자산이 아닙니다.",
    );
  }

  const data = item.unlistedStockData;
  if (!data) {
    throw new TaxCalculationError(
      TaxErrorCode.UNLISTED_STOCK_DATA_MISSING,
      "비상장주식 평가: unlistedStockData가 필요합니다. (순손익·순자산·주식 수)",
    );
  }

  if (data.totalShares <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "비상장주식 평가: 총 발행주식 수는 0보다 커야 합니다.",
    );
  }

  const {
    perShareIncomeValue,
    perShareAssetValue,
    perShareWeightedValue,
    perShareMinValue,
    perShareFinalValue,
  } = calcUnlistedStockPerShareValue(data, isRealEstateHeavy);

  const totalValue = perShareFinalValue * data.ownedShares;

  const [iWeight, aWeight] = isRealEstateHeavy
    ? [REAL_ESTATE_HEAVY_INCOME_WEIGHT, REAL_ESTATE_HEAVY_ASSET_WEIGHT]
    : [GENERAL_NET_INCOME_WEIGHT, GENERAL_NET_ASSET_WEIGHT];

  const warnings: string[] = [];
  if (data.weightedNetIncome <= 0) {
    warnings.push("적자법인 — 순손익가치 0 적용, 순자산가치 80% 최솟값 기준");
  }
  if (perShareFinalValue === perShareMinValue && perShareWeightedValue < perShareMinValue) {
    warnings.push("가중평균 < 순자산가치 80% — 최솟값 적용");
  }
  if (isRealEstateHeavy) {
    warnings.push("부동산과다보유법인 — 가중치 순손익 40%·순자산 60% 적용");
  }

  return {
    estateItemId: item.id,
    method: "book_value",
    valuatedAmount: totalValue,
    breakdown: [
      {
        label: "1주당 순손익가치",
        amount: perShareIncomeValue,
        lawRef: VALUATION.UNLISTED_FORMULA,
        note: `가중평균순손익 ÷ 자본환원율 ${(data.capitalizationRate || DEFAULT_CAPITALIZATION_RATE) * 100}%`,
      },
      {
        label: "1주당 순자산가치",
        amount: perShareAssetValue,
        lawRef: VALUATION.UNLISTED_FORMULA,
      },
      {
        label: `1주당 가중평균 (순손익${iWeight}/5 + 순자산${aWeight}/5)`,
        amount: perShareWeightedValue,
        lawRef: VALUATION.UNLISTED_STOCK,
      },
      {
        label: "1주당 최솟값 (순자산가치 × 80%)",
        amount: perShareMinValue,
      },
      {
        label: "1주당 최종 평가액",
        amount: perShareFinalValue,
      },
      {
        label: `보유 주식 수: ${data.ownedShares}주`,
        amount: data.ownedShares,
        note: "주",
      },
      {
        label: "비상장주식 총 평가액",
        amount: totalValue,
        lawRef: VALUATION.UNLISTED_STOCK,
      },
    ],
    warnings,
  };
}
