import { describe, it, expect } from "vitest";
import { calcPropertyServiceUseGift } from "@/lib/tax-engine/gift-deemed/property-service-use";
import { calcOrgChangeGift } from "@/lib/tax-engine/gift-deemed/org-change";
import { calcValueIncreaseGift } from "@/lib/tax-engine/gift-deemed/value-increase";
import { calcSpecificCorpGift } from "@/lib/tax-engine/gift-deemed/specific-corp";
import { calcExcessDividendGift } from "@/lib/tax-engine/gift-deemed/excess-dividend";
import { calcListingGainGift } from "@/lib/tax-engine/gift-deemed/listing-gain";
import { selectPrimaryDeemedGift } from "@/lib/tax-engine/gift-deemed/dup-exclusion";
import type { DeemedGiftResult } from "@/lib/tax-engine/gift-deemed/types";

// Phase 3 기타이익·자본거래연계·법인 — 시행령 §31의3·§32·§32의2·§32의3·§34의5

describe("§42 재산사용·용역제공 (시행령 §32)", () => {
  it("[PSU-FREE] 무상 시가상당액 5천만 ≥ 1천만 → 5천만", () => {
    const r = calcPropertyServiceUseGift({ subType: "free_use", marketValue: 50_000_000 });
    expect(r.deemedGiftValue).toBe(50_000_000);
  });
  it("[PSU-FREE-FAIL] 무상 8백만 < 1천만 → 0", () => {
    expect(calcPropertyServiceUseGift({ subType: "free_use", marketValue: 8_000_000 }).deemedGiftValue).toBe(0);
  });
  it("[PSU-LOW] 저가 시가1억−대가5천만=5천만 ≥ 시가30%(3천만) → 5천만", () => {
    const r = calcPropertyServiceUseGift({ subType: "low_price", marketValue: 100_000_000, consideration: 50_000_000 });
    expect(r.deemedGiftValue).toBe(50_000_000);
  });
  it("[PSU-LOW-FAIL] 저가 차액 2천만 < 시가30%(3천만) → 0", () => {
    expect(calcPropertyServiceUseGift({ subType: "low_price", marketValue: 100_000_000, consideration: 80_000_000 }).deemedGiftValue).toBe(0);
  });
  it("[PSU-HIGH] 고가 대가1.5억−시가1억=5천만 ≥ 시가30% → 5천만", () => {
    const r = calcPropertyServiceUseGift({ subType: "high_price", marketValue: 100_000_000, consideration: 150_000_000 });
    expect(r.deemedGiftValue).toBe(50_000_000);
  });
});

describe("§42의2 조직변경 (시행령 §32의2)", () => {
  it("[OC-SHARE] 지분증가 5천주 × 1주 10만 = 5억 ≥ 기준 3억 → 5억", () => {
    const r = calcOrgChangeGift({ subType: "share_change", baseValue: 1_000_000_000, preShares: 10_000, postShares: 15_000, postPerSharePrice: 100_000 });
    expect(r.deemedGiftValue).toBe(500_000_000);
  });
  it("[OC-VALUE] 평가액 변동 14억−10억=4억 ≥ 기준 3억 → 4억", () => {
    const r = calcOrgChangeGift({ subType: "value_change", baseValue: 1_000_000_000, preValue: 1_000_000_000, postValue: 1_400_000_000 });
    expect(r.deemedGiftValue).toBe(400_000_000);
  });
  it("[OC-FAIL] 변동 2억 < 기준 min(10억×30%,3억)=3억 → 0", () => {
    expect(calcOrgChangeGift({ subType: "value_change", baseValue: 1_000_000_000, preValue: 1_000_000_000, postValue: 1_200_000_000 }).deemedGiftValue).toBe(0);
  });
});

describe("§42의3 재산취득 후 가치증가 (시행령 §32의3)", () => {
  it("[VI-1] 20억 − 취득10억 − 통상1억 − 기여1억 = 8억 ≥ 기준 3억(min(12억×30%,3억)) → 8억", () => {
    const r = calcValueIncreaseGift({ currentValue: 2_000_000_000, acquisitionCost: 1_000_000_000, normalIncrease: 100_000_000, contribution: 100_000_000 });
    expect(r.deemedGiftValue).toBe(800_000_000);
  });
  it("[VI-FAIL] 13.5억 − 12억 차감 = 1.5억 < 기준 3억 → 0", () => {
    expect(calcValueIncreaseGift({ currentValue: 1_350_000_000, acquisitionCost: 1_000_000_000, normalIncrease: 100_000_000, contribution: 100_000_000 }).deemedGiftValue).toBe(0);
  });
});

