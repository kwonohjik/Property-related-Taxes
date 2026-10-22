/**
 * anchor: 영 §167의3①1호 · §167의10①1호 · §167의4②1호 — 지역기준에서 제외되는 **읍·면**.
 *
 * 계획서: docs/00-pm/multi-house-surcharge-eupmyeon-region.plan.md
 *
 * [법령 — 「소득세법 시행령」 시행 2026-07-01 · 2018.4.1. 시행본도 같은 문언]
 *   「수도권 및 광역시ㆍ특별자치시(광역시에 소속된 군, 「지방자치법」 제3조제3항ㆍ제4항에 따른 읍ㆍ면 및
 *    「세종특별자치시 설치 등에 관한 특별법」 제6조제3항에 따른 읍ㆍ면에 해당하는 지역을 제외한다) 외의 지역」
 *
 * 🔴 결함이었던 것: 지역 분류가 시군구 5자리만 보고 군만 가액기준으로 뺐다 — 경기 도농복합시의 읍·면과
 *    세종 읍·면의 3억 이하 주택이 주택 수에 들어가 중과됐다(과다).
 *
 * B — 엔진은 `region === "capital"`(지역기준 여부)을 **수도권 여부의 대용**으로 썼다(API가 `isCapitalArea`를
 *    보내지 않는다). 읍·면만 고치면 화도읍(수도권)이 「수도권 밖」이 되므로 수도권 판정을 법정동코드 시도로 분리한다.
 *    그 과정에서 광역시=수도권 · 수도권 군=수도권 밖으로 보던 기존 오류도 바로잡힌다.
 *
 * 코드는 모두 행안부 「법정동코드 전체자료」(공공데이터포털 15063424, 2026-10-22 내려받음)에 있는 실코드다.
 * 저가 경계는 시딩 규칙(`HOUSE_COUNT_EXCLUSION_RULES` 3억)으로 본다 — 테스트 헬퍼 `defaultRules`는 1억(구값)이다.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge, type HouseInfo } from "@/lib/tax-engine/multi-house-surcharge";
import {
  classifyRegionCriteriaByCode,
  resolveLowPriceLocalHouse,
  isLongTermRentalHousingExempt,
  isPresaleRightCounted,
} from "@/lib/tax-engine/multi-house-surcharge-count";
import { isSmallNewHouseSpecial, resolvePopulationDeclineSecondHome } from "@/lib/tax-engine/multi-house-surcharge-12ho";
import { HOUSE_COUNT_EXCLUSION_RULES } from "@/lib/tax-engine/data/transfer-rate-seed";
import type { HouseCountExclusionRules, PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import { deriveHouseRegionFromCode } from "@/lib/calc/house-region";
import { mockRegulatedHistory, suspensionNone, makeHouse, makeInput } from "../_helpers/multi-house-mock";

const RULES = HOUSE_COUNT_EXCLUSION_RULES as unknown as HouseCountExclusionRules;
const T = new Date("2026-07-01");

const SEOUL_GANGNAM = "1168010100"; // 서울 강남구 역삼동
const NAMYANGJU_HOPYEONG = "4136010100"; // 경기 남양주시 호평동
const NAMYANGJU_HWADO_EUP = "4136025621"; // 경기 남양주시 화도읍 마석우리
const PAJU_WOLLONG_MYEON = "4148031021"; // 경기 파주시 월롱면 위전리
const SEJONG_BANGOK = "3611010100"; // 세종 반곡동
const SEJONG_JOCHIWON_EUP = "3611025021"; // 세종 조치원읍 원리
const SEJONG_YEONGI_MYEON = "3611031021"; // 세종 연기면 연기리
const DALSEONG_GUN = "2771025021"; // 대구 달성군 화원읍 천내리
const YANGPYEONG_GUN = "4183025021"; // 경기 양평군 양평읍 양근리
const BUSAN_HAEUNDAE = "2635010100"; // 부산 해운대구 반송동
const YEONCHEON_GUN = "4180025021"; // 경기 연천군 연천읍 차탄리 (수도권 접경 인구감소지역)
const YANGGU_GUN = "5180025021"; // 강원 양구군 양구읍 상리 (수도권 밖 인구감소지역)

/** API가 만드는 주택 행과 같게 — `region`은 `deriveHouseRegionFromCode`로 파생한다(transfer-tax-api-houses.ts). */
function apiHouse(id: string, code: string, over: Partial<HouseInfo> = {}): HouseInfo {
  return makeHouse(id, { regionCode: code, region: deriveHouseRegionFromCode(code), ...over });
}

