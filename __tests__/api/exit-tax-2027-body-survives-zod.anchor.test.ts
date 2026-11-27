/**
 * 국외전출세 2027.1.1. 개정 — ④가 싣는 새 키가 ⑫ Zod를 **침묵 stripping 없이** 통과한다 (⑫ 키 커버리지)
 *
 * Zod `z.object`는 스키마에 없는 키를 조용히 버린다 — TypeScript는 이를 감지하지 못한다. 화면이 싣는 모든 키가
 * `exitTaxInputSchema.parse` 결과에 그대로 남는지 본다(⑭ 매핑은 `exit-tax-2027-key-coverage.anchor.test.ts`가 따로 지킨다).
 */
import { describe, it, expect } from "vitest";
import { buildExitTaxApiBody } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import { exitTaxInputSchema } from "@/lib/api/stock-transfer-exit-tax-schema";
import { exitForm, F1, H1 } from "../_helpers/exit-tax-2027-form";

function parsed(over: Parameters<typeof exitForm>[0]) {
  const body = buildExitTaxApiBody(exitForm(over));
  const r = exitTaxInputSchema.safeParse(body);
  expect(r.success, JSON.stringify(r.success ? "" : r.error.issues)).toBe(true);
  return { body, out: r.success ? (r.data as Record<string, unknown>) : {} };
}

describe("④ body → ⑫ Zod: 새 키가 버려지지 않는다", () => {
  it("국외 행(외화) — 종목 키 전부 보존", () => {
    const { body, out } = parsed({ etHoldings: [F1({ isListedForeignCorp: false, isSmallMediumEnterprise: true })] });
    const sent = (body.holdings as Record<string, unknown>[])[0];
    const kept = (out.holdings as Record<string, unknown>[])[0];
    for (const k of Object.keys(sent)) expect(kept, `holdings[0].${k}`).toHaveProperty(k);
    expect(kept.isSmallMediumEnterprise).toBe(true);
    expect(kept.departureExchangeRate).toBe(1400);
  });

  it("외국인근로자 가족 — 최상위 키 전부 보존", () => {
    const { body, out } = parsed({
      etForeignWorkerStatus: "foreign_worker_family",
      etForeignWorkerIsOfficerOrEmployee: true,
      etForeignWorkerIsNotDailyWorker: true,
      etForeignWorkerDomesticRatio80: true,
      etForeignWorkerDeparted6Months: true,
      etForeignWorkerFamilyKind: "spouse",
      etForeignWorkerStartDate: "2024-01-01",
    });
    for (const k of ["foreignWorkerStatus", "foreignWorkerChecks", "foreignWorkerFamilyKind", "foreignWorkerStartDate"]) {
      expect(body, `body.${k}`).toHaveProperty(k);
      expect(out, `parsed.${k}`).toHaveProperty(k);
    }
    expect(out.foreignWorkerChecks).toEqual(body.foreignWorkerChecks);
  });

  it("기본공제 배분 — 보존", () => {
    const { body, out } = parsed({
      etHoldings: [H1(), F1()],
      etBasicDeductionAllocClause1: "2,500,000",
      etBasicDeductionAllocClause2b: "0",
    });
    expect(body.basicDeductionAllocation).toEqual({ clause1: 2_500_000, clause2b: 0 });
    expect(out.basicDeductionAllocation).toEqual({ clause1: 2_500_000, clause2b: 0 });
  });
});
