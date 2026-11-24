// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-③ B (UI-B-2) — ⑤ 위젯 anchor: 기타토지 카드 철거 행의 «철거된 건축물 종류»(주택 / 그 밖)·정착면적·조건부 수도권 칸.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.ui.plan.md §4.4 · §9(X25~X34) · §11.1 ⑤ 위젯
 *
 * 무엇을 고정하나: 어느 행에 어느 칸이 보이는가(종류 카드는 철거 행에만) · «그 밖»은 종전 카드와 같다 · «주택»이면 정착면적 칸 + 허용 면적 미리보기, «철거 직전 재산세 구분»은 숨김 ·
 * 수도권 칸은 엔진 술어(와이어 사건 인자)가 참일 때만 · 종류 전환은 행을 지운 키 하나로 쓴다 · 어느 엔진 상수 문구가 나오는가. 판정·허용 면적은 엔진 leaf 값을 읽을 뿐이다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import {
  NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE,
  NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
  NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";

afterEach(cleanup);

type Ev = NblOtherStateEventInput;
const built = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "", ...extra });
const house = (date: string, footprint?: string, extra: Partial<Ev> = {}): Ev => ({
  kind: "building_removed",
  date,
  propertyTaxTypeBefore: "",
  buildingKindBefore: "house",
  ...(footprint === undefined ? {} : { houseFootprintBefore: footprint }),
  ...extra,
});
const otherRemoved = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate", extra: Partial<Ev> = {}): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: before, ...extra });

/** 기타토지(잡종지) 1,000㎡ · 일반주거 · 수도권 밖(5배) · 취득 2014-01-01 · 꼬리 나대지(종합합산) · 이력 «바뀐 적 있음». */
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2014-01-01",
    acquisitionArea: "1000",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblIsMetropolitanArea: "no",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherHasBuilding: false,
    nblOtherStateHistoryMode: "changed",
    ...over,
  }) as AssetForm;

const mount = (a: AssetForm, onChange = vi.fn(), transferDate: string | undefined = "2024-01-01") =>
  render(<OtherLandDetailSection asset={a} onAssetChange={onChange} transferDate={transferDate} />);
const id = (s: string) => screen.queryByTestId(s);
const text = (s: string) => screen.getByTestId(s).textContent;
const checked = (s: string) => (screen.getByTestId(s) as HTMLInputElement).checked;

