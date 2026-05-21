/**
 * ANCHOR-H2-1~4 — candidateToPriorGift options.asCorporate 옵션 검증.
 *
 * 계획서: docs/00-pm/inheritance-corporate-prior-gift-phase2-history-autodetect.plan.md
 */

import { describe, it, expect } from "vitest";
import { candidateToPriorGift } from "@/lib/calc/prior-gift-lookup";
import { validatePriorGift } from "@/lib/calc/inheritance-validate";
import type { PriorGiftCandidate } from "@/lib/calc/prior-gift-lookup";

const baseCandidate: PriorGiftCandidate = {
  calculationId: "calc_xyz",
  giftDate: "2022-05-21",
  donor: "father",
  donorRelation: "lineal_descendant",
  grossGiftValue: 500_000_000,
  taxBase: 450_000_000,
  computedTax: 80_000_000,
  finalTax: 75_000_000,
  additionalGenerationSkipSurcharge: 0,
  wasGenerationSkip: false,
  hasInnerPriorGifts: false,
  createdAt: "2022-05-21T00:00:00Z",
  clientId: "client_1",
  title: "calc_xyz title",
  propertyCategory: "cash",
  propertyName: "현금증여",
};

describe("candidateToPriorGift — 영리법인 옵션 (Phase 2)", () => {
  it("ANCHOR-H2-1: asCorporate=true — beneficiaryType·isHeir·giftTaxPaid·corporateGiftComputedTax 매핑", () => {
    const result = candidateToPriorGift(baseCandidate, { asCorporate: true });
    expect(result.beneficiaryType).toBe("corporate");
    expect(result.isHeir).toBe(false); // §13①2호 5년 cutoff 강제
    expect(result.giftTaxPaid).toBe(0); // §4의2③ 비과세
    expect(result.corporateGiftComputedTax).toBe(80_000_000); // c.computedTax → §3의2② 한도 분자
    expect(result.giftAmount).toBe(500_000_000);
    expect(result.giftTaxBase).toBe(450_000_000);
    expect(result.sourceCalculationId).toBe("calc_xyz");
    // 자연인 enum 필드는 corporate 모드에서 미설정
    expect(result.donor).toBeUndefined();
    expect(result.doneeRelation).toBeUndefined();
  });

  it("ANCHOR-H2-2 (회귀): 옵션 없음 — 기존 자연인 동작 보존", () => {
    const result = candidateToPriorGift(baseCandidate);
    expect(result.beneficiaryType).toBeUndefined();
    expect(result.isHeir).toBe(true);
    expect(result.giftTaxPaid).toBe(75_000_000); // c.finalTax 그대로
    expect(result.corporateGiftComputedTax).toBeUndefined();
    expect(result.doneeRelation).toBe("lineal_descendant");
    expect(result.donor).toBe("father");
    expect(result.computedTax).toBe(80_000_000); // 자연인 모드는 computedTax 직접 보존
  });

  it("ANCHOR-H2-3: asCorporate import 후 validate — doneeId 미설정으로 차단", () => {
    const result = candidateToPriorGift(baseCandidate, { asCorporate: true });
    const err = validatePriorGift(result);
    // doneeId 필수 — 모달 import 후 사용자가 Heir 매핑 필요 (Phase 2 후속 UI 분리)
    expect(err).toContain("doneeId");
  });

  it("ANCHOR-H2-4: asCorporate + computedTax=0 후보 — validate 차단 (산출세액 필수)", () => {
    const result = candidateToPriorGift(
      { ...baseCandidate, computedTax: 0 },
      { asCorporate: true },
    );
    // doneeId가 우선 차단되므로 doneeId 채운 상태로 재검증
    const errWithDoneeId = validatePriorGift({ ...result, doneeId: "donee1" });
    expect(errWithDoneeId).toContain("corporateGiftComputedTax");
  });
});
