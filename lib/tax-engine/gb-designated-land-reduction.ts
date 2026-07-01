/**
 * 조특법 §77의3 — 개발제한구역 지정에 따른 매수대상 토지등에 대한 양도소득세 감면
 *
 * (KoreanLaw 현행 원문 확정 · 조특법 MST 280409, 시행 2026-07-01)
 *  ① 구역 내 토지 (§17 매수청구 / §20 협의매수), 2028.12.31.까지 양도:
 *     1호 지정일 이전 취득 + 취득~매수까지 소재지 거주 → 40%
 *     2호 매수(청구/협의)일부터 20년 이전 취득 + 거주    → 25%
 *  ② 해제 토지 (협의매수·수용), 2028.12.31.까지, 해제 1년(경제자유구역 5년) 내 사업인정고시 한정:
 *     1호 지정일 이전 취득 + 거주 → 40%  /  2호 고시일−20년 이전 취득 + 거주 → 25%
 *  ③ 상속 토지 = 피상속인 취득일. (§9의 §77⑨ 동형)
 *
 * §133② 종합한도(양도연도별): 2025+ 연간 2억 / 이전 1억 — getInvoluntaryTransferLimits.
 * ⚠️ sunset(2028-12-31)은 **양도일** 기준 (취득기한 아님) — period-check 재사용 금지.
 * ⚠️ 소재지 "거주"의 세부(연접 시·군 등)는 시행령 위임 → 본 엔진은 사용자 확인 boolean(MVP).
 */

import { subYears } from "date-fns";
import { TRANSFER } from "./legal-codes";
import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
import { getInvoluntaryTransferLimits } from "./public-expropriation-reduction";

export const GB_DESIGNATED_LAND_SUNSET = new Date("2028-12-31T23:59:59");

export interface GbDesignatedLandInput {
  /** ①구역 내 / ②해제 후 */
  branch: "in_zone" | "released";
  /** 취득일 (상속 시 피상속인 취득일을 주입 — §77의3③) */
  acquisitionDate: Date;
  /** 개발제한구역 지정일 */
  designationDate: Date;
  /** ①매수청구·협의매수일 / ②사업인정고시일 */
  triggerDate: Date;
  /** ②해제일 (branch="released" 시 필수) */
  releasedDate?: Date;
  /** ②경제자유구역 등 지정 → 해제~고시 허용기간 5년 (기본 1년) */
  freeEconZone?: boolean;
  /** 취득일~triggerDate 소재지 거주 요건 충족 (시행령 위임 세부 — 사용자 확인) */
  residedFromAcqToTrigger: boolean;
  transferDate: Date;
  calculatedTax: number;
  /** 양도소득금액 = 양도차익 − 장기보유특별공제 (기본공제 차감 전) */
  transferIncome: number;
  /** 실제 적용된 기본공제 */
  basicDeduction: number;
  /** 과세표준 = 양도소득금액 − 기본공제 (산출세액 분모) */
  taxBase: number;
}

export interface GbDesignatedLandResult {
  isEligible: boolean;
  reductionRate: 0 | 0.25 | 0.4;
  appliedClause?: "1호" | "2호";
  /** 감면대상소득금액 = (양도소득금액 − 기본공제) × 감면율 */
  reducibleIncome: number;
  rawReductionAmount: number;
  reductionAmount: number;
  cappedByAnnualLimit: boolean;
  appliedAnnualLimit: number;
  legalBasis: string;
  warnings: string[];
  notEligibleReason?: string;
}

function ineligible(
  reason: string,
  annualLimit: number,
): GbDesignatedLandResult {
  return {
    isEligible: false,
    reductionRate: 0,
    reducibleIncome: 0,
    rawReductionAmount: 0,
    reductionAmount: 0,
    cappedByAnnualLimit: false,
    appliedAnnualLimit: annualLimit,
    legalBasis: TRANSFER.REDUCTION_GB_DESIGNATED_LAND,
    warnings: [],
    notEligibleReason: reason,
  };
}

