import { describe, it, expect } from "vitest";
import { calcSpecificCorpGiftMulti } from "@/lib/tax-engine/gift-deemed/specific-corp";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

/**
 * 교재 §45의5 특정법인과의 거래 — 계산사례 1 (이월결손금으로 법인세 미부담).
 * A법인 2021년 이월결손금 20억 → 2022년 법인세 0. 2022.08.31 부친이 현금 10억 증여.
 * 주주: 부(증여자, 40%) / 직원(타인, 30%) / 장남(자, 25%) / 차남(자, 5%). 계 50,000주.
 */
describe("§45의5 특정법인과의 거래 — 계산사례 1 [SC-CASE1]", () => {
  const input = {
    transactionBenefit: 1_000_000_000, // 거래이익 10억
    // 법인세 0 (이월결손금) — corporateTaxComputed·annualIncome 미입력 → 안분 0
    shareholders: [
      { id: "1", name: "부", relation: "lineal_ascendant", shares: 20_000, totalShares: 50_000, isDonor: true, isRelated: true },
      { id: "2", name: "직원", relation: "other", shares: 15_000, totalShares: 50_000, isDonor: false, isRelated: false },
      { id: "3", name: "장남", relation: "lineal_descendant", shares: 12_500, totalShares: 50_000, isDonor: false, isRelated: true },
      { id: "4", name: "차남", relation: "lineal_descendant", shares: 2_500, totalShares: 50_000, isDonor: false, isRelated: true },
    ],
  } as unknown as SpecificCorpInput;

  const r = calcSpecificCorpGiftMulti(input);
  const m = r.specificCorpMulti!;
  const byName = (n: string) => m.donees.find((d) => d.name === n)!;

  it("법인세 0(이월결손금) → 특정법인이익 = 거래이익 전액 10억", () => {
    expect(m.corpTaxApportioned).toBe(0);
    expect(m.corpProfit).toBe(1_000_000_000);
  });

  it("주주별 — 장남만 과세(2.5억), 부=본인증여·직원=타인·차남=1억미만 제외", () => {
    expect(byName("부").isTaxable).toBe(false);
    expect(byName("부").nonTaxableReason).toBe("donor_self");
    expect(byName("직원").gain).toBe(300_000_000);
    expect(byName("직원").nonTaxableReason).toBe("non_related");
    expect(byName("장남").gain).toBe(250_000_000);
    expect(byName("장남").isTaxable).toBe(true);
    expect(byName("차남").gain).toBe(50_000_000);
    expect(byName("차남").nonTaxableReason).toBe("below_threshold");
  });

  it("deemedGiftValue = 장남 2.5억", () => {
    expect(r.deemedGiftValue).toBe(250_000_000);
    expect(r.applied).toBe(true);
  });
});

/**
 * 교재 §45의5 특정법인과의 거래 — 계산사례 2 (특정법인이 법인세를 부담한 경우).
 * ㈜하늘, 2022.5.10 주주 부친이 현금 30억 증여. 각 사업연도 소득금액 40억.
 * 법인세 산출세액 = 40억×20% − 20백만 = 780백만 (공제·감면 0).
 * 주주: 갑 60% / 부(부친·증여자) 20% / 을(동생) 3% / 병(타인) 17%. 갑·을 형제, 병 타인.
 * 증여재산공제(직계 성년) 5천만, 신고세액공제 §69 3%.
 */
describe("§45의5 특정법인과의 거래 — 계산사례 2 [SC-CASE2]", () => {
  const input = {
    transactionBenefit: 3_000_000_000, // 거래이익 30억 (§34의5④1호)
    annualIncome: 4_000_000_000, // 각사업연도 소득금액 40억 (2호나목 분모)
    corporateTaxComputed: 780_000_000, // 법인세 산출세액 (2호가목)
    corporateTaxCredit: 0,
    giftDeduction: 50_000_000, // §45의5② 한도 ㉮㉠ 증여재산공제
    shareholders: [
      { id: "1", name: "갑", relation: "lineal_descendant", shares: 60_000, totalShares: 100_000, isDonor: false, isRelated: true },
      { id: "2", name: "부", relation: "lineal_ascendant", shares: 20_000, totalShares: 100_000, isDonor: true, isRelated: true },
      { id: "3", name: "을", relation: "sibling", shares: 3_000, totalShares: 100_000, isDonor: false, isRelated: true },
      { id: "4", name: "병", relation: "other", shares: 17_000, totalShares: 100_000, isDonor: false, isRelated: false },
    ],
  } as unknown as SpecificCorpInput;

  const r = calcSpecificCorpGiftMulti(input);
  const m = r.specificCorpMulti!;
  const byName = (n: string) => m.donees.find((d) => d.name === n)!;

  it("법인세 안분 = 780백만 × 30억/40억 = 585백만, 특정법인이익 2,415백만", () => {
    expect(m.corpTaxApportioned).toBe(585_000_000);
    expect(m.corpProfit).toBe(2_415_000_000);
  });

  it("주주별 증여의제이익 + 과세제외 3종", () => {
    expect(byName("갑").gain).toBe(1_449_000_000);
    expect(byName("갑").isTaxable).toBe(true);

    expect(byName("부").gain).toBe(0); // 증여자 본인 → 0
    expect(byName("부").isTaxable).toBe(false);
    expect(byName("부").nonTaxableReason).toBe("donor_self");

    expect(byName("을").gain).toBe(72_450_000);
    expect(byName("을").isTaxable).toBe(false);
    expect(byName("을").nonTaxableReason).toBe("below_threshold"); // 1억 미만

    expect(byName("병").gain).toBe(410_550_000);
    expect(byName("병").isTaxable).toBe(false);
    expect(byName("병").nonTaxableReason).toBe("non_related"); // 타인
  });

  it("deemedGiftValue = 과세 지배주주등(갑) 합 = 1,449백만", () => {
    expect(r.deemedGiftValue).toBe(1_449_000_000);
    expect(r.applied).toBe(true);
  });

  it("§45의5② 한도 (갑) — Min(㉮ 일반, ㉯ 한도) + 신고세액공제 3% [SC-CASE2-LIMIT]", () => {
    const lc = byName("갑").limitCalc!;
    expect(lc.computedTax).toBe(399_600_000); // ㉮ (1,449백만−50백만)×40%−1.6억
    expect(lc.directGiftTax).toBe(540_000_000); // ㉠ (30억×60%−50백만)×40%−1.6억 (법인세 차감 前)
    expect(lc.corpTaxShare).toBe(351_000_000); // ㉡ 585백만×60%
    expect(lc.limitAmount).toBe(189_000_000); // ㉯ ㉠−㉡
    expect(lc.finalTax).toBe(189_000_000); // Min(㉮ 399.6백만, ㉯ 189백만)
    expect(lc.filingCredit).toBe(5_670_000); // §69 floor(189백만×3/100)
    expect(lc.selfPayTax).toBe(183_330_000); // 자진납부세액
  });
});
