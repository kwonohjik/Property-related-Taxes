/**
 * NBL-STATE-HISTORY-E3-③ B (E3d-2) — leaf 단위 테스트: B 구조 규칙(`houseKindEventIssue` D-8) · 주택 구간 술어(`eventClosesHouseInterval` — 종류 칸) · 구간 변환(철거 행별 주택 구간) ·
 * 적용 범위 술어(`housePriorNeedsMetropolitan` · `stateHistoryDeemedBlocks` — `house-prior-scope.ts`) · ⑧ 공용 정착면적 검증 주체 문구(`houseFootprintIssue`의 `subject`) · T-8 문자열 격자.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.engine.plan.md §3.4 · §4.3 · §5.1 D-8·D-9·D-13·D-16 · §5.2 T-5·T-8 · §7.2 Anchor 5·11 · §7.3 Y-19·Y-20·Y-26·Y-30
 */
import { describe, it, expect } from "vitest";
import {
  deriveOtherLandStateIntervals,
  eventClosesHouseInterval,
  houseKindEventIssue,
  isStateIntervalBusiness,
  stateEventSequenceIssue,
} from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { houseFootprintIssue, resolveHouseInterval } from "@/lib/tax-engine/non-business-land/housing-limit";
import { housePriorNeedsMetropolitan, metropolitanChangesHousingMultiplier, stateHistoryDeemedBlocks } from "@/lib/tax-engine/non-business-land/house-prior-scope";
import { getHousingMultiplier, HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE } from "@/lib/tax-engine/non-business-land/urban-area";
import { houseKindOnlyOnRemovedMessage, houseKindTaxChangeInsideMessage, houseFootprintBlankMessage } from "@/lib/tax-engine/non-business-land/nbl-validation-messages";
import type { HouseIntervalCtx } from "@/lib/tax-engine/non-business-land/housing-limit";
import type { StateEvent } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { parseRawNumber } from "@/lib/calc/non-business-land-request";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const CTX: HouseIntervalCtx = { zoneType: "general_residential", isMetropolitanArea: false, landArea: 1000, transferDate: d("2024-01-01") };
const row = (kind: string, date: string, buildingKindBefore?: string) => ({ kind, date, ...(buildingKindBefore !== undefined ? { buildingKindBefore } : {}) });

