/**
 * anchor — 의제취득일(1985.1.1.) 전 «매수» 부동산 영 §176조의2④ (STEP 0.471 · `transfer-pre-deemed-purchase.ts`)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §6
 *
 * ② = floor(실가 × 1984.12. 지수 50.29 ÷ 취득월 지수) · ① > ②일 때만 ① · 동액 ② · ② 채택 = 실가 경로(개산공제 없음).
 * 취득일(`acquisitionDate`)은 화면이 덮어쓴 의제취득일 1985-01-01, 실제 취득일은 `preDeemedPurchase`로 온다.
 */
import { describe, expect, it } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

// 토지 · 양도 5억 · 의제취득일 1985-01-01 · 양도 2024-06-01
const land = (o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "land", transferPrice: 500_000_000, acquisitionPrice: 100_000_000, acquisitionDate: D("1985-01-01"),
    isOneHousehold: false, householdHousingCount: 0, residencePeriodMonths: 0, ...o,
  });
const pd = (date: string, extra: Partial<NonNullable<TransferTaxInput["preDeemedPurchase"]>> = {}) => ({
  preDeemedPurchase: { originalAcquisitionDate: D(date), ...extra },
});
// 환산 ① = 5억 × 1억 ÷ 2.5억 = 2억 · 개산공제 1억 × 3% = 3,000,000
const EST: Partial<TransferTaxInput> = { acquisitionPrice: 0, useEstimatedAcquisition: true, standardPriceAtAcquisition: 100_000_000, standardPriceAtTransfer: 250_000_000 };

describe("실가 모드 — ②만(① 미산정)", () => {
  it.each([
    ["1984-06", "1984-06-01", 101_411_574, 1.0141],
    ["1984-12(배율 1)", "1984-12-10", 100_000_000, 1],
    ["1984-09(배율 < 1 · Q-5 a 하한 없음)", "1984-09-01", 99_171_760, 0.9917],
    ["1980-01", "1980-01-01", 156_471_686, 1.5647],
  ] as const)("%s → ② %d", (_n, date, clause2, ratio) => {
    const r = calculateTransferTax(land(pd(date)), rates);
    expect(r.preDeemedPurchaseDetail).toMatchObject({ clause2Amount: clause2, selected: "clause2", expenseBasis: "actual", ratioSource: "table", deemedPrevMonth: "1984-12", actualBase: 100_000_000 });
    expect(r.preDeemedPurchaseDetail!.clause1Amount).toBeUndefined();
    expect(r.preDeemedPurchaseDetail!.ratio).toBeCloseTo(ratio, 4);
    expect(r.transferGain).toBe(500_000_000 - clause2);
    expect(r.steps.some((s) => s.label === "의제취득일 전 매수 — 취득가액 비교")).toBe(true);
  });
  it("필드 없음·의제취득일 이후 실제 취득일 → 종전 그대로(echo 없음)", () => {
    for (const o of [{}, pd("1985-01-01"), pd("1990-03-01")]) {
      const r = calculateTransferTax(land(o), rates);
      expect(r.preDeemedPurchaseDetail).toBeUndefined();
      expect(r.transferGain).toBe(400_000_000);
    }
  });
  it("1984-06 결정세액 — 종전보다 작다", () => {
    const before = calculateTransferTax(land(), rates).determinedTax;
    const after = calculateTransferTax(land(pd("1984-06-01")), rates).determinedTax;
    expect(after).toBeLessThan(before);
  });
});

