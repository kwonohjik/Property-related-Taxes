/**
 * anchor: 자산의 양도소득금액 **전부**가 하나의 감면율로 감면되는 자산의 파트가 §104 두 호에 걸칠 때의 다건 감면(「소득세법」 §90①).
 *
 * 계획서: docs/02-design/features/transfer-split-both-parts-reduction-per-clause.plan.md
 *
 * [결함] 파트가 두 호에 걸치면 호별 산정을 포기하고 신고 전체 산출세액·과세표준으로 감면을 계산했다(합산 + 안내).
 *   짝 자산의 세율이 감면으로 번졌다(대표 셀 33,037,156 vs 호별 25,552,050).
 * [수정] 각 파트의 감면소득은 그 파트의 소득과 같으므로(안분 아님) 파트별로 그 호에 귀속해 각호별로 산정한다
 *   (재산세과-3820 · 서면5팀-57 · 서면4팀-4036). 현금·채권 혼합처럼 파트 몫을 입력이 정하지 않는 경우는 합산 + 안내 유지.
 *
 * 기대값은 주석의 산식으로 도출했다. 모의 세율표: 누진 8구간 · 비사업용 토지 +10%p · §77 현금 15%·채권 20%(2026 양도).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const SPAN = "서로 다른 세율의 호에 걸쳐";

const base = (o: Record<string, unknown>) =>
  baseTransferInput({
    propertyType: "land", transferDate: D("2026-06-01"), acquisitionDate: D("2015-01-01"),
    isOneHousehold: false, householdHousingCount: 0, expenses: 0, annualBasicDeductionUsed: 0, ...o,
  } as Partial<TransferTaxInput>);
const E77 = (cash: number, bond = 0) => ({ type: "public_expropriation", cashCompensation: cash, bondCompensation: bond, businessApprovalDate: D("2018-01-01") });
const FARM = { type: "self_farming", farmingYears: 10 };

/** 부분 비사업용 50% · 9억 / 2.7억 — 파트 소득 각 245,700,000(장특 22%). */
const partial = (reductions: unknown[]) =>
  base({ transferPrice: 900_000_000, acquisitionPrice: 270_000_000, isNonBusinessLand: true, nonBusinessLandAreaRatio: 0.5, reductions });
