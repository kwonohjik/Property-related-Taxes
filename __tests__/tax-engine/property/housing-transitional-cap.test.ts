/**
 * 주택 재산세 세부담상한 경과조치(부칙 제15조) v1 본세 — anchor.
 *
 * 설계: docs/02-design/features/property-housing-transitional-cap.engine.design.md §5.
 * 실측 사례: 용인 기흥 구갈동 아파트(1세대1주택, 공시 3~6억 → 110%).
 *   ★구청 산출내역 원본(2025-07, 이미지24)으로 직전 본세 상당액·상한 확정:
 *   전년세액(상당액) 215,336 → 상한 floor(215,336 × 1.10) = 236,869 (구청 '상한세액'과 오차 0).
 *   (종전 anchor 215,300/236,830은 지방교육세÷0.2 역산 추정값 — 구청 실측으로 정정.)
 */

import { describe, it, expect } from "vitest";
import {
  applyHousingTransitionalCap,
  applyHousingUrbanTransitionalCap,
  resolveHousingCapRate,
} from "../../../lib/tax-engine/property-tax-housing-cap";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";

type Input = Parameters<typeof calculatePropertyTax>[0];

describe("주택 세부담상한 경과조치(부칙 제15조) — 순수함수", () => {
  it("TC-1 2025 본세 110% — min(266,072, 215,336×1.10=236,869)=236,869 (구청 실측)", () => {
    const r = applyHousingTransitionalCap(266_072, 518_000_000, 2025, 215_336);
    expect(r.applied).toBe(true);
    expect(r.capRate).toBe(1.1);
    expect(r.capLimit).toBe(236_869); // floor(215,336 × 1.10) — 구청 산출내역 '상한세액' 일치
    expect(r.determinedTax).toBe(236_869);
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

  it("TC-U1 도시지역분 세부담상한 통합(§118 본문) — isUrbanArea + 직전 도시지역분 입력 → calcSurtax 주입", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 518_000_000,
      isOneHousehold: true,
      isUrbanArea: true,
      targetDate: "2025-06-01",
      previousYearHousingBaseTax: 215_336, // 본세 상한 floor(215,336×1.10)=236,869 (구청 실측)
      previousYearHousingUrbanTax: 100_000, // 도시 상한 floor(100,000×1.10)=110,000 (binding, FMR 무관)
    } as Input);
    expect(r.housingTransitionalCap?.applied).toBe(true);
    expect(r.housingTransitionalCap?.urbanApplied).toBe(true);
    expect(r.housingTransitionalCap?.urbanCapLimit).toBe(110_000); // floor(100,000 × 1.10)
    expect(r.housingTransitionalCap?.urbanDeterminedTax).toBe(110_000);
    expect(r.surtax.urbanAreaTax).toBe(110_000); // 도시지역분 상한이 부가세에 반영됨
  });

  it("TC-U2 회귀가드: isUrbanArea + 직전 도시지역분 미전달(종부세 경로) → 도시지역분 상한 미적용·본세 불변", () => {
    const base = {
      objectType: "housing" as const,
      publishedPrice: 518_000_000,
      isOneHousehold: true,
      isUrbanArea: true,
      targetDate: "2025-06-01",
      previousYearHousingBaseTax: 215_336,
    };
    const withUrban = calculatePropertyTax({
      ...base,
      previousYearHousingUrbanTax: 100_000,
    } as Input);
    const noUrban = calculatePropertyTax(base as Input); // 도시지역분 미전달 (종부세 내부 호출 모사)

    expect(noUrban.housingTransitionalCap?.urbanApplied).toBeUndefined();
    // 미전달 → 상한 미적용 → 산출(과세표준 × 0.14%) 그대로 → 상한값(110,000)보다 큼
    expect(noUrban.surtax.urbanAreaTax).toBeGreaterThan(withUrban.surtax.urbanAreaTax);
    // 도시지역분 게이트는 본세에 영향 없음 (양쪽 동일)
    expect(noUrban.determinedTax).toBe(withUrban.determinedTax);
  });

  it("TC-U3 구청 실측 end-to-end — 직전 본세·도시지역분 입력 시 확정 본세 236,869 / 도시지역분 305,630 재현", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 518_000_000,
      isOneHousehold: true,
      isUrbanArea: true,
      targetDate: "2025-06-01",
      previousYearHousingBaseTax: 215_336, // 구청 전년세액(상당액)
      previousYearHousingUrbanTax: 277_846, // 구청 전년 도시지역분(상당액)
    } as Input);
    // 세부담상한이 binding → 산출세액(2025 1세대1주택 FMR 미구성으로 구청과 다름)과 무관하게
    //   controlling value인 상한액이 구청 '상한세액'과 정확히 일치. 도시지역분 v2가 본 anchor의 핵심.
    expect(r.determinedTax).toBe(236_869); // 구청 본세 상한세액 = floor(215,336 × 1.10)
    expect(r.surtax.urbanAreaTax).toBe(305_630); // 구청 도시지역분 상한세액 = floor(277,846 × 1.10)
    expect(r.housingTransitionalCap?.urbanApplied).toBe(true);
    expect(r.housingTransitionalCap?.urbanCapLimit).toBe(305_630);
    // 지방교육세 = 확정 본세 × 20% = floor(236,869 × 0.20) = 47,373 (구청 일치)
    expect(r.surtax.localEducationTax).toBe(47_373);
  });
});