describe("E3d-2 D-8 `houseKindEventIssue` — 철거된 건축물 종류(주택) 구조 규칙 (⑧·⑫ 공용)", () => {
  it("① 종류는 철거 행에서만: 신축 행·구분 변경 행의 `house`는 차단(field = buildingKindBefore · 문구 = 건축물 사건 접두)", () => {
    const built = houseKindEventIssue([row("building_built", "2020-01-01", "house")]);
    expect(built).toEqual({ index: 0, field: "buildingKindBefore", message: houseKindOnlyOnRemovedMessage(0, "building_built") });
    expect(built!.message).toContain("건축물 사건 1번째 행");
    const tax = houseKindEventIssue([row("building_removed", "2016-01-01"), row("tax_type_changed", "2018-01-01", "house")]);
    expect(tax).toMatchObject({ index: 1, field: "buildingKindBefore" });
    expect(tax!.message).toContain("재산세 과세 구분 변경 사건 2번째 행");
  });

  it("② 주택 구간 안에 구분 변경 금지(Y-20) — 직전 건축물 사건(또는 소유 첫날) 이후 ~ 그 철거 행 사이에 `tax_type_changed`가 있으면 그 철거 행이 차단된다", () => {
    // 소유 첫날부터 건축물 있음 → 구분 변경 → 철거(주택)
    expect(houseKindEventIssue([row("tax_type_changed", "2016-01-01"), row("building_removed", "2018-01-01", "house")])).toEqual({
      index: 1, field: "buildingKindBefore", message: houseKindTaxChangeInsideMessage(1, 0),
    });
    // 신축 → 구분 변경 → 철거(주택)
    expect(houseKindEventIssue([row("building_built", "2014-06-01"), row("tax_type_changed", "2016-01-01"), row("building_removed", "2018-01-01", "house")])).toMatchObject({ index: 2, field: "buildingKindBefore" });
  });

  it("주택 구간 **밖**의 구분 변경은 막지 않는다 — 철거 뒤 나대지 위 구분 변경 · 신축 앞 나대지 위 구분 변경 · 주택이 아닌 건축물(종류 비움) 안의 구분 변경", () => {
    expect(houseKindEventIssue([row("building_removed", "2016-01-01", "house"), row("tax_type_changed", "2018-01-01")])).toBeNull();
    expect(houseKindEventIssue([row("building_removed", "2016-01-01", "house"), row("tax_type_changed", "2017-01-01"), row("building_built", "2018-01-01"), row("building_removed", "2020-01-01", "house")])).toBeNull();
    expect(houseKindEventIssue([row("tax_type_changed", "2016-01-01"), row("building_removed", "2018-01-01", "")])).toBeNull();
    expect(houseKindEventIssue([row("tax_type_changed", "2016-01-01"), row("building_removed", "2018-01-01")])).toBeNull();
  });

  it("두 번째 주택 구간은 첫 구간의 구분 변경과 무관하다 — 신축 이후 구간만 본다", () => {
    expect(houseKindEventIssue([row("tax_type_changed", "2015-01-01"), row("building_removed", "2016-01-01"), row("building_built", "2017-01-01"), row("building_removed", "2020-01-01", "house")])).toBeNull();
  });

  it("`stateEventSequenceIssue`(subject = building)가 같은 호출 안에서 D-8을 적용한다 — ⑧·⑫가 한 호출로 같은 결과(Anchor 5)", () => {
    const events = [row("building_removed", "2016-01-01", "house"), row("building_built", "2017-01-01", "house")];
    const s = stateEventSequenceIssue(events.map((e) => ({ ...e })), { transferDate: "2024-01-01" });
    expect(s).toMatchObject({ index: 1, field: "buildingKindBefore" });
    // 행·순서 오류가 D-8보다 먼저다(화면 순서)
    expect(stateEventSequenceIssue([row("building_removed", "2016-01-01", "house"), row("building_removed", "2017-01-01", "house")], { transferDate: "2024-01-01" })).toMatchObject({ field: "kind" });
    // 정상 입력은 null
    expect(stateEventSequenceIssue([row("building_removed", "2016-01-01", "house")], { transferDate: "2024-01-01" })).toBeNull();
  });

  it("주택부수토지 카드(subject = house)는 이 규칙을 적용하지 않는다 — 종류 칸이 없어 와이어에 stale이 와도 A 판정·문구는 종전과 같다(A 바이트 동일)", () => {
    expect(stateEventSequenceIssue([row("building_built", "2020-01-01", "house")], { transferDate: "2024-01-01", subject: "house" })).toBeNull();
  });
});

describe("E3d-2 `eventClosesHouseInterval` — 주택 구간을 닫는 행(종류 칸 · 단일 술어)", () => {
  const events = [row("building_removed", "2016-01-01", "house"), row("building_built", "2017-01-01"), row("building_removed", "2020-01-01"), row("tax_type_changed", "2021-01-01", "house")];
  it("기타토지(tailKind 없음): 철거 행 ∧ `buildingKindBefore = house`일 때만 — 종류 없음·`\"\"`·신축·구분 변경 행은 아니다", () => {
    expect(events.map((_, i) => eventClosesHouseInterval(events, i, undefined))).toEqual([true, false, false, false]);
    expect(eventClosesHouseInterval([row("building_removed", "2016-01-01", "")], 0, undefined)).toBe(false);
  });
  it("주택부수토지(tailKind = house): 철거 행 전부(종류 칸과 무관 — A 동작 보존) · 범위 밖 index는 false", () => {
    expect(events.map((_, i) => eventClosesHouseInterval(events, i, "house"))).toEqual([true, false, true, false]);
    expect(eventClosesHouseInterval(events, 9, "house")).toBe(false);
  });
});

