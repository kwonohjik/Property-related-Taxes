/**
 * #15 (S06-5·S06-6) — RH-B2 2호 부분의 장기보유특별공제는 표2(소득세법 시행령 §161④) 보유분을 적용한다.
 *
 * 종전: ⑳ 경로의 자체 사본 `calcTable2Rate`가 거주 2년 미만이면 표2를 0으로 만들었고(양도일 연혁도 없어
 * 2009~2020 양도분에도 현행 식을 썼다). 이제 일반 경로의 정본 `calcLongTermRate`에 위임한다.
 * 두 독법(§161④ 문언 vs §159의4 거주 2년)이 갈리는 경우에만 「확인 필요」를 단다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { calculateGain95BothTables } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/ltc-table-split";
import { buildPrhpTable2ReadingNotice } from "@/lib/tax-engine/transfer-tax-rental-housing-judge";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { runCalc } from "../one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

/** B(§154⑩ 표준 경로) · 2009-08 취득 · 양도가 15억 — 거주 개월만 바꾼다. */
function bForm(transferDate: string, resMonths: string) {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate, householdHousingCount: "1", isOneHousehold: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, contractTotalPrice: "1,500,000,000" });
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-08-12", actualSalePrice: "1,500,000,000", fixedAcquisitionPrice: "489,000,000", useEstimatedAcquisition: false, residenceInputMode: "direct", residencePeriodMonthsAsset: resMonths });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException, applyException: true, scenario: "B", rentalUnits: [],
    priorResidenceTransferDate: "2016-08-25", standardPriceAtAcquisitionForPhrp: "300,000,000", standardPriceAtPriorTransfer: "450,000,000",
    standardPriceAtTransferForPhrp: "500,000,000", postRegistrationResidenceMonths: "0", wasRegisteredRentalOrChildcare: true,
  };
  return f;
}

const NOTICE = /§161④ 문언대로 장기보유특별공제 표2.*확인이 필요/;

describe("#15 정본 위임 — 표2 공제율 (S06-5·S06-6)", () => {
  it("거주 2년 미만 + 보유 10년: 표2 보유분 40%만 남는다 (종전 0)", () => {
    const r = calculateGain95BothTables(1_000_000_000, 10, 0, new Date("2025-06-01"));
    expect(r.rateTable2).toBeCloseTo(0.4, 10);
    expect(r.gain95Table2).toBe(600_000_000);
  });
  it("[짝] 거주 2년 이상이면 보유분 + 거주분 (보유 10 + 거주 2 = 48%)", () => {
    const r = calculateGain95BothTables(1_000_000_000, 10, 2, new Date("2025-06-01"));
    expect(r.gain95Table2).toBe(520_000_000);
  });
  it("보유 3년 미만은 0 — 표2도 같다", () => {
    expect(calculateGain95BothTables(1_000_000_000, 2, 5, new Date("2025-06-01")).gain95Table2).toBe(1_000_000_000);
  });
  it("2019 양도: 표2 연혁(보유 연 8%, 거주 요건 없음) — 보유 9년 72%", () => {
    const r = calculateGain95BothTables(1_000_000_000, 9, 0, new Date("2019-06-01"));
    expect(r.gain95Table2).toBe(280_000_000);
  });
  it("[짝] 양도일 미제공이면 현행 식(보유 9년 36%) — 연혁 분기가 양도일로만 갈린다", () => {
    expect(calculateGain95BothTables(1_000_000_000, 9, 0).gain95Table2).toBe(640_000_000);
  });
});

