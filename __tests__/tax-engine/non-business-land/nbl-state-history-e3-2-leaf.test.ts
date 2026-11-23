/**
 * NBL-STATE-HISTORY-E3-② (E3c-1) — leaf 단위(`revenue-history.ts`): 영위 기간 → 일 단위 영위 구간 → 연도별 `computeRevenueTest` → 사업용 구간 · ⑧·⑫ 공용 issue leaf.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-2-business-period.engine.plan.md §3.6 · §7.2 Anchor 4·5
 * 표: `_helpers/nbl-state-history-e3-2-table.ts` — `biz`(손으로 쓴 독립 정답)와 leaf 출력(연도 판정 → 사업용 구간)을 대조한다.
 */
import { describe, it, expect } from "vitest";
import {
  closurePremise,
  deriveOperatingRange,
  evaluateRevenueHistory,
  operatingDaysInYear,
  operatingIntervalInYear,
  revenueHistoryInputIssue,
} from "@/lib/tax-engine/non-business-land/revenue-history";
import { computeRevenueTest } from "@/lib/tax-engine/non-business-land/revenue-test";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { consumesRevenueHistory } from "@/lib/tax-engine/non-business-land/land-category";
import { dayDate } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { E3C_ON_ROWS, E3C_ROWS, e3cRowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-2-table";
import type { RevenueTestInput } from "@/lib/tax-engine/non-business-land/revenue-test.types";

const d = dayDate;
const iso = (x: Date) => x.toISOString().slice(0, 10);
const ivs = (list: { start: Date; end: Date }[]) => list.map((iv) => [iso(iv.start), iso(iv.end)]);

describe("E3c-1 leaf — 영위 범위·일수: 초일산입(연환산) ↔ 반열린(구간)", () => {
  const acq = d("2014-01-01");
  const transfer = d("2024-06-30");

  it("개시일 없음 = 소유 시작부터(취득일 포함) · 폐업일 없음 = 양도일까지(양도일 포함)", () => {
    const r = deriveOperatingRange({}, acq, transfer)!;
    expect([iso(r.first), iso(r.last)]).toEqual(["2014-01-01", "2024-06-30"]);
  });

  it("개시일이 취득일보다 이르면 취득일로 자른다(소유 전은 영위일이 아니다) · 늦으면 개시일", () => {
    expect(iso(deriveOperatingRange({ businessStartDate: d("2010-01-01") }, acq, transfer)!.first)).toBe("2014-01-01");
    expect(iso(deriveOperatingRange({ businessStartDate: d("2022-12-01") }, acq, transfer)!.first)).toBe("2022-12-01");
  });

  it("폐업일 = 영업을 하지 않게 된 첫날 → 마지막 영위일은 그 전날 · 폐업일이 양도일 이후면 양도일로 자른다", () => {
    expect(iso(deriveOperatingRange({ businessEndDate: d("2021-06-01") }, acq, transfer)!.last)).toBe("2021-05-31");
    expect(iso(deriveOperatingRange({ businessEndDate: d("2030-01-01") }, acq, transfer)!.last)).toBe("2024-06-30");
  });

  it("영위일이 없는 입력(개시일이 양도일 이후 · 폐업일이 개시일 이전)은 undefined", () => {
    expect(deriveOperatingRange({ businessStartDate: d("2025-01-01") }, acq, transfer)).toBeUndefined();
    expect(deriveOperatingRange({ businessStartDate: d("2022-01-01"), businessEndDate: d("2022-01-01") }, acq, transfer)).toBeUndefined();
    expect(deriveOperatingRange({ businessStartDate: d("2022-01-01"), businessEndDate: d("2022-01-02") }, acq, transfer)).toBeDefined(); // 영위 1일
  });

  it("연도 영위일수(초일산입): 개시 2022-12-01 → 2022 = 31일 · 양도연도 2024 = 182일(양도일 포함 · 윤년) · 폐업 2021-06-01 → 2021 = 151일", () => {
    const m9 = deriveOperatingRange({ businessStartDate: d("2022-12-01") }, acq, transfer);
    expect([2021, 2022, 2023, 2024, 2025].map((y) => operatingDaysInYear(m9, y))).toEqual([0, 31, 365, 182, 0]);
    const m11 = deriveOperatingRange({ businessEndDate: d("2021-06-01") }, acq, transfer);
    expect([2013, 2014, 2020, 2021, 2022].map((y) => operatingDaysInYear(m11, y))).toEqual([0, 365, 366, 151, 0]);
    expect(operatingDaysInYear(undefined, 2024)).toBe(0);
  });

  it("연도 영위 구간(반열린): 2022 = [2022-12-01, 2023-01-01) · 양도연도 = [2024-01-01, 양도일+1) — 소유기간 창 자르기는 evaluate가 한다", () => {
    const r = deriveOperatingRange({ businessStartDate: d("2022-12-01") }, acq, transfer);
    expect(ivs([operatingIntervalInYear(r, 2022)!, operatingIntervalInYear(r, 2024)!])).toEqual([["2022-12-01", "2023-01-01"], ["2024-01-01", "2024-07-01"]]);
    expect(operatingIntervalInYear(r, 2021)).toBeUndefined();
  });
});

describe("E3c-1 leaf — 표 전 행: 연도 판정 → 사업용 구간 = 손으로 쓴 정답(`biz`)", () => {
  it.each(E3C_ON_ROWS.filter((r) => !r.buildingRemovedOn).map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const input = buildNblEngineInput(e3cRowRaw(r, true) as never)!;
    const ev = evaluateRevenueHistory(input.revenueHistory!, input.revenueTest!, input.acquisitionDate, input.transferDate);
    // 정답 구간은 취득일 다음 날부터(소유 첫날)로 쓰였다 — 반열린 끝은 양도일(양도일 제외)
    expect(ivs(ev.businessIntervals)).toEqual(r.biz.map(([a, b]) => [a, b]));
  });

  it("C11(건축물 이력 동반)은 leaf가 영업 구간만 낸다 — 건축물 구간은 합집합 단계(applyStateHistory)가 더한다", () => {
    const r = E3C_ROWS.find((x) => x.id === "C11")!;
    const input = buildNblEngineInput(e3cRowRaw(r, true) as never)!;
    const ev = evaluateRevenueHistory(input.revenueHistory!, input.revenueTest!, input.acquisitionDate, input.transferDate);
    expect(ivs(ev.businessIntervals)).toEqual([["2022-12-01", "2024-06-30"]]);
  });
});

