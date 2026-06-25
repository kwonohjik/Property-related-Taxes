/**
 * §40 전환사채등 주식전환 이익의 증여 — 교재 4개 계산사례 anchor (실무해설 제2장)
 * 사례1 ①저가취득 120,000,000 / 사례2 ②신주인수권증권 균등초과 700,000,000
 * 사례3 ④취득후전환 380,983,600 / 사례4 ⑤초과인수전환 526,264,550
 * 산식·중간값 검증: docs/00-pm/gift-convertible-bond-40.plan.md §1.2
 */
import { describe, it, expect } from "vitest";
import { calcConvertibleBondGift } from "@/lib/tax-engine/gift-deemed/convertible-bond";

describe("§40 전환사채 — 교재 계산사례 anchor", () => {
  it("사례1 ① 특수관계인 저가취득 → 120,000,000", () => {
    const r = calcConvertibleBondGift({
      caseType: "acquisition",
      bondMarketValue: 1_030_000_000,
      acquisitionPrice: 910_000_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(120_000_000);
  });

  it("사례2 ② 신주인수권증권 균등초과(초과분 70% 반영 시가·인수가) → 700,000,000", () => {
    const r = calcConvertibleBondGift({
      caseType: "acquisition",
      bondMarketValue: 1_050_000_000,
      acquisitionPrice: 350_000_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(700_000_000);
  });

  it("사례3 ④ 특수관계인 취득후 전환 (상장 Min(9500,8333)=8333) → 380,983,600", () => {
    const r = calcConvertibleBondGift({
      caseType: "conversion",
      bondMarketValue: 0,
      preConvPrice: 9_000,
      preConvShares: 1_000_000,
      conversionPrice: 5_000,
      increasedShares: 200_000,
      isListed: true,
      listedMarketAvg: 9_500,
      interestLoss: 165_616_400,
      acquisitionGainPrior: 120_000_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(380_983_600);
  });

  it("사례4 ⑤ 초과인수 주주 전환 (㉡6,750·교부 700,000 분리) → 526,264,550", () => {
    const r = calcConvertibleBondGift({
      caseType: "conversion",
      bondMarketValue: 0,
      preConvPrice: 8_500,
      preConvShares: 1_000_000,
      conversionPrice: 5_000,
      increasedShares: 1_000_000,
      creditedShares: 700_000,
      isListed: true,
      listedMarketAvg: 8_200,
      interestLoss: 698_735_450,
      acquisitionGainPrior: 0,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(526_264_550);
  });
});

describe("§40 전환사채 — 분기·경계 anchor", () => {
  it("CB-ACQ-2 ① 임계미달(500만 < min(3천만,1억)) → 미적용", () => {
    const r = calcConvertibleBondGift({ caseType: "acquisition", bondMarketValue: 100_000_000, acquisitionPrice: 95_000_000 });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("CB-CONV-FAIL ④ net 66,660,000 < 1억 → 미적용", () => {
    const r = calcConvertibleBondGift({ caseType: "conversion", bondMarketValue: 0, preConvPrice: 9_000, preConvShares: 1_000_000, conversionPrice: 5_000, increasedShares: 20_000 });
    expect(r.applied).toBe(false);
  });

  it("CB-TRANSFER ⑧ 고가양도(6억−5억=1억≥min(1.5억,1억)) → 100,000,000", () => {
    const r = calcConvertibleBondGift({ caseType: "transfer", bondMarketValue: 500_000_000, transferPrice: 600_000_000 });
    expect(r.deemedGiftValue).toBe(100_000_000);
  });

  it("CB-TRANSFER-FAIL ⑧ 5천만<1억 → 미적용", () => {
    const r = calcConvertibleBondGift({ caseType: "transfer", bondMarketValue: 500_000_000, transferPrice: 550_000_000 });
    expect(r.applied).toBe(false);
  });

  it("CB-CONV-MIN 상장 ㉠ 8,000 < ㉡ 8,333 → 교부=Min=8,000 → 600,000,000", () => {
    const r = calcConvertibleBondGift({ caseType: "conversion", bondMarketValue: 0, preConvPrice: 9_000, preConvShares: 1_000_000, conversionPrice: 5_000, increasedShares: 200_000, isListed: true, listedMarketAvg: 8_000 });
    expect(r.deemedGiftValue).toBe(600_000_000); // (8000−5000)×200,000
  });

  it("CB-REV ⑦ 라목 (전환20,000−교부13,333)×50,000×30% → 100,005,000", () => {
    const r = calcConvertibleBondGift({ caseType: "conversion_reverse", bondMarketValue: 0, preConvPrice: 13_000, preConvShares: 1_000_000, conversionPrice: 20_000, increasedShares: 50_000, relatedPreRatio: { numer: 30, denom: 100 } });
    expect(r.deemedGiftValue).toBe(100_005_000);
  });

  it("CB-CONV-3RD ⑥ 제3자(creditedShares 미입력=전부 200,000) → 사례3과 동일 380,983,600", () => {
    const r = calcConvertibleBondGift({ caseType: "conversion", bondMarketValue: 0, preConvPrice: 9_000, preConvShares: 1_000_000, conversionPrice: 5_000, increasedShares: 200_000, isListed: true, listedMarketAvg: 9_500, interestLoss: 165_616_400, acquisitionGainPrior: 120_000_000 });
    expect(r.deemedGiftValue).toBe(380_983_600);
  });

  it("양도 cap §30①2 단서 — net 380,983,600 > 양도차익 200,000,000 → cap 200,000,000", () => {
    const r = calcConvertibleBondGift({ caseType: "conversion", bondMarketValue: 0, preConvPrice: 9_000, preConvShares: 1_000_000, conversionPrice: 5_000, increasedShares: 200_000, isListed: true, listedMarketAvg: 9_500, interestLoss: 165_616_400, acquisitionGainPrior: 120_000_000, bondTransferGainForCap: 200_000_000 });
    expect(r.deemedGiftValue).toBe(200_000_000);
  });

  it("echo: 합산배제 ①=false / ④=true · 연대납부 면제 §40 전체 true", () => {
    const acq = calcConvertibleBondGift({ caseType: "acquisition", bondMarketValue: 1_030_000_000, acquisitionPrice: 910_000_000 });
    expect(acq.aggregationExcluded).toBe(false);
    expect(acq.donorJointLiabilityExempt).toBe(true);
    const conv = calcConvertibleBondGift({ caseType: "conversion", bondMarketValue: 0, preConvPrice: 9_000, preConvShares: 1_000_000, conversionPrice: 5_000, increasedShares: 200_000, interestLoss: 165_616_400, acquisitionGainPrior: 120_000_000 });
    expect(conv.aggregationExcluded).toBe(true);
    expect(conv.donorJointLiabilityExempt).toBe(true);
  });
});

