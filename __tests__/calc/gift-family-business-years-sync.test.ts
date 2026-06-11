/**
 * familyBusinessYears 14지점 동기화 회귀 가드 (④ API 변환 · ⑫ Zod strip · ⑧ validateStep)
 *
 * R3 리뷰 Medium: 엔진(gift-special-stream.ts)이 creditInput.familyBusinessYears로
 * §30의6① 한도(10년 300억 / 20년 400억 / 30년 600억)를 분기하는데, 증여 폼·④ 변환·
 * ⑫ Zod 전부 부재 → 항상 기본 10년(300억 한도) 고정이었음.
 *
 * 3중 패턴: family_business 선택 + 입력 시에만 전달. 빈값 → undefined(엔진 기본 10년).
 * 명시 0 포함 10 미만은 그대로 전달 → 엔진이 특례 불가 판정(일반 스트림 폴백).
 */
import { describe, it, expect } from "vitest";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import {
  validateStep,
  INITIAL_FORM,
  type FormState,
} from "@/components/calc/gift-tax-form-shared";
import { giftTaxInputSchema } from "@/lib/validators/property-valuation-input";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    ...INITIAL_FORM,
    giftDate: "2025-01-15",
    giftItems: [
      {
        id: "a",
        category: "financial",
        name: "가업주식",
        marketValue: 1_000_000_000,
      } as EstateItem,
    ],
    ...overrides,
  };
}

describe("familyBusinessYears ④ buildGiftTaxInput", () => {
  it("family_business + '25' → creditInput.familyBusinessYears = 25", () => {
    const input = buildGiftTaxInput(
      makeForm({ specialTreatment: "family_business", familyBusinessYears: "25" }),
    );
    expect(input.creditInput?.familyBusinessYears).toBe(25);
  });

  it("family_business + 빈값 → undefined (엔진 기본 10년)", () => {
    const input = buildGiftTaxInput(
      makeForm({ specialTreatment: "family_business", familyBusinessYears: "" }),
    );
    expect(input.creditInput?.familyBusinessYears).toBeUndefined();
  });

  it("startup + '25' → undefined (3중 패턴 strip)", () => {
    const input = buildGiftTaxInput(
      makeForm({ specialTreatment: "startup", familyBusinessYears: "25" }),
    );
    expect(input.creditInput?.familyBusinessYears).toBeUndefined();
  });

  it("family_business + 명시 '0' → 0 보존 (특례 불가 판정용 — || strip 금지)", () => {
    const input = buildGiftTaxInput(
      makeForm({ specialTreatment: "family_business", familyBusinessYears: "0" }),
    );
    expect(input.creditInput?.familyBusinessYears).toBe(0);
  });
});

describe("familyBusinessYears ⑫ Zod strip 가드", () => {
  it("giftTaxInputSchema parse 후 creditInput.familyBusinessYears 보존", () => {
    const input = buildGiftTaxInput(
      makeForm({ specialTreatment: "family_business", familyBusinessYears: "25" }),
    );
    const parsed = giftTaxInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(
        (parsed.data.creditInput as { familyBusinessYears?: number })
          .familyBusinessYears,
      ).toBe(25);
    }
  });

  it("음수는 Zod min(0) 차단", () => {
    const input = buildGiftTaxInput(
      makeForm({ specialTreatment: "family_business" }),
    );
    const parsed = giftTaxInputSchema.safeParse({
      ...input,
      creditInput: { ...input.creditInput, familyBusinessYears: -5 },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("familyBusinessYears ⑧ validateStep — Zod min(0) 동기화", () => {
  it("음수 입력 차단", () => {
    const msg = validateStep(
      3,
      makeForm({ specialTreatment: "family_business", familyBusinessYears: "-5" }),
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("0 이상");
  });

  it("10 미만('5')은 차단하지 않음 — 엔진 특례 불가 판정에 위임 (모순 방지)", () => {
    expect(
      validateStep(
        3,
        makeForm({ specialTreatment: "family_business", familyBusinessYears: "5" }),
      ),
    ).toBeNull();
  });

  it("빈값 통과 (엔진 기본 10년)", () => {
    expect(
      validateStep(
        3,
        makeForm({ specialTreatment: "family_business", familyBusinessYears: "" }),
      ),
    ).toBeNull();
  });
});
