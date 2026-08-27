/**
 * anchor: 다종목 확정 종목 ⑧ 검증 — **불완전 종목이 조용히 계산으로 넘어가지 않는다**
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase E · A-3)
 *
 * ## V-3 실측 (2026-08-27) — 예상이 틀렸다
 *
 * 계획서는 「불완전 종목이 남으면 계산 시점 **400**」이라 적었으나, 실측하면 **400 이 아니다**:
 *   1. 확정 게이트는 **종목명·시장 2개**뿐이다(`StockTransferTaxCalculator.tsx`).
 *   2. `buildStockTransferApiBody` 가 나머지를 기본값으로 채우므로 **Zod 가 통과한다**.
 *   3. 엔진에서 `input.transferDate.getTime is not a function` 으로 **터진다** → 500.
 *
 * 사용자에게는 그냥 「계산 오류」이고 **어느 종목이 문제인지 알 길이 없다**. 종목이 5건이면
 * 하나씩 지워 보는 수밖에 없다. ⇒ 계산 전에 **종목을 지목해** 막는다.
 */

import { describe, it, expect } from "vitest";
import {
  validateFilingItems,
  validateAllSteps,
} from "@/lib/calc/stock-transfer-tax-validate";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { stockTransferAggregateInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";

/** 계산 가능한 완전한 종목 */
function complete(name: string): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: name,
    marketType: "kospi",
    priorYearEndDate: "2023-12-31",
    acquisitionDate: "2022-01-01",
    transferDate: "2024-06-01",
    shareCount: "1000",
    totalIssuedShares: "10000000",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: "110000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "10000",
    expenseMode: "actual",
    actualExpenses: "0",
    filingType: "preliminary",
    filingDate: "2024-08-31",
  };
}

/** 현행 확정 게이트(종목명 + 시장)만 통과한 종목 */
function barelyCommitted(name: string): StockTransferFormData {
  return { ...createInitialStockFormData(), securityName: name, marketType: "kospi" };
}

describe("FI-1 확정 종목 검증이 **몇 번째 종목인지 지목**한다", () => {
  it("FI-1-1: 전부 완전하면 오류 0", () => {
    expect(validateFilingItems([complete("가"), complete("나")])).toEqual([]);
  });

  it("FI-1-2: 2번째가 불완전하면 그 순번과 종목명을 메시지에 담는다", () => {
    const errors = validateFilingItems([complete("가"), barelyCommitted("불완전종목")]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("2번째");
    expect(errors[0].message).toContain("불완전종목");
  });

  it("FI-1-3: 종목명이 비어 있어도 순번으로 지목한다", () => {
    const noName = { ...barelyCommitted(""), securityName: "" };
    const errors = validateFilingItems([complete("가"), noName]);
    expect(errors[0].message).toContain("2번째");
  });

  it("FI-1-4: 여러 종목이 불완전하면 **각각** 보고한다 — 하나 고치고 다시 걸리는 일이 없다", () => {
    const errors = validateFilingItems([barelyCommitted("A"), complete("나"), barelyCommitted("C")]);
    expect(errors.some((e) => e.message.includes("1번째"))).toBe(true);
    expect(errors.some((e) => e.message.includes("3번째"))).toBe(true);
    expect(errors.some((e) => e.message.includes("2번째"))).toBe(false);
  });

  it("FI-1-5: 종목당 첫 오류만 보고한다 — 한 종목이 오류 10건을 쏟지 않는다", () => {
    const errors = validateFilingItems([barelyCommitted("A")]);
    expect(errors).toHaveLength(1);
  });
});

describe("FI-2 서버도 막는다 — ⑫ 빈 날짜가 Zod 를 통과하면 엔진이 터진다", () => {
  it("FI-2-1: 빈 양도일이 섞인 items 는 Zod 가 거부한다 (종전에는 통과 → 엔진 500)", () => {
    const body = {
      items: [
        buildStockTransferApiBody(complete("정상")),
        buildStockTransferApiBody(barelyCommitted("불완전")),
      ],
      deductionMode: "aggregate" as const,
    };
    const parsed = stockTransferAggregateInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
  });

  it("FI-2-2: 정상 items 는 그대로 통과한다 (과다 차단 방지)", () => {
    const body = {
      items: [buildStockTransferApiBody(complete("가")), buildStockTransferApiBody(complete("나"))],
      deductionMode: "aggregate" as const,
    };
    expect(stockTransferAggregateInputSchema.safeParse(body).success).toBe(true);
  });
});

describe("FI-3 단건 경로는 종전대로 validateAllSteps 가 막는다", () => {
  it("FI-3-1: 불완전 단건은 오류가 잡힌다", () => {
    expect(validateAllSteps(barelyCommitted("A")).length).toBeGreaterThan(0);
  });
});
