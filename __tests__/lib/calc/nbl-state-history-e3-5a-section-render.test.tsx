// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-1a UI-N(U-1) — ⑤ 위젯 anchor. 새 입력 0 · 판정·세액 불변 — 안내만 바뀐다.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.ui.plan.md §4.1 N-1·N-2·N-3 · §9 X-1~X-6 · §11.1
 *
 *   N-1  꼬리 근거 «철거ㆍ멸실» 안내 = 엔진 `demolishedStatusNotice(양도일)`(양도일 시행본 연혁) — 경계 쌍 4개 · 양도일 미입력 = 연혁 한 줄 변형
 *   N-2  철거 행 + 9호 유예 행 부재 + (이 지목이 유예를 읽음 ∧ 의제 아님 ∧ 엔진이 이력을 읽음) 조건부 안내 — 저장값 존재 여부만 본다(기산일 일치는 판정하지 않는다)
 *   N-3  나대지 구간 근거 hint 보충 — 꼬리 칸이 근거 «철거ㆍ멸실»을 선택지로 줄 때만
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { HousingLandDetailSection } from "@/components/calc/transfer/nbl/HousingLandDetailSection";
import { OtherLandStateHistorySection } from "@/components/calc/transfer/nbl/OtherLandStateHistorySection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import {
  NBL_PTAX_DEMOLISHED_STATUS_GRACE_DIRECTION_NOTE,
  NBL_STATE_HISTORY_BARE_DEMOLISHED_TAIL_ONLY_NOTE,
  NBL_STATE_HISTORY_DEMOLITION_GRACE_NUDGE_NOTICE,
  NBL_STATE_HISTORY_GRACE_ROW_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE, demolishedStatusNotice } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { NBL } from "@/lib/tax-engine/legal-codes";
import { parseISO } from "@/lib/tax-engine/utc-date";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { e35Tail } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-5-table";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";

afterEach(cleanup);

type Ev = NblOtherStateEventInput;
const built = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "", ...extra });
const removed = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: "separate", ...extra });
const taxChanged = (date: string): Ev => ({ kind: "tax_type_changed", date, propertyTaxTypeBefore: "separate" });
const house = (date: string, footprint: string): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: "", buildingKindBefore: "house", houseFootprintBefore: footprint });
type Grace = NonNullable<AssetForm["nblGracePeriods"]>[number];
const demolitionGrace = (anchorDate: string): Grace => ({ reasonCode: "demolition", anchorDate, endDate: "", description: "" });
const otherGrace: Grace = { reasonCode: "other_justifiable", anchorDate: "2016-01-01", endDate: "", description: "" };

const id = (s: string) => screen.queryByTestId(s);
const text = (s: string) => screen.getByTestId(s).textContent;

/** 기타토지 1,000㎡ · 일반주거 · 이력 «바뀐 적 있음» — 사건 목록·꼬리 선언은 케이스가 정한다. */
const other = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2014-01-01",
    acquisitionArea: "1000",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherHasBuilding: true,
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [removed("2016-01-01"), built("2020-01-01")],
    ...over,
  }) as AssetForm;
const mountOther = (a: AssetForm, onChange = vi.fn(), transferDate: string | undefined = "2024-01-01") =>
  render(<OtherLandDetailSection asset={a} onAssetChange={onChange} transferDate={transferDate} />);

/** 주택부수토지 500㎡ · 정착 100㎡ · 수도권 밖 일반주거(5배 → 허용 500㎡ — 이내). */
const housing = (over: Partial<AssetForm> = {}): AssetForm =>
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
    nblOtherStateEvents: [{ kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "", houseFootprintBefore: "100" }, built("2020-01-01")],
    ...over,
  }) as AssetForm;
const mountHousing = (a: AssetForm, onChange = vi.fn(), transferDate: string | undefined = "2024-01-01") =>
  render(<HousingLandDetailSection asset={a} onAssetChange={onChange} transferDate={transferDate} />);

const NUDGE = (i: number) => `nbl-other-state-event-${i}-grace-nudge`;

