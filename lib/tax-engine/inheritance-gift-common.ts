/**
 * 상속세·증여세 공통 유틸 (상증법 §13·§26·§27·§47)
 *
 * - §26 누진세율 구간 (상속세·증여세 공통)
 * - 세대생략 할증과세 (§27 상속 / §57 증여)
 * - 10년 이내 사전증여재산 합산 (§13 / §47)
 * - 장례비 공제 계산 (§14)
 * - 1000원 미만 절사 (과세표준)
 */

import { differenceInYears, isBefore, subYears } from "date-fns";
import { INH, GIFT } from "./legal-codes";
import { applyRate, calculateProgressiveTax, truncateToThousand } from "./tax-utils";
import type {
  CalculationStep,
  PriorGift,
  GenerationSkipSurchargeDetail,
  DonorGroup,
  Heir,
} from "./types/inheritance-gift.types";
import type { TaxBracket as TaxBracketBase } from "./types";
import type { PriorAggregationResult } from "./gift-prior-aggregation";

// ============================================================
// 영리법인 수유자 판정 — UI·엔진 단일 진실
// ============================================================

/**
 * 영리법인 수유자 판정 — `relation === "corporate"` AND `isForProfit !== false`.
 *
 * - 영리법인(undefined·true): §3의2② 상속세 면제·별도 배부 → 협의분할 제외·per-heir finalTax=0.
 * - 비영리법인(false): 상속세 납세의무 → 협의분할 대상·수유자처럼 과세.
 *
 * UI(HeirAllocationInput)와 엔진(inheritance-allocation)이 공용해 dual-truth 방지.
 * 기준: HeirComposition.tsx 영리법인 토글 `checked={isForProfit !== false}`(영리 기본 ON)과 일치.
 */
export function isForProfitCorporate(
  h: Pick<Heir, "relation" | "isForProfit">,
): boolean {
  return h.relation === "corporate" && h.isForProfit !== false;
}

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

/**
 * 과세표준에 적용되는 누진세율 구간의 한계세율·누진공제 조회 (§26 / §56).
 *
 * 산출세액 산식 표시용 echo — `calcInheritanceGiftTax`(=`calculateProgressiveTax`)는
 * 결과액만 반환하므로, 적용 세율·누진공제를 별도로 노출하기 위한 순수 조회 함수.
 * 계산 로직에는 영향 없음 (동일 brackets로 동일 bracket 선택).
 *
 * @param taxBase 과세표준
 * @param brackets 세율 구간 (기본값: DEFAULT_INHERITANCE_GIFT_BRACKETS)
 * @returns { rate, deduction } — taxBase<=0 이면 { 0, 0 }
 */
