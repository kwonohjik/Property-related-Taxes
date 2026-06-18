import { describe, it, expect } from "vitest";
import { calcConvertibleBondGift } from "@/lib/tax-engine/gift-deemed/convertible-bond";

// ③ 3단계 전환사채 §40 풀 — 시행령 §30①2·3·4·⑤1 (주식전환 가나다·라·양도)
// §30②: ①1·④호=MIN(시가30%,1억) / ②호=1억 / ③호=0원
// §30⑤1 교부주식가액 = [(전환전평가×전환전주식)+(전환가액×증가주식)] ÷ (전환전주식+증가주식)

describe("§40①2호 가·나·다목 주식전환 (§30①2, 기준 1억)", () => {
  it("[CB-CONV-1] 교부주식가액 8333 − 전환 5000 = 3333 × 5만 = 166,650,000 (차감 0)", () => {
    const r = calcConvertibleBondGift({
      caseType: "conversion",
      bondMarketValue: 0,
      preConvPrice: 10_000,
      preConvShares: 100_000,
      conversionPrice: 5_000,
      increasedShares: 50_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(166_650_000);
  });

  it("[CB-CONV-2] 166,650,000 − 이자손실 1천만 − 기과세 2천만 = 136,650,000 (≥1억)", () => {
    const r = calcConvertibleBondGift({
      caseType: "conversion",
      bondMarketValue: 0,
      preConvPrice: 10_000,
      preConvShares: 100_000,
      conversionPrice: 5_000,
      increasedShares: 50_000,
      interestLoss: 10_000_000,
      acquisitionGainPrior: 20_000_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(136_650_000);
  });

  it("[CB-CONV-FAIL] 교부주식가액 9142 − 전환 7000 = 2142 × 4만 = 85,680,000 < 1억 → 미적용", () => {
    const r = calcConvertibleBondGift({
      caseType: "conversion",
      bondMarketValue: 0,
      preConvPrice: 10_000,
      preConvShares: 100_000,
      conversionPrice: 7_000,
      increasedShares: 40_000,
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });
});

describe("§40①2호 라목 주식전환 — 역방향·비율가중 (§30①3, 기준 0)", () => {
  it("[CB-REV] 전환 20000 − 교부주식가액 13333 = 6667 × 5만 = 3.3335억 × (특수관계 30/100) = 100,005,000", () => {
    const r = calcConvertibleBondGift({
      caseType: "conversion_reverse",
      bondMarketValue: 0,
      preConvPrice: 10_000,
      preConvShares: 100_000,
      conversionPrice: 20_000,
      increasedShares: 50_000,
      relatedPreRatio: { numer: 30, denom: 100 },
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(100_005_000);
  });
});

describe("§40①3호 양도 (§30①4, 기준 MIN(시가30%,1억))", () => {
  it("[CB-TRANSFER] 양도 6억 − 시가 5억 = 1억 ≥ MIN(1.5억,1억)=1억 → 적용", () => {
    const r = calcConvertibleBondGift({
      caseType: "transfer",
      bondMarketValue: 500_000_000,
      transferPrice: 600_000_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(100_000_000);
  });

  it("[CB-TRANSFER-FAIL] 양도 5.5억 − 시가 5억 = 5천만 < 기준 1억 → 미적용", () => {
    const r = calcConvertibleBondGift({
      caseType: "transfer",
      bondMarketValue: 500_000_000,
      transferPrice: 550_000_000,
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });
});

describe("회귀 — ①1호 인수·취득 기본 케이스 보존 (caseType 미지정 = acquisition)", () => {
  it("[CB-ACQ-1] 시가 10억 − 인수 6억 = 4억 ≥ MIN(3억,1억)=1억 → 적용", () => {
    const r = calcConvertibleBondGift({ bondMarketValue: 1_000_000_000, acquisitionPrice: 600_000_000 });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(400_000_000);
  });

  it("[CB-ACQ-2] 시가 1억 − 인수 9,500만 = 500만 < 기준 3,000만 → 미적용", () => {
    const r = calcConvertibleBondGift({ bondMarketValue: 100_000_000, acquisitionPrice: 95_000_000 });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });
});