/**
 * v2 — 도시지역분 세부담상한 순수함수 (§118 본문 "각각 산출").
 *
 * ★구청 산출내역 원본(2025-07, 이미지24)으로 332원 미스터리 해소·실측 확정:
 *   도시지역분 과세표준 = 223,036,000 (= 본세 과표와 동일, §112①2호 법문대로).
 *   당해 산출 312,250 = floor(223,036,000 × 0.0014). 전년 도시지역분(상당액) 277,846.
 *   상한 = floor(277,846 × 1.10) = 305,630 (구청 '상한세액' 일치, 오차 0).
 *   (종전 274,680→302,148은 추정값. "환산과표 216,057,143"은 세액 역산 환각으로 철회.)
 */
describe("도시지역분 세부담상한 (§118 본문 각각 산출) — 순수함수", () => {
  it("U-1 도시지역분 110% — min(312,250, floor(277,846×1.10)=305,630)=305,630 (구청 실측)", () => {
    const r = applyHousingUrbanTransitionalCap(312_250, 518_000_000, 2025, 277_846);
    expect(r.applied).toBe(true);
    expect(r.capRate).toBe(1.1);
    expect(r.capLimit).toBe(305_630); // floor(277,846 × 1.10) — 구청 산출내역 '상한세액' 일치
    expect(r.determinedUrbanTax).toBe(305_630);
  });

  it("U-2 직전 도시지역분 미입력 → 상한 미적용 + warning", () => {
    const r = applyHousingUrbanTransitionalCap(312_250, 518_000_000, 2025, undefined);
    expect(r.applied).toBe(false);
    expect(r.determinedUrbanTax).toBe(312_250);
    expect(r.warnings.join()).toContain("직전연도 도시지역분 미입력");
  });

  it("U-3 본세와 동일 capRate 공유 (resolveHousingCapRate) — 공시 3억↓105% / 6억↑130%", () => {
    expect(
      applyHousingUrbanTransitionalCap(100_000, 250_000_000, 2025, 90_000).capRate,
    ).toBe(1.05);
    expect(
      applyHousingUrbanTransitionalCap(500_000, 700_000_000, 2025, 400_000).capRate,
    ).toBe(1.3);
  });

  it("U-4 2029년 → 경과조치 만료, 미적용", () => {
    const r = applyHousingUrbanTransitionalCap(312_250, 518_000_000, 2029, 274_680);
    expect(r.applied).toBe(false);
    expect(r.determinedUrbanTax).toBe(312_250);
    expect(r.warnings.join()).toContain("2028");
  });

  it("U-5 산출 < 상한 한도 → 산출 그대로 (min)", () => {
    // 직전 도시지역분이 크면 한도가 높아 당해 산출이 그대로 결정
    const r = applyHousingUrbanTransitionalCap(280_000, 518_000_000, 2025, 300_000);
    expect(r.applied).toBe(true);
    expect(r.capLimit).toBe(330_000); // floor(300,000 × 1.10)
    expect(r.determinedUrbanTax).toBe(280_000); // min(280,000, 330,000)
  });
});