describe("추계 모드 — ① vs ②", () => {
  it("환산 · 함께 견줄 실가 1억 → ① 2억 채택 · 개산공제 유지 · 종전과 같은 세액", () => {
    const base = calculateTransferTax(land(EST), rates);
    const r = calculateTransferTax(land({ ...EST, ...pd("1984-06-01", { actualPrice: 100_000_000 }) }), rates);
    expect(r.preDeemedPurchaseDetail).toMatchObject({ clause1Amount: 200_000_000, clause1Method: "estimated", clause2Amount: 101_411_574, selected: "clause1", expenseBasis: "estimated" });
    expect(r.transferGain).toBe(297_000_000);
    expect(r.determinedTax).toBe(base.determinedTax);
  });
  it("환산 · 함께 견줄 실가 3억 → ② 304,234,724 채택 · 실가 경로(개산공제 없음)", () => {
    const r = calculateTransferTax(land({ ...EST, ...pd("1984-06-01", { actualPrice: 300_000_000 }) }), rates);
    expect(r.preDeemedPurchaseDetail).toMatchObject({ clause1Amount: 200_000_000, clause2Amount: 304_234_724, selected: "clause2", expenseBasis: "actual" });
    expect(r.transferGain).toBe(195_765_276);
    expect(r.usedEstimatedAcquisition).toBe(false);
  });
  it("동액(① 2억 = ② 2억 · 1984-12) → ② · 개산공제 없음", () => {
    const r = calculateTransferTax(land({ ...EST, ...pd("1984-12-10", { actualPrice: 200_000_000 }) }), rates);
    expect(r.preDeemedPurchaseDetail).toMatchObject({ clause1Amount: 200_000_000, clause2Amount: 200_000_000, selected: "clause2" });
    expect(r.transferGain).toBe(300_000_000);
  });
  it("환산 · 함께 견줄 실가 빈칸 → 종전 그대로(echo 없음)", () => {
    const r = calculateTransferTax(land({ ...EST, ...pd("1984-06-01") }), rates);
    expect(r.preDeemedPurchaseDetail).toBeUndefined();
    expect(r.transferGain).toBe(297_000_000);
  });
  it("② 채택 시 자본적지출·양도비는 실비로 남는다", () => {
    const r = calculateTransferTax(land({ ...EST, capitalExpenditure: 10_000_000, transferExpense: 5_000_000, ...pd("1984-06-01", { actualPrice: 300_000_000 }) }), rates);
    expect(r.transferGain).toBe(500_000_000 - 304_234_724 - 15_000_000);
  });
  it.each([
    ["감정가액", { acquisitionMethod: "appraisal" as const, appraisalValue: 200_000_000 }, "appraisal"],
    ["매매사례가액", { acquisitionMethod: "salesCase" as const, similarSalesValue: 200_000_000 }, "salesCase"],
  ])("%s 2억 · 실가 1억 → ① 채택", (_n, mode, method) => {
    const r = calculateTransferTax(land({ acquisitionPrice: 0, standardPriceAtAcquisition: 100_000_000, ...mode, ...pd("1984-06-01", { actualPrice: 100_000_000 }) }), rates);
    expect(r.preDeemedPurchaseDetail).toMatchObject({ clause1Amount: 200_000_000, clause1Method: method, selected: "clause1" });
    expect(r.transferGain).toBe(297_000_000);
  });
  it.each([
    ["감정가액", { acquisitionMethod: "appraisal" as const, appraisalValue: 200_000_000 }],
    ["매매사례가액", { acquisitionMethod: "salesCase" as const, similarSalesValue: 200_000_000 }],
  ])("%s 2억 · 실가 3억 → ② 채택 · 개산공제 없음", (_n, mode) => {
    const r = calculateTransferTax(land({ acquisitionPrice: 0, standardPriceAtAcquisition: 100_000_000, ...mode, ...pd("1984-06-01", { actualPrice: 300_000_000 }) }), rates);
    expect(r.preDeemedPurchaseDetail).toMatchObject({ clause1Amount: 200_000_000, clause2Amount: 304_234_724, selected: "clause2" });
    expect(r.transferGain).toBe(195_765_276);
  });
  it("1990.8.30. 전 토지 환산(pre1990Land) · ② 채택 → 1990 환산 echo를 싣지 않는다", () => {
    const P90 = { acquisitionDate: D("1985-01-01"), transferDate: D("2024-06-01"), areaSqm: 100, pricePerSqm_1990: 1_000_000, pricePerSqm_atTransfer: 2_500_000, grade_1990_0830: 100, gradePrev_1990_0830: 100, gradeAtAcquisition: 100 };
    const one = calculateTransferTax(land({ acquisitionPrice: 0, standardPriceAtTransfer: 250_000_000, pre1990Land: P90, ...pd("1984-06-01", { actualPrice: 100_000_000 }) }), rates);
    expect(one.preDeemedPurchaseDetail?.selected).toBe("clause1");
    expect(one.pre1990LandValuationDetail).toBeDefined();
    const two = calculateTransferTax(land({ acquisitionPrice: 0, standardPriceAtTransfer: 250_000_000, pre1990Land: P90, ...pd("1984-06-01", { actualPrice: 300_000_000 }) }), rates);
    expect(two.preDeemedPurchaseDetail?.selected).toBe("clause2");
    expect(two.pre1990LandValuationDetail).toBeUndefined();
    expect(two.transferGain).toBe(195_765_276);
  });
});

describe("주택 PHD §164⑦(토지·건물 같은 날 · 분리 경로)", () => {
  const PHD: Partial<TransferTaxInput> = {
    propertyType: "housing", transferPrice: 1_000_000_000, acquisitionPrice: 0, useEstimatedAcquisition: true, landAcquisitionDate: D("1985-01-01"),
    preHousingDisclosure: {
      firstDisclosureDate: D("2005-04-30"), firstDisclosureHousingPrice: 3_000_000, landArea: 100, landPricePerSqmAtAcquisition: 10_000,
      buildingStdPriceAtAcquisition: 1_000_000, landPricePerSqmAtFirstDisclosure: 15_000, buildingStdPriceAtFirstDisclosure: 1_500_000,
      transferHousingPrice: 980_000_000, landPricePerSqmAtTransfer: 2_660_000, buildingStdPriceAtTransfer: 714_000_000,
    },
  } as Partial<TransferTaxInput>;
  it("① = PHD 환산(본 계산과 같은 값) · 실가 1억이면 ① · 세액 종전과 같다", () => {
    const base = calculateTransferTax(land(PHD), rates);
    const r = calculateTransferTax(land({ ...PHD, ...pd("1984-06-01", { actualPrice: 1_000_000 }) }), rates);
    expect(r.preDeemedPurchaseDetail?.selected).toBe("clause1");
    expect(r.preDeemedPurchaseDetail?.clause1Amount).toBe(base.splitDetail!.land.acquisitionPrice + base.splitDetail!.building.acquisitionPrice);
    expect(r.transferGain).toBe(base.transferGain);
    expect(r.determinedTax).toBe(base.determinedTax);
  });
  it("실가 5억 → ② 507,057,874 · 실가 경로(PHD·분리 끊음)", () => {
    const r = calculateTransferTax(land({ ...PHD, ...pd("1984-06-01", { actualPrice: 500_000_000 }) }), rates);
    expect(r.preDeemedPurchaseDetail).toMatchObject({ clause2Amount: 507_057_874, selected: "clause2" });
    expect(r.transferGain).toBe(492_942_126);
  });
});

