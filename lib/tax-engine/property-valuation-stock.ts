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

import { differenceInDays } from "date-fns";
import { VALUATION } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { applyRate } from "./tax-utils";
import {
  calcWeightedAvg3y,
  calcPerShareNetIncomeValue as calcPerShareNetIncomeValueV2,
} from "./property-valuation/weighted-avg";
import { applyCapitalIncreaseShareValuation } from "./property-valuation/dividend-difference-section-63-2-3";
import { calcGoodwill, type GoodwillInput } from "./property-valuation/goodwill";
import type {
  EstateItem,
  PropertyValuationResult,
  UnlistedStockData,
  UnlistedAssetValueOnlyReason,
  ListedPremiumExclusionReason,
  ListedStockBesshiData,
} from "./types/inheritance-gift.types";
import { EMPTY_LISTED_STOCK_MONTH_GROUPS } from "./types/inheritance-gift.types";
import type {
  UnlistedGoodwillResult,
  UnlistedNetAssetOnlyReason,
} from "./types/unlisted-stock-valuation.types";
import { PREMIUM_EXCLUSION_LABELS } from "./data/listed-premium-exclusion-labels";

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

/**
 * §63③ + §53④ + §53⑧ 최대주주 할증률 결정 (listed_stock 전용).
 *
 * 우선순위:
 *   1) isMaxShareholder=false → 0
 *   2) premiumExclusionReason ∈ §53⑧ 1~9호 또는 smb_med → 0
 *   3) companySize ∈ {small, medium} → 0 (§53④ 자동 배제)
 *   4) companySize === "large" + isMaxShareholder=true + 배제 사유 없음 → 0.20
 */
function resolveListedPremiumRate(item: EstateItem): {
  premiumRate: 0 | 0.2;
  exclusionReason?: ListedPremiumExclusionReason;
} {
  if (!item.isMaxShareholder) return { premiumRate: 0 };

  const explicit = item.premiumExclusionReason;
  if (explicit && explicit !== "none") {
    return { premiumRate: 0, exclusionReason: explicit };
  }

  if (item.companySize === "small" || item.companySize === "medium") {
    return { premiumRate: 0, exclusionReason: "smb_med" };
  }

  // companySize === "large" + isMaxShareholder + 배제 사유 없음 → §63③ 본문 20%
  if (item.companySize === "large") {
    return { premiumRate: 0.2 };
  }

  // companySize 미입력 + isMaxShareholder=true → 보수적으로 0 (validate에서 입력 요구)
  return { premiumRate: 0 };
}

