// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-U1 — ⑤ 위젯 anchor: 질문(3지선다) · 사건 행 · 철거 직전 재산세 구분 · 미리보기 · 안내 · 토글 대체.
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.ui.plan.md §5 · §10 · §11.1
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  NBL_STATE_HISTORY_APPLIED_NOTICE,
  NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE,
  NBL_STATE_HISTORY_GRACE_ROW_NOTICE,
  NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE,
  NBL_STATE_HISTORY_REVENUE_START_NOTICE,
  NBL_STATE_HISTORY_UNCHANGED_NOTICE,
  NBL_STATE_HISTORY_UNKNOWN_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";

afterEach(cleanup);

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2014-01-01",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblOtherPropertyTaxType: "comprehensive",
    ...over,
  }) as AssetForm;

const mount = (a: AssetForm, onChange = vi.fn(), transferDate: string | undefined = "2024-01-01") =>
  render(<OtherLandDetailSection asset={a} onAssetChange={onChange} transferDate={transferDate} />);
const has = (field: string) => document.querySelector(`[data-field="${field}"]`) !== null;
const removed = (date: string, before: AssetForm["nblOtherStateEvents"][number]["propertyTaxTypeBefore"] = "separate") =>
  ({ kind: "building_removed" as const, date, propertyTaxTypeBefore: before });
const built = (date: string) => ({ kind: "building_built" as const, date, propertyTaxTypeBefore: "" as const });

describe("질문 — 3지선다 RadioCardGroup", () => {
  it("노출 술어 거짓(연접 다필지·정밀판정 OFF·다른 지목)이면 질문이 없다", () => {
    for (const over of [{ nblOtherUseParcels: true }, { nblUseDetailedJudgment: false }] as Partial<AssetForm>[]) {
      const { unmount } = mount(asset(over));
      expect(screen.queryByTestId("nbl-other-state-history")).toBeNull();
      unmount();
    }
  });
  it("3개 옵션(바뀐 적 없음·있음·모름) + 질문 앵커 data-field", () => {
    mount(asset());
    for (const m of ["unchanged", "changed", "unknown"]) expect(screen.getByTestId(`nbl-other-state-mode-${m}`)).toBeTruthy();
    expect(has("nblOtherStateHistoryMode")).toBe(true);
    // 미선택("")은 아무 옵션도 체크하지 않는다 — 미입력 ≠ 미해당
    for (const m of ["unchanged", "changed", "unknown"]) expect((screen.getByTestId(`nbl-other-state-mode-${m}`) as HTMLInputElement).checked).toBe(false);
  });
  it("선택 시 onAssetChange({ nblOtherStateHistoryMode })", () => {
    const onChange = vi.fn();
    mount(asset(), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-mode-changed"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherStateHistoryMode: "changed" });
  });
  it("모드별 고정 안내 — 문구는 엔진 상수 단일 소스", () => {
    const { unmount } = mount(asset({ nblOtherStateHistoryMode: "unchanged" }));
    expect(screen.getByTestId("nbl-state-history-unchanged-notice").textContent).toBe(NBL_STATE_HISTORY_UNCHANGED_NOTICE);
    unmount();
    const u = mount(asset({ nblOtherStateHistoryMode: "unknown" }));
    expect(screen.getByTestId("nbl-state-history-unknown-notice").textContent).toBe(NBL_STATE_HISTORY_UNKNOWN_NOTICE);
    u.unmount();
    mount(asset({ nblOtherStateHistoryMode: "changed" }));
    expect(screen.getByTestId("nbl-state-history-applied-notice").textContent).toBe(NBL_STATE_HISTORY_APPLIED_NOTICE);
    expect(screen.getByTestId("nbl-state-history-grace-row-notice").textContent).toBe(NBL_STATE_HISTORY_GRACE_ROW_NOTICE);
  });
});

describe("모드 전환 — 「건축물 있음」 토글 대체·복원", () => {
  it("changed이면 토글을 숨기고 파생 줄이 대신한다 · 그 밖이면 토글이 보인다", () => {
    const { unmount } = mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01")] }));
    expect(screen.queryByTestId("nbl-other-has-building-toggle")).toBeNull();
    expect(screen.getByTestId("nbl-state-history-at-transfer").textContent).toContain("양도일 현재 건축물: 없음");
    unmount();
    mount(asset({ nblOtherStateHistoryMode: "unchanged" }));
    expect(screen.getByTestId("nbl-other-has-building-toggle")).toBeTruthy();
  });
  it("changed → 그 밖: onChange 핸들러가 숨었던 토글에 마지막 파생값을 한 번 써 준다(이벤트 시점 쓰기)", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherHasBuilding: false, nblOtherStateEvents: [built("2021-01-01")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-mode-unchanged"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherStateHistoryMode: "unchanged", nblOtherHasBuilding: true });
  });
  it("그 밖 → changed·그 밖 → 그 밖은 토글값을 건드리지 않는다", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateHistoryMode: "unchanged", nblOtherHasBuilding: true }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-mode-changed"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherStateHistoryMode: "changed" });
  });
  it("changed이면 「재산세 과세 분류」 라벨에 «(양도일 현재)»가 붙는다", () => {
    const { unmount } = mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01")] }));
    expect(screen.getByText("재산세 과세 분류 (양도일 현재)")).toBeTruthy();
    unmount();
    mount(asset({ nblOtherStateHistoryMode: "unchanged" }));
    expect(screen.queryByText("재산세 과세 분류 (양도일 현재)")).toBeNull();
  });
  it("changed이면 «당해 사업개시일» 칸 아래에 이력과 함께 판정한다는 안내가 뜬다(엔진 상수) — 칸은 숨기지 않는다", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01")], nblRevenueBusinessType: "parking_operation" }));
    expect(screen.getByTestId("nbl-state-history-revenue-start-notice").textContent).toBe(NBL_STATE_HISTORY_REVENUE_START_NOTICE);
    expect(has("nblRevenueCurrentBusinessStartDate")).toBe(true);
  });
});

