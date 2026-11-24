// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-④ UI — ⑤ 13호 위젯 노출/숨김 격자 · C-1·C-2·C-4 안내 · 기존 안내 박스 바이트 유지 · 행 입력(추가·삭제·상한) · 미리보기 · 적용 고지 변형.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.ui.plan.md §4 · §9 (X1~X10) · §11.1
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { NBL_HOUSEHOLD_HOUSE_PERIODS_MAX, nblHouseholdHousePeriodsCapMessage } from "@/lib/calc/nbl-household-house-periods-cap";
import {
  NBL_STATE_HISTORY_APPLIED_NOTICE,
  NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE,
  NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE,
  NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE,
  NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE,
  NBL_STATE_HISTORY_VACANT_LOT_TAX_CHANGE_APPLIED_NOTICE,
  NBL_VACANT_LOT_BARE_ONLY_INPUT_NOTICE,
  NBL_VACANT_LOT_HOUSE_PERIODS_INPUT_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";

afterEach(cleanup);

const HO13 = "vacant_lot_1household" as const;
const removed = (date: string) => ({ kind: "building_removed" as const, date, propertyTaxTypeBefore: "comprehensive" as const });
const built = (date: string) => ({ kind: "building_built" as const, date, propertyTaxTypeBefore: "" as const });

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionArea: "600",
    acquisitionDate: "2014-01-01",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherRelatedBusinessType: HO13,
    nblOtherHasBuilding: false,
    ...over,
  }) as AssetForm;

const mount = (a: AssetForm, onChange: (p: Partial<AssetForm>) => void = () => {}) => render(<OtherLandDetailSection asset={a} onAssetChange={onChange} transferDate="2024-01-01" />);
const widget = () => screen.queryByTestId("nbl-other-household-house");
const c1 = () => screen.queryByTestId("nbl-other-ho13-scope-notice");
const area = () => screen.queryByTestId("nbl-other-ho13-area-notice");
const partial = () => screen.queryByTestId("nbl-other-partial-area-notice");
const hoFail = () => screen.queryByTestId("nbl-other-ho-fail-notice");

