/**
 * 조특법 §77의2 — 대토보상에 대한 양도소득세 과세특례 (40% 세액감면 모드)
 *
 * (KoreanLaw 현행 원문 확정 · 조특법 MST 280409, 시행 2026-07-01)
 *  §77의2① 사업인정고시일(고시 전 양도 시 양도일) 소급 2년 이전 취득 토지등을 2026.12.31.
 *          이전에 시행자에게 양도하고, 양도대금 중 **대토보상**(토지로 보상)받는 부분에 대해
 *          → 양도소득세의 40% 세액감면 **또는 과세이연** 중 선택.
 *  §77의2③ 추징: 현금 전환·현물출자 등 → 감면·이연세액 + 이자상당가산액.
 *
 * 본 엔진은 **40% 세액감면 모드**만 계산(P3a). 과세이연(P3b)은 취득가액 승계 + 대토 후속
 * 양도시점 정산이라 별도 — 본 파이프라인에서 감면 후보로 push되지 않는다.
 *
 * 대토보상분 안분: 총 양도대금(=현금보상+대토보상) 중 대토보상 비율로 양도소득금액 안분,
 * 기본공제는 감면율 낮은 현금보상분(0% 감면)에 우선 배정(§103② 동형, §77 패턴 재사용).
 * §133② 종합한도(양도연도별): 2025+ 연간 2억 — getInvoluntaryTransferLimits.
 * ⚠️ sunset(2026-12-31)은 **양도일** 기준.
 */

import { subYears } from "date-fns";
import { TRANSFER } from "./legal-codes";
import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
import { getInvoluntaryTransferLimits } from "./public-expropriation-reduction";

export const REPLACEMENT_LAND_SUNSET = new Date("2026-12-31T23:59:59");
export const REPLACEMENT_LAND_RATE = 0.4;

export interface ReplacementLandInput {
  /** 현금 보상액 (원) */
  cashCompensation: number;
  /** 대토(토지) 보상액 (원) — 감면 대상 */
  replacementLandComp: number;
  transferDate: Date;
  /** 취득일 (상속 시 피상속인 취득일) — §77의2① 소급 2년 취득요건 검증용. 미입력 시 요건 미검증(백워드 호환) */
  acquisitionDate?: Date;
  /** 사업인정고시일 — §77의2① '고시일(고시 전 양도 시 양도일) 소급 2년 이전 취득' 기준. 미입력 시 요건 미검증 */
  businessApprovalDate?: Date;
  calculatedTax: number;
  /** 양도소득금액 = 양도차익 − 장기보유특별공제 (기본공제 차감 전) */
  transferIncome: number;
  basicDeduction: number;
  taxBase: number;
}

export interface ReplacementLandResult {
  isEligible: boolean;
  reductionRate: number;
  /** 대토보상 / (현금보상 + 대토보상) */
  replacementRatio: number;
  /** 대토보상분 감면대상 양도소득금액 (기본공제 前) — 별지84호 부표 1 ⑲ 세액감면대상금액용 echo */
  eligibleTransferIncome?: number;
  /** 대토보상분 소득 (기본공제 배정 후) */
  replacementTaxableIncome: number;
  /** 감면대상소득금액 = 대토보상분 소득 × 40% */
  reducibleIncome: number;
  rawReductionAmount: number;
  reductionAmount: number;
  cappedByAnnualLimit: boolean;
  appliedAnnualLimit: number;
  legalBasis: string;
  warnings: string[];
  notEligibleReason?: string;
}

function ineligible(reason: string, annualLimit: number): ReplacementLandResult {
  return {
    isEligible: false,
    reductionRate: 0,
    replacementRatio: 0,
    replacementTaxableIncome: 0,
    reducibleIncome: 0,
    rawReductionAmount: 0,
    reductionAmount: 0,
    cappedByAnnualLimit: false,
    appliedAnnualLimit: annualLimit,
    legalBasis: TRANSFER.REDUCTION_REPLACEMENT_LAND,
    warnings: [],
    notEligibleReason: reason,
  };
}

