/**
 * 주식 부담부증여 §47① — validateStep ⑧ 확장 회귀 가드
 *
 * 채무>평가액 경고(차단 아님)를 부동산뿐 아니라 주식(stockItems)까지 전수 검사.
 * 주식 평가액은 엔진 단일 진실(evaluateAllEstateItems) — UI 자체 재계산 금지(dual-truth).
 * 입력 미완성 예외는 try/catch → 0(경고 미발생, 엔진 위임).
 */
import { describe, it, expect } from "vitest";
import {
  validateStep,
  INITIAL_FORM,
  type FormState,
} from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const STEP1 = 1;

function listedStock(
  id: string,
  avgPrice: number,
  shares: number,
  assumedDebt?: number,
): EstateItem {
  return {
    id,
    category: "listed_stock",
    name: `상장${id}`,
    listedStockAvgPrice: avgPrice,
    listedStockShares: shares,
    ...(assumedDebt === undefined ? {} : { assumedDebtForGift: assumedDebt }),
  } as EstateItem;
}

function form(stockItems: EstateItem[]): FormState {
  return {
    ...INITIAL_FORM,
    giftDate: "2025-01-15",
    giftItems: [],
    stockItems,
  };
}

describe("주식 부담부증여 validateStep ⑧ — 채무>평가액 경고", () => {
  it("채무 미입력 → 통과", () => {
    expect(
      validateStep(STEP1, form([listedStock("a", 50_000, 1_000)])),
    ).toBeNull();
  });

  it("채무 ≤ 평가액 (5천만 평가 · 채무 2천만) → 경고 없음", () => {
    expect(
      validateStep(
        STEP1,
        form([listedStock("a", 50_000, 1_000, 20_000_000)]),
      ),
    ).toBeNull();
  });

  it("채무 > 평가액 (5천만 평가 · 채무 8천만) → 경고", () => {
    const msg = validateStep(
      STEP1,
      form([listedStock("a", 50_000, 1_000, 80_000_000)]),
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("채무인수액");
    expect(msg).toContain("초과");
  });

  it("주식 입력 미완성(주식수 0) + 채무 → 평가액 0 → 경고 없음 (엔진 위임)", () => {
    // 평가 불가 시 try/catch → 0 fallback, 0 > 0 거짓 → 경고 미발생
    expect(
      validateStep(STEP1, form([listedStock("a", 50_000, 0, 80_000_000)])),
    ).toBeNull();
  });

  it("비상장 marketValue 평가 · 채무 > 평가액 → 경고", () => {
    const item = {
      id: "u",
      category: "unlisted_stock",
      name: "비상장",
      marketValue: 100_000_000,
      assumedDebtForGift: 200_000_000,
    } as EstateItem;
    const msg = validateStep(STEP1, form([item]));
    expect(msg).not.toBeNull();
    expect(msg).toContain("초과");
  });
});