describe("E3d-2 구간 변환 — 철거 행별 주택 구간(`buildingKind = house` · 재산세 구분 읽지 않음)", () => {
  const ev = (kind: StateEvent["kind"], date: string, extra: Partial<StateEvent> = {}): StateEvent => ({ kind, date: d(date), ...extra });
  const tail = { hasBuilding: false, propertyTaxType: "comprehensive" as const, houseCtx: CTX };

  it("주택 철거 행만 주택 구간 — 주택 아닌 철거 행은 종전 구간(재산세 구분 사슬)", () => {
    const ivs = deriveOtherLandStateIntervals(
      [ev("building_removed", "2016-01-01", { buildingKindBefore: "house", houseFootprintBefore: 200 }), ev("building_built", "2017-01-01"), ev("building_removed", "2020-01-01", { propertyTaxTypeBefore: "separate" })],
      d("2014-01-02"), d("2024-01-01"), tail,
    );
    expect(ivs.map((i) => [i.hasBuilding, i.buildingKind ?? null, i.houseOutcome ?? null, i.propertyTaxType])).toEqual([
      [true, "house", "within", "unknown"],
      [false, null, null, "comprehensive"],
      [true, null, null, "separate"],
      [false, null, null, "comprehensive"],
    ]);
    expect(ivs.map(isStateIntervalBusiness)).toEqual([true, false, true, false]);
  });

  it("주택 구간의 사업용 술어는 재산세 구분을 보지 않는다(Y-13) — `within`만 사업용, `exceeded`·`unconfirmed`는 같은 접힘(Y-7)", () => {
    const base = { hasBuilding: true as const, propertyTaxType: "unknown" as const, buildingKind: "house" as const };
    expect(isStateIntervalBusiness({ ...base, houseOutcome: "within" })).toBe(true);
    expect(isStateIntervalBusiness({ ...base, houseOutcome: "exceeded" })).toBe(false);
    expect(isStateIntervalBusiness({ ...base, houseOutcome: "unconfirmed" })).toBe(false);
    expect(isStateIntervalBusiness({ ...base, propertyTaxType: "separate", houseOutcome: "exceeded" })).toBe(false);
  });

  it("직접 호출 안전망: 주택 행인데 `houseCtx`가 없으면 던진다(침묵 보정 금지) · D-8 위반(신축 행 종류 칸 · 주택 구간 안 구분 변경)도 던진다", () => {
    expect(() => deriveOtherLandStateIntervals([ev("building_removed", "2016-01-01", { buildingKindBefore: "house", houseFootprintBefore: 200 })], d("2014-01-02"), d("2024-01-01"), { hasBuilding: false, propertyTaxType: "comprehensive" })).toThrow(TaxCalculationError);
    expect(() => deriveOtherLandStateIntervals([ev("building_built", "2016-01-01", { buildingKindBefore: "house" })], d("2014-01-02"), d("2024-01-01"), tail)).toThrow(TaxCalculationError);
    expect(() => deriveOtherLandStateIntervals([ev("tax_type_changed", "2015-01-01"), ev("building_removed", "2016-01-01", { buildingKindBefore: "house", houseFootprintBefore: 200 })], d("2014-01-02"), d("2024-01-01"), tail)).toThrow(TaxCalculationError);
  });

  it("주택 행이 없으면 `houseCtx`를 읽지 않는다(종전 호출 호환) — 같은 입력에 ctx 유무가 결과를 바꾸지 않는다", () => {
    const events = [ev("building_removed", "2016-01-01", { propertyTaxTypeBefore: "separate" })];
    const a = deriveOtherLandStateIntervals(events, d("2014-01-02"), d("2024-01-01"), { hasBuilding: false, propertyTaxType: "comprehensive" });
    const b = deriveOtherLandStateIntervals(events, d("2014-01-02"), d("2024-01-01"), tail);
    expect(b).toEqual(a);
  });
});

