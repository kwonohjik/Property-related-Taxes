/**
 * G8-5 anchor 초안 — 합가 중첩 의제가 중과 주택 수 2로 배제될 때 근거는 §167의10①15호(주택 2개 세대)이지
 * 3주택 이상 조항 §167의3①13호가 아니다. 2021.2.17. 전 양도분은 13호가 존재하지 않았다.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes";
import { defaultRules, makeHouse, makeInput, mockRegulatedHistory, suspensionNone } from "../_helpers/multi-house-mock";

const run = (td: string, deemed: "marriage_merge_overlap" | "parental_care_merge_overlap", local3: boolean) => {
  const houses = [
    makeHouse("selling", { acquisitionDate: new Date("2015-01-01"), regionCode: "11680" }),
    makeHouse("h2", { acquisitionDate: new Date("2012-01-01"), regionCode: "11680" }),
    local3
      ? makeHouse("h3", { acquisitionDate: new Date("2019-06-01"), region: "non_capital", officialPrice: 50_000_000, regionCode: "47111" })
      : makeHouse("h3", { acquisitionDate: new Date("2019-06-01"), regionCode: "11680" }),
  ];
  return determineMultiHouseSurcharge(
    makeInput(houses, {
      transferDate: new Date(td),
      sellingHouseId: "selling",
      deemedOneHouseBy155: deemed,
      ...(deemed === "marriage_merge_overlap"
        ? { marriageMerge: { marriageDate: new Date("2019-01-01") } }
        : { parentalCareMerge: { mergeDate: new Date("2019-01-01") } }),
      sellingHouseMeetsOneHouseRequirements: true,
    }),
    defaultRules,
    mockRegulatedHistory,
    suspensionNone,
    true,
  );
};

describe("G8-5 중첩 × 중과 주택 수 2 인용", () => {
  it("2026 혼인 중첩 n=2 → §167의10①15호·§155⑤", () => {
    const r = run("2026-08-01", "marriage_merge_overlap", true);
    expect(r.effectiveHouseCount).toBe(2);
    expect(r.exclusionReasons[0].detail).toContain(MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS);
    expect(r.exclusionReasons[0].detail).not.toContain("§167의3①13호");
  });
  it("2026 동거봉양 중첩 n=2 → §167의10①15호·§155④", () => {
    const r = run("2026-08-01", "parental_care_merge_overlap", true);
    expect(r.exclusionReasons[0].detail).toContain(MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS);
    expect(r.exclusionReasons[0].detail).not.toContain("§167의3①13호");
  });
  it("2021-02-16 양도분은 당시 없던 §167의3①13호를 인용하지 않는다", () => {
    const r = run("2021-02-16", "parental_care_merge_overlap", true);
    for (const e of r.exclusionReasons) expect(e.detail).not.toContain("§167의3①13호");
  });
  it("2023.2.28. 전 n=2 중첩은 형제 합가 분기와 같은 구 5호·6호(개정 전) 상수를 인용한다", () => {
    const parental = run("2021-06-01", "parental_care_merge_overlap", true);
    expect(parental.exclusionReasons[0].detail).toContain(MULTI_HOUSE.PARENTAL_CARE_MERGE_2HOUSE_BASIS_OLD);
    const marriage = run("2021-06-01", "marriage_merge_overlap", true);
    expect(marriage.exclusionReasons[0].detail).toContain(MULTI_HOUSE.MARRIAGE_MERGE_2HOUSE_BASIS_OLD);
  });
  it("대조: n=3 중첩은 13호 유지", () => {
    const r = run("2026-08-01", "parental_care_merge_overlap", false);
    expect(r.effectiveHouseCount).toBe(3);
    expect(r.exclusionReasons[0].detail).toContain("§167의3①13호");
  });
});
