/**
 * 구주택 멸실·신축 통산 공통 술어(`lib/calc/transfer-land-rebuild.ts`) — ⑤·④·⑧이 읽는 단일 소스.
 */
import { describe, it, expect } from "vitest";
import { landRebuildApplicable, effectiveLandRebuild, landRebuildFactsOfAsset, buildLandRebuildPayload } from "@/lib/calc/transfer-land-rebuild";
import { rebuildAsset } from "./_helpers/land-rebuild-form";

describe("landRebuildApplicable — 호스트 술어", () => {
  it("기준(주택 · 신축 · 취득일 분리 · 토지 원인 유효 · 소유자 같음)은 참", () => {
    expect(landRebuildApplicable(rebuildAsset())).toBe(true);
  });
  it.each([
    ["겸용주택", { isMixedUseHouse: true }],
    ["주택 아님", { assetKind: "building" }],
    ["취득원인 매매", { acquisitionCause: "purchase" }],
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
