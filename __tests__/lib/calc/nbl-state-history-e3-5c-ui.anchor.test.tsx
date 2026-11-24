// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-2 U-3 — 나대지 구간 근거 «철거ㆍ멸실» 사실 칸(⑤) · 접힘·창 표시(⑤ 미리보기·⑦)의 UI anchor.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.ui.plan.md §4.3 · §4.4 · §7.2 · §9 · 엔진 계획서 §5.4 · §7.6
 *
 *  A  선택지 — 근거 «철거ㆍ멸실»은 철거 행 뒤 나대지 구간을 닫는 행에만 열린다(`eventOffersDemolished`) · 철거 행 앞 구간은 종전 그대로
 *  B  사실 칸 노출 — 시행본별 요구 칸(`demolishedRequiredFacts`) · 기타토지(비주택·주택) · 주택부수토지 카드(바닥면적 칸 없음) · 엔진이 이력을 읽지 않으면 4칸 모두 숨김(UQ-8 (가))
 *  C  인정 창·접힘 사유 — 엔진 구간 해석(미리보기 행)을 읽는다(재계산 없음) · 사실 칸이 모두 답해진 뒤에만
 *  D  쓰기 — onChange 시점(`useEffect → store` 미러링 없음) · 구분을 바꾸면 사실 칸 4개 리셋 · 근거만 바꾸면 보존
 *  E  ⑧↔⑫′ parity × ⑤ 렌더 격자 — ⑫′ 400이면 ⑧도 차단 · ⑧이 가리키는 칸은 반드시 화면에 그려진다(막다른 길 금지) · 그려진 칸 = 요구 칸(노출 ≡ 필수)
 *  F  ⑦ 결과 구간표 — 인정 창·한시 기간 표시(엔진 echo)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { z } from "zod";
import { OtherLandStateHistorySection } from "@/components/calc/transfer/nbl/OtherLandStateHistorySection";
import { NblStateHistoryPeriodTable } from "@/components/calc/NblStateHistoryPeriodTable";
import { refineNonBusinessLandRaw, type NblRawRefineInput } from "@/lib/api/transfer-tax-schema-nbl-refines";
import { stateHistoryWireFields } from "@/lib/calc/nbl-other-state-history-scope";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { validateNblStateHistory } from "@/lib/calc/transfer-tax-validate-nbl-state-history";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE,
  NBL_STATE_HISTORY_BARE_DEMOLISHED_HOUSE_AREA_NOTICE,
  NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { BARE_DEMOLISHED_FOLD_NOTICE } from "@/lib/tax-engine/non-business-land/state-history-echo";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

afterEach(cleanup);

type Ev = NblOtherStateEventInput;
const built = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "", ...extra });
const removed = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: "separate", ...extra });
const houseRemoved = (date: string): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: "", buildingKindBefore: "house", houseFootprintBefore: "400" });
const closing = (kind: Ev["kind"], date: string, extra: Partial<Ev> = {}): Ev => ({ kind, date, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...extra });

const BASE = makeDefaultAsset(1);
/** 기타토지 1,000㎡ · 일반주거(배율 4) · 양도일 현재 건축물 250㎡ + 별도합산(꼬리 건물 — 바닥면적 250 × 4 = 1,000㎡ → 이내). */
const other = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...BASE,
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    acquisitionArea: "1000",
    isNonBusinessLand: true,
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblIsMetropolitanArea: "no",
    nblOtherPropertyTaxType: "separate",
    nblOtherHasBuilding: true,
    nblOtherBuildingFloorArea: "250",
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [],
    ...over,
  }) as AssetForm;
const housing = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...BASE,
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    acquisitionArea: "1000",
    isNonBusinessLand: true,
    nblUseDetailedJudgment: true,
    nblLandType: "housing_site",
    nblZoneType: "general_residential",
    nblIsMetropolitanArea: "no",
    nblHousingFootprint: "250",
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [],
    ...over,
  }) as AssetForm;

const mount = (a: AssetForm, transferDate: string | undefined, onChange = vi.fn(), variant: "other" | "housing" = "other") =>
  render(<OtherLandStateHistorySection asset={a} onAssetChange={onChange} transferDate={transferDate} variant={variant} />);
const id = (s: string) => screen.queryByTestId(s);
const text = (s: string) => screen.getByTestId(s).textContent;
const anchors = () => [...document.querySelectorAll('[data-field^="nblOtherStateEvents."]')].map((e) => e.getAttribute("data-field")!).filter((f) => /\.demolished\w+Before$/.test(f));

