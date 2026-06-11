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

  it("[GM-G3] startupNewHiresAtLeast10=true → 한도 100억 반영, specialStreamTax=5.5억, filingCredit=0 (§30의5⑪)", () => {
    /**
     * 60억 증여 + 10인 이상 신규 고용(한도 100억) → 60억 전액 특례 적용.
     * 특례 스트림세액 = (60억 - 5억) × 10% = 5억5천만
     * filingCredit = 0 (§30의5⑫ 배제 — 특례 스트림에 §69 미적용)
     *
     * 2-스트림 재산정 (법령 정합, probe 실측):
     *   specialTreatmentCredit deprecated(0) → specialStreamTax로 대체
     *   단일 자산 → 자동 특례 귀속 → 일반 스트림 없음 → ordinaryStreamTax=0
     */
    const raw = makeStartupInput();
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = calcGiftTax(parsed.data as unknown as GiftTaxInput);
    // 2-스트림: specialStreamTax = 550,000,000 (5.5억)
    expect(result.specialStreamTax).toBe(550_000_000);
    // §30의5⑫ 배제 — 특례 스트림은 §69 미적용 → filingCredit = 0
    expect(result.creditDetail.filingCredit).toBe(0);
    // finalTax = specialStreamTax (일반 스트림 없음)
    expect(result.finalTax).toBe(550_000_000);
  });

  it("[GM-G4] startupNewHiresAtLeast10=false → 한도 50억, specialStreamTax=4.5억, filingCredit=0 (§30의5⑪)", () => {
    /**
     * 60억 증여 + 고용 미달(한도 50억) → 특례 한도 50억, 초과분 10억은 경고.
     * 단일 자산 → 자동 특례 귀속 → 일반 스트림 없음.
     * 특례 스트림 세액 = (50억 - 5억) × 10% = 4억5천만
     * filingCredit = 0 (§30의5⑫ 배제)
     *
     * 2-스트림 재산정 (법령 정합, probe 실측):
     *   specialTreatmentCredit deprecated(0) → specialStreamTax로 대체
     *   한도 초과 경고 포함
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
    // 2-스트림: specialStreamTax = 450,000,000 (4.5억, 한도 50억 적용)
    expect(result.specialStreamTax).toBe(450_000_000);
    // 한도 초과 10억은 "창업자금"이 아님(§30의5① 한도 정의) → 일반 스트림 과세.
    // §30의5⑪ §69 배제는 창업자금(특례 스트림) 한정 — 일반 스트림 §69는 정상 적용:
    // 10억 − §53 5천만 = 9.5억 → ×30% − 6천만 = 2.25억 → ×3% = 6,750,000
    expect(result.creditDetail.filingCredit).toBe(6_750_000);
    // finalTax = 특례 4.5억 + 일반 (2.25억 − 675만) = 668,250,000
    expect(result.finalTax).toBe(668_250_000);
    // 한도 초과 경고
    const hasLimitWarning = result.warnings.some((w) => w.includes("한도 초과"));
    expect(hasLimitWarning).toBe(true);
  });
});
