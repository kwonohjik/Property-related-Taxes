/**
 * P4-3a 앵커 — 판정 메뉴의 §155⑳ 장기임대주택 특례
 *
 * 계획서 Q-7(「판정 사실은 판정 메뉴 · 세액 산식 입력은 계산기」).
 *
 * ## 🔴 이 축이 없던 동안 판정 메뉴는 **오답을 냈다**
 *
 * §155⑳은 계산기에서 **STEP 2.5**(`checkExemption` 이후)에 돈다. 판정 route는
 * `judgeOneHouseExemptionFromInput`까지만 가므로 그 단계에 닿지 않았다. 그래서 장기임대주택
 * 보유자가 임대주택을 명부에서 빼고 판정하면 — 특례가 주택 수에서 빼 주는 것이 전제이므로
 * 그게 정상 입력이다 — 임대 요건을 **하나도 보지 않은 채** 「1주택 → 비과세」가 나왔다.
 *
 * RH-3·RH-4가 그 구멍을 고정한다. 계산기의 `isPrhpScenarioAIneligible`(STEP 1a 조기반환
 * 억제)이 막고 있는 것과 **같은 over-exemption**이다.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import {
  buildRentalHousingVerdict,
  applyRentalHousingVerdict,
} from "@/lib/tax-engine/one-house/rental-housing-verdict";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

/** Zod 필수 필드 기본값 — 1주택·5년 보유·5년 거주로 그 자체로는 비과세가 나오는 세팅. */
const BASE = {
  propertyType: "housing",
  transferDate: "2024-06-01",
  acquisitionDate: "2019-06-01",
  transferPrice: 1_000_000_000,
  acquisitionPrice: 300_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  householdHousingCount: 1,
  residencePeriodMonths: 60,
  annualBasicDeductionUsed: 0,
  reductions: [],
} as const;

async function post(over: Record<string, unknown> = {}) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify({ ...BASE, ...over }),
    }),
  );
  return { status: res.status, json: await res.json() };
}

/**
 * 요건을 **충족하는** 임대주택 1호 — 장기일반민간임대(장목), 매입, 수도권, 기준시가 6억 이하,
 * 의무임대기간(8년=96개월) 충족.
 */
const passingUnit = (over: Record<string, unknown> = {}) => ({
  businessRegistrationDate: "2015-01-01T00:00:00.000Z",
  rentalRegistrationDate: "2015-01-01T00:00:00.000Z",
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  isExcluded918Rule: false,
  hasContractDepositProof: true,
  isExcludedShortToLongChange: false,
  standardPriceAtRentalStart: 500_000_000,
  acquisitionOfficialPrice: 500_000_000,
  isNationalSizeHousing: true,
  hasMinimum2Units: true,
  hasMinimum5UnitsInCity: true,
  rentalMonths: 120,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
  ...over,
});

const rentalBody = (over: Record<string, unknown> = {}, unitOver: Record<string, unknown> = {}) => ({
  applyException: true,
  scenario: "A",
  rentalUnits: [passingUnit(unitOver)],
  ...over,
});

