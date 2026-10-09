/**
 * D4 — 혼인·동거봉양 이중 합가로 3주택 (`resolveDoubleMergeDeeming` · 서면인터넷방문상담4팀-598 · 역순은 대칭 — 2026-10-09 사용자 결정).
 *
 * 판정 메뉴 route 결론은 해석례 평가셋(`E128-era`·`E128-current` match · `E128-era-reverse`·`E128-era-spouse2` 음성 짝)이
 * 고정한다. 여기서는 엔진 조건을 하나씩 뒤집는다.
 *
 * | # | 뒤집는 조건 | 기대 |
 * |---|---|---|
 * | M-0 | (없음) 혼인 2019 → 동거봉양 2020 · 혼인 전 보유 주택을 혼인일부터 10년 안에 양도 | 성립 |
 * | M-1 | 역순(동거봉양 2018 → 혼인 2019) · 구성도 역순(합친 가족 = 먼저 합친 쪽 · 배우자 = 나중에 합친 쪽) | 성립 |
 * | M-1d | 역순 — 기한은 먼저 합친 동거봉양 합가일부터(혼인일부터면 기한 안) | 불성립 |
 * | M-1a | 역순 — 양도 주택을 동거봉양 합가 후(혼인 전) 취득 | 불성립 |
 * | M-2 | 양도 주택을 혼인 후 취득 | 불성립 |
 * | M-3 | 혼인일부터 기한 경과 | 불성립 |
 * | M-4 | 상속주택 제외가 겹침(세 특례) | 불성립 |
 * | M-5 | 합친 가족 쪽 주택을 동거봉양 합가 후 취득 | 불성립(acquired_after_merge) |
 * | M-6 | 배우자 쪽 주택을 혼인 후(동거봉양 전) 취득 | 불성립(composition_mismatch) |
 * | M-7 | 소유 쪽 미입력 | 불성립(origin_missing · 확인 필요) |
 * | M-1u | 역순 — 불성립 사유 | 「순서만 인정」 문구가 없다 |
 */
import { describe, it, expect } from "vitest";
import { resolveDoubleMergeDeeming } from "@/lib/tax-engine/one-house/merge-deeming";
import { resolveDoubleMergeComposition } from "@/lib/tax-engine/one-house/merge-composition";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import { collectUnmetExceptions } from "@/lib/tax-engine/one-house/unmet-exceptions";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const h = (id: string, acq: string, extra: Partial<HouseInfo> = {}): HouseInfo => ({
  id,
  acquisitionDate: D(acq),
  officialPrice: 300_000_000,
  region: "capital",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...extra,
});

// E128-current
const houses = (spouseAcq = "2014-02-01", parentsAcq = "2005-01-01", parentsOrigin: HouseInfo["mergeOrigin"] = "second_merge_side") => [
  h("selling", "2015-04-01"),
  h("spouse", spouseAcq, { mergeOrigin: "counterpart_side" }),
  h("parents", parentsAcq, { mergeOrigin: parentsOrigin }),
];
const input = (over: Record<string, unknown> = {}) =>
  ({
    householdHousingCount: 3,
    marriageMerge: { marriageDate: D("2019-03-01") },
    parentalCareMerge: { mergeDate: D("2020-01-15") },
    isFirstTransferredInMerge: true,
    acquisitionDate: D("2015-04-01"),
    transferDate: D("2026-04-10"),
    houses: houses(),
    sellingHouseId: "selling",
    knownHouseExclusionHouseIds: [],
    ...over,
  }) as Parameters<typeof resolveDoubleMergeDeeming>[0];