describe("E3c-1 leaf — Anchor 4 연도 판정 일반화 parity: 양도연도 T·T−1 입력으로 부른 결과가 현행 `computeRevenueTest`와 **모든 필드 동일**", () => {
  const base: RevenueTestInput = {
    businessType: "parking_operation",
    currentRevenue: 2_600_000,
    currentLandValue: 100_000_000,
    currentBusinessDays: 182, // 2024-01-01 ~ 2024-06-30 초일산입
    currentTaxYear: 2024,
    priorRevenue: 5_000_000,
    priorLandValue: 100_000_000,
    priorBusinessDays: 365,
    priorTaxYear: 2023,
  };
  const run = (rt: RevenueTestInput, startDate?: string) =>
    evaluateRevenueHistory({ businessStartDate: startDate ? d(startDate) : undefined, rows: [] }, rt, d("2014-01-01"), d("2024-06-30"));

  it("T 입력: 개시 2023-01-01 이전(직전 전부 영위) — 2024 판정 결과 = `computeRevenueTest(rt)` 전 필드", () => {
    const ev = run(base, "2023-01-01");
    expect(ev.years.map((y) => y.taxYear)).toEqual([2023, 2024]);
    expect(ev.years[1].result).toEqual(computeRevenueTest(base));
  });

  it("간주임대료·공통수입 안분(§168의11③1·2호)이 있어도 T·T−1 판정이 현행과 같다 — 칸이 현행 필드로 그대로 간다", () => {
    const rich: RevenueTestInput = {
      ...base,
      currentDeposit: 500_000_000, currentRentDays: 100, currentDeemedRate: { num: 29, den: 1000 },
      priorDeposit: 300_000_000, priorRentDays: 365, priorDeemedRate: { num: 27, den: 1000 },
      commonRevenue: 4_000_000, otherLandValue: 300_000_000,
      priorCommonRevenue: 2_000_000, priorOtherLandValue: 200_000_000,
    };
    expect(run(rich, "2023-01-01").years[1].result).toEqual(computeRevenueTest(rich));
  });

  it("T−1 입력: 직전 칸이 «당해»로 한 칸 당겨 판정된다 — 2023 판정 = 같은 칸으로 현행 함수를 직접 부른 값(직전의 직전은 연도 행)", () => {
    const rows = [{ taxYear: 2022, revenue: 4_000_000, landValue: 90_000_000 }];
    const ev = evaluateRevenueHistory({ businessStartDate: d("2022-01-01"), rows }, base, d("2014-01-01"), d("2024-06-30"));
    const expected = computeRevenueTest({
      businessType: "parking_operation", currentRevenue: 5_000_000, currentLandValue: 100_000_000, currentBusinessDays: 365, currentTaxYear: 2023,
      priorRevenue: 4_000_000, priorLandValue: 90_000_000, priorBusinessDays: 365, priorTaxYear: 2022,
    });
    expect(ev.years.find((y) => y.taxYear === 2023)!.result).toEqual(expected);
  });

  it("직접 입력한 직전 영위일수(`priorBusinessDays`)는 ON에서 쓰지 않는다 — 날짜에서 파생한 영위일수가 덮는다(연환산 규약 단일 소스)", () => {
    const withBogus: RevenueTestInput = { ...base, priorBusinessDays: 10 };
    expect(run(withBogus, "2023-01-01").years[1].result!.annualizedPriorRevenue).toBe(5_000_000); // 365일 영위 → 환산 없음
  });

  it("영위하지 않은 해의 직전 칸은 읽지 않는다 — 개시 2024-01-01이면 2023 칸·값이 있어도 비율②에 섞이지 않는다", () => {
    const ev = run(base, "2024-01-01");
    expect(ev.years.map((y) => y.taxYear)).toEqual([2024]);
    expect(ev.years[0].result!.ratioCombined).toBeUndefined();
  });

  it("영위일이 없는 연도의 행은 읽지 않는다(폐업 후 남은 값) — 행이 있어도 판정 대상 연도가 아니다", () => {
    const rows = [{ taxYear: 2010, revenue: 9_999_999_999, landValue: 1 }, { taxYear: 2015, revenue: 5_000_000, landValue: 100_000_000 }];
    const ev = evaluateRevenueHistory({ businessStartDate: d("2015-01-01"), businessEndDate: d("2016-01-01"), rows }, base, d("2014-01-01"), d("2024-06-30"));
    expect(ev.years.map((y) => [y.taxYear, y.pass])).toEqual([[2015, true]]);
  });

  it("T−1 이후 연도 행은 읽지 않는다(엔진 방어 — ⑧·⑫가 막는 입력) — 직전 칸이 우선", () => {
    const rows = [{ taxYear: 2023, revenue: 1, landValue: 1 }, { taxYear: 2024, revenue: 1, landValue: 1 }];
    const ev = evaluateRevenueHistory({ businessStartDate: d("2023-01-01"), rows }, base, d("2014-01-01"), d("2024-06-30"));
    expect(ev.years[1].result).toEqual(computeRevenueTest(base));
  });
});

