/**
 * §18의2② 중견기업 200% 가드 — taxIfNoFBD 2-pass 산정 (E5)
 *
 * 법령 (KoreanLaw MCP 검증 2026-06-04):
 *   - 상증령 §15⑦ (mst=283637): taxIfNoFBD = "가업상속공제를 받지 아니하였을 경우
 *     법 §3의2①② 따라 계산한 가업상속인이 납부할 의무가 있는 상속세액"
 *   - 상증법 §18의2② + PDF 380p: ①가업외 상속재산 > ②(taxIfNoFBD × 200%) → 공제 배제
 *
 * PASS1: 가업상속공제를 제외한 공제 합 → 과세표준 → 산출세액(computedTaxNoFBD).
 *        가업상속인 부담분 = computedTaxNoFBD × (가업상속인 순상속분 / 과세가액)  [§3의2 받은 재산 비율]
 *        가업상속인 순상속분 = (heirOtherEstateValue − heirDebt) + 가업상속재산 gross
 *
 * 본 함수는 중견기업(enterpriseSize="medium") 경로에서만 orchestrator가 호출 (그 외 0 → 회귀 0).
 */

import type {
  InheritanceDeductionInput,
  EstateItem,
} from "../types/inheritance-gift.types";
import type { TaxBracket } from "../types";
import { calcInheritanceDeductions } from "./inheritance-deductions";
import { calcInheritanceGiftTax } from "../inheritance-gift-common";

export interface TaxIfNoFBDArgs {
  /** orchestrator의 deductionInput (familyBusiness 포함 — 본 함수가 제거 후 PASS1 계산) */
  deductionInput: InheritanceDeductionInput;
  /** 상속개시일 */
  deathDate?: string;
  /** PASS2와 동일한 배우자 법정상속분 override */
  spouseLegalShareOverride?: number;
  /** 과세가액 (= taxableEstateValue) */
  taxableEstateValue: number;
  /** 상속인 사전증여 합 (calcInheritanceDeductions priorGiftToHeirTotal) */
  priorGiftToHeirTotal: number;
  /** §24 한도 보정 정보 (PASS2와 동일 객체) */
  limitParams: {
    totalPriorGiftAmount?: number;
    priorGiftDeductionTotal?: number;
    legateeAmountNonHeir?: number;
    disasterLossDeduction?: number;
  };
  /** EstateItem 목록 */
  estateItems?: EstateItem[];
  /** 누진세율 brackets */
  brackets: TaxBracket[];
  /** 가업상속재산 gross (사업무관자산 차감 후, 공제한도 적용 전) */
  familyBusinessGross: number;
  /** 가업상속인 가업외 순상속재산 = heirOtherEstateValue − heirDebt */
  otherEstateNet: number;
}

export interface TaxIfNoFBDResult {
  /** §15⑦ — 가업상속공제 미적용 시 가업상속인 부담 상속세액 (200% 가드 입력) */
  taxIfNoFBD: number;
  /** 가업상속공제 제외 산출세액 (안분 전 전체) */
  computedTaxNoFBD: number;
  /** 가업상속공제 제외 과세표준 */
  taxBaseNoFBD: number;
  /** 가업상속인 안분 비율 (순상속분 / 과세가액) */
  heirShareRatio: number;
  /** 가업상속인 순상속분 (가업 + 가업외) */
  heirEstateShare: number;
}

/**
 * 가업상속공제 미적용 시 가업상속인이 납부할 상속세액(taxIfNoFBD)을 2-pass PASS1로 산정.
 */
export function computeTaxIfNoFamilyBusinessDeduction(
  args: TaxIfNoFBDArgs,
): TaxIfNoFBDResult {
  const {
    deductionInput,
    deathDate,
    spouseLegalShareOverride,
    taxableEstateValue,
    priorGiftToHeirTotal,
    limitParams,
    estateItems,
    brackets,
    familyBusinessGross,
    otherEstateNet,
  } = args;

  // PASS1 — 가업상속공제 4경로(객체·legacy·directAmount)를 모두 제거한 공제 합
  const deductionNoFBD = calcInheritanceDeductions(
    {
      ...deductionInput,
      deathDate,
      spouseLegalShareOverride,
      familyBusiness: undefined,
      familyBusinessValue: undefined,
      familyBusinessYears: undefined,
      familyBusinessDirectAmount: undefined,
    },
    taxableEstateValue,
    priorGiftToHeirTotal,
    limitParams,
    { estateItems, taxIfNoFBD: 0 },
  );

  const taxBaseNoFBD = Math.max(0, taxableEstateValue - deductionNoFBD.totalDeduction);
  const computedTaxNoFBD = calcInheritanceGiftTax(taxBaseNoFBD, brackets);

  // §3의2 — 가업상속인 받은 재산 비율 안분
  //   순상속분 = 가업상속재산 gross + 가업외 순상속재산(otherEstateNet)
  const heirEstateShare = Math.max(0, familyBusinessGross + otherEstateNet);
  const heirShareRatio =
    taxableEstateValue > 0
      ? Math.min(1, heirEstateShare / taxableEstateValue)
      : 0;

  const taxIfNoFBD = Math.floor(computedTaxNoFBD * heirShareRatio);

  return {
    taxIfNoFBD,
    computedTaxNoFBD,
    taxBaseNoFBD,
    heirShareRatio,
    heirEstateShare,
  };
}
