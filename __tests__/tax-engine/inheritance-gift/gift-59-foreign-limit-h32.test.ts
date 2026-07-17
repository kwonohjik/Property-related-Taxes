/**
 * H-32 anchor — 증여세 §59 외국납부세액공제 §21① 점유비 한도
 *
 * 법령(KoreanLaw MCP): §59 → 상증령 §48(준용) → §21①.
 *   한도 = 증여세산출세액 × (국외 증여재산 과세표준 ÷ 증여세 과세표준), 실제 외국세액 한도.
 *
 * 버그: gift §59가 한도 없이 산출세액 전액 한도 → 국외비중 낮아도 전액 공제.
 * 수정: foreignGiftTaxBase(국외 증여재산 과세표준) 입력 시 §21① 점유비 한도 적용.
 *   미입력 시 하위호환(전액 한도) — validate가 입력 요구.
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeInput(foreignGiftTaxBase?: number): GiftTaxInput {
  return {
    giftDate: "2024-05-01",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems: [{ id: "cash", category: "cash", name: "현금", marketValue: 1_000_000_000 }],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult" },
    creditInput: { isFiledOnTime: true, foreignTaxPaid: 30_000_000, foreignGiftTaxBase },
  };
}

describe("H-32 §59 §21① 점유비 한도 (엔진)", () => {
  const noForeign = calcGiftTax({
    ...makeInput(undefined),
    creditInput: { isFiledOnTime: true },
  });

  it("국외 과세표준 95M(전체 950M의 10%) → 한도 22,500,000(산출세액 225M×10%)로 제한", () => {
    // 외국세액 30M > 한도 22.5M → 공제 22.5M. finalTax 델타 = 22.5M − §69 3%(675,000) = 21,825,000.
    const limited = calcGiftTax(makeInput(95_000_000));
    expect(noForeign.finalTax - limited.finalTax).toBe(21_825_000);
    expect(noForeign.taxBase).toBe(950_000_000);
    expect(noForeign.computedTax).toBe(225_000_000);
  });

  it("미입력(undefined) → 하위호환 전액 한도 (델타 29,100,000)", () => {
    const full = calcGiftTax(makeInput(undefined));
    expect(noForeign.finalTax - full.finalTax).toBe(29_100_000);
  });

  it("외국세액 < 한도 → 외국세액 전액 공제 (한도 미초과)", () => {
    // foreignTaxPaid 30M < 한도(국외 500M/950M × 225M ≈ 118M) → 30M 전액.
    const under = calcGiftTax(makeInput(500_000_000));
    const fullDelta = noForeign.finalTax - under.finalTax;
    expect(fullDelta).toBe(29_100_000); // 전액 30M − §69 3%
  });
});

describe("H-32 validate — 국외 과세표준 필수 (⑧)", () => {
  it("foreignTaxPaid>0 + foreignGiftTaxBase 미입력 → 차단", () => {
    const form = { ...INITIAL_FORM, foreignTaxPaid: "30,000,000", foreignGiftTaxBase: "" };
    const err = validateStep(3, form);
    expect(err).toContain("국외 증여재산 과세표준");
  });
  it("foreignTaxPaid>0 + foreignGiftTaxBase 입력 → 통과", () => {
    const form = { ...INITIAL_FORM, foreignTaxPaid: "30,000,000", foreignGiftTaxBase: "95,000,000" };
    expect(validateStep(3, form)).toBeNull();
  });
  it("foreignTaxPaid=0 → 국외 과세표준 불요 (통과)", () => {
    const form = { ...INITIAL_FORM, foreignTaxPaid: "", foreignGiftTaxBase: "" };
    expect(validateStep(3, form)).toBeNull();
  });
});
