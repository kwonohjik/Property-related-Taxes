/**
 * anchor — 건물 split 토지분 §164⑨ 1호 공익수용 특례 (계획 P6/D6 · C-06).
 *
 * 토지·건물 취득일 분리 양도(`calcSplitGain`)에서 환산 분모는 토지분·건물분이 독립이다.
 * 시행규칙 §80⑧(보상기초=토지 개별공시지가)에 따라 §164⑨1호는 **토지분 분모만** min[]로 낮춘다
 * (건물분 무변경 — 계획 D16-GB와 동형). 값은 총액(split landStdAtTransfer가 총액).
 *
 * 베이스(건물 환산 split): 양도 10억, 취득시 기준시가 총액 2억(토지 1억 = 500,000/㎡ × 200㎡),
 *   양도시 기준시가 총액 5억 → landRatio 0.5, landStdAtTransfer 2.5억·buildingStdAtTransfer 2.5억.
 *   양도가액 안분 토지 5억·건물 5억. 취득가(환산): land floor(5억×1억/2.5억)=2억, building 동.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 건물 환산 + 토지/건물 취득일 분리(split) + 수용 시나리오 */
function bldgSplit(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "building",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2023-06-01"),
    acquisitionDate: new Date("2015-06-01"),
    landAcquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: true,
    standardPriceAtTransfer: 500_000_000,
    // 양도가액 안분 근거(§166⑥ → 부가세령 §64①1호). 폐지된 취득시 비율 fallback이
    // 산출하던 값과 동일(500,000,000 × 50%)이라 기대값 불변.
    landStandardPriceAtTransfer: 250_000_000,
    buildingStandardPriceAtTransfer: 250_000_000,
    standardPriceAtAcquisition: 200_000_000,
    standardPricePerSqmAtAcquisition: 500_000,
    acquisitionArea: 200,
    transferCause: "public_expropriation",
    splitLandCompensationTotal: 150_000_000,
    splitLandCompensationBasisTotal: 200_000_000,
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("건물 split 토지분 §164⑨ 1호 (P6/D6)", () => {
  it("baseline — 특례 없이(보상필드 미입력) 토지 취득가 200,000,000·총양도차익 594,000,000", () => {
    const r = calculateTransferTax(
      bldgSplit({ splitLandCompensationTotal: undefined, splitLandCompensationBasisTotal: undefined }),
      rates,
    );
    expect(r.splitDetail?.land.acquisitionPrice).toBe(200_000_000);
    expect(r.splitDetail?.building.acquisitionPrice).toBe(200_000_000);
    expect(r.splitDetail?.land.gain).toBe(297_000_000);
    expect(r.splitDetail?.building.gain).toBe(297_000_000);
    expect(r.transferGain).toBe(594_000_000);
    expect(r.splitDetail?.splitLandExpropriationValuationDetail).toBeUndefined();
  });

  it("C-06 수용+환산 → 토지분 min[2.5억,1.5억,2억]=1.5억, 토지 취득가 333,333,333·건물 불변", () => {
    const r = calculateTransferTax(bldgSplit(), rates);
    // land: floor(5억 × 1억 / 1.5억) = 333,333,333 (환산 분모 2.5억 → 1.5억)
    expect(r.splitDetail?.land.acquisitionPrice).toBe(333_333_333);
    // building: 분모 무변경(2.5억) → 200,000,000
    expect(r.splitDetail?.building.acquisitionPrice).toBe(200_000_000);
    // landGain = 5억 − 333,333,333 − 개산공제(1억×3%=3백만) = 163,666,667
    expect(r.splitDetail?.land.gain).toBe(163_666_667);
    expect(r.splitDetail?.building.gain).toBe(297_000_000);
    expect(r.transferGain).toBe(460_666_667);
    const d = r.splitDetail?.splitLandExpropriationValuationDetail;
    expect(d?.landStdTotal).toBe(250_000_000);
    expect(d?.compensationTotal).toBe(150_000_000);
    expect(d?.compensationBasisTotal).toBe(200_000_000);
    expect(d?.chosen).toBe(150_000_000);
    expect(d?.denominator).toBe(150_000_000);
  });

  it("C-06 경계 — 보상·보상기초 둘 다 토지 기준시가 총액 초과 → chosen === 2.5억(차감 0)", () => {
    const r = calculateTransferTax(
      bldgSplit({ splitLandCompensationTotal: 300_000_000, splitLandCompensationBasisTotal: 280_000_000 }),
      rates,
    );
    // min(2.5억, 3억, 2.8억) = 2.5억 → 토지 취득가 불변 200,000,000
    expect(r.splitDetail?.land.acquisitionPrice).toBe(200_000_000);
    expect(r.splitDetail?.splitLandExpropriationValuationDetail?.chosen).toBe(250_000_000);
    expect(r.transferGain).toBe(594_000_000);
  });

  it("게이트 OFF — 수용 아님(general) → 특례 미적용", () => {
    const r = calculateTransferTax(bldgSplit({ transferCause: "general" }), rates);
    expect(r.splitDetail?.land.acquisitionPrice).toBe(200_000_000);
    expect(r.splitDetail?.splitLandExpropriationValuationDetail).toBeUndefined();
  });

  it("게이트 OFF — 양도 2009.02.03 → 미적용", () => {
    const r = calculateTransferTax(
      bldgSplit({ transferDate: new Date("2009-02-03"), acquisitionDate: new Date("2005-06-01"), landAcquisitionDate: new Date("2003-06-01") }),
      rates,
    );
    expect(r.splitDetail?.splitLandExpropriationValuationDetail).toBeUndefined();
  });

  it("비-split 건물 회귀 — per-sqm §164⑨(P3) 경로 무손상", () => {
    // landAcquisitionDate 제거 → 단건 per-sqm 경로. compensationPerSqm/Basis로 특례.
    const r = calculateTransferTax(
      bldgSplit({
        landAcquisitionDate: undefined,
        splitLandCompensationTotal: undefined,
        splitLandCompensationBasisTotal: undefined,
        standardPricePerSqmAtTransfer: 2_500_000,
        transferArea: 200,
        compensationPerSqm: 1_500_000,
        compensationBasisStdPrice: 2_000_000,
      }),
      rates,
    );
    // 단건 per-sqm 특례가 살아 있어야 한다(split detail 없음, per-sqm detail 존재).
    expect(r.splitDetail).toBeUndefined();
    expect(r.expropriationValuationDetail?.chosenPerSqm).toBe(1_500_000);
  });
});
