/**
 * Anchor — B그룹 연부연납 (M-3·M-16, 상증법 §71)
 *
 * - M-16 §71② 단서: 각 회분 분할납부세액(= finalTax/(연납기간+1))이 1천만원을 초과하도록
 *     기간을 정해야 한다. 종전 calcInstallmentPayment는 하한 미적용 → 법상 불가능한 일정 제시.
 * - M-3 §71②2호가: 조특법 §30의6 가업승계 특례 증여재산은 최대 15년(그 외 증여 5년, 2호나).
 *     종전 안내는 항상 일반 5년.
 */
import { describe, it, expect } from "vitest";
import { calcInstallmentPayment } from "@/lib/tax-engine/credits/installment-payment";

describe("M-16 §71② 단서 — 각 회분 1천만원 초과 기간 축소", () => {
  it("[M16] 결정세액 4천만: 5년이면 회분 8백만(≤1천만) → 회분>1천만 되도록 2년으로 축소", () => {
    // y=5: floor(40M/6)=6,666,666 ≤ 10M / y=3: floor(40M/4)=10,000,000 ≤ 10M(초과 아님)
    // y=2: floor(40M/3)=13,333,333 > 10M → appliedYears=2
    const r = calcInstallmentPayment({ finalTax: 40_000_000 });
    expect(r.eligible).toBe(true);
    expect(r.appliedYears).toBe(2); // 종전(하한 미적용)은 5
    expect(Math.floor(r.initialPayment)).toBeGreaterThan(10_000_000);
  });

  it("[M16] 결정세액 9천만: 5년 회분 1천5백만(>1천만) → 축소 없이 5년", () => {
    // floor(90M/6)=15,000,000 > 10M → appliedYears=5 유지
    expect(calcInstallmentPayment({ finalTax: 90_000_000 }).appliedYears).toBe(5);
  });
});

describe("M-3 §71②2호가 — §30의6 가업승계 증여 최대 15년", () => {
  it("[M3] 결정세액 3.2억·가업승계 특례 → 최대 15년 (회분 2천만>1천만)", () => {
    // floor(320M/16)=20,000,000 > 10M → appliedYears=15
    const r = calcInstallmentPayment({ finalTax: 320_000_000, giftSpecialTreatment: true });
    expect(r.appliedYears).toBe(15);
  });

  it("[M3] 동일 세액·특례 아님 → 일반 5년 (구분 확인)", () => {
    const r = calcInstallmentPayment({ finalTax: 320_000_000, giftSpecialTreatment: false });
    expect(r.appliedYears).toBe(5);
  });
});
