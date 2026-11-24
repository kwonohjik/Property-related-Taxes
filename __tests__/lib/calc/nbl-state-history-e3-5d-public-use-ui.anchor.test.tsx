// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-3 U-4 — 빈집정비 철거 빈집 부속토지 «국가 등 공용·공공용 사용» 예외(영 §103의2 2호 단서) 하위 4칸(⑤)의 UI anchor.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-5d-vacant-public-use.ui.plan.md §3 · §5.1 · 엔진 계획서 §0.0 · §5
 *
 *  A  노출 — 엔진 `demolishedPublicUseAsked` 사슬(건축 외 용도 «예» → 빈집정비 «예» → 공용 사용 «예» → 유료 «예») · 앵커 = ⑧ 점프 키 · 순서 = ⑧ 첫 빈칸 순서 · 주택부수토지 카드(V-15) · 시행본·이력 읽기 게이트
 *  B  쓰기 — onChange 시점 키 1개 · 상위 답이 바뀌어도 하위 값은 지우지 않는다(숨은 값 보존·복원) · 재산세 구분 변경만 4키 리셋
 *  C  미리보기 — 사실 칸이 모두 답해진 뒤에만 · 창은 공용 사용 기간으로 한정(echo) + 라벨 + 고지 · 유료 «아니오»·«모름» 접힘 + 비과세 안내 · 사용 기간에 과세기준일 없음 접힘
 *  D  ⑧↔⑫′ parity × ⑤ 렌더 격자 — 그려진 칸 집합 = 요구 칸 집합 · ⑧이 가리키는 칸은 반드시 그려진다
 *  E  ⑦ 결과 구간표 — 라벨 «한시 기간 중 공용 사용 기간만»(엔진 echo)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { z } from "zod";
import { OtherLandStateHistorySection } from "@/components/calc/transfer/nbl/OtherLandStateHistorySection";
import { NblStateHistoryPeriodTable } from "@/components/calc/NblStateHistoryPeriodTable";
import { refineNonBusinessLandRaw, type NblRawRefineInput } from "@/lib/api/transfer-tax-schema-nbl-refines";
import { stateHistoryWireFields } from "@/lib/calc/nbl-other-state-history-scope";
import { buildNblEngineInput, buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { validateNblStateHistory } from "@/lib/calc/transfer-tax-validate-nbl-state-history";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { BARE_DEMOLISHED_FOLD_NOTICE } from "@/lib/tax-engine/non-business-land/state-history-echo";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

afterEach(cleanup);

type Ev = NblOtherStateEventInput;
const built = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "", ...extra });
const removed = (date: string, extra: Partial<Ev> = {}): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: "separate", ...extra });
const houseRemoved = (date: string): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: "", buildingKindBefore: "house", houseFootprintBefore: "400" });
const closing = (kind: Ev["kind"], date: string, extra: Partial<Ev> = {}): Ev => ({ kind, date, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...extra });

const BASE = makeDefaultAsset(1);
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
const factAnchors = () =>
  [...document.querySelectorAll('[data-field^="nblOtherStateEvents."]')]
    .map((e) => e.getAttribute("data-field")!)
    .filter((f) => /\.demolished\w+Before$/.test(f))
    .map((f) => f.split(".").pop()!);
const PU = ["demolishedPublicUseBefore", "demolishedPublicUsePaidBefore", "demolishedPublicUseFromBefore", "demolishedPublicUseToBefore"];
const puAnchors = () => factAnchors().filter((f) => PU.includes(f));

/** 2024.6.1.~ 시행본 — 철거 2024-01-15 · 닫는 행 2024-09-01 · 양도 2024-12-01(후보 과세기준일 2024-06-01). 주택 철거 행 + 허가·건축 외 용도·빈집정비 «예». */
const T = "2024-12-01";
const PRE = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes" } as const;
const HOUSE = (facts: Partial<Ev> = {}) => other({ nblOtherStateEvents: [built("2016-01-01"), houseRemoved("2024-01-15"), closing("building_built", "2024-09-01", { ...PRE, ...facts })] });
const BUILDING = (facts: Partial<Ev> = {}) => other({ nblOtherStateEvents: [built("2016-01-01"), removed("2024-01-15"), closing("building_built", "2024-09-01", { ...PRE, demolishedFloorAreaBefore: "250", ...facts })] });
const HOUSING = (facts: Partial<Ev> = {}) =>
  housing({ nblOtherStateEvents: [{ kind: "building_removed", date: "2024-01-15", propertyTaxTypeBefore: "", houseFootprintBefore: "250" }, closing("building_built", "2024-09-01", { ...PRE, ...facts })] });
