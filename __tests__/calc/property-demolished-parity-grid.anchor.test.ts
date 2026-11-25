/**
 * PSA-E2 — 철거 요건 ⑧(`validateStep(2)`) ↔ ⑫(Zod `superRefine`) 패리티 격자 (계획서 §7.4 · M12).
 *
 * 격자: 종류 {"" · house · building} × 과세기준일 연도 {2015 · 2016 · 2018 · 2019 · 2023 · 2024 · 2026} × 철거일(s 뒤 · 당일 · 기간 안 · 6/12/36개월 만료일 당일과 앞뒤 하루)
 *       × 사실 칸 {허가 4 · 건축 외 4 · 빈집 3 · 공용 3 · 유료 2 = 288} × 바닥면적·용도지역 {둘 다 있음 · 둘 다 없음}.
 * 각 셀에서 세 가지 입구를 짝지어 «차단 여부 + 첫 문구»를 대조한다 — 「UI 통과 ↔ 400」 막다른 길과 「UI 차단 ↔ 200」 둘 다 0건이어야 한다.
 *   ⑧  : 폼 → `validateStep(2, form)`
 *   ⑫A : 폼 → ④ `buildPropertyTaxRequestBody`(요구된 칸만 실음) → Zod
 *   ⑫B : 직접 API — 6칸을 요구 여부와 무관하게 전부 실어 보낸 본문 → Zod (요구되지 않은 칸은 400이 아니라 무시)
 * 시각은 fake Date로 고정한다(화면 경로는 `targetDate`를 보내지 않아 과세기준일 = 지금 UTC 연도 6.1.).
 *
 * ⏱ 시간 제한: 연도별 셀 약 1.4만 개(7개 연도 합 약 10만) × 입구 3개 — 연도별 `it` 하나당 제한 120초(로컬 실측은 보고서에 기록). 느려지면 사실 칸 축을 줄이지 말고 연도별 분할을 유지한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { INITIAL_FORM, buildPropertyTaxRequestBody, validateStep, type FormState } from "@/components/calc/property/shared";
import { propertyTaxInputSchema } from "@/lib/validators/property-input";
import { addMonthsUtc } from "@/lib/tax-engine/civil-period";
import { format } from "@/lib/tax-engine/utc-date";
import { parseISO } from "@/lib/tax-engine/utc-date";

type Fact = "" | "yes" | "no" | "unknown";
const FACT4: Fact[] = ["", "yes", "no", "unknown"];
const FACT3: Fact[] = ["", "yes", "no"];
const FACT2: Fact[] = ["", "yes"];
const YEARS = [2015, 2016, 2018, 2019, 2023, 2024, 2026];
const KINDS_VALID = ["house", "building"] as const;

const DAY = 86_400_000;
/** 철거일 후보 — s 뒤 하루 · 당일 · 2개월 전 · 6/12/36개월 만료일 당일과 앞뒤 하루 */
function removals(s: Date): string[] {
  const out = new Set<string>([format(new Date(s.getTime() + DAY), "yyyy-MM-dd"), format(s, "yyyy-MM-dd"), format(addMonthsUtc(s, -2), "yyyy-MM-dd")]);
  for (const m of [6, 12, 36]) {
    const r = addMonthsUtc(s, -m);
    for (const k of [-1, 0, 1]) out.add(format(new Date(r.getTime() + k * DAY), "yyyy-MM-dd"));
  }
  return [...out];
}

interface Cell {
  kind: "" | "house" | "building";
  date: string;
  permit: Fact;
  otherUse: Fact;
  vacant: Fact;
  publicUse: Fact;
  paid: Fact;
  withArea: boolean;
}

function formOf(c: Cell): FormState {
  return {
    ...INITIAL_FORM,
    objectType: "land",
    landTaxType: "separate_aggregate",
    publishedPrice: "400,000,000",
    saLandArea: "400",
    saZoningDistrict: c.withArea ? "commercial" : "",
    saBuildingFloorArea: c.withArea ? "100" : "",
    saDemolished: true,
    saDemolishedDate: c.date,
    saDemolishedKind: c.kind,
    saDemolishedPermit: c.permit,
    saDemolishedOtherUse: c.otherUse,
    saDemolishedVacantHouse: c.vacant,
    saDemolishedPublicUse: c.publicUse,
    saDemolishedPublicUsePaid: c.paid,
    otherSeparateAggregateValue: "0",
    otherComprehensiveValue: "0",
  };
}