describe("철거된 건축물 종류 카드 — 철거 행에서만 · 기본 «그 밖» · 겸용주택 안내 · Q-12 hint", () => {
  it("철거 행에만 종류 카드가 있다 — 신축·구분 변경 행에는 없다(종류 칸은 철거 행 전용)", () => {
    mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [built("2015-01-01"), otherRemoved("2021-01-01"), { kind: "tax_type_changed", date: "2022-01-01", propertyTaxTypeBefore: "" }] }));
    expect(id("nbl-other-state-event-0-building-kind-house")).toBeNull();
    expect(id("nbl-other-state-event-1-building-kind-house")).not.toBeNull();
    expect(id("nbl-other-state-event-2-building-kind-house")).toBeNull();
  });

  it("저장 키 부재·`\"\"`는 «그 밖의 건축물»이 선택된 것으로 보인다(표시 fallback = 현행의 뜻) · 종전 «철거 직전 재산세 구분» 카드가 그대로 있고 정착면적 칸·미리보기는 없다", () => {
    mount(asset({ nblOtherStateEvents: [otherRemoved("2021-01-01")] }));
    expect(checked("nbl-other-state-event-0-building-kind-other")).toBe(true);
    expect(checked("nbl-other-state-event-0-building-kind-house")).toBe(false);
    expect(document.body.textContent).toContain("철거 직전 그 토지의 재산세 구분");
    expect(id("nbl-other-state-event-0-footprint")).toBeNull();
    cleanup();
    mount(asset({ nblOtherStateEvents: [otherRemoved("2021-01-01", "separate", { buildingKindBefore: "" })] }));
    expect(checked("nbl-other-state-event-0-building-kind-other")).toBe(true);
  });

  it("종류 카드 안내 = 엔진 상수 `BUILDING_KIND_HINT_NOTICE`(Q-12 (가)) + 겸용주택 안내(주택으로 고르지 않는다 — D-5 · 판정하지 않는다)", () => {
    mount(asset({ nblOtherStateEvents: [otherRemoved("2021-01-01")] }));
    expect(text("nbl-other-state-event-0-building-kind-hint")).toBe(NBL_STATE_HISTORY_BUILDING_KIND_HINT_NOTICE);
    expect(text("nbl-other-state-event-0-building-kind-mixed-use")).toContain("겸용주택");
    expect(text("nbl-other-state-event-0-building-kind-mixed-use")).toContain("「주택」으로 고르지 않습니다");
  });

  it("«주택» 선택은 그 행의 `buildingKindBefore: \"house\"` 하나만 쓴다(정착면적은 비워 둠 — 가정값 없음)", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateEvents: [otherRemoved("2021-01-01", "")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-building-kind-house"));
    expect(onChange).toHaveBeenLastCalledWith({ nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "", buildingKindBefore: "house" }] });
  });

  it("«그 밖» 선택은 종류 키를 **지운다**(종전 행과 같은 모양) — 저장된 정착면적은 지우지 않는다(이력 복원 · ④가 보내지 않는다)", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateEvents: [house("2021-01-01", "200")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-building-kind-other"));
    const next = (onChange.mock.calls.at(-1)![0] as { nblOtherStateEvents: Ev[] }).nblOtherStateEvents[0];
    expect(next).toEqual({ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "200" });
    expect("buildingKindBefore" in next).toBe(false);
  });

  it("㉒ 사건 종류를 «철거 → 신축»으로 바꾸면 행을 재생성해 종류·정착면적 stale을 함께 지운다", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateEvents: [house("2021-01-01", "200")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-kind-built"));
    expect(onChange).toHaveBeenLastCalledWith({ nblOtherStateEvents: [{ kind: "building_built", date: "2021-01-01", propertyTaxTypeBefore: "" }] });
  });
});

