/**
 * §45의5 특정법인 — single(지분율 직접) 모드의 법인세 «자동안분» anchor.
 *
 * 리뷰 IG-001(c03-1): UI가 single 모드에서도 「법인세 자동안분」을 고를 수 있는데
 * ④API가 3필드를 roster 분기에서만 전달했고, 엔진 single 분기도 안분을 하지 않아
 * 법인세 상당액이 항상 0 → 증여의제이익이 과대 산출됐다.
 *
 * 상증령 §34의5④2호 안분 = (산출세액 − 공제감면) × min(거래이익, 소득금액) ÷ 소득금액.
 * 이 식은 **법인 단위**라 주주 명부와 무관하다 → single·roster 공용 leaf.
 */
import { describe, it, expect } from "vitest";
import {
  calcSpecificCorpGift,
  calcSpecificCorpGiftMulti,
  apportionCorporateTax,
} from "@/lib/tax-engine/gift-deemed/specific-corp";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";

/** 거래이익 5억 · 산출세액 2억 · 공제감면 0 · 소득금액 10억 → 안분 1억 */
const AUTO_BASE = {
  type: "specific_corp",
  transactionBenefit: 500_000_000,
  annualIncome: 1_000_000_000,
  corporateTaxComputed: 200_000_000,
} as const;

describe("§34의5④2호 법인세 안분 leaf", () => {
  it("A-1 · (산출세액 − 공제감면) × min(거래이익, 소득금액) ÷ 소득금액", () => {
    // 2억 × min(5억, 10억) / 10억 = 2억 × 0.5 = 1억
    expect(apportionCorporateTax(AUTO_BASE as SpecificCorpInput)).toBe(100_000_000);
  });

  it("A-2 · 거래이익 > 소득금액이면 비율 1 상한(min)", () => {
    const input = {
      ...AUTO_BASE,
      transactionBenefit: 2_000_000_000,
    } as SpecificCorpInput;
    // 2억 × min(20억, 10억) / 10억 = 2억 × 1 = 2억 (비율이 2로 튀지 않는다)
    expect(apportionCorporateTax(input)).toBe(200_000_000);
  });

  it("A-3 · 소득금액 0(이월결손금)이면 직접입력 corporateTax fallback", () => {
    const input = {
      type: "specific_corp",
      transactionBenefit: 500_000_000,
      annualIncome: 0,
      corporateTax: 33_000_000,
    } as SpecificCorpInput;
    expect(apportionCorporateTax(input)).toBe(33_000_000);
  });

  it("A-4 · 공제감면이 산출세액을 넘어도 음수가 되지 않는다", () => {
    const input = {
      ...AUTO_BASE,
      corporateTaxCredit: 300_000_000,
    } as SpecificCorpInput;
    expect(apportionCorporateTax(input)).toBe(0);
  });
});

describe("single 모드 — 지분율 직접 + 법인세 자동안분", () => {
  /** 지분율 50% */
  const RATIO = { numer: 5_000, denom: 10_000 };

  it("S-1 · corporateTax 미전달 시 안분값을 쓴다 (종전엔 0이라 과대 산출)", () => {
    const res = calcSpecificCorpGift({
      ...AUTO_BASE,
      ownershipRatio: RATIO,
    } as SpecificCorpInput);

    // 특정법인의 이익 = 5억 − 1억(안분) = 4억 → × 50% = 2억
    expect(res.deemedGiftValue).toBe(200_000_000);
    expect(res.applied).toBe(true);

    const corpTaxStep = res.breakdown.find((s) => s.label === "법인세 상당액");
    expect(corpTaxStep?.amount).toBe(100_000_000);
  });

  it("S-2 · 🔴 안분이 죽으면(법인세 0) 5천만원 과대 — 구별력 확인", () => {
    // 안분 미적용 시나리오를 직접 만들어 결과가 «달라지는지» 확인한다.
    // 이 단언이 S-1과 같은 값이면 anchor가 구별력을 잃은 것이다.
    const broken = calcSpecificCorpGift({
      type: "specific_corp",
      transactionBenefit: 500_000_000,
      corporateTax: 0,
      ownershipRatio: RATIO,
    } as SpecificCorpInput);

    expect(broken.deemedGiftValue).toBe(250_000_000);
    expect(broken.deemedGiftValue - 200_000_000).toBe(50_000_000);
  });

  it("S-3 · 직접입력(corporateTax)이 있으면 그 값이 우선한다", () => {
    const res = calcSpecificCorpGift({
      ...AUTO_BASE,
      corporateTax: 40_000_000,
      ownershipRatio: RATIO,
    } as SpecificCorpInput);

    // 5억 − 4천만 = 4.6억 × 50% = 2.3억 (안분 1억이 아니라 직접입력 4천만이 쓰인다)
    expect(res.deemedGiftValue).toBe(230_000_000);
  });

  it("S-4 · §34의5⑤ 1억 미만이면 미적용 (안분 반영 후 판정)", () => {
    const res = calcSpecificCorpGift({
      ...AUTO_BASE,
      ownershipRatio: { numer: 100, denom: 10_000 }, // 1%
    } as SpecificCorpInput);

    // 4억 × 1% = 400만 < 1억
    expect(res.applied).toBe(false);
    expect(res.deemedGiftValue).toBe(0);
  });
});

describe("roster 모드 회귀 — 공용 leaf 치환 후에도 동일", () => {
  it("R-1 · 주주 2인 균등 50%씩 — 안분 1억 반영", () => {
    const res = calcSpecificCorpGiftMulti({
      ...AUTO_BASE,
      shareholders: [
        { id: "a", name: "갑", relation: "spouse", shares: 50, totalShares: 100, isRelated: true, isDonor: false },
        { id: "b", name: "을", relation: "child", shares: 50, totalShares: 100, isRelated: true, isDonor: false },
      ],
    } as SpecificCorpInput);

    // roster breakdown은 「법인세 상당액」 행을 따로 두지 않고 차감 후 이익만 싣는다.
    // 특정법인의 이익 = 5억 − 1억(안분) = 4억 → 안분이 죽으면 5억이 된다(구별력 있음).
    const profitStep = res.breakdown.find((s) =>
      s.label.startsWith("특정법인의 이익"),
    );
    expect(profitStep?.amount).toBe(400_000_000);
    expect(res.applied).toBe(true);
  });
});
