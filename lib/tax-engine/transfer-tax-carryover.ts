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

import { calculateHoldingPeriod, computeLumpSumDeductionBase } from "./tax-utils";
import { calcPreHousingDisclosureGain } from "./transfer-tax-pre-housing-disclosure";
import {
  assertCarryoverDonorBasis,
  applyCarryoverDonorBasis,
  isBurdenedGiftCarryover,
} from "./transfer-tax-carryover-burdened-gift";
import { TRANSFER } from "./legal-codes";
import { judgeCarryoverEligibility } from "./transfer-tax-carryover-eligibility";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
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
 * §97조의2 ① 2호 시행일 (2023.12.31. 개정 → 2024.1.1. 이후 양도분부터 적용).
 * 양도일 < 이 날짜이면 donorCapitalExpenditure 를 0으로 처리.
 */
const DONOR_CAPEX_EFFECTIVE_DATE = new Date("2024-01-01");

// 「10년 룰」 경계 상수(부칙 제19196호 §18)는 판정 leaf
// `transfer-tax-carryover-eligibility.ts`가 정본이다 — 여기서 따로 두면 두 벌이 된다.

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
    /**
     * 부담부증여 §159 안분 명세 — 시나리오 A의 증여세 산입 실적(안분·한도·산입액)을
     * 여기서 회수한다(D-7a). 부담부증여가 아니면 undefined.
     */
    transferBurdenedGiftBreakdown?: TransferBurdenedGiftBreakdown;
    /** §89①3호 각 목 해당 여부 — ②2호 자동 판정용(D-8). 전액 비과세. */
    isExempt?: boolean;
    /** 동상 — 12억 초과 고가주택(부분 비과세). `isExempt || isPartialExempt`가 ②2호 요건이다. */
    isPartialExempt?: boolean;
  },
  /**
   * §97의2②3호 **세액 비교 결과 강제** — 다건 엔진이 「신고단위 결정세액」으로 비교할 때만 쓴다.
   * `undefined`면 종전과 동일하게 이 함수가 스스로 A/B를 비교한다.
   * ⚠️ 앞선 배제(②1호·②2호·③ 기간·관계)는 이 값보다 **우선**한다 — Step 6에만 개입한다.
   * @see docs/00-pm/transfer-n1-carryover-filing-unit.plan.md
   */
  scenarioOverride?: "A" | "B",
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
  // Step 2: 적용배제 판정 (§97의2①괄호·②1·2호·③) — **공용 leaf**
  //
  // 🔑 판정 자체는 `transfer-tax-carryover-eligibility.ts`가 정본이다. 일반건물 부담부증여
  //    경로(F27)가 단건 엔진을 거치지 않고 같은 판정을 해야 해서 술어를 하나로 뒀다 —
  //    복사하면 같은 사실관계가 경로에 따라 갈린다.
  //    여기서는 그 판정 결과를 **이 함수의 반환 모양**(시나리오 B 고정)으로 옮기기만 한다.
  // ─────────────────────────────────────────────────────────
  const eligibility = judgeCarryoverEligibility(ct, rawInput.transferDate);
  const applicablePeriodYears = eligibility.applicablePeriodYears;

  if (!eligibility.isEligible) {
    return {
      detail: {
        isEligible: false,
        applicablePeriodYears,
        exclusionReason: eligibility.exclusionReason!,
        scenarioA: makeEmptyScenarioA(),
        scenarioB: makeEmptyScenarioB(ct.giftDateValuation),
        adoptedScenario: "B",
        comparisonExclusion: false,
      },
      adoptedInput: buildInputB(rawInput, ct),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Step 2d: 부담부증여 × 이월과세 게이트 (D-7a, 2026-08-10)
  //   적용배제 판정(2a~2c) **뒤**에 둔다 — 기간초과·수용 등으로 어차피 미적용이면
  //   시나리오 A를 만들지 않으므로 당초 증여자 값을 요구할 이유가 없다.
  // ─────────────────────────────────────────────────────────
  const isBurdenedGift = isBurdenedGiftCarryover(rawInput);
  if (isBurdenedGift) {
    assertCarryoverDonorBasis(rawInput.burdenedGiftInfo!, ct);
  }

  // ─────────────────────────────────────────────────────────
  // Step 3: 시행시기 가드 (donorCapex, §97조의2 ① 2호)
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
        { ...rawInput.preHousingDisclosure, ownershipRatio: rawInput.ownershipRatio, isUnregistered: rawInput.isUnregistered },
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
    acquisitionDate: ct.donorAcquisitionDate,   // §95 ④ 단서 보유기간 기산
    /**
     * 🔑 **부담부증여의 취득가액 축은 여기서만 움직인다**(D-7a).
     *
     * 위 `acquisitionPrice`는 §159가 읽지 않는다 — §159①1호의 A는 `burdenedGiftInfo`의
     * 4개 모드에서 오기 때문이다. 그래서 **info 자체**를 당초 증여자 기준 사본으로 바꿔 끼운다.
     * 증여세 상당액(§97의2①3호)도 같은 사본에 실어 §159 안분 단계로 넘긴다 —
     * `transferExpense`에 얹으면 기준시가·환산 모드에서 **세액에 도달하지 못한다**(§5.7.4).
     */
    ...(isBurdenedGift
      ? {
          burdenedGiftInfo: applyCarryoverDonorBasis(
            rawInput.burdenedGiftInfo!,
            ct.giftTaxAmount,
          ),
        }
      : {}),
    // §154① 거주요건 경과규정 판정은 수증자 실제 취득일 기준 (이월과세 의제는 필요경비 한정 §97의2①)
    residenceTransitionAcquisitionDate: ct.giftRegistryDate,
    capitalExpenditure: effectiveCapex,           // 합산된 capex (directSide swap용)
    carryoverTaxation: undefined,                // 재귀 방지
    acquisitionCause: "gift",                    // 하위 호환 (단순 증여)
  };

  /**
   * 4d′: **부담부증여 경로** — 2-pass를 돌지 않는다 (D-7a, 2026-08-10).
   *
   * §159 안분 단계(`burdened-gift-apportionment.ts` STEP 5.7)가 증여세 상당액의
   * **안분 → 한도 → 산입**을 한 번에 처리하므로, 여기서 한도를 미리 계산해
   * `transferExpense`에 얹는 아래 일반 경로는 **타면 안 된다**(이중 산입 + 모드별 미도달).
   *
   * 표시값(한도·산입액)은 결과에 실려 온 §159 명세에서 **역수신**한다.
   */
  if (isBurdenedGift) {
    const resultABG = calculateTransferTax(inputABase, rates);
    const bgBreakdown = resultABG.transferBurdenedGiftBreakdown;
    const cg = bgBreakdown?.carryoverGiftTax;
    /**
     * 🔴 **표시값도 §159 안분 후 값이어야 한다** (2026-08-10 D-7b).
     *
     * `donorAcqPrice`(= `ct.donorAcquisitionPrice`)는 **일반 양도 경로의 단일 총액**이고,
     * 부담부증여에서는 §159①1호가 `carryoverDonorBasis`로 취득가액을 자산별로 따로 구하므로
     * **계산에 쓰이지 않는다**(계획서 §5.7.6). 그대로 표시하면 결과 카드가
     * 「취득가액 3억」이라 적는데 실제로는 93,750,000이 쓰인 상태가 된다
     * (메모리 `feedback_engine_result_display_drift`).
     */
    const bgAcqPrice = bgBreakdown
      ? bgBreakdown.perAsset.land.acquisitionPrice + bgBreakdown.perAsset.building.acquisitionPrice
      : donorAcqPrice;
    return finishScenarios({
      rawInput, ct, rates, calculateTransferTax, scenarioOverride,
      applicablePeriodYears,
      scenarioAIsOneHouse: resultABG.isExempt === true || resultABG.isPartialExempt === true,
      // 표시용 안분 내역 — 채택이 B로 가더라도 A 컬럼이 스스로 설명할 수 있게 한다.
      giftTaxApportionment:
        cg && bgBreakdown
          ? {
              raw: cg.raw,
              apportioned: cg.apportioned,
              debtAmount: bgBreakdown.assumedDebtAmount,
              giftValuation: bgBreakdown.giftValuation.max,
            }
          : undefined,
      inputAFinal: inputABase,
      resultA: resultABG,
      donorAcqPrice: bgAcqPrice,
      giftTaxAddedToExpense: cg?.applied ?? 0,
      giftTaxLimitApplied: cg?.limitApplied ?? false,
      giftTaxLimitCap: cg?.cap ?? 0,
      effectiveDonorCapex,
      donorCapexGuardApplied,
      effectiveCapex,
      // §159 경로의 필요경비는 개산공제/실비/환산단서를 breakdown이 이미 확정했다.
      // 시나리오 A 카드가 「개산공제」 라벨을 붙일 근거가 여기엔 없으므로 false.
      necessaryExpenseIsLumpDeduction: false,
      echoStdAtAcq: undefined,
      echoStdAtTransfer: undefined,
    });
  }

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

  return finishScenarios({
    rawInput, ct, rates, calculateTransferTax, scenarioOverride,
    applicablePeriodYears,
    scenarioAIsOneHouse: resultA.isExempt === true || resultA.isPartialExempt === true,
    inputAFinal,
    resultA,
    donorAcqPrice,
    giftTaxAddedToExpense,
    giftTaxLimitApplied,
    giftTaxLimitCap,
    effectiveDonorCapex,
    donorCapexGuardApplied,
    effectiveCapex,
    // swap 발동 시 본문 필요경비는 자본적지출+양도비이므로 개산공제가 아니다.
    necessaryExpenseIsLumpDeduction:
      ct.useEstimatedAcquisition === true && resultABeforeGiftTax.swapApplied !== true,
    echoStdAtAcq,
    echoStdAtTransfer,
  });
}

