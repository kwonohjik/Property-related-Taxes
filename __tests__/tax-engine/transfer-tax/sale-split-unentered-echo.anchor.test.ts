/**
 * anchor — 「구분 기재 없이 안분한 양도가액」 basis 종류 echo (`saleApportionBasisKind`)
 *
 * 계획서: `docs/00-pm/sale-split-actual-both-empty.plan.md` §10 (사용자 결정 Q-1 B)
 *
 * 엔진은 토지·건물 양도가액이 **둘 다 비면** 부가령 §64①1호 서열(감정평가가액 > 기준시가)로 안분한다. 이때는 비교 대상이 없어
 * `saleSplitJudgment`가 비므로, 화면은 «엔진이 실제로 어떤 basis를 썼는가»를 알 길이 없었다. echo는 **결과 타입에만** 추가한 값이고
 * 세액·양도가액·판정에는 영향이 없다(와이어 무변경) — 구분 기재가 있으면(한쪽만·양쪽) `saleSplitJudgment`가 차고 echo는 **없다**(배타).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { allocateBundledTransferPrice } from "@/lib/tax-engine/general-building-valuation";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

/** split 주택 — 안분값(기준시가 9억:6억) 토지 9억 / 건물 6억 */
const mk = (over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2016-06-01"),
    landAcquisitionDate: new Date("2014-06-01"),
    acquisitionPrice: 0,
    landAcquisitionPrice: 400_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
    landStandardPriceAtTransfer: 900_000_000,
    buildingStandardPriceAtTransfer: 600_000_000,
    isOneHousehold: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    ...over,
  });

const APP = { landAppraisalAtTransfer: 1_000_000_000, buildingAppraisalAtTransfer: 500_000_000 };

describe("split — 엔진 echo", () => {
  it("S-1 구분 기재 없음 + 양도시 기준시가만 → std_price, 판정은 비어 있다", () => {
    const d = calculateTransferTax(mk(), rates).splitDetail!;
    expect(d.saleApportionBasisKind).toBe("std_price");
    expect(d.saleSplitJudgment).toBeUndefined();
  });

  it("S-2 구분 기재 없음 + 감정평가 양쪽 → appraisal (서열 1순위) — 안분값은 감정 비율(10:5)", () => {
    const d = calculateTransferTax(mk(APP), rates).splitDetail!;
    expect(d.saleApportionBasisKind).toBe("appraisal");
    expect(d.land.transferPrice).toBe(1_000_000_000);
  });

  it("S-3 감정평가 한쪽만 → 기준시가로 후퇴(incomplete) — echo는 엔진이 실제 쓴 basis = std_price", () => {
    const d = calculateTransferTax(mk({ landAppraisalAtTransfer: 1_000_000_000 }), rates).splitDetail!;
    expect(d.saleApportionBasisKind).toBe("std_price");
  });

  it("S-4 한쪽만 구분 기재 → 판정이 차고 echo는 없다(배타)", () => {
    const d = calculateTransferTax(mk({ landTransferPrice: 900_000_000 }), rates).splitDetail!;
    expect(d.saleSplitJudgment).toBeDefined();
    expect(d.saleApportionBasisKind).toBeUndefined();
  });

  it("S-5 양쪽 구분 기재 → 판정이 차고 echo는 없다", () => {
    const d = calculateTransferTax(mk({ landTransferPrice: 900_000_000, buildingTransferPrice: 600_000_000 }), rates).splitDetail!;
    expect(d.saleSplitJudgment).toBeDefined();
    expect(d.saleApportionBasisKind).toBeUndefined();
  });

  it("S-6 세액 불변 — echo 유무와 무관하게 구분 기재 없음 결과는 안분값 그대로(900:600)", () => {
    const r = calculateTransferTax(mk(), rates);
    expect(r.splitDetail!.land.transferPrice).toBe(900_000_000);
    expect(r.splitDetail!.building.transferPrice).toBe(600_000_000);
  });
});

describe("일반건물 — allocateBundledTransferPrice echo", () => {
  const base = {
    totalTransferPrice: 925_000_000,
    transferDate: new Date("2023-02-19"),
    landArea: 85,
    transferLandPricePerSqm: 10_830_000,
    transferBuildingStdPrice: 20_629_440,
  };

  it("G-1 구분 기재 없음 → std_price", () => {
    expect(allocateBundledTransferPrice(base).saleApportionBasisKind).toBe("std_price");
  });

  it("G-2 구분 기재 없음 + 감정평가 양쪽 → appraisal", () => {
    const out = allocateBundledTransferPrice({ ...base, landAppraisalAtTransfer: 400_000_000, buildingAppraisalAtTransfer: 525_000_000 });
    expect(out.saleApportionBasisKind).toBe("appraisal");
    expect(out.allocation.land).toBe(400_000_000);
  });

  it("G-3 한쪽만 구분 기재 → 판정이 차고 echo는 없다", () => {
    const out = allocateBundledTransferPrice({ ...base, landTransferPrice: 900_000_000 });
    expect(out.judgment).toBeDefined();
    expect(out.saleApportionBasisKind).toBeUndefined();
  });

  it("G-4 양쪽 구분 기재 → echo 없음", () => {
    const out = allocateBundledTransferPrice({ ...base, landTransferPrice: 900_000_000, buildingTransferPrice: 25_000_000 });
    expect(out.saleApportionBasisKind).toBeUndefined();
  });
});
