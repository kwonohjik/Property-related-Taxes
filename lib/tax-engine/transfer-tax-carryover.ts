/**
 * 배우자등 이월과세 + 비교과세 헬퍼 (소득세법 §97조의2)
 *
 * calcCarryoverScenarios() — 이월과세 두 시나리오 계산 + 비교과세 자동 판정.
 * Orchestrator(transfer-tax.ts)에서 STEP 0.475로 호출됨.
 *
 * 설계: docs/02-design/features/transfer-tax-carryover-taxation.engine.design.md
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 세율 데이터는 매개변수로 주입받음.
 */

import { addYears } from "date-fns";
import { calculateHoldingPeriod, computeLumpSumDeductionBase } from "./tax-utils";
import { calcPreHousingDisclosureGain } from "./transfer-tax-pre-housing-disclosure";
import { TRANSFER } from "./legal-codes";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "./types/transfer.types";
import type {
  CarryoverTaxationDetail,
  CarryoverScenarioADetail,
  CarryoverScenarioBDetail,
} from "./types/transfer-carryover.types";

// ============================================================
// 공개 반환 타입
// ============================================================

export interface CalcCarryoverResult {
  /** 두 시나리오 계산 상세 + 채택 결정 */
  detail: CarryoverTaxationDetail;
  /**
   * Orchestrator가 이후 파이프라인(STEP 0.5~11)에 사용할 입력.
   * adoptedScenario === "A" 이면 증여자 기준으로 재바인딩된 inputA,
   * "B" 이면 수증자 기준 inputB.
   */
  adoptedInput: TransferTaxInput;
}

// ============================================================
// 내부 상수
// ============================================================

/**
 * §97조의2 ① 2호 후단 시행일 (2023.12.31. 신설 → 2024.1.1. 이후 양도분부터 적용).
 * 양도일 < 이 날짜이면 donorCapitalExpenditure 를 0으로 처리.
 */
const DONOR_CAPEX_EFFECTIVE_DATE = new Date("2024-01-01");

/**
 * 부칙 (2022.12.31. 법률 제19196호) — 10년 룰 시작일.
 * 증여 등기접수일 < 이 날짜이면 5년 룰, 이후이면 10년 룰.
 */
const TEN_YEAR_RULE_CUTOFF = new Date("2023-01-01");

// ============================================================
// 메인 헬퍼: calcCarryoverScenarios
// ============================================================

/**
 * 이월과세 두 시나리오를 계산하고 비교과세로 채택 시나리오를 결정한다.
 *
 * @param rawInput - 원본 TransferTaxInput (carryoverTaxation 포함)
 * @param rates - TaxRatesMap (Orchestrator에서 주입)
 * @param calculateTransferTax - 양도세 계산 함수 (순환 의존 방지를 위해 주입)
 * @returns CalcCarryoverResult | null  (null 이면 이월과세 미적용 → Orchestrator skip)
 */
