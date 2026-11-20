/**
 * anchor(④⑧) — 겸용주택 배율 초과분 수용 의제·유예 사실의 와이어 값 (NBL2611-C5).
 * C4가 주택·상가·일반건물에 둔 입구(`buildAppurtenantExcessFacts`)를 겸용에도 연다 — 입력은 새로 받지 않는다(자산-수준 `expropriationNoticeDate` + NBL 섹션 `nblGracePeriods` 재사용).
 * 노출(⑤)·전송(④)·검증(⑧)이 같은 술어 `housingExcessGraceApplies`를 읽는다.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { buildAppurtenantExcessFacts, housingExcessGraceApplies, housingExcessGraceIntervals } from "@/lib/calc/appurtenant-excess-facts";
import { validateHousingExcessGrace } from "@/lib/calc/transfer-tax-validate-housing-excess-grace";
import { mixedExcessAreaCandidate } from "@/lib/tax-engine/mixed-use-excess-area";

const TRANSFER = "2024-06-01";
/** 주택 150㎡ > 상가 100㎡ · 정착 100㎡ · 대지 400㎡ · 수도권 일반주거(3배) → 주택분 한도 150㎡ × … 아래 표 참고 */
const mixed = (o: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-01",
    landAcquisitionDate: "2015-06-01",
    residentialFloorArea: "150",
    nonResidentialFloorArea: "100",
    buildingFootprintArea: "100",
    mixedUseTotalLandArea: "400",
    mixedZoneType: "general_residential",
    mixedIsMetropolitanArea: true,
    ...o,
  }) as AssetForm;
const rows = [{ reasonCode: "use_prohibited", anchorDate: "2015-06-02", endDate: "2023-12-31", description: "" }] as AssetForm["nblGracePeriods"];

describe("⑤④⑧ 노출 술어 — 겸용은 겸용 면적(주택분 한도 · OH-17 건물 전체 한도 중 하나라도 초과)으로 판정한다", () => {
  it("대지 400㎡ > 정착 100㎡ × 3배 → 초과 있음", () => {
    expect(housingExcessGraceApplies(mixed(), TRANSFER)).toBe(true);
  });
  it("대지 300㎡ = 한도 → 초과 없음(경계 — 같으면 초과가 아니다)", () => {
    expect(housingExcessGraceApplies(mixed({ mixedUseTotalLandArea: "300" }), TRANSFER)).toBe(false);
    expect(housingExcessGraceApplies(mixed({ mixedUseTotalLandArea: "300.01" }), TRANSFER)).toBe(true);
  });
  it("OH-17(주택 연면적 > 주택 외) 전체 기준만 초과인 경우도 «있을 수 있다» — 주택분 부수토지 한도는 이내(상가분에 대지를 몰아 둔 경우)", () => {
    const a = mixed({ mixedResidentialLandAreaOverride: "100", mixedCommercialLandAreaOverride: "300" });
    // 주택분 한도: 주택 부수토지 100㎡ ≤ 정착 100×(150/250)=60 × 3 = 180 → 이내. 전체 기준: 400 > 100 × 3 → 초과.
    expect(mixedExcessAreaCandidate({ residentialFloorArea: 150, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 400, residentialLandAreaOverride: 100, commercialLandAreaOverride: 300, zoneType: "general_residential", isMetropolitanArea: true }, new Date("2024-06-01"))).toBe(100);
    expect(housingExcessGraceApplies(a, TRANSFER)).toBe(true);
  });
  it("주택 연면적 ≤ 주택 외 연면적이면 OH-17이 아니라 전체 기준을 보지 않는다", () => {
    expect(housingExcessGraceApplies(mixed({ residentialFloorArea: "100", nonResidentialFloorArea: "150", mixedUseTotalLandArea: "250" }), TRANSFER)).toBe(false);
  });
  it("용도지역·수도권 미선택은 엔진(`?? residential` · `?? true`)과 같게 읽는다 · 도시지역 밖(10배)이면 같은 대지도 이내", () => {
    expect(housingExcessGraceApplies(mixed({ mixedZoneType: "", mixedIsMetropolitanArea: undefined }), TRANSFER)).toBe(true);
    expect(housingExcessGraceApplies(mixed({ mixedZoneType: "agriculture_forest" }), TRANSFER)).toBe(false);
  });
  it("겸용이 아니면 종전대로 주택 `acquisitionArea`로 판정한다(겸용 칸은 읽지 않는다)", () => {
    expect(housingExcessGraceApplies(mixed({ isMixedUseHouse: false }), TRANSFER)).toBe(false);
  });
});

describe("④ buildAppurtenantExcessFacts — 겸용", () => {
  const expro = { transferCause: "public_expropriation", expropriationNoticeDate: "2019-01-01" } as Partial<AssetForm>;
  it("수용 + 고시일 → 고시일을 싣는다(겸용은 종전에 보내지 않았다)", () => {
    expect(buildAppurtenantExcessFacts(mixed(expro), TRANSFER)).toEqual({ expropriationNoticeDate: "2019-01-01" });
  });
  it("양도원인이 일반이면 남은 고시일(stale)을 싣지 않는다", () => {
    expect(buildAppurtenantExcessFacts(mixed({ transferCause: "general", expropriationNoticeDate: "2019-01-01" }), TRANSFER)).toBeUndefined();
  });
  it("유예 행 → 구간. 소유기간 기산은 겸용 payload와 같은 토지 취득일(`landAcquisitionDate || acquisitionDate`)", () => {
    const a = mixed({ nblGracePeriods: rows });
    expect(housingExcessGraceIntervals(a, TRANSFER)).toEqual([{ startDate: "2015-06-02", endDate: "2023-12-31" }]);
    expect(buildAppurtenantExcessFacts(a, TRANSFER)).toEqual({ graceIntervals: [{ startDate: "2015-06-02", endDate: "2023-12-31" }] });
  });
  it("초과분이 없으면 남은 유예 행은 싣지 않는다(stale 차단) — 고시일만 남는다", () => {
    expect(buildAppurtenantExcessFacts(mixed({ ...expro, nblGracePeriods: rows, mixedUseTotalLandArea: "300" }), TRANSFER)).toEqual({ expropriationNoticeDate: "2019-01-01" });
  });
  it("자산 종류가 주택이 아니면(겸용 잔재) 이 입구가 아니다", () => {
    expect(buildAppurtenantExcessFacts(mixed({ ...expro, assetKind: "land" }), TRANSFER)).toBeUndefined();
  });
});

describe("⑧ validateHousingExcessGrace — 겸용도 같은 helper·같은 게이트", () => {
  it("보이는 유예 행의 종료일이 비면 막는다", () => {
    const a = mixed({ nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "2015-06-02", endDate: "", description: "" }] });
    expect(validateHousingExcessGrace(a, "겸용주택", TRANSFER)).toContain("종료일");
  });
  it("초과분이 없어 칸이 보이지 않으면 남은 잘못된 행도 막지 않는다 — UI 통과 ↔ validate 차단 모순 금지", () => {
    const a = mixed({ mixedUseTotalLandArea: "300", nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "2015-06-02", endDate: "", description: "" }] });
    expect(validateHousingExcessGrace(a, "겸용주택", TRANSFER)).toBeNull();
  });
});
