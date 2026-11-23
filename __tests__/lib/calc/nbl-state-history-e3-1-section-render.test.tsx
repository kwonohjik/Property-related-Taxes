// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-① (U4) — ⑤ 위젯 anchor: 사건 종류 3종(`tax_type_changed` 추가) · «변경 직전 재산세 구분» · 토글 노출 규칙 · «변경 후» 줄 · 비차단 안내 · 질문 문구 확장.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1-tax-type-change.ui.plan.md §4.2 · §8.2 · 결정 기록(2026-11-23)
 *
 * 침묵 오동작 방어(계획 §1.2 S1~S5·S13): 컴파일러가 못 잡는 «종류가 둘뿐이다» 가정 — `addEvent` 기본 종류(S1) · 「양도일 현재 건축물」 줄(S2·S5) ·
 * 직전 구분 칸 노출(S4) · 「건축물 있음」 토글 숨김(S13)이 재산세 변경 행 앞에서 틀리지 않는지 행 단위로 고정한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { STATE_EVENT_KIND_LABEL } from "@/lib/tax-engine/non-business-land/other-land-state-history";

afterEach(cleanup);

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2014-01-01",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherStateHistoryMode: "changed",
    ...over,
  }) as AssetForm;

type Ev = AssetForm["nblOtherStateEvents"][number];
const mount = (a: AssetForm, onChange = vi.fn(), transferDate: string | undefined = "2024-01-01") =>
  render(<OtherLandDetailSection asset={a} onAssetChange={onChange} transferDate={transferDate} />);
const tax = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate"): Ev => ({ kind: "tax_type_changed", date, propertyTaxTypeBefore: before });
const removed = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate"): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: before });
const built = (date: string): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "" });
const PTAX = ["exempt", "special_sum", "separate", "comprehensive", "unknown"] as const;
const text = (id: string) => screen.getByTestId(id).textContent ?? "";

describe("종류 3종 라디오 · 행 카드 제목", () => {
  it("3번째 종류 «재산세 과세 구분 변경» 라디오가 있다(라벨 = 엔진 표 단일 소스) · 기존 testid 불변", () => {
    mount(asset({ nblOtherStateEvents: [tax("2022-06-01")] }));
    for (const k of ["built", "removed", "taxchange"]) expect(screen.getByTestId(`nbl-other-state-event-0-kind-${k}`), k).toBeTruthy();
    expect(screen.getByTestId("nbl-other-state-event-0-kind-taxchange").closest("label")?.textContent).toContain(STATE_EVENT_KIND_LABEL.tax_type_changed);
    expect((screen.getByTestId("nbl-other-state-event-0-kind-taxchange") as HTMLInputElement).checked).toBe(true);
  });
  it("행 카드 제목: 재산세 변경 행 = «재산세 과세 구분 변경» · 건축물 행 = «건축물 사건»(불변)", () => {
    mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [built("2016-01-01"), tax("2022-06-01")] }));
    const body = document.body.textContent ?? "";
    expect(body).toContain("건축물 사건");
    // 카드 제목(ToneCard `<p>`) — 재산세 변경 행만 종류 라벨, 건축물 행은 «건축물 사건»
    const titles = [...document.querySelectorAll("p")].map((p) => p.textContent).filter((t) => t === "건축물 사건" || t === STATE_EVENT_KIND_LABEL.tax_type_changed);
    expect(titles).toEqual(["건축물 사건", STATE_EVENT_KIND_LABEL.tax_type_changed]);
  });
  it("종류를 3번째로 바꾸면 직전 구분을 \"\"로 함께 리셋(철거 → 구분 변경 전환 시 재선택) · 날짜는 유지", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateEvents: [removed("2021-01-01", "separate")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-kind-taxchange"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2021-01-01", propertyTaxTypeBefore: "" }] });
  });
  it("사건일 hint: 재산세 변경 행은 «바뀐 과세 구분이 적용되기 시작한 첫날» · 건축물 행 hint는 불변", () => {
    mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [built("2016-01-01"), tax("2022-06-01")] }));
    const body = document.body.textContent ?? "";
    expect(body).toContain("바뀐 과세 구분이 적용되기 시작한 첫날입니다");
    expect(body).toContain("사용승인일(준공일)과 재산세상 건축물로 보는 첫날이 다를 수 있습니다 — 확인 필요");
  });
});

