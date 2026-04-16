/**
 * 상속공제 7종 + §24 종합한도 (상증법 §18~§23의2·§24)
 *
 * 적용 순서:
 *   기초공제(§18) + {배우자공제(§19) + 인적공제(§20) vs 일괄공제(§21)} + 금융공제(§22) + 재해공제(§23) + 동거주택공제(§23의2)
 *   → §24 종합한도 적용 (= 상속세 과세가액 - 상속인·수유자에 대한 사전증여재산)
 *
 * §24 종합한도: 상속공제 총액 ≤ (상속세 과세가액 - 상속인·수유자의 사전증여재산가액)
 */

import { INH } from "../legal-codes";
import { applyRate } from "../tax-utils";
import type {
  CalculationStep,
  Heir,
  InheritanceDeductionInput,
  InheritanceDeductionResult,
} from "../types/inheritance-gift.types";
import {
  calcPersonalDeductions,
} from "./personal-deduction-calc";
import { calcLegalShareRatios } from "../tax-utils";

// ============================================================
// 공제 한도 상수
// ============================================================

/** 기초공제 (§18 ①): 2억원 */
const BASIC_DEDUCTION = 200_000_000;

/** 배우자공제 최솟값 (§19 ②): 5억원 */
const SPOUSE_MIN = 500_000_000;

/** 배우자공제 최댓값 (§19 ②): 30억원 */
const SPOUSE_MAX = 3_000_000_000;

/** 일괄공제 (§21): 5억원 */
const LUMP_SUM_DEDUCTION = 500_000_000;

/** 금융재산공제 최댓값 (§22): 2억원 */
const FINANCIAL_MAX = 200_000_000;

/** 금융재산공제 무조건 공제 상한 (§22 ①1호): 2,000만원 */
const FINANCIAL_FULL_EXEMPT_MAX = 20_000_000;

/** 금융재산공제 중간구간 상한 (§22 ①2호): 1억원 */
const FINANCIAL_MID_MAX = 100_000_000;

/** 금융재산공제 중간구간 고정액: 2,000만원 */
const FINANCIAL_MID_FIXED = 20_000_000;

/** 금융재산공제 초과구간 공제율: 20% */
const FINANCIAL_OVER_RATE = 0.20;

/** 동거주택공제 공제율 (§23의2): 80% */
const COHABIT_SHARE_RATE = 0.80;

/** 동거주택공제 최댓값 (§23의2): 6억원 */
const COHABIT_MAX = 600_000_000;

/** 영농상속공제 최댓값 (§18의2): 20억원 */
const FARMING_MAX = 2_000_000_000;

/** 가업상속공제 최댓값 (§18의3): 600억원 (10년 이상 영위) */
const FAMILY_BUSINESS_MAX_10Y = 60_000_000_000;

// ============================================================
// 개별 공제 계산 함수
// ============================================================

/**
 * 기초공제 (§18 ①): 2억원 정액
 * 거주자 상속에 항상 적용. 영농·가업 상속공제 선택 시에도 중복 적용.
 */
export function calcBasicDeduction(): number {
  return BASIC_DEDUCTION;
}

/**
 * 배우자공제 (§19)
 * - 배우자가 실제 상속받은 금액과 법정상속분 중 작은 금액
 * - 최솟값 5억, 최댓값 30억
 *
 * @param spouseActualAmount 배우자 실제 상속금액 (미입력 시 법정상속분으로 산정)
 * @param totalEstateValue 상속세 과세가액 (법정상속분 계산 기준)
 * @param heirs 상속인 목록 (배우자 존재 여부 및 법정상속분 산정)
 */