/** K-1 시료 — 건물 2021-06-02~철거 2022-12-15 · 신축 2023-12-01(닫는 행). 양도 2024-01-01 → 후보 과세기준일 2023-06-01만(허가 칸만). */
const K1 = (facts: Partial<Ev> = {}, removedOn = "2022-12-15") => other({ nblOtherStateEvents: [built("2021-06-02"), removed(removedOn), closing("building_built", "2023-12-01", facts)] });
const T_K1 = "2024-01-01";
/** 2024.6.1.~ 시행본 시료 — 철거 2024-01-15 · 닫는 행 2024-09-01(양도 2024-12-01): 비주택 = 허가·건축 외 용도·바닥면적 / 주택 = 허가·건축 외 용도·빈집정비. */
const FULL = (facts: Partial<Ev> = {}, house = false) =>
  other({ nblOtherStateEvents: [built("2016-01-01"), house ? houseRemoved("2024-01-15") : removed("2024-01-15"), closing("building_built", "2024-09-01", facts)] });
const T_FULL = "2024-12-01";

// ── A. 선택지 ────────────────────────────────────────────────────────────────

describe("E3f-2 U-3 A — 근거 «철거ㆍ멸실»은 철거 행 뒤 나대지 구간을 닫는 행에만 열린다", () => {
  const BASIS = ["vacant_state", "demolished", "unknown"];
  const offered = (i: number) => BASIS.filter((b) => id(`nbl-other-state-event-${i}-basis-${b}`));

  it("신축 행이 닫는 구간(철거 행 뒤) → 선택지 = 공지상태 · 철거ㆍ멸실 · 모름 / 철거 행 앞 구간(첫 구간이 나대지 — 철거일 출처 없음) → 철거ㆍ멸실 없음", () => {
    mount(other({ nblOtherStateEvents: [built("2021-06-02", { propertyTaxTypeBefore: "separate" }), removed("2022-12-15"), built("2023-12-01", { propertyTaxTypeBefore: "separate" })] }), T_K1);
    expect(offered(0), "철거 행 앞 구간 — 종전 선택지(승계 단언)").toEqual(["vacant_state", "unknown"]);
    expect(offered(2), "철거 행 뒤 구간").toEqual(["vacant_state", "demolished", "unknown"]);
  });

  it("구분 변경 행이 닫는 나대지 구간도 철거 행 뒤면 열린다 · 사이에 신축이 있으면(철거 → 신축 → 철거 …) 마지막 건축물 사건이 철거 행인 구간만", () => {
    mount(other({ nblOtherStateEvents: [built("2016-01-01"), removed("2018-01-01"), { kind: "tax_type_changed", date: "2019-01-01", propertyTaxTypeBefore: "separate" }] }), T_K1);
    expect(offered(2)).toEqual(["vacant_state", "demolished", "unknown"]);
    cleanup();
    // 신축 → 철거 → 신축(닫는 행)에서 둘째 철거 뒤 구간: 앞의 마지막 건축물 사건은 철거(2번째)
    mount(other({ nblOtherStateEvents: [built("2016-01-01"), removed("2018-01-01"), built("2019-01-01", { propertyTaxTypeBefore: "separate" }), removed("2020-01-01"), built("2021-01-01", { propertyTaxTypeBefore: "separate" })] }), T_K1);
    expect(offered(2), "첫 철거 뒤 구간").toEqual(["vacant_state", "demolished", "unknown"]);
    expect(offered(4), "둘째 철거 뒤 구간").toEqual(["vacant_state", "demolished", "unknown"]);
  });

  it("주택부수토지 카드(Q-12): 철거 행 뒤 구간에서 근거 «철거ㆍ멸실»이 열린다", () => {
    mount(housing({ nblOtherStateEvents: [{ kind: "building_removed", date: "2022-12-15", propertyTaxTypeBefore: "", houseFootprintBefore: "250" }, built("2023-12-01", { propertyTaxTypeBefore: "separate" })] }), T_K1, vi.fn(), "housing");
    expect(offered(1)).toEqual(["vacant_state", "demolished", "unknown"]);
  });
});

// ── B. 사실 칸 노출 ──────────────────────────────────────────────────────────

