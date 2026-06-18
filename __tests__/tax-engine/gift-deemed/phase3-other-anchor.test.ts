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

describe("§41의2 초과배당 (소득세상당액 직접입력)", () => {
  it("[ED-1] 초과배당 5억 − 소득세 1.5억 = 3.5억", () => {
    const r = calcExcessDividendGift({ excessDividend: 500_000_000, incomeTaxEquivalent: 150_000_000 });
    expect(r.deemedGiftValue).toBe(350_000_000);
  });
  it("[ED-FAIL] 초과배당 1억 − 소득세 1.2억 = 음수 → 0", () => {
    expect(calcExcessDividendGift({ excessDividend: 100_000_000, incomeTaxEquivalent: 120_000_000 }).deemedGiftValue).toBe(0);
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
