/**
 * ⑫ Zod 층 — §53 「none」·증여의제 산식 표지가 침묵 strip 되지 않는다 (리뷰 7단계)
 *
 * leaf 직접호출 anchor는 ⑫를 지나가지 않는다(memory `feedback_leaf_anchor_skips_zod_layer`).
 * `DonorRelation`에 값을 더하거나 `EstateItem`에 필드를 더할 때 Zod enum·객체 정의를
 * 함께 고치지 않으면 **TypeScript는 침묵하고** 값만 조용히 사라진다.
 */

import { describe, it, expect } from "vitest";
import { giftTaxInputSchema, giftDeductionInputSchema } from "@/lib/validators/property-valuation-input";
import { priorGiftSchema } from "@/lib/validators/prior-gift-schema";

const baseGift = {
  giftDate: "2025-01-01",
  donorRelation: "none" as const,
  donor: "other" as const,
  giftItems: [
    {
      id: "g1",
      category: "other" as const,
      name: "증자에 따른 이익 증여이익",
      marketValue: 100_000_000,
      isStatutoryFormulaValue: true,
    },
  ],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "none" as const },
  creditInput: { isFiledOnTime: true },
};

describe("[Z12] §53 「none」이 ⑫를 통과한다", () => {
  it("[Z12-1] giftTaxInputSchema가 donorRelation: none을 받는다", () => {
    const r = giftTaxInputSchema.safeParse(baseGift);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.donorRelation).toBe("none");
  });

  it("[Z12-2] deductionInput.donorRelation: none이 strip 되지 않는다", () => {
    const r = giftDeductionInputSchema.safeParse({ donorRelation: "none" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.donorRelation).toBe("none");
  });

  it("[Z12-3] 사전증여 doneeRelation: none이 통과한다", () => {
    const r = priorGiftSchema.safeParse({
      giftDate: "2020-03-03",
      giftAmount: 50_000_000,
      giftTaxPaid: 0,
      doneeRelation: "none",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.doneeRelation).toBe("none");
  });

  // 긍정 짝 — enum이 아무 문자열이나 받게 넓어진 것이 아님을 못 박는다.
  it("[Z12-4] 긍정 짝: 정의에 없는 값은 여전히 거부된다", () => {
    expect(giftDeductionInputSchema.safeParse({ donorRelation: "stranger" }).success).toBe(false);
  });
});

describe("[Z12] 증여의제 산식 표지가 ⑫를 통과한다", () => {
  it("[Z12-5] giftItems[0].isStatutoryFormulaValue가 살아서 나온다", () => {
    const r = giftTaxInputSchema.safeParse(baseGift);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.giftItems[0].isStatutoryFormulaValue).toBe(true);
  });

  // 긍정 짝 — 표지를 안 실은 항목은 undefined 그대로다(기본값 주입이 아니다).
  it("[Z12-6] 긍정 짝: 표지 없는 항목은 undefined", () => {
    const r = giftTaxInputSchema.safeParse({
      ...baseGift,
      giftItems: [{ id: "g1", category: "other" as const, name: "기타재산", marketValue: 1_000_000 }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.giftItems[0].isStatutoryFormulaValue).toBeUndefined();
  });
});
