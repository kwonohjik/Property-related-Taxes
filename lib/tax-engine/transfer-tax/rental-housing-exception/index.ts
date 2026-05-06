/**
 * 장기임대주택 보유자의 거주주택 양도 비과세 특례 — 진입점
 *
 * A/B 시나리오 분기 후 각 케이스 계산 오케스트레이션.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  RH-A1  임대주택 + 거주주택 → 거주주택 양도 (12억 이하)  → taxableGain = 0  │
 * │  RH-A2  동상 (12억 초과)  → taxableGain = gain95T2 × (S−12억)/S           │
 * │  RH-B1  PHRP 양도 (12억 이하)  → §161① 안분                              │
 * │  RH-B2  PHRP 양도 (12억 초과)  → §161②1호+2호 합산                       │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * 법령 근거:
 *   소득세법 시행령 §155⑳ (주택수 제외 + 비과세 특례)
 *   소득세법 시행령 §161 (PHRP 기준시가 안분)
 *   소득세법 §95② 별표 (표1 일반 / 표2 1세대1주택 장기보유공제)
 */

import { safeMultiplyThenDivide } from "../../tax-utils";
import { checkEligibility } from "./eligibility";
import { calculateGain95BothTables } from "./ltc-table-split";
import { validatePrices, calculatePrhpAllocation } from "./prhp-allocation";
import type {
  RentalHousingExceptionInput,
  RentalHousingExceptionResult,
  FormulaTrace,
} from "./types";

export type {
  RentalUnitInput,
  RentalType,
  RegionType,
  RentalHousingExceptionInput,
  RentalHousingExceptionResult,
  EligibilityResult,
  FormulaTrace,
} from "./types";

// 12억 비과세 임계값
const HIGH_VALUE_THRESHOLD = 1_200_000_000;

/**
 * 미충족 시 반환하는 기본 결과 (eligibility.passed === false)
 */
function makeIneligibleResult(
  eligibility: RentalHousingExceptionResult["eligibility"],
  gain95Table1: number,
  gain95Table2: number,
): RentalHousingExceptionResult {
  return {
    applied: false,
    scenarioId: "RH-A1",
    eligibility,
    taxableGain: 0,
    exemptGain: 0,
    appliedTable: "table-1",
    formulaTrace: {
      gain95Table1,
      gain95Table2,
      capApplied: false,
    },
  };
}

/**
 * 장기임대주택 거주주택 비과세 특례 계산 메인 함수
 *
 * @param input 특례 입력 (applyException=false면 즉시 applied=false 반환)
 * @param gain 양도차익 (원) — 기존 transfer-tax 엔진에서 계산된 값
 * @param S 양도가액 (원)
 * @param holdYears 보유연수 (정수)
 * @param liveYears 거주연수 (정수)
 * @param residenceHoldYears 거주주택 보유연수 (§155⑳ 2년 요건)
 * @param residenceLiveYears 거주주택 거주연수 (§155⑳ 2년 요건)
 */
export function calculateRentalHousingException(
  input: RentalHousingExceptionInput,
  gain: number,
  S: number,
  holdYears: number,
  liveYears: number,
  residenceHoldYears: number,
  residenceLiveYears: number,
): RentalHousingExceptionResult {
  // ─── Step 0: 토글 OFF ─────────────────────────────────────
  if (!input.applyException) {
    const { gain95Table1, gain95Table2 } = calculateGain95BothTables(
      gain, holdYears, liveYears,
    );
    return makeIneligibleResult(
      { passed: false, failReasons: [], residenceFailReasons: ["특례 미적용 (토글 OFF)"], laws: [] },
      gain95Table1,
      gain95Table2,
    );
  }

  // ─── Step 1: 표1·표2 동시 산출 ────────────────────────────
  const { gain95Table1, gain95Table2 } =
    calculateGain95BothTables(gain, holdYears, liveYears);

  // ─── Step 2: 요건 판정 ────────────────────────────────────
  const eligibility = checkEligibility(
    input.rentalUnits,
    residenceHoldYears,
    residenceLiveYears,
  );

  if (!eligibility.passed) {
    return makeIneligibleResult(eligibility, gain95Table1, gain95Table2);
  }

  // ─── Step 3: 시나리오 분기 ────────────────────────────────
  if (input.scenario === "A") {
    return calculateScenarioA(
      eligibility, gain95Table1, gain95Table2, S,
    );
  } else {
    return calculateScenarioB(
      input, eligibility, gain95Table1, gain95Table2, S,
    );
  }
}

// ============================================================
// A 시나리오 — 자가 거주주택 양도
// ============================================================

