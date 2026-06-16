/**
 * Track B — recompute 결과뷰 산식 노출 anchor (B-7)
 *
 * recompute 모드 result → "직전연도 재산정" 산식 행 렌더.
 * direct 모드 → "직접입력" 산식 행 렌더.
 * 엔진 result를 직접 주입(mock 구성 불필요).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PropertyTaxResultView } from "@/components/calc/results/PropertyTaxResultView";
import { calculatePropertyTax } from "@/lib/tax-engine/property-tax";

type Input = Parameters<typeof calculatePropertyTax>[0];

describe("Track B: recompute 결과뷰 산식", () => {
  it("recompute 모드 — 직전연도 재산정 산식 노출", () => {
    const result = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 1_000_000_000,
      taxCapMode: "recompute",
      previousYearTaxBase: 100_000_000,
    } as Input);
    render(<PropertyTaxResultView result={result} />);
    expect(screen.getByText(/직전연도.*재산정/)).toBeTruthy();
  });

  it("direct 모드 — 직접입력 산식 노출", () => {
    const result = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 1_000_000_000,
      previousYearTax: 300_000,
    } as Input);
    render(<PropertyTaxResultView result={result} />);
    expect(screen.getByText(/직접입력/)).toBeTruthy();
  });
});
