// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-③ A (UI-A-2) — ⑤ 위젯 anchor: 주택부수토지 카드의 «소유기간 중 주택 신축·멸실 이력» (`OtherLandStateHistorySection variant="housing"`).
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.ui.plan.md §4.1 · §4.2 · §9 · §11.1 ⑤ 위젯
 *
 * 무엇을 고정하나: 어느 행에 어느 칸이 보이는가 · 값을 어디에 쓰는가 · 어느 엔진 상수 문구가 나오는가 · 기타토지 변형(`variant` 기본)은 종전과 같다.
 * 판정·허용 면적은 엔진 leaf가 낸 값을 읽을 뿐이다(위젯이 재계산하지 않는다).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HousingLandDetailSection } from "@/components/calc/transfer/nbl/HousingLandDetailSection";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import {
  NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
  NBL_STATE_HISTORY_GRACE_ROW_NOTICE,
  NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE,
  NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE,
  NBL_STATE_HISTORY_UNKNOWN_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";

afterEach(cleanup);

type Ev = NblOtherStateEventInput;
const built = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "", ...extra });
const removed = (date: string, footprint?: string, extra: Partial<Ev> = {}): Ev => ({
  kind: "building_removed",
  date,
  propertyTaxTypeBefore: "",
  ...(footprint === undefined ? {} : { houseFootprintBefore: footprint }),
  ...extra,
});

/** 주택부수토지 500㎡ · 정착 100㎡ · 수도권 밖 일반주거(5배 → 허용 500㎡ — 이내) · 취득 2014-01-01. */
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2014-01-01",
    acquisitionArea: "500",
    nblUseDetailedJudgment: true,
    nblLandType: "housing_site",
    nblZoneType: "general_residential",
    nblIsMetropolitanArea: "no",
    nblHousingFootprint: "100",
    nblOtherStateHistoryMode: "changed",
    ...over,
  }) as AssetForm;

const mount = (a: AssetForm, onChange = vi.fn(), transferDate: string | undefined = "2024-01-01") =>
  render(<HousingLandDetailSection asset={a} onAssetChange={onChange} transferDate={transferDate} />);
const id = (s: string) => screen.queryByTestId(s);
const text = (s: string) => screen.getByTestId(s).textContent;
const checked = (s: string) => (screen.getByTestId(s) as HTMLInputElement).checked;

