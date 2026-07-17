/**
 * C-6 anchor — 기타재산(other) 평가에 §60 시가 우선순위 적용
 *
 * 법령(KoreanLaw MCP, 상증법 mst 276123 §60②·상증령 §49①2호):
 *   §60② "시가는 …감정가격 등 …시가로 인정되는 것을 포함한다." → 감정가액은 시가.
 *   §60③ 시가 산정 곤란 시 §61~§65(기준시가 등)로 평가.
 *   우선순위: market → appraised → similar_sales → standard_price (resolveValuationAmount 단일 진실).
 *
 * 재현: category="other"에 감정평가액 30억만 입력 → 종전 marketValue만 읽어 0원 평가(grossEstate 누락).
 *   수정 후: 감정가액 30억을 시가로 인정.
 */
import { describe, it, expect } from "vitest";
import { evaluateEstateItem } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function other(over: Partial<EstateItem>): EstateItem {
  return { id: "o1", category: "other", name: "기타재산", ...over };
}

describe("C-6 기타재산 §60 시가 우선순위", () => {
  it("감정가액 30억만 입력 → 30억·appraisal (종전 0원 버그 정정)", () => {
    const r = evaluateEstateItem(other({ appraisedValue: 3_000_000_000 }));
    expect(r.valuatedAmount).toBe(3_000_000_000);
    expect(r.method).toBe("appraisal");
  });

  it("시가 10억 + 감정 30억 → 시가 우선 10억·market_value (§60 불변)", () => {
    const r = evaluateEstateItem(
      other({ marketValue: 1_000_000_000, appraisedValue: 3_000_000_000 }),
    );
    expect(r.valuatedAmount).toBe(1_000_000_000);
    expect(r.method).toBe("market_value");
  });

  it("유사매매 8억만 → 8억·similar_sales", () => {
    const r = evaluateEstateItem(other({ similarSalesValue: 800_000_000 }));
    expect(r.valuatedAmount).toBe(800_000_000);
    expect(r.method).toBe("similar_sales");
  });

  it("기준시가 5억만 → 5억·standard_price", () => {
    const r = evaluateEstateItem(other({ standardPrice: 500_000_000 }));
    expect(r.valuatedAmount).toBe(500_000_000);
    expect(r.method).toBe("standard_price");
  });

  it("시가만 10억 → 10억·market_value (기존 동작 회귀)", () => {
    const r = evaluateEstateItem(other({ marketValue: 1_000_000_000 }));
    expect(r.valuatedAmount).toBe(1_000_000_000);
    expect(r.method).toBe("market_value");
  });

  it("전부 미입력 → 0 (기존 동작 유지)", () => {
    const r = evaluateEstateItem(other({}));
    expect(r.valuatedAmount).toBe(0);
  });
});