describe("M 이중 합가 의제", () => {
  it("M-0 성립", () => expect(resolveDoubleMergeDeeming(input())).toBe(true));
  /** 역순 구성 — 합친 가족(부모)이 먼저 합친 쪽(`counterpart_side`), 배우자가 나중에 합친 쪽(`second_merge_side`). */
  const reverseHouses = () => [
    h("selling", "2015-04-01"),
    h("spouse", "2014-02-01", { mergeOrigin: "second_merge_side" }),
    h("parents", "2005-01-01", { mergeOrigin: "counterpart_side" }),
  ];
  const reverse = (over: Record<string, unknown> = {}) =>
    input({ parentalCareMerge: { mergeDate: D("2018-06-01") }, houses: reverseHouses(), ...over });
  it("M-1 역순도 성립", () => expect(resolveDoubleMergeDeeming(reverse())).toBe(true));
  it("M-1d 역순 기한은 먼저 합친 동거봉양 합가일부터 — 2015 합가 + 10년 경과 · 혼인(2019)부터면 기한 안", () =>
    expect(
      resolveDoubleMergeDeeming(
        reverse({ acquisitionDate: D("2014-01-01"), parentalCareMerge: { mergeDate: D("2015-01-01") }, houses: [h("selling", "2014-01-01"), ...reverseHouses().slice(1)] }),
      ),
    ).toBe(false));
  it("M-1d 짝 — 같은 일자에서 양도를 기한 안(2024-12-01)으로 당기면 성립", () =>
    expect(
      resolveDoubleMergeDeeming(
        reverse({
          acquisitionDate: D("2014-01-01"),
          transferDate: D("2024-12-01"),
          parentalCareMerge: { mergeDate: D("2015-01-01") },
          houses: [h("selling", "2014-01-01"), ...reverseHouses().slice(1)],
        }),
      ),
    ).toBe(true));
  it("M-1y 역순 기한 연수는 동거봉양 기한 — 2022 양도는 동거봉양 10년 · 혼인 5년(2024-11-12 전)이라 6년 5개월은 동거봉양으로만 성립", () =>
    expect(
      resolveDoubleMergeDeeming(
        reverse({
          acquisitionDate: D("2014-01-01"),
          transferDate: D("2022-06-01"),
          parentalCareMerge: { mergeDate: D("2016-01-01") },
          marriageMerge: { marriageDate: D("2017-03-01") },
          houses: [h("selling", "2014-01-01"), ...reverseHouses().slice(1)],
        }),
      ),
    ).toBe(true));
  it("M-1a 역순 — 양도 주택을 동거봉양 합가(2018-06) 후 · 혼인(2019-03) 전 취득", () =>
    expect(resolveDoubleMergeDeeming(reverse({ acquisitionDate: D("2018-09-01") }))).toBe(false));
  it("M-2 양도 주택을 혼인 후 취득", () =>
    expect(resolveDoubleMergeDeeming(input({ acquisitionDate: D("2019-05-01") }))).toBe(false));
  // 만료일 2029-03-01은 삼일절이라 공휴일 이월로 다음 날까지 기한이다 — 확실히 넘긴 날로 둔다.
  it("M-3 혼인일부터 기한 경과", () =>
    expect(resolveDoubleMergeDeeming(input({ transferDate: D("2029-06-01") }))).toBe(false));
  it("M-4 상속주택 제외가 겹침", () =>
    expect(resolveDoubleMergeDeeming(input({ inheritedHouseExclusionCount: 1 }))).toBe(false));
});

describe("구성 판정", () => {
  const comp = (hs: HouseInfo[]) =>
    resolveDoubleMergeComposition({
      householdHousingCount: 3,
      houses: hs,
      sellingHouseId: "selling",
      firstMergeDate: D("2019-03-01"),
      secondMergeDate: D("2020-01-15"),
      knownHouseExclusionHouseIds: [],
    });
  it("M-0 holds", () => expect(comp(houses()).status).toBe("holds"));
  it("M-5 합친 가족 쪽을 합가 후 취득", () =>
    expect(comp(houses(undefined, "2021-01-01"))).toMatchObject({ status: "fails", reason: "acquired_after_merge" }));
  it("M-6 배우자 쪽을 혼인 후 취득", () =>
    expect(comp(houses("2019-06-01"))).toMatchObject({ status: "fails", reason: "composition_mismatch" }));
  it("M-7 소유 쪽 미입력", () =>
    expect(comp(houses().map((x) => (x.id === "parents" ? { ...x, mergeOrigin: undefined } : x)))).toMatchObject({
      status: "fails",
      reason: "origin_missing",
    }));
});

describe("불성립 사유 — 역순도 같은 특례", () => {
  const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules as OneHouseSpecialRulesData;
  const reasons = (parentalCareMergeDate: string) =>
    collectUnmetExceptions(
      baseTransferInput({
        propertyType: "housing",
        isOneHousehold: true,
        ...input({ parentalCareMerge: { mergeDate: D(parentalCareMergeDate) } }),
      }),
      rules,
    )
      .flatMap((u) => u.reasons)
      .join(" | ");
  it("M-1au 역순 — 양도 주택을 동거봉양 합가(먼저 합친 날) 후 취득하면 그 날을 기준으로 안내", () => {
    const r = collectUnmetExceptions(
      baseTransferInput({
        propertyType: "housing",
        isOneHousehold: true,
        ...input({ parentalCareMerge: { mergeDate: D("2018-06-01") }, acquisitionDate: D("2018-09-01") }),
      }),
      rules,
    )
      .flatMap((u) => u.reasons)
      .join(" | ");
    expect(r).toContain("합친 날(2018-06-01) 이후인 2018-09-01");
  });
  it("M-1u 역순이어도 「순서만 인정」 사유는 없다", () => {
    expect(reasons("2018-06-01")).not.toContain("순서만 인정");
    expect(reasons("2020-01-15")).not.toContain("순서만 인정");
  });
});