export function calcSpouseDeduction(
  spouseActualAmount: number | undefined,
  totalEstateValue: number,
  heirs: Heir[],
): { deduction: number; breakdown: CalculationStep[] } {
  const spouseHeir = heirs.find((h) => h.relation === "spouse");
  if (!spouseHeir) {
    return {
      deduction: 0,
      breakdown: [{ label: "배우자 없음 — 배우자공제 미적용", amount: 0 }],
    };
  }

  // 법정상속분 산정 — 잔여분은 배우자에게 우선 배분 (PRD §19 명세)
  // 절사 후 잔여분: 각 상속인 floor합산이 totalEstateValue에 미달하는 경우 배우자에게 추가.
  const ratioMap = calcLegalShareRatios(heirs);
  const allocations = heirs.map((h) => ({
    id: h.id,
    amount: Math.floor(totalEstateValue * (ratioMap.get(h.id) ?? 0)),
  }));
  const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
  const remainder = totalEstateValue - totalAllocated; // 절사 잔여분 (보통 0~상속인 수-1 원)
  const spouseFloor = allocations.find((a) => a.id === spouseHeir.id)?.amount ?? 0;
  const legalShareAmount = spouseFloor + remainder; // 잔여분 배우자 우선 배분

  // 실제 상속금액 미입력 시 법정상속분 적용
  const actualAmount = spouseActualAmount ?? legalShareAmount;

  // 공제 기준: min(실제, 법정상속분)
  const baseAmount = Math.min(actualAmount, legalShareAmount);

  // 최솟값·최댓값 적용
  const deduction = Math.max(SPOUSE_MIN, Math.min(baseAmount, SPOUSE_MAX));

  return {
    deduction,
    breakdown: [
      { label: "법정상속분", amount: legalShareAmount, lawRef: INH.SPOUSE_DEDUCTION },
      { label: "배우자 실제 상속금액", amount: actualAmount },
      { label: "공제 기준액 (min)", amount: baseAmount },
      {
        label: `배우자공제 (min(5억,기준) ~ max 30억)`,
        amount: deduction,
        lawRef: INH.SPOUSE_DEDUCTION,
      },
    ],
  };
}

/**
 * 금융재산공제 (§22)
 * 3구간:
 *   ≤ 2천만: 전액 (100%)
 *   2천만 < x ≤ 1억: 2천만원 고정
 *   1억 < x: 20% (최대 2억)
 */
export function calcFinancialDeduction(netFinancialAssets: number): {
  deduction: number;
  breakdown: CalculationStep[];
} {
  if (netFinancialAssets <= 0) {
    return { deduction: 0, breakdown: [] };
  }

  let deduction: number;
  let note: string;

  if (netFinancialAssets <= FINANCIAL_FULL_EXEMPT_MAX) {
    deduction = netFinancialAssets;
    note = "2천만원 이하 — 전액 공제";
  } else if (netFinancialAssets <= FINANCIAL_MID_MAX) {
    deduction = FINANCIAL_MID_FIXED;
    note = "2천만~1억 구간 — 2천만원 고정 공제";
  } else {
    deduction = Math.min(applyRate(netFinancialAssets, FINANCIAL_OVER_RATE), FINANCIAL_MAX);
    note = "1억 초과 — 20% 공제 (최대 2억)";
  }

  return {
    deduction,
    breakdown: [
      { label: "순금융재산", amount: netFinancialAssets },
      { label: `금융재산공제 (${note})`, amount: deduction, lawRef: INH.FINANCIAL_DEDUCTION },
    ],
  };
}

/**
 * 동거주택 상속공제 (§23의2)
 * 공제액 = 주택 공시가격 × 80%, 최대 6억
 * (요건 확인은 UI에서 체크박스로 처리, 여기서는 금액만 계산)
 */
export function calcCohabitationDeduction(cohabitHouseStdPrice: number): {
  deduction: number;
  breakdown: CalculationStep[];
} {
  if (cohabitHouseStdPrice <= 0) {
    return { deduction: 0, breakdown: [] };
  }

  const raw = applyRate(cohabitHouseStdPrice, COHABIT_SHARE_RATE);
  const deduction = Math.min(raw, COHABIT_MAX);

  return {
    deduction,
    breakdown: [
      { label: "동거주택 공시가격", amount: cohabitHouseStdPrice },
      {
        label: `동거주택공제 (80%, 최대 6억)`,
        amount: deduction,
        lawRef: INH.COHABIT_DEDUCTION,
      },
    ],
  };
}

/**
 * 영농상속공제 (§18의2)
 * 농지·목장용지·어선 등 영농자산가액, 최대 30억
 */
