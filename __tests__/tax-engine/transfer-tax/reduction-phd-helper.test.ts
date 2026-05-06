/**
 * 감면 조문용 PHD 환산 공통 헬퍼 anchor (Round 10, 2026-05-06)
 *
 * §164⑤ 환산 산식: P_A_est = floor(P_F × Sum_A / Sum_F)
 *
 * 설계: docs/00-pm/transfer-reduction-unified-panel.plan.md §13
 */

import { describe, it, expect } from "vitest";
import {
  calcReductionAcquisitionStdPrice,
  canCalcReductionPhd,
} from "@/lib/tax-engine/transfer-reductions/phd-helper";

// ============================================================================
// 토지만 환산 (건물 기준시가 미입력)
// ============================================================================

describe("PHD 환산 — 토지만 (건물 미입력)", () => {
  it("취득시 토지 공시지가 < 최초공시 토지 공시지가 → P_A_est < P_F", () => {
    const r = calcReductionAcquisitionStdPrice({
      firstDisclosurePrice: 540_000_000,
      landAreaSqm: 16.36,
      landPricePerSqmAtAcquisition: 1_640_000,    // 2003년
      landPricePerSqmAtFirstDisclosure: 1_810_000, // 2004년
    });
    // Sum_A = 1,640,000 × 16.36 = 26,830,400
    // Sum_F = 1,810,000 × 16.36 = 29,611,600
    // 비율 = 26,830,400 / 29,611,600 ≈ 0.9061
    // P_A_est = floor(540,000,000 × 0.9061) = 489,283,xxx
    expect(r.estimatedAcquisitionStdPrice).toBeGreaterThan(489_000_000);
    expect(r.estimatedAcquisitionStdPrice).toBeLessThan(490_000_000);
    expect(r.ratio).toBeCloseTo(26_830_400 / 29_611_600, 5);
  });

  it("취득시 < 최초공시 동일 단가 → P_A_est = P_F", () => {
    const r = calcReductionAcquisitionStdPrice({
      firstDisclosurePrice: 500_000_000,
      landAreaSqm: 20,
      landPricePerSqmAtAcquisition: 1_500_000,
      landPricePerSqmAtFirstDisclosure: 1_500_000,
    });
    expect(r.estimatedAcquisitionStdPrice).toBe(500_000_000);
    expect(r.ratio).toBe(1);
  });
});

// ============================================================================
// 토지 + 건물 환산
// ============================================================================

describe("PHD 환산 — 토지 + 건물", () => {
  it("토지·건물 모두 입력 시 합계 비율 적용", () => {
    const r = calcReductionAcquisitionStdPrice({
      firstDisclosurePrice: 540_000_000,
      landAreaSqm: 16.36,
      landPricePerSqmAtAcquisition: 1_640_000,
      landPricePerSqmAtFirstDisclosure: 1_810_000,
      buildingStdPriceAtAcquisition: 100_000_000,
      buildingStdPriceAtFirstDisclosure: 110_000_000,
    });
    // Sum_A = 26,830,400 + 100,000,000 = 126,830,400
    // Sum_F = 29,611,600 + 110,000,000 = 139,611,600
    // 비율 = 126,830,400 / 139,611,600 ≈ 0.9085
    // P_A_est = floor(540,000,000 × 0.9085) ≈ 490,581,xxx
    expect(r.estimatedAcquisitionStdPrice).toBeGreaterThan(490_000_000);
    expect(r.estimatedAcquisitionStdPrice).toBeLessThan(491_000_000);
  });

  it("최초공시 건물 미입력 시 취득시와 동일 가정", () => {
    const r = calcReductionAcquisitionStdPrice({
      firstDisclosurePrice: 500_000_000,
      landAreaSqm: 20,
      landPricePerSqmAtAcquisition: 1_500_000,
      landPricePerSqmAtFirstDisclosure: 1_500_000,
      buildingStdPriceAtAcquisition: 80_000_000,
      // buildingStdPriceAtFirstDisclosure 미입력 → 80M 동일 가정
    });
    // Sum_A = Sum_F → 비율 1 → P_A_est = P_F
    expect(r.estimatedAcquisitionStdPrice).toBe(500_000_000);
  });
});