describe("#15 계산기 end-to-end — RH-B2 2호 (15억·보유 15년)", () => {
  it("2025 양도 + 거주 0개월: 2호가 표2 보유분 40% → part2 30,330,000, 총세액 218,541,510 (종전 227,883,150)", async () => {
    const r = await runCalc(bForm("2025-06-01", "0"));
    const d = r.result.rentalHousingExceptionDetail;
    expect(d.scenarioId).toBe("RH-B2");
    expect(d.formulaTrace.gain95Table2).toBe(606_600_000);
    expect(d.formulaTrace.part2).toBe(30_330_000);
    expect(r.result.totalTax).toBe(218_541_510);
    expect((r.result.warnings as string[]).some((w) => NOTICE.test(w))).toBe(true);
  });
  it("2025 양도 + 거주 12개월(거주분 칸 없음): 같은 값 — 거주 2년 미만의 거주분은 0", async () => {
    const r = await runCalc(bForm("2025-06-01", "12"));
    expect(r.result.rentalHousingExceptionDetail.formulaTrace.part2).toBe(30_330_000);
    expect(r.result.totalTax).toBe(218_541_510);
  });
  it("[짝] 거주 24개월: 표2 보유 + 거주 48% → 종전과 같은 값이고 고지가 없다 (두 독법이 갈리지 않음)", async () => {
    const r = await runCalc(bForm("2025-06-01", "24"));
    expect(r.result.rentalHousingExceptionDetail.formulaTrace.part2).toBe(26_286_000);
    expect(r.result.totalTax).toBe(216_673_182);
    expect(((r.result.warnings ?? []) as string[]).some((w) => NOTICE.test(w))).toBe(false);
  });
  it("2020 양도(연혁 8%·거주 2년 요건 있음) + 거주 0: 표2 보유 80% → part2 20,220,000 + 고지 (종전 101,100,000)", async () => {
    const r = await runCalc(bForm("2020-06-01", "0"));
    const d = r.result.rentalHousingExceptionDetail;
    expect(d.formulaTrace.gain95Table2).toBe(202_200_000);
    expect(d.formulaTrace.part2).toBe(20_220_000);
    expect((r.result.warnings as string[]).some((w) => NOTICE.test(w))).toBe(true);
  });
  it("[짝] 2020 양도 + 거주 24개월: 연혁상 표2는 보유 8%뿐이라 거주 0과 같은 값, 고지 없음", async () => {
    const r = await runCalc(bForm("2020-06-01", "24"));
    expect(r.result.rentalHousingExceptionDetail.formulaTrace.part2).toBe(20_220_000);
    expect(((r.result.warnings ?? []) as string[]).some((w) => NOTICE.test(w))).toBe(false);
  });
  it("2019 양도 + 거주 0: 표2에 거주 요건 자체가 없다 — 연혁 72% (종전은 거주 0이라 표2 0) · 고지 없음", async () => {
    const r = await runCalc(bForm("2019-06-01", "0"));
    const d = r.result.rentalHousingExceptionDetail;
    expect(d.formulaTrace.gain95Table2).toBe(283_080_000);
    expect(((r.result.warnings ?? []) as string[]).some((w) => NOTICE.test(w))).toBe(false);
  });
});

describe("#15 고지 조건 — buildPrhpTable2ReadingNotice", () => {
  const base = (over: Record<string, unknown> = {}) =>
    ({ transferDate: new Date("2025-06-01"), acquisitionDate: new Date("2009-08-12"), residencePeriodMonths: 0, ...over }) as unknown as TransferTaxInput;
  it("RH-B2 + 2호 금액 + 보유 3년 이상 + 거주 2년 미만 → 고지", () => {
    expect(buildPrhpTable2ReadingNotice(base(), "RH-B2", 1, 15)).toMatch(NOTICE);
  });
  it("[짝] 2호 금액 0 · RH-B1 · 보유 3년 미만이면 고지하지 않는다", () => {
    expect(buildPrhpTable2ReadingNotice(base(), "RH-B2", 0, 15)).toBeUndefined();
    expect(buildPrhpTable2ReadingNotice(base(), "RH-B2", undefined, 15)).toBeUndefined();
    expect(buildPrhpTable2ReadingNotice(base(), "RH-B1", 1, 15)).toBeUndefined();
    expect(buildPrhpTable2ReadingNotice(base(), "RH-B2", 1, 2)).toBeUndefined();
  });
  it("[짝] 통산 거주 2년 이상이면 고지하지 않는다 (§154⑧3호 통산은 일반 경로와 같은 술어)", () => {
    expect(buildPrhpTable2ReadingNotice(base({ residencePeriodMonths: 24 }), "RH-B2", 1, 15)).toBeUndefined();
  });
  it("[짝] 상생임대주택은 §159의4 거주 요건이 면제되어 고지하지 않는다", () => {
    const winWin = {
      winWinContractDate: new Date("2022-03-01"), increaseRatePct: 3, priorLeaseMonths: 24, winWinLeaseMonths: 24,
      winWinLeaseEndDate: new Date("2024-03-01"),
    };
    expect(buildPrhpTable2ReadingNotice(base({ winWinRentalHouse: winWin }), "RH-B2", 1, 15)).toBeUndefined();
  });
});
