import { describe, it, expect } from "vitest";
import {
  calcInstallmentSplit,
  isInstallmentSplitEligible,
} from "@/lib/tax-engine/credits/installment-split";

/**
 * 분납 (§70② · §66②) anchor
 * 케이스 인벤토리 CS-01~CS-13 (engine.design.md)
 * 항등식: firstPayment + secondPayment === payableTax
 */
describe("분납 §70② calcInstallmentSplit", () => {
  it("CS-01 800만 (1천만 이하) → 분납 불가", () => {
    const r = calcInstallmentSplit({
      payableTax: 8_000_000,
      applyInstallmentSplit: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.applied).toBe(false);
    expect(r.maxSplitAmount).toBe(0);
    expect(r.firstPayment).toBe(8_000_000);
    expect(r.secondPayment).toBe(0);
  });

  it("CS-02 정확히 1천만 → 불가 (초과 아님)", () => {
    const r = calcInstallmentSplit({
      payableTax: 10_000_000,
      applyInstallmentSplit: true,
    });
    expect(r.eligible).toBe(false);
    expect(isInstallmentSplitEligible(10_000_000)).toBe(false);
  });

  it("CS-03 1,000만 1원 → split 1, 1차 1,000만 (구간1 최소)", () => {
    const r = calcInstallmentSplit({
      payableTax: 10_000_001,
      applyInstallmentSplit: true,
    });
    expect(r.eligible).toBe(true);
    expect(r.applied).toBe(true);
    expect(r.maxSplitAmount).toBe(1);
    expect(r.splitAmount).toBe(1);
    expect(r.firstPayment).toBe(10_000_000);
    expect(r.secondPayment).toBe(1);
    expect(r.firstPayment + r.secondPayment).toBe(10_000_001);
  });

  it("CS-04 1,500만 → maxSplit 500만 (초과분)", () => {
    const r = calcInstallmentSplit({
      payableTax: 15_000_000,
      applyInstallmentSplit: true,
    });
    expect(r.maxSplitAmount).toBe(5_000_000);
    expect(r.splitAmount).toBe(5_000_000);
    expect(r.firstPayment).toBe(10_000_000);
    expect(r.secondPayment).toBe(5_000_000);
    expect(r.firstPayment + r.secondPayment).toBe(15_000_000);
  });

  it("CS-05 2,000만 → maxSplit 1,000만 (구간1 상단)", () => {
    const r = calcInstallmentSplit({
      payableTax: 20_000_000,
      applyInstallmentSplit: true,
    });
    expect(r.maxSplitAmount).toBe(10_000_000);
    expect(r.splitAmount).toBe(10_000_000);
    expect(r.firstPayment).toBe(10_000_000);
  });

  it("CS-06 2,000만 1원 → maxSplit 1,000만 (구간2 진입 floor)", () => {
    const r = calcInstallmentSplit({
      payableTax: 20_000_001,
      applyInstallmentSplit: true,
    });
    expect(r.maxSplitAmount).toBe(10_000_000); // floor(20,000,001 × 0.5)
    expect(r.splitAmount).toBe(10_000_000);
    expect(r.firstPayment).toBe(10_000_001);
    expect(r.firstPayment + r.secondPayment).toBe(20_000_001);
  });

  it("CS-07 5,000만 → maxSplit 2,500만 (50%)", () => {
    const r = calcInstallmentSplit({
      payableTax: 50_000_000,
      applyInstallmentSplit: true,
    });
    expect(r.maxSplitAmount).toBe(25_000_000);
    expect(r.splitAmount).toBe(25_000_000);
    expect(r.firstPayment).toBe(25_000_000);
    expect(r.firstPayment + r.secondPayment).toBe(50_000_000);
  });

  it("CS-08 5,000만 + 희망액 1,000만 → split 1,000만, 1차 4,000만", () => {
    const r = calcInstallmentSplit({
      payableTax: 50_000_000,
      applyInstallmentSplit: true,
      requestedSplitAmount: 10_000_000,
    });
    expect(r.maxSplitAmount).toBe(25_000_000);
    expect(r.splitAmount).toBe(10_000_000);
    expect(r.firstPayment).toBe(40_000_000);
    expect(r.warnings.length).toBe(0);
  });

  it("CS-09 5,000만 + 희망액 3,000만(>최대) → clamp 2,500만 + 경고", () => {
    const r = calcInstallmentSplit({
      payableTax: 50_000_000,
      applyInstallmentSplit: true,
      requestedSplitAmount: 30_000_000,
    });
    expect(r.splitAmount).toBe(25_000_000);
    expect(r.firstPayment).toBe(25_000_000);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("CS-10 5,000만 + 미신청 → eligible, !applied, 전액 1차", () => {
    const r = calcInstallmentSplit({
      payableTax: 50_000_000,
      applyInstallmentSplit: false,
    });
    expect(r.eligible).toBe(true);
    expect(r.applied).toBe(false);
    expect(r.maxSplitAmount).toBe(25_000_000);
    expect(r.splitAmount).toBe(0);
    expect(r.firstPayment).toBe(50_000_000);
  });

  it("CS-11 5,000만 + §71 연부연납 허가 → 분납 불가 + 경고", () => {
    const r = calcInstallmentSplit({
      payableTax: 50_000_000,
      applyInstallmentSplit: true,
      applyLongTermInstallment: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.applied).toBe(false);
    expect(r.splitAmount).toBe(0);
    expect(r.firstPayment).toBe(50_000_000);
    expect(r.warnings.some((w) => w.includes("연부연납"))).toBe(true);
  });

  it("CS-13 1억 1원 → floor(×0.5)=5,000만, 1차 50,000,001 (항등식)", () => {
    const r = calcInstallmentSplit({
      payableTax: 100_000_001,
      applyInstallmentSplit: true,
    });
    expect(r.maxSplitAmount).toBe(50_000_000);
    expect(r.splitAmount).toBe(50_000_000);
    expect(r.firstPayment).toBe(50_000_001);
    expect(r.firstPayment + r.secondPayment).toBe(100_000_001);
  });
});
