/**
 * NBL-STATE-HISTORY-E3-② (E3c-1) — 엔진 단위 anchor: 영위 기간 ON raw(`nblRevenuePeriodOn`·`nblRevenueBusinessEndDate`·`nblRevenueYearRows`) → ⑭ 매퍼 → 판정 → 세액.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-2-business-period.engine.plan.md §3.6 · §5 · §7.2 · «결정 기록 (2026-11-23 사용자)»
 * 표: `_helpers/nbl-state-history-e3-2-table.ts` — E3c-0 Anchor 1·2와 같은 표. 오라클과 다르면 표를 맞추지 말고 원인을 먼저 본다.
 *
 * mutation 대응: X-1(역년 전체) · X-2(DM-01 비대체) · X-3(행 누락 = 통과) · X-4(직전 행 없이 ②) · X-5(초일산입 제거) · X-6(폐업일을 영업일로) · X-7(총일수 365 고정) · X-11(`changed` 가드 = ON 가드 제거) ·
 *   X-12(`trace.own`에 전 기간) · X-15(양도일 의제에서도 새 분기) · X-16(도소매 시장 불충족 우회).
 */
import { describe, it, expect } from "vitest";
import { E3C_ON_ROWS, E3C_ROWS, E3C_SWING_2014, e3cExpectedTax, e3cRowRaw, type E3cRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-2-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { NBL } from "@/lib/tax-engine/legal-codes";
import { NBL_REVENUE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_DEEMED_TRANSFER_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

const row = (id: string) => E3C_ROWS.find((r) => r.id === id)!;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
const taxOf = (input: NonBusinessLandInput) =>
  calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;
const NOTICE = {
  rowUnknown: NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE,
  grace10Premise: NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE,
  pastYears: NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE,
  closureGrace: NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE,
} as const;
const onRaw = (r: E3cRow, over: Record<string, unknown> = {}) => ({ ...e3cRowRaw(r, true), ...over });
const days = (iv: { start: Date; end: Date }) => Math.round((iv.end.getTime() - iv.start.getTime()) / 86_400_000);

describe("E3c-1 — 케이스 표(영위 기간 ON): 입력 → 판정·일수·세액 = 오라클", () => {
  it.each(E3C_ON_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const input = fromRaw(onRaw(r));
    expect(input.revenueHistory, "⑭가 영위 기간을 엔진 입력으로 변환한다").toBeDefined();
    const j = judge(input);
    expect(j.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(j.totalOwnershipDays).toBe(r.expect.total);
    expect(j.effectiveBusinessDays).toBe(r.expect.eff);
    const expectedTax = e3cExpectedTax(r);
    if (expectedTax !== undefined) expect(taxOf(input)).toBe(expectedTax);
    // 새 고지 — 표가 말한 것만, 정확히 한 번
    const expectedNotices = new Set(r.notices ?? []);
    for (const [kind, text] of Object.entries(NOTICE)) {
      expect(j.warnings.filter((w) => w === text), `${r.id} ${kind}`).toHaveLength(expectedNotices.has(kind as keyof typeof NOTICE) ? 1 : 0);
    }
    expect(j.warnings.filter((w) => w === NBL_REVENUE_HISTORY_APPLIED_NOTICE), `${r.id} 적용 고지`).toHaveLength(1);
  });

  it("echo(`periodEvaluation.revenueHistory`): 영위 구간·연도별 판정·사업용 구간이 표의 오라클과 일치 — M9p", () => {
    const j = judge(fromRaw(onRaw(row("M9p"))));
    const rh = j.periodEvaluation!.revenueHistory!;
    expect(rh.operatingDays).toBe(577);
    expect(days(rh.operatingInterval!)).toBe(577);
    expect(rh.years.map((y) => [y.taxYear, y.operatingDays, y.yearDays, y.source, y.known, y.pass, y.businessDays])).toEqual([
      [2022, 31, 365, "row", true, true, 31],
      [2023, 365, 365, "prior", true, true, 365],
      [2024, 182, 366, "current", true, true, 181],
    ]);
    expect(rh.businessDays).toBe(577);
    expect(rh.businessIntervals.map(days)).toEqual([577]);
    expect(rh.unknownYears).toEqual([]);
    expect(rh.meets).toBe(false);
    // 비사업용 결론은 이 경로의 기간 수치가 결과다 → `usage_periods`(전 기간 사업용으로 채운 표시값이 아니다)
    expect(j.periodEvaluation!.basis).toBe("usage_periods");
  });

  it("연환산: 2022(영위 31일 — 600,000 ×365/31 = 7,064,516)·2024(영위 182일 — 양도일 포함 · 2,600,000 ×366/182 = 5,228,571) — 연도 판정이 현행 `computeRevenueTest` 값 그대로", () => {
    const rh = judge(fromRaw(onRaw(row("M9p")))).periodEvaluation!.revenueHistory!;
    expect(rh.years[0].annualizedRevenue).toBe(7_064_516);
    expect(rh.years[2].annualizedRevenue).toBe(5_228_571);
    expect(rh.years.map((y) => y.threshold)).toEqual([0.03, 0.03, 0.03]);
  });

  it("스윙(오라클 대비): M9p 현행 B → ON N(+55,750,000) · M11p 현행 N → ON B(−55,750,000) · C10b 현행 B → ON N(+55,750,000)", () => {
    const delta = (id: string) => taxOf(fromRaw(onRaw(row(id)))) - taxOf(fromRaw(e3cRowRaw(row(id), false)));
    expect(delta("M9p")).toBe(E3C_SWING_2014);
    expect(delta("M11p")).toBe(-E3C_SWING_2014);
    expect(delta("C10b")).toBe(E3C_SWING_2014);
    expect(delta("M10p")).toBe(0);
  });
});

describe("E3c-1 — 모름·누락: 행 누락 = 그 연도 불통과 + 확인 필요(차단 없음) · 직전 행 없이는 비율②를 계산하지 않는다", () => {
  it("C10b 2022 행 누락: 2022 `known:false` · 2023은 ①2% 미달 + ②불가 → 불통과 · 2024만 통과 181일", () => {
    const rh = judge(fromRaw(onRaw(row("C10b")))).periodEvaluation!.revenueHistory!;
    expect(rh.years.map((y) => [y.taxYear, y.known, y.pass])).toEqual([[2022, false, false], [2023, true, false], [2024, true, true]]);
    expect(rh.unknownYears).toEqual([2022]);
    expect(rh.years[1].ratioCombined).toBeUndefined(); // 직전(2022) 행이 없어 ② 없음 — 0으로 채우지 않는다
    expect(rh.years[1].ratioCurrent).toBe(0.02);
  });

  it("C10c(토지가액만 빈 행)도 같은 «모름» — 수입금액만 입력해도 비율을 계산하지 않는다", () => {
    const rh = judge(fromRaw(onRaw(row("C10c")))).periodEvaluation!.revenueHistory!;
    expect(rh.years[0]).toMatchObject({ taxYear: 2022, known: false, pass: false });
    expect(rh.unknownYears).toEqual([2022]);
  });

  it("C12b: 개시일 칸 비움 + 연도 행 없음 — 2014~2022 9개 연도가 모두 모름(소유 시작부터 영위로 읽힘) · 2023·2024만 통과 546일 → 비사업용 + 확인 필요", () => {
    const j = judge(fromRaw(onRaw(row("C12b"))));
    const rh = j.periodEvaluation!.revenueHistory!;
    expect(rh.unknownYears).toEqual([2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022]);
    expect(rh.businessDays).toBe(546);
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.warnings).toContain(NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE);
  });

  it("OFF의 같은 입력(C12 — 개시일 없음 · 직전 통과)은 현행대로 전 기간 사업용 B — ON으로 켤 때만 과거 연도를 묻는다(바이트 동일 계약)", () => {
    const off = judge(fromRaw(e3cRowRaw(row("C12b"), false)));
    expect([off.isNonBusinessLand, off.effectiveBusinessDays]).toEqual([false, 3832]);
    expect(JSON.stringify(off)).not.toContain("revenueHistory");
  });

  it("행에 수입 0은 «모름»이 아니다 — 0원은 입력이다(비율 0으로 불통과, `known:true`)", () => {
    const r = row("C10a");
    const raw = onRaw(r);
    (raw.nblRevenueYearRows as { year: string; revenue: string; landValue: string }[])[0].revenue = "0";
    const rh = judge(fromRaw(raw)).periodEvaluation!.revenueHistory!;
    expect(rh.years[0]).toMatchObject({ taxYear: 2022, known: true, pass: false, ratioCurrent: 0 });
    expect(rh.unknownYears).toEqual([]);
  });
});

describe("E3c-1 — 영위 일수 규약: 초일산입 연환산 일수 ↔ 반열린 사업용 구간 (X-5·X-6·X-7)", () => {
  it("폐업일은 영업하지 않은 날 — M11p 2021 영위 151일(1/1~5/31) · 사업용 구간 끝 = 폐업일(2021-06-01, 제외)", () => {
    const rh = judge(fromRaw(onRaw(row("M11p")))).periodEvaluation!.revenueHistory!;
    const y2021 = rh.years.find((y) => y.taxYear === 2021)!;
    expect([y2021.operatingDays, y2021.businessDays, y2021.annualizedRevenue]).toEqual([151, 151, 4_834_437]);
    expect(rh.operatingInterval!.end.toISOString().slice(0, 10)).toBe("2021-06-01");
    expect(rh.years.map((y) => y.taxYear)).toEqual([2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021]); // 폐업 후 2022~2024는 영위일이 없어 판정하지 않는다
  });

  it("양도일은 영위일(연환산) · 사업용 구간 끝은 양도일(제외) — A-2515069 영위 306일(3/1~12/31) · 구간 305일", () => {
    const rh = judge(fromRaw(onRaw(row("A-2515069")))).periodEvaluation!.revenueHistory!;
    expect([rh.years[0].operatingDays, rh.years[0].businessDays]).toEqual([306, 305]);
  });

  it("윤년 총일수 366(양도연도 2024)·직전 365: L-1000000 영위 122일 → 총일수 366 환산", () => {
    const rh = judge(fromRaw(onRaw(row("L-1000000")))).periodEvaluation!.revenueHistory!;
    expect([rh.years[0].yearDays, rh.years[0].annualizedRevenue]).toEqual([366, 3_000_000]);
  });

  it("취득일이 연도 중간이면 그 해 영위일은 취득일부터 — 개시일 칸이 비어 있어도 소유 시작 전은 영위일이 아니다", () => {
    const r = row("B-3.0M"); // 취득 2022-12-31 · 개시 2023-01-01 — 개시일을 비우면 첫날 = 취득일(2022-12-31)
    const raw = onRaw(r, { nblRevenueCurrentBusinessStartDate: "", nblRevenuePriorRevenue: "5000", nblRevenuePriorLandValue: "100000000" });
    const rh = judge(fromRaw(raw)).periodEvaluation!.revenueHistory!;
    expect(rh.years[0]).toMatchObject({ taxYear: 2022, operatingDays: 1, source: "prior" }); // 2022-12-31 하루 — 양도연도(2023)의 직전 과세기간이라 기존 직전 칸이 말한다
  });
});

describe("E3c-1 — Q-2 (가): 통과 과세기간 ∩ 영위일 — 개시 전·폐업 후는 사업용이 아니다 (X-1)", () => {
  it("M9p: 개시 2022-12-01 — 2022 전체(역년)가 아니라 31일만 사업용(역년 전체면 911일 → 사업용으로 뒤집힌다)", () => {
    const rh = judge(fromRaw(onRaw(row("M9p")))).periodEvaluation!.revenueHistory!;
    expect(rh.businessDays).toBe(577);
    expect(rh.businessDays).not.toBe(911);
  });

  it("M11p: 폐업 2021-06-01 — 2021 역년 전체(365일)가 아니라 151일만 · 폐업 후 2022~는 사업용이 아니다", () => {
    const rh = judge(fromRaw(onRaw(row("M11p")))).periodEvaluation!.revenueHistory!;
    expect(rh.businessDays).toBe(2707);
  });
});

describe("E3c-1 — OFF 하위호환 (X-11 ON 가드): 영위 기간 칸이 없으면 현행과 바이트 동일 — 판정 객체에 echo·E3-② 고지가 없다", () => {
  it.each(E3C_ROWS.map((r) => [r.id, r] as const))("%s OFF — 키 부재 · 고지 부재 · 현행 값", (_id, r) => {
    const input = fromRaw(e3cRowRaw(r, false));
    expect(Object.keys(input)).not.toContain("revenueHistory");
    const j = judge(input);
    expect(j.isNonBusinessLand).toBe(r.current.nonBusiness);
    expect(JSON.stringify(j)).not.toContain("revenueHistory");
    for (const text of [NBL_REVENUE_HISTORY_APPLIED_NOTICE, ...Object.values(NOTICE)]) expect(j.warnings).not.toContain(text);
  });

  it("토글이 꺼져 있으면(`nblRevenuePeriodOn: false`) 폐업일·연도 행이 실려 와도 엔진에 닿지 않는다 — stale 값이 판정을 바꾸지 않는다", () => {
    const r = row("M11p");
    const raw = { ...e3cRowRaw(r, true), nblRevenuePeriodOn: false };
    const input = fromRaw(raw);
    expect(Object.keys(input)).not.toContain("revenueHistory");
    expect(judge(input).isNonBusinessLand).toBe(r.current.nonBusiness);
  });

  it("업종이 없으면(`none`·빈) 토글이 켜져 있어도 엔진 입력에 영위 기간이 없다", () => {
    for (const bt of ["", "none"]) expect(Object.keys(fromRaw(onRaw(row("M9p"), { nblRevenueBusinessType: bt })))).not.toContain("revenueHistory");
  });
});

describe("E3c-1 — DM-01 대체 (결정 ⑤ · X-2): ON이면 당해 사업개시일 판정(DM-01) 대신 연도 판정을 쓴다 — 현행 DM-01 고지·echo가 나오지 않는다", () => {
  it("M10p OFF(현행 DM-01): `businessStartJudged` echo + «사업개시일 이후» 고지 · ON: echo·고지 없음(연도 표가 대신 말한다) — 같은 N(일치 행)", () => {
    const off = judge(fromRaw(e3cRowRaw(row("M10p"), false)));
    expect(off.revenueTestDetail?.businessStartJudged).toBeDefined();
    expect(off.warnings).toContain(NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE);
    const on = judge(fromRaw(onRaw(row("M10p"))));
    expect(on.revenueTestDetail?.businessStartJudged).toBeUndefined();
    expect(on.warnings).not.toContain(NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE);
    expect(on.isNonBusinessLand).toBe(off.isNonBusinessLand);
  });

  it("M9p: 현행 DM-01은 직전 ②가 통과라 «개시일 무시 → 전 기간» B — ON은 개시일을 판정에 쓴다 N", () => {
    expect(judge(fromRaw(e3cRowRaw(row("M9p"), false))).isNonBusinessLand).toBe(false);
    expect(judge(fromRaw(onRaw(row("M9p")))).isNonBusinessLand).toBe(true);
  });
});

describe("E3c-1 — Q-15 (가′) 교차 (X-12): 건축물 이력 × 업종 영위 구간은 합집합 — 중복 계상 없음", () => {
  it("C11: 건축물(별도합산) 철거 2016-01-01 + 영업 2022-12-01~ → 729 + 577 = 1,306일 · basis state_history · 현행(영업 전 기간)과 다르다", () => {
    const j = judge(fromRaw(onRaw(row("C11"))));
    expect(j.periodEvaluation!.basis).toBe("state_history");
    expect(j.effectiveBusinessDays).toBe(1306);
    expect(j.periodEvaluation!.revenueHistory!.businessDays).toBe(577); // 건축물 구간(729)은 echo.businessIntervals에 섞이지 않는다
    expect(j.warnings).toContain(NBL_REVENUE_HISTORY_APPLIED_NOTICE);
    expect(j.warnings).toContain(NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE);
  });

  it("겹침: 건축물 구간이 영업 구간과 겹치면 중복 없이 합집합 — 철거 2023-01-01(건축물 [OS, 2023-01-01) = 3,287일) + 영업 2022-12-01~ → 3,287 + (2023-01-01 이후 영업 546) = 3,833이 아니라 합집합 3,832", () => {
    const r: E3cRow = { ...row("C11"), buildingRemovedOn: "2023-01-01", biz: [] };
    const j = judge(fromRaw(onRaw(r)));
    expect(j.totalOwnershipDays).toBe(3832);
    expect(j.effectiveBusinessDays).toBe(3832);
    expect(j.isNonBusinessLand).toBe(false);
  });
});

describe("E3c-1 — 적용 제외: 양도일 의제(X-15)·도소매 시장 불충족(X-16)", () => {
  it("양도일 의제 사유가 선택돼 있으면 영위 기간을 쓰지 않는다(현행 판정) + 이유 고지 — M9p는 현행 B", () => {
    const raw = onRaw(row("M9p"), { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2024-03-01" });
    const input = fromRaw(raw);
    const j = judge(input);
    expect(j.periodEvaluation?.revenueHistory).toBeUndefined();
    expect(j.warnings).toContain(NBL_REVENUE_HISTORY_DEEMED_TRANSFER_NOTICE);
    expect(j.warnings).not.toContain(NBL_REVENUE_HISTORY_APPLIED_NOTICE);
    const off = judge(fromRaw({ ...e3cRowRaw(row("M9p"), false), nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2024-03-01" }));
    expect(j.isNonBusinessLand).toBe(off.isNonBusinessLand);
    expect(j.effectiveBusinessDays).toBe(off.effectiveBusinessDays);
  });

  it("12호 도소매업 — 농·수·축산물이 시장 요건을 못 채우면 연도 판정이 통과여도 사업용 구간이 없다(이력이 우회하지 않는다)", () => {
    const rich = { 2022: ["15000000", "100000000"], 2023: ["15000000", "100000000"], 2024: ["15000000", "100000000"] } as const;
    const wholesale = (item: string, inMarket: boolean) =>
      onRaw(row("C10a"), {
        nblRevenueBusinessType: "wholesale_retail",
        nblRevenueWholesaleItem: item,
        nblRevenueWholesaleInMarket: inMarket,
        nblRevenueCurrentRevenue: rich[2024][0],
        nblRevenuePriorRevenue: rich[2023][0],
        nblRevenueYearRows: [{ year: "2022", revenue: rich[2022][0], landValue: rich[2022][1] }],
      });
    const control = judge(fromRaw(wholesale("block", false)));
    expect(control.isNonBusinessLand).toBe(false); // 블록 도소매업 — 시장 요건 없음 · 기준 10% 통과
    expect(control.periodEvaluation!.revenueHistory!.businessDays).toBe(911);
    const blocked = judge(fromRaw(wholesale("agricultural_product", false)));
    expect(blocked.isNonBusinessLand).toBe(true);
    expect(blocked.periodEvaluation!.revenueHistory!.businessIntervals).toEqual([]);
    expect(blocked.periodEvaluation!.revenueHistory!.years.every((y) => y.pass && y.businessDays === 0)).toBe(true); // 비율은 통과 — 품목·시장 요건이 경로를 막는다
    const inMarket = judge(fromRaw(wholesale("agricultural_product", true)));
    expect(inMarket.isNonBusinessLand).toBe(false);
  });
});

describe("E3c-1 — 유예와의 결합: 영위 구간 ∪ 유예(합집합) · 사업용 구간이 없으면 종전처럼 유예 단독 재판정", () => {
  const useProhibited = { reasonCode: "use_prohibited", anchorDate: "2014-01-02", endDate: "2024-06-30" } as const; // 소유 전 기간 법령상 사용 제한 — 유예 단독으로 기간기준 충족

  it("사업용 구간이 없어도(영위 연도 전부 불통과) 유예 단독으로 기간기준을 채우면 OFF와 같이 사업용으로 돌아간다 — 영위 기간 ON이 유예 구제를 막지 않는다(`failedR` 없음)", () => {
    const r: E3cRow = { ...row("C10a"), years: { 2022: [0, 100_000_000], 2023: [0, 100_000_000], 2024: [0, 100_000_000] }, grace: [useProhibited], notices: [] };
    const on = judge(fromRaw(onRaw(r)));
    const off = judge(fromRaw(e3cRowRaw(r, false)));
    expect(on.periodEvaluation!.revenueHistory!.businessIntervals).toEqual([]);
    expect([on.isNonBusinessLand, on.periodEvaluation!.graceJudged?.meets]).toEqual([false, true]);
    expect([on.isNonBusinessLand, on.effectiveBusinessDays]).toEqual([off.isNonBusinessLand, off.effectiveBusinessDays]);
  });

  it("영위 구간으로는 모자라지만 유예와 합집합이면 충족 — C4b(10호) 외 다른 사유(법령상 사용 제한 2년)도 같은 합집합: 폐업 2019-01-01 + 사용 제한 [2019-01-01, 2021-01-01) = 2,556", () => {
    const r: E3cRow = { ...row("C4a"), grace: [{ reasonCode: "use_prohibited", anchorDate: "2019-01-01", endDate: "2021-01-01" }] };
    const j = judge(fromRaw(onRaw(r)));
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.gracePeriodDays]).toEqual([false, 2556, 731]);
    expect(j.appliedLawArticles).toContain(NBL.UNAVOIDABLE_PERIOD);
  });

  it("영위 구간과 겹치는 유예는 이중 계상하지 않는다(합집합) — 영위 중(개시 2022-12-01 계속)에 걸친 유예 [2023-01-01, 2024-01-01)는 가산 0", () => {
    const j = judge(fromRaw(onRaw({ ...row("M9p"), grace: [{ reasonCode: "use_prohibited", anchorDate: "2023-01-01", endDate: "2024-01-01" }] })));
    expect([j.effectiveBusinessDays, j.gracePeriodDays]).toEqual([577, 0]);
  });
});

describe("E3c-1 — 방어: 입력이 모순돼도 엔진이 조용히 틀리지 않는다", () => {
  it("개시일이 양도일 이후(⑧·⑫가 먼저 막는 입력)이면 영위일이 없다 — 사업용 구간 0 · 던지지 않는다", () => {
    const j = judge(fromRaw(onRaw(row("M9p"), { nblRevenueCurrentBusinessStartDate: "2025-01-01" })));
    const rh = j.periodEvaluation!.revenueHistory!;
    expect([rh.operatingInterval, rh.operatingDays, rh.years, rh.businessIntervals]).toEqual([null, 0, [], []]);
    expect(j.isNonBusinessLand).toBe(true);
  });

  it("T−1 이후 행(⑧·⑫가 막는 입력)은 읽지 않는다 — 직전 칸이 우선(행이 직전 칸을 덮어쓰지 못한다)", () => {
    const base = judge(fromRaw(onRaw(row("M9p"))));
    const stray = judge(fromRaw(onRaw(row("M9p"), { nblRevenueYearRows: [...(onRaw(row("M9p")).nblRevenueYearRows as object[]), { year: "2023", revenue: "1", landValue: "1" }, { year: "2024", revenue: "1", landValue: "1" }] })));
    expect(stray.periodEvaluation!.revenueHistory).toEqual(base.periodEvaluation!.revenueHistory);
  });

  it("토지가액 0인 행·수입 미입력 행은 «모름»이다(0원 수입은 입력) — 토지가액 0으로 비율이 계산되지 않는다", () => {
    const rh = judge(fromRaw(onRaw(row("C10a"), { nblRevenueYearRows: [{ year: "2022", revenue: "5000000", landValue: "0" }] }))).periodEvaluation!.revenueHistory!;
    expect(rh.years[0]).toMatchObject({ taxYear: 2022, known: false, pass: false });
    const noRev = judge(fromRaw(onRaw(row("C10a"), { nblRevenueYearRows: [{ year: "2022", revenue: "", landValue: "100000000" }] }))).periodEvaluation!.revenueHistory!;
    expect(noRev.years[0]).toMatchObject({ known: false });
  });

  it("양도연도 당해 칸(토지가액)이 비면 그 해는 «모름» — 현행 매퍼가 0으로 채운 값을 비율 0으로 읽지 않는다", () => {
    const rh = judge(fromRaw(onRaw(row("C10a"), { nblRevenueCurrentLandValue: "" }))).periodEvaluation!.revenueHistory!;
    expect(rh.years.find((y) => y.taxYear === 2024)).toMatchObject({ known: false, pass: false });
    expect(rh.unknownYears).toContain(2024);
  });
});


describe("E3c-2 — V-7: 규칙 §83의5①10호 «2년 이상 사업에 사용한 토지» 전제 — 영위 통산 일수가 기산일 − 2년 미만이면 그 10호 유예만 제외 + 고지 (X-8·X-9·X-10)", () => {
  const closing = (over: Partial<E3cRow> = {}): E3cRow => ({ ...row("V7b"), ...over });
  const useProhibited = { reasonCode: "use_prohibited", anchorDate: "2023-03-01", endDate: "2024-06-30" } as const; // 10호와 같은 487일을 덮는 다른 사유

  it("V7b: 영위 181일 < 730 → 10호 유예 제외(유예 가산 0 · 181/729 비사업용 · 세액 +69,750,000 — 현행 B 257,010,000 → N 326,760,000) · echo `excludedGrace10` · 고지 1건", () => {
    const input = fromRaw(onRaw(row("V7b")));
    expect(input.gracePeriods).toHaveLength(1); // ⑭는 입력 그대로 — 제외는 판정 진입 전 정리(`prepareRevenueHistory`)가 한다
    const j = judge(input);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.gracePeriodDays]).toEqual([true, 181, 0]);
    expect(j.periodEvaluation!.revenueHistory!.excludedGrace10).toEqual([{ anchorDate: new Date("2023-03-01T00:00:00Z"), operatingDaysBefore: 181, requiredDays: 730 }]);
    expect(j.warnings.filter((w) => w === NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE)).toHaveLength(1);
    expect(taxOf(input)).toBe(326_760_000);
    expect(taxOf(fromRaw(e3cRowRaw(row("V7b"), false)))).toBe(257_010_000); // OFF(현행) — 전제를 검사하지 않는다
  });

  it("경계(X-9): 영위 731일(개시 2022-03-01 · 폐업·기산 2024-03-01) 충족 → 유예 유지(echo 없음·고지 없음) · 730일(개시 2022-03-02) 미충족 → 제외", () => {
    const met = judge(fromRaw(onRaw(row("V7c"))));
    expect(met.periodEvaluation!.revenueHistory!.excludedGrace10).toBeUndefined();
    expect(met.warnings).not.toContain(NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE);
    expect(met.gracePeriodDays).toBe(213); // [2024-03-01, 양도일) — 유예 2년은 양도일까지만
    const unmet = judge(fromRaw(onRaw(row("V7d"))));
    expect(unmet.periodEvaluation!.revenueHistory!.excludedGrace10).toEqual([{ anchorDate: new Date("2024-03-01T00:00:00Z"), operatingDaysBefore: 730, requiredDays: 731 }]);
    expect(unmet.gracePeriodDays).toBe(0);
  });

  it("비율 통과와 무관(X-8): 연도 비율이 전부 미달이어도 영위 통산 2년 이상이면 10호 유예를 유지한다 — «사업에 사용한» 사실이지 다목 인정 여부가 아니다", () => {
    const j = judge(fromRaw(onRaw(closing({ acq: "2021-01-01", transfer: "2024-09-30", start: "2022-03-01", end: "2024-03-01", years: { 2022: [0, 100_000_000], 2023: [0, 100_000_000], 2024: [0, 100_000_000] }, grace: [{ reasonCode: "business_closure_relocation", anchorDate: "2024-03-01" }] }))));
    expect(j.periodEvaluation!.revenueHistory!.businessIntervals).toEqual([]);
    expect(j.periodEvaluation!.revenueHistory!.excludedGrace10).toBeUndefined();
    expect(j.gracePeriodDays).toBe(213);
  });

  it("10호만 제외(X-10): 같은 입력에 다른 사유(법령상 사용 제한) 유예가 있으면 그것은 그대로 — 영위 181 ∪ 사용 제한 487 = 668/729 사업용", () => {
    const j = judge(fromRaw(onRaw(closing({ grace: [{ reasonCode: "business_closure_relocation", anchorDate: "2023-03-01" }, useProhibited] }))));
    expect(j.periodEvaluation!.revenueHistory!.excludedGrace10).toHaveLength(1);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.gracePeriodDays]).toEqual([false, 668, 487]);
  });

  it("10호 행이 둘이면 행마다 검사한다 — 기산일 이전 영위 통산이 충분한 행은 유지 · 모자란 행만 제외", () => {
    const r = closing({ acq: "2014-01-01", transfer: "2024-06-30", start: "2020-01-01", end: "2023-03-01",
      years: { 2020: [5_000_000, 100_000_000], 2021: [5_000_000, 100_000_000], 2022: [5_000_000, 100_000_000], 2023: [700_000, 100_000_000], 2024: [0, 100_000_000] },
      grace: [{ reasonCode: "business_closure_relocation", anchorDate: "2023-03-01" }, { reasonCode: "business_closure_relocation", anchorDate: "2020-06-01" }] });
    const ex = judge(fromRaw(onRaw(r))).periodEvaluation!.revenueHistory!.excludedGrace10!;
    expect(ex.map((e) => e.anchorDate.toISOString().slice(0, 10))).toEqual(["2020-06-01"]); // 2020-06-01 이전 영위 152일 < 730 · 2023-03-01 이전 1,155일 ≥ 730
    expect(ex[0].operatingDaysBefore).toBe(152);
  });

  it("영위 기간 ON이 아니면 검사하지 않는다 — OFF(키 없음)·토글 꺼짐·양도일 의제는 10호 유예가 현행 그대로(V7b 입력의 현행 B 487/729)", () => {
    const off = judge(fromRaw(e3cRowRaw(row("V7b"), false)));
    expect([off.isNonBusinessLand, off.effectiveBusinessDays, off.gracePeriodDays]).toEqual([false, 487, 487]);
    const toggledOff = judge(fromRaw({ ...e3cRowRaw(row("V7b"), true), nblRevenuePeriodOn: false }));
    expect([toggledOff.isNonBusinessLand, toggledOff.gracePeriodDays]).toEqual([false, 487]);
    const deemed = judge(fromRaw(onRaw(row("V7b"), { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2024-06-01" })));
    expect(deemed.warnings).not.toContain(NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE);
    expect(deemed.warnings).toContain(NBL_REVENUE_HISTORY_DEEMED_TRANSFER_NOTICE);
    expect(deemed.gracePeriodDays).toBeGreaterThan(0);
  });

  it("폐업일은 있는데 10호 행이 없으면 «자동으로 만들지 않는다» 고지(`closureGrace`) — 행이 있으면(충족·미충족 모두) 이 고지가 없다", () => {
    expect(judge(fromRaw(onRaw(row("M11p")))).warnings).toContain(NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE);
    for (const id of ["M11p-10ho", "V7b", "V7d"]) expect(judge(fromRaw(onRaw(row(id)))).warnings, id).not.toContain(NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE);
    // 폐업일이 없으면(영위 중) 고지하지 않는다
    expect(judge(fromRaw(onRaw(row("M9p")))).warnings).not.toContain(NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE);
  });
});
