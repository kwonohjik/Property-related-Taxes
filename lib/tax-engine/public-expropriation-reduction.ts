import { subYears } from "date-fns";
import { TRANSFER } from "./legal-codes";
import { applyRate, safeMultiplyThenDivide } from "./tax-utils";

/**
 * 조특법 §77① 감면율 — 경계는 **2025-01-01 양도분**이다.
 *
 * 개정: 법률 **제20778호**(공포·시행 **2025-03-14**). 같은 법 **부칙 제10조**
 *   「제77조제1항 및 제4항의 개정규정은 이 법 시행일이 **속하는 과세연도에 양도하는
 *    경우부터** 적용한다」 ⇒ 시행일이 속한 과세연도가 2025년(양도세 과세기간 1.1~12.31)
 *   이므로 **2025-01-01 양도분부터** 개정율이 간다(시행일 이전 양도분에도 소급).
 *
 * ⚠️ 시행일자별 본문만 보면 틀린다 — `efYd=20250101`은 10%, `efYd=20260101`은 15%라
 *   그 둘만 비교하면 「2026-01-01 시행」으로 오독하게 된다. 실제 갈림은 `efYd=20250314`
 *   (mst 269877)이고, 소급 여부는 **부칙**을 읽어야 확정된다.
 *   (코드리뷰 D7-01·D7-02가 이 함정에 빠져 오탐을 냈다 — anchor
 *    `expropriation-2025-amendment-boundary.anchor.test.ts`가 경계를 고정한다.)
 */
export const PUBLIC_EXPROPRIATION_RATES = Object.freeze({
  // 2018-01-01 ~ 2024-12-31 양도분 (개정 전)
  CURRENT_2018: Object.freeze({ cash: 0.10, bond: 0.15, bond3y: 0.30, bond5y: 0.40 }),
  // 2025-01-01 이후 양도분 (법률 제20778호, 부칙 §10 — 과세연도 단위 소급)
  AMENDED_2025: Object.freeze({ cash: 0.15, bond: 0.20, bond3y: 0.35, bond5y: 0.45 }),
  // 부칙 §53 — 2015-12-31 이전 고시 + 2017-12-31 이전 양도
  LEGACY:  Object.freeze({ cash: 0.20, bond: 0.25, bond3y: 0.40, bond5y: 0.50 }),
});

/**
 * @deprecated 양도연도 분기 — getInvoluntaryTransferLimits(year).annual 사용.
 * 2025+ 값(2억) 유지 (하위호환 · 테스트 참조).
 */
export const PUBLIC_EXPROPRIATION_ANNUAL_LIMIT = 200_000_000;

/**
 * 조특법 §133② 비자발적 양도(§77·§77의2·§77의3) 감면 종합한도 — 양도연도 분기.
 *
 * §133②는 법률 **제20778호**(공포·시행 2025-03-14)로 **신설**됐고, 같은 법 **부칙 제15조①**
 * 「제133조제1항부터 제3항까지의 개정규정은 이 법 시행일이 **속하는 과세연도에 양도하는
 *  경우부터** 적용한다」에 따라 **2025 과세연도 양도분부터** 연 2억 / 5년 3억이다.
 * 2024년 이전 양도분은 §133①에 §77 계열이 함께 열거돼 자경 계열과 **1억을 공유**한다
 * (그룹 «구성» 자체가 갈린다 — `buildLimitGroups` 참조).
 */
export function getInvoluntaryTransferLimits(
  transferYear: number,
): { annual: number; fiveYear: number } {
  return transferYear >= 2025
    ? { annual: 200_000_000, fiveYear: 300_000_000 }
    : { annual: 100_000_000, fiveYear: 200_000_000 };
}

export const AMENDED_2025_TRANSFER_CUTOFF = new Date("2025-01-01T00:00:00");
export const LEGACY_APPROVAL_CUTOFF = new Date("2015-12-31T23:59:59");
export const LEGACY_TRANSFER_CUTOFF = new Date("2017-12-31T23:59:59");
/** 조특법 §77① 일몰 — 2026.12.31 이전 양도분에 한정(양도일 기준). */
export const PUBLIC_EXPROPRIATION_SUNSET = new Date("2026-12-31T23:59:59");

export interface PublicExpropriationReductionInput {
  cashCompensation: number;
  bondCompensation: number;
  bondHoldingYears?: 3 | 5 | null;
  businessApprovalDate: Date;
  /** 취득일(상속 시 피상속인 취득일) — §77① '고시일 소급 2년 이전 취득' 요건 검증용. 미제공 시 요건 미검증(하위호환). */
  acquisitionDate?: Date;
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
  /** 적용 감면율 세트 — 결과 카드 배지 (2025 개정율 안내용) */
  rateSetApplied: "current_2018" | "amended_2025" | "legacy";
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

