import { describe, it, expect } from "vitest";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import type { RelatedCorpInput } from "@/lib/tax-engine/gift-deemed/types";

/**
 * §45의3 일감몰아주기 증여의제 — 교재 「2026 양도·상속·증여세」 사례4 종합 (2023 귀속 2024 신고).
 * 중소기업 A법인. 최종 증여의제이익 = 갑 20,520,000 + 을 16,200,000 = 36,720,000원.
 * (교재 표기 36.71백만은 8.33% 중간반올림차 — 엔진은 정확분수 채택)
 */
const CASE4_INPUT: RelatedCorpInput = {
  enterpriseSize: "small",
  totalSales: 20_000_000_000,
  preTaxAdjOperatingIncome: 2_500_000_000,
  taxableIncome: 1_800_000_000,
  corporateTaxNet: 340_000_000, // 산출세액 340M − 공제감면 0
  shareholders: [
    { id: "gap", name: "갑", relation: "self", directRatio: { numer: 20, denom: 100 }, isCorporate: false },
    { id: "eul", name: "을", relation: "relative", directRatio: { numer: 10, denom: 100 }, isCorporate: false },
    { id: "byeong", name: "병", relation: "other", directRatio: { numer: 25, denom: 100 }, isCorporate: false },
    { id: "corpB", name: "B법인", relation: "other", directRatio: { numer: 30, denom: 100 }, isCorporate: true },
    { id: "corpC", name: "C법인", relation: "other", directRatio: { numer: 10, denom: 100 }, isCorporate: true },
    { id: "minor", name: "기타소액주주", relation: "other", directRatio: { numer: 5, denom: 100 }, isCorporate: false },
  ],
  intermediaryCorps: [
    {
      corpShareholderId: "corpB",
      stakeInBeneficiary: { numer: 30, denom: 100 }, // B → A 30%
      owners: [
        { individualId: "gap", ratio: { numer: 30, denom: 100 } }, // 갑 → B 30%
        { individualId: "eul", ratio: { numer: 20, denom: 100 } }, // 을 → B 20%
      ],
    },
    {
      corpShareholderId: "corpC",
      stakeInBeneficiary: { numer: 10, denom: 100 }, // C → A 10%
      owners: [
        { individualId: "gap", ratio: { numer: 10, denom: 100 } }, // 갑 → C 10% (§⑱ 30%미달 → 수증자 간접 제외)
      ],
    },
  ],
  salesPartners: [
    { id: "sB", name: "B법인", salesAmount: 3_000_000_000, isRelated: true, exclusionType: "sec10_1" }, // 중소-중소
    { id: "sC", name: "C법인", salesAmount: 4_000_000_000, isRelated: false },
    {
      id: "sD",
      name: "D법인",
      salesAmount: 10_000_000_000,
      isRelated: true, // 대기업·비수출 → ⑩ 미해당. §⑭3호로 수증자별 추가
      rulingShareholderStakes: [{ shareholderId: "gap", ratio: { numer: 30, denom: 100 } }], // 갑만 D 30% 출자
    },
    { id: "sE", name: "E법인", salesAmount: 2_000_000_000, isRelated: true, exclusionType: "sec10_5" }, // 수출
    { id: "sEtc", name: "기타", salesAmount: 1_000_000_000, isRelated: false },
  ],
};

describe("§45의3 일감몰아주기 — Pre-Do 핵심 anchor (교재 사례4)", () => {
  const r = calcRelatedCorpGift(CASE4_INPUT);
  const gap = r.recipientBreakdown?.find((b) => b.recipientName === "갑");
  const eul = r.recipientBreakdown?.find((b) => b.recipientName === "을");

  it("[RC-PRETAX] 단계5 수증자별 세후영업이익 — §⑭3호 D출자분 갑만 가산", () => {
    // 공통 2,160M = 2,500M − 340M×min(2500/1800,1)=1
    // 갑: 2,160M × (1 − 8,000/20,000) = 1,296M (D 10,000×30%=3,000 추가 → 과세제외 8,000)
    // 을: 2,160M × (1 − 5,000/20,000) = 1,620M (D 미출자 → 과세제외 5,000)
    expect(gap?.pretaxProfit).toBe(1_296_000_000);
    expect(eul?.pretaxProfit).toBe(1_620_000_000);
  });

  it("[RC-LIMIT-NONNEG] 단계7 한계보유비율 간접 우선차감 — 음수 불발생·간접분 0·raw echo", () => {
    // 한계 10%를 간접에서 먼저 차감 → 간접초과 0 (직접초과만 남음)
    expect(gap?.indirectGain).toBe(0); // 간접 9 − 9 = 0
    expect(eul?.indirectGain).toBe(0); // 간접 6 − 6 = 0
    // 음수 방지: 직접초과 분자 ≥ 0
    expect(gap?.directOwnershipOver.numer).toBeGreaterThanOrEqual(0);
    expect(eul?.directOwnershipOver.numer).toBeGreaterThanOrEqual(0);
    // RC-INDIRECT-ECHO: 차감 전 recipient 간접보유 raw (C 제외 — 갑 9%·을 6%, 약분형 무관)
    expect(gap!.indirectRatioRaw.numer / gap!.indirectRatioRaw.denom).toBeCloseTo(0.09, 10);
    expect(eul!.indirectRatioRaw.numer / eul!.indirectRatioRaw.denom).toBeCloseTo(0.06, 10);
  });

  it("[RC-TOTAL] 단계8 최종 증여의제이익 — 정확분수 36,720,000", () => {
    // 갑 직접: 1,296,000,000 × (7000/12000 − 1/2) × (19/100) = 20,520,000
    // 을 직접: 1,620,000,000 × (10000/15000 − 1/2) × (6/100) = 16,200,000
    expect(gap?.directGain).toBe(20_520_000);
    expect(eul?.directGain).toBe(16_200_000);
    expect(gap?.subtotal).toBe(20_520_000);
    expect(eul?.subtotal).toBe(16_200_000);
    expect(r.deemedGiftValue).toBe(36_720_000);
  });
});