/** ⑫B — 직접 API: 요구 여부와 무관하게 6칸을 전부 실어 보낸다 */
function rawBodyOf(c: Cell): Record<string, unknown> {
  return {
    objectType: "land",
    landTaxType: "separate_aggregate",
    publishedPrice: 400_000_000,
    otherSeparateAggregateValue: 0,
    otherComprehensiveValue: 0,
    separateAggregateItem: {
      id: "parcel-1",
      jurisdictionCode: "000000",
      landArea: 400,
      officialLandPrice: 1_000_000,
      ...(c.withArea ? { zoningDistrict: "commercial", buildingFloorArea: 100 } : {}),
      demolished: true,
      demolishedDate: c.date,
      ...(c.kind ? { demolishedKind: c.kind } : {}),
      demolishedPermit: c.permit,
      demolishedOtherUse: c.otherUse,
      demolishedVacantHouse: c.vacant,
      demolishedPublicUse: c.publicUse,
      demolishedPublicUsePaid: c.paid,
    },
  };
}

/** Zod가 `separateAggregateItem` 아래에 낸 첫 문구(없으면 null) — 합산 칸 등 다른 경로의 결함은 이 격자의 관심사가 아니다 */
function zodFirstItemIssue(body: Record<string, unknown>): string | null {
  const r = propertyTaxInputSchema.safeParse(body);
  if (r.success) return null;
  return r.error.issues.find((i) => i.path[0] === "separateAggregateItem")?.message ?? null;
}

function* cells(s: Date): Generator<Cell> {
  const dates = removals(s);
  for (const date of dates) {
    for (const withArea of [true, false]) {
      // 종류 미선택 — 사실 칸은 의미가 없어 대표 둘(전부 빈칸 · 전부 yes)만
      for (const f of ["", "yes"] as Fact[]) {
        yield { kind: "", date, permit: f, otherUse: f, vacant: f, publicUse: f, paid: f, withArea };
      }
      for (const kind of KINDS_VALID) {
        for (const permit of FACT4) {
          for (const otherUse of FACT4) {
            for (const vacant of FACT3) {
              for (const publicUse of FACT3) {
                for (const paid of FACT2) {
                  yield { kind, date, permit, otherUse, vacant, publicUse, paid, withArea };
                }
              }
            }
          }
        }
      }
    }
  }
}

describe("PSA-E2 ⑧↔⑫ 철거 요건 패리티 격자 — 요구 ≡ 차단 ≡ 400 (같은 문구)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const year of YEARS) {
    it(
      `과세기준일 ${year}-06-01 — 전 셀 ⑧ = ⑫A(④ 본문) = ⑫B(직접 API 전칸) · 차단이면 문구 일치`,
      () => {
        vi.setSystemTime(new Date(`${year}-07-15T00:00:00Z`));
        const s = parseISO(`${year}-06-01`);
        const mismatches: string[] = [];
        let total = 0;
        let blocked = 0;
        let passed = 0;
        for (const c of cells(s)) {
          total++;
          const form = formOf(c);
          const ui = validateStep(2, form);
          const viaBody = zodFirstItemIssue(buildPropertyTaxRequestBody(form));
          const viaRaw = zodFirstItemIssue(rawBodyOf(c));
          if (ui === null) passed++;
          else blocked++;
          const same = ui === viaBody && ui === viaRaw;
          if (!same && mismatches.length < 5) mismatches.push(`${JSON.stringify(c)} ⑧=${ui} ⑫A=${viaBody} ⑫B=${viaRaw}`);
          else if (!same) mismatches.push("…");
        }
        expect(mismatches, mismatches.slice(0, 5).join("\n")).toEqual([]);
        // 비공허 — 격자가 두 방향을 모두 지난다
        expect(total).toBeGreaterThan(5_000);
        expect(blocked).toBeGreaterThan(0);
        expect(passed).toBeGreaterThan(0);
      },
      120_000,
    );
  }

  it("공장용지 ∧ 주택 모순 — ⑧·⑫A·⑫B가 같은 문구로 막고, 공장용지 ∧ 건축물은 통과", () => {
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    const base: Cell = { kind: "house", date: "2026-01-01", permit: "yes", otherUse: "no", vacant: "no", publicUse: "", paid: "", withArea: false };
    const f = { ...formOf(base), saIsFactory: true };
    const ui = validateStep(2, f);
    expect(ui).toContain("공장용지");
    expect(zodFirstItemIssue(buildPropertyTaxRequestBody(f))).toBe(ui);
    const rawItem = (rawBodyOf(base).separateAggregateItem ?? {}) as Record<string, unknown>;
    expect(zodFirstItemIssue({ ...rawBodyOf(base), separateAggregateItem: { ...rawItem, isFactory: true } })).toBe(ui);
    const b: Cell = { ...base, kind: "building", withArea: true };
    expect(validateStep(2, { ...formOf(b), saIsFactory: true })).toBeNull();
  });
});
