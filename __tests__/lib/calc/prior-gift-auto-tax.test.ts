/**
 * autoComputePriorGiftTax — 기납부 증여세 자동계산 anchor (donee-phase2)
 *
 * 단순 1건 독립: (증여재산가액 − §53 공제) × §56 누진세율.
 * 이미지 검증: 배우자 760m → 22m / 영리법인 700m → 150m.
 */

import { describe, it, expect } from "vitest";
import {
  autoComputePriorGiftTax,
  applyCorporateGiftTaxFallback,
} from "@/lib/calc/prior-gift-auto-tax";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("autoComputePriorGiftTax — 단순 1건 독립 (§53 공제 + §56 세율)", () => {
  it("P1: 배우자 760m → 22,000,000 (이미지26 — 760m−600m=160m 과표)", () => {
    expect(autoComputePriorGiftTax(760_000_000, "spouse")).toBe(22_000_000);
  });

  it("P3: 영리법인(공제 0) 700m → 150,000,000 (이미지25 — 700m 과표)", () => {
    expect(autoComputePriorGiftTax(700_000_000, undefined)).toBe(150_000_000);
  });

  it("P2: 자녀(성인기준) 500m → 80,000,000 (500m−5천만=450m 과표)", () => {
    expect(autoComputePriorGiftTax(500_000_000, "lineal_descendant")).toBe(80_000_000);
  });

  it("P5: 수유자(공제 0) 300m → 50,000,000", () => {
    expect(autoComputePriorGiftTax(300_000_000, undefined)).toBe(50_000_000);
  });

  it("P6: 기타친족 300m → 48,000,000 (300m−1천만=290m 과표)", () => {
    expect(autoComputePriorGiftTax(300_000_000, "other_relative")).toBe(48_000_000);
  });

  it("P8: 기타친족 100m → 9,000,000 (100m−1천만=90m 과표)", () => {
    expect(autoComputePriorGiftTax(100_000_000, "other_relative")).toBe(9_000_000);
  });

  it("§55 단서: 과세표준 50만원 미만 → 0 (배우자 6억 이하)", () => {
    expect(autoComputePriorGiftTax(600_000_000, "spouse")).toBe(0); // 600m−600m=0
    expect(autoComputePriorGiftTax(600_400_000, "spouse")).toBe(0); // 과표 40만원 < 50만원
  });

  it("giftAmount 0 또는 음수 → 0", () => {
    expect(autoComputePriorGiftTax(0, "spouse")).toBe(0);
    expect(autoComputePriorGiftTax(-100, "spouse")).toBe(0);
  });

  it("직계존속(성인) 200m → (200m−5천만=150m 과표) 20,000,000", () => {
    expect(autoComputePriorGiftTax(200_000_000, "lineal_ascendant_adult")).toBe(20_000_000);
  });
});

describe("applyCorporateGiftTaxFallback — 진입 fallback (기존 데이터 cgct 미설정)", () => {
  function corpGift(o: Partial<PriorGift> = {}): PriorGift {
    return {
      giftDate: "2021-08-10",
      isHeir: false,
      giftAmount: 700_000_000,
      giftTaxPaid: 0,
      beneficiaryType: "corporate",
      ...o,
    };
  }

  it("corporate cgct undefined + 가액 700m → cgct 150,000,000 주입 (사용자 케이스)", () => {
    const [g] = applyCorporateGiftTaxFallback([corpGift()]);
    expect(g.corporateGiftComputedTax).toBe(150_000_000);
  });

  it("corporate cgct 0 (사용자 명시) → 존중 (덮어쓰지 않음)", () => {
    const [g] = applyCorporateGiftTaxFallback([corpGift({ corporateGiftComputedTax: 0 })]);
    expect(g.corporateGiftComputedTax).toBe(0);
  });

  it("corporate cgct >0 (이력·계산값) → 그대로 유지", () => {
    const [g] = applyCorporateGiftTaxFallback([corpGift({ corporateGiftComputedTax: 99_000_000 })]);
    expect(g.corporateGiftComputedTax).toBe(99_000_000);
  });

  it("corporate 가액 0 → fallback 안 함 (cgct undefined 유지)", () => {
    const [g] = applyCorporateGiftTaxFallback([corpGift({ giftAmount: 0 })]);
    expect(g.corporateGiftComputedTax).toBeUndefined();
  });

  it("비corporate(자연인) → 변경 안 함 (§28 위험 회피, 동일 참조)", () => {
    const natural: PriorGift = { giftDate: "2022-06-10", isHeir: true, giftAmount: 760_000_000, giftTaxPaid: 0, beneficiaryType: "heir" };
    const result = applyCorporateGiftTaxFallback([natural]);
    expect(result[0]).toBe(natural); // 동일 참조 — 미변경
    expect(result[0].giftTaxPaid).toBe(0);
  });
});
