/**
 * 상속세·증여세 공통 유틸 (상증법 §13·§26·§27·§47)
 *
 * - §26 누진세율 구간 (상속세·증여세 공통)
 * - 세대생략 할증과세 (§27 상속 / §57 증여)
 * - 10년 이내 사전증여재산 합산 (§13 / §47)
 * - 장례비 공제 계산 (§14)
 * - 1000원 미만 절사 (과세표준)
 */

import { differenceInYears } from "date-fns";
import { INH, GIFT } from "./legal-codes";
import { applyRate, calculateProgressiveTax, truncateToThousand } from "./tax-utils";
import type {
  CalculationStep,
  PriorGift,
} from "./types/inheritance-gift.types";
import type { TaxBracket as TaxBracketBase } from "./types";

// ============================================================
// §26 상속세·증여세 누진세율 구간 (법정 기본값)
// DB에서 다른 세율을 로드하면 이 값을 대체해야 함
// ============================================================

/** §26 기본 누진세율 구간 (상속세·증여세 공용) */
export const DEFAULT_INHERITANCE_GIFT_BRACKETS: TaxBracketBase[] = [
  { min: 0,               max: 100_000_000,   rate: 0.10, deduction: 0           },
  { min: 100_000_001,     max: 500_000_000,   rate: 0.20, deduction: 10_000_000  },
  { min: 500_000_001,     max: 1_000_000_000, rate: 0.30, deduction: 60_000_000  },
  { min: 1_000_000_001,   max: 3_000_000_000, rate: 0.40, deduction: 160_000_000 },
  { min: 3_000_000_001,   max: null,          rate: 0.50, deduction: 460_000_000 },
];

// ============================================================
// 누진세율 적용 (§26 / §56)
// ============================================================

/**
 * 상속세·증여세 산출세액 계산 (§26 / §56)
 *
 * @param taxBase 과세표준 (1,000원 미만 절사 후 전달)
 * @param brackets 세율 구간 (기본값: DEFAULT_INHERITANCE_GIFT_BRACKETS)
 */
export function calcInheritanceGiftTax(
  taxBase: number,
  brackets: TaxBracketBase[] = DEFAULT_INHERITANCE_GIFT_BRACKETS,
): number {
  if (taxBase <= 0) return 0;
  return calculateProgressiveTax(taxBase, brackets);
}

// ============================================================
// 세대생략 할증과세 (§27 / §57)
// ============================================================

/**
 * 세대생략 할증과세 계산 (§27 상속 / §57 증여)
 *
 * 기본 할증율: 30%
 * 미성년자 수증인 + 세대생략 재산가액이 20억 초과인 경우: 40%
 *
 * §27 ① 안분 계산 (상속세): 전체 상속인 중 일부만 세대생략인 경우
 *   할증세액 = 산출세액 × (세대생략 해당 재산 / 전체 상속재산) × 할증율
 *   generationSkipAssetAmount, totalEstateValue 미제공 시 전체 산출세액에 적용.
 *
 * @param computedTax 산출세액 (세대생략 전)
 * @param isGenerationSkip 세대생략 여부
 * @param isMinorDonee 수증인이 미성년자 여부
 * @param taxBase 과세표준 (fallback용)
 * @param mode 'inheritance' = §27, 'gift' = §57
 * @param generationSkipAssetAmount 세대생략 해당 상속재산가액 (안분용, 상속세만)
 * @param totalEstateValue 전체 상속재산가액 (안분용, 상속세만)
 * @param assetValueForThreshold 40% 판정 기준 재산가액 (미제공 시 상속: generationSkipAssetAmount ?? totalEstateValue, 증여: taxBase로 fallback)
 */
