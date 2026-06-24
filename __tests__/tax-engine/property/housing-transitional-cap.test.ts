/**
 * 주택 재산세 세부담상한 경과조치(부칙 제15조) v1 본세 — anchor.
 *
 * 설계: docs/02-design/features/property-housing-transitional-cap.engine.design.md §5.
 * 실측 사례: 용인 기흥 구갈동 아파트(1세대1주택, 공시 3~6억 → 110%).
 *   본세 2023=195,700 → 2024=215,300 → 2025=236,800 (지방교육세÷0.2 역산, 매년 정확히 110%).
 *   anchor는 법령 산식(Math.floor) 기준 → 2025=236,830. 실제 고지 236,800과 30원차 = 역산·연도 절사 누적오차.
 */

import { describe, it, expect } from "vitest";
import {
  applyHousingTransitionalCap,
  resolveHousingCapRate,
} from "../../../lib/tax-engine/property-tax-housing-cap";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";

type Input = Parameters<typeof calculatePropertyTax>[0];

describe("주택 세부담상한 경과조치(부칙 제15조) — 순수함수", () => {
  it("TC-1 2025 본세 110% — min(266,072, 215,300×1.10=236,830)=236,830", () => {
    const r = applyHousingTransitionalCap(266_072, 518_000_000, 2025, 215_300);
    expect(r.applied).toBe(true);
    expect(r.capRate).toBe(1.1);
    expect(r.capLimit).toBe(236_830); // floor(215,300 × 1.10) — 실제고지 236,800과 30원차(절사 누적)
    expect(r.determinedTax).toBe(236_830);
  });

  it("TC-2 2024 본세 110% — min(216,924, 195,700×1.10=215,270)=215,270", () => {
    const r = applyHousingTransitionalCap(216_924, 481_000_000, 2024, 195_700);
    expect(r.determinedTax).toBe(215_270);
    expect(r.capRate).toBe(1.1);
  });

  it("TC-3 직전본세 미입력 → 상한 미적용 + warning", () => {
    const r = applyHousingTransitionalCap(266_072, 518_000_000, 2025, undefined);
    expect(r.applied).toBe(false);
    expect(r.determinedTax).toBe(266_072);
    expect(r.warnings.join()).toContain("직전연도 본세 미입력");
  });

  it("TC-4 공시 3억 이하 → 105%", () => {
    expect(resolveHousingCapRate(300_000_000)).toBe(1.05);
    expect(
      applyHousingTransitionalCap(200_000, 250_000_000, 2025, 180_000).capRate,
    ).toBe(1.05);
  });

  it("TC-5 공시 6억 초과 → 130%", () => {
    expect(resolveHousingCapRate(700_000_000)).toBe(1.3);
    expect(
      applyHousingTransitionalCap(500_000, 700_000_000, 2025, 300_000).capRate,
    ).toBe(1.3);
  });

  it("TC-6 2029년 → 경과조치 만료, 미적용 + warning", () => {
    const r = applyHousingTransitionalCap(266_072, 518_000_000, 2029, 215_300);
    expect(r.applied).toBe(false);
    expect(r.determinedTax).toBe(266_072);
    expect(r.warnings.join()).toContain("2028");
  });

  it("경계: 공시 정확히 6억 → 110% (BRACKET_2 이하)", () => {
    expect(resolveHousingCapRate(600_000_000)).toBe(1.1);
  });
});

describe("주택 세부담상한 경과조치 — calculatePropertyTax 통합", () => {
  it("TC-7 비주택(건축물) 회귀 — 기존 150% 상한 유지", () => {
    const r = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 1_000_000_000,
      previousYearTax: 300_000,
    } as Input);
    // 과세표준 1,000,000,000 × 0.70 = 700,000,000 × 0.0025 = 1,750,000, 상한 300,000×1.5=450,000
    expect(r.determinedTax).toBe(450_000);
    expect(r.taxCapRate).toBe(1.5);
    expect(r.housingTransitionalCap).toBeUndefined();
  });

  it("TC-8 housing + 직전본세 입력 → 경과조치 적용(상한 한도로 제한)", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 518_000_000,
      isOneHousehold: true,
      targetDate: "2025-06-01",
      previousYearHousingBaseTax: 100_000, // 작은 값 → 상한 110,000으로 제한 (FMR 무관 검증)
    } as Input);
    expect(r.housingTransitionalCap?.applied).toBe(true);
    expect(r.housingTransitionalCap?.capRate).toBe(1.1);
    expect(r.determinedTax).toBe(110_000); // floor(100,000 × 1.10)
    expect(r.determinedTax).toBeLessThan(r.calculatedTaxBeforeCap);
    expect(r.taxCapRate).toBe(1.1);
  });

  it("TC-9 회귀가드: housing + 직전본세 미전달(종부세 호출 경로) → 상한 미적용·불변", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 518_000_000,
      isOneHousehold: true,
      targetDate: "2025-06-01",
    } as Input);
    expect(r.housingTransitionalCap).toBeUndefined();
    expect(r.determinedTax).toBe(r.calculatedTaxBeforeCap); // 상한 미적용 → 산출=확정
    expect(r.taxCapRate).toBe(1);
  });
});
