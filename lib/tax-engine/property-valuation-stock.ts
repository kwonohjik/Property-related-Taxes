/**
 * 재산평가 — 주식 평가 (상증법 §63)
 *
 * 상장주식 (§63 ①1호 가목):
 *   평가기준일 전후 2개월(총 4개월) 최종 시세 평균액
 *
 * 비상장주식 (§63 ①1호 다목 + 시행령 §54):
 *   1주당 가치 = (순손익가치 × 3 + 순자산가치 × 2) ÷ 5
 *   부동산과다보유법인: (순손익가치 × 2 + 순자산가치 × 3) ÷ 5
 *   최소값: 순자산가치 × 80%
 *   최댓값: 순자산가치 × 300% (상한 적용 여부는 실무 논란 → 상한 미적용 원칙)
 */

import { VALUATION } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { applyRate } from "./tax-utils";
import {
  calcWeightedAvg3y,
  calcPerShareNetIncomeValue as calcPerShareNetIncomeValueV2,
} from "./property-valuation/weighted-avg";
import { applyCapitalIncreaseShareValuation } from "./property-valuation/dividend-difference-section-63-2-3";
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

  // §63②3호 (PR-L3): 상장법인 증자 신주(미상장) — 가목 평가액 − 배당차액(§57③·§18②)
  if (item.isCapitalIncreaseUnlistedShare) {
    const { effectiveDividendDifference, perShareValue } = applyCapitalIncreaseShareValuation(
      avgPrice,
      item.listedStockDividendDifference ?? 0,
      item.dividendBaseDateSameAsListed ?? false,
    );
    const totalValue = perShareValue * shares;
    const warnings: string[] = [];
    if ((item.listedStockDividendDifference ?? 0) <= 0 && !item.dividendBaseDateSameAsListed) {
      warnings.push("배당차액 미입력 — 가목 평가액과 동일 적용. 시행규칙 §18② 확인.");
    }
    return {
      estateItemId: item.id,
      method: "market_value",
      valuatedAmount: totalValue,
      breakdown: [
        {
          label: "전후 2개월 종가 평균 (가목)",
          amount: Math.floor(avgPrice),
          lawRef: VALUATION.LISTED_STOCK,
          note: "주당 평균 종가 (원)",
        },
        {
          label: item.dividendBaseDateSameAsListed
            ? "배당차액 (배당기산일 동일 — 제외)"
            : "배당차액",
          amount: -effectiveDividendDifference,
          lawRef: VALUATION.DIVIDEND_DIFFERENCE,
        },
        {
          label: "1주당 평가액",
          amount: perShareValue,
          lawRef: VALUATION.CAPITAL_INCREASE_UNLISTED,
        },
        {
          label: "증자 신주(미상장) 보유 수",
          amount: shares,
          note: "주",
        },
        {
          label: "§63②3호 평가액",
          amount: totalValue,
          lawRef: VALUATION.CAPITAL_INCREASE_UNLISTED,
        },
      ],
      warnings,
    };
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
 * §56① 회사 전체 최근 3년 순손익액 가중평균 (legacy fallback 전용).
 *
 * 산식: (직전1년×3 + 직전2년×2 + 직전3년×1) ÷ 6
 * 결과 음수 → 0 (§56① 단서).
 *
 * ★ floor 하지 않음 — legacy fallback(weightedNetIncome 단일값 입력) 경로에서만 사용.
 *   3년치(netIncomeY1~Y3) 입력 시에는 §56① 3단계 절사(per-share floor → 가중평균 → ÷환원율)
 *   를 calcUnlistedStockPerShareValue 내부에서 직접 수행하므로 이 함수는 불필요.
 *   resolveWeightedNetIncome의 has3y 경로에서도 더 이상 호출되지 않음.
 *
 * @param y1 직전 1사업연도 순손익액 (회사 전체, 가중치 ×3). 결손 연도 음수 허용.
 * @param y2 직전 2사업연도 순손익액 (가중치 ×2)
 * @param y3 직전 3사업연도 순손익액 (가중치 ×1)
 */
export function calcCompanyWeightedNetIncome3Y(y1: number, y2: number, y3: number): number {
  const weighted = (y1 * 3 + y2 * 2 + y3 * 1) / 6;
  return weighted < 0 ? 0 : weighted; // §56① 단서: 음수 → 0 (floor 없음)
}

/**
 * 유효 가중평균 순손익 해소 (single source of truth).
 *
 * 3년치(netIncomeY1~Y3) 중 하나라도 입력된 경우 → calcCompanyWeightedNetIncome3Y로 계산.
 * 모두 undefined → legacy weightedNetIncome fallback (저장된 구버전 데이터 하위호환).
 */
export function resolveWeightedNetIncome(data: UnlistedStockData): number {
  const has3y =
    data.netIncomeY1 != null ||
    data.netIncomeY2 != null ||
    data.netIncomeY3 != null;
  if (has3y) {
    return calcCompanyWeightedNetIncome3Y(
      data.netIncomeY1 ?? 0,
      data.netIncomeY2 ?? 0,
      data.netIncomeY3 ?? 0,
    );
  }
  return data.weightedNetIncome ?? 0; // legacy
}

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
 *
 * 시행령 §55① 후단: 순자산가액이 0원 이하인 경우 0원으로 한다.
 */
export function calcPerShareNetAssetValue(
  netAssetValue: number,
  totalShares: number,
): number {
  if (totalShares <= 0) return 0;
  const guarded = Math.max(0, netAssetValue);  // §55① 후단 가드
  return Math.floor(guarded / totalShares);
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

  // 1주당 순손익가치 — 시행령 §54①·§56① (KoreanLaw 검증 mst=283637)
  //
  // has3y 경로 (netIncomeY1~Y3 중 하나라도 입력): §56① 3단계 절사
  //   사. floor(회사순손익_i / 주식수)    ← 연도별 1주당 절사
  //   아. floor((사1×3 + 사2×2 + 사3×1) / 6)  ← calcWeightedAvg3y (음수 → 0)
  //   차. floor(아 / 환원율)             ← calcPerShareNetIncomeValueV2
  //
  // legacy 경로 (3년치 모두 미입력, weightedNetIncome 단일값만):
  //   = floor(weightedNetIncome / (totalShares × capRate))  ← 단일 floor 유지
  const has3y =
    data.netIncomeY1 != null ||
    data.netIncomeY2 != null ||
    data.netIncomeY3 != null;

  let perShareIncomeValue: number;
  if (has3y && data.totalShares > 0) {
    // §56① 3단계: 사. 연도별 1주당 절사 → 아. 가중평균 → 차. ÷환원율
    const ps: [number, number, number] = [
      Math.floor((data.netIncomeY1 ?? 0) / data.totalShares),
      Math.floor((data.netIncomeY2 ?? 0) / data.totalShares),
      Math.floor((data.netIncomeY3 ?? 0) / data.totalShares),
    ];
    const weighted = calcWeightedAvg3y(ps);       // 아. (floor·음수 0)
    perShareIncomeValue = calcPerShareNetIncomeValueV2(weighted, capRate); // 차.
  } else {
    // legacy fallback: resolveWeightedNetIncome → 단일 floor
    const resolvedNetIncome = resolveWeightedNetIncome(data);
    perShareIncomeValue =
      data.totalShares > 0 && resolvedNetIncome > 0 && capRate > 0
        ? Math.floor(resolvedNetIncome / (data.totalShares * capRate))
        : 0;
  }
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

  // 최소값: 순자산가치의 80% (§54① 단서)
  const perShareMinValue = applyRate(perShareAssetValue, MIN_VALUE_RATE);

  // §54④ 순자산가치만 적용 분기 — 1호·2호·6호 무조건, 3호·5호 단서
  let perShareFinalValue: number;
  if (data.assetValueOnlyReason) {
    switch (data.assetValueOnlyReason) {
      // 1호·2호·6호: 무조건 1주당 순자산가치 적용
      case "liquidation":     // §54④ 1호
      case "lt3y":            // §54④ 2호 (사업개시 3년 미만·휴업·폐업)
      case "remaining_3y":    // §54④ 6호 (잔여 존속기한 3년 이내)
        perShareFinalValue = perShareAssetValue;
        break;
      // 3호·5호: 가중평균 < 1주당 순자산가치인 경우만 순자산가치 적용
      case "real_estate_80":  // §54④ 3호 (부동산 80%)
      case "stock_80":        // §54④ 5호 (주식 80%)
        perShareFinalValue =
          perShareWeightedValue < perShareAssetValue
            ? perShareAssetValue
            : perShareWeightedValue;
        break;
    }
  } else {
    // 기본 §54① 본칙: max(가중평균, 1주당 순자산가치 × 80%)
    perShareFinalValue = Math.max(perShareWeightedValue, perShareMinValue);
  }

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
  // 적자법인 판정: 3년치 우선 → legacy fallback (resolveWeightedNetIncome 기준)
  if (resolveWeightedNetIncome(data) <= 0) {
    warnings.push("적자법인 — 순손익가치 0 적용, 순자산가치 80% 최소값 기준");
  }
  if (perShareFinalValue === perShareMinValue && perShareWeightedValue < perShareMinValue) {
    warnings.push("가중평균 < 순자산가치 80% — 최소값 적용");
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
        label: "1주당 최소값 (순자산가치 × 80%)",
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
