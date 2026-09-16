/**
 * Pre-Do anchor — 이력에서 **주식 신고서를 골라 합산**하는 진입점
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §2 G-A · §4.4 (PR-3)
 *
 * ## 제보받은 기능 본체다
 *
 * 이력 화면의 「합산」 버튼이 양도소득세에만 있었다 — `canAggregateFromHistory`가
 * `classifyLoadableTransfer`로 `taxType === "transfer"`만 통과시킨다. 주식에는 대응 leaf가
 * 아예 없었다.
 *
 * 🔒 **엔진은 건드리지 않는다.** 합산 엔진(§102② 통산 · §103① 그룹별 기본공제)은 이미
 *    완성돼 있다. 이 경로는 이력을 store 에 실어 주는 일만 한다 — 그래서 세액의 정확성이
 *    **편입의 정확성**으로 환원된다: 누구를, **어떤 순서로** 싣는가.
 */
import { describe, it, expect } from "vitest";
import {
  canStockAggregateFromHistory,
  selectStockAggregateCandidates,
  buildStockAggregateSession,
} from "@/lib/calc/stock-aggregate-entry";
import type { CalculationRecord } from "@/lib/storage/types";

function rec(o: Partial<CalculationRecord> & { id: string; inputData: Record<string, unknown> }): CalculationRecord {
  return {
    userId: "local-user",
    taxType: "stock_transfer",
    title: "주식 양도세",
    resultData: { finalTax: 1_000_000 },
    taxLawVersion: "2024",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2024-07-01T00:00:00.000Z",
    updatedAt: "2024-07-01T00:00:00.000Z",
    ...o,
  } as unknown as CalculationRecord;
}

const A = rec({ id: "a", inputData: { securityName: "삼성전자", transferDate: "2024-09-01" } });
const B = rec({ id: "b", inputData: { securityName: "SK하이닉스", transferDate: "2024-02-01" } });
const C = rec({ id: "c", inputData: { securityName: "네이버", transferDate: "2024-06-01" } });

describe("주식 이력 합산 진입점 anchor", () => {
  it("E-1 단건 주식 이력은 합산 진입이 가능하다", () => {
    expect(canStockAggregateFromHistory(A)).toBe(true);
  });

  it("E-1a 🔒 다종목 이력은 제외된다 — 이미 합산 결과라 이중 계상 위험", () => {
    const multi = rec({
      id: "m",
      inputData: { __multiStock: true, items: [{ securityName: "삼성전자", transferDate: "2024-09-01" }] },
    });
    expect(canStockAggregateFromHistory(multi)).toBe(false);
  });

  it("E-1b 다른 세목·주식평가는 제외된다", () => {
    expect(canStockAggregateFromHistory({ ...A, taxType: "transfer" } as CalculationRecord)).toBe(false);
    expect(canStockAggregateFromHistory({ ...A, taxType: "stock_valuation" } as CalculationRecord)).toBe(false);
  });

  it("E-1c 과세연도를 못 뽑으면 「같은 과세연도」 요건을 판정할 수 없어 진입시키지 않는다", () => {
    expect(canStockAggregateFromHistory(rec({ id: "x", inputData: { securityName: "종목" }, taxLawVersion: "" }))).toBe(false);
  });

  it("E-2 후보는 기준을 맨 앞에 두고, 과세연도가 다르면 **사유를 붙여 비활성**한다", () => {
    const other = rec({ id: "y", inputData: { securityName: "카카오", transferDate: "2023-05-01" } });
    const list = selectStockAggregateCandidates([A, B, other], A);
    expect(list[0].record.id).toBe("a");
    expect(list[0].isBase).toBe(true);
    expect(list.find((c) => c.record.id === "b")!.disabledReason).toBeNull();
    // 지우지 않는다 — 왜 못 고르는지 보여야 한다
    const mismatch = list.find((c) => c.record.id === "y")!;
    expect(mismatch.disabledReason).toContain("2023");
  });

  it("E-2a 다른 양도인(clientId)의 이력은 목록에 오르지 않는다", () => {
    const other = rec({ id: "z", inputData: { securityName: "카카오", transferDate: "2024-05-01" }, clientId: "client-2" });
    expect(selectStockAggregateCandidates([A, other], A).map((c) => c.record.id)).toEqual(["a"]);
  });

  it("E-3 🔴 편입 순서는 **양도일 오름차순**이다 (§103② 「먼저 양도한 자산부터」)", () => {
    const s = buildStockAggregateSession([A, B, C]);
    expect([...s.savedItems, s.formData].map((f) => f.securityName)).toEqual([
      "SK하이닉스", // 2024-02-01
      "네이버", //     2024-06-01
      "삼성전자", //   2024-09-01
    ]);
  });

  it("E-3a 마지막(양도일이 가장 늦은) 종목이 편집기에 올라간다", () => {
    const s = buildStockAggregateSession([A, B, C]);
    expect(s.formData.securityName).toBe("삼성전자");
    expect(s.savedItems).toHaveLength(2);
  });

  it("E-3b 🔴 폼은 **기본값 상수에서 시작**한다 — 직전 세션 플래그가 묻어가면 안 된다", () => {
    const s = buildStockAggregateSession([A, B]);
    // 이력에 없던 신고 축은 기본값이어야 한다(수정신고 플래그가 얹히면 세액이 달라진다)
    expect(s.formData.filingViolation).toBe("none");
    expect(s.formData.isFraudulent).toBe(false);
    for (const f of s.savedItems) {
      expect(f.filingViolation).toBe("none");
    }
  });

  it("E-3c 진입 불가 record가 섞여도 걸러낸다", () => {
    const bad = rec({ id: "bad", inputData: {}, taxLawVersion: "" });
    const s = buildStockAggregateSession([A, bad, B]);
    expect([...s.savedItems, s.formData]).toHaveLength(2);
  });

  it("E-3d 1건만 주면 빈 목록 + 그 1건이 편집기다", () => {
    const s = buildStockAggregateSession([A]);
    expect(s.savedItems).toEqual([]);
    expect(s.formData.securityName).toBe("삼성전자");
  });
});