export function calcCarryoverScenarios(
  rawInput: TransferTaxInput,
  rates: TaxRatesMap,
  calculateTransferTax: (input: TransferTaxInput, rates: TaxRatesMap) => {
    determinedTax: number;
    transferGain: number;
    taxableGain: number;
    longTermHoldingDeduction: number;
    longTermHoldingRate: number;
    taxBase: number;
    calculatedTax: number;
    localIncomeTax: number;
    totalTax: number;
    /** §97②2호 단서 swap 발동 여부 — scenarioA 표시 라벨(개산공제 vs 양도비 등) 분기용 */
    swapApplied?: boolean;
  },
): CalcCarryoverResult | null {

  // ─────────────────────────────────────────────────────────
  // Step 1: 입력 존재 확인
  // ─────────────────────────────────────────────────────────
  if (
    rawInput.acquisitionCause !== "carryover_gift" ||
    !rawInput.carryoverTaxation
  ) {
    return null;
  }

  const ct = rawInput.carryoverTaxation;

  // ─────────────────────────────────────────────────────────
  // Step 2a: 가업상속공제 자산 방어코드 (validation에서 이미 차단됨)
  // ─────────────────────────────────────────────────────────
  if (ct.exclusionDeclared?.isFamilyBusinessInheritedAsset) {
    return {
      detail: {
        isEligible: false,
        applicablePeriodYears: 5, // dummy
        exclusionReason: "family_business",
        scenarioA: makeEmptyScenarioA(),
        scenarioB: makeEmptyScenarioB(ct.giftDateValuation),
        adoptedScenario: "B",
        comparisonExclusion: false,
      },
      adoptedInput: buildInputB(rawInput, ct),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Step 2b: 기간 판정 (§97조의2 ③ — 일수 기반 정밀 비교)
  // ─────────────────────────────────────────────────────────
  const applicablePeriodYears: 5 | 10 =
    ct.giftRegistryDate < TEN_YEAR_RULE_CUTOFF ? 5 : 10;

  const limitDate = addYears(ct.giftRegistryDate, applicablePeriodYears);
  const isPeriodExceeded = rawInput.transferDate > limitDate;

  if (isPeriodExceeded) {
    return {
      detail: {
        isEligible: false,
        applicablePeriodYears,
        exclusionReason: "period_exceeded",
        scenarioA: makeEmptyScenarioA(),
        scenarioB: makeEmptyScenarioB(ct.giftDateValuation),
        adoptedScenario: "B",
        comparisonExclusion: false,
      },
      adoptedInput: buildInputB(rawInput, ct),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Step 2c: 사용자 선언 적용배제
  // ─────────────────────────────────────────────────────────
  if (ct.exclusionDeclared?.expropriationWithin2Years) {
    return {
      detail: {
        isEligible: false,
        applicablePeriodYears,
        exclusionReason: "expropriation",
        scenarioA: makeEmptyScenarioA(),
        scenarioB: makeEmptyScenarioB(ct.giftDateValuation),
        adoptedScenario: "B",
        comparisonExclusion: false,
      },
      adoptedInput: buildInputB(rawInput, ct),
    };
  }

  if (ct.exclusionDeclared?.oneHouseExemptionApplies) {
    return {
      detail: {
        isEligible: false,
        applicablePeriodYears,
        exclusionReason: "one_house_exemption",
        scenarioA: makeEmptyScenarioA(),
        scenarioB: makeEmptyScenarioB(ct.giftDateValuation),
        adoptedScenario: "B",
        comparisonExclusion: false,
      },
      adoptedInput: buildInputB(rawInput, ct),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Step 3: 시행시기 가드 (donorCapex, §97조의2 ① 2호 후단)
  // ─────────────────────────────────────────────────────────
  const donorCapexGuardApplied = rawInput.transferDate < DONOR_CAPEX_EFFECTIVE_DATE;
  const effectiveDonorCapex = donorCapexGuardApplied
    ? 0
    : (ct.donorCapitalExpenditure ?? 0);

  // ─────────────────────────────────────────────────────────
  // Step 4: Scenario A — 이월과세 적용 시나리오
  // ─────────────────────────────────────────────────────────

  // 4a: 취득가액 결정 (직접 입력 or PHD/APD 환산)
  // 개산공제 등 필요경비는 아래 necessaryExpenseBeforeGift가 엔진 산출값(swap 반영)에서 역산하므로
  // 여기서 별도로 계산하지 않는다.
  let donorAcqPrice: number;
  // 표시 전용 echo — 결과뷰 근거 문구 분기용 (환산 산식 재현)
  let echoStdAtAcq: number | undefined;
  let echoStdAtTransfer: number | undefined;
  if (ct.useEstimatedAcquisition) {
    if (rawInput.preHousingDisclosure) {
      // PHD/APD 환산 재사용 (M-2 결정: apartmentPreDisclosure도 동일 함수)
      const phdResult = calcPreHousingDisclosureGain(
        rawInput.transferPrice,
        { ...rawInput.preHousingDisclosure, ownershipRatio: rawInput.ownershipRatio },
      );
      donorAcqPrice = phdResult.totalEstimatedAcquisitionPrice;
    } else {
      // 기준시가 직접 입력 환산 (§97 ① 1호 나목, 시행령 §163 ⑨)
      const stdAtAcq = rawInput.standardPriceAtAcquisition ?? 0;
      const stdAtTransfer = rawInput.standardPriceAtTransfer ?? 1;
      donorAcqPrice = stdAtTransfer > 0
        ? Math.floor(rawInput.transferPrice * stdAtAcq / stdAtTransfer)
        : 0;
      echoStdAtAcq = rawInput.standardPriceAtAcquisition;
      echoStdAtTransfer = rawInput.standardPriceAtTransfer;
    }
  } else {
    donorAcqPrice = ct.donorAcquisitionPrice ?? 0;
  }

  // 4b: 필요경비 합산 (swap 통합 — directSide에 증여자 capex 포함)
  const effectiveCapex = (rawInput.capitalExpenditure ?? 0) + effectiveDonorCapex;

  // 4c: Scenario A용 입력 구성
  // M-2 결정: PHD/APD 입력이 있으면 preHousingDisclosure 그대로 재사용하되
  //   acquisitionDate만 증여자 취득일로 교체한다.
  //   acquisitionPrice는 PHD 환산 경로에서 엔진이 자동 계산하므로 0으로 유지.
  //   직접 입력 모드(useEstimatedAcquisition=false)에서는 donorAcqPrice를 명시.
  const inputABase: TransferTaxInput = {
    ...rawInput,
    acquisitionPrice: ct.useEstimatedAcquisition ? 0 : donorAcqPrice,
    acquisitionDate: ct.donorAcquisitionDate,   // §95 ④ 보유기간 기산
    // §154① 거주요건 경과규정 판정은 수증자 실제 취득일 기준 (이월과세 의제는 필요경비 한정 §97의2①)
    residenceTransitionAcquisitionDate: ct.giftRegistryDate,
    capitalExpenditure: effectiveCapex,           // 합산된 capex (directSide swap용)
    carryoverTaxation: undefined,                // 재귀 방지
    acquisitionCause: "gift",                    // 하위 호환 (단순 증여)
  };

  // 4d: 증여세 상당액 한도 계산 (설계 §6.5.1 — §163의2 ② 단서)
  // Step A-1: 증여세 가산 직전 양도차익 = gain_beforeGiftTax
  //   PHD 모드에서는 엔진이 preHousingDisclosure로 환산 후 transferGain 산출
  const resultABeforeGiftTax = calculateTransferTax(inputABase, rates);
  const gainBeforeGiftTax = resultABeforeGiftTax.transferGain;

  // Step A-2/3: 한도 적용
  const giftTaxLimitCap = Math.max(0, gainBeforeGiftTax);
  const giftTaxAddedToExpense = Math.min(ct.giftTaxAmount, giftTaxLimitCap);
  const giftTaxLimitApplied = ct.giftTaxAmount > giftTaxLimitCap;

  // 4e: 증여세 상당액 반영 최종 inputA 구성
  // 설계 §6.5.3: 증여세 상당액은 §97② 2호 swap 비교 대상 밖 — 별도 가산.
  //
  // 환산 모드(useEstimatedAcquisition=true)에서는 calcNecessaryExpense가 legacy expenses를
  // 무시하므로(환산+개산공제만 인정 원칙), 증여세를 expenses에 가산해도 차감되지 않는다.
  // 이를 해결하기 위해 환산 모드일 때는:
  //   - useEstimatedAcquisition=false 로 전환 (환산 재계산 방지)
  //   - acquisitionPrice = 이미 계산된 donorAcqPrice
  //   - expenses = 개산공제 + giftTaxAddedToExpense (legacy expenses로 직접 차감)
  // 실가 모드(useEstimatedAcquisition=false)에서는 expenses가 직접 차감되므로 그대로 사용.
  // 환산 모드에서 엔진이 §97②2호 단서 swap까지 반영해 산출한 필요경비.
  //   = 양도가 − 환산취득가 − (증여세 가산 전 양도차익)
  // 개산공제 단독이 아니라 swap-aware 값이므로, capex가 개산공제보다 커서 swap이 발동한 경우에도
  // 자본적지출이 누락되지 않는다(과거 버그: 개산공제만 써서 capex 전액 누락 → 양도차익 과대).
  // 실가 전환 후 actual 모드 gain = 양도가 − 환산취득가 − expenses 이므로 모드(PHD/기준시가) 무관하게 정확.
  const necessaryExpenseBeforeGift = Math.max(
    0,
    rawInput.transferPrice - donorAcqPrice - gainBeforeGiftTax,
  );
  let inputAFinal: TransferTaxInput;
  if (ct.useEstimatedAcquisition && giftTaxAddedToExpense > 0) {
    // 환산 모드 + 증여세 차감 필요: 실가 전환 후 expenses = swap-aware 필요경비 + 증여세 상당액
    inputAFinal = {
      ...inputABase,
      useEstimatedAcquisition: false,
      acquisitionMethod: undefined,
      acquisitionPrice: donorAcqPrice,
      // PHD/기준시가 환산 필드 제거 — 실가 모드에서 재환산 방지
      preHousingDisclosure: undefined,
      standardPriceAtAcquisition: undefined,
      standardPriceAtTransfer: undefined,
      // 증여세 포함 필요경비 = swap-aware 필요경비(개산공제 또는 자본+양도비) + 증여세 상당액
      expenses: necessaryExpenseBeforeGift + giftTaxAddedToExpense,
      // capex/양도비는 위 필요경비에 이미 반영됨 → 실가 모드 재차감 방지 위해 제거
      capitalExpenditure: undefined,
      transferExpense: undefined,
    };
  } else {
    // 실가 모드(useEstimatedAcquisition=false)이거나 증여세 차감 없는 경우.
    // ⚠️ inputABase.capitalExpenditure가 항상 정의(effectiveCapex)되어 calcNecessaryExpense의
    //    swap-aware 경로가 활성화된다(transfer-tax-helpers `swapEligible = capitalExpenditure !== undefined`).
    //    이 경로는 legacy `expenses`를 무시하므로, 증여세 상당액을 `expenses`에 더하면 필요경비에서 드롭된다.
    //    → 증여세 상당액은 나목(transferExpense)에 가산해 directSide로 반영한다.
    //    (증여세 차감 없는 케이스에서는 gift=0이므로 기존 동작과 동일 — transferExpense/expenses 불변.)
    inputAFinal = {
      ...inputABase,
      transferExpense: (rawInput.transferExpense ?? 0) + giftTaxAddedToExpense,
      expenses: rawInput.expenses,
    };
  }

  const resultA = calculateTransferTax(inputAFinal, rates);
  const determinedTaxA = resultA.determinedTax;

  // Scenario A 보유연수 (증여자 취득일 기산)
  const holdingA = calculateHoldingPeriod(ct.donorAcquisitionDate, rawInput.transferDate);

  const scenarioA: CarryoverScenarioADetail = {
    acquisitionPrice: donorAcqPrice,
    holdingPeriodYears: holdingA.years,
    giftTaxAddedToExpense,
    giftTaxLimitApplied,
    giftTaxLimitCap,
    donorCapexAddedToExpense: effectiveDonorCapex,
    donorCapexGuardApplied,
    effectiveCapex,
    acquisitionWasEstimated: ct.useEstimatedAcquisition,
    // 표시 라벨·산식 base echo — UI의 금액 자기일치 역추론을 대체한다(types 주석 참조).
    // swap 발동 시 본문 필요경비는 자본적지출+양도비이므로 개산공제가 아니다.
    necessaryExpenseIsLumpDeduction:
      ct.useEstimatedAcquisition === true && resultABeforeGiftTax.swapApplied !== true,
    lumpDeductionBase:
      echoStdAtAcq != null
        ? computeLumpSumDeductionBase(echoStdAtAcq, rawInput.ownershipRatio)
        : undefined,
    estimatedStdPriceAtAcquisition: echoStdAtAcq,
    estimatedStdPriceAtTransfer: echoStdAtTransfer,
    transferGain: resultA.transferGain,
    determinedTax: determinedTaxA,
  };

  // ─────────────────────────────────────────────────────────
  // Step 5: Scenario B — 미적용 시나리오 (비교용)
  // ─────────────────────────────────────────────────────────
  const inputB = buildInputB(rawInput, ct);
  const resultB = calculateTransferTax(inputB, rates);
  const determinedTaxB = resultB.determinedTax;

  const holdingB = calculateHoldingPeriod(ct.giftRegistryDate, rawInput.transferDate);

  const scenarioB: CarryoverScenarioBDetail = {
    acquisitionPrice: ct.giftDateValuation,
    holdingPeriodYears: holdingB.years,
    transferGain: resultB.transferGain,
    longTermHoldingDeduction: resultB.longTermHoldingDeduction,
    longTermHoldingRate: resultB.longTermHoldingRate,
    taxBase: resultB.taxBase,
    calculatedTax: resultB.calculatedTax,
    determinedTax: determinedTaxB,
  };

  // ─────────────────────────────────────────────────────────
  // Step 6: 비교과세 (§97조의2 ② 3호)
  // 동률(A === B)이면 A 채택 (단서 조건은 "적은 경우" — 동률은 적용 유지)
  // ─────────────────────────────────────────────────────────
  const adoptedScenario: "A" | "B" =
    determinedTaxA >= determinedTaxB ? "A" : "B";
  const comparisonExclusion = adoptedScenario === "B";

  // ─────────────────────────────────────────────────────────
  // Step 7: 반환
  // ─────────────────────────────────────────────────────────
  const detail: CarryoverTaxationDetail = {
    isEligible: true,
    applicablePeriodYears,
    exclusionReason: comparisonExclusion ? "tax_comparison" : undefined,
    scenarioA,
    scenarioB,
    adoptedScenario,
    comparisonExclusion,
  };

  return {
    detail,
    adoptedInput: adoptedScenario === "A" ? inputAFinal : inputB,
  };
}

// ============================================================
// 내부 유틸
// ============================================================

/**
 * Scenario B 입력 구성 — 수증자 기준 (증여 당시 평가액, 등기접수일 기산)
 * §97조의2 적용 없는 일반 취득으로 처리.
 */
function buildInputB(
  rawInput: TransferTaxInput,
  ct: NonNullable<TransferTaxInput["carryoverTaxation"]>,
): TransferTaxInput {
  return {
    ...rawInput,
    acquisitionPrice: ct.giftDateValuation,
    acquisitionDate: ct.giftRegistryDate,
    useEstimatedAcquisition: false,           // B는 실가(증여 당시 평가액)
    capitalExpenditure: rawInput.capitalExpenditure, // 수증자 capex만 (증여자 capex 제외)
    carryoverTaxation: undefined,             // 재귀 방지
    acquisitionCause: "purchase",             // B는 일반 취득으로 처리
    // preHousingDisclosure: B에서는 환산 사용 안 함 — 명시적으로 제거
    preHousingDisclosure: undefined,
  };
}

/** 적용배제 시 Scenario A 빈 객체 (결과 카드 표시 불필요) */
function makeEmptyScenarioA(): CarryoverScenarioADetail {
  return {
    acquisitionPrice: 0,
    holdingPeriodYears: 0,
    giftTaxAddedToExpense: 0,
    giftTaxLimitApplied: false,
    giftTaxLimitCap: 0,
    donorCapexAddedToExpense: 0,
    donorCapexGuardApplied: false,
    effectiveCapex: 0,
    transferGain: 0,
    determinedTax: 0,
  };
}

/** 적용배제 시 Scenario B 빈 객체 */
function makeEmptyScenarioB(acquisitionPrice: number): CarryoverScenarioBDetail {
  return {
    acquisitionPrice,
    holdingPeriodYears: 0,
    transferGain: 0,
    determinedTax: 0,
  };
}

// ============================================================
// 법령 상수 참조 (ESLint unused 방지용 명시적 참조)
// ============================================================
// TRANSFER.CARRYOVER_TAXATION, TRANSFER.CARRYOVER_DONOR_BASIS,
// TRANSFER.CARRYOVER_COMPARISON, TRANSFER.CARRYOVER_PERIOD_REGISTRY,
// TRANSFER.CARRYOVER_DONOR_CAPEX, TRANSFER.CARRYOVER_GIFT_TAX_EXPENSE
void TRANSFER;
