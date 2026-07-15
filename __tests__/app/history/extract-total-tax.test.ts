/**
 * extractTotalTax — 이력 카드 납부세액 표시 (전 세목 공용).
 *
 * 겸용주택(mode:"mixed-use")은 납부세액이 `result.total.totalPayable`로 한 단계 더 깊어
 * 기존 분기가 전부 미스 → "-"로 표시되던 것을 고정한다.
 * 다른 세목 분기(재산세 top-level totalPayable · 종부세 grandTotal 등)에 회귀가 없음도 함께 고정.
 */
import { describe, it, expect } from "vitest";
import { extractTotalTax } from "@/app/history/HistoryClient";

describe("extractTotalTax 세목별 추출", () => {
  it("겸용주택 = result.total.totalPayable (본세 + 지방소득세)", () => {
    expect(
      extractTotalTax({
        mode: "mixed-use",
        result: { total: { transferTax: 219_902_989, totalPayable: 241_893_287 } },
      }),
    ).toBe((241_893_287).toLocaleString());
  });

  it("단건 양도세 = result.totalTax", () => {
    expect(extractTotalTax({ mode: "single", result: { totalTax: 1_000 } })).toBe(
      (1_000).toLocaleString(),
    );
  });

  it("비과세는 금액보다 우선", () => {
    expect(extractTotalTax({ result: { isExempt: true, totalTax: 0 } })).toBe("비과세");
  });

  it("다건 양도세 = aggregated.totalTax", () => {
    expect(extractTotalTax({ aggregated: { totalTax: 2_000 } })).toBe((2_000).toLocaleString());
  });

  it("재산세 = top-level totalPayable (겸용 분기와 충돌 없음)", () => {
    expect(extractTotalTax({ totalPayable: 3_000 })).toBe((3_000).toLocaleString());
  });

  it("종합부동산세 = top-level grandTotal", () => {
    expect(extractTotalTax({ grandTotal: 4_000 })).toBe((4_000).toLocaleString());
  });

  it("추출 불가 = '-'", () => {
    expect(extractTotalTax({ foo: 1 })).toBe("-");
  });
});
