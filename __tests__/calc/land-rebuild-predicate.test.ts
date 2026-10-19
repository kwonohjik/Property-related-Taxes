/**
 * 구주택 멸실·신축 통산 공통 술어(`lib/calc/transfer-land-rebuild.ts`) — ⑤·④·⑧이 읽는 단일 소스.
 */
import { describe, it, expect } from "vitest";
import { landRebuildApplies } from "@/lib/tax-engine/transfer-land-rebuild-rate";
import { landRebuildApplicable, landRebuildHost, effectiveLandRebuild, landRebuildFactsOfAsset, buildLandRebuildPayload } from "@/lib/calc/transfer-land-rebuild";
import { rebuildAsset, purchaseRebuildAsset } from "./_helpers/land-rebuild-form";

describe("landRebuildApplicable — 호스트 술어", () => {
  it("기준(주택 · 신축 · 취득일 분리 · 토지 원인 유효 · 소유자 같음)은 참", () => {
    expect(landRebuildApplicable(rebuildAsset())).toBe(true);
  });
  it.each([
    ["겸용주택", { isMixedUseHouse: true }],
    ["주택 아님", { assetKind: "building" }],
    ["취득원인 상속(건물)", { acquisitionCause: "inheritance" }],
    ["취득원인 이월과세(건물)", { acquisitionCause: "carryover_gift" }],
    ["취득일 분리 OFF", { hasSeperateLandAcquisitionDate: false }],
    ["소유자 분리", { selfOwns: "land_only" }],
    ["부담부증여", { transferType: "burdened_gift" }],
    ["토지 원인 값 없음", { landAcquisitionCause: "" }],
    ["호스트 태그가 지금 취득원인과 다름(매매에서 켠 잔재)", { landCauseHost: "purchase" }],
  ])("거짓 — %s", (_n, patch) => {
    expect(landRebuildApplicable(rebuildAsset(patch))).toBe(false);
  });
  it("함께 양도 자산(isNonPrimary)은 거짓", () => {
    expect(landRebuildApplicable(rebuildAsset(), { isNonPrimary: true })).toBe(false);
  });
});

describe("landRebuildHost — 매매 호스트 (취득원인 매매 + 취득일 다름 + 토지 overlay 없음)", () => {
  it("신축 호스트는 \"newConstruction\", 매매 호스트는 \"purchase\"", () => {
    expect(landRebuildHost(rebuildAsset())).toBe("newConstruction");
    expect(landRebuildHost(purchaseRebuildAsset())).toBe("purchase");
    expect(landRebuildApplicable(purchaseRebuildAsset())).toBe(true);
  });
  it.each([
    ["취득일 분리 OFF", { hasSeperateLandAcquisitionDate: false }],
    ["토지 상속 overlay 켬(건물은 매수 — 신축 아님)", { landAcquisitionCause: "inheritance", landCauseHost: "purchase" }],
    ["토지 증여 overlay 켬", { landAcquisitionCause: "gift", landCauseHost: "purchase" }],
    ["D2(건물 상속 + 토지 매매) — 건물 원인이 매매가 아니다", { acquisitionCause: "inheritance", landAcquisitionCause: "purchase", landCauseHost: "inheritance" }],
    ["D2(건물 증여 + 토지 매매)", { acquisitionCause: "gift", landAcquisitionCause: "purchase", landCauseHost: "gift" }],
    ["소유자 분리", { selfOwns: "building_only" }],
    ["부담부증여", { transferType: "burdened_gift" }],
    ["겸용주택", { isMixedUseHouse: true }],
    ["주택 아님(건물)", { assetKind: "building" }],
    ["취득원인 신축인데 토지 원인 값 없음", { acquisitionCause: "newConstruction" }],
  ])("거짓 — %s", (_n, patch) => {
    expect(landRebuildApplicable(purchaseRebuildAsset(patch))).toBe(false);
  });
  it("함께 양도 자산(isNonPrimary)은 매매 호스트도 거짓", () => {
    expect(landRebuildApplicable(purchaseRebuildAsset(), { isNonPrimary: true })).toBe(false);
  });
  it("신축 호스트에서 켠 overlay 잔재(호스트 태그가 신축)는 매매로 전환하면 overlay로 읽지 않는다 — 매매 호스트가 열리고 ④·⑧이 같은 값을 읽는다", () => {
    const a = rebuildAsset({ acquisitionCause: "purchase" });
    expect(landRebuildHost(a)).toBe("purchase");
    expect(buildLandRebuildPayload(a).landRebuildPriorHouse).toBeTruthy();
    expect(landRebuildFactsOfAsset(a).landAcquisitionCause).toBeUndefined();
  });
  it("매매 호스트 ④ payload · ⑧ 사실 — 건물 원인 purchase, 토지 취득일 = ④가 보내는 값", () => {
    const a = purchaseRebuildAsset();
    expect(buildLandRebuildPayload(a).landRebuildPriorHouse).toEqual({ startMode: "since_land", demolitionDate: "2023-05-31", footprintUnchanged: true });
    const f = landRebuildFactsOfAsset(a);
    expect(f).toMatchObject({ buildingAcquisitionCause: "purchase", landAcquisitionDate: "2022-01-01", hasLandAcquisitionDate: true });
    expect(f.landAcquisitionCause).toBeUndefined();
  });
});