describe("E3f-2 U-3 B — 사실 칸 노출 ≡ 엔진 요구 집합(`demolishedRequiredFacts`) · 엔진이 이력을 읽을 때만", () => {
  it("K-1(후보 과세기준일 2023-06-01만 — 2019.6.1.~ 시행본): 허가 칸만 · 건축 외 용도·빈집정비·바닥면적 칸 없음 · 앵커는 ⑧ 점프 키와 같다", () => {
    mount(K1(), T_K1);
    expect(anchors()).toEqual(["nblOtherStateEvents.2.demolishedPermitBefore"]);
    expect(id("nbl-other-state-event-2-demolished-permit-yes")).not.toBeNull();
    expect(id("nbl-other-state-event-2-demolished-otheruse-no")).toBeNull();
    expect(id("nbl-other-state-event-2-demolished-floorarea")).toBeNull();
    expect(text("nbl-other-state-event-2-demolished-removed-on")).toContain("철거일: 2022-12-15");
    expect(text("nbl-other-state-event-2-demolished-removed-on")).toContain("이 나대지 구간: 2022-12-15 ~ 2023-11-30");
  });

  it("2024.6.1.~ 시행본 · 비주택 건축물 철거 행: 허가 · 건축 외 용도 · 바닥면적(빈집정비 칸 없음) — 순서도 이 순서", () => {
    mount(FULL(), T_FULL);
    expect(anchors()).toEqual(["nblOtherStateEvents.2.demolishedPermitBefore", "nblOtherStateEvents.2.demolishedOtherUseBefore", "nblOtherStateEvents.2.demolishedFloorAreaBefore"]);
    const floor = document.querySelector('[data-field="nblOtherStateEvents.2.demolishedFloorAreaBefore"]');
    expect(floor, "바닥면적 FieldCard 앵커").not.toBeNull();
    expect(id("nbl-other-state-event-2-demolished-floorarea")).not.toBeNull();
    expect(id("nbl-other-state-event-2-demolished-vacanthouse-yes")).toBeNull();
    expect(id("nbl-other-state-event-2-demolished-house-area-notice"), "비주택 행에는 주택 면적 고지가 없다").toBeNull();
    const order = [...document.querySelectorAll('[data-field^="nblOtherStateEvents.2.demolished"]')].map((e) => e.getAttribute("data-field")!.split(".").pop());
    expect(order).toEqual(["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedFloorAreaBefore"]);
  });

  it("2024.6.1.~ 시행본 · 주택 철거 행(기타토지 카드의 «철거된 건축물 = 주택»): 허가 · 건축 외 용도 · 빈집정비 — 바닥면적 칸 없음 + 주택 면적 보조 고지(엔진 상수)", () => {
    mount(FULL({}, true), T_FULL);
    expect(anchors()).toEqual(["nblOtherStateEvents.2.demolishedPermitBefore", "nblOtherStateEvents.2.demolishedOtherUseBefore", "nblOtherStateEvents.2.demolishedVacantHouseBefore"]);
    expect(document.querySelector('[data-field="nblOtherStateEvents.2.demolishedFloorAreaBefore"]')).toBeNull();
    expect(text("nbl-other-state-event-2-demolished-house-area-notice")).toBe(NBL_STATE_HISTORY_BARE_DEMOLISHED_HOUSE_AREA_NOTICE);
  });

  it("주택부수토지 카드(X-10 · Q-12): 사실 3칸(허가·건축 외 용도·빈집정비) — 바닥면적 칸 없음", () => {
    mount(
      housing({ nblOtherStateEvents: [{ kind: "building_removed", date: "2024-01-15", propertyTaxTypeBefore: "", houseFootprintBefore: "250" }, closing("building_built", "2024-09-01")] }),
      T_FULL,
      vi.fn(),
      "housing",
    );
    expect(anchors()).toEqual(["nblOtherStateEvents.1.demolishedPermitBefore", "nblOtherStateEvents.1.demolishedOtherUseBefore", "nblOtherStateEvents.1.demolishedVacantHouseBefore"]);
    expect(id("nbl-other-state-event-1-demolished-floorarea")).toBeNull();
  });

  it("근거가 «철거ㆍ멸실»이 아니면(공지상태·모름·구분 종합합산) 사실 칸 블록이 없다 — 저장된 사실 칸 값은 숨기고 ④가 싣지 않는다(B8)", () => {
    const stored = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedFloorAreaBefore: "250" } as const;
    for (const over of [{ propertyTaxBasisBefore: "vacant_state" }, { propertyTaxBasisBefore: "unknown" }, { propertyTaxBasisBefore: "" }, { propertyTaxTypeBefore: "comprehensive", propertyTaxBasisBefore: "" }] as Partial<Ev>[]) {
      mount(other({ nblOtherStateEvents: [built("2016-01-01"), removed("2024-01-15"), { ...closing("building_built", "2024-09-01", stored), ...over }] }), T_FULL);
      expect(id("nbl-other-state-event-2-demolished"), JSON.stringify(over)).toBeNull();
      expect(anchors(), JSON.stringify(over)).toEqual([]);
      cleanup();
    }
  });

  it("후보 과세기준일이 없으면(K-2c 철거 2022-11-30 — 6개월 만료일 2023-05-31 < 과세기준일) 입력할 칸이 없다 — 한 줄 안내 + 엔진 접힘 사유 `demolished_never_period`", () => {
    mount(K1({}, "2022-11-30"), T_K1);
    expect(anchors()).toEqual([]);
    expect(id("nbl-other-state-event-2-demolished-no-facts")).not.toBeNull();
    expect(text("nbl-other-state-event-2-demolished-fold-notice")).toBe(BARE_DEMOLISHED_FOLD_NOTICE.demolished_never_period);
  });

  it("사건일(닫는 행)이 비면 칸 대신 한 줄 안내 — 사건일을 입력하면 필요한 칸이 표시된다(⑧은 날짜 결함을 먼저 막는다)", () => {
    mount(other({ nblOtherStateEvents: [built("2021-06-02"), removed("2022-12-15"), closing("building_built", "")] }), T_K1);
    expect(anchors()).toEqual([]);
    expect(text("nbl-other-state-event-2-demolished-dates-notice")).toBe("사건일을 입력하면 필요한 사실 칸이 표시됩니다.");
  });

  it("엔진이 이력을 읽지 않으면(양도일 의제 · core 부분 면적) 사실 칸 4개 모두 그리지 않는다 — 값은 보존하고 기존 안내가 말한다(UQ-8 (가) · X-5 · X-6)", () => {
    const stored: Partial<Ev> = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedFloorAreaBefore: "250" };
    // core 부분 면적 — 꼬리 건물 바닥면적 100 × 4 = 400㎡ < 1,000㎡
    mount(FULL(stored), T_FULL);
    expect(anchors(), "읽는 경우 대조").toHaveLength(3);
    cleanup();
    const partial = { ...FULL(stored), nblOtherBuildingFloorArea: "100" } as AssetForm;
    mount(partial, T_FULL);
    expect(anchors()).toEqual([]);
    expect(id("nbl-other-state-event-2-demolished")).toBeNull();
    expect(id("nbl-other-partial-area-notice")).not.toBeNull();
    expect(partial.nblOtherStateEvents[2].demolishedPermitBefore, "저장값은 지우지 않는다").toBe("yes");
    cleanup();
    // 양도일 의제 사유
    mount({ ...FULL(stored), nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-10-01" } as AssetForm, T_FULL);
    expect(anchors()).toEqual([]);
    expect(id("nbl-state-history-deemed-notice")).not.toBeNull();
  });
});