describe("질문 노출 — 정착면적·배율 안내 뒤 · 필수 3지선다(미선택 = 어느 쪽도 선택 안 됨)", () => {
  it("질문 `\"\"`은 아무것도 선택되지 않은 상태다(가정값 채움 금지) · 질문 라벨은 «주택»", () => {
    mount(asset({ nblOtherStateHistoryMode: "" }));
    for (const m of ["unchanged", "changed", "unknown"]) expect(checked(`nbl-other-state-mode-${m}`), m).toBe(false);
    expect(document.body.textContent).toContain("이 토지 위에 주택이 새로 지어지거나 없어진 적이 있습니까?");
    expect(document.body.textContent).toContain("소유기간 중 주택 신축·멸실 이력");
  });

  it("DOM 순서 = 계산 순서: 정착면적 칸 → 질문(이력 섹션)", () => {
    mount(asset({ nblOtherStateHistoryMode: "" }));
    const footprint = document.querySelector('[data-field="nblHousingFootprint"]')!;
    const question = document.querySelector('[data-field="nblOtherStateHistoryMode"]')!;
    expect(footprint.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("질문 hint = 엔진 상수 `HOUSING_NON_HOUSE_BUILDING_NOTICE`(주택 아닌 건축물은 표현 못 함 — R-6)", () => {
    mount(asset({ nblOtherStateHistoryMode: "" }));
    expect(document.body.textContent).toContain(NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE);
  });

  it("질문을 고르면 `nblOtherStateHistoryMode`만 쓴다 — «건축물 있음» 토글을 건드리지 않는다(주택은 토글 없음)", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateHistoryMode: "changed", nblOtherHasBuilding: false }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-mode-unchanged"));
    expect(onChange).toHaveBeenLastCalledWith({ nblOtherStateHistoryMode: "unchanged" });
  });

  it("`unchanged`는 새 고지 없음(엔진 A-10 — 현행과 같은 결과) · `unknown`은 엔진 UNKNOWN 고지 그대로", () => {
    mount(asset({ nblOtherStateHistoryMode: "unchanged" }));
    expect(id("nbl-state-history-unchanged-notice")).toBeNull();
    expect(id("nbl-other-state-events")).toBeNull();
    cleanup();
    mount(asset({ nblOtherStateHistoryMode: "unknown" }));
    expect(text("nbl-state-history-unknown-notice")).toBe(NBL_STATE_HISTORY_UNKNOWN_NOTICE);
  });

  it("지목이 주택이 아니면 질문이 없다 · 정밀판정 OFF면 질문이 없다(술어 `nblStateHistoryApplies`)", () => {
    mount(asset({ nblUseDetailedJudgment: false }));
    expect(id("nbl-other-state-history")).toBeNull();
  });

  it("X6: stale 연접 다필지(기타토지 칸)가 있어도 질문은 보인다(주택 술어는 이 칸을 읽지 않는다)", () => {
    mount(asset({ nblOtherStateHistoryMode: "", nblOtherUseParcels: true }));
    expect(id("nbl-other-state-mode")).not.toBeNull();
  });
});

describe("사건 행 — 종류 2종 · «주택 사건» · 철거 행은 정착면적 카드", () => {
  it("종류 선택지는 «주택 신축»·«주택 멸실·철거·붕괴» 2종뿐 — «재산세 과세 구분 변경» 없음(D-2)", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01")] }));
    expect(id("nbl-other-state-event-0-kind-built")).not.toBeNull();
    expect(id("nbl-other-state-event-0-kind-removed")).not.toBeNull();
    expect(id("nbl-other-state-event-0-kind-taxchange")).toBeNull();
    expect(document.body.textContent).toContain("주택 신축");
    expect(document.body.textContent).toContain("주택 멸실·철거·붕괴");
    expect(document.body.textContent).toContain("주택 사건");
    expect(document.body.textContent).not.toContain("건축물 사건");
  });

  it("신축 행에는 «신축 직전 나대지 기간의 재산세 구분» 카드가 있다(UQ-6 (가) — E3-1b 재사용) · 정착면적 카드는 없다", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01")] }));
    expect(document.body.textContent).toContain("신축 직전 나대지 기간의 재산세 구분");
    expect(id("nbl-other-state-event-0-footprint")).toBeNull();
  });

  it("철거 행은 «철거 직전 재산세 구분» 대신 «철거 직전 주택 정착면적(㎡)» 카드 · 앵커 `nblOtherStateEvents.{i}.houseFootprintBefore`", () => {
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", ""), built("2023-01-01")] }));
    expect(id("nbl-other-state-event-0-footprint")).not.toBeNull();
    expect(document.querySelector('[data-field="nblOtherStateEvents.0.houseFootprintBefore"]')).not.toBeNull();
    expect(document.body.textContent).toContain("철거 직전 주택 정착면적");
    expect(document.body.textContent).not.toContain("철거 직전 그 토지의 재산세 구분");
    expect(document.querySelector('[data-testid^="nbl-other-state-event-0-ptax-"]')).toBeNull();
    // 신축 행(둘째)에는 정착면적 카드 없음
    expect(id("nbl-other-state-event-1-footprint")).toBeNull();
  });

  it("정착면적 입력은 그 행의 `houseFootprintBefore`에 쓴다 · 빈칸은 빈칸(가정값 없음 · 허용 면적 미리보기도 없음)", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", ""), built("2023-01-01")] }), onChange);
    expect((screen.getByTestId("nbl-other-state-event-0-footprint") as HTMLInputElement).value).toBe("");
    expect(id("nbl-other-state-event-0-footprint-preview")).toBeNull();
    fireEvent.change(screen.getByTestId("nbl-other-state-event-0-footprint"), { target: { value: "120" } });
    expect(onChange).toHaveBeenLastCalledWith({ nblOtherStateEvents: [removed("2016-01-01", "120"), built("2023-01-01")] });
  });

  it("종류를 바꾸면 행을 `{kind, date, propertyTaxTypeBefore:\"\"}`로 재생성해 정착면적·선언 키를 함께 리셋한다", () => {
    const onChange = vi.fn();
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", "100"), built("2023-01-01")] }), onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-0-kind-built"));
    expect(onChange).toHaveBeenLastCalledWith({ nblOtherStateEvents: [{ kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "" }, built("2023-01-01")] });
  });

  it("양도일 현재 줄: «주택: 있음 (주택 부속토지 — 지목에서 정함)» 읽기 전용 · 「건축물 있음」 토글 없음 · 의제 안내 없음", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01")], nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-01-01" } as Partial<AssetForm>));
    expect(text("nbl-state-history-at-transfer")).toContain("양도일 현재 주택: 있음");
    expect(id("nbl-other-has-building-toggle")).toBeNull();
    expect(id("nbl-state-history-deemed-notice")).toBeNull();
  });

  it("X8 stale `tax_type_changed` 행(기타토지에서 입력하다 지목 변경): 행은 화면에 보이고 종류는 «선택 안 됨» · 구분·선언 카드 없음 · 삭제 가능", () => {
    mount(asset({ nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2020-01-01", propertyTaxTypeBefore: "separate" }, built("2023-01-01")] }));
    expect(id("nbl-other-state-event-0-house-taxchange-notice")).not.toBeNull();
    expect(checked("nbl-other-state-event-0-kind-built")).toBe(false);
    expect(checked("nbl-other-state-event-0-kind-removed")).toBe(false);
    expect(document.querySelector('[data-testid^="nbl-other-state-event-0-ptax-"]')).toBeNull();
    expect(id("nbl-other-state-event-0-remove")).not.toBeNull();
  });
});

describe("철거 행 허용 면적 미리보기 — 엔진 leaf 값(재계산 없음) · 초과 고지 · 오류", () => {
  it("이내: «정착면적 100㎡ × 수도권 밖 도시 5배 = 허용 면적 500㎡ ≥ 토지 면적 500㎡ → 배율 이내» · 초과 고지 없음", () => {
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", "100"), built("2023-01-01")] }));
    const t = text("nbl-other-state-event-0-footprint-preview")!;
    expect(t).toContain("정착면적 100㎡");
    expect(t).toContain("허용 면적 500㎡");
    expect(t).toContain("토지 면적 500㎡");
    expect(t).toContain("배율 이내");
    expect(id("nbl-other-state-event-0-footprint-exceeded-notice")).toBeNull();
  });

  it("초과(50㎡ × 5배 = 250㎡ < 500㎡): «초과 250㎡ … 이 구간 전체를 비사업용으로 봅니다» + 엔진 `HOUSE_EXCEEDED_NOTICE`", () => {
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", "50"), built("2023-01-01")] }));
    const t = text("nbl-other-state-event-0-footprint-preview")!;
    expect(t).toContain("허용 면적 250㎡");
    expect(t).toContain("초과 250㎡");
    expect(t).toContain("전체를 비사업용");
    expect(text("nbl-other-state-event-0-footprint-exceeded-notice")).toBe(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
  });

  it("정착면적 > 토지 면적 → 칸 오류(⑧ H9와 같은 leaf 문구) · 미리보기 없음 · 빈칸은 오류를 띄우지 않는다(입력 전 소음 금지 — ⑧이 막는다)", () => {
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", "600"), built("2023-01-01")] }));
    expect(text("nbl-other-state-event-0-footprint-error")).toContain("토지 면적(500㎡)보다 큽니다");
    expect(id("nbl-other-state-event-0-footprint-preview")).toBeNull();
    cleanup();
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", ""), built("2023-01-01")] }));
    expect(id("nbl-other-state-event-0-footprint-error")).toBeNull();
  });

  it("정착면적 hint에 탈출구 안내(이력 질문 «모름») + 정착면적 정의", () => {
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", ""), built("2023-01-01")] }));
    expect(document.querySelector('[data-field="nblOtherStateEvents.0.houseFootprintBefore"]')!.textContent).toContain("위 질문에서 「모름」을 선택하세요");
  });
});

describe("미리보기 구간표 · 고지", () => {
  it("M15: 신축 2023-06-01 → 구간 2개(나대지 · 주택) · 열 라벨 «주택» · 합계 = 소유기간 · 꼬리 칸은 «결과 계산 후 확정»", () => {
    mount(asset({ nblOtherStateEvents: [built("2023-06-01")] }));
    expect(id("nbl-state-history-preview-row-0")).not.toBeNull();
    expect(id("nbl-state-history-preview-row-1")).not.toBeNull();
    expect(id("nbl-state-history-preview-row-2")).toBeNull();
    expect(text("nbl-state-history-preview-row-0")).toContain("없음(나대지)");
    expect(text("nbl-state-history-preview-row-1")).toContain("결과 계산 후 확정");
    expect(text("nbl-state-history-preview-total")).toContain("3,651일");
    expect(document.body.textContent).toContain("재산세 구분 · 배율 판정");
  });

  it("H3f: 구옥 정착 50(초과) → 과거 주택 구간 행에 엔진 echo 문구(허용 면적 vs 토지 면적) · 사업용 요건 «미충족»", () => {
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", "50"), built("2023-01-01")] }));
    expect(text("nbl-state-history-preview-row-0")).toContain("허용 면적 250㎡");
    expect(text("nbl-state-history-preview-row-0")).toContain("미충족");
  });

  it("H3c: 구옥 정착 100(이내) → 과거 주택 구간 «충족»", () => {
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", "100"), built("2023-01-01")] }));
    expect(text("nbl-state-history-preview-row-0")).toContain("배율 이내");
    expect(text("nbl-state-history-preview-row-0")).toContain("충족");
    expect(text("nbl-state-history-preview-row-0")).not.toContain("미충족");
  });

  it("정착면적이 ⑧ 결함이면 표를 그리지 않는다(판정과 어긋난 표 금지) · 마지막 사건이 철거(D-1)여도 표를 그리지 않는다", () => {
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", ""), built("2023-01-01")] }));
    expect(id("nbl-state-history-preview-empty")).not.toBeNull();
    cleanup();
    mount(asset({ nblOtherStateEvents: [built("2016-01-01"), removed("2018-01-01", "100")] }));
    expect(id("nbl-state-history-preview-empty")).not.toBeNull();
  });

  it("고지: 엔진이 이력 적용 결과에 싣는 상수와 같은 문구 — HOUSING_APPLIED · DAYWISE · (철거 행이 있으면) HOUSE_BEFORE · GRACE_ROW · 기타토지 고지는 없다", () => {
    mount(asset({ nblOtherStateEvents: [removed("2016-01-01", "100"), built("2023-01-01")] }));
    expect(text("nbl-state-history-applied-notice")).toBe(NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE);
    expect(text("nbl-state-history-daywise-notice")).toBe(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE);
    expect(text("nbl-state-history-house-before-notice")).toBe(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
    expect(text("nbl-state-history-grace-row-notice")).toBe(NBL_STATE_HISTORY_GRACE_ROW_NOTICE);
    cleanup();
    mount(asset({ nblOtherStateEvents: [built("2023-06-01")] }));
    expect(id("nbl-state-history-house-before-notice"), "철거 행이 없으면 철거 전 주택 구간 고지도 없다").toBeNull();
  });

  it("Q-8 (가): 초과 구간 + 철거 후 9호 유예 행 → `HOUSE_EXCEEDED_GRACE_NOTICE` · 9호 없으면 없다", () => {
    const base = { nblOtherStateEvents: [removed("2016-01-01", "50"), built("2023-01-01")] };
    mount(asset({ ...base, nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2016-01-01" }] as AssetForm["nblGracePeriods"] }));
    expect(text("nbl-state-history-house-exceeded-grace-notice")).toBe(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
    cleanup();
    mount(asset(base));
    expect(id("nbl-state-history-house-exceeded-grace-notice")).toBeNull();
  });
});

describe("UQ-7 (다) — 양도일 현재 배율 초과: 질문·검증은 그대로, 안내 1줄만(엔진 PARTIAL 고지 상수)", () => {
  it("정착 40㎡(허용 200㎡ < 토지 500㎡) → 안내 · 질문은 그대로 보인다", () => {
    mount(asset({ nblHousingFootprint: "40", nblOtherStateHistoryMode: "" }));
    expect(text("nbl-housing-area-exceeded-notice")).toBe(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    expect(id("nbl-other-state-mode")).not.toBeNull();
  });

  it("이내(정착 100 → 허용 500 ≥ 500) · 입력 미완(정착면적 빈칸)이면 안내 없음", () => {
    mount(asset({ nblOtherStateHistoryMode: "" }));
    expect(id("nbl-housing-area-exceeded-notice")).toBeNull();
    cleanup();
    mount(asset({ nblHousingFootprint: "", nblOtherStateHistoryMode: "" }));
    expect(id("nbl-housing-area-exceeded-notice")).toBeNull();
  });

  it("수도권 미선택 + 주·상·공: 수도권(3배)이면 초과 · 밖(5배)이면 이내 — 결과가 갈리므로 안내를 띄우지 않는다(깜빡임 방지)", () => {
    mount(asset({ nblIsMetropolitanArea: "", nblHousingFootprint: "200", nblOtherStateHistoryMode: "" }));
    expect(id("nbl-housing-area-exceeded-notice")).toBeNull();
  });
});

describe("기타토지 변형(`variant` 기본) — 종전과 같다", () => {
  const other = (over: Partial<AssetForm> = {}): AssetForm =>
    ({ ...makeDefaultAsset(1), assetKind: "land", acquisitionDate: "2014-01-01", nblUseDetailedJudgment: true, nblLandType: "other_land", nblOtherPropertyTaxType: "comprehensive", nblOtherStateHistoryMode: "changed", nblOtherHasBuilding: true, ...over }) as AssetForm;

  it("라벨·종류 3종·«건축물 사건»·«직전 재산세 구분» 카드 그대로 · 정착면적 카드 없음", () => {
    render(<OtherLandDetailSection asset={other({ nblOtherStateEvents: [removed("2021-01-01", "100", { propertyTaxTypeBefore: "separate" }), built("2023-01-01")] })} onAssetChange={vi.fn()} transferDate="2024-01-01" />);
    expect(document.body.textContent).toContain("소유기간 중 건축물 유무·재산세 구분 이력");
    expect(document.body.textContent).toContain("건축물 사건");
    expect(id("nbl-other-state-event-0-kind-taxchange")).not.toBeNull();
    expect(document.body.textContent).toContain("철거 직전 그 토지의 재산세 구분");
    expect(id("nbl-other-state-event-0-footprint")).toBeNull();
    expect(id("nbl-state-history-daywise-notice")).toBeNull();
    expect(id("nbl-housing-area-exceeded-notice")).toBeNull();
  });
});
