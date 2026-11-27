/**
 * A-0 (Pre-Do) — 국내 seed 세율표가 소득세법 §55①과 같아 국외 부동산(§118의5①)이 그대로 재사용 가능한가.
 * 계획서 엔진 §6.2 A-0 · V-8. 이 anchor가 틀리면 「기존 seed 표 재사용」 전제가 무너진다.
 */
import { describe, it, expect } from "vitest";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { calculateProgressiveTax } from "@/lib/tax-engine/tax-utils";

const parsedAt = (iso: string) => parseRatesFromMap(loadFallbackTransferRates(new Date(`${iso}T00:00:00Z`)));

describe("A-0 — 기존 seed 표 재사용 가능성", () => {
  it("양도일 2026-07-10: 과세표준 434,500,000 → 산출세액 147,860,000 · 기본공제 한도 2,500,000", () => {
    const parsed = parsedAt("2026-07-10");
    expect(calculateProgressiveTax(434_500_000, parsed.brackets)).toBe(147_860_000);
    expect(parsed.basicDeductionRules.annualLimit).toBe(2_500_000);
  });

  it("양도일 2022-12-31: 구표(3~5억 공제 25,400,000) → 148,400,000 (현표와 540,000 차)", () => {
    expect(calculateProgressiveTax(434_500_000, parsedAt("2022-12-31").brackets)).toBe(148_400_000);
  });
});
