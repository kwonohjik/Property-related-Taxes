/**
 * 다주택 중과세 엔진 — 주택 수 산정 배제 + 일시적 2주택 + 조정지역 해제 (MH-01~MH-08) 테스트
 *
 * Mock 규칙·헬퍼는 ../_helpers/multi-house-mock 에서 import.
 */

import { describe, it, expect } from "vitest";
import { resolveMergeDeeming } from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import {
  countEffectiveHouses,
  isRegulatedAreaAtDate,
  determineMultiHouseSurcharge,
  isLongTermRentalHousingExempt,
  isSmallNewHouseSpecial,
  isTaxIncentiveRentalHousingExempt,
  classifyRegionCriteriaByCode,
  classifyPopulationDeclineArea,
  buildMultiHouseTaxSimulation,
  type HouseInfo,
  type PresaleRight,
  type MultiHouseSurchargeInput,
  type HouseCountExclusionRules,
  type RegulatedAreaHistory,
} from "@/lib/tax-engine/multi-house-surcharge";
import { isSurchargeExemptInherited } from "@/lib/tax-engine/multi-house-surcharge-count";
import { isSurchargeExemptRental } from "@/lib/tax-engine/multi-house-surcharge-count";
import type { SurchargeSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionActive,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

// ============================================================
// MH-01: 3주택 중 1채 비수도권 1억 이하 → 유효 주택 수 2
// ============================================================

describe("MH-01: 비수도권 1억 이하 주택 산정 제외", () => {
  it("3주택 중 비수도권 공시가 1억 이하 1채 → effectiveHouseCount=2", () => {
    const h1 = makeHouse("h1", { region: "capital", officialPrice: 500_000_000 });
    const h2 = makeHouse("h2", { region: "capital", officialPrice: 400_000_000 });
    const h3 = makeHouse("h3", {
      region: "non_capital",
      officialPrice: 90_000_000, // 1억 미만
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2, h3],
      new Date("2024-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].houseId).toBe("h3");
    expect(excluded[0].reason).toBe("low_price_non_capital");
  });

  it("비수도권 공시가 정확히 1억 이하 경계값 → 제외", () => {
    const h1 = makeHouse("h1", { region: "non_capital", officialPrice: 100_000_000 });
    const { count } = countEffectiveHouses([h1], new Date("2024-06-01"), [], defaultRules);
    expect(count).toBe(0); // 제외됨
  });

  it("비수도권 공시가 1억 + 1원 초과 → 포함", () => {
    const h1 = makeHouse("h1", { region: "non_capital", officialPrice: 100_000_001 });
    const { count } = countEffectiveHouses([h1], new Date("2024-06-01"), [], defaultRules);
    expect(count).toBe(1); // 포함
  });
});

// ============================================================
// MH-02: 상속주택 5년 이내 → **주택 수에 산입** · 중과 대상에서만 제외 (D16)
// ============================================================
//
// ⚠️ D16(2026-09-18): 종전 계약 「5년 이내 상속주택은 주택 수에서 제외」는 결함이었다.
//    §167의3① 본문 괄호가 주택 수 불산입으로 정한 것은 1호(현행 1·12호)뿐 — 7호(상속 5년)는
//    중과 **대상에서** 빠질 뿐 주택 수에는 산입된다. 구별력은 7호 술어와 2주택 §167의10①10호로 옮긴다.

const run2 = (houses: HouseInfo[], transferDate: Date) =>
  determineMultiHouseSurcharge(
    makeInput(houses, { sellingHouseId: "h1", transferDate }),
    defaultRules,
    mockRegulatedHistory,
    suspensionNone,
    true,
  );
const tenHo = (r: ReturnType<typeof run2>) =>
  r.exclusionReasons.some((e) => e.type === "only_general_two_house") && !r.surchargeApplicable;

describe("MH-02: 상속주택 5년 이내 — 산입 + 중과 대상 제외", () => {
  it("상속개시 4년 경과 → 주택 수 산입(2) · 7호 해당 → 2주택 §167의10①10호 배제", () => {
    const h1 = makeHouse("h1"); // 일반 주택
    const h2 = makeHouse("h2", {
      isInherited: true,
      inheritedDate: new Date("2020-01-01"), // 4년 전 상속
    });
    const td = new Date("2024-01-01");

    const { count, excluded } = countEffectiveHouses([h1, h2], td, [], defaultRules);
    expect(count).toBe(2);
    expect(excluded).toHaveLength(0);
    expect(isSurchargeExemptInherited(h2, td)).toBe(true);
    expect(tenHo(run2([h1, h2], td))).toBe(true);
  });

  it("상속개시 5년 초과 → 7호 불해당 → 2주택 중과", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isInherited: true,
      inheritedDate: new Date("2019-01-01"), // 5년 이상 경과
    });
    const td = new Date("2024-06-01");

    expect(isSurchargeExemptInherited(h2, td)).toBe(false);
    expect(tenHo(run2([h1, h2], td))).toBe(false);
  });
});