export function calculateReplacementLandReduction(
  input: ReplacementLandInput,
): ReplacementLandResult {
  const annualLimit = getInvoluntaryTransferLimits(
    input.transferDate.getFullYear(),
  ).annual;
  const total = input.cashCompensation + input.replacementLandComp;

  if (input.transferDate > REPLACEMENT_LAND_SUNSET) {
    return ineligible("양도일이 2026-12-31 이후입니다 (§77의2 일몰)", annualLimit);
  }
  if (input.replacementLandComp <= 0) {
    return ineligible("대토보상액이 0 이하입니다 (대토보상분만 감면 대상)", annualLimit);
  }
  // §77의2① 취득시기 요건 — 사업인정고시일(고시 전 양도 시 양도일) 소급 2년 이전 취득.
  // 두 날짜 모두 존재할 때만 검증(미입력 시 skip — 법 근거 없는 차단 방지, 백워드 호환).
  if (input.acquisitionDate !== undefined && input.businessApprovalDate !== undefined) {
    const acqBaselineDate =
      input.transferDate < input.businessApprovalDate
        ? input.transferDate
        : input.businessApprovalDate;
    if (input.acquisitionDate > subYears(acqBaselineDate, 2)) {
      return ineligible(
        "사업인정고시일 소급 2년 이내에 취득한 토지입니다 (§77의2① 취득시기 요건 미충족)",
        annualLimit,
      );
    }
  }
  if (input.calculatedTax <= 0 || input.transferIncome <= 0 || input.taxBase <= 0) {
    return ineligible(
      input.calculatedTax <= 0
        ? "산출세액이 0 이하입니다"
        : input.transferIncome <= 0
          ? "양도소득금액이 0 이하입니다"
          : "과세표준이 0 이하입니다",
      annualLimit,
    );
  }

  const warnings: string[] = [];

  // ① 양도소득금액을 보상 비율로 안분 — 현금분 / 대토분
  const cashIncome =
    input.cashCompensation > 0
      ? safeMultiplyThenDivide(input.transferIncome, input.cashCompensation, total)
      : 0;
  const replacementIncome = Math.max(0, input.transferIncome - cashIncome);

  // ② 기본공제 배정 — 감면율 낮은 현금분(0%) 우선 (§103② 동형)
  const basicDeduction = Math.max(0, input.basicDeduction);
  const basicDeductionOnCash = Math.min(basicDeduction, cashIncome);
  const basicDeductionOnReplacement = Math.min(
    basicDeduction - basicDeductionOnCash,
    replacementIncome,
  );
  const replacementTaxableIncome = Math.max(
    0,
    replacementIncome - basicDeductionOnReplacement,
  );

  // ③ 감면대상소득금액 = 대토보상분 소득 × 40%
  const reducibleIncome = applyRate(replacementTaxableIncome, REPLACEMENT_LAND_RATE);

  // ④ 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준
  const rawReductionAmount = safeMultiplyThenDivide(
    input.calculatedTax,
    reducibleIncome,
    input.taxBase,
  );

  // ⑤ §133② 연간 한도 capping
  const cappedByAnnualLimit = rawReductionAmount > annualLimit;
  const reductionAmount = Math.min(rawReductionAmount, annualLimit, input.calculatedTax);
  if (cappedByAnnualLimit) {
    warnings.push(
      `감면세액이 연간 한도 ${annualLimit.toLocaleString()}원을 초과하여 한도로 capping되었습니다 (조특법 §133②)`,
    );
  }
  warnings.push(
    "현금 전환·현물출자 등 §77의2③ 사유 발생 시 감면세액 + 이자상당가산액이 추징됩니다.",
  );

  return {
    isEligible: reductionAmount > 0,
    reductionRate: REPLACEMENT_LAND_RATE,
    replacementRatio: total > 0 ? input.replacementLandComp / total : 0,
    eligibleTransferIncome: replacementIncome,
    replacementTaxableIncome,
    reducibleIncome,
    rawReductionAmount,
    reductionAmount,
    cappedByAnnualLimit,
    appliedAnnualLimit: annualLimit,
    legalBasis: TRANSFER.REDUCTION_REPLACEMENT_LAND,
    warnings,
  };
}
