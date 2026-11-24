// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-③ 후속 (#1 · L1 · L2) — ⑤ 위젯이 ⑧ H9·H10과 **같은 판정**(`housePriorHistoryIgnoredOf` · `housePriorNeedsMetropolitanOf(asset, 양도일)`)으로
 * 정착면적 «필수» 표시 · 수도권 칸 · 부분 면적 고지를 가른다. 칸 값은 지우지 않는다(보존). 판정 자체는 엔진(`otherLandAreaIsPartial` · `stateHistoryDeemedBlocks`)이 정한다 —
 * ⑧ ↔ ⑫ parity는 `__tests__/api/nbl-house-prior-followups.anchor.test.ts`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

afterEach(cleanup);

type Ev = NblOtherStateEventInput;
const built = (date: string): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "" });
const house = (date: string, footprint: string): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: "", buildingKindBefore: "house", houseFootprintBefore: footprint });

/** 기타토지 1,000㎡ · 일반주거 · 수도권 칸 비움 · 취득 2014-01-01 · 이력 «바뀐 적 있음» + 주택 철거 → 신축(건물 있는 꼬리). */
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2014-01-01",
    acquisitionArea: "1000",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblIsMetropolitanArea: "",
    nblOtherHasBuilding: true,
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [house("2016-01-01", ""), built("2020-01-01")],
    nblOtherPropertyTaxType: "separate",
    nblOtherBuildingValue: "100000000",
    nblOtherLandValue: "200000000",
    ...over,
  }) as AssetForm;
const PARTIAL: Partial<AssetForm> = { nblOtherBuildingFloorArea: "100" }; // 허용 400㎡ < 1,000㎡ → 초과분 비사업용(비율 0.6)
const WITHIN: Partial<AssetForm> = { nblOtherBuildingFloorArea: "400" }; // 허용 1,600㎡ ≥ 1,000㎡ → 전량 사업용(엔진이 이력을 읽는다)

const mount = (a: AssetForm, transferDate: string | undefined = "2024-01-01") => render(<OtherLandDetailSection asset={a} onAssetChange={vi.fn()} transferDate={transferDate} />);
const id = (s: string) => screen.queryByTestId(s);
/** 정착면적 카드의 «필수»(*) 표시 — FieldCard 라벨의 destructive 별표. */
const footprintRequired = () => !!document.querySelector('[data-field="nblOtherStateEvents.0.houseFootprintBefore"] .text-destructive');

describe("#1 부분 면적 — 엔진이 철거 행 이력을 읽지 않는다: 필수 표시 해제 · 수도권 칸 숨김 · PARTIAL 고지 · 입력 칸은 남는다", () => {
  it("부분 면적: 정착면적 «필수» 없음 · 수도권 칸 없음 · 엔진 PARTIAL 상수 고지 · 정착면적 칸 자체는 그대로(값 보존)", () => {
    mount(asset(PARTIAL));
    expect(footprintRequired()).toBe(false);
    expect(id("nbl-other-state-event-0-footprint")).not.toBeNull();
    expect(id("nbl-house-prior-metro")).toBeNull();
    expect(screen.getByTestId("nbl-other-partial-area-notice").textContent).toBe(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    // 엔진이 이력을 구간으로 나누지 않으므로 구간표 미리보기도 그리지 않는다(입력 화면 = 결과)
    expect(id("nbl-state-history-preview")).toBeNull();
  });

  it("대조 — 이내(전량 사업용)면 엔진이 이력을 읽는다: «필수» 표시 · 수도권 칸 · 고지 없음", () => {
    mount(asset(WITHIN));
    expect(footprintRequired()).toBe(true);
    expect(id("nbl-house-prior-metro")).not.toBeNull();
    expect(id("nbl-other-partial-area-notice")).toBeNull();
  });

  it("호별 기준면적 초과(주차장) — 다른 부분 면적 경로도 같은 core 판정으로 접힌다", () => {
    mount(asset({ nblOtherRelatedBusinessType: "parking_garage", nblOtherMinGarageArea: "100", nblOtherBuildingFloorArea: "100" } as Partial<AssetForm>));
    expect(footprintRequired()).toBe(false);
    expect(id("nbl-house-prior-metro")).toBeNull();
    expect(id("nbl-other-partial-area-notice")).not.toBeNull();
  });

  it("주택 철거 행이 없으면 부분 면적이어도 알릴 것이 없다(요구할 칸이 없다 — 종전 화면과 같다)", () => {
    mount(asset({ ...PARTIAL, nblOtherStateEvents: [{ kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "separate" }, built("2020-01-01")] }));
    expect(id("nbl-other-partial-area-notice")).toBeNull();
  });
});

describe("L2 양도일 의제 사유 — 정착면적 «필수» 해제 · 수도권 칸 숨김(⑧ H9·H10 건너뜀과 같은 판정) · 의제 안내만", () => {
  const deemed = { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2020-01-01" } as Partial<AssetForm>;

  it("의제 선택: «필수» 없음 · 수도권 칸 없음 · 의제 안내 있음 · PARTIAL 고지는 중복으로 띄우지 않는다", () => {
    mount(asset({ ...WITHIN, ...deemed }));
    expect(footprintRequired()).toBe(false);
    expect(id("nbl-house-prior-metro")).toBeNull();
    expect(id("nbl-state-history-deemed-notice")).not.toBeNull();
    expect(id("nbl-other-partial-area-notice")).toBeNull();
  });

  it("의제 + 부분 면적이어도 안내는 의제 하나(엔진도 의제 사유를 먼저 안내한다)", () => {
    mount(asset({ ...PARTIAL, ...deemed }));
    expect(id("nbl-state-history-deemed-notice")).not.toBeNull();
    expect(id("nbl-other-partial-area-notice")).toBeNull();
    expect(footprintRequired()).toBe(false);
  });

  it("의제 사유 «없음»이면 종전과 같다 — «필수» 표시 · 수도권 칸", () => {
    mount(asset({ ...WITHIN, nblDeemedTransferReason: "none" } as Partial<AssetForm>));
    expect(footprintRequired()).toBe(true);
    expect(id("nbl-house-prior-metro")).not.toBeNull();
  });
});

describe("L1 양도일 — 2022.1.1. 전 양도는 수도권 칸을 열지 않는다(배율이 수도권을 가르지 않는다)", () => {
  it.each([
    ["2021-12-31", false],
    ["2022-01-01", true],
    ["2024-01-01", true],
    [undefined, true], // 양도일 미입력 — 현행 표로 보고 칸을 열어 묻는다
    ["", true],
  ] as const)("양도일 %s → 수도권 칸 %s", (transferDate, shown) => {
    mount(asset(WITHIN), transferDate);
    expect(id("nbl-house-prior-metro") !== null).toBe(shown);
  });

  it("종전 규정 양도에서도 정착면적 «필수»는 그대로다(허용 면적은 정착면적 × 5배로 판정 — 정착면적은 읽는다)", () => {
    mount(asset(WITHIN), "2021-12-31");
    expect(footprintRequired()).toBe(true);
  });
});
