/**
 * 조세특례제한법 증여세 과세특례
 *
 * §30의5 — 창업자금 증여세 과세특례
 *   요건: 60세 이상 부모 → 18세 이상 자녀, 창업 목적
 *   공제: 5억원
 *   세율: 10% (과세표준 50억 이하) / 20% (초과분)
 *   최대 공제 한도: 100억 (일반) / 120억 (1인 창업)
 *
 * §30의6 — 가업승계 증여세 과세특례
 *   요건: 10년 이상 가업 영위 중소·중견기업 주식 증여
 *   공제: 10억원
 *   세율: 10% (과세표준 600억 이하)
 *   최대 공제 가업재산: 10년 이상 300억, 20년 이상 500억, 30년 이상 600억
 *
 * 특례 세액 = 일반 증여세 산출세액 - 특례 세액공제
 * specialTreatmentCredit = 일반세액 - 특례세액 (절감액)
 */

import { TAX_CREDIT } from "../legal-codes";
import { applyRate } from "../tax-utils";
import type { TaxBracket } from "../types";
import type { CalculationStep } from "../types/inheritance-gift.types";
import { calculateProgressiveTax } from "../tax-utils";

// ============================================================
// 창업자금 특례 상수 (§30의5)
// ============================================================

/** 창업자금 기본 공제: 5억원 */
const STARTUP_BASE_DEDUCTION = 500_000_000;

/** 창업자금 특례세율 하한 (10% 적용 과세표준 한도): 50억원 */
const STARTUP_LOW_RATE_LIMIT = 5_000_000_000;

/** 창업자금 특례 세율 (50억 이하): 10% */
const STARTUP_RATE_LOW = 0.1;

/** 창업자금 특례 세율 (50억 초과): 20% */
const STARTUP_RATE_HIGH = 0.2;

// ============================================================
// 가업승계 특례 상수 (§30의6)
// ============================================================

/** 가업승계 기본 공제: 10억원 */
const FAMILY_BUSINESS_BASE_DEDUCTION = 1_000_000_000;

/** 가업승계 특례세율: 10% (600억 이하) */
const FAMILY_BUSINESS_RATE = 0.1;

/** 가업승계 특례 상한 (30년 이상): 600억원 */
const FAMILY_BUSINESS_MAX_LIMIT = 60_000_000_000;

// ============================================================
// 창업자금 특례 계산
// ============================================================

export interface StartupFundTaxInput {
  /** 창업자금 증여재산가액 (비과세·공제 전) */
  giftAmount: number;
  /** 일반 증여세 산출세액 (절감액 계산용) */
  normalComputedTax: number;
  /**
   * 창업자금 투자 완료 여부 (§30의5 ④)
   * 증여일로부터 2년 이내 창업법인 설립·투자 완료 필수.
   * false이면 특례 미적용 처리 (사후관리 위반 시 추징 가능).
   */
  startupInvestmentCompleted?: boolean;
}

export interface SpecialTreatmentResult {
  /** 특례 적용 산출세액 */
  specialTax: number;
  /** 절감액 (일반세액 - 특례세액) — TaxCreditResult.specialTreatmentCredit 에 저장 */
  creditAmount: number;
  breakdown: CalculationStep[];
}

/**
 * 창업자금 증여세 과세특례 계산 (§30의5)
 */
export function calcStartupFundSpecialTax(
  input: StartupFundTaxInput,
): SpecialTreatmentResult {
  const { giftAmount, normalComputedTax, startupInvestmentCompleted } = input;

  // 투자 미완료 시 특례 불적용 (§30의5 ④ 위반 → 사후추징 대상)
  if (startupInvestmentCompleted === false) {
    return {
      specialTax: normalComputedTax,
      creditAmount: 0,
      breakdown: [
        {
          label: "창업자금 특례 미적용 — 투자 완료 조건 미충족",
          amount: normalComputedTax,
          lawRef: TAX_CREDIT.STARTUP_FUND,
          note: "증여일로부터 2년 이내 창업 및 투자 완료 필요 (§30의5 ④)",
        },
      ],
    };
  }

  // 특례 과세표준 = 증여재산가액 - 5억 공제
  const taxBase = Math.max(0, giftAmount - STARTUP_BASE_DEDUCTION);

  let specialTax = 0;
  const breakdown: CalculationStep[] = [
    {
      label: "창업자금 증여재산가액",
      amount: giftAmount,
      lawRef: TAX_CREDIT.STARTUP_FUND,
    },
    {
      label: "창업자금 기본 공제 (5억)",
      amount: -STARTUP_BASE_DEDUCTION,
      lawRef: TAX_CREDIT.STARTUP_FUND,
    },
    {
      label: "특례 과세표준",
      amount: taxBase,
    },
  ];

  if (taxBase <= 0) {
    // 과세표준 0 이하: 증여세 없음
    breakdown.push({ label: "창업자금 특례세액", amount: 0 });
    const creditAmount = Math.max(0, normalComputedTax);
    return { specialTax: 0, creditAmount, breakdown };
  }

  if (taxBase <= STARTUP_LOW_RATE_LIMIT) {
    // 50억 이하: 단일 10%
    specialTax = applyRate(taxBase, STARTUP_RATE_LOW);
    breakdown.push({
      label: `특례세액 (10% × 과세표준 ${taxBase.toLocaleString()}원)`,
      amount: specialTax,
      lawRef: TAX_CREDIT.STARTUP_FUND,
    });
  } else {
    // 50억 초과: 50억분 10% + 초과분 20%
    const lowPart = applyRate(STARTUP_LOW_RATE_LIMIT, STARTUP_RATE_LOW);
    const excessPart = applyRate(taxBase - STARTUP_LOW_RATE_LIMIT, STARTUP_RATE_HIGH);
    specialTax = lowPart + excessPart;
    breakdown.push(
      {
        label: `특례세액 (50억 이하 10%: ${lowPart.toLocaleString()}원)`,
        amount: lowPart,
        lawRef: TAX_CREDIT.STARTUP_FUND,
      },
      {
        label: `특례세액 (50억 초과 20%: ${excessPart.toLocaleString()}원)`,
        amount: excessPart,
        lawRef: TAX_CREDIT.STARTUP_FUND,
      },
    );
  }

  const creditAmount = Math.max(0, normalComputedTax - specialTax);
  breakdown.push({
    label: `일반세액 대비 절감 (공제 인정액)`,
    amount: creditAmount,
    note: `일반 ${normalComputedTax.toLocaleString()}원 - 특례 ${specialTax.toLocaleString()}원`,
  });

  return { specialTax, creditAmount, breakdown };
}

