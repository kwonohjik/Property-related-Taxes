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

  // per_share 모드 — 유상증자 신주 명의신탁 (교재 이미지 28·29, 조심2012중3707·2019서2129)
  // 증여재산가액 = 명의개서일 §63 평가 1주당 가액 × 명의신탁 신주수 (인수가·권리락 아님)
  it("[NT-CAP] 유상증자 신주: 1주당 15,000 × 18,375주 = 275,625,000", () => {
    const r = calcNomineeTrustGift({
      valuationMode: "per_share",
      perSharePrice: 15_000,
      nomineeShares: 18_375,
      hasTaxAvoidancePurpose: true,
      subscriptionPrice: 5_000,
      theoreticalExRightsPrice: 13_000,
      preIncreasePerShare: 20_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(275_625_000);
    expect(r.nomineeCapitalIncrease?.perSharePrice).toBe(15_000);
    expect(r.nomineeCapitalIncrease?.nomineeShares).toBe(18_375);
    expect(r.nomineeCapitalIncrease?.subscriptionPrice).toBe(5_000);
    expect(r.nomineeCapitalIncrease?.theoreticalExRightsPrice).toBe(13_000);
    expect(r.nomineeCapitalIncrease?.preIncreasePerShare).toBe(20_000);
  });

  it("[NT-CAP-NOAVOID] per_share + 조세회피목적 없음 → 제외", () => {
    const r = calcNomineeTrustGift({ valuationMode: "per_share", perSharePrice: 15_000, nomineeShares: 18_375, hasTaxAvoidancePurpose: false });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[NT-CAP-EXCLUDED] per_share + 배제사유 → 제외", () => {
    const r = calcNomineeTrustGift({ valuationMode: "per_share", perSharePrice: 15_000, nomineeShares: 18_375, hasTaxAvoidancePurpose: true, isExcluded: true });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[NT-OVERFLOW] per_share 대형 정수 정확: 3,000,000 × 5,000,000 = 15,000,000,000,000", () => {
    const r = calcNomineeTrustGift({ valuationMode: "per_share", perSharePrice: 3_000_000, nomineeShares: 5_000_000, hasTaxAvoidancePurpose: true });
    expect(r.deemedGiftValue).toBe(15_000_000_000_000);
  });

  it("[NT-NOTE] per_share 평가원칙 note — §60·§63·신주인수가액·이론적 권리락·§4의2·§47 포함", () => {
    const r = calcNomineeTrustGift({ valuationMode: "per_share", perSharePrice: 15_000, nomineeShares: 18_375, hasTaxAvoidancePurpose: true });
    const notes = r.breakdown.map((s) => `${s.label} ${s.note ?? ""} ${s.lawRef ?? ""}`).join(" | ");
    expect(notes).toContain("§60");
    expect(notes).toContain("§63");
    expect(notes).toContain("신주인수가액");
    expect(notes).toContain("이론적 권리락");
    expect(notes).toContain("§4의2");
    expect(notes).toContain("§47");
  });
});
