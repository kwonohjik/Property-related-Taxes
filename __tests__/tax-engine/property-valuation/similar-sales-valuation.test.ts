import { describe, it, expect } from "vitest";
import {
  evaluateLand,
  resolveValuationMethod,
} from "@/lib/tax-engine/property-valuation";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import { resolveValuationLabel } from "@/components/calc/results/source-summary/source-summary-helpers";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 매매사례가액(similarSalesValue) 신규 필드 + 평가방식 도출(resolveValuationMethod) anchor.
 * 설계: docs/02-design/features/inheritance-real-estate-valuation-accordion.{plan,engine.design}.md
 * D-1(§49②④ 우선순위) · D-4(시가+감정 → 무조건 시가) 확정.
 */

const land = (partial: Partial<EstateItem>): EstateItem => ({
  id: "vm-1",
  name: "테스트 토지",
  category: "real_estate_land",
  ...partial,
});

describe("매매사례가액 + 평가방식 도출 (§60·시행령 §49②④)", () => {
  // ── VM-DERIVE-01: 감정만 → appraisal ──
  it("[VM-DERIVE-01] 감정평가액만 입력 → method=appraisal", () => {
    const item = land({ appraisedValue: 180_000_000 });
    expect(resolveValuationMethod(item)).toBe("appraisal");
    expect(evaluateLand(item).valuatedAmount).toBe(180_000_000);
  });

  // ── VM-DERIVE-02 (D-4): 시가+감정 동시 → 무조건 시가, appraisal 아님 ──
  it("[VM-DERIVE-02] 시가 2억 + 감정 1.8억 → 평가액 2억, method=market_value (감정수수료 판정 false)", () => {
    const item = land({ marketValue: 200_000_000, appraisedValue: 180_000_000 });
    expect(resolveValuationMethod(item)).toBe("market_value");
    expect(evaluateLand(item).valuatedAmount).toBe(200_000_000);
    // 감정수수료 공제 판정: method가 appraisal이 아니므로 false (D-4)
    expect(resolveValuationMethod(item) === "appraisal").toBe(false);
  });

  // ── VM-SIM-01: 매매사례만 → similar_sales ──
  it("[VM-SIM-01] 매매사례가액만 입력 → method=similar_sales, 평가액 일치", () => {
    const item = land({ similarSalesValue: 190_000_000 });
    expect(resolveValuationMethod(item)).toBe("similar_sales");
    expect(evaluateLand(item).valuatedAmount).toBe(190_000_000);
    expect(evaluateLand(item).method).toBe("similar_sales");
  });

  // ── VM-SIM-02 (§49② 단서): 시가+매매사례 → 매매사례 배제, 시가 채택 ──
  it("[VM-SIM-02] 시가 + 매매사례 동시 → 매매사례 배제(§49② 단서), method=market_value", () => {
    const item = land({ marketValue: 200_000_000, similarSalesValue: 190_000_000 });
    expect(resolveValuationMethod(item)).toBe("market_value");
    expect(evaluateLand(item).valuatedAmount).toBe(200_000_000);
  });

  // ── 우선순위 전체: 감정 > 매매사례 (감정+매매사례) ──
  it("[VM-SIM-03] 감정 + 매매사례 → 감정 우선(method=appraisal)", () => {
    const item = land({ appraisedValue: 180_000_000, similarSalesValue: 190_000_000 });
    expect(resolveValuationMethod(item)).toBe("appraisal");
    expect(evaluateLand(item).valuatedAmount).toBe(180_000_000);
  });

  // ── 매매사례 > 보충평가 ──
  it("[VM-SIM-04] 매매사례 + 보충평가(공시지가) → 매매사례 우선", () => {
    const item = land({ similarSalesValue: 190_000_000, standardPrice: 100_000_000 });
    expect(resolveValuationMethod(item)).toBe("similar_sales");
    expect(evaluateLand(item).valuatedAmount).toBe(190_000_000);
  });

  // ── VM-66-01 (회귀): 보충평가 + 저당 > 평가 → §66 max 하한 ──
  it("[VM-66-01] 공시지가 1억 + 저당 2억 → §66 평가 하한 max=2억 (직교축 보존)", () => {
    const item = land({ standardPrice: 100_000_000, mortgageAmount: 200_000_000 });
    expect(evaluateLand(item).valuatedAmount).toBe(200_000_000);
  });

  // ── VM-DUALTRUTH-01: similar만 → H1(엔진) = H2(computeEffectiveValuation) 일치 ──
  it("[VM-DUALTRUTH-01] 매매사례만 → 엔진 평가액 = computeEffectiveValuation 일치", () => {
    const item = land({ similarSalesValue: 190_000_000 });
    expect(evaluateLand(item).valuatedAmount).toBe(190_000_000);
    expect(computeEffectiveValuation(item)).toBe(190_000_000);
  });

  // ── 미입력 → standard_price(0) ──
  it("[VM-EMPTY] 미입력 → method=standard_price, 평가액 0", () => {
    const item = land({});
    expect(resolveValuationMethod(item)).toBe("standard_price");
    expect(evaluateLand(item).valuatedAmount).toBe(0);
  });
});

describe("주식 비고 열 라벨 (D-7) — resolveValuationLabel", () => {
  it("[VM-STOCK-LABEL-01] 상장주식(4필드 미입력) → 비고 '시가' (2개월 평균)", () => {
    const item = {
      id: "s1",
      name: "삼성전자",
      category: "listed_stock",
      listedStockAvgPrice: 70_000,
      listedStockShares: 100,
    } as EstateItem;
    expect(resolveValuationLabel(item)).toBe("시가");
  });

  it("[VM-STOCK-LABEL-02] 비상장주식 → 비고 '보충적 평가' (§63 순손익·순자산)", () => {
    const item = { id: "s2", name: "비상장(주)", category: "unlisted_stock" } as EstateItem;
    expect(resolveValuationLabel(item)).toBe("보충적 평가");
  });

  it("[VM-STOCK-LABEL-03] 명시 valuationMethod 우선 (레거시 데이터 보존)", () => {
    const item = {
      id: "s3",
      name: "비상장(주)",
      category: "unlisted_stock",
      valuationMethod: "appraisal",
    } as EstateItem;
    expect(resolveValuationLabel(item)).toBe("감정가액");
  });

  it("[VM-STOCK-LABEL-04] 부동산 회귀 — 시가 입력 → '시가', 매매사례 → '매매사례가액'", () => {
    expect(
      resolveValuationLabel({
        id: "r1",
        name: "토지",
        category: "real_estate_land",
        marketValue: 200_000_000,
      } as EstateItem),
    ).toBe("시가");
    expect(
      resolveValuationLabel({
        id: "r2",
        name: "토지2",
        category: "real_estate_land",
        similarSalesValue: 190_000_000,
      } as EstateItem),
    ).toBe("매매사례가액");
  });
});
