/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-3 — 영 §103의2 2호 **단서**(빈집정비 철거 빈집 부속토지 중 국가·지방자치단체·지방자치단체조합이 1년 이상 공용·공공용으로 사용하고
 * 법 §109② 단서로 재산세가 부과되는 것은 그 사용 기간 동안 포함) 엔진 anchor.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-5d-vacant-public-use.engine.plan.md §3 · §5 · §6(P-0~P-9 · Q0~Q4 · R-1~R-8) · §6.3(mutation M-P1~M-P15)
 * 오라클: `evalDayRow`(= `meetsPeriodCriteria`)에 사업용 구간을 직접 넣은 값 + 창 계산은 독립 산식(민법 §157·§160 — `periodEndFromMonths`) — 엔진을 거치지 않는다.
 *
 * 구성
 *   A  leaf `demolishedPublicUseAsked` — 답 의존 사슬 진리표
 *   B  leaf `demolishedStatusWindow` — 창 ∩ 공용 사용 기간 · 게이트 · 접힘 사유 우선순위 · 경계 쌍 · 혼합(단서 시행 전 과세기준일 + 단서)
 *   C  엔진 raw → ⑭ → 판정·세액 — P·Q 행(오라클 대조) · echo · 라벨 · 고지
 *   D  형제 안전망 — 단서 없는 경로 바이트 동일(R-1·R-2·R-6·R-7) · 구 입력(E0 골든)
 */