describe("«주택» 철거 행 — 정착면적 칸 · 허용 면적 미리보기(엔진 leaf 값) · 재산세 구분 카드 숨김", () => {
  it("«주택»이면 «철거 직전 주택 정착면적» 칸(앵커 `nblOtherStateEvents.{i}.houseFootprintBefore`)이 보이고 «철거 직전 재산세 구분» 카드는 숨는다", () => {
    mount(asset({ nblOtherStateEvents: [house("2021-01-01", "")] }));
    expect(id("nbl-other-state-event-0-footprint")).not.toBeNull();
    expect(document.querySelector('[data-field="nblOtherStateEvents.0.houseFootprintBefore"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("철거 직전 그 토지의 재산세 구분");
    expect(document.querySelector('[data-testid^="nbl-other-state-event-0-ptax-"]')).toBeNull();
  });

  it("정착면적 입력은 그 행의 `houseFootprintBefore`에 쓴다 · 빈칸은 빈칸(미리보기 없음)", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateEvents: [house("2021-01-01", "")] }), onChange);
    expect((screen.getByTestId("nbl-other-state-event-0-footprint") as HTMLInputElement).value).toBe("");
    expect(id("nbl-other-state-event-0-footprint-preview")).toBeNull();
    fireEvent.change(screen.getByTestId("nbl-other-state-event-0-footprint"), { target: { value: "200" } });
    expect(onChange).toHaveBeenLastCalledWith({ nblOtherStateEvents: [house("2021-01-01", "200")] });
  });

  it("이내(200㎡ × 5배 = 1,000㎡ ≥ 토지 1,000㎡): 허용 면적 미리보기 · 초과 고지 없음 · 구간표에 «있음(주택)» 행 + 배율 판정", () => {
    mount(asset({ nblOtherStateEvents: [house("2021-01-01", "200")] }));
    const t = text("nbl-other-state-event-0-footprint-preview")!;
    expect(t).toContain("정착면적 200㎡");
    expect(t).toContain("허용 면적 1,000㎡");
    expect(t).toContain("배율 이내");
    expect(id("nbl-other-state-event-0-footprint-exceeded-notice")).toBeNull();
    expect(text("nbl-state-history-preview-row-0")).toContain("있음(주택)");
    expect(text("nbl-state-history-preview-row-0")).toContain("충족");
    expect(document.body.textContent).toContain("재산세 구분 · 배율 판정");
  });

  it("초과(199.99㎡ × 5배 = 999.95㎡ < 1,000㎡ → 초과 0.05㎡): «초과 0.05㎡ … 이 구간 전체를 비사업용» + 엔진 `HOUSE_EXCEEDED_NOTICE`", () => {
    mount(asset({ nblOtherStateEvents: [house("2021-01-01", "199.99")] }));
    const t = text("nbl-other-state-event-0-footprint-preview")!;
    expect(t).toContain("초과 0.05㎡");
    expect(t).toContain("전체를 비사업용");
    expect(text("nbl-other-state-event-0-footprint-exceeded-notice")).toBe(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
    expect(text("nbl-state-history-preview-row-0")).toContain("미충족");
  });

  it("수도권 «예»면 같은 200㎡가 3배(허용 600㎡) 초과 — 미리보기·고지가 따라 바뀐다(판정 맥락 = ④가 보내는 값)", () => {
    mount(asset({ nblIsMetropolitanArea: "yes", nblOtherStateEvents: [house("2021-01-01", "200")] }));
    expect(text("nbl-other-state-event-0-footprint-preview")).toContain("허용 면적 600㎡");
    expect(text("nbl-other-state-event-0-footprint-preview")).toContain("초과 400㎡");
  });

  it("정착면적 > 토지 면적 → 칸 오류(⑧ H9와 같은 leaf · 주체 «건축물») · 미리보기 없음 · 구간표도 그리지 않는다(판정과 어긋난 표 금지) · 빈칸은 오류를 띄우지 않는다", () => {
    mount(asset({ nblOtherStateEvents: [house("2021-01-01", "1200")] }));
    expect(text("nbl-other-state-event-0-footprint-error")).toContain("토지 면적(1000㎡)보다 큽니다");
    expect(text("nbl-other-state-event-0-footprint-error")).toContain("건축물 사건 1번째 행");
    expect(id("nbl-other-state-event-0-footprint-preview")).toBeNull();
    expect(id("nbl-state-history-preview-empty")).not.toBeNull();
    cleanup();
    mount(asset({ nblOtherStateEvents: [house("2021-01-01", "")] }));
    expect(id("nbl-other-state-event-0-footprint-error")).toBeNull();
  });

  it("고지: 주택 구간이 있으면 DAYWISE·HOUSE_BEFORE(엔진 `houseIntervalNotices`와 같은 상수) · 없으면 종전 고지만 · 초과 + 철거 후 9호 유예 행 → `HOUSE_EXCEEDED_GRACE`", () => {
    mount(asset({ nblOtherStateEvents: [house("2021-01-01", "200")] }));
    expect(text("nbl-state-history-daywise-notice")).toBe(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE);
    expect(text("nbl-state-history-house-before-notice")).toBe(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
    expect(id("nbl-state-history-house-exceeded-grace-notice")).toBeNull();
    cleanup();
    mount(asset({ nblOtherStateEvents: [house("2021-01-01", "100")], nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2021-01-01" }] as AssetForm["nblGracePeriods"] }));
    expect(text("nbl-state-history-house-exceeded-grace-notice")).toBe(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
    cleanup();
    mount(asset({ nblOtherStateEvents: [otherRemoved("2021-01-01")] }));
    expect(id("nbl-state-history-daywise-notice"), "«그 밖» 철거 행만 있으면 주택 구간 고지 없음(종전과 같다)").toBeNull();
    expect(id("nbl-state-history-house-before-notice")).toBeNull();
  });
});

describe("수도권 칸 — 엔진 술어(와이어 사건 인자)가 참일 때만 · 카드 단위 1개", () => {
  it("주·상·공 + «주택» 철거 행 → 수도권 칸 노출(앵커 `nblIsMetropolitanArea`) · 사건 행 목록 뒤", () => {
    mount(asset({ nblIsMetropolitanArea: "", nblOtherStateEvents: [house("2021-01-01", "200")] }));
    expect(id("nbl-house-prior-metro")).not.toBeNull();
    const metro = document.querySelector('[data-field="nblIsMetropolitanArea"]')!;
    const add = screen.getByTestId("nbl-other-state-event-add");
    expect(add.compareDocumentPosition(metro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("주택 철거 행이 둘이어도 칸은 하나(철거 행마다 아님)", () => {
    mount(asset({ nblOtherStateEvents: [house("2016-01-01", "200"), built("2018-01-01"), house("2021-01-01", "200")] }));
    expect(document.querySelectorAll('[data-field="nblIsMetropolitanArea"]')).toHaveLength(1);
  });

  it.each([
    ["«그 밖» 철거 행", { nblOtherStateEvents: [otherRemoved("2021-01-01")] }],
    ["철거 행 없음(신축만)", { nblOtherHasBuilding: true, nblOtherStateEvents: [built("2021-01-01")] }],
    ["녹지(수도권이 배율을 가르지 않는 용도지역)", { nblZoneType: "green" as const, nblOtherStateEvents: [house("2021-01-01", "200")] }],
    ["도시지역 밖(관리지역)", { nblZoneType: "management" as const, nblOtherStateEvents: [house("2021-01-01", "200")] }],
    ["모드 `unchanged` + stale 주택 행(X27 — wire events `[]`)", { nblOtherStateHistoryMode: "unchanged" as const, nblOtherStateEvents: [house("2021-01-01", "200")] }],
    ["모드 `unknown` + stale 주택 행", { nblOtherStateHistoryMode: "unknown" as const, nblOtherStateEvents: [house("2021-01-01", "200")] }],
  ])("수도권 칸 없음 — %s", (_n, over) => {
    mount(asset(over as Partial<AssetForm>));
    expect(id("nbl-house-prior-metro")).toBeNull();
    expect(document.querySelector('[data-field="nblIsMetropolitanArea"]')).toBeNull();
  });

  it("수도권 선택은 `nblIsMetropolitanArea`에 쓴다(기존 `MetropolitanAreaField` — 배율 배지는 엔진 표에서 파생)", () => {
    const onChange = vi.fn();
    mount(asset({ nblIsMetropolitanArea: "", nblOtherStateEvents: [house("2021-01-01", "200")] }), onChange);
    fireEvent.click(screen.getByLabelText("수도권"));
    expect(onChange).toHaveBeenLastCalledWith({ nblIsMetropolitanArea: "yes" });
  });
});

describe("양도일 의제(§168의14②) 사유 + 주택 철거 행 — 기존 의제 안내 · 미리보기 없음 · 정착면적 오류 표시 없음(엔진이 이력을 읽지 않는다 — UQ-12 (가))", () => {
  it("의제 안내만 보이고 정착면적 오류(> 토지)도 띄우지 않는다", () => {
    mount(asset({ nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2020-01-01", nblOtherStateEvents: [house("2021-01-01", "1200")] } as Partial<AssetForm>));
    expect(id("nbl-state-history-deemed-notice")).not.toBeNull();
    expect(id("nbl-other-state-event-0-footprint-error")).toBeNull();
    expect(id("nbl-state-history-preview")).toBeNull();
  });
});

describe("연접 다필지 ON(기타토지 칸) — 이력 섹션 자체가 없다(X29) · OFF·종전 입력은 변화 없다", () => {
  it("연접 다필지면 질문·행·수도권 칸 모두 비노출", () => {
    mount(asset({ nblOtherUseParcels: true, nblOtherStateEvents: [house("2021-01-01", "200")] }));
    expect(id("nbl-other-state-history")).toBeNull();
    expect(id("nbl-house-prior-metro")).toBeNull();
  });

  it("종류 칸이 없는 종전 철거 행(별도합산 위장)의 DOM은 정착면적·수도권·주택 고지가 없고 종전 «철거 직전 재산세 구분» 카드가 있다(B7)", () => {
    mount(asset({ nblOtherStateEvents: [otherRemoved("2021-01-01", "separate")] }));
    expect(id("nbl-other-state-event-0-footprint")).toBeNull();
    expect(id("nbl-house-prior-metro")).toBeNull();
    expect(id("nbl-state-history-house-before-notice")).toBeNull();
    expect(document.body.textContent).toContain("철거 직전 그 토지의 재산세 구분");
  });
});
