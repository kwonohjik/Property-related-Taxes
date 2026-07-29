import { describe, it, expect } from "vitest";
import { determineTaxBase } from "@/lib/tax-engine/acquisition-tax-base";
import { ACQUISITION } from "@/lib/tax-engine/legal-codes";
import type { AcquisitionTaxInput } from "@/lib/tax-engine/types/acquisition.types";

/**
 * R3-16·R3-17 조문 인용 드리프트 정정 anchor (표시-only, 세액 무영향).
 *
 * - R3-17: 간주취득 과세표준 근거 = §10의6(취득으로 보는 경우의 과세표준).
 *   §7④⑤(DEEMED_ACQUISITION)는 납세의무 근거일 뿐 과세표준 근거가 아님.
 * - R3-16: 과세표준 절사 규정 없음(원 단위) + §10의4=원시취득 상수 확인.
 */
describe("[AT-R3C] R3-16·R3-17 조문 인용 정정", () => {
  it("[AT-R3C-17] 간주취득(개수) 과세표준 legalBasis = §10의6 (DEEMED_ACQUISITION §7 아님)", () => {
    const r = determineTaxBase({
      propertyType: "building",
      acquisitionCause: "deemed_renovation",
      reportedPrice: 50_000_000,
      acquiredBy: "individual",
    } as AcquisitionTaxInput);
    expect(r.method).toBe("deemed_difference");
    expect(r.legalBasis).toBe(ACQUISITION.DEEMED_TAX_BASE);
    expect(r.legalBasis).toBe("지방세법 §10의6");
    expect(r.legalBasis).not.toBe(ACQUISITION.DEEMED_ACQUISITION); // §7 = 납세의무 근거
  });

  it("[AT-R3C-16] 조문 상수 제목 정합 — §10의4=원시취득·§10의2⑥=부담부증여·§10의6=간주취득", () => {
    expect(ACQUISITION.ORIGINAL_TAX_BASE).toBe("지방세법 §10의4");
    expect(ACQUISITION.BURDENED_GIFT).toBe("지방세법 §10의2⑥");
    expect(ACQUISITION.DEEMED_TAX_BASE).toBe("지방세법 §10의6");
    // DEEMED_ACQUISITION(§7)은 납세의무 근거로 별도 유지
    expect(ACQUISITION.DEEMED_ACQUISITION).toBe("지방세법 §7");
  });
});
