/**
 * §154⑩ 표준 경로(I-5) anchor — 「직전거주주택보유주택(PHRP)이 이미 임대주택을 전부 처분·등록말소해
 * 양도일 현재 공동보유 중인 장기임대주택이 없는」 경우.
 *
 * 종전에는 `rentalUnits`가 반드시 1호 이상이어야 §155⑳ 경로에 진입할 수 있었다(⑫ Zod `.min(1)`,
 * `checkEligibility`의 `allUnitsPassed = rentalUnits.length > 0`) — 그래서 이 사실관계는 입력 경로가
 * 아예 없었고, 계산기는 이 주택을 (임대 이력을 모르는) 평범한 1세대1주택으로 계산해 잘못된 요건으로
 * 비과세를 판단했다.
 *
 * ## 요건 (교정 반영 — I-5 correction)
 *
 * 1호: 「민간임대주택에 관한 특별법」§5 등록 또는 「영유아보육법」§12·§13 어린이집 운영 사실
 *   (`wasRegisteredRentalOrChildcare`).
 * 2호(PHRP 정의): 직전거주주택 양도일(`priorResidenceTransferDate`) 입력.
 * 보유기간: **실제 취득일**부터 2년 이상(소령 §154⑤→§95④, 재기산 없음 — 서면법규재산-2020-1309
 *   질의5 · 기준-2020-법령해석재산-0143). §154⑩의 「양도일 후의 기간분」은 §161①의 과세 **비율**만
 *   한정한다.
 * 거주기간: 취득 시기별 분기(서면-2023-법규재산-0426[법규과-1841] · 기획재정부 재산세제과-1081 ·
 *   교재 「1세대 2주택의 비과세특례」 p.736-737).
 *   - 2019.2.12 이후 취득(경과조치 제외): §155⑳1호 괄호 준용 — 등록일(또는 어린이집 인가일) 이후
 *     거주기간 2년(`postRegistrationResidenceMonths` 재사용, 지역 불문).
 *   - 2019.2.12 전 취득(또는 경과조치): §154① 원칙 — 취득 당시 조정대상지역인 경우에만 일반
 *     거주기간 2년(`residenceLiveYears`, 등록일로 자르지 않음).
 *
 * §161①은 §154⑩·§155⑳ PHRP를 「직전거주주택보유주택등」으로 묶어 같은 안분 산식을 쓰므로
 * (RH-B1/B2와 동일 §161 수학), 이 anchor는 `rh-b1-prhp-under-12.test.ts`(PDF#1 사례)와 같은
 * 숫자로 §154⑩ 경로가 §155⑳ PHRP 경로와 같은 세액을 낸다는 것도 함께 확인한다.
 *
 * 법령 근거: 소득세법 시행령 §154⑩ · §154① · §154⑤ · §95④ · §155⑳ 각 호 외의 부분 후단 · §161①
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

/** PDF#1 사례의 거주주택 실제 취득일(2009-08-12) — 2019.2.12 전(preRegime) 기본값. */
function makeCtx(overrides: Partial<EligibilityContext> = {}): EligibilityContext {
  return {
    scenario: "B",
    transferDate: new Date("2023-03-03"),
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

  it("anchor: 2019.2.12 전 취득(preRegime) + 비조정지역 → 거주요건 없이 보유 2년만으로 통과", () => {
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

  it("anchor: 직전거주주택 양도일 미입력 → 판정 불가 사유(§154⑩2호)", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({ priorResidenceTransferDate: undefined }),
    );
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("직전거주주택 양도일"))).toBe(true);
  });

  it("anchor: 보유기간 — 실제 취득일 기준 2년 미만이면 불충족(직전거주주택 양도일과 무관)", () => {
    // residenceHoldYears는 호출부가 실제 취득일로 계산해 넘기는 값이다 — 재기산하지 않는다.
    const result = checkEligibility([], 1, LIVE_YEARS, false, makeCtx());
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("보유기간 2년 미충족"))).toBe(true);
  });

  it("anchor: 보유기간 — 직전거주주택 양도일 후로는 2년 미만이어도, 실제 취득일 기준 2년 이상이면 보유요건은 통과", () => {
    // 직전거주주택 양도일(2016-08-25)~양도일(2023-03-03)은 6년여지만, 애초에 재기산하지 않으므로
    // 이 경로 자체가 「직전거주주택 양도일부터 2년」을 요구하지 않는다는 것을 별도로 확인한다.
    // 실제 취득일 기준 보유(HOLD_YEARS=13)만 만족하면 되므로, 직전거주주택 양도일을 양도일 바로
    // 직전으로 당겨도(재기산 관점에서 "2년 미만") 보유기간 실패 사유는 나오지 않는다.
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({ priorResidenceTransferDate: new Date("2023-02-01") }), // 양도일(2023-03-03) 한 달 전
    );
    expect(result.residenceFailReasons.some((r) => r.includes("보유기간"))).toBe(false);
  });

  it("anchor: preRegime + 취득 당시 조정대상지역 + 거주기간(일반) 2년 미만 → 불충족(§154①)", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, 1, false,
      makeCtx({ wasRegulatedAtAcquisition: true }),
    );
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("§154①"))).toBe(true);
  });

  it("anchor: preRegime + 취득 당시 조정대상지역 + 거주기간(일반) 2년 이상 → 통과", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({ wasRegulatedAtAcquisition: true }),
    );
    expect(result.passed).toBe(true);
  });

  it("anchor: preRegime + 비조정지역이면 거주기간이 0이어도 통과(§154① — 조정지역 취득만 거주요건)", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, 0, false,
      makeCtx({ wasRegulatedAtAcquisition: false }),
    );
    expect(result.passed).toBe(true);
  });

  it("anchor: 2019.2.12 이후 취득(종전규정 아님) + postRegistrationResidenceMonths 미입력 → 판정 불가", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({ residenceAcquisitionDate: new Date("2020-01-01") }),
    );
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("괄호 준용"))).toBe(true);
  });

  it("anchor: 2019.2.12 이후 취득 + postRegistrationResidenceMonths 24개월 이상 → 통과(지역 불문)", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({
        residenceAcquisitionDate: new Date("2020-01-01"),
        postRegistrationResidenceMonths: 24,
        wasRegulatedAtAcquisition: false, // 지역 불문임을 확인
      }),
    );
    expect(result.passed).toBe(true);
  });

  it("anchor: 2019.2.12 이후 취득 + postRegistrationResidenceMonths 24개월 미만 → 불충족", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({ residenceAcquisitionDate: new Date("2020-01-01"), postRegistrationResidenceMonths: 12 }),
    );
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.some((r) => r.includes("등록일 이후) 2년 미충족"))).toBe(true);
  });

  it("anchor: 부칙 제7조② 경과조치(residenceTransitionUnderAddendum) → 2019.2.12 이후 취득이어도 preRegime(§154①) 취급", () => {
    const result = checkEligibility(
      [], HOLD_YEARS, LIVE_YEARS, false,
      makeCtx({
        residenceAcquisitionDate: new Date("2020-01-01"),
        residenceTransitionUnderAddendum: true,
        wasRegulatedAtAcquisition: false,
        // postRegistrationResidenceMonths 미입력이어도 preRegime 취급이라 요구되지 않는다.
      }),
    );
    expect(result.passed).toBe(true);
  });

  it("positive twin: §155⑳ 경로(rentalUnits 1호 이상)는 §154⑩ 게이트·취득 시기 분기를 타지 않는다(회귀 0)", () => {
    // ctx.residenceAcquisitionDate가 2019.2.12 이후라도 rentalUnits가 있으면 종전 §155⑳ 판정
    // (postRegistrationResidenceMonths 필요)으로 간다 — §154⑩ 판정이 끼어들지 않는다.
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
      HOLD_YEARS, LIVE_YEARS,
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