describe("M — 지역기준·가액기준 분류 (§167의3①1호)", () => {
  const cases: Array<[string, string, "REGION" | "VALUE"]> = [
    ["M1 서울 동", SEOUL_GANGNAM, "REGION"],
    ["M2 경기 시 동", NAMYANGJU_HOPYEONG, "REGION"],
    ["M3 경기 시 읍", NAMYANGJU_HWADO_EUP, "VALUE"],
    ["M4 경기 시 면", PAJU_WOLLONG_MYEON, "VALUE"],
    ["M5 세종 동", SEJONG_BANGOK, "REGION"],
    ["M6a 세종 읍", SEJONG_JOCHIWON_EUP, "VALUE"],
    ["M6b 세종 면", SEJONG_YEONGI_MYEON, "VALUE"],
    ["M7 광역시 군", DALSEONG_GUN, "VALUE"],
    ["M8 수도권 군", YANGPYEONG_GUN, "VALUE"],
    ["M9 광역시 자치구", BUSAN_HAEUNDAE, "REGION"],
    ["M10 5자리 경기 시(하위호환)", "41360", "REGION"],
  ];
  it.each(cases)("%s", (_label, code, expected) => {
    expect(classifyRegionCriteriaByCode(code)).toBe(expected);
  });

  it("M11·M12 읍 주택의 3억 경계 — 「초과하지 않는」", () => {
    const at = (price: number) =>
      resolveLowPriceLocalHouse(apiHouse("h", NAMYANGJU_HWADO_EUP, { officialPrice: price, transferOfficialPrice: price }), RULES);
    expect(at(300_000_000)).not.toBeNull();
    expect(at(300_000_001)).toBeNull();
  });
});

describe("E — 엔진 전체 (양도일 2026-07-01 · 유예 없음)", () => {
  function judge(houses: HouseInfo[], sellingHouseId: string) {
    return determineMultiHouseSurcharge(
      makeInput(houses, { sellingHouseId, transferDate: T }),
      RULES,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );
  }

  it("E1 서울 강남 양도 + 화도읍 2억 보유 → 주택 수 1 · 중과 없음", () => {
    const r = judge(
      [
        apiHouse("a", SEOUL_GANGNAM, { officialPrice: 1_500_000_000, acquisitionDate: new Date("2015-01-01") }),
        apiHouse("b", NAMYANGJU_HWADO_EUP, { officialPrice: 200_000_000, acquisitionDate: new Date("2016-01-01") }),
      ],
      "a",
    );
    expect(r.effectiveHouseCount).toBe(1);
    expect(r.surchargeApplicable).toBe(false);
  });

  it("E2 화도읍 2억 양도 + 서울 2채 → 양도 주택 자체가 1호 — 주택 수 2 · 중과 없음", () => {
    const r = judge(
      [
        apiHouse("a", NAMYANGJU_HWADO_EUP, { officialPrice: 200_000_000, acquisitionDate: new Date("2016-01-01") }),
        apiHouse("b", SEOUL_GANGNAM, { officialPrice: 1_500_000_000, acquisitionDate: new Date("2015-01-01") }),
        apiHouse("c", SEOUL_GANGNAM, { officialPrice: 900_000_000, acquisitionDate: new Date("2017-01-01") }),
      ],
      "a",
    );
    expect(r.effectiveHouseCount).toBe(2);
    expect(r.surchargeApplicable).toBe(false);
  });

  it("E3 서울 2채 + 조치원읍 2억 · 서울 양도 → 2주택(§167의10)으로 판정", () => {
    const r = judge(
      [
        apiHouse("a", SEOUL_GANGNAM, { officialPrice: 1_500_000_000, acquisitionDate: new Date("2015-01-01") }),
        apiHouse("b", SEOUL_GANGNAM, { officialPrice: 900_000_000, acquisitionDate: new Date("2017-01-01") }),
        apiHouse("c", SEJONG_JOCHIWON_EUP, { officialPrice: 200_000_000, acquisitionDate: new Date("2016-01-01") }),
      ],
      "a",
    );
    expect(r.effectiveHouseCount).toBe(2);
    expect(r.surchargeType).toBe("multi_house_2");
  });
});