function calculateScenarioA(
  eligibility: RentalHousingExceptionResult["eligibility"],
  gain95Table1: number,
  gain95Table2: number,
  S: number,
): RentalHousingExceptionResult {
  const isHighValue = S > HIGH_VALUE_THRESHOLD;

  if (!isHighValue) {
    // RH-A1: 전액 비과세
    return {
      applied: true,
      scenarioId: "RH-A1",
      eligibility,
      taxableGain: 0,
      exemptGain: gain95Table2, // 표2 기준 전액 비과세 (1세대1주택)
      appliedTable: "table-2",
      formulaTrace: {
        gain95Table1,
        gain95Table2,
        capApplied: false,
      },
    };
  }

  // RH-A2: 12억 초과 — 고가주택
  // taxableGain = gain95(표2) × (S − 12억) / S
  const highNumerator = S - HIGH_VALUE_THRESHOLD;
  const ratioHighValue = S > 0 ? highNumerator / S : 0;

  const taxableGain = safeMultiplyThenDivide(gain95Table2, highNumerator, S);
  const exemptGain = gain95Table2 - taxableGain;

  return {
    applied: true,
    scenarioId: "RH-A2",
    eligibility,
    taxableGain,
    exemptGain,
    appliedTable: "table-2",
    formulaTrace: {
      gain95Table1,
      gain95Table2,
      ratioHighValue,
      capApplied: false,
    },
  };
}

// ============================================================
// B 시나리오 — 직전거주주택보유주택(PHRP) 양도
// ============================================================

function calculateScenarioB(
  input: RentalHousingExceptionInput,
  eligibility: RentalHousingExceptionResult["eligibility"],
  gain95Table1: number,
  gain95Table2: number,
  S: number,
): RentalHousingExceptionResult {
  // B 시나리오 전용 필드 검증
  const priceValidation = validatePrices(
    input.standardPriceAtAcquisition,
    input.standardPriceAtPriorTransfer,
    input.standardPriceAtTransfer,
  );

  if (!priceValidation.valid) {
    // 기준시가 미입력 시 validation 차단 — 자동 안분 fallback 금지 정책
    return {
      applied: false,
      scenarioId: "RH-B1",
      eligibility: {
        ...eligibility,
        passed: false,
        residenceFailReasons: [
          ...eligibility.residenceFailReasons,
          priceValidation.message,
        ],
      },
      taxableGain: 0,
      exemptGain: 0,
      appliedTable: "table-1",
      formulaTrace: {
        gain95Table1,
        gain95Table2,
        capApplied: false,
      },
    };
  }

  // priorResidenceTransferDate 필수 검증
  if (!input.priorResidenceTransferDate) {
    return {
      applied: false,
      scenarioId: "RH-B1",
      eligibility: {
        ...eligibility,
        passed: false,
        residenceFailReasons: [
          ...eligibility.residenceFailReasons,
          "직전거주주택 양도일(priorResidenceTransferDate)이 입력되지 않았습니다.",
        ],
      },
      taxableGain: 0,
      exemptGain: 0,
      appliedTable: "table-1",
      formulaTrace: {
        gain95Table1,
        gain95Table2,
        capApplied: false,
      },
    };
  }

  const P_acq = input.standardPriceAtAcquisition!;
  const P_prior = input.standardPriceAtPriorTransfer!;
  const P_transfer = input.standardPriceAtTransfer!;

  // §161 안분 계산
  const allocation = calculatePrhpAllocation(
    gain95Table1,
    gain95Table2,
    S,
    P_acq,
    P_prior,
    P_transfer,
  );

  const isHighValue = S > HIGH_VALUE_THRESHOLD;
  const scenarioId = isHighValue ? "RH-B2" : "RH-B1";
  const appliedTable = isHighValue ? "mixed" : "table-1";

  // exemptGain = gain95(표1) − taxableGain (B 시나리오 보고용 — 표1 기준)
  const exemptGain = gain95Table1 - allocation.taxableGain;

  const formulaTrace: FormulaTrace = {
    gain95Table1,
    gain95Table2,
    ratio161_1: allocation.ratio161_1,
    ratio161_2_2: allocation.ratio161_2_2,
    ratioHighValue: allocation.ratioHighValue,
    capApplied: allocation.capApplied,
    part1: allocation.part1,
    part2: allocation.part2,
  };

  return {
    applied: true,
    scenarioId,
    eligibility,
    taxableGain: allocation.taxableGain,
    exemptGain: Math.max(0, exemptGain),
    appliedTable,
    formulaTrace,
  };
}