export function calcFarmingDeduction(farmingAssetValue: number): {
  deduction: number;
  breakdown: CalculationStep[];
} {
  if (farmingAssetValue <= 0) {
    return { deduction: 0, breakdown: [] };
  }
  const deduction = Math.min(farmingAssetValue, FARMING_MAX);
  return {
    deduction,
    breakdown: [
      { label: "영농자산가액", amount: farmingAssetValue },
      { label: "영농상속공제 (최대 20억)", amount: deduction, lawRef: INH.FARMING_DEDUCTION },
    ],
  };
}

/**
 * 가업상속공제 (§18의3)
 * 최대 600억 (10년 이상 영위 기준)
 * ※ 가업상속공제 적용 시 배우자공제는 제한 있음 — 단순화하여 한도만 적용
 */
export function calcFamilyBusinessDeduction(
  familyBusinessValue: number,
): { deduction: number; breakdown: CalculationStep[] } {
  if (familyBusinessValue <= 0) {
    return { deduction: 0, breakdown: [] };
  }
  const deduction = Math.min(familyBusinessValue, FAMILY_BUSINESS_MAX_10Y);
  return {
    deduction,
    breakdown: [
      { label: "가업상속재산가액", amount: familyBusinessValue },
      { label: "가업상속공제 (최대 600억)", amount: deduction, lawRef: INH.FAMILY_BUSINESS_DEDUCTION },
    ],
  };
}

// ============================================================
// §24 종합한도
// ============================================================

/**
 * §24 종합한도 계산
 * 공제 총액 ≤ 상속세 과세가액 - 상속인·수유자에게 사전증여된 재산가액
 *
 * @param taxableEstateValue 상속세 과세가액
 * @param priorGiftToHeirTotal 상속인에게 사전증여된 재산가액 합계 (§13 합산분)
 */
export function applyDeductionLimit(
  rawTotalDeduction: number,
  taxableEstateValue: number,
  priorGiftToHeirTotal: number,
): { limitedDeduction: number; ceiling: number; wasCapped: boolean } {
  const ceiling = Math.max(0, taxableEstateValue - priorGiftToHeirTotal);
  const limitedDeduction = Math.min(rawTotalDeduction, ceiling);
  return {
    limitedDeduction,
    ceiling,
    wasCapped: rawTotalDeduction > ceiling,
  };
}

// ============================================================
// 통합 공제 계산 (7종 + §24 한도)
// ============================================================

/**
 * 상속공제 전체 계산
 *
 * @param input 공제 입력
 * @param taxableEstateValue 상속세 과세가액 (배우자 법정상속분·§24 한도 계산에 사용)
 * @param priorGiftToHeirTotal 상속인에 대한 사전증여재산가액 합계 (§24 한도)
 */
