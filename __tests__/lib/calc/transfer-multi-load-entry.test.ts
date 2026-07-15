/**
 * classifyLoadableTransfer — 다건 "이력 불러오기" 편입 가드.
 *
 * ⚠️ 이 앵커의 존재 이유(계획서 D5): classifyLoadableTransfer는 classifyAmendableTransfer의
 *    반환값을 재사용한다. 겸용주택 정정 지원 시 분류값으로 "single"을 재사용하면 겸용주택이
 *    다건 불러오기에 침묵 편입되고, 다건 경로는 겸용을 지원하지 않아(mixedUse 참조 0건)
 *    소득세법 시행령 §160① 단서 분리계산이 통째로 소실된다.
 *    전용 분류값("mixed-use")은 아래 fallthrough로 자연 배제된다 — 그 사실을 여기서 고정한다.
 */
import { describe, it, expect } from "vitest";
import { classifyLoadableTransfer } from "@/lib/calc/transfer-multi-load-entry";
import type { CalculationRecord } from "@/lib/storage/types";

function rec(partial: Partial<CalculationRecord>): CalculationRecord {
  return { id: "r1", taxType: "transfer", ...partial } as unknown as CalculationRecord;
}

describe("classifyLoadableTransfer 편입 가드", () => {
  it("single 이력은 자산 1건으로 편입 가능", () => {
    expect(
      classifyLoadableTransfer(
        rec({ resultData: { mode: "single", result: { determinedTax: 1 } }, inputData: {} }),
      ),
    ).toBe("single");
  });

  it("multi 이력은 세션 전체 replace로 편입 가능", () => {
    expect(
      classifyLoadableTransfer(
        rec({ resultData: { properties: [{}] }, inputData: { properties: [{ form: {} }] } }),
      ),
    ).toBe("multi");
  });

  it("[D5] 겸용주택은 편입 불가 — 다건 경로가 §160①단서 분리계산을 지원하지 않는다", () => {
    expect(
      classifyLoadableTransfer(
        rec({
          resultData: {
            mode: "mixed-use",
            result: { splitMode: "post-2022", total: { transferTax: 219_902_989 } },
          },
          inputData: {},
        }),
      ),
    ).toBeNull();
  });

  it("bundled는 편입 불가 (§166⑥ companion 편입 복잡성)", () => {
    expect(
      classifyLoadableTransfer(
        rec({ resultData: { mode: "bundled" }, inputData: { assets: [{}, {}] } }),
      ),
    ).toBeNull();
  });
});
