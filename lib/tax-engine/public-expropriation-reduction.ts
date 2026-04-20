import { TRANSFER } from "./legal-codes";
import { applyRate, safeMultiplyThenDivide } from "./tax-utils";

export const PUBLIC_EXPROPRIATION_RATES = Object.freeze({
  CURRENT: Object.freeze({ cash: 0.10, bond: 0.15, bond3y: 0.30, bond5y: 0.40 }),
  LEGACY:  Object.freeze({ cash: 0.20, bond: 0.25, bond3y: 0.40, bond5y: 0.50 }),
});

export const PUBLIC_EXPROPRIATION_ANNUAL_LIMIT = 200_000_000;
export const LEGACY_APPROVAL_CUTOFF = new Date("2015-12-31T23:59:59");
export const LEGACY_TRANSFER_CUTOFF = new Date("2017-12-31T23:59:59");

export interface PublicExpropriationReductionInput {
  cashCompensation: number;
  bondCompensation: number;
  bondHoldingYears?: 3 | 5 | null;
  businessApprovalDate: Date;
  transferDate: Date;
  calculatedTax: number;
  /** 양도소득금액 = 양도차익 − 장기보유특별공제 (기본공제 차감 전) */
  transferIncome: number;
  /** 실제 적용된 기본공제 (당해 연도 한도 내 잔여) */
  basicDeduction: number;
  /** 과세표준 = 양도소득금액 − 기본공제 (산출세액 분모) */
  taxBase: number;
}

export interface PublicExpropriationReductionResult {
  isEligible: boolean;
  reductionAmount: number;
  rawReductionAmount: number;
  weightedRate: number;
  breakdown: {
    cashRate: number;
    bondRate: number;
    cashAmount: number;
    bondAmount: number;
    /** 현금보상분 감면소득금액 = 양도소득금액 × 현금 / 총보상 */
    cashIncome: number;
    /** 채권보상분 감면소득금액 = 양도소득금액 − 현금분 */
    bondIncome: number;
    /** 현금분에 배정된 기본공제 (§103② 감면율 낮은 자산 우선) */
    basicDeductionOnCash: number;
    /** 채권분에 배정된 기본공제 (낮은쪽 소득이 기본공제보다 작을 때 잔여분) */
    basicDeductionOnBond: number;
    /** 현금 감면금액 = (현금분 − 현금 기본공제) × 현금율 */
    cashReduction: number;
    /** 채권 감면금액 = (채권분 − 채권 기본공제) × 채권율 */
    bondReduction: number;
    /** 감면대상소득금액 = 현금 감면금액 + 채권 감면금액 */
    reducibleIncome: number;
  };
  useLegacyRates: boolean;
  cappedByAnnualLimit: boolean;
  appliedAnnualLimit: number;
  legalBasis: string;
  warnings: string[];
  notEligibleReason?: string;
}

function pickBondRate(
  rates: { bond: number; bond3y: number; bond5y: number },
  bondHoldingYears: 3 | 5 | null | undefined,
): number {
  if (bondHoldingYears === 5) return rates.bond5y;
  if (bondHoldingYears === 3) return rates.bond3y;
  return rates.bond;
}

function emptyBreakdown(input: PublicExpropriationReductionInput) {
  return {
    cashRate: 0,
    bondRate: 0,
    cashAmount: input.cashCompensation,
    bondAmount: input.bondCompensation,
    cashIncome: 0,
    bondIncome: 0,
    basicDeductionOnCash: 0,
    basicDeductionOnBond: 0,
    cashReduction: 0,
    bondReduction: 0,
    reducibleIncome: 0,
  };
}

