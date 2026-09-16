/**
 * Pre-Do anchor — 「합산 결과가 저장되지 않은」 레거시 이력 판별
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §4.5 · §3 M-3 (PR-1)
 *
 * ## 이 술어는 **전부를 잡지 못한다** — 그것이 설계다
 *
 * 착수 전 실측(M-3)에서 단건 결과와 합산 per-item 결과를 전 필드 diff했다. 저장된 종목이
 * 기본공제를 온전히 받고 차손 통산도 없었다면 **바이트 단위로 동일**해(키 53 = 53, diff `{}`)
 * 판별이 **원리적으로 불가능**하다. 그래서 확실히 잡히는 두 신호만 본다:
 *
 *   ① `lossOffset*` echo 키 존재 — 합산 경로에서만 실린다(값이 0이어도 키가 붙는다)
 *   ② 주식 그룹인데 소득이 있는데 기본공제가 0 — 단건에는 주식 그룹 기소진 입력 축이 없다
 *
 * 🔑 **음성 대조(P-3·P-4)가 없으면 이 anchor는 구별력이 0이다** —
 *    `feedback_negative_anchor_needs_positive_twin`의 역방향.
 */
import { describe, it, expect } from "vitest";
import { isLegacyStockAggregateSuspect } from "@/lib/calc/stock-legacy-aggregate-suspect";
import type { CalculationRecord } from "@/lib/storage/types";

function rec(resultData: Record<string, unknown>, inputData: Record<string, unknown> = { securityName: "삼성전자" }): CalculationRecord {
  return {
    id: "r1",
    userId: "local-user",
    taxType: "stock_transfer",
    title: "주식 양도세 — 삼성전자",
    inputData,
    resultData,
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
  } as unknown as CalculationRecord;
}

/** 정상 단건 결과 — 기본공제를 온전히 받았다 */
const HEALTHY = {
  basicDeductionGroup: "stock",
  isExempt: false,
  transferIncome: 30_000_000,
  basicDeduction: 2_500_000,
  finalTax: 5_500_000,
};

describe("레거시 합산 잔재 판별 anchor", () => {
  it("P-1 lossOffset echo 키가 있으면 합산 잔재다 (값이 0이어도)", () => {
    expect(isLegacyStockAggregateSuspect(rec({ ...HEALTHY, lossOffsetFromSameGroup: 0 }))).toBe(true);
    expect(isLegacyStockAggregateSuspect(rec({ ...HEALTHY, lossOffsetFromOtherGroup: 3_000_000 }))).toBe(true);
  });

  it("P-2 주식 그룹인데 소득이 있는데 기본공제가 0이면 합산 잔재다", () => {
    expect(isLegacyStockAggregateSuspect(rec({ ...HEALTHY, basicDeduction: 0 }))).toBe(true);
  });

  it("P-3 🔑 정상 단건에는 붙지 않는다 (음성 대조)", () => {
    expect(isLegacyStockAggregateSuspect(rec(HEALTHY))).toBe(false);
  });

  it("P-3a 비과세·무소득은 기본공제가 0이어도 잔재가 아니다", () => {
    expect(isLegacyStockAggregateSuspect(rec({ ...HEALTHY, isExempt: true, basicDeduction: 0 }))).toBe(false);
    expect(isLegacyStockAggregateSuspect(rec({ ...HEALTHY, transferIncome: 0, basicDeduction: 0 }))).toBe(false);
    expect(isLegacyStockAggregateSuspect(rec({ ...HEALTHY, transferIncome: -1_000_000, basicDeduction: 0 }))).toBe(false);
  });

  it("P-3b 기타자산 그룹은 §103①1호 기소진 선언으로 0이 될 수 있어 잔재로 보지 않는다", () => {
    expect(
      isLegacyStockAggregateSuspect(rec({ ...HEALTHY, basicDeductionGroup: "real_estate_and_other_asset", basicDeduction: 0 })),
    ).toBe(false);
  });

  it("P-4 🔑 새 규약(__multiStock)으로 저장된 이력은 잔재가 아니다", () => {
    expect(
      isLegacyStockAggregateSuspect(
        rec({ totalFinalTax: 3_500_000 }, { __multiStock: true, items: [{ securityName: "삼성전자" }] }),
      ),
    ).toBe(false);
  });

  it("P-5 다른 세목 이력에는 절대 붙지 않는다", () => {
    const r = rec(HEALTHY);
    expect(isLegacyStockAggregateSuspect({ ...r, taxType: "transfer" } as CalculationRecord)).toBe(false);
    expect(isLegacyStockAggregateSuspect({ ...r, taxType: "stock_valuation" } as CalculationRecord)).toBe(false);
  });

  it("P-6 resultData가 비어도 터지지 않는다", () => {
    expect(isLegacyStockAggregateSuspect(rec({}))).toBe(false);
    expect(isLegacyStockAggregateSuspect({ ...rec({}), resultData: null } as unknown as CalculationRecord)).toBe(false);
  });
});
