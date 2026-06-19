/**
 * 신탁이익의 증여(§33) 증여시기 분리 anchor — Pre-Do
 * 법령: KoreanLaw §33·령§25·§61②·§62·칙§19의2 본문(2026-06-19).
 * 설계: docs/02-design/features/gift-trust-benefit-timing.engine.design.md
 */
import { describe, it, expect } from "vitest";
import { calcTrustBenefit } from "@/lib/tax-engine/gift-deemed/trust-benefit";
import type { TrustBenefitInput } from "@/lib/tax-engine/gift-deemed/types";
import { LIFE_EXPECTANCY_MALE_2023 } from "@/lib/tax-engine/data/life-expectancy-2023";

const base: TrustBenefitInput = {
  beneficiaryType: "same",
  trustPropertyValue: 800_000_000,
  yieldRate: { numer: 1000, denom: 10000 }, // 10%
  withholdingRate: { numer: 1540, denom: 10000 }, // 15.4%
  installments: 3,
};

const R = 67_680_000; // 세후 연수익
const pv = (n: number) => Number((BigInt(R) * 100n ** BigInt(n)) / 103n ** BigInt(n));
const pvRows = (r: { breakdown: { label: string; amount: number }[] }) =>
  r.breakdown.filter((b) => b.label.includes("회차 현재가치")).map((b) => b.amount);

describe("신탁이익 증여시기 분리 (§33·§25·§61②)", () => {
  it("[TT-A1] same → subGifts 2건(원본권 800M + 수익권 197,183,628), 합계 997,183,628", () => {
    const r = calcTrustBenefit({
      ...base,
      principalGiftDate: new Date("2026-01-03"),
      incomeGiftDate: new Date("2023-01-03"),
    });
    expect(r.deemedGiftValue).toBe(997_183_628);
    expect(r.subGifts).toHaveLength(2);
    expect(r.subGifts!.find((g) => g.right === "principal")!.value).toBe(800_000_000);
    expect(r.subGifts!.find((g) => g.right === "income")!.value).toBe(197_183_628);
  });

  it("[TT-A2] 원본·수익 증여시기 분리 보존", () => {
    const r = calcTrustBenefit({
      ...base,
      principalGiftDate: new Date("2026-01-03"),
      incomeGiftDate: new Date("2023-01-03"),
    });
    expect(r.subGifts!.find((g) => g.right === "principal")!.giftDate?.toISOString().slice(0, 10)).toBe("2026-01-03");
    expect(r.subGifts!.find((g) => g.right === "income")!.giftDate?.toISOString().slice(0, 10)).toBe("2023-01-03");
  });

  it("[TT-A3] 회차 간격 2년 → 할인 n=0,2,4 (인덱스 아님)", () => {
    const r = calcTrustBenefit({ ...base, incomeIntervalYears: 2 });
    expect(pvRows(r)).toEqual([pv(0), pv(2), pv(4)]);
  });

  it("[TT-A4] 무기정기금(perpetual) → §62 2호 20년 현가합", () => {
    const r = calcTrustBenefit({ ...base, incomeAnnuityType: "perpetual", installments: undefined });
    expect(pvRows(r)).toHaveLength(20);
  });

  it("[TT-A5] 종신 기대여명 소수 → §62 3호 floor (25.7 → 25항, ceil 아님)", () => {
    const r = calcTrustBenefit({
      ...base,
      incomeAnnuityType: "lifetime",
      expectedRemainingYears: 25.7,
      installments: undefined,
    });
    expect(pvRows(r)).toHaveLength(25);
  });

  it("[TT-A5b] 종신 성별·연령 → 2023표 기대여명 floor", () => {
    const r = calcTrustBenefit({
      ...base,
      incomeAnnuityType: "lifetime",
      beneficiaryGender: "male",
      beneficiaryAge: 60,
      installments: undefined,
    });
    expect(pvRows(r)).toHaveLength(Math.floor(LIFE_EXPECTANCY_MALE_2023[60]));
  });

  it("[TT-A6] diff_income → subGifts 수익권 1건", () => {
    const r = calcTrustBenefit({ ...base, beneficiaryType: "diff_income", incomeGiftDate: new Date("2023-01-03") });
    expect(r.subGifts).toHaveLength(1);
    expect(r.subGifts![0].right).toBe("income");
    expect(r.deemedGiftValue).toBe(197_183_628);
  });
});
