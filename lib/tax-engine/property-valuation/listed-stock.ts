/**
 * 재산평가 — 상장주식 평가 (상증법 §63①1호 가목 + §63②3호 + §63③ 최대주주 할증).
 *
 * property-valuation-stock.ts에서 분리(800줄 정책, U-04 2026-11-28). 외부 import 경로는
 * property-valuation-stock.ts의 re-export로 보존한다.
 */

import { differenceInDays } from "../utc-date";
import { VALUATION } from "../legal-codes";
import { TaxCalculationError, TaxErrorCode } from "../tax-errors";
import { applyCapitalIncreaseShareValuation } from "./dividend-difference-section-63-2-3";
import type {
  EstateItem,
  PropertyValuationResult,
  ListedStockBesshiData,
} from "../types/inheritance-gift.types";
import { EMPTY_LISTED_STOCK_MONTH_GROUPS } from "../types/inheritance-gift.types";
import type { ListedStockMonthGroups } from "../types/listed-stock-valuation.types";
import {
  STOCK_PREMIUM_EXCLUSION_LABELS,
  SECTION_53_8_2_FAIL_LABELS,
} from "../data/stock-premium-exclusion-labels";
import { evaluateSection53_8_2 } from "./section-53-8-2-gate";
import type {
  StockPremiumExclusionReason,
  Section53_8_2FailReason,
} from "../types/stock-premium-exclusion.types";
import { toOptionalDate } from "@/lib/api/date-coerce";
import {
  isMidSizedPremiumExcluded,
  maxShareholderPremiumEraNotices,
} from "./max-shareholder-premium-era";

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
 * §63③ + §53⑧ 최대주주 할증률 결정 (listed_stock 전용).
 *
 * 우선순위:
 *   1) isMaxShareholder=false → 0
 *   2) premiumExclusionReason ∈ §53⑧ 1~8호 → 0 (9호는 3)에서 규모·날짜로 판정 — U-04)
 *   3) small → 0 · medium → 평가기준일 2023.1.1. 이후(날짜 없음 포함)만 0 (§53⑧9호)
 *   4) large, 또는 2023.1.1. 전 medium + 배제 사유 없음 → 0.20
 */
type ListedPremiumResolution = ReturnType<typeof resolveListedPremiumRate>;

function resolveListedPremiumRate(
  item: EstateItem,
  valuationDate?: Date | string,
): {
  premiumRate: 0 | 0.2;
  exclusionReason?: StockPremiumExclusionReason;
  section53_8_2FailReason?: Section53_8_2FailReason;
} {
  if (!item.isMaxShareholder) return { premiumRate: 0 };

  let exclusionEffective = item.premiumExclusionReason;
  let section53_8_2FailReason: Section53_8_2FailReason | undefined;

  // §53⑧2호: 게이트 통과해야만 유효한 배제. 실패 시 explicit 무효화 후 일반 분기로.
  if (exclusionEffective === "all_sold_within_6m") {
    const D = toOptionalDate(valuationDate);
    // saleContractDate는 JSON 경유 시 string 도달 가능 → toOptionalDate로 Date 보장.
    const saleDate = toOptionalDate(item.section53_8_2?.saleContractDate);
    if (!D || !item.section53_8_2 || !saleDate) {
      // 평가기준일·보조입력 미상 → 보수적으로 2호 무효 (validate가 필수화)
      exclusionEffective = "none";
      section53_8_2FailReason = "missing_input";
    } else {
      const gate = evaluateSection53_8_2(
        { ...item.section53_8_2, saleContractDate: saleDate },
        D,
      );
      if (!gate.eligible) {
        exclusionEffective = "none";
        section53_8_2FailReason = gate.failReason;
      }
    }
  }

  if (
    exclusionEffective &&
    exclusionEffective !== "none" &&
    exclusionEffective !== "small_medium_enterprise"
  ) {
    return { premiumRate: 0, exclusionReason: exclusionEffective, section53_8_2FailReason };
  }

  if (
    item.companySize === "small" ||
    (item.companySize === "medium" && isMidSizedPremiumExcluded(toOptionalDate(valuationDate)))
  ) {
    return { premiumRate: 0, exclusionReason: "small_medium_enterprise", section53_8_2FailReason };
  }

  // large(또는 2023.1.1. 전 medium) + isMaxShareholder + 배제 사유 없음 → §63③ 본문 20%
  if (item.companySize === "large" || item.companySize === "medium") {
    return { premiumRate: 0.2, section53_8_2FailReason };
  }

  // companySize 미입력 + isMaxShareholder=true → 보수적으로 0 (validate에서 입력 요구)
  return { premiumRate: 0, section53_8_2FailReason };
}