describe("E3c-1 leaf — V-7 전제 `closurePremise`: 기산일 이전 영위 통산 ≥ 기산일 − 2년 (경계 731 / 730 · 비율 통과와 무관)", () => {
  const acq = d("2014-01-01");
  const transfer = d("2024-09-30");
  const premise = (start: string, anchor: string) =>
    closurePremise(deriveOperatingRange({ businessStartDate: d(start), businessEndDate: d(anchor) }, acq, transfer), d("2014-01-02"), d(anchor));

  it("개시 2022-03-01 · 폐업 2024-03-01 = 731일(윤일 포함) ≥ 요구 731 → 충족 · 개시 2022-03-02 = 730일 → 미충족", () => {
    expect(premise("2022-03-01", "2024-03-01")).toEqual({ operatingDaysBefore: 731, requiredDays: 731, met: true });
    expect(premise("2022-03-02", "2024-03-01")).toEqual({ operatingDaysBefore: 730, requiredDays: 731, met: false });
  });

  it("윤일이 없는 2년(기산일 2023-03-01): 요구 730 — 개시 2021-03-01 = 730일 충족 · 2021-03-02 = 729일 미충족", () => {
    expect(premise("2021-03-01", "2023-03-01")).toMatchObject({ operatingDaysBefore: 730, requiredDays: 730, met: true });
    expect(premise("2021-03-02", "2023-03-01")).toMatchObject({ operatingDaysBefore: 729, requiredDays: 730, met: false });
  });

  it("영위 구간이 없으면 0일 · 기산일이 폐업일보다 앞서도(영업 중 일부 이전) 기산일 이전분만 센다", () => {
    expect(closurePremise(undefined, d("2014-01-02"), d("2020-01-01"))).toMatchObject({ operatingDaysBefore: 0, met: false });
    const r = deriveOperatingRange({ businessStartDate: d("2018-01-01") }, acq, transfer);
    expect(closurePremise(r, d("2014-01-02"), d("2020-01-01")).operatingDaysBefore).toBe(730);
  });
});