describe("§45의5 특정법인과의 거래 (시행령 §34의5)", () => {
  it("[SC-1] (거래이익 10억 − 법인세 2억) × 지분 50% = 4억 ≥ 1억 → 4억", () => {
    const r = calcSpecificCorpGift({ transactionBenefit: 1_000_000_000, corporateTax: 200_000_000, ownershipRatio: { numer: 50, denom: 100 } });
    expect(r.deemedGiftValue).toBe(400_000_000);
  });
  it("[SC-FAIL] (3억 − 1억) × 40% = 8천만 < 1억 → 0", () => {
    expect(calcSpecificCorpGift({ transactionBenefit: 300_000_000, corporateTax: 100_000_000, ownershipRatio: { numer: 40, denom: 100 } }).deemedGiftValue).toBe(0);
  });
});

describe("§41의2 초과배당 (주주배열 기반 신모델)", () => {
  // ED-N1: 단순 2인 구성 (최대주주+특수관계인), 소득세 분리과세 직접입력
  it("[ED-N1] 최대주주(70%,0)·특수관계인(30%,1억), 분리과세소득세5천만 → 증여재산 2천만", () => {
    const r = calcExcessDividendGift({
      shareholders: [
        { id: "1", role: "major_shareholder", ownershipRatio: { numer: 70, denom: 100 }, actualDividend: 0 },
        { id: "2", role: "related_party", ownershipRatio: { numer: 30, denom: 100 }, actualDividend: 100_000_000 },
      ],
      dividendDate: new Date("2024-06-01"),
      incomeTaxMode: "separate",
      separateIncomeTax: 50_000_000,
    });
    // 초과배당금액 = 70,000,000 → deemedGiftValue = 70,000,000 - 50,000,000 = 20,000,000
    expect(r.deemedGiftValue).toBe(20_000_000);
    expect(r.applied).toBe(true);
  });
  // ED-N2: 소득세 ≥ 초과배당 → deemedGiftValue = 0 (applied=false)
  it("[ED-N2] 소득세상당액이 초과배당금액 이상 → applied=false, deemedGiftValue=0", () => {
    const r = calcExcessDividendGift({
      shareholders: [
        { id: "1", role: "major_shareholder", ownershipRatio: { numer: 60, denom: 100 }, actualDividend: 0 },
        { id: "2", role: "related_party", ownershipRatio: { numer: 40, denom: 100 }, actualDividend: 100_000_000 },
      ],
      dividendDate: new Date("2024-06-01"),
      incomeTaxMode: "separate",
      separateIncomeTax: 70_000_000, // 초과배당금액 60M 이상
    });
    // 초과배당금액=60M, 소득세=70M → deemedGiftValue=0
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
  });
});

