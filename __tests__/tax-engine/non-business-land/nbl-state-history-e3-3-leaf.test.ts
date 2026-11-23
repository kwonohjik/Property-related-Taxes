/**
 * NBL-STATE-HISTORY-E3-③ A (E3d-1) — leaf 단위 테스트: 배율 helper(`housing-limit.ts` 단일 소스) · 과거 주택 구간 판정(`resolveHouseInterval`) · ⑧ 공용 정착면적 검증(`houseFootprintIssue`) ·
 * 주택 구조 규칙(`housingStateEventIssue` D-1·D-2) · 사건 주체 문구 변형(D-9 · `subject`) · 구간 변환(주택 꼬리) · 사업용 술어.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.engine.plan.md §3.4 · §4.2 · §5.1 D-1·D-2·D-9·D-11·D-12·D-16 · §7.2 Anchor 5·11·12 · §7.3 Y-6·Y-7·Y-10·Y-11·Y-23·Y-27·Y-28·Y-29·Y-30·Y-31
 */
import { describe, it, expect } from "vitest";
import { E3D_HOUSE_LIMIT_ROWS } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-3-table";
import { houseFootprintIssue, judgeHousingLimit, resolveHouseInterval, HOUSING_METRO_DEFAULTED_WARNING } from "@/lib/tax-engine/non-business-land/housing-limit";
import { judgeHousingLand } from "@/lib/tax-engine/non-business-land/housing-land";
import {
  deriveOtherLandStateIntervals,
  eventClosesHouseInterval,
  housingStateEventIssue,
  isStateIntervalBusiness,
  stateEventRowIssue,
  stateEventSequenceIssue,
  stateEventSubjectOf,
  stateHistoryBusinessIntervals,
  STATE_EVENT_KIND_LABEL_HOUSE,
} from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { consumesHousingStateHistory } from "@/lib/tax-engine/non-business-land/land-category";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput, ZoneType } from "@/lib/tax-engine/non-business-land/types";
import type { StateEvent } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { HouseIntervalCtx } from "@/lib/tax-engine/non-business-land/housing-limit";
import { STATE_EVENTS_REQUIRED_MESSAGE, stateEventsRequiredMessage } from "@/lib/tax-engine/non-business-land/nbl-validation-messages";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const CTX: HouseIntervalCtx = { zoneType: "general_residential", isMetropolitanArea: false, landArea: 500, transferDate: d("2024-01-01") };