// ============================================================
// 가업승계 특례 계산
// ============================================================

export interface FamilyBusinessTaxInput {
  /** 가업승계 주식 증여가액 */
  giftAmount: number;
  /** 가업 영위 기간 (년) — 한도 계산용 */
  businessYears: number;
  /** 일반 증여세 산출세액 (절감액 계산용) */
  normalComputedTax: number;
}

/**
 * 가업상속재산 가액 한도 (§30의6 ① — 영위 기간별)
 */
export function getFamilyBusinessLimit(businessYears: number): number {
  if (businessYears >= 30) return FAMILY_BUSINESS_MAX_LIMIT; // 600억
  if (businessYears >= 20) return 50_000_000_000;             // 500억
  if (businessYears >= 10) return 30_000_000_000;             // 300억
  return 0; // 10년 미만: 특례 불가
}

/**
 * 가업승계 증여세 과세특례 계산 (§30의6)
 */
export function calcFamilyBusinessSpecialTax(
  input: FamilyBusinessTaxInput,
): SpecialTreatmentResult {
  const { giftAmount, businessYears, normalComputedTax } = input;

  const limit = getFamilyBusinessLimit(businessYears);
  const breakdown: CalculationStep[] = [
    {
      label: "가업승계 증여재산가액",
      amount: giftAmount,
      lawRef: TAX_CREDIT.FAMILY_BUSINESS,
    },
  ];

  if (limit === 0) {
    breakdown.push({
      label: "가업승계 특례 불가 — 영위 기간 10년 미만",
      amount: 0,
      lawRef: TAX_CREDIT.FAMILY_BUSINESS,
    });
    return { specialTax: normalComputedTax, creditAmount: 0, breakdown };
  }

  // 한도 초과분은 일반 과세 (특례 외)
  const eligibleAmount = Math.min(giftAmount, limit);
  if (eligibleAmount < giftAmount) {
    breakdown.push({
      label: `가업승계 특례 한도 (${(limit / 1_0000_0000).toFixed(0)}억)`,
      amount: eligibleAmount,
      note: `한도 초과 ${(giftAmount - eligibleAmount).toLocaleString()}원은 일반 증여세`,
    });
  }

  // 특례 과세표준 = 특례 적용 가액 - 10억 공제
  const taxBase = Math.max(0, eligibleAmount - FAMILY_BUSINESS_BASE_DEDUCTION);

  breakdown.push(
    {
      label: "가업승계 기본 공제 (10억)",
      amount: -FAMILY_BUSINESS_BASE_DEDUCTION,
      lawRef: TAX_CREDIT.FAMILY_BUSINESS,
    },
    {
      label: "특례 과세표준",
      amount: taxBase,
    },
  );

  // 특례세율: 10% (한도 내)
  const specialTax = applyRate(taxBase, FAMILY_BUSINESS_RATE);

  breakdown.push({
    label: `가업승계 특례세액 (10% × ${taxBase.toLocaleString()}원)`,
    amount: specialTax,
    lawRef: TAX_CREDIT.FAMILY_BUSINESS,
  });

  const creditAmount = Math.max(0, normalComputedTax - specialTax);
  breakdown.push({
    label: "일반세액 대비 절감 (공제 인정액)",
    amount: creditAmount,
    note: `일반 ${normalComputedTax.toLocaleString()}원 - 특례 ${specialTax.toLocaleString()}원`,
  });

  return { specialTax, creditAmount, breakdown };
}

// ============================================================
// 특례 통합 계산
// ============================================================

export type SpecialTreatmentType = "startup" | "family_business";

export interface SpecialTreatmentInput {
  type: SpecialTreatmentType;
  giftAmount: number;
  normalComputedTax: number;
  /** 창업자금 전용 — 투자 완료 여부 */
  startupInvestmentCompleted?: boolean;
  /** 가업승계 전용 */
  businessYears?: number;
  /** 일반 누진세율 구간 (§26) */
  brackets?: TaxBracket[];
}

/**
 * 조특법 과세특례 통합 계산
 */
export function calcSpecialTaxTreatment(
  input: SpecialTreatmentInput,
): SpecialTreatmentResult {
  if (input.type === "startup") {
    return calcStartupFundSpecialTax({
      giftAmount: input.giftAmount,
      normalComputedTax: input.normalComputedTax,
      startupInvestmentCompleted: input.startupInvestmentCompleted,
    });
  }

  return calcFamilyBusinessSpecialTax({
    giftAmount: input.giftAmount,
    businessYears: input.businessYears ?? 10,
    normalComputedTax: input.normalComputedTax,
  });
}
