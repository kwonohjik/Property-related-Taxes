// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-1b — ⑤ 위젯 anchor: 나대지 구간을 닫는 사건 행(신축 · 건축물 없는 구간의 구분 변경)의 «구분 → 근거 → 공지상태 면적한도» 카드 · 접힘·수용 고지 · 미리보기 문구.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1b-bare-land-tax-type.ui.plan.md §5 · «결정 기록 (2026-11-23 사용자)»
 *
 * 고지·접힘 판정은 엔진 leaf(`resolveBareDeclaration`)·상수를 그대로 읽는다 — 위젯이 새로 짓지 않는다. 이 파일은 «어느 행에 어느 칸이 보이는가 · 값을 어디에 쓰는가 · 어느 문구가 나오는가»를 고정한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

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
    nblOtherHasBuilding: true,
    ...over,
  }) as AssetForm;

type Ev = AssetForm["nblOtherStateEvents"][number];
const mount = (a: AssetForm, onChange = vi.fn(), transferDate: string | undefined = "2024-01-01") =>
  render(<OtherLandDetailSection asset={a} onAssetChange={onChange} transferDate={transferDate} />);
const built = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "", ...extra });
const removed = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate"): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: before });
const tax = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate", extra: Partial<Ev> = {}): Ev => ({ kind: "tax_type_changed", date, propertyTaxTypeBefore: before, ...extra });
const id = (s: string) => screen.queryByTestId(s);
const checked = (s: string) => (screen.getByTestId(s) as HTMLInputElement).checked;
const R1_BASIS = { propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" } as const;

describe("신축 행 — «신축 직전 나대지 기간의 재산세 구분» 4지선다(모름 없음 · 기본 = 종합합산)", () => {
  it("선언이 없는 신축 행(\"\")은 «종합합산»이 선택된 것으로 보이고 근거·한도·고지 카드는 없다 — 선언 없음 = 고지 없음", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01")] }));
    expect(checked("nbl-other-state-event-0-ptax-comprehensive")).toBe(true);
    expect(id("nbl-other-state-event-0-ptax-unknown")).toBeNull();
    expect(document.querySelector('[data-testid^="nbl-other-state-event-0-basis-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="nbl-other-state-event-0-limit-"]')).toBeNull();
    expect(id("nbl-other-state-event-0-bare-unconfirmed-notice")).toBeNull();
    expect(id("nbl-other-state-event-0-ptax-unknown-notice"), "신축 행에는 «모름» 고지가 없다(주장 없음)").toBeNull();
    expect(document.body.textContent).toContain("신축 직전 나대지 기간의 재산세 구분");
  });

  it("별도합산을 고르면 구분을 쓰고 근거·한도를 비운다(onChange 시점 쓰기) · 종합합산으로 되돌리면 `\"\"`(선언 없음)", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateEvents: [built("2023-06-01")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-ptax-separate"));
    expect(onChange).toHaveBeenLastCalledWith({
      nblOtherStateEvents: [built("2023-06-01", { propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "", areaWithinLimitBefore: "" })],
    });
    cleanup();
    const onChange2 = vi.fn();
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", R1_BASIS)] }), onChange2);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-ptax-comprehensive"));
    expect(onChange2).toHaveBeenLastCalledWith({
      nblOtherStateEvents: [built("2023-06-01", { propertyTaxTypeBefore: "", propertyTaxBasisBefore: "", areaWithinLimitBefore: "" })],
    });
  });

  it("비종합합산 선언이면 근거 카드가 뜬다 — 별도합산 = 공지상태 · 모름(철거ㆍ멸실 없음) / 분리과세 = 분리과세대상 · 모름 / 비과세 = 비과세·면제 · 모름 (엔진 `eventBasisOptions` 단일 소스)", () => {
    const opts = (before: Ev["propertyTaxTypeBefore"]) => {
      cleanup();
      mount(asset({ nblOtherStateEvents: [built("2023-06-01", { propertyTaxTypeBefore: before })] }));
      return ["statutory_exempt", "separate_taxation", "vacant_state", "demolished", "unknown"].filter((b) => id(`nbl-other-state-event-0-basis-${b}`));
    };
    expect(opts("separate")).toEqual(["vacant_state", "unknown"]);
    expect(opts("special_sum")).toEqual(["separate_taxation", "unknown"]);
    expect(opts("exempt")).toEqual(["statutory_exempt", "unknown"]);
    expect(opts("comprehensive")).toEqual([]);
    expect(opts("")).toEqual([]);
  });

  it("근거 미선택·모름이면 amber 접힘 고지(엔진 상수) · 근거를 고르면 사라지고 «수용» 고지로 바뀐다 — 분리과세 근거는 면적한도를 묻지 않는다", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", { propertyTaxTypeBefore: "special_sum" })] }));
    expect(text("nbl-other-state-event-0-bare-unconfirmed-notice")).toBe(NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE);
    cleanup();
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", { propertyTaxTypeBefore: "special_sum", propertyTaxBasisBefore: "unknown" })] }));
    expect(text("nbl-other-state-event-0-bare-unconfirmed-notice")).toBe(NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE);
    cleanup();
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", { propertyTaxTypeBefore: "special_sum", propertyTaxBasisBefore: "separate_taxation" })] }));
    expect(id("nbl-other-state-event-0-bare-unconfirmed-notice")).toBeNull();
    expect(text("nbl-other-state-event-0-bare-accepted-notice")).toBe(NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE);
    expect(document.querySelector('[data-testid^="nbl-other-state-event-0-limit-"]')).toBeNull();
  });

  it("근거를 고르면 쓰고 면적한도를 비운다", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", { propertyTaxTypeBefore: "separate", areaWithinLimitBefore: "exceeded" })] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-basis-vacant_state"));
    expect(onChange).toHaveBeenLastCalledWith({
      nblOtherStateEvents: [built("2023-06-01", { propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "" })],
    });
  });

  it("근거 = 공지상태이면 면적한도 3지선다가 뜬다 — 미선택·일부 초과·모름 = 면적한도 접힘 고지 · 한도 이내 = 수용 고지(접힘 고지 없음)", () => {
    for (const limit of [undefined, "exceeded", "unknown"] as const) {
      cleanup();
      mount(asset({ nblOtherStateEvents: [built("2023-06-01", { ...R1_BASIS, areaWithinLimitBefore: limit })] }));
      for (const v of ["within", "exceeded", "unknown"]) expect(id(`nbl-other-state-event-0-limit-${v}`), `${limit} ${v}`).not.toBeNull();
      expect(text("nbl-other-state-event-0-bare-area-notice"), String(limit)).toBe(NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE);
      expect(id("nbl-other-state-event-0-bare-accepted-notice"), "면적한도로 접힌 구간에는 수용 고지를 내지 않는다").toBeNull();
      expect(id("nbl-other-state-event-0-bare-unconfirmed-notice")).toBeNull();
    }
    cleanup();
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", R1_BASIS)] }));
    expect(checked("nbl-other-state-event-0-limit-within")).toBe(true);
    expect(id("nbl-other-state-event-0-bare-area-notice")).toBeNull();
    expect(text("nbl-other-state-event-0-bare-accepted-notice")).toBe(NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE);
  });

  it("선택지에 없는 stale 근거(구분을 바꿔 맞지 않게 된 값)는 «미선택»으로 보인다 — 전송형(④)과 같은 값", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", { propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "separate_taxation" })] }));
    expect(checked("nbl-other-state-event-0-basis-vacant_state")).toBe(false);
    expect(checked("nbl-other-state-event-0-basis-unknown")).toBe(false);
    expect(id("nbl-other-state-event-0-bare-unconfirmed-notice")).not.toBeNull();
  });

  it("종류를 바꾸면 행을 {kind·date·직전 구분 \"\"}로 다시 만들어 근거·면적한도 키까지 지운다(stale 방지 · 선언이 없던 행은 키가 없는 채로 남는다)", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", R1_BASIS)] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-kind-removed"));
    expect(onChange).toHaveBeenLastCalledWith({ nblOtherStateEvents: [{ kind: "building_removed", date: "2023-06-01", propertyTaxTypeBefore: "" }] });
  });

  it("data-field 앵커 = `nblOtherStateEvents.{i}.propertyTaxTypeBefore|propertyTaxBasisBefore|areaWithinLimitBefore`", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", R1_BASIS)] }));
    for (const f of ["propertyTaxTypeBefore", "propertyTaxBasisBefore", "areaWithinLimitBefore"]) {
      expect(document.querySelector(`[data-field="nblOtherStateEvents.0.${f}"]`), f).not.toBeNull();
    }
  });
});

