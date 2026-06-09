/**
 * isSimpleModeUnlisted — 간편평가 비상장주식 평가조서 출력 대상 판정 anchor.
 */

import { describe, it, expect } from "vitest";
import {
  isSimpleModeUnlisted,
  resolveUnlistedMode,
} from "@/lib/calc/unlisted-valuation-mode";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const base = (over: Partial<EstateItem>): EstateItem =>
  ({ id: "u1", category: "unlisted_stock", name: "비상장(주)", ...over }) as EstateItem;

describe("isSimpleModeUnlisted (간편평가 평가조서 대상)", () => {
  it("US-1: 간편평가(unlistedStockData·발행주식수>0) → true", () => {
    const it = base({
      unlistedValuationMode: "simple",
      unlistedStockData: { totalShares: 10000, ownedShares: 10000, netAssetValue: 1, capitalizationRate: 0.1, weightedNetIncome: 0 },
    });
    expect(isSimpleModeUnlisted(it)).toBe(true);
  });

  it("US-2: 레거시 fallback — mode undefined + V2 없음 + data 있음 → simple → true", () => {
    const it = base({
      unlistedStockData: { totalShares: 5000, ownedShares: 5000, netAssetValue: 1, capitalizationRate: 0.1, weightedNetIncome: 0 },
    });
    expect(resolveUnlistedMode(it)).toBe("simple");
    expect(isSimpleModeUnlisted(it)).toBe(true);
  });

  it("US-3: 정식평가 V2(formal) → false (별지4 부표3 별도 섹션)", () => {
    const it = base({
      unlistedValuationMode: "formal",
      unlistedStockValuationV2: { corpName: "X" } as EstateItem["unlistedStockValuationV2"],
      unlistedStockData: { totalShares: 10000, ownedShares: 10000, netAssetValue: 1, capitalizationRate: 0.1, weightedNetIncome: 0 },
    });
    expect(isSimpleModeUnlisted(it)).toBe(false);
  });

  it("US-4: 발행주식수 0(데이터 미입력) → false", () => {
    const it = base({ unlistedValuationMode: "simple" });
    expect(isSimpleModeUnlisted(it)).toBe(false);
  });

  it("US-5: 비상장주식 아님 → false", () => {
    expect(isSimpleModeUnlisted(base({ category: "listed_stock" }))).toBe(false);
    expect(isSimpleModeUnlisted(base({ category: "real_estate_land" }))).toBe(false);
  });
});
