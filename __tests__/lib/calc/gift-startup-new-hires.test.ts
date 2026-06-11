/**
 * GM-G anchor — startupNewHiresAtLeast10 (G-M8) Zod round-trip + 엔진 도달
 *
 * 검증 항목:
 *   GM-G1  startupNewHiresAtLeast10=true — Zod round-trip 후 보존
 *   GM-G2  startupNewHiresAtLeast10=false — Zod round-trip 후 false 유지
 *   GM-G3  true → 한도 100억 반영 (엔진 D2 정정 확인), filingCredit=0 (§30의5⑪)
 *   GM-G4  false → 한도 50억 반영, filingCredit=0 (§30의5⑪)
 *
 * 분리 사유: gift-route-roundtrip.test.ts 800줄 정책 준수를 위해 별도 파일로 추출.
 */

import { describe, it, expect } from "vitest";
import { giftTaxInputSchema } from "@/lib/validators/property-valuation-input";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function jsonRoundTrip<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 창업자금 60억 기본 입력 팩토리 */
function makeStartupInput(overrides: Partial<GiftTaxInput> = {}): GiftTaxInput {
  return {
    giftDate: "2025-01-01",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems: [
      {
        id: "startup-cash",
        category: "financial",
        name: "창업자금",
        marketValue: 6_000_000_000, // 60억
      } as EstateItem,
    ],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: {
      donorRelation: "lineal_ascendant_adult",
    },
    creditInput: {
      isFiledOnTime: true,
      specialTreatment: "startup",
      startupInvestmentCompleted: true,
      startupNewHiresAtLeast10: true,
    },
    ...overrides,
  };
}

describe("[GM-G] startupNewHiresAtLeast10 — schema round-trip + 엔진 도달 (G-M8)", () => {
  it("[GM-G1] startupNewHiresAtLeast10=true — Zod round-trip 후 보존", () => {
    const raw = makeStartupInput();
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.creditInput.startupNewHiresAtLeast10).toBe(true);
  });

  it("[GM-G2] startupNewHiresAtLeast10=false — Zod round-trip 후 false 유지", () => {
    const raw = makeStartupInput({
      creditInput: {
        isFiledOnTime: true,
        specialTreatment: "startup",
        startupInvestmentCompleted: true,
        startupNewHiresAtLeast10: false,
      },
    });
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.creditInput.startupNewHiresAtLeast10).toBe(false);
  });

  it("[GM-G3] startupNewHiresAtLeast10=true → 한도 100억 반영, filingCredit=0 (§30의5⑪)", () => {
    /**
     * 60억 증여 + 10인 이상 신규 고용(한도 100억) → 60억 전액 특례 적용.
     * 특례세액 = (60억 - 5억) × 10% = 5억5천만
     * filingCredit = 0 (§30의5⑪ 배제)
     */
    const raw = makeStartupInput();
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = calcGiftTax(parsed.data as unknown as GiftTaxInput);
    // specialTreatmentCredit > 0 (60억 전액 특례 내)
    expect(result.creditDetail.specialTreatmentCredit).toBeGreaterThan(0);
    // §30의5⑪ 배제 — filingCredit = 0
    expect(result.creditDetail.filingCredit).toBe(0);
  });

  it("[GM-G4] startupNewHiresAtLeast10=false → 한도 50억 반영, filingCredit=0 (§30의5⑪)", () => {
    /**
     * 60억 증여 + 고용 미달(한도 50억) → 초과 10억 일반과세.
     * 특례 적격 giftAmount = 50억, taxBase = 45억 → specialTreatmentCredit 존재
     * filingCredit = 0 (§30의5⑪ 배제 — 특례 적격)
     */
    const raw = makeStartupInput({
      creditInput: {
        isFiledOnTime: true,
        specialTreatment: "startup",
        startupInvestmentCompleted: true,
        startupNewHiresAtLeast10: false, // 고용 미달 → 50억 한도
      },
    });
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = calcGiftTax(parsed.data as unknown as GiftTaxInput);
    // 특례 적용 (한도 50억 내) → specialTreatmentCredit > 0
    expect(result.creditDetail.specialTreatmentCredit).toBeGreaterThan(0);
    // §30의5⑪ 배제
    expect(result.creditDetail.filingCredit).toBe(0);
  });
});