describe("B — 「수도권」 판정은 법정동코드 시도로 (지역기준 여부를 대용하지 않는다)", () => {
  /** §167의3①12호 가목 — 취득가액 6억원(수도권 밖 3억원) 이하 소형 신축 */
  function smallNew(code: string) {
    return isSmallNewHouseSpecial(
      apiHouse("n", code, {
        acquisitionDate: new Date("2025-03-01"),
        completionDate: new Date("2025-01-01"),
        acquisitionPrice: 500_000_000,
        exclusiveArea: 59,
        isApartment: false,
      }),
      T,
    );
  }
  it("B1 12호 가목 화도읍(수도권) 취득가 5억 → 성립", () => expect(smallNew(NAMYANGJU_HWADO_EUP)).toBe(true));
  it("B2 12호 가목 양평군(수도권) 취득가 5억 → 성립", () => expect(smallNew(YANGPYEONG_GUN)).toBe(true));
  it("B3 12호 가목 부산(수도권 밖) 취득가 5억 → 불성립", () => expect(smallNew(BUSAN_HAEUNDAE)).toBe(false));

  /** §167의3①12호 다목 3) — 4억원(수도권 밖의 인구감소지역인 경우 9억원) */
  function secondHome(code: string) {
    const h = apiHouse("s", code, { acquisitionDate: new Date("2026-03-01"), officialPrice: 800_000_000, isApartment: false });
    const seoul = apiHouse("x", SEOUL_GANGNAM, { acquisitionDate: new Date("2015-01-01"), officialPrice: 1_000_000_000 });
    return resolvePopulationDeclineSecondHome(h, [seoul, h], [], T);
  }
  it("B4 12호 다목 연천군(수도권 접경) 기준시가 8억 → 한도 4억 초과 · 다목 대상 아님(null = 일반 산입)", () => {
    expect(secondHome(YEONCHEON_GUN)).toBeNull();
  });
  it("B5 12호 다목 양구군(수도권 밖) 기준시가 8억 → 한도 9억 · 성립", () => {
    const r = secondHome(YANGGU_GUN);
    expect(r?.popCap).toBe(900_000_000);
    expect(r?.qualifies).toBe(true);
  });

  /** §167의3①2호 가목 — 임대개시일 당시 6억원(수도권 밖 3억원) */
  function rentalA(code: string) {
    return isLongTermRentalHousingExempt(
      apiHouse("r", code, {
        isApartment: false,
        isLongTermRental: true,
        rentalType: "A",
        isRegisteredRental: true,
        rentalRegistrationDate: new Date("2015-03-01"),
        businessRegistrationDate: new Date("2015-03-01"),
        rentalStartDate: new Date("2015-03-01"),
        rentalEndDate: new Date("2026-06-30"),
        acquisitionDate: new Date("2015-01-01"),
        officialPrice: 500_000_000,
        rentalStartOfficialPrice: 500_000_000,
        rentIncreaseUnder5Pct: true,
      }),
      T,
    );
  }
  it("B6a 2호 가목 화도읍(수도권) 임대개시 5억 → 배제", () => expect(rentalA(NAMYANGJU_HWADO_EUP)).toBe(true));
  it("B6b 2호 가목 양평군(수도권) 임대개시 5억 → 배제", () => expect(rentalA(YANGPYEONG_GUN)).toBe(true));
  it("B6c 2호 가목 부산(수도권 밖) 임대개시 5억 → 배제 안 됨", () => expect(rentalA(BUSAN_HAEUNDAE)).toBe(false));
});

describe("P — 조합원입주권·분양권: 법정동코드가 있으면 코드로 분류 (§167의4②1호 · §167의11②)", () => {
  const START = new Date(RULES.presaleRightStartDate);
  function right(over: Partial<PresaleRight>): PresaleRight {
    return {
      id: "p",
      type: "presale_right",
      acquisitionDate: new Date("2022-01-01"),
      region: "capital",
      rightValue: 200_000_000,
      ...over,
    } as PresaleRight;
  }
  it("P1 화도읍 코드 + 「수도권」 선택 + 2억 → 불산입(코드 우선)", () => {
    expect(isPresaleRightCounted(right({ regionCode: NAMYANGJU_HWADO_EUP, regionCriteria: "REGION" }), START)).toBe(false);
  });
  it("P2 서울 코드 + 「그 외 지방」 선택 + 2억 → 산입(코드 우선)", () => {
    expect(
      isPresaleRightCounted(right({ regionCode: SEOUL_GANGNAM, region: "non_capital", regionCriteria: "VALUE" }), START),
    ).toBe(true);
  });
  it("P3 코드 없음 → 선택값을 따른다", () => {
    expect(isPresaleRightCounted(right({ region: "non_capital", regionCriteria: "VALUE" }), START)).toBe(false);
    expect(isPresaleRightCounted(right({ regionCriteria: "REGION" }), START)).toBe(true);
  });
});
