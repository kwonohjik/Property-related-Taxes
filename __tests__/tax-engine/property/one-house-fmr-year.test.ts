/**
 * 1세대1주택 공정시장가액비율(시행령 §109①2호 단서 각 목) 연도 확장 v3 — anchor.
 *
 * 법령(KoreanLaw 현행 §109 전문 + applicable_law 2024·2025): 1세대1주택 구간별
 *   가. 3억 이하 43% / 나. 3억~6억 44% / 다. 6억 초과 45%.
 *   2024·2025·2026 동일 구조. 2022는 단일 45%. 2023은 60%(특례 없음·유지).
 *
 * 실측: 구청 산출내역(2025, 공시 518,000,000, 직전 481,000,000) → 과세표준 223,036,000.
 *   518,000,000×0.44=227,920,000 → §110③ 상한 481,000,000×0.44 + 5% = 223,036,000.
 */

import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";

type Input = Parameters<typeof calculatePropertyTax>[0];

describe("1세대1주택 FMR 연도 확장 (시행령 §109①2호 단서 각 목)", () => {
  it("F-1 구청 실측 — 2025·518M·1세대1주택·직전481M → 과세표준 223,036,000·산출 266,072", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 518_000_000,
      isOneHousehold: true,
      priorYearPublishedPrice: 481_000_000,
      targetDate: "2025-06-01",
    } as Input);
    expect(r.fairMarketRatio).toBe(0.44); // 6억 이하 → 나목 44%
    expect(r.taxBase).toBe(223_036_000); // §110③ 과세표준상한 적용 후 (구청 일치)
    expect(r.calculatedTax).toBe(266_072); // 특례세율 산출 (구청 일치)
  });

  it("F-2 2025·250M(3억↓)·1세대1주택 → 가목 43%", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 250_000_000,
      isOneHousehold: true,
      targetDate: "2025-06-01",
    } as Input);
    expect(r.fairMarketRatio).toBe(0.43);
    expect(r.taxBase).toBe(107_500_000); // 250,000,000 × 0.43
  });

  it("F-3 2025·700M(6억↑)·1세대1주택 → 다목 45%", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 700_000_000,
      isOneHousehold: true,
      targetDate: "2025-06-01",
    } as Input);
    expect(r.fairMarketRatio).toBe(0.45);
    expect(r.taxBase).toBe(315_000_000); // 700,000,000 × 0.45
  });

  it("F-4 2024·518M·1세대1주택 → 나목 44%", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 518_000_000,
      isOneHousehold: true,
      targetDate: "2024-06-01",
    } as Input);
    expect(r.fairMarketRatio).toBe(0.44);
    expect(r.taxBase).toBe(227_920_000); // 직전공시 미입력 → §110③ 미작동
  });

  it("F-5 회귀: 2026·518M·1세대1주택 → 44% 불변", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 518_000_000,
      isOneHousehold: true,
      targetDate: "2026-06-01",
    } as Input);
    expect(r.fairMarketRatio).toBe(0.44);
  });

  it("F-6 회귀: 2022·518M·1세대1주택 → 단일 45% 불변", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 518_000_000,
      isOneHousehold: true,
      targetDate: "2022-06-01",
    } as Input);
    expect(r.fairMarketRatio).toBe(0.45);
  });

  it("F-7 회귀: 2025·518M·다주택(isOneHousehold=false) → 표준 60%", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 518_000_000,
      isOneHousehold: false,
      targetDate: "2025-06-01",
    } as Input);
    expect(r.fairMarketRatio).toBe(0.6);
  });

  it("F-8 2023·518M·1세대1주택 → 60% 유지 (각 목 특례 없음·미구현 제외)", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 518_000_000,
      isOneHousehold: true,
      targetDate: "2023-06-01",
    } as Input);
    expect(r.fairMarketRatio).toBe(0.6);
  });
});
