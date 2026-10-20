/**
 * 양도 주택 **자체**가 영 §167의3①1호(수도권·광역시·특별자치시 밖 지방, 양도 당시 기준시가 3억 이하)인 경우 — 중과 배제.
 *
 * 1호는 주택 수 불산입(①본문 괄호)이면서 동시에 「다음 각 호의 어느 하나에 해당하지 않는 주택」의 한 호다.
 * 2주택 §167의10①1호, 주택+권리 §167의11①3호·§167의4③1호(각 ② 인용)도 같다. 종전 엔진은 주택 수에서만
 * 빼서 양도 주택을 뺀 나머지 주택 수로 그 주택을 중과했다(과다 — 청주 2억 + 서울 2채 → 2주택 중과).
 *
 * 규칙은 운영 시드(`HOUSE_COUNT_EXCLUSION_RULES` — 3억)를 쓴다. 공용 mock `defaultRules`는 non_capital 1억이다.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge, type HouseInfo, type PresaleRight } from "@/lib/tax-engine/multi-house-surcharge";
import { HOUSE_COUNT_EXCLUSION_RULES } from "@/lib/tax-engine/data/transfer-rate-seed";
import { mockRegulatedHistory, suspensionNone, makeHouse, makeInput } from "../_helpers/multi-house-mock";

const RULES = HOUSE_COUNT_EXCLUSION_RULES;
const CHEONGJU = "43111"; // 충북 청주시 상당구 — 조정대상지역 2020.6.19.~2022.9.25.
const DAEJEON = "30110"; // 대전광역시 동구 — 광역시(REGION), 같은 기간 조정대상지역
const TD = new Date("2021-06-01");

const selling = (overrides: Partial<HouseInfo> = {}) =>
  makeHouse("s", { regionCode: CHEONGJU, acquisitionDate: new Date("2015-01-01"), officialPrice: 200_000_000, ...overrides });

const seoul = (n: number) =>
  ["11680", "11650", "11710"].slice(0, n).map((code, i) =>
    makeHouse(`o${i}`, { regionCode: code, acquisitionDate: new Date("2012-01-01"), officialPrice: 800_000_000 }),
  );

const right: PresaleRight = {
  id: "r1",
  type: "presale_right",
  acquisitionDate: new Date("2021-03-01"),
  region: "capital",
  regionCriteria: "REGION",
};

const run = (houses: HouseInfo[], presaleRights: PresaleRight[] = []) =>
  determineMultiHouseSurcharge(
    makeInput(houses, { sellingHouseId: "s", transferDate: TD, presaleRights }),
    RULES,
    mockRegulatedHistory,
    suspensionNone,
    true,
  );

describe("양도 주택 자체가 1호(지방 3억 이하) — 중과 배제", () => {
  it("다른 주택 2채(양도 주택 빼면 2주택) → §167의10①1호로 배제", () => {
    const r = run([selling(), ...seoul(2)]);
    expect(r.isRegulatedAtTransfer).toBe(true);
    expect(r.effectiveHouseCount).toBe(2);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons.map((e) => e.type)).toEqual(["low_price_local_house"]);
    expect(r.exclusionReasons[0].detail).toContain("§167의10①1호");
  });

  it("다른 주택 3채(양도 주택 빼면 3주택) → §167의3①1호로 배제", () => {
    const r = run([selling(), ...seoul(3)]);
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons[0].detail).toContain("§167의3①1호");
  });

  it("다른 주택 1채 + 분양권 1개(주택·권리 각 1) → §167의11①3호로 배제", () => {
    const r = run([selling(), ...seoul(1)], [right]);
    expect(r.effectiveHouseCount).toBe(2);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons[0].detail).toContain("§167의11①3호");
  });
});

describe("[대조] 1호가 아니면 그대로 중과", () => {
  it("양도 당시 기준시가 3억 초과 → 3주택 이상 중과", () => {
    const r = run([selling({ officialPrice: 350_000_000 }), ...seoul(2)]);
    expect(r.surchargeApplicable).toBe(true);
    expect(r.surchargeType).toBe("multi_house_3plus");
  });

  it("광역시(대전) 소재 3억 이하 → 1호 아님, 3주택 이상 중과", () => {
    const r = run([selling({ regionCode: DAEJEON }), ...seoul(2)]);
    expect(r.surchargeApplicable).toBe(true);
    expect(r.exclusionReasons.some((e) => e.type === "low_price_local_house")).toBe(false);
  });
});
