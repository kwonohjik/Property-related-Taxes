/**
 * 양도 주택 **자체**가 영 §167의3①12호 다·라목(인구감소지역·관심지역 세컨드홈)인 경우 — 중과 배제.
 *
 * 12호는 주택 수 불산입(본문 괄호)이면서 동시에 「다음 각 호의 어느 하나에 해당하지 않는 주택」의 한 호다.
 * 2주택은 §167의10①12호, 주택+권리는 §167의11①11호·§167의4③6호가 「제167조의3제1항제12호에 해당하는
 * 주택」을 그대로 받는다. 종전 엔진은 주택 수에서만 빼고, 양도 주택 자체의 배제 backstop은 가·나목
 * (`isSmallNewHouseSpecial`)만 봤다 — 세컨드홈을 팔면 그 주택을 뺀 나머지 주택 수로 중과했다(과다).
 *
 * 현재 조정대상지역 중 인구감소지역은 없어 실제 도달 경로는 없다(2026-10-20 명부 기준). 지정이 생기면
 * 바로 닿는 경로라 지금 닫는다 — 픽스처는 관심지역 강릉(51150)에 **가상의** 조정대상지역 지정을 얹는다.
 * (종전 픽스처는 강남 코드에 ④ 토글로 관심지역 소재를 얹었는데, 관심지역은 「수도권 밖」이 요건이라 소재지 사실로
 *  토글이 덮을 수 없다 — 2026-11 리뷰 D-50 (b).)
 */
import { describe, it, expect, vi } from "vitest";
// 가상 — 강릉시(51150)가 조정대상지역으로 지정됐다고 둔다. 계산은 regionCode가 있으면 정적 지정 데이터(`isRegulatedByBjdCode`)를 본다.
vi.mock("@/lib/tax-engine/data/regulated-areas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/data/regulated-areas")>();
  return {
    ...actual,
    isRegulatedByBjdCode: (code: string, date: string, inDistrict?: boolean) =>
      code.startsWith("51150")
        ? { isRegulated: true, confidence: "high" as const, basis: "가상 지정(테스트)" }
        : actual.isRegulatedByBjdCode(code, date, inDistrict),
  };
});
import { determineMultiHouseSurcharge, type HouseInfo } from "@/lib/tax-engine/multi-house-surcharge";
import { defaultRules, mockRegulatedHistory, suspensionNone, makeHouse, makeInput } from "../_helpers/multi-house-mock";

const GANGNEUNG = "51150"; // 강원 강릉시 — 인구감소관심지역
const SEOCHO = "11650";
const SONGPA = "11710";
const MAPO = "11440";
const TD = new Date("2026-11-10");
/** 가상 — 강릉시가 조정대상지역으로 지정됐다고 둔다(세컨드홈 양도가 중과 판정에 닿게). 위 모듈 mock과 같은 가정이다. */
const regulatedWithGangneung = {
  ...mockRegulatedHistory,
  regions: [...mockRegulatedHistory.regions, { code: GANGNEUNG, name: "강원 강릉시(가상 지정)", designations: [{ designatedDate: "2025-01-01", releasedDate: null }] }],
};

const secondHome = (overrides: Partial<HouseInfo> = {}) =>
  makeHouse("sh", {
    regionCode: GANGNEUNG,
    isPopulationDeclineArea: true,
    populationAreaType: "interest",
    acquisitionDate: new Date("2026-01-15"),
    officialPrice: 300_000_000,
    ...overrides,
  });

const others = (n: number) =>
  [SEOCHO, SONGPA, MAPO].slice(0, n).map((code, i) => makeHouse(`o${i}`, { regionCode: code, acquisitionDate: new Date(`201${i}-01-01`) }));

const run = (houses: HouseInfo[]) =>
  determineMultiHouseSurcharge(
    makeInput(houses, { sellingHouseId: "sh", transferDate: TD }),
    defaultRules,
    regulatedWithGangneung,
    suspensionNone,
    true,
  );

describe("양도 주택 자체가 12호 다·라목 세컨드홈 — 중과 배제", () => {
  it("다른 주택 2채(세컨드홈 빼면 2주택) → §167의10①12호로 배제", () => {
    const r = run([secondHome(), ...others(2)]);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons.map((e) => e.type)).toEqual(["population_decline_second_home"]);
    expect(r.exclusionReasons[0].detail).toContain("§167의10①12호");
  });

  it("다른 주택 3채(세컨드홈 빼면 3주택) → §167의3①12호 다·라목으로 배제", () => {
    const r = run([secondHome(), ...others(3)]);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons.map((e) => e.type)).toEqual(["population_decline_second_home"]);
    expect(r.exclusionReasons[0].detail).toContain("§167의3①12호 다·라목");
  });
});

describe("[대조] 다·라목 요건을 못 갖추면 그대로 중과", () => {
  it("가액 한도 초과(관심지역 4억 초과) → 중과", () => {
    const r = run([secondHome({ officialPrice: 500_000_000 }), ...others(2)]);
    expect(r.surchargeApplicable).toBe(true);
    expect(r.exclusionReasons.some((e) => e.type === "population_decline_second_home")).toBe(false);
  });

  it("2026.1.1. 전 취득 → 중과", () => {
    const r = run([secondHome({ acquisitionDate: new Date("2025-12-31") }), ...others(2)]);
    expect(r.surchargeApplicable).toBe(true);
  });

  it("취득 전 보유주택과 같은 시·군·구 → 중과 (다·라목 2호)", () => {
    const sameSgg = makeHouse("o9", { regionCode: GANGNEUNG, acquisitionDate: new Date("2015-01-01") });
    const r = run([secondHome(), sameSgg, ...others(1)]);
    expect(r.surchargeApplicable).toBe(true);
  });
});
