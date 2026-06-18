import { describe, it, expect } from "vitest";
import { calcAcquisitionFundPresumption } from "@/lib/tax-engine/gift-deemed/acquisition-fund-presumption";
import { calcNomineeTrustGift } from "@/lib/tax-engine/gift-deemed/nominee-trust";

// Phase 3 추정·의제 — §45 재산취득자금 증여추정 / §45의2 명의신탁 증여의제
// §45 기준금액 = MIN(취득재산가액 × 20%, 2억). 미입증액 < 기준금액 → 제외.
describe("§45 재산취득자금 증여추정 (시행령 §34①)", () => {
  it("[AF-1] 취득 10억 − 입증 6억 = 미입증 4억 ≥ 기준 2억 → 4억", () => {
    const r = calcAcquisitionFundPresumption({ subType: "acquisition", acquisitionValue: 1_000_000_000, provenAmount: 600_000_000 });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(400_000_000);
  });

  it("[AF-2] 취득 10억 − 입증 8.5억 = 미입증 1.5억 < 기준 2억 → 제외", () => {
    const r = calcAcquisitionFundPresumption({ subType: "acquisition", acquisitionValue: 1_000_000_000, provenAmount: 850_000_000 });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[AF-3] 취득 5억 − 입증 4.5억 = 미입증 5천만 < 기준 1억(=5억×20%) → 제외", () => {
    const r = calcAcquisitionFundPresumption({ subType: "acquisition", acquisitionValue: 500_000_000, provenAmount: 450_000_000 });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[AF-4] 취득 5억 − 입증 3억 = 미입증 2억 ≥ 기준 1억(=5억×20%) → 2억", () => {
    const r = calcAcquisitionFundPresumption({ subType: "acquisition", acquisitionValue: 500_000_000, provenAmount: 300_000_000 });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(200_000_000);
  });

  it("[AF-5] 채무상환 3억 − 입증 1억 = 미입증 2억 ≥ 기준 6천만(=3억×20%) → 2억", () => {
    const r = calcAcquisitionFundPresumption({ subType: "debt_repayment", acquisitionValue: 300_000_000, provenAmount: 100_000_000 });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(200_000_000);
  });
});

describe("§45의2 명의신탁 증여의제", () => {
  it("[NT-1] 재산 5억 · 조세회피목적 추정 → 5억 전액", () => {
    const r = calcNomineeTrustGift({ propertyValue: 500_000_000, hasTaxAvoidancePurpose: true });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(500_000_000);
  });

  it("[NT-2] 조세회피목적 없음(§45의2①1호) → 제외", () => {
    const r = calcNomineeTrustGift({ propertyValue: 500_000_000, hasTaxAvoidancePurpose: false });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[NT-3] 신탁등기·비거주자 법정대리인 등 배제 → 제외", () => {
    const r = calcNomineeTrustGift({ propertyValue: 500_000_000, hasTaxAvoidancePurpose: true, isExcluded: true });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });
});