/** 미등기 짝 — 소득 200,000,000 × 70% = 140,000,000. */
const unreg = () => base({ transferPrice: 500_000_000, acquisitionPrice: 300_000_000, isUnregistered: true });
/** 비사업용 토지 짝 12억 / 3억. */
const nblPair = () => base({ transferPrice: 1_200_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2017-02-20"), isNonBusinessLand: true });
/** 비주택 토지(비사업용) 2.5억 + 건물 3억 split. */
const nbSplit = (cash: number) =>
  base({
    propertyType: "building", transferPrice: 550_000_000, acquisitionPrice: 400_000_000, landAcquisitionDate: D("2015-01-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: 250_000_000, buildingTransferPrice: 300_000_000, landStandardPriceAtTransfer: 250_000_000, buildingStandardPriceAtTransfer: 300_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 200_000_000, isNonBusinessLand: true, householdHousingCount: 1, reductions: [E77(cash)],
  });
/** 주택 토지·건물 분리취득 + 배율 초과분. 양도 9억(토지 5.4억) · 면적 900㎡. */
const houseExcess = () =>
  base({
    propertyType: "housing", transferPrice: 900_000_000, acquisitionPrice: 400_000_000, landTransferPrice: 540_000_000, buildingTransferPrice: 360_000_000,
    landStandardPriceAtTransfer: 540_000_000, buildingStandardPriceAtTransfer: 360_000_000, landAcquisitionPrice: 250_000_000, buildingAcquisitionPrice: 150_000_000,
    landAcquisitionDate: D("2015-01-01"), isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 55, acquisitionArea: 900, appurtenantLandZone: "non_urban", residencePeriodMonths: 0, householdHousingCount: 1, reductions: [E77(900_000_000)],
  });

const asItems = (xs: TransferTaxInput[]) => xs.map((x, i) => ({ ...x, propertyId: `A${i}`, propertyLabel: `A${i}` }) as unknown as TransferTaxItemInput);
const agg = (xs: TransferTaxInput[]) => calculateTransferTaxAggregate({ taxYear: 2026, annualBasicDeductionUsed: 0, properties: asItems(xs) }, rates);
const rowsOf = (r: ReturnType<typeof agg>) => r.reductionBreakdown[0].clauseRows ?? [];
const warned = (r: ReturnType<typeof agg>) => r.warnings.some((w) => w.includes(SPAN));

describe("A — 부분 비사업용 + §77 현금 100% + 미등기 짝", () => {
  it("감면 25,552,050 = 1호 10,942,650 + 8호 14,609,400 (종전 신고 전체 기준 33,037,156)", () => {
    // 1호 72,951,000 × (245,700,000 − 1,250,000) × 15% / 244,450,000 = 10,942,650
    // 8호 97,396,000 × (245,700,000 − 1,250,000) × 15% / 244,450,000 = 14,609,400
    // 종전: 310,347,000 × 488,900,000 × 15% / 688,900,000 = 33,037,156 — 미등기 70%가 감면으로 번졌다.
    const r = agg([partial([E77(900_000_000)]), unreg()]);
    expect(r.reductionAmount).toBe(25_552_050);
    expect(rowsOf(r)).toEqual([
      expect.objectContaining({ clauseLabel: "§104①1호", calculatedTax: 72_951_000, taxBase: 244_450_000, numerator: 36_667_500, raw: 10_942_650 }),
      expect.objectContaining({ clauseLabel: "§104①8호", calculatedTax: 97_396_000, taxBase: 244_450_000, numerator: 36_667_500, raw: 14_609_400 }),
    ]);
    expect(warned(r)).toBe(false);
  });

  it("총세액 318,384,855 — 입력 순서와 무관", () => {
    expect(agg([partial([E77(900_000_000)]), unreg()]).totalTax).toBe(318_384_855);
    expect(agg([unreg(), partial([E77(900_000_000)])]).totalTax).toBe(318_384_855);
  });
});

describe("B — 비주택 토지(비사업용) + 건물 split + 비사업용 토지 짝", () => {
  it("감면 4,714,535 · 총세액 413,492,918 = 토지 자산 + 건물 자산 분리 신고 (종전 7,817,933)", () => {
    // 1호 12,960,000 × 78,000,000 × 15% / 78,000,000 = 1,944,000
    // 8호 366,800,000 × 39,000,000 × 15% / 774,500,000 = 2,770,535
    const r = agg([nbSplit(550_000_000), nblPair()]);
    expect(r.reductionAmount).toBe(4_714_535);
    expect(r.totalTax).toBe(413_492_918);
    const separated = agg([
      base({ transferPrice: 250_000_000, acquisitionPrice: 200_000_000, isNonBusinessLand: true, reductions: [E77(250_000_000)] }),
      base({ propertyType: "building", transferPrice: 300_000_000, acquisitionPrice: 200_000_000, householdHousingCount: 1, reductions: [E77(300_000_000)] }),
      nblPair(),
    ]);
    expect(r.totalTax).toBe(separated.totalTax);
    expect(r.reductionAmount).toBe(separated.reductionAmount);
  });
});

describe("합산 + 안내를 유지하는 경우", () => {
  it("C 현금·채권 혼합 — 파트 몫을 입력이 정하지 않는다. 총세액 306,667,345", () => {
    const r = agg([partial([E77(450_000_000, 450_000_000)]), unreg()]);
    expect(r.totalTax).toBe(306_667_345);
    expect(r.reductionBreakdown[0].clauseBasis).toBeUndefined();
    expect(warned(r)).toBe(true);
  });

  it("E 조건을 못 채운 자산이 하나라도 있으면 신고 전체가 합산 — 호를 나눌 수 없는 감면이 다른 자산 몫과 섞인다", () => {
    const r = agg([partial([E77(450_000_000, 450_000_000)]), base({ transferPrice: 800_000_000, acquisitionPrice: 240_000_000, isNonBusinessLand: true, nonBusinessLandAreaRatio: 0.5, reductions: [E77(800_000_000)] }), unreg()]);
    expect(r.reductionBreakdown[0].clauseBasis).toBeUndefined();
    expect(warned(r)).toBe(true);
  });

  it("H 자경 편입 부분감면 — 감면소득이 파트 소득 합계보다 작아 파트 몫이 정해지지 않는다", () => {
    const r = agg([partial([{ ...FARM, incorporationDate: D("2024-02-14"), incorporationZoneType: "residential", standardPriceAtAcquisition: 200_000_000, standardPriceAtIncorporation: 400_000_000, standardPriceAtTransfer: 600_000_000 }]), unreg()]);
    expect(r.reductionBreakdown[0].totalReducibleIncome).toBeGreaterThan(0);
    expect(r.reductionBreakdown[0].totalReducibleIncome).toBeLessThan(491_400_000);
    expect(r.reductionBreakdown[0].clauseBasis).toBeUndefined();
    expect(warned(r)).toBe(true);
  });
});

describe("D — 짝이 없으면(자산 1건) 호마다 (B − C) = D라 합산과 값이 같다", () => {
  it("총세액 164,384,855 불변 · 호별 2행 · 단건과 같다", () => {
    const r = agg([partial([E77(900_000_000)])]);
    const s = calculateTransferTax(partial([E77(900_000_000)]), rates);
    expect(r.totalTax).toBe(164_384_855);
    expect(s.totalTax).toBe(164_384_855);
    expect(r.reductionAmount).toBe(s.reductionAmount);
    expect(rowsOf(r)).toHaveLength(2);
    expect(warned(r)).toBe(false);
  });
});

describe("G — 조특법 §69 자경도 같다, §133 한도는 호별 합계에 건다", () => {
  it("원시 170,347,000(100%) → 한도 100,000,000", () => {
    const r = agg([partial([FARM]), unreg()]);
    expect(rowsOf(r).map((x) => x.raw)).toEqual([72_951_000, 97_396_000]);
    expect(r.reductionAmount).toBe(100_000_000);
    expect(warned(r)).toBe(false);
  });
});

describe("Q-2 — 재지 않은 감면 유형은 합산 + 안내를 유지한다", () => {
  it("조특법 §77의2 대토보상", () => {
    const r = agg([partial([{ type: "replacement_land_comp", cashCompensation: 0, replacementLandComp: 900_000_000, businessApprovalDate: D("2018-01-01") }]), unreg()]);
    expect(r.reductionAmount).toBeGreaterThan(0);
    expect(r.reductionBreakdown[0].clauseBasis).toBeUndefined();
    expect(warned(r)).toBe(true);
  });
});

describe("F — 주택 토지·건물 + 배율 초과 비사업용 토지 파트 (Q-1 a)", () => {
  it("토지·건물은 1호, 배율 초과분은 8호 — 감면 17,704,698 · 총세액 267,900,236 (종전 260,858,697)", () => {
    // 1호 prog(299,533,334) = 93,882,666 × (302,033,334 − 2,500,000) × 15% / 299,533,334 = 14,082,399
    // 8호 prog(87,966,667) + 10%p = 24,148,666 × 87,966,667 × 15% / 87,966,667 = 3,622,299
    // 산출 93,882,666 + 24,148,666 + 미등기 140,000,000 = 258,031,332
    // 결정 240,326,634 + 지방소득세 24,032,663 + 농특세(감면 × 20%) 3,540,939 = 267,900,236
    const r = agg([houseExcess(), unreg()]);
    expect(r.calculatedTax).toBe(258_031_332);
    expect(rowsOf(r).map((x) => [x.clauseLabel, x.raw])).toEqual([["§104①1호", 14_082_399], ["§104①8호", 3_622_299]]);
    expect(r.reductionAmount).toBe(17_704_698);
    expect(r.totalTax).toBe(267_900_236);
    expect(warned(r)).toBe(false);
  });
});

describe("J — 자산별 배분은 파트 조각의 합이다", () => {
  it("파트별 귀속 자산 + 1호 감면 자산: 자산 몫이 그 자산 조각들의 호별 감면과 같다", () => {
    const plain = () => base({ transferPrice: 800_000_000, acquisitionPrice: 300_000_000, reductions: [E77(800_000_000)] });
    const r = agg([partial([E77(900_000_000)]), plain(), unreg()]);
    const rows = rowsOf(r);
    expect(rows.reduce((t, x) => t + x.raw, 0)).toBe(r.reductionAmount);
    const w = r.reductionBreakdown[0].assetWeights!;
    expect(w).toHaveLength(2);
    // 8호 행은 A0 조각뿐 — A0의 가중치는 8호 감면 전액 + 1호 조각 몫이다(한 조각만 남기면 작아진다).
    const raw8 = rows.find((x) => x.clauseLabel === "§104①8호")!.raw;
    const raw1 = rows.find((x) => x.clauseLabel === "§104①1호")!.raw;
    expect(w[0]).toBeGreaterThan(raw8);
    expect(w[0] + w[1]).toBeLessThanOrEqual(raw8 + raw1);
    expect(raw8 + raw1 - (w[0] + w[1])).toBeLessThanOrEqual(2);
  });
});

describe("K — split 파트 안 차손으로 소득이 0인 파트는 호별 행을 만들지 않는다", () => {
  const split = (land: number, bld: number) =>
    base({
      propertyType: "building", transferPrice: land + bld, acquisitionPrice: 400_000_000, landAcquisitionDate: D("2015-01-01"),
      isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
      landTransferPrice: land, buildingTransferPrice: bld, landStandardPriceAtTransfer: land, buildingStandardPriceAtTransfer: bld,
      landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 200_000_000, isNonBusinessLand: true, householdHousingCount: 1, reductions: [E77(land + bld)],
    });
  const separated = (land: number, bld: number) => [
    base({ transferPrice: land, acquisitionPrice: 200_000_000, isNonBusinessLand: true, reductions: [E77(land)] }),
    base({ propertyType: "building", transferPrice: bld, acquisitionPrice: 200_000_000, householdHousingCount: 1, reductions: [E77(bld)] }),
  ];

  it("토지 차손 — 1호 한 행 · 감면 8,667,863 · 분리 신고와 같다", () => {
    const r = agg([split(150_000_000, 500_000_000), unreg()]);
    expect(rowsOf(r).map((x) => [x.clauseLabel, x.raw])).toEqual([["§104①1호", 8_667_863]]);
    expect(r.totalTax).toBe(agg([...separated(150_000_000, 500_000_000), unreg()]).totalTax);
  });

  it("건물 차손 — 8호 한 행 · 감면 11,735,985 · 분리 신고와 같다", () => {
    const r = agg([split(500_000_000, 150_000_000), unreg()]);
    expect(rowsOf(r).map((x) => [x.clauseLabel, x.raw])).toEqual([["§104①8호", 11_735_985]]);
    expect(r.totalTax).toBe(agg([...separated(500_000_000, 150_000_000), unreg()]).totalTax);
  });
});
