/**
 * anchor: 토지·건물 분리 자산의 파트 양도차손 통산 — 「소득세법 시행령」 §167의2①
 *
 * > 양도차손은 다음 각호의 자산의 양도소득금액에서 순차로 공제한다.
 * > 1. 양도차손이 발생한 자산과 같은 세율을 적용받는 자산의 양도소득금액
 * > 2. … 다른 세율을 적용받는 자산의 양도소득금액. … 각 세율별 양도소득금액의 합계액에서 당해 양도소득금액이 차지하는 비율로 안분하여 공제한다.
 * (조세심판원 국심2007중3718 — 같은 과세기간에 양도한 토지·건물의 양도차익과 양도차손은 통산한다.)
 *
 * [결함] 한 파트라도 차손이면 파트별 세율 판정을 포기하고 자산 전체에 건물 기산일 세율 하나를 적용했다
 *   (`transfer-tax-split-part-seeds.ts` 게이트 6) — 토지 기산일(상속·구주택 통산·비주택 장기 보유)이 버려지고 토지 소득에 건물 단기세율이 붙었다.
 * [수정] 차손 파트를 다른 파트에서 §167의2① 순서로 공제한 뒤 파트별 세율을 판정한다. 계획서 `transfer-split-part-loss-offset-167-2.plan.md`.
 *
 * 기대값은 독립 산식(`prog` — 모의 세율표 누진 8구간)으로 도출한다. 건물 파트는 차손 공제 후 과세표준 0이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 소득세법 §55① 누진세율(모의 세율표와 같은 8구간). */
function prog(base: number): number {
  const t: [number, number, number][] = [
    [14_000_000, 0.06, 0], [50_000_000, 0.15, 1_260_000], [88_000_000, 0.24, 5_760_000], [150_000_000, 0.35, 15_440_000],
    [300_000_000, 0.38, 19_940_000], [500_000_000, 0.4, 25_940_000], [1_000_000_000, 0.42, 35_940_000], [Infinity, 0.45, 65_940_000],
  ];
  const [, r, d] = t.find(([ub]) => base <= ub)!;
  return Math.floor(base * r) - d;
}

/** 주택 · 토지 매수 2022-01-01 · 건물 신축 취득 2025-01-01(8개월) · 양도 2025-09-01 · 구주택 멸실 2023-05-31(17 + 8 = 25개월) · 건물 환산취득가 차손 −9,000,000 */
const rebuild = (withRebuild: boolean): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, transferDate: D("2025-09-01"), acquisitionPrice: 450_000_000, acquisitionCause: "purchase",
    acquisitionDate: D("2025-01-01"), isOneHousehold: false, householdHousingCount: 2, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "estimated",
    landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 300_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 250_000_000, landAcquisitionDate: D("2022-01-01"),
    standardPricePerSqmAtAcquisition: 1_000_000, acquisitionArea: 200, standardPriceAtAcquisition: 500_000_000, buildingStandardPriceAtAcquisition: 300_000_000,
    ...(withRebuild ? { landRebuildPriorHouse: { startMode: "since_land", footprintUnchanged: true, demolitionDate: D("2023-05-31") } } : {}),
  } as Partial<TransferTaxInput>);