import { describe, it, expect } from "vitest";
import { evalDayRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { e35Base } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-5-table";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { periodEndFromMonths } from "@/lib/tax-engine/civil-period";
import { demolishedPublicUseAsked, demolishedRequiredFacts, demolishedStatusWindow } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { BARE_DEMOLISHED_FOLD_NOTICE } from "@/lib/tax-engine/non-business-land/state-history-echo";
import {
  NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE,
  NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE,
  NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE,
  NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL } from "@/lib/tax-engine/legal-codes/transfer-nbl";
import { bareIntervalTaxTypeText, BARE_FOLD_REASON_TEXT } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { addDays, parseISO } from "@/lib/tax-engine/utc-date";

const d = (s: string) => parseISO(s);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (raw: Record<string, unknown>) => judgeNonBusinessLand(fromRaw(raw), R);
function taxOf(input: NonBusinessLandInput): number {
  return calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;
}
const taxRaw = (raw: Record<string, unknown>) => taxOf(fromRaw(raw));
/** 독립 B(전량 사업용 — 건물 보유) · N(전량 비사업용 — 건물 없는 종합합산) 세액 — 같은 취득·양도일. */
const bTax = (acq: string, transfer: string) => taxRaw(e35Base({ acquisitionDate: acq, transferDate: transfer, nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250" }));
const nTax = (acq: string, transfer: string) => taxRaw(e35Base({ acquisitionDate: acq, transferDate: transfer, nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false }));
const oracle = (r: { acq: string; transfer: string; biz: ReadonlyArray<readonly [string, string]> }) => evalDayRow({ acq: r.acq, transfer: r.transfer, biz: r.biz });

// ── 시료 ─────────────────────────────────────────────────────────────────────

/** 시료 H — 취득 2023-03-01 · 주택 신축 2023-03-02 · 철거 2024-03-01 · 구분 변경(닫는 행) `closeOn` · 양도 `transfer`. 주택 정착면적 400㎡(1,000㎡의 3배 이상 허용 → 이내). */
function houseRow(o: { acq?: string; bldStart?: string; removedOn?: string; closeOn?: string; transfer?: string }, facts: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return e35Base({
    acquisitionDate: o.acq ?? "2023-03-01",
    transferDate: o.transfer ?? "2027-01-15",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherHasBuilding: false,
    nblIsMetropolitanArea: "no",
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [
      { kind: "building_built", date: o.bldStart ?? "2023-03-02" },
      { kind: "building_removed", date: o.removedOn ?? "2024-03-01", propertyTaxTypeBefore: "separate", buildingKindBefore: "house", houseFootprintBefore: "400" },
      { kind: "tax_type_changed", date: o.closeOn ?? "2026-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...facts },
    ],
    ...extra,
  });
}
/** 사실 칸 — 허가 예 · 건축 외 용도 예 · 빈집정비 예 · 공용 사용 예 · 유료 예 + 기간. */
const PU = (from: string, to: string, over: Record<string, unknown> = {}) => ({
  demolishedPermitBefore: "yes",
  demolishedOtherUseBefore: "yes",
  demolishedVacantHouseBefore: "yes",
  demolishedPublicUseBefore: "yes",
  demolishedPublicUsePaidBefore: "yes",
  demolishedPublicUseFromBefore: from,
  demolishedPublicUseToBefore: to,
  ...over,
});
const H = (facts: Record<string, unknown>, o: Parameters<typeof houseRow>[0] = {}) => houseRow(o, facts);
/** 시료 K7 — 취득 2018-06-01 · 건물 2020-06-01 · 철거 2021-06-02 · 구분 변경 2024-08-01 · 양도 2024-09-01. */
const K7 = (facts: Record<string, unknown>) => houseRow({ acq: "2018-06-01", bldStart: "2020-06-01", removedOn: "2021-06-02", closeOn: "2024-08-01", transfer: "2024-09-01" }, facts);

const intervals = (raw: Record<string, unknown>) => judge(raw).periodEvaluation?.stateHistory?.intervals ?? [];
const bare = (raw: Record<string, unknown>) => intervals(raw).find((x) => !x.hasBuilding && x.basis === "demolished")!;
const days = (a: string, b: string) => Math.round((d(b).getTime() - d(a).getTime()) / 86_400_000);

// ── A. `demolishedPublicUseAsked` ─────────────────────────────────────────────

describe("E3f-3 A — `demolishedPublicUseAsked`: 답 의존 사슬(건축 외 용도 «예» ∧ 빈집정비 «예» → 공용 사용 «예» → 유료 «예»)", () => {
  const YES = { otherUse: true, vacantHouse: true };
  const VALUES = ["", "yes", "no", "unknown"] as const;

  it("진리표: 4답 × 4답 × 4답 × 4답 전 조합 — 독립 계산(사슬)과 일치", () => {
    let n = 0;
    for (const otherUse of VALUES) for (const vacant of VALUES) for (const publicUse of VALUES) for (const paid of VALUES) {
      const got = demolishedPublicUseAsked(YES, { demolishedOtherUseBefore: otherUse, demolishedVacantHouseBefore: vacant, demolishedPublicUseBefore: publicUse, demolishedPublicUsePaidBefore: paid });
      const first = otherUse === "yes" && vacant === "yes";
      const second = first && publicUse === "yes";
      const third = second && paid === "yes";
      expect(got, `${otherUse}/${vacant}/${publicUse}/${paid}`).toEqual({ publicUse: first, paid: second, dates: third });
      n++;
    }
    expect(n).toBe(256);
  });

  it("구조 술어가 거짓이면(비주택 철거 행 `vacantHouse` 아님 · 2024.6.1. 전 시행본 `otherUse` 아님) 답이 전부 «예»여도 하위 칸 0", () => {
    const all = { demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes", demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes" };
    for (const need of [{ otherUse: true, vacantHouse: false }, { otherUse: false, vacantHouse: true }, { otherUse: false, vacantHouse: false }]) {
      expect(demolishedPublicUseAsked(need, all)).toEqual({ publicUse: false, paid: false, dates: false });
    }
  });

  it("실제 구조 술어와 접합: 주택 철거 행(2024.6.1.~ 시행본)만 열린다 — 비주택 건축물 행은 빈집정비 칸이 없어 하위 칸도 없다(R-2) · 읽지 않으면(UQ-8) 없다(R-5)", () => {
    const all = { demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes", demolishedPublicUseBefore: "yes", demolishedPublicUsePaidBefore: "yes" };
    const house = demolishedRequiredFacts({ removedOn: d("2024-03-01"), end: d("2026-12-01"), kind: "house", historyRead: true });
    const building = demolishedRequiredFacts({ removedOn: d("2024-03-01"), end: d("2026-12-01"), kind: "building", historyRead: true });
    const notRead = demolishedRequiredFacts({ removedOn: d("2024-03-01"), end: d("2026-12-01"), kind: "house", historyRead: false });
    expect(demolishedPublicUseAsked(house, all).dates).toBe(true);
    expect(demolishedPublicUseAsked(building, all)).toEqual({ publicUse: false, paid: false, dates: false });
    expect(demolishedPublicUseAsked(notRead, all)).toEqual({ publicUse: false, paid: false, dates: false });
  });
});

// ── B. `demolishedStatusWindow` ───────────────────────────────────────────────

describe("E3f-3 B — `demolishedStatusWindow`: 창 ∩ 공용 사용 기간 · 게이트(공용 사용 기간 안 과세기준일) · 접힘 사유", () => {
  const win = (removedOn: string, end: string, facts: Parameters<typeof demolishedStatusWindow>[0]["facts"], intervalStart = removedOn) =>
    demolishedStatusWindow({ removedOn: d(removedOn), intervalStart: d(intervalStart), end: d(end), kind: "house", facts, landArea: 1000, zoneType: "general_residential" });
  const F = (from: string, to: string, over: Record<string, unknown> = {}) => ({
    permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicPaid: "yes", publicUseFrom: d(from), publicUseTo: d(to), ...over,
  }) as Parameters<typeof demolishedStatusWindow>[0]["facts"];
  const span = (w: ReturnType<typeof win>) => (w.kind === "holds" ? [iso(w.window.start), iso(w.window.end), days(iso(w.window.start), iso(w.window.end))] : w);

  it.each([
    // [행, 개시, 종료, 창 시작, 창 끝(반열린), 일수] — 시료 H: 철거 2024-03-01 · 구간 끝 2026-12-01 · 3년 만료일 2027-03-01
    ["P-1 구간 끝 클립", "2025-01-01", "2026-12-01", "2025-01-01", "2026-12-01", 699],
    ["P-2 종료일 당일 포함(과세기준일 2024-06-01만 덮음 — 2호 단서 최초 적용 과세기준일)", "2024-04-01", "2024-12-01", "2024-04-01", "2024-12-02", 245],
    ["P-3 1년 미만(2026-06-01 — 현행 문언 최초 적용 과세기준일)", "2026-01-01", "2026-12-01", "2026-01-01", "2026-12-01", 334],
    ["P-5a 종료일 = 과세기준일 당일 → 성립(양 끝 포함)", "2024-07-01", "2025-06-01", "2024-07-01", "2025-06-02", 336],
    ["P-5b 개시일 = 과세기준일 당일 → 성립", "2025-06-01", "2025-12-31", "2025-06-01", "2026-01-01", 214],
    ["P-6 개시일이 철거일보다 빨라도 철거일로 잘림", "2023-10-01", "2026-12-01", "2024-03-01", "2026-12-01", 1005],
  ])("%s", (_n, from, to, s, e, n) => {
    expect(span(win("2024-03-01", "2026-12-01", F(from, to)))).toEqual([s, e, n]);
  });

  it.each([
    ["P-4 공용 사용 기간(2024-07-01~2025-05-31) 안에 과세기준일 6.1.이 없다", "2024-07-01", "2025-05-31"],
    ["P-5c 개시일 = 과세기준일 다음날 · 종료일 = 다음 과세기준일 전날 — 하루 차로 접힘(P-5a/b 뒷면)", "2025-06-02", "2026-05-31"],
  ])("접힘 `demolished_public_use_no_base_date` — %s", (_n, from, to) => {
    expect(win("2024-03-01", "2026-12-01", F(from, to))).toEqual({ kind: "fold", reason: "demolished_public_use_no_base_date" });
  });

  it("P-7: 공용 사용이 3년 만료일(2027-03-01) 뒤까지 → 만료일 + 1일로 잘림(구간 끝 2027-06-01)", () => {
    expect(span(win("2024-03-01", "2027-06-01", F("2025-01-01", "2028-01-01")))).toEqual(["2025-01-01", "2027-03-02", 790]);
    expect(iso(periodEndFromMonths(d("2024-03-01"), 36))).toBe("2027-03-01");
  });

  it("P-9: 구간 끝 당일이 과세기준일이면 구간 밖(s < end) — 기존 게이트 승계", () => {
    expect(win("2024-03-01", "2025-06-01", F("2024-07-01", "2025-12-31"))).toEqual({ kind: "fold", reason: "demolished_public_use_no_base_date" });
  });

  it("공용 사용 칸이 건축 외 용도 «아니오»를 따라가지 않는다 — 건축 외 용도 «아니오»면 하위 칸이 있어도 무시(P-0 창과 바이트 동일 · R-6)", () => {
    const base = win("2024-03-01", "2026-12-01", { permit: "yes", otherUse: "no", vacantHouse: "yes" });
    expect(span(base)).toEqual(["2024-03-01", "2026-12-01", 1005]);
    expect(win("2024-03-01", "2026-12-01", F("2025-01-01", "2026-12-01", { otherUse: "no" }))).toEqual(base);
  });

  it("접힘 사유: ①·②가 «아니오»·«모름»·미선택·날짜 결함이면 단서 불성립 → `demolished_other_use`(무상·미확인 — 새 사유 아님) · 개시 > 종료도 단서 불성립", () => {
    for (const publicUse of ["no", "unknown", ""]) expect(win("2024-03-01", "2026-12-01", F("2025-01-01", "2026-12-01", { publicUse })), publicUse).toEqual({ kind: "fold", reason: "demolished_other_use" });
    for (const publicPaid of ["no", "unknown", ""]) expect(win("2024-03-01", "2026-12-01", F("2025-01-01", "2026-12-01", { publicPaid })), publicPaid).toEqual({ kind: "fold", reason: "demolished_other_use" });
    expect(win("2024-03-01", "2026-12-01", F("2025-06-01", "2025-05-31"))).toEqual({ kind: "fold", reason: "demolished_other_use" });
    expect(win("2024-03-01", "2026-12-01", F("2025-01-01", "2026-12-01", { publicUseFrom: undefined }))).toEqual({ kind: "fold", reason: "demolished_other_use" });
    expect(win("2024-03-01", "2026-12-01", F("2025-01-01", "2026-12-01", { publicUseTo: undefined }))).toEqual({ kind: "fold", reason: "demolished_other_use" });
    expect(win("2024-03-01", "2026-12-01", F("2025-01-01", "2026-12-01", { publicUseTo: new Date(Number.NaN) }))).toEqual({ kind: "fold", reason: "demolished_other_use" });
    // 빈집정비 «아니오» — 단서는 2호(빈집)에만 있다(1호 일반 철거에는 없다 — R-1)
    expect(win("2023-12-15", "2024-12-01", F("2024-04-01", "2024-12-01", { vacantHouse: "no" }))).toEqual({ kind: "fold", reason: "demolished_other_use" });
  });

  it("접힘 우선순위: 기간(never) → 허가 → (공용 사용 기간 안 과세기준일 없음 | 건축 외 용도) — R-7 허가 «아니오»가 단서보다 앞", () => {
    expect(win("2024-03-01", "2026-12-01", F("2024-07-01", "2025-05-31", { permit: "no" }))).toEqual({ kind: "fold", reason: "demolished_permit" });
    expect(win("2024-03-01", "2026-12-01", F("2025-01-01", "2026-12-01", { permit: "unknown" }))).toEqual({ kind: "fold", reason: "demolished_permit" });
    // 철거 2021-05-01 — 구간이 3년 만료 뒤(2024-05-02~)에 시작해 과세기준일이 없다 → never(단서보다 앞)
    expect(win("2021-05-01", "2026-12-01", F("2025-01-01", "2026-12-01"), "2024-06-02")).toEqual({ kind: "fold", reason: "demolished_never_period" });
  });

  it("Q 행(시료 K7 — 철거 2021-06-02 · 구간 끝 2024-08-01): 유일한 후보 과세기준일 2024-06-01 — 창 ∩ 사용 기간", () => {
    const k7 = (from: string, to: string) => win("2021-06-02", "2024-08-01", F(from, to));
    expect(span(k7("2024-01-01", "2024-07-01"))).toEqual(["2024-01-01", "2024-06-03", 154]); // Q1 — 2024-06-01 최초 적용 과세기준일을 덮음 · 3년 만료일 2024-06-02
    expect(span(k7("2023-06-01", "2024-07-01"))).toEqual(["2023-06-01", "2024-06-03", 368]); // Q3
    expect(span(k7("2024-05-01", "2024-07-01"))).toEqual(["2024-05-01", "2024-06-03", 33]); // Q4
    expect(k7("2024-01-01", "2024-05-31")).toEqual({ kind: "fold", reason: "demolished_public_use_no_base_date" }); // Q2 — 종료일이 최초 과세기준일 하루 전
  });

  it("혼합: 단서 시행(2024.6.1.) 전 과세기준일(제한 없음)과 단서에 기댄 과세기준일이 함께 성립 — 창이 맞닿거나 겹치면 합치고, 떨어지면 제한 없는 쪽만(종전 판정을 줄이지 않는다)", () => {
    // 철거 2023-03-01 · 구간 끝 2025-01-01: 2023-06-01(6개월 안 · 시행본 전 제한 없음) · 2024-06-01(3년 · 단서 필요)
    const mixed = (from: string, to: string) => win("2023-03-01", "2025-01-01", F(from, to));
    const noClaim = win("2023-03-01", "2025-01-01", F("2025-01-01", "2025-01-01", { publicUse: "no" }));
    expect(noClaim).toMatchObject({ kind: "holds", months: 6, publicUse: false });
    expect(span(noClaim)).toEqual(["2023-03-01", "2023-09-02", 185]);
    // 공용 사용이 6개월 창과 겹친다 → 합집합 [2023-03-01, 3년 창 ∩ 사용 끝+1)
    const overlap = mixed("2023-08-01", "2024-07-01");
    expect(overlap).toMatchObject({ kind: "holds", publicUse: true, months: 36 });
    expect(span(overlap)).toEqual(["2023-03-01", "2024-07-02", 489]);
    // 떨어져 있다 → 제한 없는 창만(공용 사용 인정 없음 = 종전과 같다)
    const apart = mixed("2024-04-01", "2024-07-01");
    expect(apart).toMatchObject({ kind: "holds", publicUse: false, months: 6 });
    expect(span(apart)).toEqual(["2023-03-01", "2023-09-02", 185]);
    // 공용 사용이 2024-06-01을 덮지 못하면(제한 없는 쪽만 성립) → 종전과 같은 창
    expect(span(mixed("2024-07-01", "2024-12-31"))).toEqual(["2023-03-01", "2023-09-02", 185]);
  });
});

// ── C. raw → ⑭ → 판정·세액 ─────────────────────────────────────────────────────

describe("E3f-3 C — 엔진 raw → ⑭ → 판정·세액 (오라클 = `evalDayRow` + 독립 창)", () => {
  const ACQ = "2023-03-01";
  const T = "2027-01-15";
  const B = bTax(ACQ, T);
  const N = nTax(ACQ, T);
  const bldBiz: [string, string] = ["2023-03-02", "2024-03-01"];

  it("독립 B·N 시료: 같은 취득·양도일에서 B > N 차가 65,550,000이 아니라 N − B 부호 확인(비사업용이 더 큰 세액)", () => {
    expect(N).toBeGreaterThan(B);
  });

  it.each([
    // [행, 개시, 종료, 창, 판정(비사업용?), 사업용 일수]
    ["P-0 건축 외 용도 «아니오» — 단서 없는 경로 바이트 동일", null, null, ["2024-03-01", "2026-12-01"], false, 1370],
    ["P-1 2025-01-01 ~ 2026-12-01", "2025-01-01", "2026-12-01", ["2025-01-01", "2026-12-01"], false, 1064],
    ["P-2 2024-04-01 ~ 2024-12-01", "2024-04-01", "2024-12-01", ["2024-04-01", "2024-12-02"], true, 610],
    ["P-3 2026-01-01 ~ 2026-12-01(1년 미만)", "2026-01-01", "2026-12-01", ["2026-01-01", "2026-12-01"], true, 699],
    ["P-5a 2024-07-01 ~ 2025-06-01", "2024-07-01", "2025-06-01", ["2024-07-01", "2025-06-02"], true, 701],
    ["P-5b 2025-06-01 ~ 2025-12-31", "2025-06-01", "2025-12-31", ["2025-06-01", "2026-01-01"], true, 579],
    ["P-6 2023-10-01 ~ 2026-12-01(철거 전 개시)", "2023-10-01", "2026-12-01", ["2024-03-01", "2026-12-01"], false, 1370],
  ] as const)("%s", (_n, from, to, windowDays, nonBiz, eff) => {
    const raw = from ? H(PU(from, to!)) : H({ demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedVacantHouseBefore: "yes" });
    const o = oracle({ acq: ACQ, transfer: T, biz: [bldBiz, [windowDays[0], windowDays[1]]] });
    expect([o.meets, o.effectiveBusinessDays], "오라클").toEqual([!nonBiz, eff]);
    const j = judge(raw);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([nonBiz, eff, 1415]);
    expect(taxRaw(raw)).toBe(nonBiz ? N : B);
  });

  it.each([
    ["P-4 공용 사용 2024-07-01 ~ 2025-05-31 — 접힘 `demolished_public_use_no_base_date`", "2024-07-01", "2025-05-31"],
    ["P-5c 2025-06-02 ~ 2026-05-31", "2025-06-02", "2026-05-31"],
  ])("%s · 비사업용 365/1,415 · N", (_n, from, to) => {
    const raw = H(PU(from, to));
    const j = judge(raw);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays]).toEqual([true, 365]);
    expect(bare(raw)).toMatchObject({ basisOutcome: "unconfirmed", foldReason: "demolished_public_use_no_base_date", propertyTaxType: "comprehensive" });
    expect(taxRaw(raw)).toBe(N);
  });

  it("종래(E3f-2) 결과와 비교 — 건축 외 용도 «예»만(하위 칸 없음): 365/1,415 · N · `demolished_other_use` — P-1이 이 값에서 B로 뒤집힌다", () => {
    const old = H({ demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes" });
    expect([judge(old).isNonBusinessLand, judge(old).effectiveBusinessDays, taxRaw(old)]).toEqual([true, 365, N]);
    expect(bare(old)).toMatchObject({ foldReason: "demolished_other_use" });
    expect(taxRaw(H(PU("2025-01-01", "2026-12-01")))).toBe(B);
  });

  it("P-7: 공용 사용이 3년 만료일 뒤까지 · 구간 끝 2027-06-01 · 양도 2027-07-01 → 창 [2025-01-01, 2027-03-02) 790일 · 사업용 1,155/1,582", () => {
    const raw = H(PU("2025-01-01", "2028-01-01"), { closeOn: "2027-06-01", transfer: "2027-07-01" });
    const o = oracle({ acq: ACQ, transfer: "2027-07-01", biz: [bldBiz, ["2025-01-01", "2027-03-02"]] });
    expect([o.meets, o.effectiveBusinessDays]).toEqual([true, 1155]);
    const j = judge(raw);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([false, 1155, 1582]);
    expect(taxRaw(raw)).toBe(bTax(ACQ, "2027-07-01"));
  });

  it("P-8 철거일이 월 말일(2024-08-31 + 3년 → 만료일 2027-08-31 — `addMonths`면 2027-08-30으로 하루 불리): 공용 사용이 만료 뒤까지여도 창 끝 = 2027-09-01", () => {
    const raw = H(PU("2025-01-01", "2030-01-01"), { removedOn: "2024-08-31", closeOn: "2027-12-01", transfer: "2028-01-15" });
    const iv = bare(raw);
    expect(iso(iv.temporaryStatusWindow!.end)).toBe("2027-09-01");
  });

  it("Q 행(K7 · B 221,730,000 · N 283,080,000 — 현행 E3f-2 K-7과 같은 시료): Q0 1,463 · Q1 520 · Q3 734 · Q4 399 · Q2 366(접힘) — 세액은 판정이 안 뒤집혀 N", () => {
    const B7 = bTax("2018-06-01", "2024-09-01");
    const N7 = nTax("2018-06-01", "2024-09-01");
    const acq = "2018-06-01";
    const tr = "2024-09-01";
    const base: [string, string][] = [["2018-06-02", "2018-06-02"]]; // 자리표시(아래에서 건물 구간만 쓴다)
    void base;
    const bld: [string, string] = ["2020-06-01", "2021-06-02"];
    const q0 = K7({ demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedVacantHouseBefore: "yes" });
    expect(oracle({ acq, transfer: tr, biz: [bld, ["2021-06-02", "2024-06-03"]] }).effectiveBusinessDays).toBe(1463);
    expect([judge(q0).isNonBusinessLand, judge(q0).effectiveBusinessDays, taxRaw(q0)]).toEqual([false, 1463, B7]);
    const rows: Array<[string, string, string, [string, string] | null, number]> = [
      ["Q1", "2024-01-01", "2024-07-01", ["2024-01-01", "2024-06-03"], 520],
      ["Q3", "2023-06-01", "2024-07-01", ["2023-06-01", "2024-06-03"], 734],
      ["Q4", "2024-05-01", "2024-07-01", ["2024-05-01", "2024-06-03"], 399],
      ["Q2", "2024-01-01", "2024-05-31", null, 366],
    ];
    for (const [id, from, to, w, eff] of rows) {
      const raw = K7(PU(from, to));
      const o = oracle({ acq, transfer: tr, biz: w ? [bld, w] : [bld] });
      expect(o.effectiveBusinessDays, `${id} 오라클`).toBe(eff);
      const j = judge(raw);
      expect([id, j.isNonBusinessLand, j.effectiveBusinessDays, taxRaw(raw)]).toEqual([id, true, eff, N7]);
    }
  });

  it("echo · 라벨 · 고지: 받아들인 구간은 `temporaryStatusPublicUse` + «한시 기간 중 공용 사용 기간만» + 받아들임 고지(공용 사용 · 기본 받아들임 고지 둘 다) · 접힘은 새 사유 문구 · 고지", () => {
    const raw = H(PU("2025-01-01", "2026-12-01"));
    const iv = bare(raw);
    expect(iv).toMatchObject({ basisOutcome: "accepted", propertyTaxType: "separate", temporaryStatusMonths: 36, temporaryStatusRemovedKind: "house", temporaryStatusPublicUse: true, businessDays: 699 });
    expect([iso(iv.temporaryStatusWindow!.start), iso(iv.temporaryStatusWindow!.end)]).toEqual(["2025-01-01", "2026-12-01"]);
    expect(bareIntervalTaxTypeText(iv)).toBe("별도합산(나대지 — 철거·멸실 근거 · 한시 기간 중 공용 사용 기간만)");
    const warnings = judge(raw).warnings;
    expect(warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
    expect(warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE);
    expect(warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE);
    // 접힘 — 사유 문구 · 사유별 고지
    const fold = H(PU("2024-07-01", "2025-05-31"));
    expect(bareIntervalTaxTypeText(bare(fold))).toContain(BARE_FOLD_REASON_TEXT.demolished_public_use_no_base_date);
    expect(judge(fold).warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE);
    expect(BARE_DEMOLISHED_FOLD_NOTICE.demolished_public_use_no_base_date).toBe(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE);
    // 건축 외 용도 «예» 접힘 고지 — «없었다면 「아니오」» 조건문 + 단서·무상 안내(R-3)
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE).toContain("그런 사용이 없었다면 「아니오」");
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE).not.toContain("없었음을 확인해");
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE).toContain(NBL.PTAX_BASIS_DEMOLISHED_VACANT_HOUSE_PUBLIC_USE);
    expect(NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE).toContain("비과세");
    for (const n of [NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE, NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE, NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE]) expect(n).toContain("확인 필요");
    expect(NBL.PTAX_NON_TAXABLE_PUBLIC_USE).toBe("지방세법 §109 ②");
    expect(NBL.PTAX_BASIS_DEMOLISHED_VACANT_HOUSE_PUBLIC_USE).toBe("지방세법 §106 ① 2호 다목 + 지방세법 시행령 §103의2 2호 단서 + 지방세법 §109 ②");
    expect(NBL.PTAX_BASIS_DEMOLISHED_VACANT_HOUSE_PUBLIC_USE).not.toMatch(/법률 제/);
  });

  it("⑭ 날짜: JSON 경유 문자열이 `toOptionalDate`로 Date 변환돼 비교된다 — 종료일 = 과세기준일 당일(P-5a)이 성립(문자열 비교였다면 침묵 false)", () => {
    const raw = H(PU("2024-07-01", "2025-06-01"));
    const input = fromRaw(raw);
    const ev = input.landStateHistory!.events.at(-1)!;
    expect(ev.demolishedPublicUseFromBefore).toBeInstanceOf(Date);
    expect(ev.demolishedPublicUseToBefore).toBeInstanceOf(Date);
    expect([iso(ev.demolishedPublicUseFromBefore!), iso(ev.demolishedPublicUseToBefore!)]).toEqual(["2024-07-01", "2025-06-01"]);
    expect(judge(raw).effectiveBusinessDays).toBe(701);
  });

  it("창 하루 중복·누락 없음: 건축물 구간 끝 = 철거일 · 창 시작 = 공용 사용 개시일 — 합산 일수 = 오라클(P-1 1,064 = 365 + 699)", () => {
    const iv = bare(H(PU("2025-01-01", "2026-12-01")));
    expect(iv.businessDays).toBe(699);
    expect(days("2024-03-01", "2025-01-01") + 699 + days("2026-12-01", "2027-01-15")).toBe(days("2024-03-01", "2027-01-15"));
  });
});

// ── D. 형제 안전망 ─────────────────────────────────────────────────────────────

describe("E3f-3 D — 단서 없는 경로는 종전과 바이트 동일(E0 골든 · R-1·R-2·R-6·R-7)", () => {
  const ACQ = "2023-03-01";
  const T = "2027-01-15";
  const N = nTax(ACQ, T);
  const B = bTax(ACQ, T);
  const OLD_YES = { demolishedPermitBefore: "yes", demolishedOtherUseBefore: "yes", demolishedVacantHouseBefore: "yes" };

  it("R-1 빈집정비 «아니오»·«모름»·미선택 + 건축 외 용도 «예» + 하위 칸 stray → 단서 없음: `demolished_other_use`(철거 2024-03-01 + 일반 6개월 → 과세기준일 2024-06-01 안) · N", () => {
    for (const vacant of ["no", "unknown", ""]) {
      const raw = H(PU("2024-04-01", "2024-12-01", { demolishedVacantHouseBefore: vacant }));
      expect(bare(raw), vacant).toMatchObject({ basisOutcome: "unconfirmed", foldReason: "demolished_other_use" });
      expect(taxRaw(raw), vacant).toBe(N);
      // 하위 칸을 아예 안 보낸 입력과 같다
      const bareOnly = H({ ...OLD_YES, demolishedVacantHouseBefore: vacant });
      expect(JSON.stringify(judge(raw).periodEvaluation?.stateHistory?.intervals)).toBe(JSON.stringify(judge(bareOnly).periodEvaluation?.stateHistory?.intervals));
    }
  });

  it("R-2 비주택 건축물 철거 행(빈집은 주택만): 새 칸 stray가 있어도 단서 없음 — 종전 접힘과 같다", () => {
    const raw = e35Base({
      acquisitionDate: "2023-03-01", transferDate: "2027-01-15",
      nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false, nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [
        { kind: "building_built", date: "2023-03-02" },
        { kind: "building_removed", date: "2024-03-01", propertyTaxTypeBefore: "separate" },
        { kind: "tax_type_changed", date: "2026-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished", ...PU("2025-01-01", "2026-12-01", { demolishedFloorAreaBefore: "250" }) },
      ],
    });
    const plain = JSON.parse(JSON.stringify(raw));
    for (const k of ["demolishedPublicUseBefore", "demolishedPublicUsePaidBefore", "demolishedPublicUseFromBefore", "demolishedPublicUseToBefore"]) delete plain.nblOtherStateEvents[2][k];
    expect(JSON.stringify(judge(raw).periodEvaluation?.stateHistory?.intervals)).toBe(JSON.stringify(judge(plain).periodEvaluation?.stateHistory?.intervals));
    expect(taxRaw(raw)).toBe(taxRaw(plain));
  });

  it("R-6 건축 외 용도 «아니오»: 하위 칸이 남아 있어도 P-0과 바이트 동일 · 건축 외 용도 «예» → «아니오» 되돌려도 echo에 `temporaryStatusPublicUse` 없음", () => {
    const withStray = H(PU("2025-01-01", "2026-12-01", { demolishedOtherUseBefore: "no" }));
    const clean = H({ demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedVacantHouseBefore: "yes" });
    expect(JSON.stringify(judge(withStray).periodEvaluation?.stateHistory?.intervals)).toBe(JSON.stringify(judge(clean).periodEvaluation?.stateHistory?.intervals));
    expect(taxRaw(withStray)).toBe(B);
    expect("temporaryStatusPublicUse" in bare(withStray)).toBe(false);
    expect(judge(withStray).warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
  });

  it("R-7 허가 «아니오» + 단서 ① ② «예» → `demolished_permit`(허가 요건은 단서와 무관)", () => {
    const raw = H(PU("2025-01-01", "2026-12-01", { demolishedPermitBefore: "no" }));
    expect(bare(raw)).toMatchObject({ foldReason: "demolished_permit" });
    expect(taxRaw(raw)).toBe(N);
  });

  it("R-3 ① «아니오»·«모름» · ② «아니오»·«모름» · 개시>종료(엔진 직접 호출 안전망): 접힘 `demolished_other_use` · N · 단서 받아들임 고지 없음", () => {
    const cases: Record<string, unknown>[] = [
      { demolishedPublicUseBefore: "no" }, { demolishedPublicUseBefore: "unknown" },
      { demolishedPublicUsePaidBefore: "no" }, { demolishedPublicUsePaidBefore: "unknown" },
      { demolishedPublicUseFromBefore: "2026-01-01", demolishedPublicUseToBefore: "2025-01-01" },
    ];
    for (const patch of cases) {
      const raw = H(PU("2025-01-01", "2026-12-01", patch));
      expect(bare(raw), JSON.stringify(patch)).toMatchObject({ foldReason: "demolished_other_use" });
      expect(taxRaw(raw)).toBe(N);
      expect(judge(raw).warnings).not.toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
      expect(judge(raw).warnings).toContain(NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE);
    }
  });

  it("구 입력(공용 사용 키 없음) 바이트 동일 — 건축 외 용도 «예»만: 종전 echo에 `temporaryStatusPublicUse` 키가 없다 · 건축 외 용도 «아니오» 수락 구간 echo도 키 없음", () => {
    const old = H(OLD_YES);
    expect("temporaryStatusPublicUse" in bare(old)).toBe(false);
    const accepted = bare(H({ demolishedPermitBefore: "yes", demolishedOtherUseBefore: "no", demolishedVacantHouseBefore: "yes" }));
    expect(accepted.basisOutcome).toBe("accepted");
    expect("temporaryStatusPublicUse" in accepted).toBe(false);
    expect(bareIntervalTaxTypeText(accepted)).toBe("별도합산(나대지 — 철거·멸실 근거 · 한시 기간만)");
  });

  it("사업용 일수 계산이 새 키 존재만으로 달라지지 않는다 — `addDays` 독립 계산: 창 = [개시일, 종료일 + 1일)(P-2 종료일 2024-12-01 → 반열린 끝 2024-12-02)", () => {
    expect(iso(addDays(d("2024-12-01"), 1))).toBe("2024-12-02");
    expect(iso(bare(H(PU("2024-04-01", "2024-12-01"))).temporaryStatusWindow!.end)).toBe("2024-12-02");
  });
});
