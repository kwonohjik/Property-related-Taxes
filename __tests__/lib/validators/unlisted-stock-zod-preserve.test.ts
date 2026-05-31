/**
 * Zod 스키마 — 비상장주식 §54④ 사유·평가모드 보존 anchor (2026-05-31)
 *
 * 사용자 버그 (이미지 13~20): UI 카드 500m vs 결과 화면 400m dual-truth.
 * 근본 원인 — unlistedStockDataSchema에 assetValueOnlyReason,
 *   unlistedStockItemSchema에 unlistedValuationMode 필드가 미정의되어
 *   서버 Zod safeParse 시 z.object 침묵 strip → 엔진이 §54④ 사유 미인식 →
 *   본칙(80% 최소값) 적용 → 1주당 순자산가치(20,000) 대신 16,000 → 500m → 400m.
 *
 * 14지점 ⑫ "Zod 입력 객체 정의" 정합. [[feedback_api_zod_schema_sync]]
 */

import { describe, it, expect } from "vitest";
import { estateItemSchema } from "@/lib/validators/property-valuation-input";
import { evaluateAllEstateItems } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("Zod — 비상장주식 §54④ 사유·평가모드 보존", () => {
  it("assetValueOnlyReason(liquidation) 보존 — strip 안 됨 (§54④ 1호)", () => {
    const input = {
      id: "stock-1",
      category: "unlisted_stock",
      name: "비상장주식 1",
      unlistedValuationMode: "simple",
      unlistedStockData: {
        totalShares: 41667,
        ownedShares: 25000,
        netAssetValue: 833_340_000,
        capitalizationRate: 0.1,
        assetValueOnlyReason: "liquidation",
      },
    };
    const parsed = estateItemSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.category === "unlisted_stock") {
      // ★ 핵심: strip되면 undefined → 엔진 본칙(80%) → 400m 버그 재발
      expect(parsed.data.unlistedStockData?.assetValueOnlyReason).toBe("liquidation");
      expect(parsed.data.unlistedValuationMode).toBe("simple");
    }
  });

  it("assetValueOnlyReason 5개 enum 모두 통과", () => {
    for (const reason of ["liquidation", "lt3y", "real_estate_80", "stock_80", "remaining_3y"]) {
      const parsed = estateItemSchema.safeParse({
        id: "s",
        category: "unlisted_stock",
        name: "주식",
        unlistedStockData: {
          totalShares: 1000,
          ownedShares: 500,
          netAssetValue: 100_000_000,
          capitalizationRate: 0.1,
          assetValueOnlyReason: reason,
        },
      });
      expect(parsed.success).toBe(true);
      if (parsed.success && parsed.data.category === "unlisted_stock") {
        expect(parsed.data.unlistedStockData?.assetValueOnlyReason).toBe(reason);
      }
    }
  });

  it("assetValueOnlyReason 미입력 → undefined 유지 (본칙 적용, 기존 동작)", () => {
    const parsed = estateItemSchema.safeParse({
      id: "s",
      category: "unlisted_stock",
      name: "주식",
      unlistedStockData: {
        totalShares: 1000,
        ownedShares: 500,
        netAssetValue: 100_000_000,
        capitalizationRate: 0.1,
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.category === "unlisted_stock") {
      expect(parsed.data.unlistedStockData?.assetValueOnlyReason).toBeUndefined();
    }
  });

  // ★ end-to-end: Zod parse → 엔진 평가 = 500m (사용자 버그 직접 재현)
  it("E2E: Zod parse 후 엔진 평가 = 500m (§54④ 1호 보존 — 400m 버그 미재발)", () => {
    const input = {
      id: "stock-1780021569387-3",
      category: "unlisted_stock",
      name: "비상장주식 1",
      unlistedValuationMode: "simple",
      unlistedStockData: {
        totalShares: 41667, // 833,340,000 / 20,000 → 1주당 순자산 20,000
        ownedShares: 25000,
        netIncomeY1: 0, netIncomeY2: 0, netIncomeY3: 0, // 적자
        netAssetValue: 833_340_000,
        capitalizationRate: 0.1,
        assetValueOnlyReason: "liquidation", // §54④ 1호 — 무조건 순자산가치(80% 미적용)
      },
    };
    const parsed = estateItemSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const [result] = evaluateAllEstateItems([parsed.data as EstateItem]);
    // strip되면 본칙 16,000×25,000=400m, 보존되면 §54④ 1호 20,000×25,000=500m
    expect(result.valuatedAmount).toBe(500_000_000);
  });

  it("잘못된 assetValueOnlyReason enum → 거부", () => {
    const parsed = estateItemSchema.safeParse({
      id: "s",
      category: "unlisted_stock",
      name: "주식",
      unlistedStockData: {
        totalShares: 1000,
        ownedShares: 500,
        netAssetValue: 100_000_000,
        capitalizationRate: 0.1,
        assetValueOnlyReason: "invalid_reason",
      },
    });
    expect(parsed.success).toBe(false);
  });
});