/** 비주택 · 토지 2010-03-20 · 건물 2021-09-20(1년 6개월 — §104①2호 40%) · 양도 2023-03-20 · 토지 +450,000,000 · 건물 −100,000,000 */
const nonHouse = (buildingAcq = 450_000_000): TransferTaxInput =>
  baseTransferInput({
    propertyType: "building", transferPrice: 1_000_000_000, transferDate: D("2023-03-20"), acquisitionPrice: 200_000_000 + buildingAcq,
    acquisitionDate: D("2021-09-20"), landAcquisitionDate: D("2010-03-20"), isOneHousehold: false, householdHousingCount: 1,
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual", landTransferPrice: 650_000_000, buildingTransferPrice: 350_000_000,
    landStandardPriceAtTransfer: 650_000_000, buildingStandardPriceAtTransfer: 350_000_000, landAcquisitionPrice: 200_000_000,
    buildingAcquisitionPrice: buildingAcq, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);

const stepOf = (r: ReturnType<typeof calculateTransferTax>) => r.steps.find((x) => x.label.includes("산출세액"))?.formula ?? "";

describe("L-1 주택 · 구주택 멸실·신축 통산 + 건물 차손 — 2호(다른 세율): 차손 전액을 토지에서 공제 · 토지 기본세율", () => {
  const r = calculateTransferTax(rebuild(true), rates);
  it("산출세액 = prog(과세표준) = 157,460,000 · 파트 판정 플래그 true", () => {
    expect(r.taxBase).toBe(458_500_000);
    expect(r.calculatedTax).toBe(prog(458_500_000));
    expect(r.calculatedTax).toBe(157_460_000);
    expect(r.splitDetail?.partRateBasisApplied).toBe(true);
  });
  it("내역: 건물 차손 9,000,000을 토지에서 공제 · 머리 세율은 과세표준 있는 파트(토지) 세율", () => {
    const f = stepOf(r);
    expect(f).toContain("건물 양도차손 9,000,000을 토지 양도소득금액에서 공제");
    expect(f).toContain("시행령 §167의2");
    expect(f.startsWith("과세표준 458,500,000 × 세율 40%")).toBe(true);
  });
  it("대조: 통산 입력이 없으면 토지도 주택 취득일 기산(70%)이라 두 파트 세율이 같아 접힌다 — 458,500,000 × 70% = 320,950,000", () => {
    const off = calculateTransferTax(rebuild(false), rates);
    expect(off.calculatedTax).toBe(Math.floor(458_500_000 * 0.7));
    expect(stepOf(off)).not.toContain("§167의2");
  });
});

describe("L-2 비주택 · 토지 2010 / 건물 1년 6개월 차손 — 토지 기본세율 (종전: 자산 전체 40%)", () => {
  it("토지 450,000,000 − 장특 26% 117,000,000 = 333,000,000 − 건물 차손 100,000,000 − 기본공제 2,500,000 = 230,500,000 → prog", () => {
    const r = calculateTransferTax(nonHouse(), rates);
    expect(r.splitDetail!.building.gain).toBe(-100_000_000);
    expect(r.taxBase).toBe(230_500_000);
    expect(r.calculatedTax).toBe(prog(230_500_000));
    expect(r.calculatedTax).not.toBe(Math.floor(230_500_000 * 0.4));
    expect(stepOf(r)).toContain("건물 양도차손 100,000,000을 토지 양도소득금액에서 공제");
  });
  it("다건(자산 1건) = 단건", () => {
    const item = { ...nonHouse(), propertyId: "a", propertyLabel: "a" } as unknown as TransferTaxItemInput;
    const a = calculateTransferTaxAggregate({ taxYear: 2023, properties: [item], annualBasicDeductionUsed: 0 }, rates);
    expect(a.calculatedTax).toBe(calculateTransferTax(nonHouse(), rates).calculatedTax);
  });
});

describe("L-3 경계 — 바뀌지 않는 것", () => {
  it("차손이 없으면 종전 그대로(내역에 §167의2 없음)", () => {
    const r = calculateTransferTax(nonHouse(300_000_000), rates);
    expect(r.splitDetail!.building.gain).toBeGreaterThan(0);
    expect(stepOf(r)).not.toContain("§167의2");
  });
  it("자산 전체 차손이면 산출세액 0 · 파트 판정 없음", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...nonHouse(), landTransferPrice: 150_000_000, landStandardPriceAtTransfer: 150_000_000, transferPrice: 500_000_000 } as Partial<TransferTaxInput>),
      rates,
    );
    expect(r.calculatedTax).toBe(0);
    expect(r.splitDetail?.partRateBasisApplied).not.toBe(true);
  });
});