describe("N-1 — 꼬리 근거 «철거ㆍ멸실» 안내 = 엔진 `demolishedStatusNotice(양도일)` (시행본 연혁)", () => {
  const tail = (over: Partial<AssetForm> = {}) =>
    other({ nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: false, nblOtherStateHistoryMode: "", nblOtherStateEvents: [], nblOtherPropertyTaxBasis: "demolished", ...over });
  const shown = (transferDate: string | undefined) => {
    cleanup();
    // 기본 인자(`= "2024-01-01"`)가 undefined를 덮지 않도록 직접 렌더한다.
    render(<OtherLandDetailSection asset={tail()} onAssetChange={vi.fn()} transferDate={transferDate} />);
    return text("nbl-other-tax-basis-demolished-notice");
  };

  it.each([
    ["2016-05-31", "2016-06-01"],
    ["2019-05-31", "2019-06-01"],
    ["2024-05-31", "2024-06-01"],
    ["2026-05-31", "2026-06-01"],
  ])("경계 쌍 %s / %s — 하루 사이에 문구가 갈리고 각각 엔진 함수와 바이트 동일", (before, on) => {
    const a = shown(before);
    const b = shown(on);
    expect(a).toBe(demolishedStatusNotice(parseISO(before)));
    expect(b).toBe(demolishedStatusNotice(parseISO(on)));
    expect(a).not.toBe(b);
  });

  it("양도일 미입력(\"\" · undefined) = 연혁 한 줄 변형 — 단일 시행본을 단정하지 않는다", () => {
    expect(shown("")).toBe(NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE);
    expect(shown(undefined)).toBe(NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE);
  });

  it("종전 고정 문구(«1년·빈집 3년 한시 지위»)는 더는 양도일과 무관하게 나오지 않는다 — 2026-05-31 양도는 «1년»이 아니다", () => {
    mountOther(tail(), vi.fn(), "2026-05-31");
    expect(document.body.textContent).not.toContain("철거일(1년·빈집 3년 한시 지위)은 판정하지 않습니다");
    expect(text("nbl-other-tax-basis-demolished-notice")).not.toContain("1년이 지나지 않은");
  });

  it("입력 방향(9호) 한 줄이 붙는다 · 철거ㆍ멸실이 아닌 근거(공지상태)면 안내가 없다", () => {
    mountOther(tail(), vi.fn(), "2024-01-01");
    expect(text("nbl-other-tax-basis-demolished-direction")).toBe(NBL_PTAX_DEMOLISHED_STATUS_GRACE_DIRECTION_NOTE);
    cleanup();
    mountOther(tail({ nblOtherPropertyTaxBasis: "vacant_state" }), vi.fn(), "2024-01-01");
    expect(id("nbl-other-tax-basis-demolished-notice")).toBeNull();
  });

  it("화면 렌더가 store에 쓰지 않는다(`useEffect → store` 없음) — onChange 0회", () => {
    const onChange = vi.fn();
    mountOther(tail(), onChange, "2024-01-01");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("N-2 — 철거 행 + 9호 유예 부재 조건부 안내 (X-1~X-6)", () => {
  it("X-1 철거 행 + 9호 없음 → 안내(엔진 상수 · amber 카드 안) · 신축 행에는 없다", () => {
    const onChange = vi.fn();
    mountOther(other(), onChange);
    expect(text(NUDGE(0))).toBe(NBL_STATE_HISTORY_DEMOLITION_GRACE_NUDGE_NOTICE);
    expect(id(NUDGE(1))).toBeNull();
    expect(onChange, "렌더가 유예를 자동 생성하지 않는다").not.toHaveBeenCalled();
  });

  it("X-1b 구분 변경 행 · 이력 «바뀐 적 없음» · 사건 없음 → 안내 없음", () => {
    mountOther(other({ nblOtherStateEvents: [built("2015-01-01"), taxChanged("2021-01-01")] }));
    expect(id(NUDGE(0))).toBeNull();
    expect(id(NUDGE(1))).toBeNull();
    cleanup();
    mountOther(other({ nblOtherStateHistoryMode: "unchanged" }));
    expect(id(NUDGE(0))).toBeNull();
  });

  it("X-2 철거 행 + 9호 행 있음 → 숨음(기산일이 철거일과 달라도 — UV-9 허용 한계) · 다른 사유 행만 있으면 그대로 보임", () => {
    mountOther(other({ nblGracePeriods: [demolitionGrace("2016-01-01")] }));
    expect(id(NUDGE(0))).toBeNull();
    cleanup();
    mountOther(other({ nblGracePeriods: [demolitionGrace("2001-01-01")] }));
    expect(id(NUDGE(0)), "기산일 불일치는 판정하지 않는다").toBeNull();
    cleanup();
    mountOther(other({ nblGracePeriods: [otherGrace] }));
    expect(id(NUDGE(0))).not.toBeNull();
  });

  it("X-3 철거 행 2건 + 9호 없음 → 행마다 안내 · 9호가 생기면 둘 다 숨는다", () => {
    const events = [removed("2016-01-01"), built("2018-01-01"), removed("2020-01-01")];
    mountOther(other({ nblOtherStateEvents: events }));
    expect(id(NUDGE(0))).not.toBeNull();
    expect(id(NUDGE(1))).toBeNull();
    expect(id(NUDGE(2))).not.toBeNull();
    cleanup();
    mountOther(other({ nblOtherStateEvents: events, nblGracePeriods: [demolitionGrace("2020-01-01")] }));
    expect(id(NUDGE(0))).toBeNull();
    expect(id(NUDGE(2))).toBeNull();
  });

  it("X-4 이 지목이 유예를 읽지 않는 지목(건물 부수토지) · 지목 미선택 → 안내 없음(섹션 직접 렌더)", () => {
    for (const nblLandType of ["building_site", ""] as const) {
      render(<OtherLandStateHistorySection asset={other({ nblLandType: nblLandType as AssetForm["nblLandType"] })} onAssetChange={vi.fn()} transferDate="2024-01-01" />);
      expect(id("nbl-other-state-history"), nblLandType).not.toBeNull();
      expect(id(NUDGE(0)), nblLandType).toBeNull();
      cleanup();
    }
    render(<OtherLandStateHistorySection asset={other()} onAssetChange={vi.fn()} transferDate="2024-01-01" />);
    expect(id(NUDGE(0)), "대조: 기타토지는 보인다").not.toBeNull();
  });

  it("X-5 의제 사유 + 이력 changed → 엔진이 이력을 읽지 않는다 — 의제 안내만, N-2 숨음", () => {
    mountOther(other({ nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2022-01-01" } as Partial<AssetForm>));
    expect(id("nbl-state-history-deemed-notice")).not.toBeNull();
    expect(id(NUDGE(0))).toBeNull();
  });

  it("X-6 core 부분 면적(철거 행이 주택) → 엔진이 이력을 읽지 않는다 → 숨음 · 이내(전량 사업용)면 보임", () => {
    const base = { nblOtherStateEvents: [house("2016-01-01", "50"), built("2020-01-01")], nblOtherPropertyTaxType: "separate", nblOtherBuildingValue: "100000000", nblOtherLandValue: "200000000" } as Partial<AssetForm>;
    mountOther(other({ ...base, nblOtherBuildingFloorArea: "100" })); // 허용 400㎡ < 1,000㎡
    expect(id("nbl-other-partial-area-notice")).not.toBeNull();
    expect(id(NUDGE(0))).toBeNull();
    cleanup();
    mountOther(other({ ...base, nblOtherBuildingFloorArea: "400" })); // 허용 1,600㎡ ≥ 1,000㎡
    expect(id("nbl-other-partial-area-notice")).toBeNull();
    expect(id(NUDGE(0))).not.toBeNull();
  });

  it("X-7 주택부수토지 카드 — 철거 행 + 9호 없음 → 보임 · 9호가 있으면 숨음 · 양도일 현재 배율 초과(이력 미반영)면 숨음", () => {
    mountHousing(housing());
    expect(text(NUDGE(0))).toBe(NBL_STATE_HISTORY_DEMOLITION_GRACE_NUDGE_NOTICE);
    cleanup();
    mountHousing(housing({ nblGracePeriods: [demolitionGrace("2016-01-01")] }));
    expect(id(NUDGE(0))).toBeNull();
    cleanup();
    mountHousing(housing({ nblHousingFootprint: "40" })); // 허용 200㎡ < 500㎡
    expect(id("nbl-housing-area-exceeded-notice")).not.toBeNull();
    expect(id(NUDGE(0))).toBeNull();
  });

  it("상시 고지 `GRACE_ROW_NOTICE`는 바이트 동일 — 조건부 안내와 별개로 항상 보인다", () => {
    mountOther(other({ nblGracePeriods: [demolitionGrace("2016-01-01")] }));
    expect(text("nbl-state-history-grace-row-notice")).toBe(NBL_STATE_HISTORY_GRACE_ROW_NOTICE);
    expect(NBL_STATE_HISTORY_GRACE_ROW_NOTICE).toBe(
      "건축물 철거·신축 사건을 입력해도 유예기간은 자동으로 만들지 않습니다. 유예 사유에 해당하면 「부득이한 사유 유예기간」에 직접 입력하세요 — " +
        "철거는 철거일을 기산일로 「건축물 멸실·철거·붕괴」(9호), 건축은 착공일부터 준공일까지를 「건설 착공」(5호)으로 입력하면 사건 구간과 경계가 맞습니다 (" +
        NBL.UNAVOIDABLE_PERIOD +
        ").",
    );
  });
});

describe("N-3 — 나대지 구간 근거 hint 보충 (꼬리 칸이 근거 «철거ㆍ멸실»을 줄 때만)", () => {
  const withBareRow = (over: Partial<AssetForm> = {}) =>
    other({ nblOtherPropertyTaxType: "separate", nblOtherStateEvents: [built("2018-01-01", { propertyTaxTypeBefore: "separate" }), removed("2022-01-01")], nblOtherHasBuilding: false, ...over });

  it("꼬리가 별도합산 + 건축물 없음(양도일 현재 철거 뒤) → 보충 문장이 보인다 · 구간 근거 hint의 종전 문장은 그대로", () => {
    mountOther(withBareRow());
    expect(id("nbl-other-state-event-0-basis-vacant_state")).not.toBeNull();
    const body = document.body.textContent ?? "";
    expect(body).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_TAIL_ONLY_NOTE);
    expect(body).toContain("철거 후 한시 별도합산·건축 중 기간은 근거로 받지 않고 「부득이한 사유 유예기간」으로 입력합니다.");
  });

  it("꼬리 칸이 근거 «철거ㆍ멸실»을 주지 않으면(종합합산 · 건축물 있음) 보충이 없다 — 모순이 없는 화면에 모순 문구를 만들지 않는다", () => {
    mountOther(withBareRow({ nblOtherPropertyTaxType: "comprehensive" }));
    expect(document.body.textContent).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_TAIL_ONLY_NOTE);
    cleanup();
    mountOther(withBareRow({ nblOtherStateEvents: [built("2018-01-01", { propertyTaxTypeBefore: "separate" })] })); // 양도일 현재 건축물 있음
    expect(id("nbl-other-state-event-0-basis-vacant_state")).not.toBeNull();
    expect(document.body.textContent).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_TAIL_ONLY_NOTE);
  });
});

describe("N-2의 존재 이유 — 철거 행만 넣고 9호를 빠뜨리면 같은 거래의 세액이 갈린다 (계획서 §1.2 S23 / S22 · 양도 2025-06-01 · 철거 2018-01-01 · 꼬리 종합합산)", () => {
  const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
  const taxOf = (input: NonBusinessLandInput) =>
    calculateTransferTax(
      baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
      makeMockRates(),
    ).calculatedTax;
  const tail = { nblOtherPropertyTaxType: "comprehensive", nblOtherPropertyTaxBasis: "", nblOtherDemolishedFloorArea: "" };

  it("S23 9호 없음 = 비사업용 246,680,000 · S22 철거일 기산 9호 = 사업용 192,330,000 — 차 54,350,000(안내가 입력을 권하는 이유)", () => {
    const s23 = fromRaw(e35Tail("2018-01-01", "2025-06-01", undefined, tail));
    const s22 = fromRaw(e35Tail("2018-01-01", "2025-06-01", undefined, { ...tail, nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2018-01-01" }] }));
    expect(judgeNonBusinessLand(s23, DEFAULT_NON_BUSINESS_LAND_RULES).isNonBusinessLand).toBe(true);
    expect(judgeNonBusinessLand(s22, DEFAULT_NON_BUSINESS_LAND_RULES).isNonBusinessLand).toBe(false);
    expect([taxOf(s23), taxOf(s22)]).toEqual([246_680_000, 192_330_000]);
    expect(taxOf(s23) - taxOf(s22)).toBe(54_350_000);
  });
});