export function calcInheritanceDeductions(
  input: InheritanceDeductionInput,
  taxableEstateValue: number,
  priorGiftToHeirTotal: number,
): InheritanceDeductionResult {
  // 인적공제(미성년자·연로자·장애인)는 상속개시일 현재 나이 기준 (상증법 §20).
  // deathDate가 제공된 경우 해당 날짜를, 없으면 오늘로 fallback.
  const baseDate = input.deathDate ?? new Date().toISOString().slice(0, 10);

  // ① 기초공제
  const basicDeduction = calcBasicDeduction();

  // ② 배우자공제
  const spouseResult = calcSpouseDeduction(
    input.spouseActualAmount,
    taxableEstateValue,
    input.heirs,
  );
  const spouseDeduction = spouseResult.deduction;

  // ③ 인적공제 (4종 합산)
  const personalResult = calcPersonalDeductions(input.heirs, baseDate);
  const personalDeductionTotal = personalResult.total;

  // ④ 일괄공제 vs 기초+인적 선택 (§21)
  const itemizedTotal = basicDeduction + personalDeductionTotal;
  let chosenMethod: "lump_sum" | "itemized";
  let chosenBasicPersonal: number;

  // preferLumpSum=false 명시 시 → 납세자가 항목별 공제를 원하므로 일괄공제 선택 안 함
  // 그 외(true/undefined) → 항상 납세자에게 유리한 쪽 자동 선택 (§21)
  //   ※ preferLumpSum=true여도 인적공제 합계가 5억 초과 시 강제 선택 시 불이익 발생하므로
  //      금액 비교로 최적화. UI에서 사용자가 "일괄공제 원함"을 나타낼 때는 미설정(undefined)으로 전달.
  if (input.preferLumpSum !== false && LUMP_SUM_DEDUCTION >= itemizedTotal) {
    chosenMethod = "lump_sum";
    chosenBasicPersonal = LUMP_SUM_DEDUCTION;
  } else {
    chosenMethod = "itemized";
    chosenBasicPersonal = itemizedTotal;
  }

  // ⑤ 금융재산공제
  const financialResult = calcFinancialDeduction(input.netFinancialAssets ?? 0);
  const financialDeduction = financialResult.deduction;

  // ⑥ 동거주택공제
  const cohabitResult = calcCohabitationDeduction(input.cohabitHouseStdPrice ?? 0);
  const cohabitationDeduction = cohabitResult.deduction;

  // ⑦ 영농공제
  const farmingResult = calcFarmingDeduction(input.farmingAssetValue ?? 0);
  const farmingDeduction = farmingResult.deduction;

  // ⑧ 가업상속공제
  const bizResult = calcFamilyBusinessDeduction(input.familyBusinessValue ?? 0);
  const familyBusinessDeduction = bizResult.deduction;

  // 배우자 + 기초/일괄 + 나머지 합계
  const rawTotal =
    spouseDeduction +
    chosenBasicPersonal +
    financialDeduction +
    cohabitationDeduction +
    farmingDeduction +
    familyBusinessDeduction;

  // §24 종합한도 적용
  const { limitedDeduction, ceiling, wasCapped } = applyDeductionLimit(
    rawTotal,
    taxableEstateValue,
    priorGiftToHeirTotal,
  );

  // breakdown 구성
  const breakdown: CalculationStep[] = [
    ...(chosenMethod === "lump_sum"
      ? [{ label: `일괄공제 (${INH.LUMP_SUM})`, amount: LUMP_SUM_DEDUCTION, lawRef: INH.LUMP_SUM }]
      : [
          { label: `기초공제 (${INH.BASIC_DEDUCTION})`, amount: basicDeduction, lawRef: INH.BASIC_DEDUCTION },
          ...personalResult.breakdown.slice(0, -1), // 합계 행 제외
        ]),
    ...spouseResult.breakdown,
    ...financialResult.breakdown,
    ...cohabitResult.breakdown,
    ...farmingResult.breakdown,
    ...bizResult.breakdown,
    { label: "공제 소계", amount: rawTotal },
    {
      label: `§24 종합한도 (과세가액 ${taxableEstateValue.toLocaleString()} - 사전증여 ${priorGiftToHeirTotal.toLocaleString()})`,
      amount: ceiling,
      lawRef: INH.DEDUCTION_LIMIT,
    },
    ...(wasCapped
      ? [{ label: "한도 초과 — 종합한도 적용", amount: limitedDeduction, lawRef: INH.DEDUCTION_LIMIT }]
      : []),
    { label: "최종 상속공제액", amount: limitedDeduction },
  ];

  return {
    basicDeduction:
      chosenMethod === "itemized" ? basicDeduction : 0,
    spouseDeduction,
    personalDeductionTotal:
      chosenMethod === "itemized" ? personalDeductionTotal : 0,
    lumpSumDeduction: chosenMethod === "lump_sum" ? LUMP_SUM_DEDUCTION : 0,
    financialDeduction,
    cohabitationDeduction,
    farmingDeduction,
    familyBusinessDeduction,
    totalDeduction: limitedDeduction,
    chosenMethod,
    breakdown,
    appliedLaws: [
      INH.BASIC_DEDUCTION,
      INH.SPOUSE_DEDUCTION,
      INH.PERSONAL_DEDUCTION,
      INH.LUMP_SUM,
      INH.FINANCIAL_DEDUCTION,
      INH.COHABIT_DEDUCTION,
      INH.FARMING_DEDUCTION,
      INH.FAMILY_BUSINESS_DEDUCTION,
      INH.DEDUCTION_LIMIT,
    ],
  };
}
