/**
 * anchor: 다건 자산별 장특 보유/거주 분리가 **그 자산 자신의** 거주 개월수를 쓴다 (UI 리뷰 보통 #19).
 *
 * 종전 `splitForAsset`은 취득일·양도일만 자산별로 갈라 받고, 거주 개월수는 대표 자산에서
 * 한 번 계산한 값을 **모든 자산에 그대로** 적용했다.
 *
 * ⇒ 1번이 거주 24개월 이상 고가주택이고 2번이 토지·상가면 명세서의 「거주 기간분 장특」
 *   자산별 행에 **거주 사실이 없는 토지에도 거주분이 배정**됐고, 반대 배치에서는 실제
 *   거주한 자산의 거주분이 0으로 눌렸다.
 */
import { describe, it, expect } from "vitest";
import { setLongTermDeductionItems } from "@/components/calc/results/transfer/DetailedStatementLthdItems";
import type { StatementItem } from "@/components/calc/results/transfer/DetailedStatementConfig";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

const prop = (id: string, label: string, lthd: number): PerPropertyBreakdown =>
  ({ propertyId: id, propertyLabel: label, longTermHoldingDeduction: lthd }) as PerPropertyBreakdown;

/** 표2가 적용된 다건 결과 — 자산 1은 고가주택(거주 30개월), 자산 2는 토지(거주 0). */
function run(residenceMonths: Record<string, number>) {
  const items = new Map<string, StatementItem>();
  const result = {
    longTermHoldingDeduction: 300_000_000,
    longTermHoldingRate: 0.4,
    steps: [{ label: "장기보유특별공제 (표2)", formula: "표2", amount: 300_000_000 }],
  } as unknown as TransferTaxResult;
  setLongTermDeductionItems(items, {
    result,
    isAggregate: true,
    properties: [prop("p1", "자산 1 (고가주택)", 200_000_000), prop("p2", "자산 2 (토지)", 100_000_000)],
    primary: undefined,
    transferDate: "2024-06-01",
    residenceMs: residenceMonths.p1,
    residenceMsOf: (pid) => residenceMonths[pid] ?? 0,
    acqDateOf: () => "2004-06-01",
    transferDateOf: () => "2024-06-01",
  });
  return items;
}

const valuesOf = (items: Map<string, StatementItem>, key: string) =>
  (items.get(key)?.perAsset ?? []).map((a) => Number(a.value));

describe("다건 장특 보유/거주 분리 — 거주 축도 자산별이다", () => {
  it("🔑 L-1: 거주 사실이 없는 자산에는 거주분이 배정되지 않는다", () => {
    const items = run({ p1: 30, p2: 0 });
    const residence = valuesOf(items, "ltResidencePart");
    expect(residence[1]).toBe(0);
    // 그 자산의 장특은 전액 보유분이다.
    expect(valuesOf(items, "ltHoldingPart")[1]).toBe(100_000_000);
  });

  it("🔑 L-2: 반대 배치에서도 실제 거주한 자산이 거주분을 받는다", () => {
    const items = run({ p1: 0, p2: 30 });
    const residence = valuesOf(items, "ltResidencePart");
    expect(residence[0]).toBe(0);
    expect(residence[1]).toBeGreaterThan(0);
  });

  it("L-3: 두 배치의 결과가 서로 다르다 — 대표 자산 값이 모두를 덮지 않는다", () => {
    expect(valuesOf(run({ p1: 30, p2: 0 }), "ltResidencePart")).not.toEqual(
      valuesOf(run({ p1: 0, p2: 30 }), "ltResidencePart"),
    );
  });

  it("L-4: 자산별 보유분 + 거주분 = 그 자산의 장특 (분해가 새지 않는다)", () => {
    const items = run({ p1: 30, p2: 0 });
    const hold = valuesOf(items, "ltHoldingPart");
    const res = valuesOf(items, "ltResidencePart");
    expect(hold[0] + res[0]).toBe(200_000_000);
    expect(hold[1] + res[1]).toBe(100_000_000);
  });
});