describe("사건 행", () => {
  it("[+ 사건 추가] — 첫 행은 종류·날짜 미선택, 둘째 행은 직전 사건의 반대 종류(날짜는 비워 둔다)", () => {
    const onChange = vi.fn();
    const { unmount } = mount(asset({ nblOtherStateHistoryMode: "changed" }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-add"));
    expect(onChange).toHaveBeenLastCalledWith({ nblOtherStateEvents: [{ kind: "", date: "", propertyTaxTypeBefore: "" }] });
    unmount();
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-add"));
    expect(onChange).toHaveBeenLastCalledWith({ nblOtherStateEvents: [removed("2021-01-01"), { kind: "building_built", date: "", propertyTaxTypeBefore: "" }] });
  });
  it("행 앵커: 종류·날짜 data-field(⑧ 필드 점프 키와 같은 형태)", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2016-01-01"), removed("2021-01-01")] }));
    for (const f of ["nblOtherStateEvents", "nblOtherStateEvents.0.kind", "nblOtherStateEvents.0.date", "nblOtherStateEvents.1.kind", "nblOtherStateEvents.1.date"]) expect(has(f), f).toBe(true);
  });
  it("삭제 — 해당 행만 빠진다", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2016-01-01"), removed("2021-01-01")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-remove"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherStateEvents: [removed("2021-01-01")] });
  });
  it("종류를 바꾸면 철거 직전 재산세 구분을 \"\"로 함께 리셋한다(신축 행에 stale 값이 남지 않게)", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01", "separate")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-kind-built"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherStateEvents: [{ kind: "building_built", date: "2021-01-01", propertyTaxTypeBefore: "" }] });
  });
  it("신축 행에는 «사용승인일과 다를 수 있다 — 확인 필요» 안내(UV-3) · 단정 문구 없음", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2016-01-01")] }));
    const text = document.body.textContent ?? "";
    expect(text).toContain("사용승인일(준공일)과 재산세상 건축물로 보는 첫날이 다를 수 있습니다 — 확인 필요");
  });
});

