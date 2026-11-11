/**
 * 합산 진입 시 기납부세액 자동 채움 = 예정신고 **산출세액** (V-19 · Q-1 a)
 *
 * 계획서: docs/00-pm/stock-prelim-credit-v19.plan.md — 소득세법 §111③은 «제107조에 따른 예정신고 산출세액»을 공제하라고 한다.
 * 종전 자동값은 저장 결과의 `finalTax`(결정세액 + 가산세)라 가산세·전자신고 공제가 섞였다. 지방소득세는 원래 산출세액 기준이다.
 */
import { describe, it, expect } from "vitest";
import { buildStockAggregateSession } from "@/lib/calc/stock-aggregate-entry";
import type { CalculationRecord } from "@/lib/storage/types";

function rec(id: string, transferDate: string, filingDate: string, resultData: Record<string, unknown>): CalculationRecord {
  return {
    id,
    userId: "local-user",
    taxType: "stock_transfer",
    title: id,
    inputData: { securityName: id, marketType: "unlisted", transferDate, filingDate },
    resultData,
    createdAt: new Date("2025-01-01").toISOString(),
    updatedAt: new Date("2025-01-01").toISOString(),
  } as unknown as CalculationRecord;
}

const prior = (resultData: Record<string, unknown>) => {
  const s = buildStockAggregateSession([
    rec("a", "2024-03-01", "2024-08-31", resultData),
    rec("b", "2024-09-01", "2025-02-28", { calculatedTax: 4_000_000, finalTax: 4_000_000, localIncomeTax: 400_000 }),
  ]);
  return s.formData;
};

describe("AP-1 자동 채움은 산출세액", () => {
  it("AP-1-1 가산세가 붙은 예정신고 → 산출세액만(가산세 제외)", () => {
    const f = prior({ calculatedTax: 5_500_000, finalTax: 6_600_000, localIncomeTax: 550_000 });
    expect(f.preliminaryPaidTax).toBe("5500000");
    expect(f.preliminaryPaidLocalTax).toBe("550000");
  });
  it("AP-1-2 전자신고 공제가 반영된 예정신고 → 공제 전 산출세액", () => {
    const f = prior({ calculatedTax: 5_500_000, finalTax: 5_480_000, localIncomeTax: 550_000 });
    expect(f.preliminaryPaidTax).toBe("5500000");
  });
  it("AP-1-3 비과세 종목은 산출세액 echo가 남아 있어도 0", () => {
    const f = prior({ isExempt: true, calculatedTax: 5_500_000, finalTax: 0, localIncomeTax: 0 });
    expect(f.preliminaryPaidTax).toBe("0");
  });
});