describe("«직전 재산세 구분» 칸 — 노출 술어 `eventCarriesTaxTypeBefore` (S4)", () => {
  it("재산세 변경 행에도 5지선다가 있고 라벨은 «변경 직전…» · 철거 행은 «철거 직전…»(불변) · 신축 행에는 없다", () => {
    mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [built("2016-01-01"), tax("2018-01-01"), removed("2021-01-01")] }));
    for (const v of PTAX) {
      expect(screen.getByTestId(`nbl-other-state-event-1-ptax-${v}`), `변경 ${v}`).toBeTruthy();
      expect(screen.getByTestId(`nbl-other-state-event-2-ptax-${v}`), `철거 ${v}`).toBeTruthy();
      expect(screen.queryByTestId(`nbl-other-state-event-0-ptax-${v}`), `신축 ${v}`).toBeNull();
    }
    const body = document.body.textContent ?? "";
    expect(body).toContain("변경 직전 그 토지의 재산세 구분");
    expect(body).toContain("철거 직전 그 토지의 재산세 구분");
  });
  it("재산세 변경 행의 data-field 앵커 = `nblOtherStateEvents.{i}.propertyTaxTypeBefore`(철거 행과 같은 키 재사용)", () => {
    mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [tax("2022-06-01")] }));
    expect(document.querySelector('[data-field="nblOtherStateEvents.0.propertyTaxTypeBefore"]')).not.toBeNull();
  });
  it("선택은 저장값으로 · «모름» 표시 fallback(저장 \"\" → 모름 선택 · 값을 쓰지 않는다)", () => {
    const onChange = vi.fn();
    const { unmount } = mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [tax("2022-06-01", "")] }), onChange);
    expect((screen.getByTestId("nbl-other-state-event-0-ptax-unknown") as HTMLInputElement).checked).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-ptax-separate"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherStateEvents: [tax("2022-06-01", "separate")] });
    unmount();
    const onChange2 = vi.fn();
    mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [tax("2022-06-01", "separate")] }), onChange2);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-ptax-unknown"));
    expect(onChange2).toHaveBeenCalledWith({ nblOtherStateEvents: [tax("2022-06-01", "")] });
  });
  it("«모름» 안내는 종류별 엔진 상수 — 변경 행 = TAX_CHANGE_UNKNOWN · 철거 행 = REMOVED_TAX_TYPE_UNKNOWN(불변)", () => {
    mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [tax("2018-01-01", ""), removed("2021-01-01", "")] }));
    expect(text("nbl-other-state-event-0-ptax-unknown-notice")).toBe(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
    expect(text("nbl-other-state-event-1-ptax-unknown-notice")).toBe(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
  });
});

describe("「건축물 있음」 토글 노출 규칙 (S13 · 사용자 결정: 건축물 사건 ≥ 1건일 때만 숨김)", () => {
  it("changed + 행 0건 · 재산세 변경만 있는 이력(건축물 사건 0건)이면 토글이 보인다 — 건축물 유무를 받을 곳이 이 토글뿐", () => {
    const { unmount } = mount(asset({ nblOtherStateEvents: [] }));
    expect(screen.getByTestId("nbl-other-has-building-toggle")).toBeTruthy();
    unmount();
    const u2 = mount(asset({ nblOtherStateEvents: [tax("2022-06-01")] }));
    expect(screen.getByTestId("nbl-other-has-building-toggle")).toBeTruthy();
    expect(screen.queryByTestId("nbl-state-history-at-transfer")).toBeNull(); // 줄 대신 토글
    u2.unmount();
    mount(asset({ nblOtherStateEvents: [tax("2018-01-01"), tax("2022-06-01", "comprehensive")] }));
    expect(screen.getByTestId("nbl-other-has-building-toggle")).toBeTruthy();
  });
  it("건축물 사건이 1건이라도 있으면 토글을 숨긴다(재산세 변경이 섞여 있어도) — 종류 미선택 행만 있으면 건축물 사건이 아니라 토글이 보인다", () => {
    const { unmount } = mount(asset({ nblOtherStateEvents: [tax("2018-01-01"), removed("2021-01-01")] }));
    expect(screen.queryByTestId("nbl-other-has-building-toggle")).toBeNull();
    unmount();
    const u2 = mount(asset({ nblOtherStateEvents: [built("2016-01-01"), tax("2022-06-01")] }));
    expect(screen.queryByTestId("nbl-other-has-building-toggle")).toBeNull();
    u2.unmount();
    mount(asset({ nblOtherStateEvents: [{ kind: "", date: "", propertyTaxTypeBefore: "" }] }));
    expect(screen.getByTestId("nbl-other-has-building-toggle")).toBeTruthy();
  });
  it("tax-only 이력에서 토글을 켜면 저장값이 바뀐다(`nblOtherHasBuilding`) — 숨은 토글이 아니다", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [tax("2022-06-01")] }), onChange);
    fireEvent.click(within(screen.getByTestId("nbl-other-has-building-toggle")).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherHasBuilding: true });
  });
});

