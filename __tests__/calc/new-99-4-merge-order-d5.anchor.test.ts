/**
 * D5 — 조특법 §99의4① 「그 농어촌주택등 취득 전에 보유하던 다른 주택(일반주택)」 순서를 **합가 상대방 세대** 기준으로 본다
 * (`new994GeneralHouseAcquisitionDate` · 기획재정부 재산세제과-795).
 *
 * 판정 메뉴 route 결론은 해석례 평가셋(`E129-era`·`E129-current` match · `E129-era-noprior` 음성 짝)이 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | H-1 | 엔진 helper | 상대방 쪽 농어촌주택 → 상대방 쪽 합가 전 다른 주택 중 가장 이른 취득일 |
 * | H-2 | 엔진 helper | 합가 없음 · 양도자 쪽 · 상대방 쪽에 다른 주택 없음 · 합가 후 취득만 있음 → 양도 주택 취득일(종전) |
 * | C-1 | 클라이언트 ⑤ | 판정 메뉴 머리말의 제외 행 집합(`eligibleCountExcludedHouseIds`)이 같은 기준으로 그 행을 뺀다 · 음성 짝 |
 */
import { describe, it, expect } from "vitest";
import { new994GeneralHouseAcquisitionDate } from "@/lib/tax-engine/transfer-reductions/new-99-4";
import { eligibleCountExcludedHouseIds } from "@/lib/calc/house-count-exclusion-rows";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";

const D = (s: string) => new Date(s);
const SELLING = D("2007-05-15");
const MERGE = D("2010-06-15");

describe("H 엔진 helper", () => {
  const houses = [
    { id: "f-seoul", acquisitionDate: D("2001-12-15"), mergeOrigin: "counterpart_side" as const },
    { id: "f-rural", acquisitionDate: D("2003-11-15"), mergeOrigin: "counterpart_side" as const },
  ];
  it("H-1 상대방 쪽 농어촌주택 → 상대방 쪽 다른 주택의 취득일", () => {
    expect(new994GeneralHouseAcquisitionDate("f-rural", { houses, mergeDate: MERGE }, SELLING)).toEqual(D("2001-12-15"));
  });
  it("H-2 그 밖에는 양도 주택 취득일(종전 그대로)", () => {
    expect(new994GeneralHouseAcquisitionDate("f-rural", undefined, SELLING)).toEqual(SELLING);
    expect(new994GeneralHouseAcquisitionDate(undefined, { houses, mergeDate: MERGE }, SELLING)).toEqual(SELLING);
    const sellerSide = houses.map((h) => (h.id === "f-rural" ? { ...h, mergeOrigin: "seller_side" as const } : h));
    expect(new994GeneralHouseAcquisitionDate("f-rural", { houses: sellerSide, mergeDate: MERGE }, SELLING)).toEqual(SELLING);
    expect(new994GeneralHouseAcquisitionDate("f-rural", { houses: [houses[1]], mergeDate: MERGE }, SELLING)).toEqual(SELLING);
    const afterMerge = [{ ...houses[0], acquisitionDate: D("2011-01-01") }, houses[1]];
    expect(new994GeneralHouseAcquisitionDate("f-rural", { houses: afterMerge, mergeDate: MERGE }, SELLING)).toEqual(SELLING);
  });
});

const RURAL: RowCountExclusionReduction = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "",
  ruralHouseStdPrice: "100000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};
const row = (id: string, acquisitionDate: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id,
    region: "capital",
    acquisitionDate,
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    mergeOrigin: "counterpart_side",
    ...over,
  }) as HouseEntry;

// E129-era
function form(fatherSeoulAcq: string) {
  const f = createInitialOneHouseJudgmentForm();
  f.transferDate = "2010-12-15";
  f.parentalCareMergeDate = "2010-06-15";
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2007-05-15" });
  f.houses = [
    row("f-seoul", fatherSeoulAcq),
    row("f-rural", "2003-11-15", { region: "non_capital", countExclusion: { kind: "reduction", reduction: RURAL } }),
  ];
  return f;
}

describe("C-1 클라이언트 제외 행 집합", () => {
  it("직계존속 주택이 농어촌주택보다 먼저 → f-rural 제외 / 나중이면 제외 안 함(음성 짝)", () => {
    expect([...eligibleCountExcludedHouseIds(form("2001-12-15"))]).toEqual(["f-rural"]);
    expect([...eligibleCountExcludedHouseIds(form("2004-05-15"))]).toEqual([]);
  });
});