export function calcGenerationSkipSurcharge(
  computedTax: number,
  isGenerationSkip: boolean,
  isMinorDonee: boolean,
  taxBase: number,
  mode: "inheritance" | "gift" = "inheritance",
  generationSkipAssetAmount?: number,
  totalEstateValue?: number,
  assetValueForThreshold?: number,
): { surchargeAmount: number; breakdown: CalculationStep[] } {
  if (!isGenerationSkip || computedTax <= 0) {
    return { surchargeAmount: 0, breakdown: [] };
  }

  const SURCHARGE_THRESHOLD = 2_000_000_000; // 20억

  // §27 ② / §57 ②: 미성년자 수증인 + 세대생략 재산가액 20억 초과 → 40%, 그 외 → 30%
  // 판정 기준: assetValueForThreshold (명시 전달) → 상속: generationSkipAssetAmount ?? totalEstateValue → taxBase(fallback)
  const thresholdValue =
    assetValueForThreshold ??
    (mode === "inheritance"
      ? (generationSkipAssetAmount ?? totalEstateValue ?? taxBase)
      : taxBase);
  const surchargeRate =
    isMinorDonee && thresholdValue > SURCHARGE_THRESHOLD ? 0.4 : 0.3;

  const lawRef = mode === "inheritance" ? INH.GENERATION_SKIP : GIFT.GENERATION_SKIP;

  // §27 ① 안분: 세대생략 재산가액이 제공된 경우 안분 비율 적용
  // 곱셈 먼저 수행하여 소수점 오차 방지
  const hasProration =
    mode === "inheritance" &&
    generationSkipAssetAmount != null &&
    totalEstateValue != null &&
    totalEstateValue > 0;

  let surchargeAmount: number;
  const breakdown: CalculationStep[] = [];

  if (hasProration) {
    // 안분 기준세액: computedTax × (세대생략 재산 / 전체 상속재산)
    const proratedTax = Math.floor(
      (computedTax * generationSkipAssetAmount!) / totalEstateValue!,
    );
    surchargeAmount = applyRate(proratedTax, surchargeRate);
    breakdown.push({
      label: `세대생략 할증 — 안분기준세액 (산출세액 × 세대생략재산 / 전체재산)`,
      amount: proratedTax,
      note: `${generationSkipAssetAmount!.toLocaleString()}원 / ${totalEstateValue!.toLocaleString()}원`,
      lawRef,
    });
  } else {
    surchargeAmount = applyRate(computedTax, surchargeRate);
  }

  breakdown.push({
    label: `세대생략 할증 (${surchargeRate * 100}% — ${
      surchargeRate === 0.4 ? "미성년자·20억 초과" : "기본"
    })${hasProration ? " [안분 적용]" : ""}`,
    amount: surchargeAmount,
    lawRef,
  });

  return { surchargeAmount, breakdown };
}

// ============================================================
// 10년 이내 사전증여재산 합산 (§13 / §47)
// ============================================================

/**
 * 상속세 과세가액 합산: 상속개시일 전 10년 이내 사전증여재산 (§13)
 *
 * 상속인·수유자에 대한 사전증여: 10년 이내
 * 비상속인에 대한 사전증여: 5년 이내
 *
 * @param priorGifts 사전증여 내역
 * @param deathDate 상속개시일 (ISO date)
 * @param heirIdsOnly true면 상속인 증여만 (§24 한도 계산용)
 */
export function aggregatePriorGiftsForInheritance(
  priorGifts: PriorGift[],
  deathDate: string,
  heirIdsOnly = false,
): { totalAmount: number; breakdown: CalculationStep[] } {
  const death = new Date(deathDate);
  const breakdown: CalculationStep[] = [];
  let totalAmount = 0;

  for (const gift of priorGifts) {
    // differenceInYears: 생일(giftDate) 기준 정확한 만 연수 계산 (365.25 근사 오류 방지)
    // 민법 기산: giftDate 다음날 기산이 원칙이나, 상증법 §13은 "이전 10년" 기준이므로
    // differenceInYears(death, giftDate)가 법령 취지에 부합.
    const elapsedYears = differenceInYears(new Date(deathDate), new Date(gift.giftDate));

    // 상속인: 10년, 비상속인: 5년
    const limitYears = gift.isHeir ? 10 : 5;

    if (heirIdsOnly && !gift.isHeir) continue;
    if (elapsedYears > limitYears) continue;

    totalAmount += gift.giftAmount;
    breakdown.push({
      label: `사전증여 합산 (${gift.giftDate}, ${gift.isHeir ? "상속인" : "비상속인"})`,
      amount: gift.giftAmount,
      lawRef: INH.TAXABLE_VALUE,
    });
  }

  return { totalAmount, breakdown };
}