describe("「양도일 현재 건축물」 줄 — 마지막 «건축물 사건» 기준 (S2·S5)", () => {
  it("신축 → 재산세 변경: 마지막 행이 재산세 변경이어도 «있음»(마지막 건축물 사건 = 신축) — 마지막 행을 읽으면 «없음»으로 틀린다", () => {
    mount(asset({ nblOtherStateEvents: [built("2016-01-01"), tax("2022-06-01")] }));
    const t = text("nbl-state-history-at-transfer");
    expect(t).toContain("양도일 현재 건축물: 있음");
    expect(t).toContain(`마지막 건축물 사건: ${STATE_EVENT_KIND_LABEL.building_built}`);
  });
  it("재산세 변경 → 철거: «없음»(마지막 건축물 사건 = 철거)", () => {
    mount(asset({ nblOtherStateEvents: [tax("2019-01-01"), removed("2021-01-01", "comprehensive")] }));
    expect(text("nbl-state-history-at-transfer")).toContain("양도일 현재 건축물: 없음");
  });
  it("건축물 사건이 있는데 미완성 행이 있으면 안내만(유무를 지어내지 않는다)", () => {
    mount(asset({ nblOtherStateEvents: [built("2016-01-01"), { kind: "", date: "", propertyTaxTypeBefore: "" }] }));
    expect(text("nbl-state-history-at-transfer")).toContain("사건 종류를 모두 선택하면");
  });
});

describe("[+ 사건 추가] 기본 종류 — 직전 «건축물 사건»의 반대 (S1)", () => {
  const added = (events: Ev[]) => {
    const onChange = vi.fn();
    mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: events }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-add"));
    return (onChange.mock.lastCall![0] as { nblOtherStateEvents: Ev[] }).nblOtherStateEvents.at(-1)!;
  };
  it("[신축, 재산세 변경] 다음 행 = 철거(재산세 행은 건너뛴다 — 신축 뒤 신축은 ⑧이 막는 같은 종류 연속)", () => {
    expect(added([built("2016-01-01"), tax("2022-06-01")]).kind).toBe("building_removed");
  });
  it("[철거, 신축, 재산세 변경] 다음 행 = 철거", () => {
    expect(added([removed("2016-01-01", "separate"), built("2018-01-01"), tax("2022-06-01")]).kind).toBe("building_removed");
  });
  it("건축물 사건이 없으면(재산세 변경만) 미선택 · 날짜·직전 구분은 비워 둔다(자동 채움 금지)", () => {
    expect(added([tax("2022-06-01")])).toEqual({ kind: "", date: "", propertyTaxTypeBefore: "" });
  });
  it("직전 행이 종류 미선택이면 미선택(기존 동작 불변)", () => {
    expect(added([built("2016-01-01"), { kind: "", date: "", propertyTaxTypeBefore: "" }]).kind).toBe("");
  });
});