describe("철거 행의 «철거 직전 그 토지의 재산세 구분»", () => {
  it("철거 행에만 5지선다가 있다(신축 행 없음)", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2016-01-01"), removed("2021-01-01")] }));
    for (const v of ["exempt", "special_sum", "separate", "comprehensive", "unknown"]) expect(screen.getByTestId(`nbl-other-state-event-1-ptax-${v}`), v).toBeTruthy();
    for (const v of ["exempt", "special_sum", "separate", "comprehensive", "unknown"]) expect(screen.queryByTestId(`nbl-other-state-event-0-ptax-${v}`), v).toBeNull();
  });
  it("라벨은 PROPERTY_TAX_TYPE_LABEL 단일 소스 — separate=별도합산 · special_sum=분리과세", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01")] }));
    const label = (v: string) => screen.getByTestId(`nbl-other-state-event-0-ptax-${v}`).closest("label")?.textContent ?? "";
    expect(label("separate")).toContain("별도합산");
    expect(label("special_sum")).toContain("분리과세");
    expect(label("exempt")).toContain("비과세·면제");
    expect(label("comprehensive")).toContain("종합합산");
    expect(label("unknown")).toContain("모름");
  });
  it("저장값 \"\"(모름)은 «모름»이 선택된 것으로 보이고 확인 필요 안내가 뜬다 — 표시 fallback, 값은 쓰지 않는다", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01", "")] }), onChange);
    expect((screen.getByTestId("nbl-other-state-event-0-ptax-unknown") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("nbl-other-state-event-0-ptax-unknown-notice").textContent).toBe(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("선택한 구분은 저장값으로 · «모름»을 고르면 저장값 \"\"", () => {
    const onChange = vi.fn();
    const { unmount } = mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01", "")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-ptax-separate"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherStateEvents: [removed("2021-01-01", "separate")] });
    unmount();
    const onChange2 = vi.fn();
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01", "separate")] }), onChange2);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-ptax-unknown"));
    expect(onChange2).toHaveBeenCalledWith({ nblOtherStateEvents: [removed("2021-01-01", "")] });
  });
  it("구분을 선택하면 «모름» 확인 필요 안내가 사라진다", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01", "separate")] }));
    expect(screen.queryByTestId("nbl-other-state-event-0-ptax-unknown-notice")).toBeNull();
  });
});

describe("미리보기 — 엔진 leaf가 만든 일 단위 구간", () => {
  it("철거 1건(M1 형태): 구간 2개 · 일수 2,556 + 1,095 = 소유기간 3,651 · 이전 구간 요건 충족/마지막 구간 결과 계산 후 확정", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01", "separate")] }));
    const r0 = screen.getByTestId("nbl-state-history-preview-row-0").textContent ?? "";
    const r1 = screen.getByTestId("nbl-state-history-preview-row-1").textContent ?? "";
    expect(r0).toContain("2014-01-02 ~ 2020-12-31");
    expect(r0).toContain("2,556일");
    expect(r0).toContain("있음");
    expect(r0).toContain("별도합산(선언)");
    expect(r0).toContain("충족");
    expect(r1).toContain("2021-01-01 ~ 2023-12-31");
    expect(r1).toContain("1,095일");
    expect(r1).toContain("결과 계산 후 확정");
    expect(screen.getByTestId("nbl-state-history-preview-total").textContent).toContain("합계 3,651일 = 소유기간");
  });
  it("재산세 구분 «모름»(\"\") 철거 구간은 «종합합산(선언 없음 — 확인 필요)» · 요건 미충족", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01", "")] }));
    const r0 = screen.getByTestId("nbl-state-history-preview-row-0").textContent ?? "";
    expect(r0).toContain("종합합산(선언 없음 — 확인 필요)");
    expect(r0).toContain("미충족");
  });
  it("신축 1건: 신축 전 구간은 나대지·종합합산(고정)", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2023-06-01")] }));
    const r0 = screen.getByTestId("nbl-state-history-preview-row-0").textContent ?? "";
    expect(r0).toContain("없음");
    expect(r0).toContain("종합합산(나대지 — 고정)");
    expect(screen.getByTestId("nbl-state-history-at-transfer").textContent).toContain("양도일 현재 건축물: 있음");
  });
  it("사건이 미완성이거나(날짜 빈 칸) 양도일이 없으면 표 대신 안내 — 구간을 지어내지 않는다", () => {
    const { unmount } = mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("")] }));
    expect(screen.queryByTestId("nbl-state-history-preview")).toBeNull();
    expect(screen.getByTestId("nbl-state-history-preview-empty")).toBeTruthy();
    unmount();
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01")] }), vi.fn(), "");
    expect(screen.queryByTestId("nbl-state-history-preview")).toBeNull();
  });
  it("양도일 의제 사유 + changed: 표 대신 «이력을 판정에 쓰지 않음» 고지(엔진 상수)", () => {
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [removed("2021-01-01")], nblDeemedTransferReason: "auction_public_sale" as AssetForm["nblDeemedTransferReason"], nblDeemedTransferDate: "2022-01-01" }));
    expect(screen.getByTestId("nbl-state-history-deemed-notice").textContent).toBe(NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE);
    expect(screen.queryByTestId("nbl-state-history-preview")).toBeNull();
  });
});