describe("재산세 과세 구분 변경 행 — 나대지 위(건축물 토글 off · 철거 뒤)는 나대지 선언 카드, 건축물 위는 종전 5지선다", () => {
  it("tax-only + 토글 off: «변경 직전 나대지 기간의 재산세 구분» 5지선다(모름 포함 — `\"\"` = 모름) + 근거 카드 · 토글 on: 종전 «변경 직전 그 토지의 재산세 구분»(근거 카드 없음)", () => {
    mount(asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [tax("2022-06-01", "separate")] }));
    expect(document.body.textContent).toContain("변경 직전 나대지 기간의 재산세 구분");
    expect(id("nbl-other-state-event-0-ptax-unknown")).not.toBeNull();
    expect(id("nbl-other-state-event-0-basis-vacant_state")).not.toBeNull();
    cleanup();
    mount(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [tax("2022-06-01", "separate")] }));
    expect(document.body.textContent).toContain("변경 직전 그 토지의 재산세 구분");
    expect(document.body.textContent).not.toContain("변경 직전 나대지 기간의 재산세 구분");
    expect(id("nbl-other-state-event-0-basis-vacant_state")).toBeNull();
  });

  it("나대지 위 구분 변경 행의 «모름»(\"\")은 종전 모름 고지(`TAX_CHANGE_UNKNOWN`)를 보이고 근거 카드는 없다", () => {
    mount(asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [tax("2022-06-01", "")] }));
    expect(checked("nbl-other-state-event-0-ptax-unknown")).toBe(true);
    expect(text("nbl-other-state-event-0-ptax-unknown-notice")).toBe(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
    expect(id("nbl-other-state-event-0-basis-vacant_state")).toBeNull();
  });

  it("철거 → 신축 → 구분 변경: 철거 행 = 종전 5지선다 · 신축 행 = 나대지 선언 · 신축 뒤 구분 변경(건축물 있음) = 종전 5지선다 — 행마다 leaf 술어가 갈래를 정한다", () => {
    mount(asset({ nblOtherStateEvents: [removed("2018-01-01"), built("2020-01-01"), tax("2022-06-01")] }));
    const body = document.body.textContent ?? "";
    expect(body).toContain("철거 직전 그 토지의 재산세 구분");
    expect(body).toContain("신축 직전 나대지 기간의 재산세 구분");
    expect(body).toContain("변경 직전 그 토지의 재산세 구분");
    expect(id("nbl-other-state-event-0-basis-vacant_state"), "철거 행").toBeNull();
    expect(id("nbl-other-state-event-1-ptax-unknown"), "신축 행에는 모름이 없다").toBeNull();
    expect(id("nbl-other-state-event-2-ptax-unknown"), "건축물 위 구분 변경 행은 모름이 있다").not.toBeNull();
  });

  it("신축 → 철거 → 구분 변경(철거 뒤 나대지): 마지막 행이 나대지 선언 카드", () => {
    mount(asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [built("2016-01-01"), removed("2019-01-01"), tax("2022-06-01", "separate")] }));
    expect(document.body.textContent).toContain("변경 직전 나대지 기간의 재산세 구분");
    expect(id("nbl-other-state-event-2-basis-vacant_state")).not.toBeNull();
  });
});