export function calculatePublicExpropriationReduction(
  input: PublicExpropriationReductionInput,
): PublicExpropriationReductionResult {
  const warnings: string[] = [];
  const totalCompensation = input.cashCompensation + input.bondCompensation;

  // 비적격 조기 반환
  if (
    totalCompensation <= 0 ||
    input.calculatedTax <= 0 ||
    input.transferIncome <= 0 ||
    input.taxBase <= 0
  ) {
    return {
      isEligible: false,
      reductionAmount: 0,
      rawReductionAmount: 0,
      weightedRate: 0,
      breakdown: emptyBreakdown(input),
      useLegacyRates: false,
      cappedByAnnualLimit: false,
      appliedAnnualLimit: PUBLIC_EXPROPRIATION_ANNUAL_LIMIT,
      legalBasis: TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION,
      warnings,
      notEligibleReason:
        totalCompensation <= 0
          ? "보상액(현금+채권) 합계가 0 이하입니다"
          : input.calculatedTax <= 0
            ? "산출세액이 0 이하입니다"
            : input.transferIncome <= 0
              ? "양도소득금액이 0 이하입니다"
              : "과세표준이 0 이하입니다",
    };
  }

  // ── 감면율 결정 (부칙 §53) ──
  const useLegacyRates =
    input.businessApprovalDate <= LEGACY_APPROVAL_CUTOFF &&
    input.transferDate <= LEGACY_TRANSFER_CUTOFF;

  const rateSet = useLegacyRates
    ? PUBLIC_EXPROPRIATION_RATES.LEGACY
    : PUBLIC_EXPROPRIATION_RATES.CURRENT;

  const cashRate = rateSet.cash;
  const bondRate = pickBondRate(rateSet, input.bondHoldingYears);

  // ── ① 양도소득금액을 보상액 비율로 안분 ──
  //   현금분 = floor(양도소득금액 × 현금 / 총보상)
  //   채권분 = 양도소득금액 − 현금분 (잔여값 = 합계 정확 일치)
  const cashIncome =
    input.cashCompensation > 0
      ? safeMultiplyThenDivide(
          input.transferIncome,
          input.cashCompensation,
          totalCompensation,
        )
      : 0;
  const bondIncome = Math.max(0, input.transferIncome - cashIncome);

  // ── ② 기본공제 배정 (소득세법 §103② — 감면율 낮은 자산에서 먼저 차감) ──
  const basicDeduction = Math.max(0, input.basicDeduction);
  let basicDeductionOnCash = 0;
  let basicDeductionOnBond = 0;

  const onlyCash = input.bondCompensation <= 0;
  const onlyBond = input.cashCompensation <= 0;

  if (onlyCash) {
    basicDeductionOnCash = Math.min(basicDeduction, cashIncome);
  } else if (onlyBond) {
    basicDeductionOnBond = Math.min(basicDeduction, bondIncome);
  } else {
    const cashIsLower = cashRate <= bondRate;
    if (cashIsLower) {
      basicDeductionOnCash = Math.min(basicDeduction, cashIncome);
      basicDeductionOnBond = Math.min(
        basicDeduction - basicDeductionOnCash,
        bondIncome,
      );
    } else {
      basicDeductionOnBond = Math.min(basicDeduction, bondIncome);
      basicDeductionOnCash = Math.min(
        basicDeduction - basicDeductionOnBond,
        cashIncome,
      );
    }
  }

  // ── ③ 자산별 감면금액 (원 미만 절사) ──
  const cashTaxable = Math.max(0, cashIncome - basicDeductionOnCash);
  const bondTaxable = Math.max(0, bondIncome - basicDeductionOnBond);
  const cashReduction = applyRate(cashTaxable, cashRate);
  const bondReduction = applyRate(bondTaxable, bondRate);
  const reducibleIncome = cashReduction + bondReduction;

  // ── ④ 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준 ──
  const rawReductionAmount = safeMultiplyThenDivide(
    input.calculatedTax,
    reducibleIncome,
    input.taxBase,
  );

  // ── ⑤ 연간 한도(조특법 §133 2억원) capping ──
  const cappedByAnnualLimit = rawReductionAmount > PUBLIC_EXPROPRIATION_ANNUAL_LIMIT;
  const reductionAmount = Math.min(
    rawReductionAmount,
    PUBLIC_EXPROPRIATION_ANNUAL_LIMIT,
    input.calculatedTax,
  );

  const weightedRate =
    input.calculatedTax > 0 ? reductionAmount / input.calculatedTax : 0;

  if (cappedByAnnualLimit) {
    warnings.push(
      `감면세액이 연간 한도 ${PUBLIC_EXPROPRIATION_ANNUAL_LIMIT.toLocaleString()}원을 초과하여 한도로 capping되었습니다 (조특법 §133)`,
    );
  }
  if (useLegacyRates) {
    warnings.push(
      `사업인정고시일(${input.businessApprovalDate.toISOString().slice(0, 10)})이 2015-12-31 이전이고 양도일(${input.transferDate.toISOString().slice(0, 10)})이 2017-12-31 이전이므로 종전 감면율 적용 (조특법 부칙 §53)`,
    );
  }
  if (input.bondHoldingYears && input.bondCompensation <= 0) {
    warnings.push("채권 만기특약이 선택됐으나 채권보상액이 0입니다");
  }

  return {
    isEligible: true,
    reductionAmount,
    rawReductionAmount,
    weightedRate,
    breakdown: {
      cashRate,
      bondRate,
      cashAmount: input.cashCompensation,
      bondAmount: input.bondCompensation,
      cashIncome,
      bondIncome,
      basicDeductionOnCash,
      basicDeductionOnBond,
      cashReduction,
      bondReduction,
      reducibleIncome,
    },
    useLegacyRates,
    cappedByAnnualLimit,
    appliedAnnualLimit: PUBLIC_EXPROPRIATION_ANNUAL_LIMIT,
    legalBasis: useLegacyRates
      ? `${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION} + ${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL}`
      : TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION,
    warnings,
  };
}
