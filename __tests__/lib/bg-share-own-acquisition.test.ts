/**
 * `bgShareOwnAcquisitionApplies` · `bgShareOwnAcquisitionActive` — 축 B × 부담부증여 지분 카드 토글의 범위 leaf(화면 · ④ · ⑧ 공용).
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §14 D-2. 값 축은 route anchor(`transfer.route.bg-axis-b-share-own-acquisition.anchor.test.ts`)가 본다 —
 * 여기서는 계산으로는 드러나지 않는 범위 가드(이월과세 · 의제취득일 전 · 기준시가 모드)를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { bgShareOwnAcquisitionActive, bgShareOwnAcquisitionApplies } from "@/lib/calc/bg-share-own-acquisition";

const base = (over: Partial<AssetForm> = {}) =>
  Object.assign({ ...makeDefaultAsset(2) }, {
    assetKind: "general_building", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market",
    acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2019-01-01", landAcquisitionDate: "2019-01-01",
  } as Partial<AssetForm>, over) as AssetForm;

describe("bgShareOwnAcquisitionApplies — 범위", () => {
  it("일반건물 · 시가 평가 · 매매 지분 → 연다", () => expect(bgShareOwnAcquisitionApplies(base())).toBe(true));
  it("기준시가 평가 → 닫는다(산정방식이 쓰이지 않는다)", () => expect(bgShareOwnAcquisitionApplies(base({ bgValuationMode: "sangjeungbeop_standard" }))).toBe(false));
  it("토지 · 주택 · 상가 · 건물 → 연다(vp2c §15 D-3 · Q-8 a)", () => {
    for (const assetKind of ["land", "housing", "commercial_building", "building"] as const) expect(bgShareOwnAcquisitionApplies(base({ assetKind }))).toBe(true);
  });
  it("분양권 → 닫는다(부담부증여 지원 종류 밖)", () => expect(bgShareOwnAcquisitionApplies(base({ assetKind: "presale_right" }))).toBe(false));
  it("재개발 — 시가 · 실지(K-4)만 연다 · 환산(K-5) · 기준시가는 닫는다(vp2c §25 D-3g · Q-18 a)", () => {
    expect(bgShareOwnAcquisitionApplies(base({ assetKind: "redevelopment_apt", bgAcquisitionMethod: "actual" }))).toBe(true);
    expect(bgShareOwnAcquisitionApplies(base({ assetKind: "redevelopment_apt", bgAcquisitionMethod: "converted" }))).toBe(false);
    expect(bgShareOwnAcquisitionApplies(base({ assetKind: "redevelopment_apt", bgAcquisitionMethod: "actual", bgValuationMode: "sangjeungbeop_standard" }))).toBe(false);
  });
  it("입주권 — 원조합원 지분은 평가 모드와 무관하게 연다 · 승계 지분은 닫는다(vp2c §25 D-3g)", () => {
    expect(bgShareOwnAcquisitionApplies(base({ assetKind: "right_to_move_in", bgValuationMode: "sangjeungbeop_standard" }))).toBe(true);
    expect(bgShareOwnAcquisitionApplies(base({ assetKind: "right_to_move_in", isSuccessorRightToMoveIn: true }))).toBe(false);
  });
  it("이월과세 지분 → 닫는다(당초 증여자 재료 규칙)", () =>
    expect(bgShareOwnAcquisitionApplies(base({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift" }))).toBe(false));
  it("의제취득일 전 상속 지분 → 닫는다(①②③ 3자 max)", () =>
    expect(bgShareOwnAcquisitionApplies(base({ acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", acquisitionDate: "1980-03-01", landAcquisitionDate: "1980-03-01" }))).toBe(false));
  it("일반 양도 → 닫는다", () => expect(bgShareOwnAcquisitionApplies(base({ transferType: "regular" }))).toBe(false));
});

describe("bgShareOwnAcquisitionActive — 토글 × 범위", () => {
  it("토글 켬 + 범위 안 → 참 · 토글 끔 → 거짓 · 범위 밖이면 토글 켬이어도 거짓", () => {
    expect(bgShareOwnAcquisitionActive(base({ bgShareOwnAcquisition: true }), base())).toBe(true);
    expect(bgShareOwnAcquisitionActive(base({ bgShareOwnAcquisition: false }), base())).toBe(false);
    expect(bgShareOwnAcquisitionActive(base({ bgShareOwnAcquisition: true }), base({ bgValuationMode: "sangjeungbeop_standard" }))).toBe(false);
  });
});
