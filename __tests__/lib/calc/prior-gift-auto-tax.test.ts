/**
 * autoComputePriorGiftTax — 기납부 증여세 자동계산 anchor (donee-phase2)
 *
 * 단순 1건 독립: (증여재산가액 − §53 공제) × §56 누진세율.
 * 이미지 검증: 배우자 760m → 22m / 영리법인 700m → 150m.
 */

import { describe, it, expect } from "vitest";
import {
  autoComputePriorGiftTax,
  applyCorporateGiftTaxFallback,
} from "@/lib/calc/prior-gift-auto-tax";
import { validatePriorGift } from "@/lib/calc/inheritance-validate";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("autoComputePriorGiftTax — 단순 1건 독립 (§53 공제 + §56 세율)", () => {
  it("P1: 배우자 760m → 22,000,000 (이미지26 — 760m−600m=160m 과표)", () => {
    expect(autoComputePriorGiftTax(760_000_000, "spouse")).toBe(22_000_000);
  });

  it("P3: 영리법인(공제 0) 700m → 150,000,000 (이미지25 — 700m 과표)", () => {
    expect(autoComputePriorGiftTax(700_000_000, undefined)).toBe(150_000_000);
  });

  it("P2: 자녀(성인기준) 500m → 80,000,000 (500m−5천만=450m 과표)", () => {
    expect(autoComputePriorGiftTax(500_000_000, "lineal_descendant")).toBe(80_000_000);
  });

  it("P5: 수유자(공제 0) 300m → 50,000,000", () => {
    expect(autoComputePriorGiftTax(300_000_000, undefined)).toBe(50_000_000);
  });

  it("P6: 기타친족 300m → 48,000,000 (300m−1천만=290m 과표)", () => {
    expect(autoComputePriorGiftTax(300_000_000, "other_relative")).toBe(48_000_000);
  });

  it("P8: 기타친족 100m → 9,000,000 (100m−1천만=90m 과표)", () => {
    expect(autoComputePriorGiftTax(100_000_000, "other_relative")).toBe(9_000_000);
  });

  it("§55 단서: 과세표준 50만원 미만 → 0 (배우자 6억 이하)", () => {
    expect(autoComputePriorGiftTax(600_000_000, "spouse")).toBe(0); // 600m−600m=0
    expect(autoComputePriorGiftTax(600_400_000, "spouse")).toBe(0); // 과표 40만원 < 50만원
  });

  it("giftAmount 0 또는 음수 → 0", () => {
    expect(autoComputePriorGiftTax(0, "spouse")).toBe(0);
    expect(autoComputePriorGiftTax(-100, "spouse")).toBe(0);
  });

  it("직계존속(성인) 200m → (200m−5천만=150m 과표) 20,000,000", () => {
    expect(autoComputePriorGiftTax(200_000_000, "lineal_ascendant_adult")).toBe(20_000_000);
  });
});

describe("applyCorporateGiftTaxFallback — 진입 fallback (기존 데이터 cgct 미설정)", () => {
  function corpGift(o: Partial<PriorGift> = {}): PriorGift {
    return {
      giftDate: "2021-08-10",
      isHeir: false,
      giftAmount: 700_000_000,
      giftTaxPaid: 0,
      beneficiaryType: "corporate",
      ...o,
    };
  }

  it("corporate cgct undefined + 가액 700m → cgct 150,000,000 주입 (사용자 케이스)", () => {
    const [g] = applyCorporateGiftTaxFallback([corpGift()]);
    expect(g.corporateGiftComputedTax).toBe(150_000_000);
  });

  it("A1: corporate cgct 0 + 가액 700m → 150m 주입 (0=미계산 간주 — 빈칸 버그 수정)", () => {
    // 변경 정책: 영리법인은 가액>0이면 산출세액>0이 정상. cgct≤0은 미계산으로 간주해 법정값 도출.
    // (이전 "0 존중" anchor는 cgct=0 store 잔재가 표시 빈칸·계산 0을 유발해 폐기 — feedback_anchor_correction_legal_priority)
    const [g] = applyCorporateGiftTaxFallback([corpGift({ corporateGiftComputedTax: 0 })]);
    expect(g.corporateGiftComputedTax).toBe(150_000_000);
  });

  it("A1b: corporate cgct 음수 + 가액 700m → 150m 주입", () => {
    const [g] = applyCorporateGiftTaxFallback([corpGift({ corporateGiftComputedTax: -1 })]);
    expect(g.corporateGiftComputedTax).toBe(150_000_000);
  });

  it("corporate cgct >0 (이력·계산값) → 그대로 유지", () => {
    const [g] = applyCorporateGiftTaxFallback([corpGift({ corporateGiftComputedTax: 99_000_000 })]);
    expect(g.corporateGiftComputedTax).toBe(99_000_000);
  });

  it("corporate 가액 0 → fallback 안 함 (cgct undefined 유지)", () => {
    const [g] = applyCorporateGiftTaxFallback([corpGift({ giftAmount: 0 })]);
    expect(g.corporateGiftComputedTax).toBeUndefined();
  });

  it("A4: corporate cgct 0 + 가액 0 → 미채움 (가액 가드 — 0 유지, validate 차단 위임)", () => {
    const [g] = applyCorporateGiftTaxFallback([corpGift({ giftAmount: 0, corporateGiftComputedTax: 0 })]);
    expect(g.corporateGiftComputedTax).toBe(0); // 가액 0이라 autoCompute 미발동 — 0 그대로
  });

  it("비corporate(자연인) → 변경 안 함 (§28 위험 회피, 동일 참조)", () => {
    const natural: PriorGift = { giftDate: "2022-06-10", isHeir: true, giftAmount: 760_000_000, giftTaxPaid: 0, beneficiaryType: "heir" };
    const result = applyCorporateGiftTaxFallback([natural]);
    expect(result[0]).toBe(natural); // 동일 참조 — 미변경
    expect(result[0].giftTaxPaid).toBe(0);
  });

  // ───── A8: ⑧ validation 동기화 — fallback 후 cgct=0이던 입력이 통과하는지 ─────
  it("A8: fallback 후 cgct=0이던 영리법인 → validatePriorGift 통과 (UI/API 통과 ↔ validate 차단 모순 0)", () => {
    const [g] = applyCorporateGiftTaxFallback([
      corpGift({ corporateGiftComputedTax: 0, doneeId: "corp-1" }),
    ]);
    expect(g.corporateGiftComputedTax).toBe(150_000_000);
    expect(validatePriorGift(g)).toBeNull();
  });

  it("A8b: fallback 전 cgct=0 영리법인 → validatePriorGift 차단 (fallback 필요성 입증)", () => {
    const err = validatePriorGift(corpGift({ corporateGiftComputedTax: 0, doneeId: "corp-1" }));
    expect(err).toContain("corporateGiftComputedTax");
  });
});