describe("입력 미리보기 «재산세 구분» 열 — 선언 없음은 종전 문구 · 수용·접힘은 근거를 보인다(결과 구간표와 같은 leaf 문구)", () => {
  const cell = (i: number) => screen.getByTestId(`nbl-state-history-preview-row-${i}`).textContent ?? "";

  it("선언 없음(R1d): 「종합합산(나대지 — 고정)」 불변 · 요건 미충족", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01")] }));
    expect(cell(0)).toContain("종합합산(나대지 — 고정)");
    expect(cell(0)).toContain("미충족");
  });
  it("수용(R1): 「별도합산(나대지 — 공지상태 근거)」 · 충족 · 꼬리는 «결과 계산 후 확정»", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", R1_BASIS)] }));
    expect(cell(0)).toContain("별도합산(나대지 — 공지상태 근거)");
    expect(cell(0)).toContain("충족");
    expect(cell(0)).not.toContain("미충족");
    expect(cell(1)).toContain("결과 계산 후 확정");
  });
  it("접힘: 근거 모름(R2) · 면적한도 일부 초과(R3) — 「종합합산(나대지 — … · 확인 필요)」 · 미충족", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", { propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "unknown" })] }));
    expect(cell(0)).toContain("종합합산(나대지 — 근거 모름 · 확인 필요)");
    expect(cell(0)).toContain("미충족");
    cleanup();
    mount(asset({ nblOtherStateEvents: [built("2023-06-01", { ...R1_BASIS, areaWithinLimitBefore: "exceeded" })] }));
    expect(cell(0)).toContain("종합합산(나대지 — 면적한도 일부 초과 · 확인 필요)");
  });
  it("나대지 위 구분 변경(R4 계열): 변경 전 구간 = 근거와 함께 받아들임 · «모름» 행은 「선언 없음 · 확인 필요」", () => {
    mount(asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [tax("2022-06-01", "special_sum", { propertyTaxBasisBefore: "separate_taxation" })] }));
    expect(cell(0)).toContain("분리과세(나대지 — 분리과세대상 근거)");
    cleanup();
    mount(asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [tax("2022-06-01", "")] }));
    expect(cell(0)).toContain("종합합산(나대지 — 선언 없음 · 확인 필요)");
  });
});

function text(testId: string): string {
  return (screen.getByTestId(testId).textContent ?? "").trim();
}
