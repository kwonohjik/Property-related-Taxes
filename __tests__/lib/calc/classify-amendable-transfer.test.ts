/**
 * classifyAmendableTransfer — 이력 카드 수정신고·경정청구 노출 가드 (계획서 §4.5).
 * 일반 다자산만 노출: single / §166⑥ bundled(assets>1·부담부증여 아님) / multi(전체 폼).
 * 제외: mixed-use·부담부증여·general_building 단일물건·구 stub multi·비-transfer.
 */
import { describe, it, expect } from "vitest";
import { classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";
import type { CalculationRecord } from "@/lib/storage/types";

function rec(partial: Partial<CalculationRecord>): CalculationRecord {
  return { id: "r1", taxType: "transfer", ...partial } as unknown as CalculationRecord;
}

describe("classifyAmendableTransfer 가드 매트릭스", () => {
  it("single = mode:single", () => {
    expect(
      classifyAmendableTransfer(
        rec({ resultData: { mode: "single", result: { determinedTax: 1 } }, inputData: {} }),
      ),
    ).toBe("single");
  });

  it("bundled = mode:bundled + assets>1 + 부담부증여 아님", () => {
    expect(
      classifyAmendableTransfer(
        rec({ resultData: { mode: "bundled", aggregated: { determinedTax: 1 } }, inputData: { assets: [{}, {}] } }),
      ),
    ).toBe("bundled");
  });

  it("제외: general_building 등 단일물건 bundled(assets.length===1)", () => {
    expect(
      classifyAmendableTransfer(rec({ resultData: { mode: "bundled" }, inputData: { assets: [{}] } })),
    ).toBeNull();
  });

  it("제외: 부담부증여 bundled(transferBurdenedGiftBreakdown)", () => {
    expect(
      classifyAmendableTransfer(
        rec({ resultData: { mode: "bundled", transferBurdenedGiftBreakdown: {} }, inputData: { assets: [{}, {}] } }),
      ),
    ).toBeNull();
  });

  it("multi = mode 래퍼 없음 + properties[] + 전체 폼(inputData.properties[].form)", () => {
    expect(
      classifyAmendableTransfer(
        rec({ resultData: { properties: [{}], determinedTax: 1 }, inputData: { properties: [{ form: {} }] } }),
      ),
    ).toBe("multi");
  });

  it("제외: 구 stub multi record(inputData.properties[].form 부재)", () => {
    expect(
      classifyAmendableTransfer(
        rec({ resultData: { properties: [{}] }, inputData: { properties: [{ propertyId: "p1" }] } }),
      ),
    ).toBeNull();
  });

  it("제외: mixed-use", () => {
    expect(classifyAmendableTransfer(rec({ resultData: { mode: "mixed-use" }, inputData: {} }))).toBeNull();
  });

  it("제외: 비-transfer 세목", () => {
    expect(
      classifyAmendableTransfer(rec({ taxType: "inheritance", resultData: {}, inputData: {} })),
    ).toBeNull();
  });
});
