/**
 * 장기임대주택 보유자의 거주주택 양도 비과세 특례 — 진입점
 *
 * A/B 시나리오 분기 후 각 케이스 계산 오케스트레이션.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  RH-A1  임대주택 + 거주주택 → 거주주택 양도 (기준 H 이하)  → taxableGain = 0 │
 * │  RH-A2  동상 (H 초과)  → taxableGain = gain95T2 × (S−H)/S                 │
 * │  RH-B1  PHRP 양도 (H 이하)  → §161① 안분                                 │
 * │  RH-B2  PHRP 양도 (H 초과)  → §161②1호+2호 합산                          │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * H = 양도일 기준 고가주택 기준금액 `resolveHighValueHouseThreshold(양도일)` (OH-13):
 *   2008-10-07 ~ 2021-12-07 양도 9억 · 2021-12-08 이후 12억(법률 제18578호 부칙 제7조④).
 *   §155⑳은 거주주택을 1주택으로 「보아 제154조제1항을 적용」하는 조문이라 고가주택 기준도 그 양도일의
 *   §89①3호·§156①을 따른다. 종전의 12억 고정은 2021-12-07 이전 9억~12억 거주주택을 전액 비과세로 만들었다.
 *
 * 법령 근거:
 *   소득세법 시행령 §155⑳ (주택수 제외 + 비과세 특례)
 *   소득세법 시행령 §161 (PHRP 기준시가 안분)
 *   소득세법 §95② 별표 (표1 일반 / 표2 1세대1주택 장기보유공제)
 */

import { safeMultiplyThenDivide } from "../../tax-utils";
import { checkEligibility, type EligibilityContext } from "./eligibility";
import {
  calculateGain95BothTables,
  calculateGain95BothTablesByParts,
  type Gain95BothTables,
  type Gain95BothTablesByParts,
  type RentalLthdParts,
} from "./ltc-table-split";
import { validatePrices, calculatePrhpAllocation } from "./prhp-allocation";
import type {
  RentalHousingExceptionInput,
  RentalHousingExceptionResult,
  FormulaTrace,
  HighValueExcessRulingTrace,
} from "./types";

export type {
  RentalUnitInput,
  RentalCategory,
  RentalArticle,
  RegionType,
  RentalHousingExceptionInput,
  RentalHousingExceptionResult,
  EligibilityResult,
  RentalUnitVerdict,
  FormulaTrace,
  HighValueExcessRulingTrace,
} from "./types";

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
 * @param highValueThreshold 양도일 기준 고가주택 기준금액 — `resolveHighValueHouseThreshold(양도일)`.
 *   **기본값이 없다**(OH-13): 기본값을 두면 호출부가 빠뜨렸을 때 12억으로 조용히 계산된다.
 */
