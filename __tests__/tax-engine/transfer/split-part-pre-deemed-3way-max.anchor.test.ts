/**
 * 토지·건물 분리 계산(D1) — 1985.1.1. 전 상속·증여 토지 파트 3자 max (계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §13).
 *
 * 토지 파트 취득가액 = max(① 평가액, ② 영 §164④ 가액, ③ 환산취득가액) — 동점 ①② 우선 · 취득가액만 비교(Q-7 a).
 * ③ = 파트 양도가액 × 의제취득일 현재 기준시가(= ② 지분 반영 전 `landSec164ValueWhole`) ÷ 양도시 토지 기준시가.
 * ③이 채택되면 그 파트는 추계 — 개산공제(같은 분자 × 지분 × 3%) · §97②2호 단서 파트 비교.
 * D2(건물 상속·증여 + 토지 매매)의 1985 전 건물은 ③을 비교하지 않고 고지만 붙인다(Q-9 a).
 *
 * 시료: 주택 · 건물 2018 매매 4억 · 토지 1980 상속(피상속인 1960) · 양도 12억(토지 7억/건물 5억) · 양도시 토지 기준시가 4억 · mock 세율.
 * 세액은 `totalTax`(지방소득세 포함). 「종전」은 변경 전 엔진(max(①,②)) 실측값.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  collectSplitPartCauseIssues,
  isPreDeemedLandPart,
  LAND_PRE_DEEMED_WHOLE_REQUIRED_MESSAGE,
  LAND_PRE_DEEMED_STD_AT_TRANSFER_REQUIRED_MESSAGE,
} from "@/lib/tax-engine/transfer-split-part-cause";
import { splitAcqBasisFormula, splitAcqBasisView } from "@/lib/tax-engine/transfer-tax-split-display";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const asset = (o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_200_000_000,
    transferDate: D("2026-06-30"),
    acquisitionDate: D("2018-03-02"),
    acquisitionCause: "purchase",
    isOneHousehold: false,
    householdHousingCount: 2,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 700_000_000,
    buildingTransferPrice: 500_000_000,
    landStandardPriceAtTransfer: 400_000_000,
    buildingStandardPriceAtTransfer: 300_000_000,
    landAcquisitionPrice: 300_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcquisitionDate: D("1980-05-01"),
    landAcquisitionCause: "inheritance",
    landDecedentAcquisitionDate: D("1960-01-01"),
    landSec164Value: 350_000_000,
    landSec164ValueWhole: 350_000_000,
    ...o,
  });
const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(asset(o), makeMockRates());

const CASES = [
  // [id, 입력, 채택, 토지 취득가액, 개산공제, 결정세액, 종전]
  { id: "① 3억 · ② 3.5억 → ③ 6.125억", in: {}, adopted: "converted", acq: 612_500_000, lump: 10_500_000, tax: 35_145_000, before: 115_126_000 },
  { id: "① 1억 · ② 0.5억 → ③ 0.875억 < ①", in: { landAcquisitionPrice: 100_000_000, landSec164Value: 50_000_000, landSec164ValueWhole: 50_000_000 }, adopted: "reported", acq: 100_000_000, lump: 0, tax: 192_159_000, before: 192_159_000 },
  { id: "① 6.5억 > ③", in: { landAcquisitionPrice: 650_000_000 }, adopted: "reported", acq: 650_000_000, lump: 0, tax: 27_868_500, before: 27_868_500 },
] as const;

describe("D1 1985 전 토지 파트 3자 max", () => {
  for (const c of CASES) {
    it(`${c.id}: ${c.adopted} · 토지 ${c.acq.toLocaleString()} · 결정세액 ${c.tax.toLocaleString()} (종전 ${c.before.toLocaleString()})`, () => {
      const r = run(c.in);
      const land = r.splitDetail!.land;
      expect(land.acquisitionBasis?.adopted).toBe(c.adopted);
      expect(land.acquisitionPrice).toBe(c.acq);
      expect(land.appraisalDeduction).toBe(c.lump);
      expect(land.acqMode).toBe(c.adopted === "converted" ? "estimated" : "actual");
      expect(r.totalTax).toBe(c.tax);
    });
  }

  it("③ 채택 echo: converted 금액 · 개산공제 base = ② 지분 반영 전 · 양도시 기준시가 echo", () => {
    const land = run().splitDetail!.land;
    expect(land.acquisitionBasis).toEqual({ rule: "sec163_9_1", reported: 300_000_000, sec164: 350_000_000, converted: 612_500_000, adopted: "converted" });
    expect(land.stdPriceAtAcq).toBe(350_000_000);
    expect(land.lumpDeductionBase).toBe(350_000_000);
    expect(land.gain).toBe(700_000_000 - 612_500_000 - 10_500_000);
  });

  it("동점이면 ①② 우선(Q-5) — ③ = ② 이면 ② 채택 · 실가", () => {
    // 양도시 기준시가 비율(7억:5억)로 안분한 토지 양도가액 = 7억 = 양도시 토지 기준시가 → ③ = ②
    const land = run({ landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000 }).splitDetail!.land;
    expect(land.acquisitionBasis?.converted).toBe(350_000_000);
    expect(land.acquisitionBasis?.adopted).toBe("sec164");
    expect(land.acqMode).toBe("actual");
  });

  it("지분 50%: ③ = 지분 양도가액 × ②(전체) ÷ 양도시 기준시가(전체) · 개산공제 = floor(②전체 × 지분) × 3%", () => {
    const land = run({
      ownershipRatio: 0.5,
      landTransferPrice: 350_000_000,
      buildingTransferPrice: 250_000_000,
      transferPrice: 600_000_000,
      landAcquisitionPrice: 150_000_000,
      buildingAcquisitionPrice: 200_000_000,
      landSec164Value: 175_000_000,
      landSec164ValueWhole: 350_000_000,
    }).splitDetail!.land;
    expect(land.acquisitionBasis?.converted).toBe(306_250_000);
    expect(land.acquisitionBasis?.adopted).toBe("converted");
    expect(land.appraisalDeduction).toBe(5_250_000);
  });

  it("§100③: 구분 기재가 30% 넘게 달라 안분값으로 되돌아가면 ③도 그 파트 양도가액으로 — 양도차익과 같은 값", () => {
    // 양도 9억(토지 6억/건물 3억 기재) · 양도시 기준시가 3억:1억 → 건물 기재 3억이 안분값 2.25억과 33% 차이 → 안분(토지 6.75억)
    const land = run({
      transferPrice: 900_000_000,
      landTransferPrice: 600_000_000,
      buildingTransferPrice: 300_000_000,
      landStandardPriceAtTransfer: 300_000_000,
      buildingStandardPriceAtTransfer: 100_000_000,
      buildingAcquisitionPrice: 150_000_000,
      landSec164Value: 200_000_000,
      landSec164ValueWhole: 200_000_000,
    }).splitDetail!.land;
    expect(land.transferPrice).toBe(675_000_000);
    expect(land.acquisitionBasis?.converted).toBe(450_000_000);
    expect(land.acquisitionBasis?.adopted).toBe("converted");
    expect(land.gain).toBe(675_000_000 - 450_000_000 - 6_000_000);
  });

  it("§97②2호 단서: ③ 채택 파트의 자본적지출이 ③+개산공제보다 크면 파트 swap", () => {
    const land = run({ landDirectExpenses: 700_000_000 }).splitDetail!.land;
    expect(land.acquisitionBasis?.adopted).toBe("converted");
    expect(land.swapApplied).toBe(true);
  });

  it("경계: 1985-01-01 상속은 의제취득일 전이 아니다 — ③ 없이 max(①,②)", () => {
    const land = run({ landAcquisitionDate: D("1985-01-01") }).splitDetail!.land;
    expect(land.acquisitionBasis?.converted).toBeUndefined();
    expect(land.acquisitionBasis?.adopted).toBe("sec164");
    expect(isPreDeemedLandPart("inheritance", "1984-12-31")).toBe(true);
    expect(isPreDeemedLandPart("inheritance", "1985-01-01")).toBe(false);
    expect(isPreDeemedLandPart("purchase", "1980-01-01")).toBe(false);
  });

  it("증여도 같다", () => {
    const land = run({ landAcquisitionCause: "gift", landDecedentAcquisitionDate: undefined }).splitDetail!.land;
    expect(land.acquisitionBasis?.adopted).toBe("converted");
  });

  it("표시: 3자 문장 · 근거에 §176조의2④", () => {
    const v = splitAcqBasisView(run().splitDetail!.land)!;
    expect(splitAcqBasisFormula(v)).toBe(
      "토지 취득가액 = 많은 금액(상속개시일 평가액 300,000,000, 영 §164④ 가액 350,000,000, 환산취득가액(영 §176조의2④) 612,500,000) = 612,500,000",
    );
    expect(v.legalBasis).toContain("§176조의2④");
  });
});

describe("leaf — 1985 전 토지 파트의 ③ 재료 필수 (엔진·⑫·⑧ 공용)", () => {
  it("② 지분 반영 전 값이 없으면 엔진도 던진다 — ③이 조용히 빠지지 않는다", () => {
    expect(() => run({ landSec164ValueWhole: undefined })).toThrow("landSec164ValueWhole");
  });
  it("양도시 토지 기준시가가 없으면 던진다", () => {
    expect(() => run({ landStandardPriceAtTransfer: undefined })).toThrow("양도시 토지 기준시가");
  });
  it("leaf 직접: 필드 지목", () => {
    const base = {
      isSplitable: true, hasLandAcquisitionDate: true, landAcquisitionCause: "inheritance", hasLandDecedentAcquisitionDate: true,
      landMode: "actual" as const, landAcquisitionDate: "1980-05-01", buildingAcquisitionCause: "purchase", selfOwns: "both", landSec164Value: 1,
    };
    expect(collectSplitPartCauseIssues({ ...base, hasLandStdAtTransfer: true })).toEqual([
      { field: "landSec164ValueWhole", message: LAND_PRE_DEEMED_WHOLE_REQUIRED_MESSAGE },
    ]);
    expect(collectSplitPartCauseIssues({ ...base, landSec164ValueWhole: 1, hasLandStdAtTransfer: false })).toEqual([
      { field: "landStandardPriceAtTransfer", message: LAND_PRE_DEEMED_STD_AT_TRANSFER_REQUIRED_MESSAGE },
    ]);
    // 1985 이후는 ③ 재료를 묻지 않는다
    expect(collectSplitPartCauseIssues({ ...base, landAcquisitionDate: "1988-05-01", hasLandStdAtTransfer: false })).toEqual([]);
  });
});

describe("D2 — 1985 전 건물 파트는 ③ 미비교 고지(Q-9 a)", () => {
  const d2 = (date: string) =>
    run({
      acquisitionCause: "inheritance",
      acquisitionDate: D(date),
      decedentAcquisitionDate: D("1960-01-01"),
      landAcquisitionCause: "purchase",
      landAcquisitionDate: D("2000-03-02"),
      landDecedentAcquisitionDate: undefined,
      landSec164Value: undefined,
      landSec164ValueWhole: undefined,
      buildingHouseKind: "house_individual",
      buildingSec164Value: 450_000_000,
    }).splitDetail!.building;

  it("1984 상속 건물: max(①,②) 그대로 + preDeemedUncompared · 표시에 확인 필요", () => {
    const b = d2("1984-05-01");
    expect(b.acquisitionBasis).toMatchObject({ rule: "sec163_9_2", adopted: "sec164", preDeemedUncompared: true });
    expect(b.acquisitionBasis?.converted).toBeUndefined();
    expect(splitAcqBasisFormula(splitAcqBasisView(b)!)).toContain("환산취득가액과 비교하지 않았습니다");
  });
  it("1990 상속 건물: 고지 없음", () => {
    expect(d2("1990-05-01").acquisitionBasis?.preDeemedUncompared).toBeUndefined();
  });
});