describe("effectiveLandRebuild · ④ payload · ⑧ 사실 — 같은 값을 읽는다", () => {
  it("토글 OFF면 undefined — 키 없음", () => {
    const a = rebuildAsset({ landRebuildEnabled: false });
    expect(effectiveLandRebuild(a)).toBeUndefined();
    expect(buildLandRebuildPayload(a)).toEqual({});
    expect(landRebuildFactsOfAsset(a).rebuild).toBeUndefined();
  });
  it("since_land — 구주택 취득일 잔재를 버린다(leaf stray 위반 방지) · ④ 키에 priorHouseStartDate 없음", () => {
    const a = rebuildAsset({ landRebuildStartMode: "since_land", landRebuildPriorHouseStartDate: "2018-03-01" });
    expect(effectiveLandRebuild(a)?.priorHouseStartDate).toBeUndefined();
    expect(buildLandRebuildPayload(a).landRebuildPriorHouse).toEqual({ startMode: "since_land", demolitionDate: "2023-05-31", footprintUnchanged: true });
  });
  it("later — 구주택 취득일을 싣는다", () => {
    const a = rebuildAsset({ landRebuildStartMode: "later", landRebuildPriorHouseStartDate: "2018-03-01" });
    expect(buildLandRebuildPayload(a).landRebuildPriorHouse).toEqual({ startMode: "later", priorHouseStartDate: "2018-03-01", demolitionDate: "2023-05-31", footprintUnchanged: true });
  });
  it("시작 구분 미선택 — ④는 키를 싣지 않고 ⑧ 사실에는 입력이 남아 leaf가 막는다", () => {
    const a = rebuildAsset({ landRebuildStartMode: "" });
    expect(buildLandRebuildPayload(a)).toEqual({});
    expect(landRebuildFactsOfAsset(a).rebuild?.startMode).toBe("");
  });
  it("⑧ 사실의 토지 취득일 = ④가 보내는 값", () => {
    expect(landRebuildFactsOfAsset(rebuildAsset()).landAcquisitionDate).toBe("2022-01-01");
  });
});

describe("엔진 leaf — ⑧ 사실이 ⑫·엔진과 같은 overlay를 싣는다 · landRebuildApplies(통산이 실제로 도는 입력)", () => {
  it("⑧ 사실의 landAcquisitionCause = 유효 overlay(신축 호스트는 상속, 매매 호스트는 없음) — ⑫·엔진이 input.landAcquisitionCause를 넣는 것과 같다", () => {
    expect(landRebuildFactsOfAsset(rebuildAsset()).landAcquisitionCause).toBe("inheritance");
    expect(landRebuildFactsOfAsset(purchaseRebuildAsset()).landAcquisitionCause).toBeUndefined();
  });

  const input = (o: Record<string, unknown>) =>
    ({ propertyType: "housing", landAcquisitionDate: new Date("2022-01-01"), landRebuildPriorHouse: { startMode: "since_land", demolitionDate: new Date("2023-05-31"), footprintUnchanged: true }, ...o }) as never;
  it("landRebuildApplies — 신축은 항상, 매매는 토지 overlay 없을 때만(D2 잔재 purchase는 overlay 아님), 입력·주택·토지 취득일이 없으면 거짓", () => {
    expect(landRebuildApplies(input({ acquisitionCause: "newConstruction" }))).toBe(true);
    expect(landRebuildApplies(input({ acquisitionCause: "newConstruction", landAcquisitionCause: "inheritance" }))).toBe(true);
    expect(landRebuildApplies(input({ acquisitionCause: "purchase" }))).toBe(true);
    expect(landRebuildApplies(input({ acquisitionCause: "purchase", landAcquisitionCause: "purchase" }))).toBe(true);
    expect(landRebuildApplies(input({ acquisitionCause: "purchase", landAcquisitionCause: "inheritance" }))).toBe(false);
    expect(landRebuildApplies(input({ acquisitionCause: "purchase", landAcquisitionCause: "gift" }))).toBe(false);
    expect(landRebuildApplies(input({ acquisitionCause: "inheritance" }))).toBe(false);
    expect(landRebuildApplies(input({ acquisitionCause: "purchase", landRebuildPriorHouse: undefined }))).toBe(false);
    expect(landRebuildApplies(input({ acquisitionCause: "purchase", propertyType: "building" }))).toBe(false);
    expect(landRebuildApplies(input({ acquisitionCause: "purchase", landAcquisitionDate: undefined }))).toBe(false);
  });
});
