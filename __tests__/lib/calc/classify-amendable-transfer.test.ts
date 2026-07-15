/**
 * classifyAmendableTransfer — 이력 카드 수정신고·경정청구 노출 가드 (계획서 §4.5).
 * 일반 다자산만 노출: single / §166⑥ bundled(assets>1·부담부증여 아님) / multi(전체 폼).
 * 제외: mixed-use·부담부증여·general_building 단일물건·구 stub multi·비-transfer.
 */
import { describe, it, expect } from "vitest";
import { classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";
import { extractOriginalDeterminedTax } from "@/lib/calc/transfer-amendment-entry";
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

  // [rev.2] 겸용주택 정정 지원 — 기존 "제외" 정책 반전 (계획서 D5).
  // ⚠️ "single" 재사용 금지: classifyLoadableTransfer(transfer-multi-load-entry.ts:20-24)가
  //    같은 가드를 재사용하며 "single"을 통과시켜 겸용주택이 다건 불러오기에 침묵 편입된다
  //    → 다건 경로는 겸용 미지원 → §160①단서 분리계산 소실. 신규 값은 fallthrough로 자연 배제.
  it("mixed-use = 전용 분류값 (single 재사용 금지)", () => {
    expect(
      classifyAmendableTransfer(
        rec({
          resultData: { mode: "mixed-use", result: { splitMode: "post-2022", total: { transferTax: 1 } } },
          inputData: {},
        }),
      ),
    ).toBe("mixed-use");
  });

  it("제외: mixed-use 거부 경로(pre-2022-rejected) — 계산 불가 record는 정정 진입 차단 (D8)", () => {
    expect(
      classifyAmendableTransfer(
        rec({
          resultData: { mode: "mixed-use", result: { splitMode: "pre-2022-rejected", total: { transferTax: 0 } } },
          inputData: {},
        }),
      ),
    ).toBeNull();
  });

  it("제외: 비-transfer 세목", () => {
    expect(
      classifyAmendableTransfer(rec({ taxType: "inheritance", resultData: {}, inputData: {} })),
    ).toBeNull();
  });
});

describe("extractOriginalDeterminedTax — 당초 결정세액 소스", () => {
  it("single = result.determinedTax", () => {
    expect(
      extractOriginalDeterminedTax(rec({ resultData: { result: { determinedTax: 100 } } })),
    ).toBe(100);
  });

  it("bundled = aggregated.determinedTax", () => {
    expect(
      extractOriginalDeterminedTax(rec({ resultData: { aggregated: { determinedTax: 200 } } })),
    ).toBe(200);
  });

  it("mixed-use = result.total.transferTax (본세 — 지방소득세 제외)", () => {
    expect(
      extractOriginalDeterminedTax(
        rec({
          resultData: {
            mode: "mixed-use",
            result: { total: { transferTax: 219_902_989, totalPayable: 241_893_287 } },
          },
        }),
      ),
    ).toBe(219_902_989);
  });
});
