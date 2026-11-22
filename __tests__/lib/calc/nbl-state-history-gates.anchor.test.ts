/**
 * NBL-STATE-HISTORY-U0 — 기타토지 건축물 이력 술어(④⑤⑧ 공용)·⑧ 유무 읽기 anchor. (④ 전송은 `nbl-state-history-wire.anchor.test.ts`)
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.ui.plan.md §2.2 · §6 ④ · §6.1 · §11.1
 *
 *   · `nblOtherStateHistoryApplies` 진리표(지목 × 정밀판정 × 연접 다필지)
 *   · `effectiveOtherHasBuildingOf` — 마지막 사건이 정하고, 미완성·비적용이면 저장 토글값
 *   · ⑧ 유무 읽기 2곳(철거 근거 술어 · 바닥면적 필수)이 같은 파생을 읽는다
 */
import { describe, it, expect } from "vitest";
import {
  effectiveOtherHasBuildingOf,
  nblOtherStateEventsInUse,
  nblOtherStateHistoryApplies,
} from "@/lib/calc/nbl-other-state-history-scope";
import { validateNblOtherLand } from "@/lib/calc/transfer-tax-validate-nbl-other";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const asset = (over: Partial<AssetForm>): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionArea: "1000",
    acquisitionDate: "2014-01-01",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblOtherPropertyTaxType: "separate",
    ...over,
  }) as AssetForm;

const built = (date: string) => ({ kind: "building_built" as const, date, propertyTaxTypeBefore: "" as const });
const removed = (date: string, before: "" | "separate" | "comprehensive" = "") => ({ kind: "building_removed" as const, date, propertyTaxTypeBefore: before });

describe("nblOtherStateHistoryApplies — 지목 × 정밀판정 × 연접 다필지", () => {
  const lands = ["farmland", "forest", "pasture", "housing_site", "villa_land", "other_land", ""] as const;
  it.each(lands)("지목 %s: 기타토지만 true (정밀판정 ON · 연접 다필지 꺼짐)", (landType) => {
    expect(nblOtherStateHistoryApplies(asset({ nblLandType: landType }))).toBe(landType === "other_land");
  });
  it("정밀판정 OFF → false", () => {
    expect(nblOtherStateHistoryApplies(asset({ nblUseDetailedJudgment: false }))).toBe(false);
  });
  it("연접 다필지 ON → false (필지별 hasBuilding과 배타 — 통합 Q-13)", () => {
    expect(nblOtherStateHistoryApplies(asset({ nblOtherUseParcels: true }))).toBe(false);
  });
});

describe("effectiveOtherHasBuildingOf — 양도일 현재 유무", () => {
  const changed = (events: AssetForm["nblOtherStateEvents"], raw = false) =>
    asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events, nblOtherHasBuilding: raw });

  it("changed + 마지막 사건 = 신축 → true (저장 토글이 false여도)", () => {
    expect(effectiveOtherHasBuildingOf(changed([built("2021-01-01")], false))).toBe(true);
  });
  it("changed + 마지막 사건 = 멸실 → false (저장 토글이 true여도)", () => {
    expect(effectiveOtherHasBuildingOf(changed([removed("2021-01-01")], true))).toBe(false);
  });
  it("changed + 멸실→신축→멸실 → false · 신축→멸실→신축 → true (마지막 종류만 본다)", () => {
    expect(effectiveOtherHasBuildingOf(changed([removed("2016-01-01"), built("2018-01-01"), removed("2021-01-01")], true))).toBe(false);
    expect(effectiveOtherHasBuildingOf(changed([built("2016-01-01"), removed("2018-01-01"), built("2021-01-01")], false))).toBe(true);
  });
  it("changed + 종류 미선택 행이 있으면 저장 토글값 (사건 미완성 — ⑧이 막는다)", () => {
    const rows = [{ kind: "" as const, date: "", propertyTaxTypeBefore: "" as const }];
    expect(effectiveOtherHasBuildingOf(changed(rows, true))).toBe(true);
    expect(effectiveOtherHasBuildingOf(changed(rows, false))).toBe(false);
  });
  it("changed + 사건 0건 → 저장 토글값", () => {
    expect(effectiveOtherHasBuildingOf(changed([], true))).toBe(true);
  });
  it.each(["", "unchanged", "unknown"] as const)("모드 %s → 사건이 남아 있어도 저장 토글값", (mode) => {
    const a = asset({ nblOtherStateHistoryMode: mode, nblOtherStateEvents: [removed("2021-01-01")], nblOtherHasBuilding: true });
    expect(effectiveOtherHasBuildingOf(a)).toBe(true);
  });
  it("질문이 적용되지 않는 자산(연접 다필지)은 changed여도 저장 토글값", () => {
    const a = asset({ nblOtherUseParcels: true, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01")], nblOtherHasBuilding: true });
    expect(effectiveOtherHasBuildingOf(a)).toBe(true);
  });
  it("nblOtherStateEventsInUse — 적용 + changed일 때만 true", () => {
    expect(nblOtherStateEventsInUse(asset({ nblOtherStateHistoryMode: "changed" }))).toBe(true);
    expect(nblOtherStateEventsInUse(asset({ nblOtherStateHistoryMode: "unchanged" }))).toBe(false);
    expect(nblOtherStateEventsInUse(asset({ nblOtherStateHistoryMode: "changed", nblOtherUseParcels: true }))).toBe(false);
  });
});

describe("⑧ 건축물 유무 읽기 2곳 — validateNblOtherLand가 같은 파생을 읽는다", () => {
  const changed = (events: AssetForm["nblOtherStateEvents"], over: Partial<AssetForm> = {}) =>
    asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: events, ...over });

  it("[읽기 1: 철거 근거 술어] 마지막 사건 = 멸실이면 저장 토글이 true여도 «철거ㆍ멸실 근거 → 종전 바닥면적 필수»가 작동한다", () => {
    const a = changed([removed("2021-01-01")], { nblOtherHasBuilding: true, nblOtherPropertyTaxBasis: "demolished" });
    expect(validateNblOtherLand(a, "자산")).toMatch(/철거ㆍ멸실 근거 — 철거 전 건축물의 바닥면적/);
  });
  it("[읽기 1] 마지막 사건 = 신축이면 저장 토글이 false여도 철거 근거를 묻지 않는다(숨은 stale)", () => {
    const a = changed([built("2021-01-01")], { nblOtherHasBuilding: false, nblOtherPropertyTaxBasis: "demolished", nblOtherBuildingFloorArea: "100" });
    expect(validateNblOtherLand(a, "자산")).toBeNull();
  });
  it("[읽기 2: 바닥면적 필수] 마지막 사건 = 신축이면 저장 토글이 false여도 건축물 바닥면적을 요구한다", () => {
    const a = changed([built("2021-01-01")], { nblOtherHasBuilding: false });
    expect(validateNblOtherLand(a, "자산")).toMatch(/건축물 바닥면적\(㎡\)을 입력하세요/);
  });
  it("[읽기 2] 마지막 사건 = 멸실이면 저장 토글이 true여도 건축물 바닥면적을 요구하지 않는다", () => {
    const a = changed([removed("2021-01-01")], { nblOtherHasBuilding: true });
    expect(validateNblOtherLand(a, "자산")).toBeNull();
  });
  it("changed가 아니면 저장 토글 그대로(바닥면적 필수 유지)", () => {
    const a = asset({ nblOtherStateHistoryMode: "unchanged", nblOtherHasBuilding: true });
    expect(validateNblOtherLand(a, "자산")).toMatch(/건축물 바닥면적\(㎡\)을 입력하세요/);
  });
});
