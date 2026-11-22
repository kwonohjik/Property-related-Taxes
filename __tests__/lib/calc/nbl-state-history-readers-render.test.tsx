// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-U0 — ⑤ 「건축물 있음」 직접 읽기 6곳이 모두 `effectiveOtherHasBuildingOf`를 읽는다 (곳마다 anchor 1건).
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.ui.plan.md §11.1 · §18.3 P-1 (6곳 중 5곳의 안전망이 0건이었다)
 *
 * 저장된 토글값(`nblOtherHasBuilding`)을 일부러 «사건 파생값과 반대»로 둔다 — 6곳 중 한 곳이라도 저장값을 읽으면 그 곳의 단언이 깨진다.
 *   마지막 사건 = 신축 → 양도일 현재 건축물 있음 / 마지막 사건 = 멸실 → 없음.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const withEvents = (over: Partial<AssetForm>): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblOtherStateHistoryMode: "changed",
    ...over,
  }) as AssetForm;

/** 마지막 사건 = 신축(양도일 현재 건축물 있음) — 저장 토글은 false */
const lastBuilt = (over: Partial<AssetForm> = {}) =>
  withEvents({
    nblOtherHasBuilding: false,
    nblOtherStateEvents: [{ kind: "building_built", date: "2021-01-01", propertyTaxTypeBefore: "" }],
    ...over,
  });
/** 마지막 사건 = 멸실(양도일 현재 건축물 없음) — 저장 토글은 true */
const lastRemoved = (over: Partial<AssetForm> = {}) =>
  withEvents({
    nblOtherHasBuilding: true,
    nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }],
    ...over,
  });

const mount = (a: AssetForm) => render(<OtherLandDetailSection asset={a} onAssetChange={() => {}} />);
const has = (field: string) => document.querySelector(`[data-field="${field}"]`) !== null;

describe("⑤ 6곳 — 양도일 현재 유무는 사건 파생값", () => {
  it("[DetailSection :144] 「건축물 있음」 토글 값 — 마지막 사건이 신축이면 켜짐, 멸실이면 꺼짐", () => {
    const { unmount } = mount(lastBuilt());
    expect(screen.getByTestId("nbl-other-has-building-toggle").getAttribute("data-checked")).toBe("true");
    unmount();
    mount(lastRemoved());
    expect(screen.getByTestId("nbl-other-has-building-toggle").getAttribute("data-checked")).toBeNull();
  });

  it("[DetailSection :176] 시가표준액·바닥면적 칸 — 마지막 구간에 건축물이 있을 때만", () => {
    const { unmount } = mount(lastBuilt());
    expect(has("nblOtherBuildingFloorArea")).toBe(true);
    unmount();
    mount(lastRemoved());
    expect(has("nblOtherBuildingFloorArea")).toBe(false);
  });

  it("[DetailSection :223] 복합용도 §168의11⑥ 안분 — 마지막 구간에 건축물이 있을 때만", () => {
    const { unmount } = mount(lastBuilt());
    expect(screen.queryByText(/§168의11⑥ 복합용도 건축물 부속토지 안분/)).not.toBeNull();
    unmount();
    mount(lastRemoved());
    expect(screen.queryByText(/§168의11⑥ 복합용도 건축물 부속토지 안분/)).toBeNull();
  });

  it("[HoSection :60] 13호 «나지» 요건 고지 — 마지막 구간에 건축물이 있으면 인정되지 않는다는 고지가 뜬다", () => {
    const { unmount } = mount(lastBuilt({ nblOtherRelatedBusinessType: "vacant_lot_1household" }));
    expect(screen.queryByTestId("nbl-other-ho-fail-notice")).not.toBeNull();
    unmount();
    mount(lastRemoved({ nblOtherRelatedBusinessType: "vacant_lot_1household" }));
    expect(screen.queryByTestId("nbl-other-ho-fail-notice")).toBeNull();
  });

  it("[BasisField :34] 재산세 분류 근거 선택지 — 별도합산 선언은 마지막 구간에 건축물이 없을 때만 근거를 묻는다", () => {
    const { unmount } = mount(lastBuilt({ nblOtherPropertyTaxType: "separate" }));
    expect(screen.queryByTestId("nbl-other-tax-basis-vacant_state")).toBeNull();
    unmount();
    mount(lastRemoved({ nblOtherPropertyTaxType: "separate" }));
    expect(screen.queryByTestId("nbl-other-tax-basis-vacant_state")).not.toBeNull();
  });

  it("[BasisField :72] 종전 바닥면적 칸 — 철거·멸실 근거는 마지막 구간에 건축물이 없을 때만 면적을 묻는다", () => {
    const { unmount } = mount(lastRemoved({ nblOtherPropertyTaxType: "separate", nblOtherPropertyTaxBasis: "demolished" }));
    expect(has("nblOtherDemolishedFloorArea")).toBe(true);
    unmount();
    mount(lastBuilt({ nblOtherPropertyTaxType: "separate", nblOtherPropertyTaxBasis: "demolished" }));
    expect(has("nblOtherDemolishedFloorArea")).toBe(false);
  });

  it("changed가 아니면 저장 토글값 그대로(이력 없음 경로 불변)", () => {
    mount(withEvents({ nblOtherStateHistoryMode: "unchanged", nblOtherHasBuilding: true }));
    expect(screen.getByTestId("nbl-other-has-building-toggle").getAttribute("data-checked")).toBe("true");
    expect(has("nblOtherBuildingFloorArea")).toBe(true);
  });
});
