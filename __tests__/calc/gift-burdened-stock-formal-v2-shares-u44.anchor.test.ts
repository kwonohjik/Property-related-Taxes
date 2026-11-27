/**
 * U-44 (비상장주식 리뷰 2026-11-28) — 주식 부담부증여 ④가 주식수를 활성 평가 모드에서 읽는다.
 *
 * 결함: 비상장 shareCount·totalIssuedShares를 간편평가(V1) unlistedStockData에서만 읽었다.
 * 정식평가(V2) 카드는 새 카드 기본값 V1 {0, 0}이 숨은 채 남아 ⑫ positive로 400이 나거나,
 * 간편평가 때 입력한 오래된 주식수로 §163⑥4호 개산공제 base를 계산했다.
 *
 * 법 근거: 소득세법 시행령 §159①(B/C 안분) · §163⑥4호(개산공제) — 기준시가 총액은 실제 증여 주식수 기준.
 * ④ → ⑫ → ⑭ → 엔진 전 계층을 태운다.
 */
import { describe, it, expect } from "vitest";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { addStockRefines, stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { coerceDates } from "@/lib/api/date-coerce";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { createDefaultUnlistedStockV2 } from "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card";

const DATE_FIELDS = ["transferDate", "acquisitionDate", "filingDate", "priorYearEndDate", "listingDate"];
const GIFT_DATE = "2025-06-02";

/** 시가 50억 · 채무 10억 · 정식평가 V2 보유 10,000주 / 발행 100,000주 */
function formalItem(v1: { totalShares: number; ownedShares: number } | undefined): EstateItem {
  return {
    id: "u1",
    name: "비상장",
    category: "unlisted_stock",
    marketValue: 5_000_000_000,
    assumedDebtForGift: 1_000_000_000,
    unlistedValuationMode: "formal",
    unlistedStockValuationV2: { ...createDefaultUnlistedStockV2(), totalShares: 100_000, ownedShares: 10_000 },
    ...(v1 ? { unlistedStockData: v1 } : {}),
    burdenedGiftStockTransferTax: {
      marketType: "unlisted",
      acquisitionDate: "2015-03-02",
      acquisitionMode: "estimated",
      transferYearNetIncomePerShare: 500_000,
      transferYearNetAssetPerShare: 400_000,
      acquisitionYearNetIncomePerShare: 100_000,
      acquisitionYearNetAssetPerShare: 80_000,
    },
  } as unknown as EstateItem;
}

function runFullStack(item: EstateItem) {
  const body = buildGiftStockBurdenedTransferBody(item, { giftDate: GIFT_DATE } as unknown as FormState);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) {
    return { blocked: true as const, body, issues: parsed.error.issues.map((i) => i.path.join(".")) };
  }
  const result = calculateStockTransferTax(
    buildEngineInput(coerceDates(parsed.data as Record<string, unknown>, DATE_FIELDS)),
  );
  return { blocked: false as const, body, result };
}

describe("U-44 — 정식평가(V2) 카드의 부담부증여 주식수", () => {
  it("(a) 숨은 V1 기본값 0주 → V2 주식수로 싣고 ⑫ 통과 (종전: shareCount 0 → 400)", () => {
    const out = runFullStack(formalItem({ totalShares: 0, ownedShares: 0 }));
    expect(out.body.shareCount).toBe(10_000);
    expect(out.body.totalIssuedShares).toBe(100_000);
    expect(out.blocked).toBe(false);
  });

  it("(b) 간편평가 때 입력한 5,000주가 남아 있어도 V2 10,000주 기준 (종전: 개산공제 920,000)", () => {
    const stale = runFullStack(formalItem({ totalShares: 50_000, ownedShares: 5_000 }));
    const clean = runFullStack(formalItem(undefined));
    expect(stale.body.shareCount).toBe(10_000);
    expect(stale.blocked).toBe(false);
    expect(clean.blocked).toBe(false);
    if (stale.blocked || clean.blocked) return;
    expect(stale.result).toEqual(clean.result);
    // 법령값: 개산공제 1,840,000 · 산출세액 159,132,000 (간편평가 B23-2와 같은 사례)
    expect(stale.result.estimatedDeduction).toBe(1_840_000);
    expect(stale.result.calculatedTax).toBe(159_132_000);
  });

  it("(c) V1 없음 → V2 10,000주 (종전: 1주로 계산)", () => {
    const out = runFullStack(formalItem(undefined));
    expect(out.body.shareCount).toBe(10_000);
  });
});
