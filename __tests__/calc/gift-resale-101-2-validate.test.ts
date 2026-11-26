/**
 * §101② 판정 화면 ⑧ ↔ ⑫ 격자 — UI가 통과시키면 API도 통과하고, UI가 막으면 API도 막는다
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §5.4·§6
 * UI만 막는 규칙은 없다(validate 헤더) — 모든 행에서 두 판정이 같아야 한다.
 */
import { describe, it, expect } from "vitest";
import { GIFT_RESALE_INITIAL, type GiftResaleFormState } from "@/lib/calc/gift-resale-101-2-form";
import { validateGiftResale } from "@/lib/calc/gift-resale-101-2-validate";
import { toGiftResaleRequestBody } from "@/lib/calc/gift-resale-101-2-api";
import { giftResaleInputSchema } from "@/lib/validators/gift-resale-101-2-input";

const TEXTBOOK: GiftResaleFormState = {
  ...GIFT_RESALE_INITIAL,
  relation: "related",
  giftRegistryDate: "2026-02-01",
  transferDate: "2026-04-05",
  substantiveAttribution: "no",
  giftTaxCalculated: 6_500_000,
  giftTaxCreditsAndReductions: 195_000,
  doneeTransferDeterminedTax: 36_250_000,
  donorTransferDeterminedTax: 13_704_000,
};

const GRID: [string, GiftResaleFormState, boolean][] = [
  ["초기값(전부 미입력)", GIFT_RESALE_INITIAL, false],
  ["교재 사례(완전)", TEXTBOOK, true],
  ["토글 전부 ON", { ...TEXTBOOK, isBurdenedGift: true, donorDeceasedAtTransfer: true, donorHasOtherTransfersSameYear: true, doneeHasOtherTransfersSameYear: true, giftTaxIncludesOtherAssets: true }, true],
  ["관계 미선택", { ...TEXTBOOK, relation: "" }, false],
  ["실질귀속 미선택", { ...TEXTBOOK, substantiveAttribution: "" }, false],
  ["증여일 빈칸", { ...TEXTBOOK, giftRegistryDate: "" }, false],
  ["양도일 존재하지 않는 날짜", { ...TEXTBOOK, transferDate: "2026-02-30" }, false],
  ["양도일 형식 오류", { ...TEXTBOOK, transferDate: "2026.4.5" }, false],
  ["양도일 < 증여일", { ...TEXTBOOK, transferDate: "2026-01-31" }, false],
  ["양도일 = 증여일", { ...TEXTBOOK, transferDate: "2026-02-01" }, true],
  ["증여세 산출 빈칸", { ...TEXTBOOK, giftTaxCalculated: null }, false],
  ["공제·감면 빈칸", { ...TEXTBOOK, giftTaxCreditsAndReductions: null }, false],
  ["공제·감면 0", { ...TEXTBOOK, giftTaxCreditsAndReductions: 0 }, true],
  ["공제·감면 = 산출", { ...TEXTBOOK, giftTaxCreditsAndReductions: 6_500_000 }, true],
  ["공제·감면 > 산출", { ...TEXTBOOK, giftTaxCreditsAndReductions: 6_500_001 }, false],
  ["수증자 결정세액 빈칸", { ...TEXTBOOK, doneeTransferDeterminedTax: null }, false],
  ["증여자 결정세액 0(비과세)", { ...TEXTBOOK, donorTransferDeterminedTax: 0 }, true],
  ["증여자 결정세액 음수", { ...TEXTBOOK, donorTransferDeterminedTax: -1 }, false],
  ["소수 금액", { ...TEXTBOOK, giftTaxCalculated: 100.5 }, false],
];

describe("§101② ⑧ ↔ ⑫ 격자", () => {
  it.each(GRID)("%s", (_label, form, ok) => {
    const uiOk = validateGiftResale(form).length === 0;
    const apiOk = giftResaleInputSchema.safeParse(toGiftResaleRequestBody(form)).success;
    expect(uiOk).toBe(ok);
    expect(apiOk).toBe(ok);
  });

  it("초기값은 필수 8칸(관계·날짜 2·실질귀속·금액 4)을 각각 지목한다", () => {
    const fields = validateGiftResale(GIFT_RESALE_INITIAL).map((i) => i.field);
    expect(fields).toEqual([
      "relation",
      "giftRegistryDate",
      "transferDate",
      "substantiveAttribution",
      "giftTaxCalculated",
      "giftTaxCreditsAndReductions",
      "doneeTransferDeterminedTax",
      "donorTransferDeterminedTax",
    ]);
  });
});