/**
 * Step 5~7 공통 꼬리 — Scenario B 계산 · §97의2②3호 비교 · 반환.
 *
 * 일반 양도 경로와 부담부증여 경로가 **같은 비교·채택 규칙**을 쓰도록 한 지점으로 모았다
 * (D-7a). 두 경로가 다른 것은 시나리오 A를 **어떻게 만들었는가**뿐이다.
 */
function finishScenarios(args: {
  rawInput: TransferTaxInput;
  ct: NonNullable<TransferTaxInput["carryoverTaxation"]>;
  rates: TaxRatesMap;
  calculateTransferTax: (input: TransferTaxInput, rates: TaxRatesMap) => {
    determinedTax: number;
    transferGain: number;
    longTermHoldingDeduction: number;
    longTermHoldingRate: number;
    taxBase: number;
    calculatedTax: number;
    isExempt?: boolean;
    isPartialExempt?: boolean;
  };
  /** §97의2②3호 비교 결과 강제(다건 신고단위 비교 전용). undefined면 자체 비교. */
  scenarioOverride?: "A" | "B";
  /** 시나리오 A가 §89①3호 각 목의 주택 양도에 해당하는가 — ②2호 판정의 한쪽 항(D-8). */
  scenarioAIsOneHouse: boolean;
  /** 부담부증여 전용 — 증여세 상당액 안분 내역(표시용). 일반 양도는 undefined. */
  giftTaxApportionment?: CarryoverScenarioADetail["giftTaxApportionment"];
  applicablePeriodYears: 5 | 10;
  inputAFinal: TransferTaxInput;
  resultA: { determinedTax: number; transferGain: number };
  donorAcqPrice: number;
  giftTaxAddedToExpense: number;
  giftTaxLimitApplied: boolean;
  giftTaxLimitCap: number;
  effectiveDonorCapex: number;
  donorCapexGuardApplied: boolean;
  effectiveCapex: number;
  necessaryExpenseIsLumpDeduction: boolean;
  echoStdAtAcq: number | undefined;
  echoStdAtTransfer: number | undefined;
}): CalcCarryoverResult {
  const {
    rawInput, ct, rates, calculateTransferTax, applicablePeriodYears,
    inputAFinal, resultA, donorAcqPrice, echoStdAtAcq, echoStdAtTransfer,
  } = args;
  const determinedTaxA = resultA.determinedTax;

  // Scenario A 보유연수 (§95④ 단서 — 당초 증여자 취득일 기산)
  const holdingA = calculateHoldingPeriod(ct.donorAcquisitionDate, rawInput.transferDate);

  const scenarioA: CarryoverScenarioADetail = {
    acquisitionPrice: donorAcqPrice,
    holdingPeriodYears: holdingA.years,
    giftTaxAddedToExpense: args.giftTaxAddedToExpense,
    giftTaxLimitApplied: args.giftTaxLimitApplied,
    giftTaxLimitCap: args.giftTaxLimitCap,
    giftTaxApportionment: args.giftTaxApportionment,
    donorCapexAddedToExpense: args.effectiveDonorCapex,
    donorCapexGuardApplied: args.donorCapexGuardApplied,
    effectiveCapex: args.effectiveCapex,
    acquisitionWasEstimated: ct.useEstimatedAcquisition,
    // 표시 라벨·산식 base echo — UI의 금액 자기일치 역추론을 대체한다(types 주석 참조).
    necessaryExpenseIsLumpDeduction: args.necessaryExpenseIsLumpDeduction,
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

  /**
   * Step 5.5: **§97의2②2호 자동 판정** (2026-08-10 D-8).
   *
   * > 2. 제1항을 적용할 경우 제89조제1항제3호 각 목의 주택[…**고가주택**(이에 딸린 토지를
   * >    포함한다)을 포함한다]의 양도에 **해당하게 되는 경우**
   *
   * ## 🔑 「해당하게 **되는**」은 **상태 변화**를 요구한다 — 예규 2건이 일치한다
   *
   * · **사전-2016-법령해석재산-0374**(법령해석과-3693, 2016.11.15.):
   *   「같은 조 제1항 규정을 **적용하지 아니하는 경우에도** … 1세대1주택 고가주택의 양도에
   *     해당하게 되는 경우 **제97조의2제2항제2호를 적용하지 않는 것**이며, 취득가액은 그
   *     배우자의 취득 당시 금액으로 하고, 그 배우자의 보유기간을 통산하는 것입니다.」
   * · **서면-2022-부동산-0068**(부동산납세과-3383, 2022.11.02. · 기재부 재산세제과-333 인용):
   *   「§89①3호 각 목 외의 부분에 따른 **1세대 1주택에 해당하는 주택**을 배우자로부터
   *     증여받아 양도하는 경우에는 … **§97의2②2호를 적용하지 않는 것**입니다.」
   *
   * ⇒ **이월과세를 적용하지 않아도 이미 1세대1주택이면 ②2호는 발동하지 않는다**
   *   (= 이월과세를 그대로 **적용**한다). ②2호는 **이월과세를 적용해야 비로소** 1세대1주택이
   *   되는 경우, 즉 **A는 해당하는데 B는 해당하지 않는** 조합에서만 걸린다.
   *
   * ## ⚠️ ②3호보다 **앞**에 둔다
   *
   * ②2호가 걸리면 ①을 적용하지 않으므로 ②3호의 세액 비교는 **하지 않는다**.
   * 그래서 `comparisonExclusion`은 false다(비교로 배제된 것이 아니다).
   *
   * ## 왜 자동 판정이 필요했나 — ②3호가 대신해 주지 못하는 구간이 있다
   *
   * ②3호가 ②2호를 덮어 주는 것은 「A가 비과세로 **싸지기**」 때문이다. **A가 비싼 채로**
   * 비과세에 해당하면(양도인 취득가액이 높아 B의 차익이 작은 경우) ②3호는 걸리지 않는다.
   */
  const oneHouseExclusion =
    args.scenarioAIsOneHouse &&
    !(resultB.isExempt === true || resultB.isPartialExempt === true);

  if (oneHouseExclusion) {
    return {
      detail: {
        isEligible: false,
        applicablePeriodYears,
        exclusionReason: "one_house_exemption",
        scenarioA,
        scenarioB,
        adoptedScenario: "B",
        comparisonExclusion: false,
      },
      adoptedInput: inputB,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Step 6: 비교과세 (§97조의2 ② 3호)
  // ─────────────────────────────────────────────────────────
  /**
   * 🔑 **비교 단위는 「양도소득 결정세액」(§92③2호)이다 — 신고단위 개념이다.**
   *
   * 자산이 1건이면 이 함수가 비교하는 단건 결정세액이 곧 신고 전체의 결정세액이라 그대로 옳다.
   * **자산이 여러 건이면 그렇지 않다** — A/B 전환은 그 자산의 **세율군까지 바꾸므로**
   * (A=증여자 취득일 기산 / B=증여 등기접수일 기산) 다른 자산과의 §104⑤ 누진 합산·§102② 통산이
   * 함께 움직이는데, 단건 비교는 그 효과를 **구조적으로 볼 수 없다**.
   * 실측: 300 격자 중 7건이 뒤집혔고 **전부 현행 과소**였다(750,000~20,900,000).
   *
   * 그래서 다건 엔진은 집계를 A/B 두 번 돌려 비교한 결과를 `scenarioOverride`로 내려보낸다
   * (`transfer-tax-aggregate-carryover-scope.ts`). 여기서는 **그 값을 그대로 따른다**.
   *
   * 동률(A === B)이면 A 채택 — 단서 조건이 「**적은** 경우」라 동률은 적용 유지다.
   */
  const adoptedScenario: "A" | "B" =
    args.scenarioOverride ?? (determinedTaxA >= determinedTaxB ? "A" : "B");
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
    /**
     * B는 일반 취득으로 처리 — **세율 보유기간도 증여일 기산이 된다**(§104②2호 미적용).
     *
     * 이는 의도된 결과다. §104②2호의 대상은 「§97의2제1항에 **해당하는 자산**」인데,
     * 구법(~2013.12.31)에서는 §104②2호가 「**제97조제4항**에 해당하는 자산」이었고
     * 구 §97④가 배제사유(수용)를 **본문 안 「~한 경우 외에는」**으로 품고 있어서
     * 배제 자산은 문언상 「④에 해당하는 자산」이 **아니었다**.
     * 2014.1.1.(법률 제12169호)의 §97의2 이관은 개정이유에 **가업상속 ④ 신설만** 적힌
     * **조문 정비**이므로 적용 범위는 그대로다.
     * ⇒ §97의2②(수용·1세대1주택·세액비교)로 배제되면 증여자 취득일로 소급하지 않는다.
     *
     * 계획서 §2 ⑧ · §3.2 / anchor `rate-104-2-2-gift-scope.anchor.test.ts` C-1~C-3.
     * ⚠️ 이 줄을 `"carryover_gift"`로 바꾸면 배제 자산에 통산이 들어가 과소과세가 된다.
     */
    acquisitionCause: "purchase",
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