describe("1965.01 전 취득(Q-7)", () => {
  it("배율 빈칸 → ② 산정 안 함 · 경고 · 종전 그대로", () => {
    const r = calculateTransferTax(land(pd("1963-05-01")), rates);
    expect(r.preDeemedPurchaseDetail).toBeUndefined();
    expect(r.transferGain).toBe(400_000_000);
    expect(r.warnings?.some((w) => w.includes("물가상승 배율을 입력하세요"))).toBe(true);
  });
  it("배율 3.5 → ② 350,000,000", () => {
    const r = calculateTransferTax(land(pd("1963-05-01", { ppiRatio: 3.5 })), rates);
    expect(r.preDeemedPurchaseDetail).toMatchObject({ clause2Amount: 350_000_000, ratioSource: "override", ratio: 3.5 });
    expect(r.transferGain).toBe(150_000_000);
  });
});

describe("상가", () => {
  it("실가 6억(양도 10억) → ② 608,469,449", () => {
    const r = calculateTransferTax(land({ propertyType: "commercial_building", transferPrice: 1_000_000_000, acquisitionPrice: 600_000_000, ...pd("1984-06-01") }), rates);
    expect(r.preDeemedPurchaseDetail?.clause2Amount).toBe(608_469_449);
    expect(r.transferGain).toBe(391_530_551);
  });
  const CB: Partial<TransferTaxInput> = {
    propertyType: "commercial_building", transferPrice: 1_000_000_000, acquisitionPrice: 0, useEstimatedAcquisition: true,
    commercialBuildingValuation: { isPreDisclosure: false, exclusiveArea: 150, commonArea: 50, unitPriceAtTransfer: 2_500_000, unitPriceAtAcquisition: 1_000_000 },
  } as Partial<TransferTaxInput>;
  it("상가 환산 ① 4억 · 실가 1억 → ① · 상가 환산 그대로", () => {
    const base = calculateTransferTax(land(CB), rates);
    const r = calculateTransferTax(land({ ...CB, ...pd("1984-06-01", { actualPrice: 100_000_000 }) }), rates);
    expect(r.preDeemedPurchaseDetail).toMatchObject({ clause1Amount: 400_000_000, selected: "clause1" });
    expect(r.transferGain).toBe(base.transferGain);
    expect(r.commercialBuildingValuationDetail).toBeDefined();
  });
  it("상가 환산 ① 4억 · 실가 5억 → ② 507,057,874 · 실가 경로", () => {
    const r = calculateTransferTax(land({ ...CB, ...pd("1984-06-01", { actualPrice: 500_000_000 }) }), rates);
    expect(r.preDeemedPurchaseDetail).toMatchObject({ clause1Amount: 400_000_000, clause2Amount: 507_057_874, selected: "clause2" });
    expect(r.transferGain).toBe(492_942_126);
    expect(r.commercialBuildingValuationDetail).toBeUndefined();
  });
});

describe("범위 밖 · 외부 지정 → 값 그대로 + 경고", () => {
  it.each([
    ["분양권(자산 종류)", { propertyType: "presale_right" as const }, "자산 종류"],
    ["자가건축(취득원인)", { acquisitionCause: "newConstruction" as const }, "취득원인이 매매가 아닙니다"],
    ["토지·건물 취득일 분리", { propertyType: "housing" as const, landAcquisitionDate: D("1984-03-01") }, "토지·건물 취득일 분리"],
  ])("%s", (_n, o, reason) => {
    const base = calculateTransferTax(land(o), rates);
    const r = calculateTransferTax(land({ ...o, ...pd("1984-06-01") }), rates);
    expect(r.preDeemedPurchaseDetail).toBeUndefined();
    expect(r.transferGain).toBe(base.transferGain);
    expect(r.warnings?.some((w) => w.includes(`범위 밖(${reason})`))).toBe(true);
  });
  it("acquisitionOverride 옵션 → 적용 안 함", () => {
    const r = calculateTransferTax(land(pd("1984-06-01")), rates, { acquisitionOverride: 150_000_000 });
    expect(r.preDeemedPurchaseDetail).toBeUndefined();
    expect(r.transferGain).toBe(350_000_000);
    expect(r.warnings?.some((w) => w.includes("범위 밖(외부 취득가액 지정)"))).toBe(true);
  });
});