export function findApplicableBracket(
  taxBase: number,
  brackets: TaxBracketBase[] = DEFAULT_INHERITANCE_GIFT_BRACKETS,
): { rate: number; deduction: number } {
  if (taxBase <= 0) return { rate: 0, deduction: 0 };
  const b =
    brackets.find((x) => x.max === null || taxBase <= x.max) ??
    brackets[brackets.length - 1];
  return { rate: b.rate, deduction: b.deduction };
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
 * @param nonHeirNonLegateeGifts 상속인·수유자 외 자(영리법인 등)가 받은 사전증여 가산가액
 *   서서이-1447, 2008.6.17.: §27 ① 분모 "총상속재산가액"에서 영리법인 등의 증여재산은 차감.
 *   분모 = totalEstateValue − nonHeirNonLegateeGifts. 상속세만 적용 (gift 모드는 무시).
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
  nonHeirNonLegateeGifts?: number,
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
    // 안분 분모 보정: 상속세만 — 영리법인 등 상속인·수유자 외 자가 받은 증여재산 차감 (서서이-1447)
    const denominatorAdjustment =
      mode === "inheritance" && nonHeirNonLegateeGifts != null
        ? nonHeirNonLegateeGifts
        : 0;
    const adjustedDenominator = totalEstateValue! - denominatorAdjustment;

    // PDF 종합사례 (책 1864): floor(산출세액 × 세대생략재산 / 분모 × 할증율) — 단일 floor
    surchargeAmount = Math.floor(
      (computedTax * generationSkipAssetAmount! * surchargeRate) /
        adjustedDenominator,
    );
    breakdown.push({
      label: `세대생략 할증 — 안분기준 (산출세액 × 세대생략재산 / 분모)`,
      amount: Math.floor(
        (computedTax * generationSkipAssetAmount!) / adjustedDenominator,
      ),
      note: `${generationSkipAssetAmount!.toLocaleString()} / ${adjustedDenominator.toLocaleString()}${
        denominatorAdjustment > 0
          ? ` (총상속 ${totalEstateValue!.toLocaleString()} − 영리법인 등 ${denominatorAdjustment.toLocaleString()})`
          : ""
      }`,
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
// §57 할증과세 한도 산식 (Phase A — 사례 2 PDF ⑧⑨⑩⑪⑫⑬ 재현용)
// ============================================================

/**
 * 증여세 §57 세대생략 할증과세 + 한도 안분 (donorGroup="B" 일 때만 활성).
 *
 * 산식 (PDF 사례 2 박스):
 *   ⑧ surchargeBase = floor(⑦ × 비율 × 할증율)
 *     비율 = (부모 제외 직계존속 ① 누계 + 현 회차 ①) / (priorTotal + 현 회차 ①)
 *     할증율 = 0.30 원칙 / 0.40 미성년+20억 초과
 *   ⑩ surchargeCreditLimit = floor(⑦ × ⑤_prior / ⑤ × 할증율)
 *   ⑪ priorSurchargeCredit = Min(⑨, ⑩)
 *   ⑫ additionalSurcharge = Max(0, ⑧ − ⑪)
 *   ⑬ totalComputedTaxWithSurcharge = ⑦ + ⑫
 *
 * @param computedTax 산출세액 ⑦
 * @param donorGroup 현재 증여자 그룹 — "B" 일 때만 §57 활성
 * @param isMinorDonee 수증자 미성년 여부
 * @param currentGiftValue 금번 증여재산가액 ① (할증율 40% 판정 기준)
 * @param priorAggregation 사전증여 합산 결과
 * @param aggregatedTaxBase 금번 합산과세표준 ⑤
 */
export function calcGiftGenerationSkipSurchargeWithLimit(
  computedTax: number,
  donorGroup: DonorGroup,
  isMinorDonee: boolean,
  currentGiftValue: number,
  priorAggregation: PriorAggregationResult,
  aggregatedTaxBase: number,
): {
  detail: GenerationSkipSurchargeDetail | null;
  additionalSurcharge: number;
  breakdown: CalculationStep[];
} {
  // §57 적용 조건: 그룹 B (조부모 → 손자녀) 만
  if (donorGroup !== "B" || computedTax <= 0) {
    return { detail: null, additionalSurcharge: 0, breakdown: [] };
  }

  const SURCHARGE_THRESHOLD_FOR_40 = 2_000_000_000;
  const surchargeRate =
    isMinorDonee && currentGiftValue > SURCHARGE_THRESHOLD_FOR_40 ? 0.4 : 0.3;

  // 비율 분자: 부모 제외 직계존속 ① 누계 + 현 회차 ① (donorGroup="B" 이므로 현 회차 ① 전체 포함)
  const nonParentLinealTotal =
    priorAggregation.nonParentLinealAmount + currentGiftValue;
  const totalGiftAmount = priorAggregation.totalAmount + currentGiftValue;
  const ratio = totalGiftAmount === 0 ? 0 : nonParentLinealTotal / totalGiftAmount;

  // ⑧ 단일 floor — 이중 floor 회피 (PDF anchor 일치)
  const surchargeBase = Math.floor(computedTax * ratio * surchargeRate);

  // ⑩ 한도 = ⑦ × ⑤_prior / ⑤ × 할증율 (단일 floor)
  const surchargeCreditLimit =
    aggregatedTaxBase === 0
      ? 0
      : Math.floor(
          (computedTax * priorAggregation.priorAddedTaxBase) / aggregatedTaxBase *
            surchargeRate,
        );

  // ⑪ 차감 기할증과세액
  const priorSurchargeCredit = Math.min(
    priorAggregation.totalAdditionalSurcharge,
    surchargeCreditLimit,
  );

  // ⑫ 추가 할증세액
  const additionalSurcharge = Math.max(0, surchargeBase - priorSurchargeCredit);

  const detail: GenerationSkipSurchargeDetail = {
    surchargeBase,
    nonParentLinealRatio: ratio,
    surchargeRate,
    priorAdditionalCumulative: priorAggregation.totalAdditionalSurcharge,
    surchargeCreditLimit,
    priorSurchargeCredit,
    additionalSurcharge,
    totalComputedTaxWithSurcharge: computedTax + additionalSurcharge,
  };

  const breakdown: CalculationStep[] = [
    {
      label: `⑧ 할증과세 (⑦ × ${(ratio * 100).toFixed(0)}% × ${surchargeRate * 100}%)`,
      amount: surchargeBase,
      lawRef: GIFT.GENERATION_SKIP,
    },
    {
      label: "⑨ 누적 기할증과세액 (Σ⑫_prior)",
      amount: priorAggregation.totalAdditionalSurcharge,
    },
    {
      label: "⑩ 공제한도 (⑦ × 가산과표/합산과표 × 할증율)",
      amount: surchargeCreditLimit,
      lawRef: GIFT.GENERATION_SKIP_LIMIT_FORMULA,
    },
    {
      label: "⑪ 차감 기할증과세액 Min(⑨,⑩)",
      amount: priorSurchargeCredit,
    },
    {
      label: "⑫ 추가 할증세액 (⑧ − ⑪)",
      amount: additionalSurcharge,
      lawRef: GIFT.GENERATION_SKIP,
    },
    {
      label: "⑬ 산출세액합계 (⑦ + ⑫)",
      amount: computedTax + additionalSurcharge,
    },
  ];

  return { detail, additionalSurcharge, breakdown };
}

// ============================================================
// 10년 이내 사전증여재산 합산 (§13 / §47)
// ============================================================

/**
 * §13 cutoff 판정 — 사전증여 합산 시기 도과 여부.
 *
 * 상증법 §13 ① 1호: 상속인 — 10년 이내
 * 상증법 §13 ① 2호: 상속인 아닌 자 (영리법인 포함 통설) — 5년 이내
 *
 * single source of truth — `aggregatePriorGiftsForInheritance` + `inheritance-tax.ts`
 * STEP 10 corporate 필터 양쪽에서 재사용 ([[single-source-engine-helper]] 정책).
 *
 * @param gift 사전증여 항목
 * @param deathDate 상속개시일 (ISO date)
 * @returns true: 합산 대상 / false: cutoff (도과)
 */
/**
 * §13 cutoff 판정 — **일(日) 단위** 비교.
 *
 * 상증법 §13①: "상속개시일 전 N년 이내" = 증여일 >= subYears(deathDate, N)
 * 민법 §160②: 기간 종료일 = 기산일에 해당하는 날의 전일.
 * boundary = subYears(deathDate, limitYears) 가 경계 기산일에 해당하는 날.
 * 증여일이 boundary 당일이면 포함(§13의 "이내"), 전날이면 제외.
 *
 * 수정 이력: differenceInYears(만 연수 절사) → !isBefore(giftDate, boundary)
 *   - 구버전: elapsedYears <= limitYears — 경계일 1~364일 이전 도과분까지 포함하는 버그
 *   - 신버전: 일(日) 단위 — deathDate=2026-05-21, limit=5 → boundary=2021-05-21
 *            giftDate=2021-05-21 → 포함 / giftDate=2021-05-20 → 제외
 */
export function isWithin13Cutoff(gift: PriorGift, deathDate: string): boolean {
  const giftDate = new Date(gift.giftDate);
  const limitYears = gift.isHeir ? 10 : 5;
  const boundary = subYears(new Date(deathDate), limitYears);
  // !isBefore === giftDate >= boundary (경계 포함)
  return !isBefore(giftDate, boundary);
}

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
  const breakdown: CalculationStep[] = [];
  let totalAmount = 0;

  for (const gift of priorGifts) {
    // §13 ①1호 (상속인 10년) / 2호 (비상속인 5년) cutoff — isWithin13Cutoff 헬퍼 사용
    if (heirIdsOnly && !gift.isHeir) continue;
    if (!isWithin13Cutoff(gift, deathDate)) continue;

    totalAmount += gift.giftAmount;
    breakdown.push({
      label: `사전증여 합산 (${gift.giftDate}, ${gift.isHeir ? "상속인" : "비상속인"})`,
      amount: gift.giftAmount,
      lawRef: INH.TAXABLE_VALUE,
    });
  }

  return { totalAmount, breakdown };
}

// ============================================================
// 장례비 공제 계산 (§14 ③)
// ============================================================

/** 장례비 최소값 (증빙 없어도 인정): 500만원 — single-source-engine-helper (사이드바 추정에서도 import) */
export const FUNERAL_MIN = 5_000_000;

/** 장례비 일반(식대) 한도: 1,000만원 (상증법 시행령 §9 ①) */
export const FUNERAL_GENERAL_MAX = 10_000_000;

/** 봉안시설·자연장지 추가 한도: 500만원 */
export const FUNERAL_BONGAN_EXTRA = 5_000_000;

/**
 * 장례비 행별 한도 적용 (debtItems 경로) — 식대(비봉안) 합계 1,000만, 봉안 합계 500만.
 * 카테고리별 잔여 한도를 순차 소진하며 각 행의 한도내 공제 인정액을 반환.
 * 합계(Σ 반환값) = min(식대합, 1,000만) + min(봉안합, 500만) = 엔진 funeralDeduction.
 */
export function capFuneralRowAmounts(
  rows: { amount: number; isBongan: boolean }[],
): number[] {
  let mealBudget = FUNERAL_GENERAL_MAX;
  let bonganBudget = FUNERAL_BONGAN_EXTRA;
  return rows.map((r) => {
    const raw = Math.max(r.amount, 0);
    if (r.isBongan) {
      const allowed = Math.min(raw, bonganBudget);
      bonganBudget -= allowed;
      return allowed;
    }
    const allowed = Math.min(raw, mealBudget);
    mealBudget -= allowed;
    return allowed;
  });
}

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

// ============================================================
// §27 세대생략 — 미성년 판정 헬퍼
// ============================================================

/**
 * §27② 미성년 판정 (민법 §4: 19세 미만).
 *
 * 우선순위:
 *   1. heir.isMinorOverride != null → 수동 override (true/false)
 *   2. heir.birthDate 존재 → differenceInYears(deathDate, birthDate) < 19
 *   3. 미입력 → false (보수적 — 30% 적용)
 *
 * @param heir 상속인·수유자 정보
 * @param deathDate 상속개시일 (Date | string)
 */
export function resolveMinorBeneficiary(
  heir: Heir,
  deathDate: Date | string,
): boolean {
  if (heir.isMinorOverride != null) return heir.isMinorOverride;
  if (heir.birthDate) {
    const death = typeof deathDate === "string" ? new Date(deathDate) : deathDate;
    const birth = new Date(heir.birthDate);
    return differenceInYears(death, birth) < 19;
  }
  return false;
}