/** 40% 우선 → 25% → 0% 율 결정 (해제 게이트·거주·sunset 선검사 포함) */
function resolveRate(input: GbDesignatedLandInput): {
  rate: 0 | 0.25 | 0.4;
  clause?: "1호" | "2호";
  reason?: string;
} {
  if (input.transferDate > GB_DESIGNATED_LAND_SUNSET) {
    return { rate: 0, reason: "양도일이 2028-12-31 이후입니다 (§77의3 일몰)" };
  }
  // ②항 해제 게이트: 해제일부터 1년(경제자유구역 5년) 내 사업인정고시
  if (input.branch === "released") {
    if (!input.releasedDate) {
      return { rate: 0, reason: "해제분은 해제일 입력이 필요합니다" };
    }
    const allowedYears = input.freeEconZone ? 5 : 1;
    const cutoff = subYears(input.triggerDate, allowedYears);
    // 해제일 >= (사업인정고시일 − 허용연수) 여야 게이트 통과
    if (input.releasedDate < cutoff) {
      return {
        rate: 0,
        reason: `해제일부터 ${allowedYears}년 이내 사업인정고시 요건 미충족 (§77의3②)`,
      };
    }
  }
  if (!input.residedFromAcqToTrigger) {
    return { rate: 0, reason: "취득일~매수/고시일 소재지 거주 요건 미충족" };
  }
  // 1호 우선: 지정일 이전 취득 → 40%
  if (input.acquisitionDate < input.designationDate) {
    return { rate: 0.4, clause: "1호" };
  }
  // 2호: 매수/고시일부터 20년 이전 취득 → 25%
  if (input.acquisitionDate <= subYears(input.triggerDate, 20)) {
    return { rate: 0.25, clause: "2호" };
  }
  return {
    rate: 0,
    reason: "지정일 이후 취득이면서 매수/고시일부터 20년 이내 취득 (비적격)",
  };
}

export function calculateGbDesignatedLandReduction(
  input: GbDesignatedLandInput,
): GbDesignatedLandResult {
  const annualLimit = getInvoluntaryTransferLimits(
    input.transferDate.getFullYear(),
  ).annual;

  if (
    input.calculatedTax <= 0 ||
    input.transferIncome <= 0 ||
    input.taxBase <= 0
  ) {
    return ineligible(
      input.calculatedTax <= 0
        ? "산출세액이 0 이하입니다"
        : input.transferIncome <= 0
          ? "양도소득금액이 0 이하입니다"
          : "과세표준이 0 이하입니다",
      annualLimit,
    );
  }

  const { rate, clause, reason } = resolveRate(input);
  if (rate === 0) {
    return ineligible(reason ?? "감면 요건 미충족", annualLimit);
  }

  const warnings: string[] = [];
  // 감면대상소득금액 = (양도소득금액 − 기본공제) × 감면율
  const taxableIncome = Math.max(0, input.transferIncome - Math.max(0, input.basicDeduction));
  const reducibleIncome = applyRate(taxableIncome, rate);
  // 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준 (원 미만 절사)
  const rawReductionAmount = safeMultiplyThenDivide(
    input.calculatedTax,
    reducibleIncome,
    input.taxBase,
  );

  const cappedByAnnualLimit = rawReductionAmount > annualLimit;
  const reductionAmount = Math.min(rawReductionAmount, annualLimit, input.calculatedTax);
  if (cappedByAnnualLimit) {
    warnings.push(
      `감면세액이 연간 한도 ${annualLimit.toLocaleString()}원을 초과하여 한도로 capping되었습니다 (조특법 §133②)`,
    );
  }

  return {
    isEligible: true,
    reductionRate: rate,
    appliedClause: clause,
    reducibleIncome,
    rawReductionAmount,
    reductionAmount,
    cappedByAnnualLimit,
    appliedAnnualLimit: annualLimit,
    legalBasis: TRANSFER.REDUCTION_GB_DESIGNATED_LAND,
    warnings,
  };
}