describe("housing-limit — 단일 소스 배율 helper (D-12 · Anchor 12) — §6.2 경계표와 `judgeHousingLand`가 같은 값", () => {
  it.each(E3D_HOUSE_LIMIT_ROWS.map((r) => [r.id, r] as const))("%s — judgeHousingLimit", (_id, r) => {
    const j = judgeHousingLimit({ zoneType: r.zone as ZoneType, isMetropolitanArea: r.metro, transferDate: d(r.transfer), footprint: r.footprint, landArea: r.landArea });
    expect([j.multiplier, j.allowedArea, j.limit.within, j.limit.excess]).toEqual([r.expect.multiplier, r.expect.allowedArea, r.expect.within, r.expect.excess]);
    expect(j.metroDefaulted).toBe(false);
  });

  it.each(E3D_HOUSE_LIMIT_ROWS.map((r) => [r.id, r] as const))("%s — `judgeHousingLand`(양도일 현재 상태)가 같은 helper 값을 쓴다 — 이내/초과 면적이 일치", (_id, r) => {
    const input = {
      landType: "housing_site", landArea: r.landArea, zoneType: r.zone, acquisitionDate: d("2014-01-01"), transferDate: d(r.transfer),
      housingFootprint: r.footprint, isMetropolitanArea: r.metro, businessUsePeriods: [], gracePeriods: [],
    } as NonBusinessLandInput;
    const res = judgeHousingLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(res.areaProportioning?.buildingMultiplier).toBe(r.expect.multiplier);
    expect(res.areaProportioning?.nonBusinessArea).toBe(r.expect.excess);
    expect(res.isBusiness).toBe(r.expect.within);
  });

  it("수도권 여부 미제공 → 보수적 기본값(수도권)으로 계산 + `metroDefaulted`(경고 문구는 `judgeHousingLand`와 바이트 동일)", () => {
    const j = judgeHousingLimit({ zoneType: "general_residential", isMetropolitanArea: undefined, transferDate: d("2024-01-01"), footprint: 100, landArea: 500 });
    expect(j.metroDefaulted).toBe(true);
    expect(j.multiplier).toBe(3); // 수도권 주·상·공 3배
    const input = { landType: "housing_site", landArea: 500, zoneType: "general_residential", acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"), housingFootprint: 100, businessUsePeriods: [], gracePeriods: [] } as NonBusinessLandInput;
    expect(judgeHousingLand(input, DEFAULT_NON_BUSINESS_LAND_RULES).warnings).toContain(HOUSING_METRO_DEFAULTED_WARNING);
    expect(HOUSING_METRO_DEFAULTED_WARNING).toBe("수도권 여부(isMetropolitanArea) 미제공 — 보수적 기본값(수도권)으로 배율 산정. 수도권 여부를 명시하면 정확한 배율이 적용됩니다.");
  });
});

describe("resolveHouseInterval — 과거 주택 구간의 배율 이내 판정 (Q-5 (나) · Q-10 · T-8 · Y-6·Y-7·Y-28·Y-29·Y-30·Y-31)", () => {
  it("이내: 정착 100 × 5배 = 500 vs 토지 500(같음 포함 — Y-28) → within + 근거 echo", () => {
    expect(resolveHouseInterval(100, CTX)).toEqual({
      houseOutcome: "within",
      houseCheck: { footprint: 100, multiplier: 5, multiplierDetail: "수도권 밖 도시 5배", allowedArea: 500, landArea: 500, excessArea: 0 },
    });
  });
  it("초과: 99.99 × 5 = 499.95 < 500 → exceeded(0.05㎡ — 절벽: 0.05㎡ 차이가 구간 전체를 가른다 · 고지가 허용·초과 면적을 echo)", () => {
    const r = resolveHouseInterval(99.99, CTX);
    expect(r.houseOutcome).toBe("exceeded");
    expect(r.houseCheck).toMatchObject({ allowedArea: 499.95, excessArea: 0.05 });
  });
  it.each([
    ["undefined(빈칸)", undefined],
    ["0", 0],
    ["음수", -5],
    ["NaN(비수치)", NaN],
    ["Infinity", Infinity],
    ["정착 > 토지(501 > 500) — 허용 면적 ≥ 토지 면적이라 자동 이내가 되는 오입력(Y-31)", 501],
  ])("%s → unconfirmed(접힘 · 근거 echo 없음)", (_n, fp) => {
    const r = resolveHouseInterval(fp as number | undefined, CTX);
    expect(r).toEqual({ houseOutcome: "unconfirmed" });
  });
  it("정착 = 토지(500 = 500): 정착 > 토지가 아니라 이내(허용 2,500 ≥ 500) — 경계는 `>`", () => {
    expect(resolveHouseInterval(500, CTX).houseOutcome).toBe("within");
  });
  it("D-11 양도일 기준 배율: 수도권 일반주거 · 토지 1,000 · 정착 200 — 양도 2021-12-31 within(5배) / 2022-01-01 exceeded(3배, 초과 400)", () => {
    const base = { zoneType: "general_residential" as const, isMetropolitanArea: true, landArea: 1000 };
    expect(resolveHouseInterval(200, { ...base, transferDate: d("2021-12-31") }).houseOutcome).toBe("within");
    const after = resolveHouseInterval(200, { ...base, transferDate: d("2022-01-01") });
    expect(after.houseOutcome).toBe("exceeded");
    expect(after.houseCheck).toMatchObject({ multiplier: 3, allowedArea: 600, excessArea: 400 });
  });
  it("수도권 미제공 → 보수적 수도권(3배): 정착 200 · 토지 1,000 → 허용 600 → exceeded", () => {
    const r = resolveHouseInterval(200, { zoneType: "general_residential", isMetropolitanArea: undefined, landArea: 1000, transferDate: d("2024-01-01") });
    expect(r.houseOutcome).toBe("exceeded");
  });
});

describe("houseFootprintIssue — ⑧ 공용 정착면적 검증 (Q-10 (가): 빈칸·0·음수·비수치·정착 > 토지 전부 차단 · R-9)", () => {
  it.each([
    ["빈칸", "", "blank"],
    ["공백", "   ", "blank"],
    ["미전송", undefined, "blank"],
    ["0", "0", "not_positive"],
    ["0.00", "0.00", "not_positive"],
    ["-5", "-5", "not_positive"],
    ["abc", "abc", "not_number"],
    ["12abc(⑭ parseFloat은 12로 읽지만 ⑧은 비수치로 막는다 — ⑧이 더 엄격)", "12abc", "not_number"],
    ["1e2(지수 표기 — ⑧은 막는다)", "1e2", "not_number"],
    ["정착 1,200 > 토지 1,000", "1,200", "exceeds_land"],
    ["정착 1000.01 > 토지 1,000", "1000.01", "exceeds_land"],
  ])("%s → %s", (_n, fp, kind) => {
    const issue = houseFootprintIssue(fp as string | undefined, 2, "1000");
    expect(issue?.kind).toBe(kind);
    expect(issue?.message).toContain("주택 사건 3번째 행");
  });

  it.each([
    ["200", "200"],
    ["199.99", "199.99"],
    ["1,000(쉼표 허용 · 정착 = 토지)", "1,000"],
    ["+5", "+5"],
    [".5", ".5"],
  ])("통과: %s", (_n, fp) => {
    expect(houseFootprintIssue(fp, 0, "1000")).toBeNull();
  });

  it("토지 면적이 비었거나 읽을 수 없으면 «정착 > 토지» 규칙은 건너뛴다(앞 단계 면적 검증 몫) — 나머지 규칙은 그대로", () => {
    expect(houseFootprintIssue("5000", 0, "")).toBeNull();
    expect(houseFootprintIssue("5000", 0, undefined)).toBeNull();
    expect(houseFootprintIssue("5000", 0, "abc")).toBeNull();
    expect(houseFootprintIssue("", 0, "")?.kind).toBe("blank");
  });

  it("토지 면적을 수치로 넘겨도 같다(엔진 입력 단위)", () => {
    expect(houseFootprintIssue("1200", 0, 1000)?.kind).toBe("exceeds_land");
    expect(houseFootprintIssue("200", 0, 1000)).toBeNull();
  });

  it("⑧ 통과 ⇒ 엔진이 계산(within/exceeded) · ⑧ 차단 ⇒ 엔진은 접음(unconfirmed) — Anchor 11 격자(정착면적 × 용도지역 × 수도권), 토지 1,000㎡", () => {
    const fps = ["", "0", "-5", "abc", "200", "199.99", "1200"];
    const zones: ZoneType[] = ["general_residential", "green", "management", "undesignated"];
    const metros: Array<boolean | undefined> = [true, false, undefined];
    for (const fp of fps) {
      for (const zone of zones) {
        for (const metro of metros) {
          const issue = houseFootprintIssue(fp, 0, "1000");
          const parsed = Number.isFinite(parseFloat(fp.replace(/,/g, ""))) ? parseFloat(fp.replace(/,/g, "")) : undefined; // ⑭ `parseRawNumber`와 같은 규약
          const r = resolveHouseInterval(parsed, { zoneType: zone, isMetropolitanArea: metro, landArea: 1000, transferDate: d("2024-01-01") });
          const label = `fp=${fp} zone=${zone} metro=${String(metro)}`;
          if (issue) expect(r.houseOutcome, `${label} ⑧ 차단 → 엔진 접힘`).not.toBe("within");
          if (issue) expect(["unconfirmed"], `${label}`).toContain(r.houseOutcome);
          else expect(["within", "exceeded"], `${label} ⑧ 통과 → 엔진 계산`).toContain(r.houseOutcome);
        }
      }
    }
  });
});

describe("housingStateEventIssue · 사건 주체 `subject: house` — D-1 · D-2 · D-9 (⑧·⑫ 공용 · Y-10 · Y-11 · Y-23)", () => {
  const ev = (kind: string, date: string) => ({ kind, date });

  it("D-1: 마지막 건축물 사건이 철거 → 차단(그 행) + 지목 변경 안내", () => {
    const issue = housingStateEventIssue([ev("building_built", "2020-01-01"), ev("building_removed", "2021-01-01")]);
    expect(issue).toMatchObject({ index: 1, field: "kind" });
    expect(issue?.message).toContain("나대지·잡종지");
  });
  it("D-1: 철거만 1건(양도일 현재 주택 없음)도 차단 · 신축으로 끝나면 통과", () => {
    expect(housingStateEventIssue([ev("building_removed", "2021-01-01")])).not.toBeNull();
    expect(housingStateEventIssue([ev("building_removed", "2016-01-01"), ev("building_built", "2023-01-01")])).toBeNull();
    expect(housingStateEventIssue([ev("building_built", "2023-01-01")])).toBeNull();
  });
  it("D-2: `tax_type_changed`는 위치와 무관하게 차단(D-1보다 먼저 — 구분 변경만 있는 입력도 막힌다)", () => {
    expect(housingStateEventIssue([ev("tax_type_changed", "2020-01-01")])).toMatchObject({ index: 0, field: "kind" });
    expect(housingStateEventIssue([ev("building_removed", "2016-01-01"), ev("tax_type_changed", "2018-01-01"), ev("building_built", "2023-01-01")])).toMatchObject({ index: 1 });
  });

  it("`stateEventSequenceIssue(subject: house)`는 순서 검증 뒤 구조 규칙까지 한 호출로 적용한다 — ⑧·⑫가 같은 결과(Anchor 5)", () => {
    const opts = { transferDate: "2024-01-01", subject: "house" as const };
    expect(stateEventSequenceIssue([ev("building_built", "2023-01-01")], opts)).toBeNull();
    expect(stateEventSequenceIssue([ev("building_removed", "2021-01-01")], opts)?.message).toContain("주택 사건 1번째 행");
    expect(stateEventSequenceIssue([ev("tax_type_changed", "2021-01-01"), ev("building_built", "2022-01-01")], opts)?.index).toBe(0);
    // 순서 위반이 구조 규칙보다 먼저 보고된다(첫 결함)
    expect(stateEventSequenceIssue([ev("building_built", "2023-01-01"), ev("building_removed", "2022-01-01")], opts)?.message).toContain("앞 사건");
  });

  it("기본(`building`) 문구는 바이트 동일 — subject 인자를 안 주면 «건축물 사건», 구조 규칙(D-1·D-2)은 기타토지에 적용되지 않는다(Y-23)", () => {
    const rows = [ev("building_built", "2020-01-01"), ev("building_removed", "2021-01-01")];
    const base = stateEventSequenceIssue(rows, { transferDate: "2024-01-01" });
    expect(base).toBeNull(); // 철거로 끝나도 기타토지는 정상(나대지 꼬리)
    expect(stateEventSequenceIssue([ev("building_built", "2020-01-01"), ev("building_built", "2021-01-01")], { transferDate: "2024-01-01" })?.message)
      .toBe("건축물 사건 2번째 행 — 앞 사건이 이미 「건축물 있음」입니다. 사이에 「건축물 멸실·철거·붕괴」 사건이 빠졌습니까? (신축과 멸실은 번갈아 입력합니다)");
    expect(stateEventSequenceIssue([], { transferDate: "2024-01-01" })?.message).toBe(STATE_EVENTS_REQUIRED_MESSAGE);
    expect(stateEventsRequiredMessage()).toBe(STATE_EVENTS_REQUIRED_MESSAGE);
    expect(stateEventRowIssue({ kind: "", date: "" }, 0)?.message).toContain("건축물 사건 1번째 행");
  });

  it("주택 문구: 행 접두 «주택 사건 N번째 행» · 종류 라벨 «주택 신축 / 주택 멸실·철거·붕괴» · 상태 «주택 있음/없음» · 0건 «주택이 …» — 같은 종류 연속·미선택·날짜 오류 전부", () => {
    const opts = { transferDate: "2024-01-01", subject: "house" as const };
    expect(stateEventRowIssue({ kind: "", date: "" }, 0, "house")?.message).toBe("주택 사건 1번째 행 — 종류(주택 신축 / 주택 멸실·철거·붕괴)를 선택하세요. (미선택 행은 판정에서 제외되어 결과가 달라집니다)");
    expect(stateEventRowIssue({ kind: "building_built", date: "" }, 1, "house")?.message).toContain("주택 사건 2번째 행");
    expect(stateEventSequenceIssue([ev("building_built", "2020-01-01"), ev("building_built", "2021-01-01")], opts)?.message)
      .toBe("주택 사건 2번째 행 — 앞 사건이 이미 「주택 있음」입니다. 사이에 「주택 멸실·철거·붕괴」 사건이 빠졌습니까? (신축과 멸실은 번갈아 입력합니다)");
    expect(stateEventSequenceIssue([], opts)?.message).toContain("주택이 새로 생기거나");
    expect(STATE_EVENT_KIND_LABEL_HOUSE.building_built).toBe("주택 신축");
  });

  it("`stateEventSubjectOf`: 주택부수토지만 house — 기타토지·별장·농지 등은 building", () => {
    expect(stateEventSubjectOf("housing_site")).toBe("house");
    for (const t of ["other_land", "vacant_lot", "miscellaneous", "villa_land", "building_site", "farmland", "forest", "pasture", "", undefined] as const) expect(stateEventSubjectOf(t), String(t)).toBe("building");
    expect(consumesHousingStateHistory("housing_site")).toBe(true);
  });

  it("`eventClosesHouseInterval`: 주택 카드(tail house)의 철거 행만 true · 신축·구분 변경 행·기타토지 카드는 false", () => {
    const events = [{ kind: "building_removed" }, { kind: "building_built" }, { kind: "tax_type_changed" }];
    expect(events.map((_e, i) => eventClosesHouseInterval(events, i, "house"))).toEqual([true, false, false]);
    expect(events.map((_e, i) => eventClosesHouseInterval(events, i, undefined))).toEqual([false, false, false]);
    expect(eventClosesHouseInterval(events, 9, "house")).toBe(false);
  });
});

describe("deriveOtherLandStateIntervals — 주택 꼬리(`buildingKind: house`): 주택 구간·나대지 구간·꼬리", () => {
  const OS = d("2014-01-02");
  const T = d("2024-01-01");
  const ev = (kind: StateEvent["kind"], date: string, extra: Partial<StateEvent> = {}): StateEvent => ({ kind, date: d(date), ...extra });
  const tail = (over: Partial<Parameters<typeof deriveOtherLandStateIntervals>[3]> = {}) => ({ hasBuilding: true, propertyTaxType: "unknown" as const, buildingKind: "house" as const, houseCtx: CTX, ...over });

  it("철거 → 재신축: [주택(within) | 나대지(종합합산) | 꼬리 주택] — Σ 일수 = 소유일수 · 주택 구간의 재산세 구분은 `unknown` 고정(읽지 않는다)", () => {
    const iv = deriveOtherLandStateIntervals([ev("building_removed", "2016-01-01", { houseFootprintBefore: 100, propertyTaxTypeBefore: "separate" }), ev("building_built", "2023-01-01")], OS, T, tail());
    expect(iv).toHaveLength(3);
    expect(iv[0]).toMatchObject({ hasBuilding: true, buildingKind: "house", houseOutcome: "within", propertyTaxType: "unknown" });
    expect(iv[1]).toMatchObject({ hasBuilding: false, propertyTaxType: "comprehensive" });
    expect(iv[1].buildingKind).toBeUndefined();
    expect(iv[2]).toMatchObject({ hasBuilding: true, buildingKind: "house" });
    expect(iv[2].houseOutcome).toBeUndefined();
    expect(iv.reduce((n, v) => n + (v.end.getTime() - v.start.getTime()) / 86_400_000, 0)).toBe(3651);
  });

  it("T-4: 건축물 사건이 신축뿐이면 `tail.hasBuilding` 값과 무관하게 앞 구간은 나대지·꼬리는 주택 — 주택 카드는 토글 없이 항상 true를 넘긴다", () => {
    for (const hasBuilding of [true, false]) {
      const iv = deriveOtherLandStateIntervals([ev("building_built", "2023-06-01")], OS, T, tail({ hasBuilding }));
      expect(iv.map((v) => [v.hasBuilding, v.buildingKind ?? null])).toEqual([[false, null], [true, "house"]]);
    }
  });

  it("사업용 술어: within만 사업용 · exceeded·unconfirmed는 접힘(Y-7: «초과»가 «모름»보다 유리하지 않다) · 재산세 구분은 보지 않는다(조심 2018서0295)", () => {
    const mk = (houseOutcome: "within" | "exceeded" | "unconfirmed", propertyTaxType: "comprehensive" | "unknown" | "separate") => ({ hasBuilding: true, propertyTaxType, buildingKind: "house" as const, houseOutcome });
    expect(isStateIntervalBusiness(mk("within", "comprehensive"))).toBe(true);
    expect(isStateIntervalBusiness(mk("within", "unknown"))).toBe(true);
    expect(isStateIntervalBusiness(mk("exceeded", "separate"))).toBe(false);
    expect(isStateIntervalBusiness(mk("unconfirmed", "separate"))).toBe(false);
    // 종전(주택 아님) 구간은 그대로: 건축물 + 별도합산 = 사업용 · 종합합산 = 비사업용
    expect(isStateIntervalBusiness({ hasBuilding: true, propertyTaxType: "separate" })).toBe(true);
    expect(isStateIntervalBusiness({ hasBuilding: true, propertyTaxType: "comprehensive" })).toBe(false);
  });

  it("사업용 구간 조립: 주택(within) 구간 + 꼬리(core 사업용) — 나대지·접힌 구간은 제외", () => {
    const iv = deriveOtherLandStateIntervals([ev("building_removed", "2016-01-01", { houseFootprintBefore: 100 }), ev("building_built", "2023-01-01")], OS, T, tail());
    expect(stateHistoryBusinessIntervals(iv, { isBusiness: true })).toEqual([
      { start: OS, end: d("2016-01-01") },
      { start: d("2023-01-01"), end: T },
    ]);
    const folded = deriveOtherLandStateIntervals([ev("building_removed", "2016-01-01", { houseFootprintBefore: 50 }), ev("building_built", "2023-01-01")], OS, T, tail());
    expect(folded[0].houseOutcome).toBe("exceeded");
    expect(stateHistoryBusinessIntervals(folded, { isBusiness: true })).toEqual([{ start: d("2023-01-01"), end: T }]);
  });

  it("클립(축 B 늦은 지분 · 이월과세 시나리오 B): 철거가 소유 시작 전이면 구옥 구간(0일)은 버려지고 소유 첫날부터 나대지", () => {
    const iv = deriveOtherLandStateIntervals([ev("building_removed", "2016-01-01", { houseFootprintBefore: 100 }), ev("building_built", "2023-01-01")], d("2021-06-02"), T, tail());
    expect(iv.map((v) => [v.hasBuilding, v.buildingKind ?? null])).toEqual([[false, null], [true, "house"]]);
  });

  it("직접 호출의 마지막 안전망: D-1(마지막 철거)·D-2(구분 변경)·`houseCtx` 누락은 침묵 보정하지 않고 오류", () => {
    expect(() => deriveOtherLandStateIntervals([ev("building_removed", "2021-01-01", { houseFootprintBefore: 100 })], OS, T, tail())).toThrow(/주택 사건 1번째 행/);
    expect(() => deriveOtherLandStateIntervals([ev("tax_type_changed", "2020-01-01"), ev("building_built", "2023-01-01")], OS, T, tail())).toThrow(/재산세 과세 구분 변경/);
    expect(() => deriveOtherLandStateIntervals([ev("building_built", "2023-01-01")], OS, T, tail({ houseCtx: undefined }))).toThrow(/houseCtx/);
  });

  it("종전(주택 꼬리 아님) 입력은 바이트 동일 — 철거 행의 `houseFootprintBefore`를 읽지 않고 `buildingKind` 키가 없다", () => {
    const iv = deriveOtherLandStateIntervals([ev("building_removed", "2021-01-01", { propertyTaxTypeBefore: "separate", houseFootprintBefore: 100 })], OS, T, { hasBuilding: false, propertyTaxType: "comprehensive" });
    expect(iv[0]).toEqual({ start: OS, end: d("2021-01-01"), hasBuilding: true, propertyTaxType: "separate" });
    expect(iv[0]).not.toHaveProperty("buildingKind");
  });
});