// ── C. 인정 창 · 접힘 ────────────────────────────────────────────────────────

describe("E3f-2 U-3 C — 인정 창·접힘 사유는 엔진 구간 해석(미리보기 행)을 읽는다 · 사실 칸이 모두 답해진 뒤에만", () => {
  it("허가 «예» → 창 [철거일 당일, 만료일 당일] 183일 · 한시 기간 6개월 + 인정 고지(엔진 상수) · 접힘 고지 없음 — K-1 오라클(창 2022-12-15 ~ 2023-06-15)", () => {
    mount(K1({ demolishedPermitBefore: "yes" }), T_K1);
    expect(text("nbl-other-state-event-2-demolished-window")).toBe("한시 지위 인정 기간: 2022-12-15 ~ 2023-06-15(183일 · 한시 기간 6개월)");
    expect(text("nbl-other-state-event-2-demolished-accepted-notice")).toBe(NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE);
    expect(id("nbl-other-state-event-2-demolished-fold-notice")).toBeNull();
    // 미리보기 표(⑤)의 해당 구간 행 — 인정 창 + «한시 지위 창만 충족»(창 구간은 meetsBuildingRequirement 거짓 — echo로 말한다)
    const row = screen.getByTestId("nbl-state-history-preview-row-2");
    expect(row.textContent).toContain("별도합산(나대지 — 철거·멸실 근거 · 한시 기간만) · 인정 2022-12-15 ~ 2023-06-15(183일)");
    expect(row.textContent).toContain("한시 지위 창만 충족");
    expect(row.textContent).not.toContain("미충족");
  });

  it("사실 칸이 비어 있으면 미리보기 결과(창·접힘 고지)를 보이지 않는다 — 선언 전부터 불이익처럼 읽히지 않게(UQ-10)", () => {
    mount(K1(), T_K1);
    expect(id("nbl-other-state-event-2-demolished-window")).toBeNull();
    expect(id("nbl-other-state-event-2-demolished-accepted-notice")).toBeNull();
    expect(id("nbl-other-state-event-2-demolished-fold-notice")).toBeNull();
  });

  it.each(["no", "unknown"] as const)("허가 «%s» → 접힘 `demolished_permit`(종합합산 + 확인 필요) — 창 없음 · 문구는 엔진 상수", (permit) => {
    mount(K1({ demolishedPermitBefore: permit }), T_K1);
    expect(text("nbl-other-state-event-2-demolished-fold-notice")).toBe(BARE_DEMOLISHED_FOLD_NOTICE.demolished_permit);
    expect(id("nbl-other-state-event-2-demolished-window")).toBeNull();
    expect(screen.getByTestId("nbl-state-history-preview-row-2").textContent).toContain("종합합산");
  });

  it("건축 외 용도 «예» → 접힘 `demolished_other_use` · 바닥면적이 배율 범위를 넘으면 `demolished_area_exceeded`(구간 전체 접힘 — 안분 없음)", () => {
    mount(FULL({ demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes", demolishedFloorAreaBefore: "250" }), T_FULL);
    expect(text("nbl-other-state-event-2-demolished-fold-notice")).toBe(BARE_DEMOLISHED_FOLD_NOTICE.demolished_other_use);
    cleanup();
    mount(FULL({ demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedFloorAreaBefore: "100" }), T_FULL); // 100 × 4 = 400 < 1,000
    expect(text("nbl-other-state-event-2-demolished-fold-notice")).toBe(BARE_DEMOLISHED_FOLD_NOTICE.demolished_area_exceeded);
  });

  it("주택 + 빈집정비 «모름»(Q-8 (나)): 접히지 않는다 — 일반 한시 기간 창 + 3년 연장 불인정 고지 · «예» = 3년 창 · 고지 없음", () => {
    const facts = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no" } as const;
    mount(FULL({ ...facts, demolishedVacantHouseBefore: "unknown" }, true), T_FULL);
    expect(text("nbl-other-state-event-2-demolished-window")).toBe("한시 지위 인정 기간: 2024-01-15 ~ 2024-07-15(183일 · 한시 기간 6개월)");
    expect(text("nbl-other-state-event-2-demolished-vacant-notice")).toBe(NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE);
    expect(id("nbl-other-state-event-2-demolished-fold-notice")).toBeNull();
    cleanup();
    mount(FULL({ ...facts, demolishedVacantHouseBefore: "yes" }, true), T_FULL);
    expect(text("nbl-other-state-event-2-demolished-window")).toContain("한시 기간 3년");
    expect(id("nbl-other-state-event-2-demolished-vacant-notice")).toBeNull();
  });
});

// ── D. 쓰기 ─────────────────────────────────────────────────────────────────

describe("E3f-2 U-3 D — onChange 시점 쓰기 · 구분을 바꾸면 사실 칸 4개 리셋 · 근거만 바꾸면 보존", () => {
  const STORED: Partial<Ev> = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedFloorAreaBefore: "250" };

  it("허가 라디오 → 그 행의 사실 칸 키 1개만 쓴다(다른 행·다른 키 불변)", () => {
    const onChange = vi.fn();
    const a = K1();
    mount(a, T_K1, onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-2-demolished-permit-unknown"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const events = onChange.mock.calls[0][0].nblOtherStateEvents as Ev[];
    expect(events[2]).toEqual({ ...a.nblOtherStateEvents[2], demolishedPermitBefore: "unknown" });
    expect(events.slice(0, 2)).toEqual(a.nblOtherStateEvents.slice(0, 2));
  });

  it("바닥면적 입력 → 문자열 그대로 쓴다 · 건축 외 용도 «예» → `yes`", () => {
    const onChange = vi.fn();
    mount(FULL({ demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no" }), T_FULL, onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-2-demolished-otheruse-yes"));
    expect((onChange.mock.calls[0][0].nblOtherStateEvents as Ev[])[2].demolishedOtherUseBefore).toBe("yes");
  });

  it("재산세 구분을 바꾸면 근거·면적한도·사실 칸 4개를 함께 지운다(키째 — 종전 행과 byte-identical)", () => {
    const onChange = vi.fn();
    mount(FULL(STORED), T_FULL, onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-2-ptax-comprehensive"));
    const row = (onChange.mock.calls[0][0].nblOtherStateEvents as Ev[])[2];
    expect(Object.keys(row).sort()).toEqual(["areaWithinLimitBefore", "date", "kind", "propertyTaxBasisBefore", "propertyTaxTypeBefore"]);
    expect(row).toEqual({ kind: "building_built", date: "2024-09-01", propertyTaxTypeBefore: "", propertyTaxBasisBefore: "", areaWithinLimitBefore: "" });
  });

  it("근거만 바꾸면 사실 칸은 지우지 않는다(숨고 ④가 보내지 않는다 — 되돌리면 복원)", () => {
    const onChange = vi.fn();
    mount(FULL(STORED), T_FULL, onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-2-basis-vacant_state"));
    const row = (onChange.mock.calls[0][0].nblOtherStateEvents as Ev[])[2];
    expect(row).toEqual({ ...closing("building_built", "2024-09-01", STORED), propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "" });
  });

  it("④ — 근거가 «철거ㆍ멸실»이 아니면 숨은 사실 칸은 와이어에 실리지 않는다 · 요구 칸만 싣는다", () => {
    const a = FULL(STORED);
    const wire = stateHistoryWireFields(a).nblOtherStateEvents[2];
    expect(wire).toEqual({ kind: "building_built", date: "2024-09-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedFloorAreaBefore: "250" });
    const hidden = FULL(STORED);
    hidden.nblOtherStateEvents = hidden.nblOtherStateEvents.map((e, i) => (i === 2 ? { ...e, propertyTaxBasisBefore: "vacant_state" } : e));
    expect(Object.keys(stateHistoryWireFields(hidden).nblOtherStateEvents[2]).sort()).toEqual(["areaWithinLimitBefore", "date", "kind", "propertyTaxBasisBefore", "propertyTaxTypeBefore"].sort().filter((k) => k !== "areaWithinLimitBefore"));
  });
});

// ── E. ⑧ ↔ ⑫′ parity × ⑤ 렌더 격자 ────────────────────────────────────────────

const ERAS = {
  none2018: { removedOn: "2018-03-01", closeOn: "2019-12-01", transfer: "2024-01-01", need: { building: [], house: [] } },
  permitOnly: { removedOn: "2022-12-15", closeOn: "2023-12-01", transfer: "2024-01-01", need: { building: ["permit"], house: ["permit"] } },
  full2024: { removedOn: "2024-01-15", closeOn: "2024-09-01", transfer: "2024-12-01", need: { building: ["permit", "otherUse", "floorArea"], house: ["permit", "otherUse", "vacantHouse"] } },
  never: { removedOn: "2022-07-01", closeOn: "2023-12-01", transfer: "2024-01-01", need: { building: [], house: [] } },
} as const;
type EraKey = keyof typeof ERAS;
type Card = "otherBuilding" | "otherHouse" | "housing";
type Closer = "built" | "taxChanged";
type Fill = "none" | "all" | "permitOnly" | "areaOnly";
type Read = "read" | "notRead";
const FIELD_OF = { permit: "demolishedPermitBefore", otherUse: "demolishedOtherUseBefore", vacantHouse: "demolishedVacantHouseBefore", floorArea: "demolishedFloorAreaBefore" } as const;
const FACT_VALUE = { permit: "unknown", otherUse: "yes", vacantHouse: "no", floorArea: "250" } as const;

interface Cell { card: Card; closer: Closer; era: EraKey; read: Read; fill: Fill }

function cellAsset(c: Cell): AssetForm {
  const e = ERAS[c.era];
  const kind = c.card === "otherBuilding" ? "building" : "house";
  const need = e.need[kind] as readonly (keyof typeof FIELD_OF)[];
  const picked = need.filter((k) => c.fill === "all" || (c.fill === "permitOnly" && k === "permit") || (c.fill === "areaOnly" && k === "floorArea"));
  const facts = Object.fromEntries(picked.map((k) => [FIELD_OF[k], FACT_VALUE[k]]));
  const closeRow = { kind: c.closer === "built" ? "building_built" : "tax_type_changed", date: e.closeOn, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...facts } as Ev;
  if (c.card === "housing") {
    return housing({
      nblHousingFootprint: c.read === "read" ? "250" : "100", // 100 × 5배 = 500 < 1,000 → 양도일 현재 배율 초과(엔진이 이력을 읽지 않는다)
      nblOtherStateEvents: [{ kind: "building_removed", date: e.removedOn, propertyTaxTypeBefore: "", houseFootprintBefore: "250" }, { ...closeRow, kind: "building_built" }],
    });
  }
  return other({
    nblOtherBuildingFloorArea: c.read === "read" ? "250" : "100", // 100 × 4 = 400 < 1,000 → core 부분 면적(엔진이 이력을 읽지 않는다)
    ...(c.read === "notRead" && c.closer === "taxChanged" ? { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-10-01" } : {}),
    nblOtherStateEvents: [built("2016-01-01"), c.card === "otherHouse" ? { ...houseRemoved(e.removedOn) } : removed(e.removedOn), closeRow],
  } as Partial<AssetForm>);
}

const GRID: Cell[] = [];
for (const card of ["otherBuilding", "otherHouse", "housing"] as const) for (const closer of ["built", "taxChanged"] as const) for (const era of Object.keys(ERAS) as EraKey[])
  for (const read of ["read", "notRead"] as const) for (const fill of ["none", "all", "permitOnly", "areaOnly"] as const) {
    if (card === "housing" && closer === "taxChanged") continue; // 주택 카드는 구분 변경 행을 받지 않는다
    GRID.push({ card, closer, era, read, fill });
  }

function refine(raw: Record<string, unknown>): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  refineNonBusinessLandRaw(raw as unknown as NblRawRefineInput, { addIssue: (i: { path: (string | number)[]; message: string }) => out.push({ path: i.path, message: i.message }) } as unknown as z.RefinementCtx);
  return out;
}
const FACT_PATHS = new Set(Object.values(FIELD_OF));
const isFactPath = (p: (string | number)[]) => p[0] === "nblOtherStateEvents" && typeof p[2] === "string" && FACT_PATHS.has(p[2] as never);

describe("E3f-2 U-3 E — ⑧↔⑫′ parity × ⑤ 렌더 격자(실제 ⑧ · 실제 ⑫′ · 실제 렌더)", () => {
  it("격자 규모(공허 방지)", () => {
    expect(GRID.length).toBe(2 * 2 * 4 * 2 * 4 + 1 * 4 * 2 * 4); // 기타토지 2종(비주택·주택 철거 행) × 닫는 행 2 + 주택부수토지 카드(신축 행만)
    expect(GRID.length).toBe(160);
  });

  it("⑫′가 400이면 ⑧도 차단(같은 칸·같은 문구) · ⑧이 사실 칸을 가리키면 화면이 그 칸을 그린다 · 그려진 사실 칸 = 요구 칸(노출 ≡ 필수) · 읽지 않으면 하나도 없다", () => {
    const bad: string[] = [];
    const seen = { eight: 0, twelve: 0, rendered: 0, blockedAnchorChecked: 0, hiddenNotRead: 0 };
    for (const c of GRID) {
      const a = cellAsset(c);
      const e = ERAS[c.era];
      const raw = buildNonBusinessLandRaw(a, e.transfer);
      if (!raw) { bad.push(`④ raw 없음 ${JSON.stringify(c)}`); continue; }
      const twelve = refine(raw).filter((i) => isFactPath(i.path));
      const { result: eight, fieldOf } = collectWithFields(() => validateNblStateHistory(a, "자산", { transferDate: e.transfer, floorDate: "2014-01-01" }));
      const eightField = eight !== null ? fieldOf(eight) : undefined;
      const eightFact = typeof eightField === "string" && /\.demolished\w+Before$/.test(eightField) ? eightField : undefined;
      if (twelve.length > 0) seen.twelve++;
      if (eightFact) seen.eight++;
      // (a) ⑫′ 400 ⇒ ⑧ 차단
      if (twelve.length > 0 && !eightFact) bad.push(`(a) ⑫ 400인데 ⑧ 통과 ${JSON.stringify(c)}`);
      // (b) 같은 칸 · 같은 문구
      if (twelve.length > 0 && eightFact && !(eight && eight.endsWith(twelve[0].message) && eightFact === `nblOtherStateEvents.${twelve[0].path[1]}.${twelve[0].path[2]}`)) bad.push(`(b) 칸·문구 불일치 ${JSON.stringify(c)}`);
      if (twelve.length === 0 && eightFact) bad.push(`(b') ⑧만 차단 ${JSON.stringify(c)}`);

      const { container } = render(<OtherLandStateHistorySection asset={a} onAssetChange={vi.fn()} transferDate={e.transfer} variant={c.card === "housing" ? "housing" : "other"} />);
      const drawn = [...container.querySelectorAll('[data-field^="nblOtherStateEvents."]')].map((n) => n.getAttribute("data-field")!).filter((f) => /\.demolished\w+Before$/.test(f)).map((f) => f.split(".").pop()!).sort();
      const required = (e.need[c.card === "otherBuilding" ? "building" : "house"] as readonly (keyof typeof FIELD_OF)[]).map((k) => FIELD_OF[k]).sort();
      const drawnFields = container.querySelectorAll('[data-testid^="nbl-other-state-event-2-demolished-"], [data-testid^="nbl-other-state-event-1-demolished-"]');
      void drawnFields;
      // 바닥면적 칸은 FieldCard 앵커(`field=`)라 위 선택자가 같이 잡는다.
      if (c.read === "read") {
        if (JSON.stringify(drawn) !== JSON.stringify(required)) bad.push(`(c) 그린 칸 ≠ 요구 칸 ${JSON.stringify(c)} drawn=${drawn} required=${required}`);
        if (drawn.length > 0) seen.rendered++;
        if (eightFact) {
          seen.blockedAnchorChecked++;
          if (!container.querySelector(`[data-field="${eightFact}"]`)) bad.push(`(c') ⑧이 가리키는 칸이 화면에 없다 ${JSON.stringify(c)} ${eightFact}`);
        }
      } else {
        if (drawn.length > 0) bad.push(`(d) 엔진이 읽지 않는데 사실 칸을 그렸다 ${JSON.stringify(c)} ${drawn}`);
        if (eightFact || twelve.length > 0) bad.push(`(d') 엔진이 읽지 않는데 요구했다 ${JSON.stringify(c)}`);
        seen.hiddenNotRead++;
      }
      cleanup();
    }
    expect(bad).toEqual([]);
    // 공허 방지 — 격자가 ⑧·⑫′ 양쪽이 막는 칸 · 사실 칸을 그리는 칸 · 읽지 않아 숨기는 칸을 모두 지난다
    expect(seen.eight).toBeGreaterThan(20);
    expect(seen.twelve).toBe(seen.eight);
    expect(seen.rendered).toBeGreaterThanOrEqual(30);
    expect(seen.blockedAnchorChecked).toBe(seen.eight);
    expect(seen.hiddenNotRead).toBeGreaterThan(40);
  });

  it("⑧ 통과 ∧ ⑫′ 400인 격자 행 0 · ⑫′ 통과 ∧ ⑧ 차단인 행 0 — 엔진이 읽는 이력의 사실 칸은 같은 술어를 쓴다", () => {
    let eightPassTwelveFail = 0;
    let eightFailTwelvePass = 0;
    for (const c of GRID) {
      const a = cellAsset(c);
      const e = ERAS[c.era];
      const raw = buildNonBusinessLandRaw(a, e.transfer)!;
      const twelve = refine(raw).some((i) => isFactPath(i.path));
      const { result: eight, fieldOf } = collectWithFields(() => validateNblStateHistory(a, "자산", { transferDate: e.transfer, floorDate: "2014-01-01" }));
      const f = eight !== null ? fieldOf(eight) : undefined;
      const eightFact = typeof f === "string" && /\.demolished\w+Before$/.test(f);
      if (!eightFact && twelve) eightPassTwelveFail++;
      if (eightFact && !twelve) eightFailTwelvePass++;
    }
    expect({ eightPassTwelveFail, eightFailTwelvePass }).toEqual({ eightPassTwelveFail: 0, eightFailTwelvePass: 0 });
  });
});

// ── F. ⑦ 결과 구간표 ─────────────────────────────────────────────────────────

describe("E3f-2 U-3 F — ⑦ 결과 구간표: 인정 창·한시 기간(엔진 echo)", () => {
  function echoOf(a: AssetForm, transferDate: string) {
    const raw = buildNonBusinessLandRaw(a, transferDate)!;
    const input = buildNblEngineInput(raw as never)!;
    return judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES).periodEvaluation!.stateHistory!;
  }
  const renderTable = (h: ReturnType<typeof echoOf>) =>
    render(<NblStateHistoryPeriodTable stateHistory={h} totalOwnershipDays={3651} effectiveBusinessDays={775} gracePeriodDays={0} isNonBusiness={false} />);

  it("K-1(창 2022-12-15 ~ 2023-06-15 183일): 구간 행에 한시 지위 인정 창 · 한시 기간 6개월 — 사업용 일수는 엔진 echo(창 구간 183일)", () => {
    const h = echoOf(K1({ demolishedPermitBefore: "yes" }), T_K1);
    renderTable(h);
    const bareIdx = h.intervals.findIndex((iv) => iv.temporaryStatusWindow);
    expect(bareIdx).toBeGreaterThanOrEqual(0);
    const row = screen.getByTestId(`nbl-state-history-interval-${bareIdx}`).textContent!;
    expect(row).toContain("한시 지위 인정 2022-12-15 ~ 2023-06-15(183일 · 한시 기간 6개월)");
    expect(row).toContain("별도합산(나대지 — 철거·멸실 근거 · 한시 기간만)");
    expect(row).toContain("183일");
    expect(row).toContain("일부 사업용");
  });

  it("접힌 구간은 창 표시 없이 엔진 사유 문구(재산세 구분 열 · 종합합산 + 사유)", () => {
    const h = echoOf(K1({ demolishedPermitBefore: "no" }), T_K1);
    renderTable(h);
    expect(document.querySelector('[data-testid$="-temporary-status"]')).toBeNull();
    expect(document.body.textContent).toContain("허가·사용승인 미확인");
  });
});
