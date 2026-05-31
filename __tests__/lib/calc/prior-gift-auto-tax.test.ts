/**
 * autoComputePriorGiftTax — 기납부 증여세 자동계산 anchor (donee-phase2)
 *
 * 단순 1건 독립: (증여재산가액 − §53 공제) × §56 누진세율.
 * 이미지 검증: 배우자 760m → 22m / 영리법인 700m → 150m.
 */

import { describe, it, expect } from "vitest";
import { autoComputePriorGiftTax } from "@/lib/calc/prior-gift-auto-tax";

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