// ============================================================
// MH-03: 장기임대 등록주택 — 산입 + 중과 대상 제외 / 말소 시 해당 없음 (D16)
// ============================================================

// 🔴 2026-09-22 — 시료에 등록 완비(`isRegisteredRental`·사업자등록일)와 임대기간을 채웠다.
//    종전엔 `isLongTermRental` + 임대등록일만으로 통과했는데, 술어가 유형 미선택 입력의 요건을
//    전혀 보지 않았기 때문이다. 이름이 말하는 「장기임대 **등록**주택」 의도는 그대로다.
describe("MH-03: 장기임대 등록주택 (말소 시 해당 없음)", () => {
  it("임대 등록 유효 중 → 주택 수 산입(2) · 2호 해당 → §167의10①10호 배제", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isLongTermRental: true,
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2020-01-01"),
      businessRegistrationDate: new Date("2020-01-01"),
      rentalPeriodYears: 6,
      rentalCancelledDate: undefined, // 말소 없음
    });
    const td = new Date("2024-06-01");

    const { count, excluded } = countEffectiveHouses([h1, h2], td, [], defaultRules);
    expect(count).toBe(2);
    expect(excluded).toHaveLength(0);
    expect(isSurchargeExemptRental(h2, td)).toBe(true);
    expect(tenHo(run2([h1, h2], td))).toBe(true);
  });

  it("임대 등록 말소 후 → 2호 불해당 → 2주택 중과", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isLongTermRental: true,
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2020-01-01"),
      businessRegistrationDate: new Date("2020-01-01"),
      rentalPeriodYears: 6,
      rentalCancelledDate: new Date("2023-01-01"), // 양도일 이전 말소
    });
    const td = new Date("2024-06-01");

    expect(isSurchargeExemptRental(h2, td)).toBe(false);
    expect(tenHo(run2([h1, h2], td))).toBe(false);
  });
});

// ============================================================
// MH-04: 분양권 산정 시작일 경계값 (2021.1.1)
// ============================================================

describe("MH-04: 분양권 산정시작일 경계값", () => {
  it("2020.12.31 취득 분양권 → 주택 수 미포함", () => {
    const h1 = makeHouse("h1");
    const right: PresaleRight = {
      id: "r1",
      type: "presale_right",
      acquisitionDate: new Date("2020-12-31"),
      region: "capital",
    };

    const { count } = countEffectiveHouses([h1], new Date("2024-06-01"), [right], defaultRules);
    expect(count).toBe(1); // 분양권 미포함
  });

  it("2021.1.1 취득 분양권 → 주택 수 포함", () => {
    const h1 = makeHouse("h1");
    const right: PresaleRight = {
      id: "r1",
      type: "presale_right",
      acquisitionDate: new Date("2021-01-01"),
      region: "capital",
    };

    const { count } = countEffectiveHouses([h1], new Date("2024-06-01"), [right], defaultRules);
    expect(count).toBe(2); // 분양권 포함
  });
});

// ============================================================
// MH-05·06: 일시적 2주택 — §167의10①15호 1세대1주택 의제 배제
//
// ⚠️ 2026-07-31 재설계(계획서 F-2): **처분기한 판정은 이 엔진의 책임이 아니다.**
//    §155① 정본(`resolveTemporaryTwoHouseDeadlineYears` + `judgeTemporaryTwoHouseTiming`)이
//    산출한 의제 성립 여부를 `deemedOneHouseBy155`로 받는다. 종전에는 여기서 기한을 재계산해
//    비과세 정본과 어긋났다(「비과세 O / 중과배제 X」).
//    기한 규칙 자체는 `transfer-tax/temporary-two-house-surcharge.anchor.test.ts` T-A1이 고정한다.
// ============================================================

describe("MH-05: §155① 의제 성립 → 중과 배제 (15호 ① 요소)", () => {
  it("의제 성립 + §154① 충족 → 배제", () => {
    // 강남구(11680, 해제일 없음)를 사용해야 양도일 기준 조정지역 유지
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 종전주택 (강남구, 해제 없음)
    const h2 = makeHouse("h2", {
      acquisitionDate: new Date("2022-05-09"),
      regionCode: "11680",
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2023-05-08"),
      deemedOneHouseBy155: "temporary_two_house",
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("temporary_two_house");
  });

  it("의제 미성립(기한 초과 등) → 배제 없음. 유예 중이면 suspended", () => {
    // 강남구(11680, 해제일 없음) — 양도일 기준으로도 조정대상지역 유지
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", {
      acquisitionDate: new Date("2022-05-09"),
      regionCode: "11680",
    });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2023-05-10"),
      // deemedOneHouseBy155 미주입 = §155① 정본이 의제 불성립으로 판정한 상태
    });

    // 유예 활성 → 중과 미적용, isSurchargeSuspended=true
    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.exclusionReasons).toHaveLength(0); // 배제 사유 아님, 유예
  });
});

// ============================================================
// MH-06: 15호 ② 요소 — §154① 요건 미충족 시 배제 부적용
// ============================================================