describe("§41의3 상장 / §41의5 합병상장 이익 (시행령 §31의3·§31의5)", () => {
  it("[LG-1] (정산 5만 − 과세가 1만 − 기업가치 5천) × 2만주 = 7억 ≥ 기준 9천만 → 7억", () => {
    const r = calcListingGainGift({ settlementPerSharePrice: 50_000, perShareAcqValue: 10_000, perShareCorpGrowth: 5_000, shares: 20_000 });
    expect(r.deemedGiftValue).toBe(700_000_000);
  });
  it("[LG-MERGER] §41의5 합병상장 동일 산식 → 7억 (legalBasis §41의5)", () => {
    const r = calcListingGainGift({ eventType: "merger", settlementPerSharePrice: 50_000, perShareAcqValue: 10_000, perShareCorpGrowth: 5_000, shares: 20_000 });
    expect(r.deemedGiftValue).toBe(700_000_000);
    expect(r.legalBasis).toContain("§41의5");
  });
  it("[LG-FAIL] 1주당 이익 1천 × 2만 = 2천만 < 기준 9천만(=3억×30%) → 0", () => {
    expect(calcListingGainGift({ settlementPerSharePrice: 16_000, perShareAcqValue: 10_000, perShareCorpGrowth: 5_000, shares: 20_000 }).deemedGiftValue).toBe(0);
  });
  // §41의3④ 단서·령§31의3⑥ 환급(평가손실): 정산기준일 가액 < 당초 과세가액, 차액 ≥ 기준금액
  it("[LG-T1-DIR] 과세 케이스 direction=taxation", () => {
    const r = calcListingGainGift({ settlementPerSharePrice: 50_000, perShareAcqValue: 10_000, perShareCorpGrowth: 5_000, shares: 20_000 });
    expect(r.direction).toBe("taxation");
    expect(r.refundBase).toBe(0);
  });
  it("[LG-R1] 환급: 정산 5천 < 과세 1만, 손실 5억 ≥ 기준 3억 → refund, refundBase 5억", () => {
    const r = calcListingGainGift({ settlementPerSharePrice: 5_000, perShareAcqValue: 10_000, perShareCorpGrowth: 0, shares: 100_000 });
    expect(r.direction).toBe("refund");
    expect(r.refundBase).toBe(500_000_000);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
  });
  it("[LG-R2] 환급 미달: 손실 1억 < 기준 3억 → none", () => {
    const r = calcListingGainGift({ settlementPerSharePrice: 9_000, perShareAcqValue: 10_000, perShareCorpGrowth: 0, shares: 100_000 });
    expect(r.direction).toBe("none");
    expect(r.refundBase).toBe(0);
    expect(r.deemedGiftValue).toBe(0);
  });
  // 령§31의3⑤ 기업가치 자동계산 — 교재 사례2 (1주당 순손익합 30000 ÷ 30월 × 27월 = 27000)
  it("[CG-1] corpGrowthAuto 자동계산 → C=27000 → 증여이익 650M (사례2)", () => {
    const r = calcListingGainGift({
      settlementPerSharePrice: 50_000,
      perShareAcqValue: 10_000,
      perShareCorpGrowth: 0, // corpGrowthAuto 우선이라 무시
      shares: 50_000,
      corpGrowthAuto: {
        totalNetIncomePerShare: 30_000,
        monthsBusinessStartToListingPrevDay: 30,
        monthsAcqToSettlement: 27,
      },
    });
    expect(r.deemedGiftValue).toBe(650_000_000);
    expect(r.thresholdEcho?.threshold).toBe(300_000_000);
    expect(r.direction).toBe("taxation");
  });
  it("[CG-2] 월수 1월미만=1월 절사 가드 (분모·곱수 0 → 1)", () => {
    const r = calcListingGainGift({
      settlementPerSharePrice: 50_000,
      perShareAcqValue: 10_000,
      perShareCorpGrowth: 999, // 무시
      shares: 1,
      corpGrowthAuto: {
        totalNetIncomePerShare: 5_000,
        monthsBusinessStartToListingPrevDay: 0,
        monthsAcqToSettlement: 0,
      },
    });
    // floor(5000/1)×1 = 5000 → perShareGain = 50000−10000−5000 = 35000
    expect(r.breakdown.find((s) => s.label === "1주당 기업가치 실질증가이익")?.amount).toBe(5_000);
  });
  // §63③ 최대주주 20% 할증 (중소·중견·결손법인 배제)
  it("[MS-1] 최대주주 할증: 정산가 50000×1.2=60000 → 증여이익 900M", () => {
    const r = calcListingGainGift({
      settlementPerSharePrice: 50_000, perShareAcqValue: 10_000, perShareCorpGrowth: 5_000, shares: 20_000,
      isMajorShareholder: true,
    });
    expect(r.deemedGiftValue).toBe(900_000_000); // (60000−10000−5000)×20000
  });
  it("[MS-2] 최대주주+중소기업 배제: 할증 미적용 → 700M (LG-1 동일)", () => {
    const r = calcListingGainGift({
      settlementPerSharePrice: 50_000, perShareAcqValue: 10_000, perShareCorpGrowth: 5_000, shares: 20_000,
      isMajorShareholder: true, isSurchargeExemptEntity: true,
    });
    expect(r.deemedGiftValue).toBe(700_000_000);
  });
});

describe("§43① 중복배제 (이익 최대 1건)", () => {
  const mk = (value: number, applied: boolean): DeemedGiftResult => ({
    type: "property_service_use", applied, deemedGiftValue: value, breakdown: [], legalBasis: "test",
  });
  it("[DUP-1] 적용 후보 1억·3억 + 미적용 0 → 3억 선택", () => {
    const r = selectPrimaryDeemedGift([mk(100_000_000, true), mk(300_000_000, true), mk(0, false)]);
    expect(r?.deemedGiftValue).toBe(300_000_000);
  });
  it("[DUP-NONE] 모두 미적용 → 첫 결과 반환", () => {
    const r = selectPrimaryDeemedGift([mk(0, false), mk(0, false)]);
    expect(r?.applied).toBe(false);
  });
});