  // 조특법 §77①: 사업인정고시일(고시 전 양도 시 양도일)부터 소급 2년 이전에 취득한 토지등에 한정.
  // acquisitionDate 미제공 시 검증 불가로 통과(하위호환) — 메인 파이프라인은 자산 취득일을 전달한다.
  const acqBaselineDate =
    input.transferDate < input.businessApprovalDate ? input.transferDate : input.businessApprovalDate;
  const failsAcqRequirement =
    input.acquisitionDate !== undefined && input.acquisitionDate > subYears(acqBaselineDate, 2);

  // 조특법 §77① 일몰: 2026.12.31 이전 양도분에 한정(양도일 기준).
  const failsSunset = input.transferDate > PUBLIC_EXPROPRIATION_SUNSET;

  // 비적격 조기 반환
  if (
    totalCompensation <= 0 ||
    input.calculatedTax <= 0 ||
    input.transferIncome <= 0 ||
    input.taxBase <= 0 ||
    failsAcqRequirement ||
    failsSunset
  ) {
    return {
      isEligible: false,
      reductionAmount: 0,
      rawReductionAmount: 0,
      weightedRate: 0,
      breakdown: emptyBreakdown(input),
      useLegacyRates: false,
      rateSetApplied:
        input.transferDate >= AMENDED_2025_TRANSFER_CUTOFF
          ? "amended_2025"
          : "current_2018",
      cappedByAnnualLimit: false,
      appliedAnnualLimit: getInvoluntaryTransferLimits(
        input.transferDate.getFullYear(),
      ).annual,
      legalBasis: TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION,
      warnings,
      notEligibleReason: failsSunset
        ? "양도일이 2026-12-31 이후입니다 (조특법 §77① 일몰)"
        : failsAcqRequirement
        ? "사업인정고시일부터 소급 2년 이전에 취득한 토지등이 아닙니다(조특법 §77①)"
        : totalCompensation <= 0
          ? "보상액(현금+채권) 합계가 0 이하입니다"
          : input.calculatedTax <= 0
            ? "산출세액이 0 이하입니다"
            : input.transferIncome <= 0
              ? "양도소득금액이 0 이하입니다"
              : "과세표준이 0 이하입니다",
    };
  }

  // ── 감면율 결정 (양도일 우선: 2025 개정 → 부칙 §53 → 현행) ──
  // 2025.1.1. 이후 양도분은 무조건 AMENDED_2025 (부칙 §53 legacy는 양도≤2017만 → 중첩 없음).
  const isAmended2025 = input.transferDate >= AMENDED_2025_TRANSFER_CUTOFF;
  const useLegacyRates =
    !isAmended2025 &&
    input.businessApprovalDate <= LEGACY_APPROVAL_CUTOFF &&
    input.transferDate <= LEGACY_TRANSFER_CUTOFF;

  const rateSetApplied: "current_2018" | "amended_2025" | "legacy" = isAmended2025
    ? "amended_2025"
    : useLegacyRates
      ? "legacy"
      : "current_2018";
  const rateSet = isAmended2025
    ? PUBLIC_EXPROPRIATION_RATES.AMENDED_2025
    : useLegacyRates
      ? PUBLIC_EXPROPRIATION_RATES.LEGACY
      : PUBLIC_EXPROPRIATION_RATES.CURRENT_2018;

  // ── 연간 한도 (조특법 §133② — 양도연도 분기: 2025+ 2억 / 이전 1억) ──
  const annualLimit = getInvoluntaryTransferLimits(
    input.transferDate.getFullYear(),
  ).annual;

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

  // ── ⑤ 연간 한도(조특법 §133② — 양도연도별) capping ──
  const cappedByAnnualLimit = rawReductionAmount > annualLimit;
  const reductionAmount = Math.min(
    rawReductionAmount,
    annualLimit,
    input.calculatedTax,
  );

  const weightedRate =
    input.calculatedTax > 0 ? reductionAmount / input.calculatedTax : 0;

  if (cappedByAnnualLimit) {
    warnings.push(
      `감면세액이 연간 한도 ${annualLimit.toLocaleString()}원을 초과하여 한도로 capping되었습니다 (조특법 §133②)`,
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
    rateSetApplied,
    cappedByAnnualLimit,
    appliedAnnualLimit: annualLimit,
    legalBasis: useLegacyRates
      ? `${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION} + ${TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION_TRANSITIONAL}`
      : TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION,
    warnings,
  };
}