describe("MH-06: §154① 미충족 → 의제 성립해도 배제 부적용 (15호 ② 요소)", () => {
  it("deemedOneHouseBy155 성립 + sellingHouseMeetsOneHouseRequirements=false → 중과 유지", () => {
    // 강남구(11680, 해제일 없음) — 양도일 2025.5.9에도 조정대상지역
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2", { acquisitionDate: new Date("2022-05-10") });

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2025-05-09"),
      deemedOneHouseBy155: "temporary_two_house",
      sellingHouseMeetsOneHouseRequirements: false,
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone, // 유예 없음으로 테스트
      true,
    );

    expect(result.exclusionReasons).toHaveLength(0);
    expect(result.surchargeApplicable).toBe(true);
    expect(result.surchargeType).toBe("multi_house_2");
  });
});

// ============================================================
// MH-07: 혼인합가 1세대1주택 의제(2주택) → 중과 배제 (§155⑤ 10년)
// ============================================================

/**
 * 혼인 합가 의제(§155⑤) — 중과 엔진은 재판정하지 않고 caller가 비과세 정본으로 선판정해 넘긴다
 * (영 §167의10①15호 ① 요소). 날짜 조건(10년·합가 전 취득)은 `resolveMergeDeeming`이 본다.
 */
const deemMarriage = (marriageDate: string, transferDate = "2024-06-01") =>
  resolveMergeDeeming({
    householdHousingCount: 2,
    marriageMerge: { marriageDate: new Date(marriageDate) },
    isFirstTransferredInMerge: true,
    acquisitionDate: new Date("2010-01-01"),
    transferDate: new Date(transferDate),
  });

describe("MH-07: 혼인합가 2주택 중과 배제 (§155⑤ 10년)", () => {
  it("혼인 3년 후 양도 → 배제", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
      marriageMerge: { marriageDate: new Date("2021-06-01") }, // 3년 전 혼인
      deemedOneHouseBy155: deemMarriage("2021-06-01"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("marriage_merge");
  });

  it("혼인 10년 초과 → 배제 안 됨 (중과 적용)", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
      marriageMerge: { marriageDate: new Date("2013-01-01") }, // 11년+ 전 혼인 (§155⑤ 10년 초과)
      deemedOneHouseBy155: deemMarriage("2013-01-01"), // → undefined (의제 불성립)
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.exclusionReasons).toHaveLength(0);
    expect(result.surchargeApplicable).toBe(true);
    expect(result.surchargeType).toBe("multi_house_2");
  });
});

// ============================================================
// MH-08: 양도일 기준 조정대상지역 해제 → 중과 미적용
// ============================================================

describe("MH-08: 조정대상지역 해제 후 양도 → 중과 미적용", () => {
  it("종로구 2023.1.5 해제 후 2024년 양도 → 비조정, 중과 없음", () => {
    const h1 = makeHouse("h1", { regionCode: "11110" }); // 종로구 (2023.1.5 해제)
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-01-01"), // 해제 후
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      false,
    );

    expect(result.isRegulatedAtTransfer).toBe(false);
    expect(result.surchargeApplicable).toBe(false);
    expect(result.surchargeType).toBe("none");
  });

  it("isRegulatedAreaAtDate: 종로구 2022년 12월 → true (지정 중)", () => {
    const isRegulated = isRegulatedAreaAtDate("11110", new Date("2022-12-31"), mockRegulatedHistory);
    expect(isRegulated).toBe(true);
  });

  it("isRegulatedAreaAtDate: 종로구 2023년 1월 5일 이후 → false (해제)", () => {
    const isRegulated = isRegulatedAreaAtDate("11110", new Date("2023-01-06"), mockRegulatedHistory);
    expect(isRegulated).toBe(false);
  });

  it("isRegulatedAreaAtDate: 강남구 2025년 → true (해제일 null)", () => {
    const isRegulated = isRegulatedAreaAtDate("11680", new Date("2025-01-01"), mockRegulatedHistory);
    expect(isRegulated).toBe(true);
  });

  it("isRegulatedAreaAtDate: 존재하지 않는 코드 → false", () => {
    const isRegulated = isRegulatedAreaAtDate("99999", new Date("2024-01-01"), mockRegulatedHistory);
    expect(isRegulated).toBe(false);
  });
});

// ============================================================
// MH-09: 중과 유예기간 → isSurchargeSuspended=true
// ============================================================

describe("MH-09: 중과 한시 유예 (2022.5.10~2026.5.9)", () => {
  it("양도일 2024.6.1 → 유예 적용, surchargeApplicable=false, isSurchargeSuspended=true", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-06-01"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeType).toBe("multi_house_2");
  });

  it("양도일 2026.5.9 (마지막 유예일) → 유예 적용", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-09"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.isSurchargeSuspended).toBe(true);
  });

  it("양도일 2026.5.10 (유예 종료 다음날) → 유예 해제, 중과 적용", () => {
    const h1 = makeHouse("h1", { regionCode: "11680" });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );

    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });
});

// ============================================================
// MH-10: 3주택+ 조정 + 유예 종료 → surchargeType="multi_house_3plus"
// ============================================================