describe("⑤ 위젯 노출/숨김 — 엔진 술어 `vacantLotHousePeriodsRead` 격자(X1~X6)", () => {
  it("X1 13호 + 꼬리 나지 + 이력 changed(철거) → 위젯 · C-1 · hoFail 없음", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2023-06-01")] }));
    expect(widget()).not.toBeNull();
    expect(c1()?.textContent).toBe(NBL_VACANT_LOT_BARE_ONLY_INPUT_NOTICE);
    expect(hoFail()).toBeNull();
    expect(area()).toBeNull();
  });
  it("X2 13호 + 꼬리 건물(마지막 신축) + changed + 660 이내 → hoFail + 위젯(leaf가 과거 나지 구간을 읽는다) + C-1", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2020-06-01")] }));
    expect(hoFail()).not.toBeNull();
    expect(widget()).not.toBeNull();
    expect(c1()?.textContent).toBe(NBL_VACANT_LOT_BARE_ONLY_INPUT_NOTICE);
    expect(area()).toBeNull();
  });
  it.each(["", "unchanged", "unknown"] as const)("X3 13호 + 꼬리 건물 + 이력 \"%s\" → hoFail만 · 위젯·C-1 숨김(엔진이 안 읽는다)", (mode) => {
    mount(asset({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherStateHistoryMode: mode }));
    expect(hoFail()).not.toBeNull();
    expect(widget()).toBeNull();
    expect(c1()).toBeNull();
    expect(area()).toBeNull();
  });
  it("X3b 13호 + 꼬리 나지 + 이력 OFF(\"\") → 위젯 노출(Q-3 (가) 이력과 무관) · C-1 없음(이력 changed 아님)", () => {
    mount(asset({ nblOtherStateHistoryMode: "" }));
    expect(widget()).not.toBeNull();
    expect(c1()).toBeNull();
  });
  it("X4 양도일 의제 + 꼬리 나지 → 위젯 노출(core가 행을 읽는다) · C-1 미노출(이력 미적용)", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2023-06-01")], nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-12-01" }));
    expect(widget()).not.toBeNull();
    expect(c1()).toBeNull();
  });
  it("X5 660㎡ 초과 + 꼬리 나지 + changed → 위젯 노출 · C-4 부분 면적 안내(엔진 PARTIAL 상수) · C-1 미노출", () => {
    mount(asset({ acquisitionArea: "800", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2023-06-01")] }));
    expect(widget()).not.toBeNull();
    expect(partial()?.textContent).toBe(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    expect(c1()).toBeNull();
  });
  it("X6 660㎡ 초과 + 꼬리 건물 + changed → C-2 면적 고지(엔진 AREA 상수) · 위젯·C-1 숨김(요구하면 막다른 길)", () => {
    mount(asset({ acquisitionArea: "900", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2020-06-01")] }));
    expect(area()?.textContent).toBe(NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE);
    expect(widget()).toBeNull();
    expect(c1()).toBeNull();
    expect(hoFail()).not.toBeNull();
  });
  it("X7·X8 호 전환 — 13호가 아니면 위젯·C-1·C-2·C-4 전부 없고(저장 행은 그대로), 13호면 다시 보인다", () => {
    const stored = { nblOtherHouseholdHouseStatus: "owned" as const, nblOtherHouseholdHousePeriods: [{ startDate: "2020-01-01", endDate: "" }] };
    const onChange = vi.fn();
    const { unmount } = mount(asset({ ...stored, nblOtherRelatedBusinessType: "fish_farm_licensed" }), onChange);
    expect(widget()).toBeNull();
    expect(c1()).toBeNull();
    expect(partial()).toBeNull();
    expect(onChange).not.toHaveBeenCalled(); // 렌더가 store를 쓰지 않는다(useEffect 미러링 없음)
    unmount();
    mount(asset(stored), onChange);
    expect(screen.getByTestId("nbl-other-household-house-0-start")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
  it("호 ≠ 13호의 부분 면적 흐름은 종전과 같다(UQ-7 (나) — 13호 선택 시에만 안내): 호 없음 + 800㎡ + 철거 행(주택 아님) → 부분 면적 안내 없음", () => {
    mount(asset({ nblOtherRelatedBusinessType: "none", acquisitionArea: "800", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2023-06-01")] }));
    expect(partial()).toBeNull();
  });
  it("정밀판정 OFF · 지목 농지 → 위젯 없음", () => {
    mount(asset({ nblUseDetailedJudgment: false }));
    expect(widget()).toBeNull();
  });
});

describe("기존 안내 박스 바이트 유지 · 질문 표시", () => {
  it("«별도 면적 입력 불필요» 문구가 단일 매치(새 문구가 이 구절을 쓰지 않는다)", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2023-06-01")], nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: [{ startDate: "2020-01-01", endDate: "" }] }));
    expect(screen.getAllByText(/별도 면적 입력 불필요/)).toHaveLength(1);
  });
  it("질문 미선택 → 두 라디오 모두 미체크(가정값 없음) · 행 영역 없음", () => {
    mount(asset());
    expect((screen.getByTestId("nbl-other-household-house-none") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("nbl-other-household-house-owned") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByTestId("nbl-other-household-house-periods")).toBeNull();
    expect(document.querySelector('[data-field="nblOtherHouseholdHouseStatus"]')).not.toBeNull();
  });
  it("질문 선택은 onAssetChange로만 저장한다", () => {
    const onChange = vi.fn();
    mount(asset(), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-household-house-owned"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherHouseholdHouseStatus: "owned" });
  });
  it("none → 행 영역 없음 · owned → 행 영역 + 입력 안내(엔진 입력용 상수)", () => {
    const { unmount } = mount(asset({ nblOtherHouseholdHouseStatus: "none" }));
    expect(screen.queryByTestId("nbl-other-household-house-periods")).toBeNull();
    unmount();
    mount(asset({ nblOtherHouseholdHouseStatus: "owned" }));
    expect(screen.getByTestId("nbl-other-household-house-input-notice").textContent).toBe(NBL_VACANT_LOT_HOUSE_PERIODS_INPUT_NOTICE);
  });
});

describe("행 입력 — 추가·삭제·상한·요약·미리보기", () => {
  const owned = (rows: Array<{ startDate: string; endDate: string }>, over: Partial<AssetForm> = {}) => asset({ nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: rows, ...over });

  it("«+ 주택 소유 기간 추가» → 빈 행(날짜 자동 채움 없음)", () => {
    const onChange = vi.fn();
    mount(owned([]), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-household-house-add"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherHouseholdHousePeriods: [{ startDate: "", endDate: "" }] });
  });
  it("삭제 → 해당 행만 제거", () => {
    const onChange = vi.fn();
    mount(owned([{ startDate: "2016-01-01", endDate: "2017-01-01" }, { startDate: "2020-01-01", endDate: "" }]), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-household-house-0-remove"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherHouseholdHousePeriods: [{ startDate: "2020-01-01", endDate: "" }] });
  });
  it("상한(단일 소스 상수)에서 «+ 추가»가 사라지고 같은 문구가 나온다", () => {
    const rows = Array.from({ length: NBL_HOUSEHOLD_HOUSE_PERIODS_MAX }, (_, i) => ({ startDate: `20${String(10 + i).padStart(2, "0")}-01-01`, endDate: `20${String(10 + i).padStart(2, "0")}-06-01` }));
    mount(owned(rows));
    expect(screen.queryByTestId("nbl-other-household-house-add")).toBeNull();
    expect(screen.getByTestId("nbl-other-household-house-cap-notice").textContent).toBe(nblHouseholdHousePeriodsCapMessage());
  });
  it("행 요약 — 종료일 비움 = 양도일까지 · 종료일 있음 = 종료일 전날까지 · 시작일 미입력은 줄 없음", () => {
    mount(owned([{ startDate: "2020-01-01", endDate: "" }, { startDate: "2016-01-01", endDate: "2017-01-01" }, { startDate: "", endDate: "" }]));
    expect(screen.getByTestId("nbl-other-household-house-0-summary").textContent).toBe("계산에 쓰는 소유 기간: 2020-01-01 ~ 양도일까지 계속 소유");
    expect(screen.getByTestId("nbl-other-household-house-1-summary").textContent).toBe("계산에 쓰는 소유 기간: 2016-01-01 ~ 2016-12-31 (종료일 전날까지)");
    expect(screen.queryByTestId("nbl-other-household-house-2-summary")).toBeNull();
  });
  it("미리보기(이력 OFF) — W2: 2020-01-01~ 소유 → 무주택 2,190일 / 소유기간 3,651일 · 제외 1,461일 (엔진 표 W2)", () => {
    mount(owned([{ startDate: "2020-01-01", endDate: "" }]));
    expect(screen.getByTestId("nbl-other-household-house-preview").textContent).toContain("13호로 인정되는 기간(예상): 2,190일 / 소유기간 3,651일 · 세대 주택 소유로 제외한 기간 1,461일");
  });
  it("미리보기(이력 changed) — X1: 건축물 구간 ∩ 무주택 = 2,190일(엔진 표 X1)", () => {
    mount(owned([{ startDate: "2023-01-01", endDate: "" }], { nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2020-01-01"), removed("2023-06-01")] }));
    expect(screen.getByTestId("nbl-other-household-house-preview").textContent).toContain("13호로 인정되는 기간(예상): 2,190일 / 소유기간 3,651일 · 세대 주택 소유로 제외한 기간 365일");
  });
  it("행에 ⑧ 결함이 있으면 미리보기를 그리지 않는다", () => {
    mount(owned([{ startDate: "2020-01-01", endDate: "2019-01-01" }]));
    expect(screen.queryByTestId("nbl-other-household-house-preview")).toBeNull();
  });
});

describe("입력 화면의 적용 고지 — 13호는 «호별 용도는 소유기간 전체에 적용» 변형 대신 13호 변형(M-4)", () => {
  const changed = (over: Partial<AssetForm> = {}) => asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2023-06-01")], ...over });
  const notice = () => screen.getByTestId("nbl-state-history-applied-notice").textContent;
  it("13호 ≤660 → 13호 변형 · 구분 변경 사건이 있으면 TAX_CHANGE 변형", () => {
    const { unmount } = mount(changed());
    expect(notice()).toBe(NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE);
    unmount();
    mount(changed({ nblOtherStateEvents: [removed("2023-06-01"), { kind: "tax_type_changed" as const, date: "2023-09-01", propertyTaxTypeBefore: "comprehensive" as const }] }));
    expect(notice()).toBe(NBL_STATE_HISTORY_VACANT_LOT_TAX_CHANGE_APPLIED_NOTICE);
  });
  it("호 ≠ 13호는 종전 상수 그대로(바이트 동일)", () => {
    const { unmount } = mount(changed({ nblOtherRelatedBusinessType: "none" }));
    expect(notice()).toBe(NBL_STATE_HISTORY_APPLIED_NOTICE);
    unmount();
    mount(changed({ nblOtherRelatedBusinessType: "none", nblOtherStateEvents: [removed("2023-06-01"), { kind: "tax_type_changed" as const, date: "2023-09-01", propertyTaxTypeBefore: "comprehensive" as const }] }));
    expect(notice()).toBe(NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE);
  });
  it("13호 + 660 초과 + 꼬리 건물 → 종전 상수(엔진이 13호 변형을 쓰지 않는다 — D-2)", () => {
    mount(asset({ acquisitionArea: "900", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2020-06-01")] }));
    expect(notice()).toBe(NBL_STATE_HISTORY_APPLIED_NOTICE);
  });
});