/**
 * 증여세 과세가액 합산: 증여일 전 10년 이내 동일인 사전증여 (§47)
 *
 * @param priorGifts 10년 이내 동일인 증여 내역
 * @param giftDate 현재 증여일 (ISO date)
 */
export function aggregatePriorGiftsForGift(
  priorGifts: PriorGift[],
  giftDate: string,
): { totalAmount: number; totalTaxPaid: number; breakdown: CalculationStep[] } {
  const current = new Date(giftDate);
  const breakdown: CalculationStep[] = [];
  let totalAmount = 0;
  let totalTaxPaid = 0;

  for (const gift of priorGifts) {
    // differenceInYears: 정확한 만 연수 계산 (365.25 근사 오류 방지)
    const elapsedYears = differenceInYears(current, new Date(gift.giftDate));
    if (elapsedYears > 10) continue;

    totalAmount += gift.giftAmount;
    totalTaxPaid += gift.giftTaxPaid;
    breakdown.push({
      label: `기증여 합산 (${gift.giftDate})`,
      amount: gift.giftAmount,
      lawRef: GIFT.TAXABLE_VALUE,
    });
  }

  return { totalAmount, totalTaxPaid, breakdown };
}

// ============================================================
// 장례비 공제 계산 (§14 ③)
// ============================================================

/** 장례비 최솟값 (증빙 없어도 인정): 500만원 */
const FUNERAL_MIN = 5_000_000;

/** 장례비 일반 한도: 1,000만원 (상증법 시행령 §9 ①) */
const FUNERAL_GENERAL_MAX = 10_000_000;

/** 봉안시설·자연장지 추가 한도: 500만원 */
const FUNERAL_BONGAN_EXTRA = 5_000_000;

/**
 * 장례비 공제 계산 (§14 ③)
 *
 * @param expense 실제 지출한 장례비 (봉안 비용 포함 or 별도)
 * @param includesBongan 봉안시설·자연장지 이용 여부
 */
export function calcFuneralExpenseDeduction(
  expense: number,
  includesBongan: boolean,
): { deduction: number; breakdown: CalculationStep[] } {
  const maxLimit = FUNERAL_GENERAL_MAX + (includesBongan ? FUNERAL_BONGAN_EXTRA : 0);

  // 실제 지출액 vs 한도 중 작은 값, 최소 500만원 보장
  const capped = Math.min(expense, maxLimit);
  const deduction = Math.max(capped, FUNERAL_MIN);

  const breakdown: CalculationStep[] = [
    {
      label: "장례비 지출액",
      amount: expense,
      lawRef: INH.DEBT_DEDUCTION,
    },
    {
      label: `장례비 공제 한도 (${includesBongan ? "봉안 포함 1,500만" : "일반 1,000만"})`,
      amount: maxLimit,
    },
    {
      label: "장례비 공제 확정액",
      amount: deduction,
      lawRef: INH.DEBT_DEDUCTION,
      note: expense < FUNERAL_MIN ? "최소 500만원 인정" : undefined,
    },
  ];

  return { deduction, breakdown };
}

// ============================================================
// 과세표준 절사 (1,000원 미만)
// ============================================================

/**
 * 상속세·증여세 과세표준 1,000원 미만 절사
 */
export function truncateTaxBase(amount: number): number {
  return truncateToThousand(amount);
}