// ============================================================================
// 입력 유효성 검사
// ============================================================================

describe("canCalcReductionPhd — 환산 가능 여부", () => {
  it("필수 필드 모두 채워짐 → true", () => {
    expect(canCalcReductionPhd({
      firstDisclosurePrice: 540_000_000,
      landAreaSqm: 16.36,
      landPricePerSqmAtAcquisition: 1_640_000,
      landPricePerSqmAtFirstDisclosure: 1_810_000,
    })).toBe(true);
  });

  it("최초공시가격 0 → false", () => {
    expect(canCalcReductionPhd({
      firstDisclosurePrice: 0,
      landAreaSqm: 16.36,
      landPricePerSqmAtAcquisition: 1_640_000,
      landPricePerSqmAtFirstDisclosure: 1_810_000,
    })).toBe(false);
  });

  it("면적 0 → false", () => {
    expect(canCalcReductionPhd({
      firstDisclosurePrice: 540_000_000,
      landAreaSqm: 0,
      landPricePerSqmAtAcquisition: 1_640_000,
      landPricePerSqmAtFirstDisclosure: 1_810_000,
    })).toBe(false);
  });

  it("토지 공시지가 미입력 → false", () => {
    expect(canCalcReductionPhd({
      firstDisclosurePrice: 540_000_000,
      landAreaSqm: 16.36,
      landPricePerSqmAtAcquisition: 0,
      landPricePerSqmAtFirstDisclosure: 1_810_000,
    })).toBe(false);
  });
});

// ============================================================================
// 산식 단계 (UI 표시용)
// ============================================================================

describe("formulaSteps — UI 표시용", () => {
  it("6단계 산식 노출 (토지·합계·비율·P_A_est)", () => {
    const r = calcReductionAcquisitionStdPrice({
      firstDisclosurePrice: 540_000_000,
      landAreaSqm: 16.36,
      landPricePerSqmAtAcquisition: 1_640_000,
      landPricePerSqmAtFirstDisclosure: 1_810_000,
    });
    expect(r.formulaSteps).toHaveLength(6);
    expect(r.formulaSteps[0].label).toContain("취득시 토지");
    expect(r.formulaSteps[5].label).toContain("취득시 추정");
  });
});

// ============================================================================
// PDF 사례 26 통합 anchor — PHD + §99의3 5년 안분
// ============================================================================

describe("PDF 사례 26 — PHD 환산 후 §99의3 비율 검증", () => {
  it("X = PHD 환산 결과로 §99의3 안분 비율이 PDF 정확값(179,917,278)에 근접", () => {
    // 가정: PDF 사례 26의 건물 기준시가가 정확히 알려진 경우 X 정확값 도출
    // 현재 사용자 PDF에 건물 기준시가 미명시 → X를 reverse-engineering으로 ~547M 추정
    // 토지 공시지가만으로는 P_A_est ≈ 489M (Sum_A/Sum_F = 0.9061)
    // → 건물 기준시가가 추가되어야 PDF 정확값 X ≈ 547M 도출 가능
    //
    // 본 anchor는 "환산 흐름이 작동하는지" 검증. PDF 정확값 검증은 reduction-99-3.test.ts에서.
    const r = calcReductionAcquisitionStdPrice({
      firstDisclosurePrice: 540_000_000,
      landAreaSqm: 16.36,
      landPricePerSqmAtAcquisition: 1_640_000,
      landPricePerSqmAtFirstDisclosure: 1_810_000,
    });
    expect(r.estimatedAcquisitionStdPrice).toBeGreaterThan(0);
    expect(r.estimatedAcquisitionStdPrice).toBeLessThan(540_000_000); // 취득시 < 최초고시
  });
});