const FULLCHAIN = { demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes", demolishedPublicUseFromBefore: "2024-04-01", demolishedPublicUseToBefore: "2024-12-01" } as const;

// ── A. 노출 ─────────────────────────────────────────────────────────────────

describe("E3f-3 U-4 A — 하위 4칸 노출 ≡ 엔진 사슬(`demolishedPublicUseAsked`) · 앵커 = ⑧ 점프 키 · 순서 = ⑧ 첫 빈칸 순서", () => {
  it("주택 철거 행 + 허가 «예» + 건축 외 용도 «예» + 빈집정비 «예» → 공용 사용 칸만(유료·날짜 칸은 아직 없다) · 빈집정비 칸 바로 뒤", () => {
    mount(HOUSE(), T);
    expect(factAnchors()).toEqual(["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedVacantHouseBefore", "demolishedPublicUseBefore"]);
    expect(id("nbl-other-state-event-2-demolished-publicuse")).not.toBeNull();
    for (const v of ["yes", "no", "unknown"]) expect(id(`nbl-other-state-event-2-demolished-publicuse-${v}`)).not.toBeNull();
    expect(id("nbl-other-state-event-2-demolished-publicusepaid-yes")).toBeNull();
    expect(id("nbl-other-state-event-2-demolished-publicuse-from")).toBeNull();
    // 미선택 = 라디오 어느 것도 선택되지 않음(기본값 없음)
    for (const v of ["yes", "no", "unknown"]) expect(screen.getByTestId(`nbl-other-state-event-2-demolished-publicuse-${v}`).getAttribute("aria-checked") ?? screen.getByTestId(`nbl-other-state-event-2-demolished-publicuse-${v}`).getAttribute("data-state")).not.toBe("true");
  });

  it("공용 사용 «예» → 유료 칸 · 유료 «예» → 개시일·종료일 칸(둘 다 필수 표시) — 앵커는 ⑧ 점프 키와 같다 · DOM 순서 = ⑧ 순서", () => {
    mount(HOUSE({ demolishedPublicUseBefore: "yes" }), T);
    expect(puAnchors()).toEqual(["demolishedPublicUseBefore", "demolishedPublicUsePaidBefore"]);
    cleanup();
    mount(HOUSE({ demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes" }), T);
    expect(puAnchors()).toEqual(["demolishedPublicUseBefore", "demolishedPublicUsePaidBefore", "demolishedPublicUseFromBefore", "demolishedPublicUseToBefore"]);
    expect(factAnchors().slice(0, 3)).toEqual(["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedVacantHouseBefore"]);
    for (const f of ["From", "To"]) {
      const card = document.querySelector(`[data-field="nblOtherStateEvents.2.demolishedPublicUse${f}Before"]`)!;
      expect(card.getAttribute("data-slot"), "FieldCard 앵커").toBe("field-card");
      expect(card.textContent, "필수 표시(*)").toContain("*");
      expect(document.querySelectorAll(`[data-field="nblOtherStateEvents.2.demolishedPublicUse${f}Before"]`), "앵커 중복 금지").toHaveLength(1);
    }
    expect(text("nbl-other-state-event-2-demolished-publicuse").includes("종료일 빈칸은 구간 끝으로 읽지 않습니다")).toBe(true);
    expect(text("nbl-other-state-event-2-demolished-publicuse").includes("그 구간의 토지 전부")).toBe(true);
    expect(text("nbl-other-state-event-2-demolished-publicuse").includes("계약서 등으로 입증")).toBe(true);
    expect(text("nbl-other-state-event-2-demolished-publicuse").includes("비과세·면제 토지")).toBe(true);
  });

  it.each([
    ["건축 외 용도 «아니오»", { demolishedOtherUseBefore: "no" }],
    ["건축 외 용도 «모름»", { demolishedOtherUseBefore: "unknown" }],
    ["건축 외 용도 미선택", { demolishedOtherUseBefore: "" }],
    ["빈집정비 «아니오»", { demolishedVacantHouseBefore: "no" }],
    ["빈집정비 «모름»", { demolishedVacantHouseBefore: "unknown" }],
    ["빈집정비 미선택", { demolishedVacantHouseBefore: "" }],
  ] as [string, Partial<Ev>][])("상위 답이 사슬을 끊으면(%s) 하위 4칸이 없다 — 저장된 하위 값이 남아 있어도", (_n, over) => {
    mount(HOUSE({ ...FULLCHAIN, ...over }), T);
    expect(puAnchors()).toEqual([]);
    expect(id("nbl-other-state-event-2-demolished-publicuse")).toBeNull();
  });

  it.each([
    ["공용 사용 «아니오»", { demolishedPublicUseBefore: "no" }, ["demolishedPublicUseBefore"]],
    ["공용 사용 «모름»", { demolishedPublicUseBefore: "unknown" }, ["demolishedPublicUseBefore"]],
    ["공용 사용 미선택", { demolishedPublicUseBefore: "" }, ["demolishedPublicUseBefore"]],
    ["유료 «아니오»(무상)", { demolishedPublicUsePaidBefore: "no" }, ["demolishedPublicUseBefore", "demolishedPublicUsePaidBefore"]],
    ["유료 «모름»", { demolishedPublicUsePaidBefore: "unknown" }, ["demolishedPublicUseBefore", "demolishedPublicUsePaidBefore"]],
    ["유료 미선택", { demolishedPublicUsePaidBefore: "" }, ["demolishedPublicUseBefore", "demolishedPublicUsePaidBefore"]],
  ] as [string, Partial<Ev>, string[]][])("하위 답이 사슬을 끊으면(%s) 그 뒤 칸이 없다", (_n, over, expected) => {
    mount(HOUSE({ ...FULLCHAIN, ...over }), T);
    expect(puAnchors()).toEqual(expected);
  });

  it("비주택 건축물 철거 행은 빈집정비 칸이 없어 하위 4칸도 없다 — 건축 외 용도 «예»여도", () => {
    mount(BUILDING({ ...FULLCHAIN }), T);
    expect(factAnchors()).toEqual(["demolishedPermitBefore", "demolishedOtherUseBefore", "demolishedFloorAreaBefore"]);
    expect(id("nbl-other-state-event-2-demolished-publicuse")).toBeNull();
  });

  it("주택부수토지 카드(V-15 — 모든 철거 행이 주택): 같은 사슬로 4칸이 열린다", () => {
    mount(HOUSING({ ...FULLCHAIN }), T, vi.fn(), "housing");
    expect(puAnchors()).toEqual(PU.map((f) => f));
    expect(document.querySelector('[data-field="nblOtherStateEvents.1.demolishedPublicUseToBefore"]')).not.toBeNull();
  });

  it("시행본 게이트 — 철거·구간이 단서 시행 전(후보 과세기준일 2023-06-01만)이면 건축 외 용도·빈집정비 칸이 없어 하위 칸도 없다", () => {
    const pre = other({ nblOtherStateEvents: [built("2016-01-01"), houseRemoved("2022-12-15"), closing("building_built", "2023-12-01", { ...PRE, ...FULLCHAIN })] });
    mount(pre, "2024-01-01");
    expect(factAnchors()).toEqual(["demolishedPermitBefore"]);
    expect(puAnchors()).toEqual([]);
  });

  it("엔진이 이력을 읽지 않으면(core 부분 면적) 하위 4칸도 그리지 않는다 — 값은 보존", () => {
    const partial = { ...HOUSE({ ...FULLCHAIN }), nblOtherBuildingFloorArea: "100" } as AssetForm;
    mount(partial, T);
    expect(factAnchors()).toEqual([]);
    expect(partial.nblOtherStateEvents[2].demolishedPublicUseToBefore).toBe("2024-12-01");
  });

  it("③ 건축 외 용도 hint — 주택 철거 행에서만 «빈집정비 칸에서 예를 고르면 국가 등 공공용 사용 예외를 추가로 묻습니다» 한 줄 · 비주택 행은 종전 문구 그대로(바이트 보존)", () => {
    mount(HOUSE(), T);
    const cardOf = () => document.querySelector('[data-field="nblOtherStateEvents.2.demolishedOtherUseBefore"]')!.closest('[data-slot="field-card"]')!.textContent!;
    expect(cardOf()).toContain("빈집정비사업으로 철거한 빈집이면 아래 빈집정비 칸에서 «예»를 고르면 국가 등 공공용 사용 예외를 추가로 묻습니다.");
    cleanup();
    mount(BUILDING(), T);
    expect(cardOf()).not.toContain("공공용 사용 예외");
    expect(cardOf()).toContain("모름은 인정하지 않고 확인 필요로 표시합니다.");
  });

  it("입력칸에 placeholder 숫자 예시가 없다(라디오 + 공용 DateInput의 형식 표시 YYYY·MM·DD만)", () => {
    mount(HOUSE({ ...FULLCHAIN }), T);
    const block = screen.getByTestId("nbl-other-state-event-2-demolished-publicuse");
    const placeholders = [...block.querySelectorAll("input")].map((n) => n.getAttribute("placeholder")).filter(Boolean);
    expect(new Set(placeholders)).toEqual(new Set(["YYYY", "MM", "DD"]));
  });
});

// ── B. 쓰기 ─────────────────────────────────────────────────────────────────

describe("E3f-3 U-4 B — onChange 시점 키 1개 쓰기 · 숨은 값 보존·복원 · 재산세 구분 변경만 4키 리셋", () => {
  it("공용 사용·유료 라디오 → 그 행의 키 1개만 쓴다", () => {
    const onChange = vi.fn();
    const a = HOUSE();
    mount(a, T, onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-2-demolished-publicuse-yes"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const events = onChange.mock.calls[0][0].nblOtherStateEvents as Ev[];
    expect(events[2]).toEqual({ ...a.nblOtherStateEvents[2], demolishedPublicUseBefore: "yes" });
    expect(events.slice(0, 2)).toEqual(a.nblOtherStateEvents.slice(0, 2));
    cleanup();
    const onChange2 = vi.fn();
    mount(HOUSE({ demolishedPublicUseBefore: "yes" }), T, onChange2);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-2-demolished-publicusepaid-no"));
    expect((onChange2.mock.calls[0][0].nblOtherStateEvents as Ev[])[2].demolishedPublicUsePaidBefore).toBe("no");
  });

  it("날짜 칸 → ISO 문자열 그대로 쓴다(개시일·종료일 각각)", () => {
    const onChange = vi.fn();
    mount(HOUSE({ demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes" }), T, onChange);
    const from = screen.getByTestId("nbl-other-state-event-2-demolished-publicuse-from");
    fireEvent.change(within(from).getByLabelText("연도"), { target: { value: "2024" } });
    fireEvent.change(within(from).getByLabelText("월"), { target: { value: "03" } });
    fireEvent.change(within(from).getByLabelText("일"), { target: { value: "05" } });
    expect((onChange.mock.calls.at(-1)![0].nblOtherStateEvents as Ev[])[2].demolishedPublicUseFromBefore).toBe("2024-03-05");
    cleanup();
    const onChange2 = vi.fn();
    mount(HOUSE({ ...FULLCHAIN }), T, onChange2);
    const to = screen.getByTestId("nbl-other-state-event-2-demolished-publicuse-to");
    fireEvent.change(within(to).getByLabelText("일"), { target: { value: "15" } });
    const row = (onChange2.mock.calls.at(-1)![0].nblOtherStateEvents as Ev[])[2];
    expect(row.demolishedPublicUseToBefore).toBe("2024-12-15");
    expect(row.demolishedPublicUseFromBefore, "다른 칸 불변").toBe("2024-04-01");
  });

  it("상위 답을 바꿔 하위 칸이 사라져도 저장값은 지우지 않는다(④는 보내지 않는다) — 되돌리면 복원", () => {
    const onChange = vi.fn();
    const a = HOUSE({ ...FULLCHAIN });
    mount(a, T, onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-2-demolished-vacanthouse-no"));
    const row = (onChange.mock.calls[0][0].nblOtherStateEvents as Ev[])[2];
    expect(row.demolishedVacantHouseBefore).toBe("no");
    expect(row).toEqual({ ...a.nblOtherStateEvents[2], demolishedVacantHouseBefore: "no" }); // 하위 4칸 값 그대로
    // ④ 와이어 — 사라진 하위 칸은 싣지 않는다
    const hidden = { ...a, nblOtherStateEvents: a.nblOtherStateEvents.map((e, i) => (i === 2 ? row : e)) } as AssetForm;
    const wire = stateHistoryWireFields(hidden).nblOtherStateEvents[2];
    for (const f of PU) expect(wire, f).not.toHaveProperty(f);
    // 되돌리면 복원 — 값이 그대로 와이어에 실린다
    const back = { ...hidden, nblOtherStateEvents: hidden.nblOtherStateEvents.map((e, i) => (i === 2 ? { ...e, demolishedVacantHouseBefore: "yes" as const } : e)) } as AssetForm;
    const wire2 = stateHistoryWireFields(back).nblOtherStateEvents[2];
    for (const f of PU) expect(wire2[f as keyof typeof wire2], f).toBe(FULLCHAIN[f as keyof typeof FULLCHAIN]);
    cleanup();
    mount(back, T);
    expect(puAnchors()).toEqual(PU);
  });

  it("④ 와이어 — 사슬이 연 칸만 싣는다(공용 사용 «아니오» → 유료·날짜 stale 비전송) · 키가 없던 행은 키를 만들지 않는다", () => {
    const w = (facts: Partial<Ev>) => stateHistoryWireFields(HOUSE(facts)).nblOtherStateEvents[2];
    expect(w({ ...FULLCHAIN, demolishedPublicUseBefore: "no" })).toMatchObject({ demolishedPublicUseBefore: "no" });
    for (const f of PU.slice(1)) expect(w({ ...FULLCHAIN, demolishedPublicUseBefore: "no" }), f).not.toHaveProperty(f);
    for (const f of PU.slice(2)) expect(w({ ...FULLCHAIN, demolishedPublicUsePaidBefore: "no" }), f).not.toHaveProperty(f);
    expect(Object.keys(w({})).some((k) => PU.includes(k))).toBe(false);
  });

  it("재산세 구분을 바꾸면 하위 4칸도 키째 지운다 · 근거만 바꾸면 보존(되돌리면 복원)", () => {
    const onChange = vi.fn();
    mount(HOUSE({ ...FULLCHAIN }), T, onChange);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-2-ptax-comprehensive"));
    const row = (onChange.mock.calls[0][0].nblOtherStateEvents as Ev[])[2];
    expect(Object.keys(row).sort()).toEqual(["areaWithinLimitBefore", "date", "kind", "propertyTaxBasisBefore", "propertyTaxTypeBefore"]);
    cleanup();
    const onChange2 = vi.fn();
    const a = HOUSE({ ...FULLCHAIN });
    mount(a, T, onChange2);
    fireEvent.click(screen.getByTestId("nbl-other-state-event-2-basis-vacant_state"));
    const kept = (onChange2.mock.calls[0][0].nblOtherStateEvents as Ev[])[2];
    for (const f of PU) expect(kept[f as keyof Ev], f).toBe(FULLCHAIN[f as keyof typeof FULLCHAIN]);
  });
});

// ── C. 미리보기 ─────────────────────────────────────────────────────────────

describe("E3f-3 U-4 C — 미리보기: 사실 칸이 모두 답해진 뒤에만 · 창 = 공용 사용 기간 한정(엔진 echo) · 접힘 고지", () => {
  it("하위 칸이 비어 있으면 인정 창·접힘 고지를 보이지 않는다(선언 전 불이익 노출 금지)", () => {
    mount(HOUSE({ demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes" }), T);
    expect(id("nbl-other-state-event-2-demolished-window")).toBeNull();
    expect(id("nbl-other-state-event-2-demolished-fold-notice")).toBeNull();
    cleanup();
    mount(HOUSE({ demolishedPublicUseBefore: "yes" }), T);
    expect(id("nbl-other-state-event-2-demolished-window")).toBeNull();
  });

  it("종료일만 비면(개시일 입력) 여전히 미답 — 창을 보이지 않는다(종료일 빈칸은 구간 끝이 아니다)", () => {
    mount(HOUSE({ ...FULLCHAIN, demolishedPublicUseToBefore: "" }), T);
    expect(id("nbl-other-state-event-2-demolished-window")).toBeNull();
    expect(id("nbl-other-state-event-2-demolished-publicuse-accepted-notice")).toBeNull();
  });

  it("전부 답함 → 창은 공용 사용 기간으로 한정 · «국가 등 공용 사용 기간만» + 단서 인정 고지(엔진 상수) · 미리보기 표 라벨 «한시 기간 중 공용 사용 기간만»", () => {
    mount(HOUSE({ ...FULLCHAIN }), T);
    const win = text("nbl-other-state-event-2-demolished-window");
    expect(win).toContain("한시 지위 인정 기간: 2024-04-01 ~ 2024-08-31");
    expect(win).toContain("국가 등 공용 사용 기간만");
    expect(win).toContain("한시 기간 3년");
    expect(text("nbl-other-state-event-2-demolished-publicuse-accepted-notice")).toBe(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
    expect(id("nbl-other-state-event-2-demolished-fold-notice")).toBeNull();
    expect(screen.getByTestId("nbl-state-history-preview-row-2").textContent).toContain("별도합산(나대지 — 철거·멸실 근거 · 한시 기간 중 공용 사용 기간만) · 인정 2024-04-01 ~ 2024-08-31");
  });

  it("공용 사용 기간을 쓰지 않는 구간(유료 «아니오»)은 종전 라벨 · 단서 인정 고지 없음", () => {
    mount(HOUSE({ demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "no" }), T);
    expect(id("nbl-other-state-event-2-demolished-publicuse-accepted-notice")).toBeNull();
    expect(screen.getByTestId("nbl-state-history-preview-row-2").textContent).not.toContain("공용 사용 기간만");
  });

  it.each([
    ["공용 사용 «아니오»", { demolishedPublicUseBefore: "no" }],
    ["공용 사용 «모름»", { demolishedPublicUseBefore: "unknown" }],
    ["유료 «아니오»(무상)", { demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "no" }],
    ["유료 «모름»", { demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "unknown" }],
  ] as [string, Partial<Ev>][])("%s → 막지 않고 `demolished_other_use` 접힘 + 확인 필요(고지에 비과세·면제 토지 근거 안내) — 계산은 막히지 않는다", (_n, facts) => {
    const a = HOUSE(facts);
    mount(a, T);
    expect(text("nbl-other-state-event-2-demolished-fold-notice")).toBe(BARE_DEMOLISHED_FOLD_NOTICE.demolished_other_use);
    expect(text("nbl-other-state-event-2-demolished-fold-notice")).toContain("비과세·면제 토지");
    expect(id("nbl-other-state-event-2-demolished-window")).toBeNull();
    const { result } = collectWithFields(() => validateNblStateHistory(a, "자산", { transferDate: T, floorDate: "2014-01-01" }));
    expect(result, "⑧ 통과").toBeNull();
  });

  it("사용 기간에 한시 기간 중 과세기준일이 없으면 → 접힘 `demolished_public_use_no_base_date`(엔진 사유 · 문구는 엔진 상수)", () => {
    mount(HOUSE({ ...FULLCHAIN, demolishedPublicUseFromBefore: "2024-07-01", demolishedPublicUseToBefore: "2024-08-01" }), T);
    expect(text("nbl-other-state-event-2-demolished-fold-notice")).toBe(BARE_DEMOLISHED_FOLD_NOTICE.demolished_public_use_no_base_date);
    expect(id("nbl-other-state-event-2-demolished-window")).toBeNull();
  });
});

// ── D. ⑧ ↔ ⑫′ parity × 렌더 격자 ────────────────────────────────────────────

type Card = "otherHouse" | "housing" | "otherBuilding";
type Read = "read" | "notRead";
const VALUES = ["", "yes", "no", "unknown"] as const;
type V = (typeof VALUES)[number];
type DateCase = "valid" | "blankFrom" | "blankTo" | "invalidFrom" | "invalidTo" | "reversed";
const DATES: Record<DateCase, { from: string; to: string }> = {
  valid: { from: "2024-04-01", to: "2024-12-01" },
  blankFrom: { from: "", to: "2024-12-01" },
  blankTo: { from: "2024-04-01", to: "" },
  invalidFrom: { from: "2024-13-45", to: "2024-12-01" },
  invalidTo: { from: "2024-04-01", to: "내일" },
  reversed: { from: "2024-12-01", to: "2024-04-01" },
};
interface Cell { card: Card; read: Read; otherUse: V; vacant: V; publicUse: V; paid: V; date: DateCase }

function cellAsset(c: Cell): AssetForm {
  const facts: Partial<Ev> = {
    demolishedPermitBefore: "yes",
    ...(c.otherUse ? { demolishedOtherUseBefore: c.otherUse } : {}),
    ...(c.vacant ? { demolishedVacantHouseBefore: c.vacant } : {}),
    ...(c.publicUse ? { demolishedPublicUseBefore: c.publicUse } : {}),
    ...(c.paid ? { demolishedPublicUsePaidBefore: c.paid } : {}),
    demolishedPublicUseFromBefore: DATES[c.date].from,
    demolishedPublicUseToBefore: DATES[c.date].to,
    ...(c.card === "otherBuilding" ? { demolishedFloorAreaBefore: "250" } : {}),
  };
  if (c.card === "housing") {
    return housing({
      nblHousingFootprint: c.read === "read" ? "250" : "100", // 100 × 5 = 500 < 1,000 → 이력을 읽지 않는다
      nblOtherStateEvents: [{ kind: "building_removed", date: "2024-01-15", propertyTaxTypeBefore: "", houseFootprintBefore: "250" }, closing("building_built", "2024-09-01", facts)],
    });
  }
  return other({
    nblOtherBuildingFloorArea: c.read === "read" ? "250" : "100", // 100 × 4 = 400 < 1,000 → core 부분 면적(이력을 읽지 않는다)
    nblOtherStateEvents: [built("2016-01-01"), c.card === "otherHouse" ? houseRemoved("2024-01-15") : removed("2024-01-15"), closing("building_built", "2024-09-01", facts)],
  });
}

function refine(raw: Record<string, unknown>): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  refineNonBusinessLandRaw(raw as unknown as NblRawRefineInput, { addIssue: (i: { path: (string | number)[]; message: string }) => out.push({ path: i.path, message: i.message }) } as unknown as z.RefinementCtx);
  return out;
}

/** 독립 진리표 — 화면이 그려야 하는 하위 칸 집합(사슬을 손으로 풀어 쓴다 · 엔진 술어를 재호출하지 않는다). 주택 철거 행이고 이력을 읽을 때만. */
function truthDrawn(c: Cell): string[] {
  if (c.read !== "read" || c.card === "otherBuilding") return [];
  if (c.otherUse !== "yes" || c.vacant !== "yes") return [];
  const out = ["demolishedPublicUseBefore"];
  if (c.publicUse !== "yes") return out;
  out.push("demolishedPublicUsePaidBefore");
  if (c.paid !== "yes") return out;
  return [...out, "demolishedPublicUseFromBefore", "demolishedPublicUseToBefore"];
}

const GRID: Cell[] = [];
for (const card of ["otherHouse", "housing", "otherBuilding"] as const) for (const read of ["read", "notRead"] as const)
  for (const otherUse of VALUES) for (const vacant of VALUES) for (const publicUse of VALUES) for (const paid of VALUES) {
    const reachesDates = otherUse === "yes" && vacant === "yes" && publicUse === "yes" && paid === "yes";
    for (const date of reachesDates ? (Object.keys(DATES) as DateCase[]) : (["valid"] as DateCase[])) GRID.push({ card, read, otherUse, vacant, publicUse, paid, date });
  }

describe("E3f-3 U-4 D — ⑧↔⑫′ parity × ⑤ 렌더 격자(실제 ⑧ · 실제 ⑫′ · 실제 렌더 · 독립 진리표)", () => {
  it("격자 규모(공허 방지) — 3카드 × 읽음 2 × 답 사슬 256(날짜 결함 6종은 사슬 끝에서만)", () => {
    expect(GRID.length).toBe(3 * 2 * (255 + 6));
    expect(GRID.filter((c) => truthDrawn(c).length === 4).length).toBe(2 * 6); // 주택 철거 행 카드 2 × 날짜 6
    expect(GRID.filter((c) => truthDrawn(c).length === 1).length).toBeGreaterThan(0);
  });

  it("⑧ 통과 ∧ ⑫′ 400 = 0 · ⑧만 차단 = 0 · ⑧이 가리키는 칸 미렌더 = 0 · 그려진 하위 칸 집합 = 진리표 · 읽지 않으면 하나도 없다 · 상위 답 «아니오»·«모름»·미선택이면 하위 칸 0", { timeout: 240_000 }, () => {
    const bad: string[] = [];
    const seen = { eightPassTwelveFail: 0, eightFailTwelvePass: 0, eightPublicUse: 0, twelvePublicUse: 0, byField: {} as Record<string, number>, anchorChecked: 0, drawnNonEmpty: 0, drawnFull: 0, notReadChecked: 0, upperBlocked: 0 };
    for (const c of GRID) {
      const a = cellAsset(c);
      const raw = buildNonBusinessLandRaw(a, T);
      if (!raw) { bad.push(`④ raw 없음 ${JSON.stringify(c)}`); continue; }
      const twelve = refine(raw).filter((i) => i.path[0] === "nblOtherStateEvents" && typeof i.path[2] === "string" && /^demolished/.test(i.path[2] as string));
      const { result: eight, fieldOf } = collectWithFields(() => validateNblStateHistory(a, "자산", { transferDate: T, floorDate: "2014-01-01" }));
      const f = eight !== null ? fieldOf(eight) : undefined;
      const eightFact = typeof f === "string" && /\.demolished\w+Before$/.test(f) ? f : undefined;
      const eightPu = !!eightFact && PU.some((p) => eightFact.endsWith(`.${p}`));
      const twelvePu = twelve.some((i) => PU.includes(i.path[2] as string));
      if (eightPu) { seen.eightPublicUse++; const k = eightFact!.split(".").pop()!; seen.byField[k] = (seen.byField[k] ?? 0) + 1; }
      if (twelvePu) seen.twelvePublicUse++;
      if (!eightFact && twelve.length > 0) { seen.eightPassTwelveFail++; bad.push(`⑧ 통과 ∧ ⑫′ 400 ${JSON.stringify(c)}`); }
      if (eightFact && twelve.length === 0) { seen.eightFailTwelvePass++; bad.push(`⑧ 차단 ∧ ⑫′ 통과 ${JSON.stringify(c)}`); }
      if (eightFact && twelve.length > 0 && eightFact !== `nblOtherStateEvents.${twelve[0].path[1]}.${twelve[0].path[2]}`) bad.push(`칸 불일치 ${JSON.stringify(c)} ${eightFact} ${twelve[0].path.join(".")}`);

      const { container } = render(<OtherLandStateHistorySection asset={a} onAssetChange={vi.fn()} transferDate={T} variant={c.card === "housing" ? "housing" : "other"} />);
      const drawn = [...container.querySelectorAll('[data-field^="nblOtherStateEvents."]')].map((n) => n.getAttribute("data-field")!).map((x) => x.split(".").pop()!).filter((x) => PU.includes(x));
      const want = truthDrawn(c);
      if (JSON.stringify(drawn) !== JSON.stringify(want)) bad.push(`그린 칸 ≠ 진리표 ${JSON.stringify(c)} drawn=${drawn} want=${want}`);
      if (drawn.length > 0) seen.drawnNonEmpty++;
      if (drawn.length === 4) seen.drawnFull++;
      if (eightFact) {
        seen.anchorChecked++;
        if (!container.querySelector(`[data-field="${eightFact}"]`)) bad.push(`⑧이 가리키는 칸 미렌더 ${JSON.stringify(c)} ${eightFact}`);
      }
      if (c.read === "notRead") {
        seen.notReadChecked++;
        if (drawn.length > 0 || eightPu || twelvePu) bad.push(`읽지 않는데 하위 칸 ${JSON.stringify(c)}`);
      }
      if ((c.otherUse === "no" || c.otherUse === "unknown" || c.otherUse === "" || c.vacant === "no" || c.vacant === "unknown" || c.vacant === "") && (drawn.length > 0 || eightPu || twelvePu)) bad.push(`상위 답이 끊었는데 하위 칸 ${JSON.stringify(c)}`);
      if (c.otherUse !== "yes" || c.vacant !== "yes") seen.upperBlocked++;
      cleanup();
    }
    expect(bad).toEqual([]);
    expect(seen.eightPassTwelveFail).toBe(0);
    expect(seen.eightFailTwelvePass).toBe(0);
    // 공허 방지 — 4개 하위 칸이 모두 ⑧·⑫′ 양쪽으로 막고 그려지며, 읽지 않는 셀·상위가 끊은 셀을 모두 지난다
    expect(Object.keys(seen.byField).sort()).toEqual([...PU].sort());
    // 주택 철거 행 카드 2 × (공용 사용 미선택 — 뒤 유료 답 4가지 무관 4 · 유료 미선택 1 · 개시일 결함 2(빈칸·해석 불가) · 종료일 결함 3(빈칸·해석 불가·역순))
    expect(seen.byField).toEqual({ demolishedPublicUseBefore: 8, demolishedPublicUsePaidBefore: 2, demolishedPublicUseFromBefore: 4, demolishedPublicUseToBefore: 6 });
    expect(seen.eightPublicUse).toBe(20);
    expect(seen.twelvePublicUse).toBe(seen.eightPublicUse);
    expect(seen.anchorChecked).toBeGreaterThan(seen.eightPublicUse);
    expect(seen.drawnNonEmpty).toBe(42); // 주택 철거 행 카드 2 × (공용 사용 4 × 유료 4 + 날짜 결함 5)
    expect(seen.drawnFull).toBe(12);
    expect(seen.notReadChecked).toBe(GRID.length / 2);
    expect(seen.upperBlocked).toBeGreaterThan(500);
  });
});

// ── E. ⑦ 결과 구간표 ────────────────────────────────────────────────────────

describe("E3f-3 U-4 E — ⑦ 결과 구간표: 엔진 echo 라벨 «한시 기간 중 공용 사용 기간만»", () => {
  function echoOf(a: AssetForm, transferDate: string) {
    const raw = buildNonBusinessLandRaw(a, transferDate)!;
    const input = buildNblEngineInput(raw as never)!;
    return judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES).periodEvaluation!.stateHistory!;
  }
  const renderTable = (h: ReturnType<typeof echoOf>) =>
    render(<NblStateHistoryPeriodTable stateHistory={h} totalOwnershipDays={3651} effectiveBusinessDays={775} gracePeriodDays={0} isNonBusiness={false} />);

  it("단서를 받은 구간: 라벨 + 창(공용 사용 기간으로 한정) · 접힌 구간은 창 표시 없음", () => {
    const h = echoOf(HOUSE({ ...FULLCHAIN }), T);
    renderTable(h);
    const idx = h.intervals.findIndex((iv) => iv.temporaryStatusWindow);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(h.intervals[idx].temporaryStatusPublicUse).toBe(true);
    const row = screen.getByTestId(`nbl-state-history-interval-${idx}`).textContent!;
    expect(row).toContain("별도합산(나대지 — 철거·멸실 근거 · 한시 기간 중 공용 사용 기간만)");
    expect(row).toContain("한시 지위 인정 2024-04-01 ~ 2024-08-31");
    cleanup();
    const folded = echoOf(HOUSE({ ...FULLCHAIN, demolishedPublicUsePaidBefore: "no" }), T);
    renderTable(folded);
    expect(document.querySelector('[data-testid$="-temporary-status"]')).toBeNull();
    expect(document.body.textContent).not.toContain("공용 사용 기간만");
  });

  it("단서가 아닌 기존 창(공용 사용 키 없음)은 종전 라벨 «한시 기간만» 그대로(회귀)", () => {
    const h = echoOf(HOUSE({ demolishedOtherUseBefore: "no" }), T);
    renderTable(h);
    const idx = h.intervals.findIndex((iv) => iv.temporaryStatusWindow);
    expect(screen.getByTestId(`nbl-state-history-interval-${idx}`).textContent).toContain("별도합산(나대지 — 철거·멸실 근거 · 한시 기간만)");
  });
});

// ── F. High-1 + Medium-1 — 떨어진 두 창 · 단서 미사용 고지(엔진 echo 그대로 표시) ──────────────────────────

describe("E3f-3 High-1·Medium-1 F — 두 창이 떨어지면 둘 다 보이고, 단서가 영향이 없으면 고지를 보인다", () => {
  /** 철거 2023-03-01(2023-06-01 = 제한 없는 시행본 과세기준일) → 닫는 행 `closeOn` · 양도 `tr`. */
  const OLD = (closeOn: string, facts: Partial<Ev>) => other({ nblOtherStateEvents: [built("2016-01-01"), houseRemoved("2023-03-01"), closing("building_built", closeOn, { ...PRE, ...facts })] });
  const echoOf = (a: AssetForm, transferDate: string) => {
    const raw = buildNonBusinessLandRaw(a, transferDate)!;
    return judgeNonBusinessLand(buildNblEngineInput(raw as never)!, DEFAULT_NON_BUSINESS_LAND_RULES).periodEvaluation!.stateHistory!;
  };
  const APART = () => OLD("2025-01-01", { ...FULLCHAIN, demolishedPublicUseFromBefore: "2024-04-01", demolishedPublicUseToBefore: "2024-12-01" });

  it("⑤ 미리보기: 제한 없는 창 + 공용 사용 단서 창이 각각 보이고 라벨은 «한시 기간 + 한시 기간 중 공용 사용 기간»", () => {
    mount(APART(), "2026-12-01");
    expect(text("nbl-other-state-event-2-demolished-window")).toContain("한시 지위 인정 기간: 2023-03-01 ~ 2023-09-01");
    expect(text("nbl-other-state-event-2-demolished-window")).not.toContain("국가 등 공용 사용 기간만");
    expect(text("nbl-other-state-event-2-demolished-publicuse-window")).toContain("공용 사용 단서 인정 기간: 2024-04-01 ~ 2024-12-01(245일 · 국가 등 공용 사용 기간만)");
    expect(text("nbl-other-state-event-2-demolished-publicuse-accepted-notice")).toBe(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE);
    expect(id("nbl-other-state-event-2-demolished-publicuse-unused-notice")).toBeNull();
    const rowText = screen.getByTestId("nbl-state-history-preview-row-2").textContent!;
    expect(rowText).toContain("한시 기간 + 한시 기간 중 공용 사용 기간) · 인정 2023-03-01 ~ 2023-09-01(185일) + 공용 사용 단서 2024-04-01 ~ 2024-12-01(245일)");
  });

  it("맞닿으면 하나의 창 — 둘째 창 줄 없음 · «공용 사용 기간만»이 아니라 «한시 기간 + 국가 등 공용 사용 기간»(Low-A) · 혼합 변형 수락 고지(Low-B) · 라벨도 혼합", () => {
    mount(OLD("2025-01-01", { ...FULLCHAIN, demolishedPublicUseFromBefore: "2023-09-02", demolishedPublicUseToBefore: "2024-12-01" }), "2026-12-01");
    expect(id("nbl-other-state-event-2-demolished-publicuse-window")).toBeNull();
    const w = text("nbl-other-state-event-2-demolished-window");
    expect(w).toContain("한시 기간 + 국가 등 공용 사용 기간");
    expect(w).not.toContain("공용 사용 기간만");
    expect(text("nbl-other-state-event-2-demolished-publicuse-accepted-notice")).toBe(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_MIXED_ACCEPTED_NOTICE);
    expect(screen.getByTestId("nbl-state-history-preview-row-2").textContent).toContain("한시 기간 + 한시 기간 중 공용 사용 기간)");
  });

  it("단서에만 기댄 구간은 종전 그대로(문구 «국가 등 공용 사용 기간만» · 수락 고지 종전 상수 · 라벨 «공용 사용 기간만») — 혼합 아님", () => {
    const only = other({ nblOtherStateEvents: [built("2016-01-01"), houseRemoved("2023-06-02"), closing("building_built", "2025-01-01", { ...PRE, ...FULLCHAIN, demolishedPublicUseFromBefore: "2024-04-01", demolishedPublicUseToBefore: "2024-12-01" })] });
    mount(only, "2026-12-01");
    expect(text("nbl-other-state-event-2-demolished-window")).toContain("국가 등 공용 사용 기간만");
    expect(text("nbl-other-state-event-2-demolished-publicuse-accepted-notice")).toBe(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
    expect(screen.getByTestId("nbl-state-history-preview-row-2").textContent).toContain("한시 기간 중 공용 사용 기간만)");
  });

  it("단서를 4칸 모두 답했는데 공용 사용 기간 안에 과세기준일이 없으면(제한 없는 창만 성립) 미사용 고지 — 접힘 고지는 없다", () => {
    mount(OLD("2024-09-01", { ...FULLCHAIN, demolishedPublicUseFromBefore: "2025-01-01", demolishedPublicUseToBefore: "2026-12-01" }), "2024-12-01");
    expect(text("nbl-other-state-event-2-demolished-publicuse-unused-notice")).toBe(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE);
    expect(id("nbl-other-state-event-2-demolished-fold-notice")).toBeNull();
    expect(id("nbl-other-state-event-2-demolished-publicuse-accepted-notice")).toBeNull();
    expect(id("nbl-other-state-event-2-demolished-publicuse-window")).toBeNull();
  });

  it("⑦ 결과 구간표: 두 창이 한 줄에 보인다(엔진 echo) · 미사용 구간은 종전 라벨", () => {
    const h = echoOf(APART(), "2026-12-01");
    const { unmount } = render(<NblStateHistoryPeriodTable stateHistory={h} totalOwnershipDays={4718} effectiveBusinessDays={3000} gracePeriodDays={0} isNonBusiness={false} />);
    const idx = h.intervals.findIndex((iv) => iv.temporaryStatusWindow);
    const row = screen.getByTestId(`nbl-state-history-interval-${idx}`).textContent!;
    expect(row).toContain("별도합산(나대지 — 철거·멸실 근거 · 한시 기간 + 한시 기간 중 공용 사용 기간)");
    expect(row).toContain("한시 지위 인정 2023-03-01 ~ 2023-09-01(185일 · 한시 기간 6개월) + 공용 사용 단서 인정 2024-04-01 ~ 2024-12-01(245일 · 국가 등 공용 사용 기간만)");
    unmount();
    const unused = echoOf(OLD("2024-09-01", { ...FULLCHAIN, demolishedPublicUseFromBefore: "2025-01-01", demolishedPublicUseToBefore: "2026-12-01" }), "2024-12-01");
    expect(unused.intervals.some((iv) => iv.temporaryStatusPublicUseUnused)).toBe(true);
    render(<NblStateHistoryPeriodTable stateHistory={unused} totalOwnershipDays={3500} effectiveBusinessDays={3000} gracePeriodDays={0} isNonBusiness={false} />);
    expect(document.body.textContent).toContain("한시 기간만");
    expect(document.body.textContent).not.toContain("공용 사용 단서 인정");
  });
});