describe("E3d-2 D-13·V-22 `housePriorNeedsMetropolitan` — 수도권 칸 조건부 개방 술어(단일 소스)", () => {
  const houseEv = [row("building_removed", "2021-01-01", "house")];
  const ZONES: ZoneType[] = ["residential", "exclusive_residential", "general_residential", "semi_residential", "commercial", "industrial", "green", "conservation_green", "management", "agriculture_forest", "natural_env", "unplanned", "undesignated"];

  it("현행 배율표에서 파생: 수도권 안팎 배율이 다른 용도지역 = 도시지역 주·상·공뿐 (표를 읽어 구한다 — 별도 목록이 아니다)", () => {
    const sensitive = ZONES.filter((z) => housePriorNeedsMetropolitan("other_land", z, houseEv));
    for (const z of ZONES) {
      const direct = getHousingMultiplier(z, true, HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE).multiplier !== getHousingMultiplier(z, false, HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE).multiplier;
      expect(housePriorNeedsMetropolitan("other_land", z, houseEv), z).toBe(direct);
      expect(metropolitanChangesHousingMultiplier(z), z).toBe(direct);
    }
    expect(sensitive.length).toBeGreaterThan(0);
    // 계획서 §3.4: 주·상·공만 — 녹지·그 밖의 도시·도시지역 밖은 아니다
    for (const z of ["green", "conservation_green", "management", "agriculture_forest", "natural_env", "undesignated", "unplanned"] as ZoneType[]) expect(housePriorNeedsMetropolitan("other_land", z, houseEv), z).toBe(false);
    for (const z of ["residential", "general_residential", "commercial", "industrial"] as ZoneType[]) expect(housePriorNeedsMetropolitan("other_land", z, houseEv), z).toBe(true);
  });

  it("양도일 2022.1.1. 전이면 수도권이 배율을 가르지 않는다 — 날짜 인자(경고 게이트)가 같은 표를 읽는다", () => {
    expect(metropolitanChangesHousingMultiplier("general_residential", d("2021-12-31"))).toBe(false);
    expect(metropolitanChangesHousingMultiplier("general_residential", d("2022-01-01"))).toBe(true);
  });

  it("조건: 기타토지 지목군 ∧ 주택으로 고른 철거 행 — 주택 행이 없으면(빈 배열·종류 없음·`\"\"`·신축 행) false(Y-26: other_land 전체로 넓히지 않는다)", () => {
    for (const landType of ["other_land", "vacant_lot", "miscellaneous"] as const) expect(housePriorNeedsMetropolitan(landType, "general_residential", houseEv), landType).toBe(true);
    expect(housePriorNeedsMetropolitan("other_land", "general_residential", [])).toBe(false);
    expect(housePriorNeedsMetropolitan("other_land", "general_residential", undefined)).toBe(false);
    expect(housePriorNeedsMetropolitan("other_land", "general_residential", [row("building_removed", "2021-01-01")])).toBe(false);
    expect(housePriorNeedsMetropolitan("other_land", "general_residential", [row("building_removed", "2021-01-01", "")])).toBe(false);
    expect(housePriorNeedsMetropolitan("other_land", "general_residential", [row("building_built", "2021-01-01", "house")])).toBe(false);
  });

  it("다른 지목: 주택부수토지(소비표가 이미 연다 — 중복 개방 없음)·별장·농·임·목·건물부수·빈 값은 false", () => {
    for (const landType of ["housing_site", "villa_land", "farmland", "forest", "pasture", "building_site", "", undefined] as const) {
      expect(housePriorNeedsMetropolitan(landType as never, "general_residential", houseEv), String(landType)).toBe(false);
    }
  });

  it("용도지역이 빈 문자열·미정의·알 수 없는 값이어도 던지지 않고 false", () => {
    for (const z of ["", undefined, "no-such-zone"]) expect(housePriorNeedsMetropolitan("other_land", z, houseEv), String(z)).toBe(false);
  });
});

describe("E3d-2 UQ-12 R-10 `stateHistoryDeemedBlocks` — 양도일 의제 사유가 이력을 접는 조건(④·⑭·엔진·⑧ 같은 술어)", () => {
  it("의제를 소비하는 지목 ∧ 사유가 «없음»이 아님 — 기타토지·농·임·목·별장은 true 가능, 주택부수토지·건물부수·빈 지목은 의제를 읽지 않아 false", () => {
    for (const landType of ["other_land", "vacant_lot", "farmland", "forest", "pasture", "villa_land"] as const) expect(stateHistoryDeemedBlocks({ landType, deemedReason: "auction" }), landType).toBe(true);
    for (const landType of ["housing_site", "building_site", "", undefined] as const) expect(stateHistoryDeemedBlocks({ landType: landType as never, deemedReason: "auction" }), String(landType)).toBe(false);
  });
  it("사유 `none`·빈 문자열·미정의는 false", () => {
    for (const deemedReason of ["none", "", undefined]) expect(stateHistoryDeemedBlocks({ landType: "other_land", deemedReason }), String(deemedReason)).toBe(false);
  });
});