export function calculateRentalHousingException(
  input: RentalHousingExceptionInput,
  gain: number,
  S: number,
  holdYears: number,
  liveYears: number,
  residenceHoldYears: number,
  residenceLiveYears: number,
  highValueThreshold: number,
  /** §155의3① — 거주주택이 상생임대주택이면 §155⑳1호 거주요건이 면제된다. */
  winWinResidenceExempt = false,
  /** 거주주택·양도 시점 사실(OH-15·16·40) — `checkEligibility`에 그대로 넘긴다. */
  eligibilityContext?: EligibilityContext,
  /**
   * 양도일 — 표2 연혁(2009~2020 보유 연 8%)을 가른다(`calcLongTermRate`). 미제공이면 현행 식.
   * 호출부(`runRentalHousingExceptionStep`)는 항상 넘긴다.
   */
  transferDate?: Date,
  /**
   * A2(거주주택 고가주택 양도)에 한해 — 배율 초과 부수토지가 함께 있어 호출부가 재산세제과-915 회신 방식으로 만든 과세 양도차익.
   * 있으면 A2의 `gain95(표2) × (S − 기준)/S` 대신 이 과세 양도차익(`taxableBeforeLthd`)에 표2 장기보유특별공제를 적용한다
   * (이미 안분이 끝난 값이라 비율을 다시 곱하면 이중 안분이다). B 시나리오에는 쓰지 않는다(§161 안분과의 결합 근거 없음).
   */
  highValueExcessRuling?: HighValueExcessRulingTrace,
  /**
   * 토지·건물 **파트별 보유연수**로 장기보유특별공제를 구할 때의 파트 입력(§95④ — 일반 경로 split 분기와 같은 규칙).
   * 있으면 `gain`·`holdYears`로 만든 단일 보유연수 산식 대신 이 값으로 표1·표2를 산출하고(파트 손실 0 하한,
   * 토지가 주택보다 오래되면 기본통칙 95-0…1), 없으면(토지·건물 분리 없음 — 단일 자산) 종전 그대로다.
   * 파트 양도차익의 합은 `gain`과 같아야 한다 — 호출부가 보장하고 어긋나면 넘기지 않는다.
   */
  lthdParts?: RentalLthdParts,
): RentalHousingExceptionResult {
  const bothTables = (g: number, parts?: RentalLthdParts): Gain95BothTables | Gain95BothTablesByParts =>
    parts
      ? calculateGain95BothTablesByParts(parts, liveYears, transferDate)
      : calculateGain95BothTables(g, holdYears, liveYears, transferDate);
  const isByParts = (t: Gain95BothTables | Gain95BothTablesByParts): t is Gain95BothTablesByParts => "land" in t;
  const withPartsEcho = (r: RentalHousingExceptionResult, t: Gain95BothTables | Gain95BothTablesByParts): RentalHousingExceptionResult =>
    isByParts(t)
      ? { ...r, formulaTrace: { ...r.formulaTrace, partsLthd: { land: t.land, building: t.building } } }
      : r;

  // ─── Step 0: 토글 OFF ─────────────────────────────────────
  if (!input.applyException) {
    const tables = bothTables(gain, lthdParts);
    return withPartsEcho(
      makeIneligibleResult(
        { passed: false, failReasons: [], residenceFailReasons: ["특례 미적용 (토글 OFF)"], laws: [] },
        tables.gain95Table1,
        tables.gain95Table2,
      ),
      tables,
    );
  }

  // ─── Step 1: 표1·표2 동시 산출 ────────────────────────────
  const tables = bothTables(gain, lthdParts);
  const { gain95Table1, gain95Table2 } = tables;

  // ─── Step 2: 요건 판정 ────────────────────────────────────
  const eligibility = checkEligibility(
    input.rentalUnits,
    residenceHoldYears,
    residenceLiveYears,
    winWinResidenceExempt,
    eligibilityContext,
  );

  if (!eligibility.passed) {
    return withPartsEcho(makeIneligibleResult(eligibility, gain95Table1, gain95Table2), tables);
  }

  // ─── Step 3: 시나리오 분기 ────────────────────────────────
  if (input.scenario === "A") {
    return withPartsEcho(
      calculateScenarioA(
        eligibility, gain95Table1, gain95Table2, S, highValueThreshold,
        highValueExcessRuling
          ? {
              trace: highValueExcessRuling,
              // 회신 방식 과세 양도차익은 파트별로(토지 기준면적 이내분·건물 안분값) 장기보유특별공제를 적용한다.
              gain95Table2OfTaxable: bothTables(
                highValueExcessRuling.taxableBeforeLthd,
                lthdParts
                  ? {
                      land: { ...lthdParts.land, gain: highValueExcessRuling.landTaxableGain },
                      building: { ...lthdParts.building, gain: highValueExcessRuling.buildingTaxableGain },
                    }
                  : undefined,
              ).gain95Table2,
            }
          : undefined,
      ),
      tables,
    );
  } else {
    return withPartsEcho(
      calculateScenarioB(input, eligibility, gain95Table1, gain95Table2, S, highValueThreshold),
      tables,
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
  highValueThreshold: number,
  ruling?: { trace: HighValueExcessRulingTrace; gain95Table2OfTaxable: number },
): RentalHousingExceptionResult {
  const isHighValue = S > highValueThreshold;

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
        highValueThreshold,
      },
    };
  }

  // RH-A2: 기준 초과 — 고가주택
  // taxableGain = gain95(표2) × (S − 기준) / S
  const highNumerator = S - highValueThreshold;
  const ratioHighValue = S > 0 ? highNumerator / S : 0;

  // 배율 초과 부수토지가 함께 있으면(`ruling`) 호출부가 재산세제과-915 회신 방식으로 안분을 이미 끝낸 과세 양도차익을 넘긴다 — 표2 공제만 적용한다.
  const taxableGain = ruling
    ? ruling.gain95Table2OfTaxable
    : safeMultiplyThenDivide(gain95Table2, highNumerator, S);
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
      highValueThreshold,
      ...(ruling ? { highValueExcessRuling: ruling.trace } : {}),
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
  highValueThreshold: number,
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

  // 취득 뒤 하락했다가 직전 양도 뒤 회복한 입력(직전 양도 당시 < 취득 당시)의 12억 초과 양도 — §161②2호 비율이 1을 넘는다.
  // 일반 1주택보다 많이 과세하는 값(원안)과 1로 자르는 값 사이에서 정할 해석례가 없어 ⑧과 같이 계산기 미지원이다(결정 #22 하위 다).
  // ⑧(계산기·부담부증여)이 막지만 API 직접 호출은 거치지 않으므로 엔진도 특례 없이 일반 과세한다(「모름」은 혜택 불성립).
  if (S > highValueThreshold && input.standardPriceAtPriorTransfer! < input.standardPriceAtAcquisition!) {
    return {
      applied: false,
      scenarioId: "RH-B2",
      eligibility: {
        ...eligibility,
        passed: false,
        residenceFailReasons: [
          ...eligibility.residenceFailReasons,
          "직전거주주택 양도 당시 기준시가가 취득 당시보다 작고 양도가액이 고가주택 기준을 넘어 §161②2호 비율이 1을 넘습니다 — 계산기 미지원(해석례 미확보)이라 특례를 적용하지 않았습니다.",
        ],
      },
      taxableGain: 0,
      exemptGain: 0,
      appliedTable: "table-1",
      formulaTrace: { gain95Table1, gain95Table2, capApplied: false },
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
    highValueThreshold,
  );

  const isHighValue = S > highValueThreshold;
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
    ...(allocation.numerator1Clamped ? { numerator1Clamped: true } : {}),
    ...(allocation.numerator2Clamped ? { numerator2Clamped: true } : {}),
    part1: allocation.part1,
    part2: allocation.part2,
    highValueThreshold,
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