describe("판정 메뉴 §155⑳ — route", () => {
  it("[RH-1] 특례를 선언하지 않으면 응답에 그 축이 **없다**", async () => {
    const { status, json } = await post();
    expect(status).toBe(200);
    // `undefined`(선언 안 함)와 `passed:false`(선언했으나 미충족)는 다른 사실이다.
    expect(json.data.rentalHousingException).toBeUndefined();
    expect(json.data.judgment.isExempt).toBe(true);
  });

  it("[RH-2] 선언 + 요건 충족 → passed, 비과세 유지", async () => {
    const { status, json } = await post({ rentalHousingException: rentalBody() });
    expect(status).toBe(200);
    expect(json.data.rentalHousingException.passed).toBe(true);
    expect(json.data.rentalHousingException.scenario).toBe("A");
    // 충족이면 판정을 건드리지 않는다 — §154① 판정은 이미 checkExemption이 했다.
    expect(json.data.judgment.isExempt).toBe(true);
  });

  /**
   * 🔴 거주주택 거주기간 2년 미달. 특례가 없으면 §154① 거주요건은 **비조정지역이라 애초에
   *    적용되지 않으므로**, 이 케이스는 특례 축이 없으면 그대로 비과세가 난다.
   *    즉 이 단언이 깨지면 정확히 종전의 over-exemption이다.
   */
  it("[RH-3] 선언 + 거주주택 거주 2년 미달 → 미충족이고 **비과세가 꺼진다**", async () => {
    const { status, json } = await post({
      residencePeriodMonths: 12,
      rentalHousingException: rentalBody(),
    });
    expect(status).toBe(200);
    expect(json.data.rentalHousingException.passed).toBe(false);
    expect(json.data.rentalHousingException.residenceFailReasons.length).toBeGreaterThan(0);
    expect(json.data.judgment.isExempt).toBe(false);
    expect(json.data.judgment.isPartialExempt).toBe(false);
  });

  it("[RH-4] 선언 + 임대주택 호 요건 미충족 → 미충족이고 사유가 호 단위로 나온다", async () => {
    const { status, json } = await post({
      // 기준시가 상한 초과 — 호 요건 실패
      rentalHousingException: rentalBody({}, { standardPriceAtRentalStart: 2_000_000_000 }),
    });
    expect(status).toBe(200);
    expect(json.data.rentalHousingException.passed).toBe(false);
    expect(json.data.rentalHousingException.unitFailReasons.length).toBeGreaterThan(0);
    expect(json.data.rentalHousingException.unitFailReasons[0].unitIndex).toBe(0);
    expect(json.data.judgment.isExempt).toBe(false);
  });

  /**
   * §161① 안분 입력은 **판정에 쓰이지 않는다**(Q-7 분할선). B를 골라도 그 값 없이 판정이 난다 —
   * 이것이 깨지면 판정 메뉴가 화면에 없는 칸을 요구하게 된다.
   */
  it("[RH-5] 시나리오 B를 §161 안분 입력 **없이** 보내도 판정이 난다", async () => {
    const { status, json } = await post({
      // OH-40: 기본 픽스처(2019-06-01 취득 · 2024-06-01 양도)는 PHRP 1주택 한정 구간이라 B가 불성립한다 —
      //   이 테스트의 축(§161 입력 없이 판정)을 지키려고 구간 밖 취득일로 둔다.
      acquisitionDate: "2018-01-01",
      // OH-15: B의 §155⑳1호 거주요건(등록 이후 거주기간)은 **판정 사실**이다 — §161 안분 입력이 아니다.
      rentalHousingException: rentalBody({ scenario: "B", postRegistrationResidenceMonths: 36 }),
    });
    expect(status).toBe(200);
    expect(json.data.rentalHousingException.scenario).toBe("B");
    expect(json.data.rentalHousingException.passed).toBe(true);
  });

  it("[RH-6] §155㉑로 통과한 호는 사후 추징 대상으로 echo된다", async () => {
    const { status, json } = await post({
      // 의무임대기간(장기일반 매입 = 8년) 미달이지만 ㉑로 통과
      rentalHousingException: rentalBody({}, { rentalMonths: 12 }),
    });
    expect(status).toBe(200);
    const rhe = json.data.rentalHousingException;
    expect(rhe.passed).toBe(true);
    expect(rhe.periodPendingUnitIndexes).toContain(0);
  });
  /**
   * 🔴 **뮤테이션이 찾아낸 앵커 구멍이다.** RH-3·RH-4는 양도가 10억이라 애초에
   *    `isPartialExempt`가 false였고, 그래서 「부분비과세도 끈다」를 지워도 아무도 울지 않았다.
   *    12억 초과 고가주택은 `checkExemption`이 **부분비과세**를 내므로 그 축을 따로 본다 —
   *    특례가 깨지면 임대주택이 주택 수에 들어와 1세대1주택 자체가 성립하지 않는다.
   */
  it("[RH-7] 고가주택 + 미충족 → **부분비과세도 꺼진다**", async () => {
    const { status, json } = await post({
      transferPrice: 1_500_000_000,
      residencePeriodMonths: 12,
      rentalHousingException: rentalBody(),
    });
    expect(status).toBe(200);
    expect(json.data.rentalHousingException.passed).toBe(false);
    expect(json.data.judgment.isExempt).toBe(false);
    expect(json.data.judgment.isPartialExempt).toBe(false);
  });

  /** 같은 고가주택이 **충족**이면 부분비과세가 살아 있어야 한다(위 단언의 긍정 짝). */
  it("[RH-8] 고가주택 + 충족 → 부분비과세 유지", async () => {
    const { status, json } = await post({
      transferPrice: 1_500_000_000,
      rentalHousingException: rentalBody(),
    });
    expect(status).toBe(200);
    expect(json.data.rentalHousingException.passed).toBe(true);
    expect(json.data.judgment.isPartialExempt).toBe(true);
  });

});

describe("판정 메뉴 §155⑳ — leaf", () => {
  const judgment = {
    isExempt: true,
    isPartialExempt: false,
    appliedExceptions: [],
    pending: [],
    undetermined: [],
    legalBasis: [],
  } as unknown as OneHouseJudgment;

  it("[RH-11] 미선언(null)은 판정을 건드리지 않는다", () => {
    expect(applyRentalHousingVerdict(judgment, null)).toBe(judgment);
  });

  it("[RH-12] 충족이면 **같은 객체**를 돌려준다 (불필요한 사본 없음)", () => {
    const verdict = {
      scenario: "A" as const,
      passed: true,
      residenceFailReasons: [],
      unitFailReasons: [],
      periodPendingUnitIndexes: [],
      notices: [],
      legalBasis: "소득세법 시행령 §155⑳",
    };
    expect(applyRentalHousingVerdict(judgment, verdict)).toBe(judgment);
  });

  it("[RH-13] 미충족이면 **새 객체**로 비과세를 끈다 (원본 불변)", () => {
    const verdict = {
      scenario: "A" as const,
      passed: false,
      residenceFailReasons: ["거주주택 거주기간 2년 미충족 (현재: 1년)"],
      unitFailReasons: [],
      periodPendingUnitIndexes: [],
      notices: [],
      legalBasis: "소득세법 시행령 §155⑳",
    };
    const out = applyRentalHousingVerdict(judgment, verdict);
    expect(out).not.toBe(judgment);
    expect(out.isExempt).toBe(false);
    // 호출부가 원본을 로그에 남겼을 때 이미 바뀐 값이 찍히면 안 된다.
    expect(judgment.isExempt).toBe(true);
  });

  it("[RH-14] 특례 미선언 입력에는 결론 자체를 만들지 않는다", () => {
    const input = {
      acquisitionDate: new Date("2019-06-01"),
      transferDate: new Date("2024-06-01"),
      residencePeriodMonths: 60,
    } as unknown as TransferTaxInput;
    expect(buildRentalHousingVerdict(input)).toBeNull();
  });
});