/**
 * 단일 진실 소스 도출 — 갑지 ⑨ closingAvg.
 *
 * Plan: docs/00-pm/listed-stock-besshi-avg-dual-truth-fix.plan.md §2-1
 *
 * 우선순위:
 *   1) groups.tradingDays > 0 (자동조회 응답 — 을지 D 양쪽 카운트 정답 산식) → groups.closingAverage
 *   2) 수동 입력 모드 또는 EMPTY_LISTED_STOCK_MONTH_GROUPS → fallbackAvgPrice
 *
 * ⚠️ `?? fallbackAvgPrice` 패턴 금지 — closingAverage=0 (EMPTY) 이 `null/undefined`가
 *    아니므로 0 통과 → 갑지 ⑨ = 0 버그. 반드시 tradingDays > 0 가드.
 */
function resolveClosingAvg(
  groups: ListedStockMonthGroups | undefined,
  fallbackAvgPrice: number,
): number {
  if (groups && groups.tradingDays > 0) {
    return groups.closingAverage;
  }
  return fallbackAvgPrice;
}

/** ⑨~⑱ 산식 echo 산정 (orchestrator가 사용) */
function computeListedBesshiPage1Values(
  item: EstateItem,
  avgPrice: number,
  context: { valuationDate?: Date | string },
  premium: ListedPremiumResolution,
  groups?: ListedStockMonthGroups,
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
  section53_8_2FailLabel?: string;
} {
  const { premiumRate, exclusionReason, section53_8_2FailReason } = premium;
  // SSOT — groups.closingAverage 우선, tradingDays === 0 시 avgPrice fallback
  const closingAvg = resolveClosingAvg(groups, avgPrice);
  const perShareMajorShareholder = Math.floor(closingAvg * (1 + premiumRate));

  // §53⑧2호 게이트 실패 안내 (할증 적용됨 — rose tone 결과 표시·warnings용)
  const section53_8_2FailLabel = section53_8_2FailReason
    ? SECTION_53_8_2_FAIL_LABELS[section53_8_2FailReason]
    : undefined;

  const premiumExclusionLabel =
    premiumRate === 0 && exclusionReason
      ? STOCK_PREMIUM_EXCLUSION_LABELS[exclusionReason]
      : undefined;

  // §63②3호 미상장 신주 분기 — ⑪~⑰ derive
  if (!item.isCapitalIncreaseUnlistedShare) {
    return {
      closingAvg,
      perShareMajorShareholder,
      majorShareholderRate: premiumRate,
      premiumExclusionLabel,
      section53_8_2FailLabel,
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
    closingAvg,
    item.listedStockDividendDifference ?? 0,
    item.dividendBaseDateSameAsListed ?? false,
  );
  const dividendDifference = effectiveDividendDifference;
  const perShareMajorShareholderUnlisted = Math.floor(perShareValue * (1 + premiumRate));

  return {
    closingAvg,
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
    section53_8_2FailLabel,
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
  const groups = item.listedStockDailyGroupsInput;

  // SSOT — groups.closingAverage 우선, 수동 입력 모드(tradingDays===0) 시 avgPrice fallback.
  // 입력 검증은 closingAvg 기준 (groups 우선) — listedStockAvgPrice 직접 입력 + groups 미전달 케이스도 수용.
  const closingAvg = resolveClosingAvg(groups, avgPrice);

  if (closingAvg <= 0 || shares <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.MARKET_VALUE_UNAVAILABLE,
      "상장주식 평가: 전후 2개월 종가 평균가와 주식 수가 필요합니다.",
    );
  }

  const premium = resolveListedPremiumRate(item, context.valuationDate);
  const page1Values = computeListedBesshiPage1Values(item, avgPrice, context, premium, groups);
  // U-04 — §63③ 할증 적용 고지 + 중견기업 배제 연혁·2020 전 100분의 30 단계 고지 (비상장 V2와 같은 문구)
  const premiumNotices: string[] = [];
  if (page1Values.majorShareholderRate === 0.2) {
    premiumNotices.push(
      `${VALUATION.LISTED_STOCK_PREMIUM} 최대주주 등 할증 20% 적용 (${item.companySize === "medium" ? "중견기업" : "대기업"}).`,
    );
  }
  if (item.isMaxShareholder) {
    premiumNotices.push(
      ...maxShareholderPremiumEraNotices({
        companySize: item.companySize,
        premiumRate: premium.premiumRate,
        exclusionReason: premium.exclusionReason,
        valuationDate: toOptionalDate(context.valuationDate),
      }),
    );
  }
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
    warnings.push(...premiumNotices);
    if (page1Values.section53_8_2FailLabel) {
      warnings.push(page1Values.section53_8_2FailLabel);
    }
    return {
      estateItemId: item.id,
      method: "market_value",
      valuatedAmount: totalValue,
      breakdown: [
        {
          label: "⑨ 전후 2개월 종가 평균 (가목)",
          amount: Math.floor(closingAvg),
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
  warnings.push(...premiumNotices);
  if (page1Values.section53_8_2FailLabel) {
    warnings.push(page1Values.section53_8_2FailLabel);
  }

  return {
    estateItemId: item.id,
    method: "market_value",
    valuatedAmount: totalValue,
    breakdown: [
      {
        label: "⑨ 전후 2개월 종가 평균",
        amount: Math.floor(closingAvg),
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