/** ⑨~⑱ 산식 echo 산정 (orchestrator가 사용) */
function computeListedBesshiPage1Values(
  item: EstateItem,
  avgPrice: number,
  context: { valuationDate?: Date | string },
): {
  closingAvg: number;
  perShareMajorShareholder: number;
  priorDividendRate?: number;
  faceValuePerShare?: number;
  priorDividendAmount?: number;
  dividendBaseDate?: string;
  daysUntilDividendBase?: number;
  dividendDifference?: number;
  perShareValue?: number;
  perShareMajorShareholderUnlisted?: number;
  majorShareholderRate: 0 | 0.2;
  premiumExclusionLabel?: string;
} {
  const { premiumRate, exclusionReason } = resolveListedPremiumRate(item);
  const perShareMajorShareholder = Math.floor(avgPrice * (1 + premiumRate));

  const premiumExclusionLabel =
    premiumRate === 0 && exclusionReason
      ? PREMIUM_EXCLUSION_LABELS[exclusionReason]
      : undefined;

  // §63②3호 미상장 신주 분기 — ⑪~⑰ derive
  if (!item.isCapitalIncreaseUnlistedShare) {
    return {
      closingAvg: avgPrice,
      perShareMajorShareholder,
      majorShareholderRate: premiumRate,
      premiumExclusionLabel,
    };
  }

  const faceValue = item.faceValuePerShare ?? 0;
  const priorRate = item.priorDividendRate ?? 0;
  const priorDividendAmount = Math.floor(faceValue * priorRate);
  const dividendBaseDateIso =
    item.dividendBaseDate instanceof Date
      ? item.dividendBaseDate.toISOString().slice(0, 10)
      : (item.dividendBaseDate as string | undefined);

  const valuationIso =
    context.valuationDate instanceof Date
      ? context.valuationDate.toISOString().slice(0, 10)
      : (context.valuationDate as string | undefined);

  let daysUntilDividendBase: number | undefined;
  if (dividendBaseDateIso && valuationIso && !item.dividendBaseDateSameAsListed) {
    daysUntilDividendBase = Math.max(
      0,
      differenceInDays(new Date(valuationIso), new Date(dividendBaseDateIso)),
    );
  } else if (item.dividendBaseDateSameAsListed) {
    daysUntilDividendBase = 0;
  }

  const { effectiveDividendDifference, perShareValue } = applyCapitalIncreaseShareValuation(
    avgPrice,
    item.listedStockDividendDifference ?? 0,
    item.dividendBaseDateSameAsListed ?? false,
  );
  const dividendDifference = effectiveDividendDifference;
  const perShareMajorShareholderUnlisted = Math.floor(perShareValue * (1 + premiumRate));

  return {
    closingAvg: avgPrice,
    perShareMajorShareholder,
    priorDividendRate: priorRate,
    faceValuePerShare: faceValue,
    priorDividendAmount,
    dividendBaseDate: dividendBaseDateIso,
    daysUntilDividendBase,
    dividendDifference,
    perShareValue,
    perShareMajorShareholderUnlisted,
    majorShareholderRate: premiumRate,
    premiumExclusionLabel,
  };
}

/**
 * 상장주식 평가 (§63①1가목 본칙 + §63②3호 미상장 신주 + §63③ 최대주주 할증).
 *
 * @param context.valuationDate 평가기준일 (상속개시일/증여일) — EstateItem에 deathDate/giftDate가
 *   없으므로 orchestrator가 단일 source로 전달. 미전달 시 page1.valuationDate=""로 echo.
 */
