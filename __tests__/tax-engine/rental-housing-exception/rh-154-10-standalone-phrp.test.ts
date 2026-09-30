/**
 * §154⑩ 표준 경로(I-5) anchor — 「직전거주주택보유주택(PHRP)이 이미 임대주택을 전부 처분·등록말소해
 * 양도일 현재 공동보유 중인 장기임대주택이 없는」 경우.
 *
 * 종전에는 `rentalUnits`가 반드시 1호 이상이어야 §155⑳ 경로에 진입할 수 있었다(⑫ Zod `.min(1)`,
 * `checkEligibility`의 `allUnitsPassed = rentalUnits.length > 0`) — 그래서 이 사실관계는 입력 경로가
 * 아예 없었고, 계산기는 이 주택을 (임대 이력을 모르는) 평범한 1세대1주택으로 계산해 **취득일부터
 * 전체 보유기간**을 기준으로 비과세를 판단했다(과소과세 — 직전거주주택 양도일 전 기간이 「1주택
 * 보유」로 잘못 산입됐다).
 *
 * §154⑩은 이 사실관계(1. 임대주택으로 등록되거나 어린이집으로 운영된 사실이 있을 것 2. 그 주택이
 * §155⑳ 후단의 PHRP일 것)를 충족하면 「직전거주주택의 양도일 후의 기간분에 대해서만 국내에 1주택을
 * 보유한 것으로 보아 제1항을 적용한다」고 정한다 — §155⑳ 본문(전단, 공동보유 장기임대주택 요구)이
 * 아니라 **후단의 PHRP 정의만** 빌린다. §161①은 §154⑩에 따른 1세대1주택도 §155⑳ PHRP와 **같은
 * 안분 산식**으로 계산하도록 정하므로(「직전거주주택보유주택등」), RH-B1/B2와 동일한 §161 수학을
 * 그대로 재사용한다 — 이 anchor는 `rh-b1-prhp-under-12.test.ts`(PDF#1 사례)와 **동일한 숫자**로
 * §154⑩ 경로가 §155⑳ PHRP 경로와 같은 세액을 낸다는 것을 확인한다.
 *
 * 법령 근거: 소득세법 시행령 §154⑩ · §155⑳ 각 호 외의 부분 후단 · §161①
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";
import {
  checkEligibility,
  type EligibilityContext,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { TRANSFER_RENTAL_HOUSING } from "@/lib/tax-engine/legal-codes/transfer";

// PDF#1 사례(rh-b1-prhp-under-12.test.ts)와 동일 숫자 — §154⑩ 경로도 같은 §161① 산식임을 확인.
const GAIN = 311_000_000;
const S = 800_000_000;
const HOLD_YEARS = 13;
const LIVE_YEARS = 2;
const P_ACQ = 300_000_000;
const P_PRIOR = 450_000_000;
const P_TRANSFER = 500_000_000;
const TAXABLE_GAIN = 172_605_000;
const EXEMPT_GAIN = 57_535_000;

function makeCtx(overrides: Partial<EligibilityContext> = {}): EligibilityContext {
  return {
    scenario: "B",
    transferDate: new Date("2023-03-03"),
    // 직전거주주택 양도일(2016-08-25) 후 보유기간 테스트용 — 취득 당시 조정대상지역이 아니라고 가정.
    residenceAcquisitionDate: new Date("2009-08-12"),
    priorResidenceTransferDate: new Date("2016-08-25"),
    wasRegisteredRentalOrChildcare: true,
    wasRegulatedAtAcquisition: false,
    ...overrides,
  };
}

function makeInput(overrides: Partial<RentalHousingExceptionInput> = {}): RentalHousingExceptionInput {
  return {
    applyException: true,
    scenario: "B",
    rentalUnits: [], // §154⑩ 표준 경로 — 공동보유 장기임대주택 0호
    priorResidenceTransferDate: new Date("2016-08-25"),
    standardPriceAtAcquisition: P_ACQ,
    standardPriceAtPriorTransfer: P_PRIOR,
    standardPriceAtTransfer: P_TRANSFER,
    ...overrides,
  };
}

describe("§154⑩ 표준 경로(I-5) — rentalUnits 0호인 시나리오 B", () => {
  it("결함 재현(RED 문서화): rentalUnits=[]이면 §154⑩ 사실이 충족돼도 checkEligibility는 종전에 무조건 불통과였다", () => {
    // ctx 없이 호출(구 동작 그대로) — allUnitsPassed 초기값이 rentalUnits.length > 0에 의존하던 종전 로직의
    // 흔적을 남긴다. isStandalone154_10 게이트가 없으면 이 값은 항상 false다.
    const result = checkEligibility([], 13, 2, false, undefined);
    expect(result.passed).toBe(false);
  });

  it("anchor: §154⑩1호(등록·운영 사실)+2호(PHRP)+보유2년 충족 → 요건 통과", () => {
    const result = checkEligibility([], HOLD_YEARS, LIVE_YEARS, false, makeCtx());
    expect(result.passed).toBe(true);
    expect(result.laws).toEqual([TRANSFER_RENTAL_HOUSING.PIT_RD_154_10]);
  });

  it("anchor: 1호 미충족(등록·운영 사실 없음) → residenceFailReasons에 §154⑩1호 사유", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({ wasRegisteredRentalOrChildcare: false }),
    );
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("§154⑩1호"))).toBe(true);
  });

  it("anchor: 직전거주주택 양도일 미입력 → 판정 불가 사유", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({ priorResidenceTransferDate: undefined }),
    );
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("직전거주주택 양도일"))).toBe(true);
  });

  it("anchor: 직전거주주택 양도일 후 보유기간 2년 미만 → 불충족", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({
        transferDate: new Date("2018-01-01"), // 2016-08-25 → 2018-01-01: 1년여
        priorResidenceTransferDate: new Date("2016-08-25"),
      }),
    );
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("보유기간 2년 미충족"))).toBe(true);
  });

  it("anchor: 취득 당시 조정대상지역 + 거주기간 미입력 → 판정 불가", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({ wasRegulatedAtAcquisition: true }),
    );
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("조정대상지역"))).toBe(true);
  });

  it("anchor: 취득 당시 조정대상지역 + 거주기간 24개월 이상 → 통과", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({ wasRegulatedAtAcquisition: true, residenceMonthsAfterPriorResidenceTransfer: 24 }),
    );
    expect(result.passed).toBe(true);
  });

  it("anchor: 취득 당시 조정대상지역 + 거주기간 24개월 미만 → 불충족", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({ wasRegulatedAtAcquisition: true, residenceMonthsAfterPriorResidenceTransfer: 23 }),
    );
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("거주기간 2년 미충족"))).toBe(true);
  });

  it("positive twin: §155⑳ 경로(rentalUnits 1호 이상)는 §154⑩ 게이트를 타지 않는다(회귀 0)", () => {
    // ctx.scenario === "B"이고 wasRegisteredRentalOrChildcare가 없어도 rentalUnits가 있으면
    // 종전 §155⑳ 판정(postRegistrationResidenceMonths 필요)으로 간다 — §154⑩ 판정이 끼어들지 않는다.
    const result = checkEligibility(
      [
        {
          businessRegistrationDate: new Date("2016-01-01"),
          rentalRegistrationDate: new Date("2016-01-01"),
          rentalCategory: "long_general",
          rentalAcquisitionType: "purchase",
          isApartment: true,
          region: "non-metro",
          isExcluded918Rule: false,
          standardPriceAtRentalStart: 300_000_000,
          hasMinimum2Units: false,
          rentalMonths: 96,
          rentalAutoTermination: false,
          requirementsConfirmed: true,
        },
      ],
      HOLD_YEARS,
      LIVE_YEARS,
      false,
      makeCtx({ postRegistrationResidenceMonths: undefined }),
    );
    // postRegistrationResidenceMonths 미입력 → §155⑳1호 판정 불가 사유(§154⑩1호 사유가 아니다)
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("§155⑳1호"))).toBe(true);
    expect(result.residenceFailReasons.some((r) => r.includes("§154⑩1호"))).toBe(false);
  });

  it("통합: §161① 안분 — RH-B1(12억 이하)과 동일 숫자 (before→after 세액 확인)", () => {
    const result = calculateRentalHousingException(
      makeInput(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      HOLD_YEARS, LIVE_YEARS, // residenceHoldYears/LiveYears — §154⑩ 경로에서는 미사용(무시됨)
      1_200_000_000,
      false,
      makeCtx(),
    );
    expect(result.applied).toBe(true);
    expect(result.eligibility.passed).toBe(true);
    expect(result.scenarioId).toBe("RH-B1");
    expect(result.taxableGain).toBe(TAXABLE_GAIN);
    expect(result.exemptGain).toBe(EXEMPT_GAIN);
  });

  it("before→after: §154⑩ 사실 미충족(등록 이력 없음) → applied=false, 전액 비과세 폴백 없음", () => {
    const result = calculateRentalHousingException(
      makeInput(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      HOLD_YEARS, LIVE_YEARS,
      1_200_000_000,
      false,
      makeCtx({ wasRegisteredRentalOrChildcare: false }),
    );
    expect(result.applied).toBe(false);
    expect(result.eligibility.passed).toBe(false);
  });
});
