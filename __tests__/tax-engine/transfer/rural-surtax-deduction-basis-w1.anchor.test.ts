/**
 * 후속 W1 3항 — 차감형 농특세 근거의 시행령 항 번호(농어촌특별세법 시행령 §5): 2013.8.26.까지 §5①, 2013.8.27.부터 §5② (세액 불변, 라벨만).
 * 원문: MST 135970(2013.3.23. 시행 §5① 「대통령령으로 정하는 계산방법에 의하여 계산한 금액」) · 현행 MST 280835 §5②(<개정 2013.8.27>, §5① 신설).
 */
import { describe, it, expect } from "vitest";
import { ruralSurtaxDeductionBasis, findRuralSurtaxDeductionBasis } from "@/lib/tax-engine/rural-surtax-basis";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";

const D = (s: string) => new Date(s);

describe("ruralSurtaxDeductionBasis", () => {
  it("2013-08-26 양도 → 시행령 §5① / 2013-08-27 양도 → §5②", () => {
    expect(ruralSurtaxDeductionBasis(D("2013-08-26"))).toBe(TRANSFER.RURAL_SURTAX_DEDUCTION_BEFORE_2013_08_27);
    expect(TRANSFER.RURAL_SURTAX_DEDUCTION_BEFORE_2013_08_27).toBe("농어촌특별세법 §5①1호·③, 농어촌특별세법 시행령 §5①");
    expect(ruralSurtaxDeductionBasis(D("2013-08-27"))).toBe(TRANSFER.RURAL_SURTAX_DEDUCTION);
    expect(ruralSurtaxDeductionBasis(D("2026-01-01"))).toBe(TRANSFER.RURAL_SURTAX_DEDUCTION);
  });
  it("양도일 없음 → 현행, 합산에서 양도일이 갈리면 둘 다 적는다", () => {
    expect(ruralSurtaxDeductionBasis(undefined)).toBe(TRANSFER.RURAL_SURTAX_DEDUCTION);
    const mixed = ruralSurtaxDeductionBasis(D("2013-01-01"), D("2014-01-01"));
    expect(mixed).toContain("시행령 §5②");
    expect(mixed).toContain("시행령 §5①");
  });
  it("findRuralSurtaxDeductionBasis: 단계의 legalBasis를 그대로 읽는다", () => {
    expect(findRuralSurtaxDeductionBasis([{ legalBasis: "x" }, { legalBasis: TRANSFER.RURAL_SURTAX_DEDUCTION_BEFORE_2013_08_27 }])).toBe(
      TRANSFER.RURAL_SURTAX_DEDUCTION_BEFORE_2013_08_27,
    );
    expect(findRuralSurtaxDeductionBasis([{ legalBasis: "x" }])).toBeUndefined();
  });
});