describe("E3c-1 leaf — Anchor 5: ⑧·⑫ 공용 issue leaf `revenueHistoryInputIssue` 격자 (같은 판정·같은 문구)", () => {
  const T = "2024-06-30";
  const issue = (raw: Parameters<typeof revenueHistoryInputIssue>[0]) => revenueHistoryInputIssue({ transferDate: T, ...raw });
  const row = (year: string, revenue?: string, landValue?: string) => ({ year, revenue, landValue });

  it("이상 없음: 폐업일 없음 · 행 없음 · 개시 < 폐업 < 양도 · 정상 행", () => {
    expect(issue({})).toBeNull();
    expect(issue({ startDate: "2020-01-01", endDate: "2021-06-01", rows: [row("2018", "5,000,000", "100,000,000"), row("2019", "0", "1")] })).toBeNull();
  });

  it.each([
    ["폐업일 해석 불가", { endDate: "내일" }, "nblRevenueBusinessEndDate", undefined, "읽을 수 없습니다"],
    ["폐업일 = 개시일", { startDate: "2021-06-01", endDate: "2021-06-01" }, "nblRevenueBusinessEndDate", undefined, "개시일보다 뒤여야"],
    ["폐업일 < 개시일", { startDate: "2021-06-01", endDate: "2021-05-31" }, "nblRevenueBusinessEndDate", undefined, "개시일보다 뒤여야"],
    ["폐업일 = 양도일", { endDate: T }, "nblRevenueBusinessEndDate", undefined, "양도일(2024-06-30) 당일 또는 그 이후"],
    ["폐업일 > 양도일", { endDate: "2025-01-01" }, "nblRevenueBusinessEndDate", undefined, "양도일(2024-06-30) 당일 또는 그 이후"],
    ["연도 형식(2자리)", { rows: [row("22")] }, "nblRevenueYearRows", "year", "4자리 연도"],
    ["연도 빈 칸", { rows: [row("")] }, "nblRevenueYearRows", "year", "4자리 연도"],
    ["연도 중복", { rows: [row("2020"), row("2020")] }, "nblRevenueYearRows", "year", "앞 행과 같습니다"],
    ["직전(T−1) 연도", { rows: [row("2023")] }, "nblRevenueYearRows", "year", "「당해 과세기간」·「직전 과세기간」 칸"],
    ["양도연도(T)", { rows: [row("2024")] }, "nblRevenueYearRows", "year", "「당해 과세기간」·「직전 과세기간」 칸"],
    ["수입금액 음수", { rows: [row("2020", "-1", "1")] }, "nblRevenueYearRows", "revenue", "수입금액(-1)"],
    ["수입금액 문자", { rows: [row("2020", "일억", "1")] }, "nblRevenueYearRows", "revenue", "수입금액(일억)"],
    ["토지가액 소수", { rows: [row("2020", "1", "1.5")] }, "nblRevenueYearRows", "landValue", "토지가액(1.5)"],
  ] as const)("%s → 400 대상", (_name, raw, field, part, text) => {
    const i = issue(raw as never)!;
    expect(i.field).toBe(field);
    expect(i.part).toBe(part);
    expect(i.message).toContain(text);
  });

  it("행 인덱스: 두 번째 행의 결함은 index 1 · 문구는 «2번째 행» — 앞 행의 이상 없는 값은 건너뛴다", () => {
    const i = issue({ rows: [row("2018", "1", "1"), row("2019", "x", "1")] })!;
    expect([i.index, i.part]).toEqual([1, "revenue"]);
    expect(i.message).toContain("과세기간별 수입금액 2번째 행");
  });

  it("«모름»은 막지 않는다 — 빈 금액·금액 칸 생략 · 연도 행 누락", () => {
    expect(issue({ rows: [row("2018", "", ""), row("2019"), row("2020", undefined, "100")] })).toBeNull();
  });

  it("양도일을 읽을 수 없으면 연도 상한 규칙은 건너뛴다(다른 검증이 맡는다) · 폐업일 규칙도 양도일 비교를 건너뛴다", () => {
    expect(revenueHistoryInputIssue({ transferDate: "", rows: [row("2030")] })).toBeNull();
    expect(revenueHistoryInputIssue({ transferDate: "", endDate: "2030-01-01" })).toBeNull();
  });

  it("하한(개시일·폐업일이 소유 시작 전)은 leaf에 없다 — 축 B 늦은 지분이 400이 되지 않게(엔진은 소유기간으로 자른다)", () => {
    expect(issue({ startDate: "1990-01-01", endDate: "1995-01-01" })).toBeNull();
  });
});