describe("«변경 후» 줄 · 비차단 «같은 구분» 안내 (UQ-3 (가))", () => {
  it("M12 형태: 변경 직전 = 별도합산 · 꼬리 = 종합합산 → «변경 후: 종합합산(양도일 현재 선언 기준)» · 같은 구분 안내 없음", () => {
    mount(asset({ nblOtherHasBuilding: true, nblOtherPropertyTaxType: "comprehensive", nblOtherStateEvents: [tax("2022-06-01", "separate")] }));
    expect(text("nbl-other-state-event-0-after")).toContain("변경 후: 종합합산(양도일 현재 선언 기준)");
    expect(screen.queryByTestId("nbl-other-state-event-0-same-notice")).toBeNull();
  });
  it("변경 전 = 변경 후(같은 구분) → amber 안내가 뜨지만 막지 않는다(저장값 쓰기 없음)", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherHasBuilding: true, nblOtherPropertyTaxType: "separate", nblOtherStateEvents: [tax("2022-06-01", "separate")] }), onChange);
    expect(text("nbl-other-state-event-0-same-notice")).toContain("변경 전후 구분이 같습니다. 바뀐 적이 없으면 이 행을 삭제하세요.");
    expect(onChange).not.toHaveBeenCalled();
  });
  it("재산세 변경이 연속인 중간 행: 변경 후 = 다음 행의 변경 직전 구분(선언)", () => {
    mount(asset({ nblOtherHasBuilding: true, nblOtherPropertyTaxType: "comprehensive", nblOtherStateEvents: [tax("2016-01-01", "exempt"), tax("2018-01-01", "special_sum")] }));
    expect(text("nbl-other-state-event-0-after")).toContain("변경 후: 분리과세(선언)");
    expect(text("nbl-other-state-event-1-after")).toContain("변경 후: 종합합산(양도일 현재 선언 기준)");
  });
  it("변경 직전이 «모름»이면 같은 구분 비교를 하지 않는다 · 변경 후가 «모름»(다음 행 직전 구분 모름)이어도 비교하지 않는다", () => {
    const { unmount } = mount(asset({ nblOtherHasBuilding: true, nblOtherPropertyTaxType: "comprehensive", nblOtherStateEvents: [tax("2022-06-01", "")] }));
    expect(screen.queryByTestId("nbl-other-state-event-0-same-notice")).toBeNull();
    unmount();
    mount(asset({ nblOtherHasBuilding: true, nblOtherPropertyTaxType: "comprehensive", nblOtherStateEvents: [tax("2016-01-01", "separate"), tax("2018-01-01", "")] }));
    expect(text("nbl-other-state-event-0-after")).toContain("종합합산(선언 없음 — 확인 필요)");
    expect(screen.queryByTestId("nbl-other-state-event-0-same-notice")).toBeNull();
  });
  it("E3-1b 의도된 반전: 건축물 없는 구간의 구분 변경도 미리보기가 그려진다(⑧ 차단 규칙 삭제 — 나대지 선언) — «변경 후» 줄이 있고 «미리보기 없음» 안내는 없다", () => {
    mount(asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [tax("2022-06-01", "separate")] }));
    expect(screen.queryByTestId("nbl-other-state-event-0-after")).not.toBeNull();
    expect(screen.queryByTestId("nbl-state-history-preview-empty")).toBeNull();
  });
});

describe("한정 고지 — 결과 경고와 같은 문구(엔진은 구분 변경 사건이 있으면 종전 고지를 «대체»)", () => {
  it("재산세 변경 사건이 있으면 TAX_CHANGE_APPLIED 한 문구만 · 건축물 사건만이면 종전 APPLIED(불변)", () => {
    const { unmount } = mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [tax("2022-06-01")] }));
    expect(text("nbl-state-history-applied-notice")).toBe(NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE);
    unmount();
    mount(asset({ nblOtherStateEvents: [removed("2021-01-01")] }));
    expect(text("nbl-state-history-applied-notice")).toBe(NBL_STATE_HISTORY_APPLIED_NOTICE);
  });
});

describe("질문 문구 확장 (UQ-2 (가)) — 새 필수 칸 없음", () => {
  it("질문 라벨·옵션 설명이 «재산세 과세 구분»을 포함하고 옵션 testid·개수는 불변(3지선다)", () => {
    mount(asset({ nblOtherStateHistoryMode: "" }));
    const body = document.body.textContent ?? "";
    expect(body).toContain("재산세 과세 구분(고지서의 과세구분)이 바뀐 적이 있습니까?");
    expect(body).toContain("재산세 과세 구분도 같았습니다");
    expect(body).toContain("재산세 과세 구분이 바뀐 적이 있습니다 — 아래에 사건을 입력합니다");
    for (const m of ["unchanged", "changed", "unknown"]) expect(screen.getByTestId(`nbl-other-state-mode-${m}`)).toBeTruthy();
    expect(document.querySelectorAll('[data-field="nblOtherStateHistoryMode"] input[type="radio"]')).toHaveLength(3);
  });
  it("첫 행 종류 hint에 «건축물이 없던 기간에는 입력할 수 없습니다» 안내가 덧붙는다", () => {
    mount(asset({ nblOtherStateEvents: [removed("2021-01-01")] }));
    expect(document.body.textContent).toContain("건축물이 없던 기간에는 입력할 수 없습니다(나대지는 종합합산으로 봅니다)");
  });
});
