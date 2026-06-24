/**
 * 주식 평가 독립 도구 — resultData 빌더 anchor.
 *
 * 검증: category별 평가대상회사·주식수 추출 분기 + 평가액(엔진 단일 진실) + 합계 + 0원 제외.
 * Plan: docs/00-pm/stock-valuation-tool.plan.md
 */

import { describe, it, expect } from "vitest";
import {
  buildStockValuationResult,
  extractCompanyName,
  extractShares,
} from "@/lib/calc/stock-valuation-tool";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

describe("주식 평가 도구 resultData 빌더", () => {
  it("상장주식 — 종가평균 × 주식수 (§63①1가), 회사명 companyName 우선", () => {
    const item: EstateItem = {
      id: "L1",
      name: "삼성",
      category: "listed_stock",
      companyName: "삼성전자",
      listedStockAvgPrice: 10_000,
      listedStockShares: 100,
    };
    expect(extractCompanyName(item)).toBe("삼성전자");
    expect(extractShares(item)).toBe(100);

    const r = buildStockValuationResult([item], "2026-06-01");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].valuationAmount).toBe(1_000_000); // 10,000 × 100
    expect(r.items[0].companyName).toBe("삼성전자");
    expect(r.items[0].shares).toBe(100);
    expect(r.totalValuationAmount).toBe(1_000_000);
    expect(r.valuationDate).toBe("2026-06-01");
  });

  it("상장주식 — companyName 없으면 name fallback", () => {
    const item: EstateItem = {
      id: "L2",
      name: "내회사",
      category: "listed_stock",
      listedStockAvgPrice: 5_000,
      listedStockShares: 10,
    };
    expect(extractCompanyName(item)).toBe("내회사");
  });

  it("비상장주식 V2(정식) — corpName·V2 ownedShares 추출 (name보다 corpName 우선)", () => {
    const item: EstateItem = {
      id: "U2",
      name: "백업명칭",
      category: "unlisted_stock",
      unlistedValuationMode: "formal",
      // 추출 분기 검증용 — corpName·ownedShares만 읽음 (전체 V2 평가 불요)
      unlistedStockValuationV2: {
        corpName: "정식법인",
        ownedShares: 500,
        totalShares: 1_000,
      } as UnlistedStockValuationInput,
    };
    expect(extractCompanyName(item)).toBe("정식법인");
    expect(extractShares(item)).toBe(500);
  });

  it("빈 평가기준일 — 상장주식은 자기 종가평균으로 계산(날짜 무관), valuationDate echo 빈값", () => {
    const item: EstateItem = {
      id: "L1",
      name: "A",
      category: "listed_stock",
      listedStockAvgPrice: 10_000,
      listedStockShares: 100,
    };
    const r = buildStockValuationResult([item], "");
    expect(r.valuationDate).toBe("");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].valuationAmount).toBe(1_000_000);
  });

  it("비상장주식 V1(간편) — name·ownedShares 추출, 평가액 > 0", () => {
    const item: EstateItem = {
      id: "U1",
      name: "비상장A",
      category: "unlisted_stock",
      unlistedStockData: {
        totalShares: 100_000,
        ownedShares: 10_000,
        weightedNetIncome: 200_000_000,
        netAssetValue: 500_000_000,
        capitalizationRate: 0.1,
      },
    };
    expect(extractCompanyName(item)).toBe("비상장A");
    expect(extractShares(item)).toBe(10_000);
    const r = buildStockValuationResult([item], "2026-06-01");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].valuationAmount).toBeGreaterThan(0);
  });

  it("평가액 0(미입력) 종목은 결과·합계에서 제외", () => {
    const filled: EstateItem = {
      id: "L1",
      name: "A",
      category: "listed_stock",
      listedStockAvgPrice: 10_000,
      listedStockShares: 100,
    };
    const empty: EstateItem = {
      id: "L2",
      name: "B",
      category: "listed_stock",
      // avg/shares 미입력 → 평가액 0
    };
    const r = buildStockValuationResult([filled, empty], "2026-06-01");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].id).toBe("L1");
    expect(r.totalValuationAmount).toBe(1_000_000);
  });

  it("합계 — 상장 + 비상장 V1 누적", () => {
    const listed: EstateItem = {
      id: "L1",
      name: "A",
      category: "listed_stock",
      listedStockAvgPrice: 10_000,
      listedStockShares: 100,
    };
    const unlisted: EstateItem = {
      id: "U1",
      name: "B",
      category: "unlisted_stock",
      unlistedStockData: {
        totalShares: 100_000,
        ownedShares: 10_000,
        weightedNetIncome: 200_000_000,
        netAssetValue: 500_000_000,
        capitalizationRate: 0.1,
      },
    };
    const r = buildStockValuationResult([listed, unlisted], "2026-06-01");
    expect(r.items).toHaveLength(2);
    expect(r.totalValuationAmount).toBe(
      r.items[0].valuationAmount + r.items[1].valuationAmount,
    );
  });
});