export function evaluateListedStock(
  item: EstateItem,
  context: { valuationDate?: Date | string } = {},
): PropertyValuationResult {
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

  const page1Values = computeListedBesshiPage1Values(item, avgPrice, context);
  // 갑지 ④: shift된 anchor 우선 사용 (이미지 13 본문 — "기준일은 12.2가 되고...")
  const contextValuationIso =
    context.valuationDate instanceof Date
      ? context.valuationDate.toISOString().slice(0, 10)
      : (context.valuationDate as string | undefined) ?? "";
  const valuationIso = item.resolvedValuationAnchor ?? contextValuationIso;

  const toIso = (d: Date | string | undefined): string | undefined =>
    d instanceof Date ? d.toISOString().slice(0, 10) : (d as string | undefined);

  const besshiData: ListedStockBesshiData = {
    page1: {
      companyName: item.companyName,
      representative: item.representative,
      companyAddress: item.companyAddress,
      valuationDate: valuationIso,
      stockClass: item.stockClass ?? "common",
      listingDate: toIso(item.listingDate),
      capitalIncreaseDate: toIso(item.capitalIncreaseDate),
      mergerDate: toIso(item.mergerDate),
      isUnlistedShareSection: !!item.isCapitalIncreaseUnlistedShare,
    },
    page1Values,
    page2: item.listedStockDailyGroupsInput ?? EMPTY_LISTED_STOCK_MONTH_GROUPS,
  };

  // §63②3호 분기 — ⑰ × shares
  if (item.isCapitalIncreaseUnlistedShare) {
    const totalValue = (page1Values.perShareMajorShareholderUnlisted ?? 0) * shares;
    const warnings: string[] = [];
    if ((item.listedStockDividendDifference ?? 0) <= 0 && !item.dividendBaseDateSameAsListed) {
      warnings.push("배당차액 미입력 — 가목 평가액과 동일 적용. 시행규칙 §18② 확인.");
    }
    if (page1Values.majorShareholderRate === 0.2) {
      warnings.push("§63③ 최대주주 등 할증 20% 적용 (대기업).");
    }
    return {
      estateItemId: item.id,
      method: "market_value",
      valuatedAmount: totalValue,
      breakdown: [
        {
          label: "⑨ 전후 2개월 종가 평균 (가목)",
          amount: Math.floor(avgPrice),
          lawRef: VALUATION.LISTED_STOCK,
          note: "주당 평균 종가 (원)",
        },
        {
          label: item.dividendBaseDateSameAsListed
            ? "⑮ 배당차액 (배당기산일 동일 — 제외)"
            : "⑮ 배당차액",
          amount: -(page1Values.dividendDifference ?? 0),
          lawRef: VALUATION.DIVIDEND_DIFFERENCE_FORMULA,
        },
        {
          label: "⑯ 1주당 가액 (⑨ − ⑮)",
          amount: page1Values.perShareValue ?? 0,
          lawRef: VALUATION.CAPITAL_INCREASE_UNLISTED,
        },
        {
          label: `⑰ 최대주주 1주당 평가액 (⑯ × ${page1Values.majorShareholderRate === 0.2 ? "120%" : "100%"})`,
          amount: page1Values.perShareMajorShareholderUnlisted ?? 0,
          lawRef: VALUATION.LISTED_STOCK_PREMIUM,
          note: page1Values.premiumExclusionLabel,
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
      besshiData,
    };
  }

  // 일반 분기 — ⑩ × shares
  const totalValue = page1Values.perShareMajorShareholder * shares;
  const warnings: string[] = [];
  if (page1Values.majorShareholderRate === 0.2) {
    warnings.push("§63③ 최대주주 등 할증 20% 적용 (대기업).");
  }

  return {
    estateItemId: item.id,
    method: "market_value",
    valuatedAmount: totalValue,
    breakdown: [
      {
        label: "⑨ 전후 2개월 종가 평균",
        amount: Math.floor(avgPrice),
        lawRef: VALUATION.LISTED_STOCK,
        note: "주당 평균 종가 (원)",
      },
      {
        label: `⑩ 최대주주 1주당 평가액 (⑨ × ${page1Values.majorShareholderRate === 0.2 ? "120%" : "100%"})`,
        amount: page1Values.perShareMajorShareholder,
        lawRef: VALUATION.LISTED_STOCK_PREMIUM,
        note: page1Values.premiumExclusionLabel,
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
    warnings,
    besshiData,
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

// ============================================================
// 영업권(§59②) 가산 헬퍼 (간편평가 V1) — calcGoodwill 재사용
// ============================================================

/**
 * V1 §54④ 사유 → goodwill 모듈의 §55③ 배제 사유 enum 매핑.
 * §55③ 배제는 1·2호(§54④ 1·2·3호)만 — stock_80(5호)·remaining_3y(6호)는 배제 대상 아님(undefined).
 */
function mapToNetAssetOnlyReason(
  r: UnlistedAssetValueOnlyReason | undefined,
): UnlistedNetAssetOnlyReason | undefined {
  if (!r) return undefined;
  const map: Record<UnlistedAssetValueOnlyReason, UnlistedNetAssetOnlyReason | undefined> = {
    liquidation: "liquidation",
    lt3y: "lt3y",
    real_estate_80: "real_estate_80",
    stock_80: undefined,    // §55③ 배제 대상 아님 → 영업권 정상 가산
    remaining_3y: undefined, // §55③ 배제 대상 아님 → 영업권 정상 가산
  };
  return map[r];
}

/**
 * §55③ 3호 — 직전 3개 사업연도 순손익액이 모두 0 이하(계속결손법인) 도출.
 * 3년치(netIncomeY1~Y3) 모두 입력되었을 때만 판정 — 일부 미입력은 false(유보).
 * ★ 수치상 가중평균 ≤0 → 영업권은 이미 0이므로, 이 판정은 excludedByLaw 라벨 부여 목적.
 */
function deriveContinuousLoss(data: UnlistedStockData): boolean {
  const has3y =
    data.netIncomeY1 != null && data.netIncomeY2 != null && data.netIncomeY3 != null;
  if (!has3y) return false;
  return (
    (data.netIncomeY1 ?? 0) <= 0 &&
    (data.netIncomeY2 ?? 0) <= 0 &&
    (data.netIncomeY3 ?? 0) <= 0
  );
}

/**
 * 영업권 산식용 회사 전체 3년 가중평균 순손익액 (§59③ 준용 §56①).
 * = max(0, floor((Y1×3 + Y2×2 + Y3×1) / 6)) — V2 companyWeighted3y와 동일 산식.
 * ★ 순손익가치용 1주당 가중평균(calcWeightedAvg3y)과는 법적 근거가 달라 별도 헬퍼로 분리.
 */
function resolveWeightedNetIncome3yForGoodwill(data: UnlistedStockData): number {
  const has3y =
    data.netIncomeY1 != null || data.netIncomeY2 != null || data.netIncomeY3 != null;
  if (has3y) {
    const raw =
      ((data.netIncomeY1 ?? 0) * 3 +
        (data.netIncomeY2 ?? 0) * 2 +
        (data.netIncomeY3 ?? 0) * 1) /
      6;
    return Math.max(0, Math.floor(raw));
  }
  return Math.max(0, Math.floor(data.weightedNetIncome ?? 0)); // legacy fallback
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
  /** 영업권 평가 결과 (§59②) — 산출근거·§55③ 배제 사유 echo */
  goodwill: UnlistedGoodwillResult;
  /** 영업권 포함 후 회사 전체 순자산가액 (㉰ = max(0,netAssetValue) + goodwillFinal) */
  netAssetWithGoodwill: number;
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
  // §55③: 영업권(§59②) 평가 후 순자산 가산
  //   가. 회사 전체 3년 가중평균 순손익 / 다. 자기자본(영업권 포함 전 순자산, 0 가드)
  //   §55③ 배제(1·2·3호)는 calcGoodwill 내부에서 처리 → goodwillFinal 0
  const goodwillInput: GoodwillInput = {
    weightedAvg3y: resolveWeightedNetIncome3yForGoodwill(data),
    selfCapital: Math.max(0, data.netAssetValue),
    // rate 생략 → 상증규 §19① 법정 10% 기본값
    // intangibleDeduction 미전달 → V1 범위 제외(기본 0)
    netAssetOnlyReason: mapToNetAssetOnlyReason(data.assetValueOnlyReason),
    isContinuousLossLastThreeYears: deriveContinuousLoss(data),
  };
  const goodwill = calcGoodwill(goodwillInput);
  const netAssetWithGoodwill = Math.max(0, data.netAssetValue) + goodwill.goodwillFinal;

  const perShareAssetValue = calcPerShareNetAssetValue(
    netAssetWithGoodwill,
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
    goodwill,
    netAssetWithGoodwill,
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
    goodwill,
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
      ...(goodwill.goodwillFinal > 0
        ? [
            {
              label: "영업권 (§59②)",
              amount: goodwill.goodwillFinal,
              lawRef: VALUATION.GOODWILL_FORMULA,
              note: `3년 가중평균 순손익 ${goodwill.weightedAvg3y.toLocaleString()} × 50% − 자기자본 ${goodwill.selfCapital.toLocaleString()} × 10% → 초과이익 ${goodwill.annualExcessProfit.toLocaleString()} × 5년 연금현가`,
            },
          ]
        : []),
      {
        label:
          goodwill.goodwillFinal > 0
            ? "1주당 순자산가치 (영업권 포함)"
            : "1주당 순자산가치",
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