describe("E3d-2 ⑧ 공용 정착면적 검증 — B는 «건축물 사건» 접두(D-9) · 기본(주택부수토지)은 바이트 동일", () => {
  it("기본 subject = house: 종전 문구(주택 사건 · 주택 이력 질문)", () => {
    expect(houseFootprintIssue("", 0, "500")!.message).toBe(houseFootprintBlankMessage(0));
    expect(houseFootprintIssue("", 0, "500")!.message).toContain("주택 사건 1번째 행");
    expect(houseFootprintIssue("", 0, "500")!.message).toContain("주택 이력 질문");
  });
  it("subject = building: 행 접두는 기타토지 카드의 행 제목과 같다(건축물 사건) — 결함 종류·판정은 같다", () => {
    for (const fp of ["", "0", "-5", "abc", "1200", "200", "199.99"]) {
      const a = houseFootprintIssue(fp, 1, "1000");
      const b = houseFootprintIssue(fp, 1, "1000", "building");
      expect(b?.kind, fp).toBe(a?.kind);
      if (b) {
        expect(b.message).toContain("건축물 사건 2번째 행");
        expect(a!.message).toContain("주택 사건 2번째 행");
        if (b.kind === "blank" || b.kind === "exceeds_land") {
          expect(b.message).toContain("건축물 이력 질문"); // 탈출구 문구(이력 질문 «모름»)가 있는 결함만
          expect(a!.message).toContain("주택 이력 질문");
        }
      }
    }
  });
});

describe("E3d-2 T-8 정착면적 문자열 격자 — ⑧ 차단 ⇔ 엔진 `unconfirmed` 접힘(Anchor 11 엔진 쪽 · Q-10 (가)·D-16)", () => {
  const LAND = 1000;
  const CASES: Array<[string | undefined, string]> = [
    [undefined, "blank"], ["", "blank"], ["  ", "blank"], ["0", "not_positive"], ["0.00", "not_positive"], ["-5", "not_positive"],
    ["abc", "not_number"], ["12abc", "not_number"], ["1e2", "not_number"], ["NaN", "not_number"], ["Infinity", "not_number"],
    ["1200", "exceeds_land"], ["1,200", "exceeds_land"], ["1000.01", "exceeds_land"],
  ];
  it.each(CASES)("정착면적 %j → ⑧ %s · 엔진은 던지지 않는다(읽히지 않거나 비양수·정착>토지는 unconfirmed 접힘)", (fp, kind) => {
    const issue = houseFootprintIssue(fp, 0, LAND);
    expect(issue?.kind).toBe(kind);
    // 엔진 안전망: 직접 API는 ⑭ `parseRawNumber`(parseFloat — ⑧보다 관대하다: «12abc» = 12 · «1e2» = 100)를 거쳐 들어온다. 읽히지 않거나(blank·NaN·Infinity·abc) 0 이하이거나 토지 면적보다 크면 접힘(unconfirmed),
    // 관대하게 읽혀 정상 수치가 된 값은 그 수치 그대로 계산된다(입력한 «12abc» = 12㎡ 입력과 같다 — UI는 ⑧이 먼저 막는다).
    const parsed = parseRawNumber(fp ?? "");
    const out = resolveHouseInterval(parsed, CTX).houseOutcome;
    if (parsed === undefined || parsed <= 0 || parsed > LAND) expect(out).toBe("unconfirmed");
    else expect(["within", "exceeded"]).toContain(out);
  });
  it.each([["200"], ["200.00"], ["199.99"], ["1,000"], ["1000"], ["0.01"], [" 100 "]])("정착면적 %j → ⑧ 통과(결함 없음) · 엔진은 계산한다(within/exceeded)", (fp) => {
    expect(houseFootprintIssue(fp, 0, LAND)).toBeNull();
    const out = resolveHouseInterval(Number(fp.replace(/,/g, "").trim()), CTX).houseOutcome;
    expect(["within", "exceeded"]).toContain(out);
  });
  it("정착면적 = 토지 면적(1,000)은 ⑧ 통과 · 엔진 within(허용 5,000) — 경계에서 «초과 = 접힘 아님»", () => {
    expect(houseFootprintIssue("1000", 0, LAND)).toBeNull();
    expect(resolveHouseInterval(1000, CTX).houseOutcome).toBe("within");
  });
});

describe("E3d-2 지목 가드 — B 술어가 참이 될 수 있는 지목 = 기타토지 3지목뿐", () => {
  it("모든 LandType을 훑어 확인한다", () => {
    const ALL = ["farmland", "paddy", "field", "orchard", "forest", "pasture", "vacant_lot", "building_site", "housing_site", "villa_land", "other_land", "miscellaneous", "other"] as const;
    expect(ALL.filter((t) => housePriorNeedsMetropolitan(t, "general_residential", [row("building_removed", "2021-01-01", "house")]))).toEqual(["vacant_lot", "other_land", "miscellaneous"]);
  });
});
