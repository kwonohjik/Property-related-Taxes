/**
 * 인구감소지역 세컨드홈 "동일 시·군·구" 요건 (소령 §167의3①12 다·라목 2호).
 *
 * countEffectiveHouses가 가액 한도(다목3·라목3)에 더해 "해당 주택 취득 전에 보유한 주택과
 * 동일한 시·군·구에 소재하는 주택이 아닐 것"(다목2·라목2)을 검증. 동일 시·군·구 보유주택이
 * 있으면 특례 미적용(산입). regionCode 미제공 시 미검증(특례 유지) + 경고.
 */

import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

// 강원특별자치도 고성군(51820) = 인구감소지역(법정동 정확 코드). 앞 5자리 동일 = 같은 시·군·구.
const DECLINE_SGG = "5182011111"; // 인구감소지역 세컨드홈 후보
const DECLINE_SGG_OTHER = "5182022222"; // 같은 시·군·구(다른 법정동)
const CAPITAL_OTHER = "1168011111"; // 서울 강남(다른 시·군·구)

describe("§167의3①12 다·라목 2호 — 취득 전 보유주택 동일 시군구", () => {
  it("C1: 인구감소 세컨드홈 + 취득 전 '동일 시군구' 보유주택 → 산입(특례 미적용)", () => {
    const second = makeHouse("h2", {
      regionCode: DECLINE_SGG,
      region: "non_capital",
      populationAreaType: "decline",
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
      officialPrice: 300_000_000, // 9억 한도 이하
    });
    const prior = makeHouse("h1", {
      regionCode: DECLINE_SGG_OTHER, // 같은 시·군·구
      region: "non_capital",
      acquisitionDate: new Date("2024-01-01"), // 후보 취득 전 보유
    });
    const input = makeInput([prior, second], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-06-01"),
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2);
  });

  it("C2: 인구감소 세컨드홈 + '다른 시군구' 보유주택 → 배제(특례 적용)", () => {
    const second = makeHouse("h2", {
      regionCode: DECLINE_SGG,
      region: "non_capital",
      populationAreaType: "decline",
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
    });
    const prior = makeHouse("h1", {
      regionCode: CAPITAL_OTHER,
      region: "capital",
      acquisitionDate: new Date("2024-01-01"),
    });
    const input = makeInput([prior, second], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-06-01"),
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("population_decline_second_home");
    expect(r.effectiveHouseCount).toBe(1);
  });

  it("C3: 동일 시군구지만 후보 '취득 후' 취득 주택 → 배제(특례 적용, '취득 전' 아님)", () => {
    const second = makeHouse("h2", {
      regionCode: DECLINE_SGG,
      region: "non_capital",
      populationAreaType: "decline",
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
    });
    const later = makeHouse("h1", {
      regionCode: DECLINE_SGG_OTHER, // 같은 시·군·구
      region: "non_capital",
      acquisitionDate: new Date("2026-06-01"), // 후보 취득 후
    });
    const input = makeInput([later, second], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-09-01"),
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("population_decline_second_home");
    expect(r.effectiveHouseCount).toBe(1);
  });

  it("C4: boolean override(regionCode 無) → 특례 유지(배제) + 미검증 경고", () => {
    const second = makeHouse("h2", {
      isPopulationDeclineArea: true, // regionCode 없이 boolean 직접 지정
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
    });
    const input = makeInput([makeHouse("h1", { regionCode: CAPITAL_OTHER }), second], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-06-01"),
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("population_decline_second_home");
    expect(r.warnings.some((w) => w.includes("h2") && w.includes("검증하지 못"))).toBe(true);
  });

  it("C5: 후보 regionCode 有 + 비교주택 regionCode 無 → 배제(다른 시군구 간주)", () => {
    const second = makeHouse("h2", {
      regionCode: DECLINE_SGG,
      region: "non_capital",
      populationAreaType: "decline",
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
    });
    const prior = makeHouse("h1", { regionCode: undefined, acquisitionDate: new Date("2024-01-01") });
    const input = makeInput([prior, second], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-06-01"),
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("population_decline_second_home");
  });

  it("C6: 가액 한도 초과 → 산입 (시군구 무관, 기존 동작)", () => {
    const second = makeHouse("h2", {
      regionCode: DECLINE_SGG,
      region: "non_capital",
      populationAreaType: "decline",
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
      officialPrice: 1_000_000_000, // 9억 초과
    });
    const input = makeInput([makeHouse("h1", { regionCode: CAPITAL_OTHER }), second], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-06-01"),
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2);
  });

  it("C7: 라목(관심지역 4억↓) + 취득 전 동일 시군구 → 산입(특례 미적용)", () => {
    const second = makeHouse("h2", {
      regionCode: DECLINE_SGG,
      region: "non_capital",
      populationAreaType: "interest", // 라목 → 4억 한도
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
      officialPrice: 300_000_000, // 4억 이하
    });
    const prior = makeHouse("h1", {
      regionCode: DECLINE_SGG_OTHER,
      region: "non_capital",
      acquisitionDate: new Date("2024-01-01"),
    });
    const input = makeInput([prior, second], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-06-01"),
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2);
  });

  it("C8: 동일 시군구 보유주택이 산정제외(임대주택)여도 비교대상 → 산입", () => {
    const selling = makeHouse("h0", { regionCode: CAPITAL_OTHER, region: "capital" });
    const rental = makeHouse("h1", {
      regionCode: DECLINE_SGG_OTHER, // 동일 시군구
      region: "non_capital",
      isLongTermRental: true, // 임대주택 → 자체는 산정제외
      acquisitionDate: new Date("2024-01-01"), // 후보 취득 전
    });
    const second = makeHouse("h2", {
      regionCode: DECLINE_SGG,
      region: "non_capital",
      populationAreaType: "decline",
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
    });
    const input = makeInput([selling, rental, second], {
      sellingHouseId: "h0",
      transferDate: new Date("2026-06-01"),
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h1")?.reason).toBe("long_term_rental");
    // h2: 임대주택 h1과 동일 시군구(취득 전 보유) → 특례 미적용 → 산입
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBeUndefined();
    expect(r.effectiveHouseCount).toBe(2); // h0 + h2 (h1 임대 배제)
  });
});

describe("§167의3①12 다·라목 2호 괄호 — 취득 전 보유 입주권/분양권 동일 시군구", () => {
  it("C9: 인구감소 세컨드홈 + 취득 전 '동일 시군구' 분양권 보유 → 산입(특례 미적용)", () => {
    const second = makeHouse("h2", {
      regionCode: DECLINE_SGG,
      region: "non_capital",
      populationAreaType: "decline",
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
    });
    const input = makeInput([makeHouse("h1", { regionCode: CAPITAL_OTHER }), second], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-06-01"),
      presaleRights: [
        {
          id: "p1",
          type: "presale_right",
          acquisitionDate: new Date("2024-01-01"), // 후보 취득 전 보유
          region: "non_capital",
          regionCode: DECLINE_SGG_OTHER, // 공급주택 동일 시·군·구
        },
      ],
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBeUndefined();
  });

  it("C10: 동일 시군구 분양권이지만 후보 '취득 후' 취득 → 배제(특례 적용)", () => {
    const second = makeHouse("h2", {
      regionCode: DECLINE_SGG,
      region: "non_capital",
      populationAreaType: "decline",
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
    });
    const input = makeInput([makeHouse("h1", { regionCode: CAPITAL_OTHER }), second], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-09-01"),
      presaleRights: [
        {
          id: "p1",
          type: "redevelopment_right",
          acquisitionDate: new Date("2026-06-01"), // 후보 취득 후
          region: "non_capital",
          regionCode: DECLINE_SGG_OTHER,
        },
      ],
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("population_decline_second_home");
  });

  it("C11: 분양권 소재지(regionCode) 미제공 → 비교 제외 → 배제(특례 적용)", () => {
    const second = makeHouse("h2", {
      regionCode: DECLINE_SGG,
      region: "non_capital",
      populationAreaType: "decline",
      isSecondHomeRegistered: true,
      acquisitionDate: new Date("2026-03-01"),
    });
    const input = makeInput([makeHouse("h1", { regionCode: CAPITAL_OTHER }), second], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-06-01"),
      presaleRights: [
        {
          id: "p1",
          type: "presale_right",
          acquisitionDate: new Date("2024-01-01"),
          region: "non_capital",
          // regionCode 미제공
        },
      ],
    });
    const r = determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);
    expect(r.excludedHouses.find((e) => e.houseId === "h2")?.reason).toBe("population_decline_second_home");
  });
});
