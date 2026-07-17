/**
 * Anchor — H-19 §24 ②2호 선순위 상속포기 후순위 상속 재산 종합한도 차감
 *
 * 상증법 §24(mst 276123): 공제 한도 = 상속세 과세가액 − ①1호 상속인 외 유증 − ②2호 선순위
 *   상속포기로 후순위가 받은 재산 − ③3호 사전증여(5억 초과 시). 종전 ②2호 미구현(heirWaiverAmount:0
 *   하드코딩) → 한도 과대 → 공제 과다.
 *
 * 대습상속(§27 단서 — 선순위 사망·결격으로 직계비속 대습)은 상속포기가 아니므로 §24②2호 대상 아님
 *   → 자동도출 금지, 명시 입력(heirWaiverAmount).
 */
import { describe, it, expect } from "vitest";
import { applyDeductionLimit } from "@/lib/tax-engine/deductions/inheritance-deduction-limit";

describe("H-19 §24 ②2호 heirWaiverAmount 종합한도 차감", () => {
  const RAW = 900_000_000;
  const ESTATE = 1_000_000_000;

  it("[OFF] 상속포기 후순위 재산 0 → 한도 = 과세가액 (현행 보존)", () => {
    const r = applyDeductionLimit(RAW, ESTATE, 0, {
      totalPriorGiftAmount: 0,
      heirWaiverAmount: 0,
    });
    expect(r.ceiling).toBe(1_000_000_000);
    expect(r.limitedDeduction).toBe(900_000_000); // 미capped
    expect(r.wasCapped).toBe(false);
    expect(r.ceilingDetail.heirWaiverAmount).toBe(0);
  });

  it("[ON] 상속포기 후순위 재산 2억 → 한도 = 과세가액 − 2억 = 8억 (공제 capping)", () => {
    const r = applyDeductionLimit(RAW, ESTATE, 0, {
      totalPriorGiftAmount: 0,
      heirWaiverAmount: 200_000_000,
    });
    expect(r.ceiling).toBe(800_000_000); // 10억 − 0(유증) − 2억(포기) − 0(사전증여)
    expect(r.limitedDeduction).toBe(800_000_000); // 900M raw > 800M ceiling → capped
    expect(r.wasCapped).toBe(true);
    expect(r.ceilingDetail.heirWaiverAmount).toBe(200_000_000);
  });

  it("[혼합] ①유증 1억 + ②포기 2억 + ③사전증여 3억(5억초과) 동시 차감", () => {
    const r = applyDeductionLimit(RAW, ESTATE, 0, {
      totalPriorGiftAmount: 300_000_000,
      priorGiftDeductionTotal: 0,
      legateeAmountNonHeir: 100_000_000,
      heirWaiverAmount: 200_000_000,
    });
    // 10억 − 1억 − 2억 − max(0, 3억−0) = 4억
    expect(r.ceiling).toBe(400_000_000);
    expect(r.ceilingDetail.legateeAmountNonHeir).toBe(100_000_000);
    expect(r.ceilingDetail.heirWaiverAmount).toBe(200_000_000);
  });
});