describe("E3c-1 소비 술어 `consumesRevenueHistory` — ④⑤⑧⑭가 같은 표를 쓴다: 수입금액비율 경로는 기타토지(잡종지·나대지 포함)만", () => {
  it.each([
    ["other_land", true], ["vacant_lot", true], ["miscellaneous", true],
    ["farmland", false], ["paddy", false], ["field", false], ["orchard", false], ["forest", false], ["pasture", false],
    ["housing_site", false], ["villa_land", false], ["building_site", false], ["", false],
  ] as const)("%s → %s", (landType, expected) => {
    expect(consumesRevenueHistory(landType as never)).toBe(expected);
  });

  it("⑭: 기타토지가 아니면 토글이 켜져 있어도 영위 기간 입력을 만들지 않는다 — 지목을 바꿔 남은 stale 값이 닿지 않게", () => {
    const r = E3C_ROWS.find((x) => x.id === "M9p")!;
    for (const landType of ["farmland", "forest", "pasture", "housing_site", "villa_land"]) {
      const input = buildNblEngineInput({ ...e3cRowRaw(r, true), nblLandType: landType } as never);
      expect(input === undefined || input.revenueHistory === undefined, landType).toBe(true);
    }
    expect(buildNblEngineInput(e3cRowRaw(r, true) as never)!.revenueHistory).toBeDefined();
  });
});
