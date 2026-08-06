/**
 * 재산세 분리과세대상 테스트 (P5-10~14)
 *
 * [P5-10] 저율(0.07%) 테스트 4건
 *   TC-01: 자경 농지 → 0.07%, legalBasis = LOW_RATE_FARMLAND
 *   TC-02: 목장용지 (축산업 등록) → 0.07%, legalBasis = LOW_RATE_LIVESTOCK
 *   TC-03: 보전산지 → 0.07%, legalBasis = LOW_RATE_FOREST
 *   TC-04: 농지이나 isFarmland=false → 분리과세 비해당
 *
 * [P5-11] 일반(0.2%) 테스트 3건
 *   TC-05: 공장용지 산업단지 → 0.2%
 *   TC-06: 공장용지 도시지역 → 0.2% + 기준면적 초과 warning
 *   TC-07: 염전 → 0.2%, legalBasis = STANDARD_SALT_FIELD
 *   TC-08: 공영주차장 → 0.2%, legalBasis = STANDARD_TERMINAL
 *
 * [P5-12] 중과(4%) 테스트 4건 (대중제 배제 포함)
 *   TC-09: 회원제 골프장 → 4%, HEAVY_GOLF_MEMBER
 *   TC-10: 대중제 골프장 → 중과 배제, isApplicable=false + warning
 *   TC-11: 간이 골프장 → 중과 배제 warning
 *   TC-12: 골프장 유형 미입력 → 경고 + 중과 미적용
 *   TC-13: 고급오락장 → 4%, HEAVY_ENTERTAINMENT
 *
 * [P5-13] 정밀도 테스트 3건
 *   TC-14: 시가표준액 1억 → taxBase 7,000만 → 저율 세액 49,000원
 *   TC-15: 대형 시가표준액 (BigInt 오버플로 없음)
 *   TC-16: 천원 절사 정확도 — 999원 이하 절사
 *
 * [P5-14] 경계·배제관계 테스트 3건
 *   TC-17: 우선순위 — 중과 + 저율 동시 해당 시 중과 우선
 *   TC-18: excludedFrom 배열에 'comprehensive', 'special_aggregated' 포함
 *   TC-19: 비해당 → isExcludedFromComprehensiveTax = false
 *   TC-20: 중과 해당 → isExcludedFromComprehensiveTax = true
 */

import { describe, it, expect } from "vitest";
import {
  classifySeparateTaxation,
  calculateSeparateTaxationTax,
  calculateSeparateTax,
  isExcludedFromComprehensiveTax,
} from "../../lib/tax-engine/separate-taxation";
import type { SeparateTaxationInput } from "../../lib/tax-engine/separate-taxation";
import { PROPERTY } from "../../lib/tax-engine/legal-codes";

// ── 픽스처 팩토리 ──

function makeInput(overrides: Partial<SeparateTaxationInput> = {}): SeparateTaxationInput {
  return {
    assessedValue: 100_000_000, // 시가표준액 1억원
    ...overrides,
  };
}

/**
 * 공장용지 픽스처 — 면적 한도 입력을 갖춘 기본형 (2026-08-06 신설).
 *
 * 연면적 1,200㎡ ÷ 면적률 12% = 산출면적 10,000㎡.
 * 비제한지역이라 별표6 3호가2)로 20%(2,000㎡)까지 추가 인정 → 한도 최대 12,000㎡.
 * 부속토지 8,000㎡는 그 이내라 전량 분리과세.
 */
function makeFactoryInput(overrides: Partial<SeparateTaxationInput> = {}): SeparateTaxationInput {
  return makeInput({
    isFactoryLand: true,
    factoryLocation: "industrial_zone",
    factoryTotalLandArea: 8000,
    factoryFloorArea: 1200,
    factoryAreaRatePercent: 12,
    ...overrides,
  });
}

// ============================================================
// [P5-10] 저율(0.07%) 테스트 (TC-01~04)
// ============================================================

describe("P5-10: 저율 분리과세 (0.07%)", () => {
  it("TC-01: 자경 농지 → 저율 0.07%, legalBasis = LOW_RATE_FARMLAND", () => {
    const result = calculateSeparateTax(makeInput({ isFarmland: true }));

    expect(result.isApplicable).toBe(true);
    expect(result.category).toBe("low_rate");
    expect(result.appliedRate).toBe(0.0007);
    expect(result.reasoning.legalBasis).toBe(PROPERTY.SEPARATE.LOW_RATE_FARMLAND);
    expect(result.reasoning.excludedFrom).toContain("comprehensive");
    expect(result.reasoning.excludedFrom).toContain("special_aggregated");
  });

  // 🔴 계약 정정 (2026-08-06) — §102①3호는 "가축별 기준면적으로 계산한 토지면적의 **범위에서**
  //    소유하는 토지"로 한정한다. 종전에는 `isLivestockFarm` 플래그만으로 전량 0.07%를 줬다.
  //    이제 축종·마릿수·전체 면적이 필수다(미입력은 던진다 — TC-02c).
  it("TC-02: 목장용지 + 기준면적 이내 → 저율 0.07%, legalBasis = LOW_RATE_LIVESTOCK", () => {
    // 한우 사육 10두 · 넷 다 보유 → 7,512.5 × 10 = 75,125㎡ 한도 · 목장 40,000㎡ → 이내
    const result = calculateSeparateTax(
      makeInput({
        isLivestockFarm: true,
        pastureTotalLandArea: 40000,
        pastureLivestockType: "hanwoo_breeding",
        pastureLivestockCount: 10,
        pastureHasFacility: true,
        pastureHasGrassland: true,
        pastureHasFodder: true,
      }),
    );

    expect(result.isApplicable).toBe(true);
    expect(result.category).toBe("low_rate");
    expect(result.appliedRate).toBe(0.0007);
    expect(result.reasoning.legalBasis).toBe(PROPERTY.SEPARATE.LOW_RATE_LIVESTOCK);
    expect(result.pastureAreaCheck?.excessArea).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("TC-02b: 기준면적 초과분은 종합합산 이관 안내 + 과세표준이 인정분에만 매겨진다", () => {
    // 한우 사육 1두 · 축사+부대시설+초지 → 한도 5,012.5㎡ · 목장 10,025㎡ → 인정 비율 정확히 0.5
    const result = calculateSeparateTax(
      makeInput({
        isLivestockFarm: true,
        pastureTotalLandArea: 10025,
        pastureLivestockType: "hanwoo_breeding",
        pastureLivestockCount: 1,
        pastureHasFacility: true,
        pastureHasGrassland: true,
        pastureHasFodder: false,
      }),
    );

    expect(result.pastureAreaCheck?.standardArea).toBe(5012.5);
    expect(result.pastureAreaCheck?.recognizedRatio).toBe(0.5);
    expect(result.pastureAreaCheck?.recognizedAssessedValue).toBe(50_000_000);
    // 1억 × 50% = 5,000만 × 70% = 3,500만 × 0.07% = 24,500원
    expect(result.taxBase).toBe(35_000_000);
    expect(result.calculatedTax).toBe(24_500);
    expect(result.warnings.some((w) => w.includes("종합합산과세대상으로 이관"))).toBe(true);
  });

  it("TC-02c: 축종·마릿수 미입력은 던진다 (모른 채 유리하게 주지 않는다)", () => {
    expect(() => calculateSeparateTax(makeInput({ isLivestockFarm: true }))).toThrow(
      /목장용지 전체 면적/,
    );
    expect(() =>
      calculateSeparateTax(makeInput({ isLivestockFarm: true, pastureTotalLandArea: 10000 })),
    ).toThrow(/축종/);
  });

  it("TC-02d: §102⑨1호 — 도시지역 목장용지는 1989.12.31 이전 소유가 아니면 비해당", () => {
    const result = calculateSeparateTax(
      makeInput({
        isLivestockFarm: true,
        pastureTotalLandArea: 1000,
        pastureLivestockType: "hanwoo_breeding",
        pastureLivestockCount: 10,
        pastureIsUrbanArea: true,
        pastureOwnedBefore1990: false,
      }),
    );

    expect(result.isApplicable).toBe(false);
    expect(result.warnings.some((w) => w.includes("§102⑨1호"))).toBe(true);
  });

  it("TC-03: 보전산지 → 저율 0.07%, legalBasis = LOW_RATE_FOREST", () => {
    const result = calculateSeparateTax(makeInput({ isProtectedForest: true }));

    expect(result.isApplicable).toBe(true);
    expect(result.category).toBe("low_rate");
    expect(result.appliedRate).toBe(0.0007);
    expect(result.reasoning.legalBasis).toBe(PROPERTY.SEPARATE.LOW_RATE_FOREST);
  });

  it("TC-04: 농지 지목이나 isFarmland=false → 분리과세 비해당 (종합합산 판정 필요)", () => {
    const result = calculateSeparateTax(
      makeInput({ landCategory: "전", isFarmland: false }),
    );

    expect(result.isApplicable).toBe(false);
    expect(result.reasoning.excludedFrom).toHaveLength(0);
  });
});

// ============================================================
// [P5-11] 일반(0.2%) 테스트 (TC-05~08)
// ============================================================

describe("P5-11: 일반 분리과세 (0.2%)", () => {
  it("TC-05: 공장용지 산업단지 + 기준면적 이내 → 0.2%, STANDARD_FACTORY, warning 없음", () => {
    const result = calculateSeparateTax(makeFactoryInput());

    expect(result.isApplicable).toBe(true);
    expect(result.category).toBe("standard");
    expect(result.appliedRate).toBe(0.002);
    expect(result.reasoning.legalBasis).toBe(PROPERTY.SEPARATE.STANDARD_FACTORY);
    expect(result.warnings).toHaveLength(0);
    // 이내이므로 전액이 분리과세 과세표준 산정 대상
    expect(result.factoryAreaCheck?.excessArea).toBe(0);
    expect(result.factoryAreaCheck?.recognizedAssessedValue).toBe(100_000_000);
  });

  /**
   * 🔴 계약 정정 (2026-08-06) — **세액이 바뀐다**.
   *
   * 종전: `factoryLocation === "urban"` → 0.2% 분리과세 + 경고만
   * 정정: 분리과세 **비해당**(`isApplicable: false`) → 별도합산으로 안내
   *
   * 근거(법제처 MST 287223 실측): 「지방세법 시행령」 §102①1호는 분리과세 공장용지를
   * §101①1호 **각 목**(가.읍·면지역 / 나.산업단지 / 다.공업지역)으로 한정한다. §101①1호
   * **본문**은 "특별시·광역시(군 제외)·특별자치시·특별자치도 및 시지역(각 목 제외)"의
   * 공장용지를 **별도합산**으로 정한다 ⇒ 두 조문은 소재 지역으로 **배타 분기**한다.
   */
  it("TC-06: 공장용지 그 밖의 시지역 → 분리과세 **비해당** (§101①1호 별도합산)", () => {
    const result = calculateSeparateTax(
      makeInput({ isFactoryLand: true, factoryLocation: "urban" }),
    );

    expect(result.isApplicable).toBe(false);
    expect(result.appliedRate).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("별도합산");
    expect(result.warnings[0]).toContain("§101①1호");
  });

  it("TC-06b: 읍·면지역·도시지역 외는 종전대로 0.2% 분리과세다", () => {
    const result = calculateSeparateTax(makeFactoryInput({ factoryLocation: "other" }));

    expect(result.isApplicable).toBe(true);
    expect(result.appliedRate).toBe(0.002);
    expect(result.reasoning.legalBasis).toBe(PROPERTY.SEPARATE.STANDARD_FACTORY);
    expect(result.warnings).toHaveLength(0);
  });

  it("TC-07: 염전 → 0.2%, legalBasis = STANDARD_SALT_FIELD", () => {
    const result = calculateSeparateTax(makeInput({ isSaltField: true }));

    expect(result.isApplicable).toBe(true);
    expect(result.category).toBe("standard");
    expect(result.appliedRate).toBe(0.002);
    expect(result.reasoning.legalBasis).toBe(PROPERTY.SEPARATE.STANDARD_SALT_FIELD);
  });

  it("TC-08: 공영주차장 → 0.2%, legalBasis = STANDARD_TERMINAL", () => {
    const result = calculateSeparateTax(makeInput({ isTerminalOrParking: true }));

    expect(result.isApplicable).toBe(true);
    expect(result.category).toBe("standard");
    expect(result.appliedRate).toBe(0.002);
    expect(result.reasoning.legalBasis).toBe(PROPERTY.SEPARATE.STANDARD_TERMINAL);
  });
});

// ============================================================
// [P5-12] 중과(4%) 테스트 (TC-09~13)
// ============================================================

describe("P5-12: 중과 분리과세 (4%) — 대중제 배제 포함", () => {
  it("TC-09: 회원제 골프장 → 4%, legalBasis = HEAVY_GOLF_MEMBER", () => {
    const result = calculateSeparateTax(
      makeInput({ isGolfCourse: true, golfCourseType: "member" }),
    );

    expect(result.isApplicable).toBe(true);
    expect(result.category).toBe("heavy");
    expect(result.appliedRate).toBe(0.04);
    expect(result.reasoning.legalBasis).toBe(PROPERTY.SEPARATE.HEAVY_GOLF_MEMBER);
    expect(result.warnings).toHaveLength(0);
  });

  it("TC-10: 대중제 골프장 → 중과 배제, isApplicable=false + warning", () => {
    const result = calculateSeparateTax(
      makeInput({ isGolfCourse: true, golfCourseType: "public" }),
    );

    expect(result.isApplicable).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("대중제");
  });

  it("TC-11: 간이 골프장 → 중과 배제, warning에 '간이' 포함", () => {
    const result = calculateSeparateTax(
      makeInput({ isGolfCourse: true, golfCourseType: "simple" }),
    );

    expect(result.isApplicable).toBe(false);
    expect(result.warnings.some((w) => w.includes("간이"))).toBe(true);
  });

  it("TC-12: 골프장 유형 미입력 → 경고 + 중과 미적용 (isApplicable=false)", () => {
    const result = calculateSeparateTax(
      makeInput({ isGolfCourse: true }), // golfCourseType 없음
    );

    expect(result.isApplicable).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("golfCourseType");
  });

  it("TC-13: 고급오락장 → 4%, legalBasis = HEAVY_ENTERTAINMENT", () => {
    const result = calculateSeparateTax(
      makeInput({ isHighClassEntertainment: true }),
    );

    expect(result.isApplicable).toBe(true);
    expect(result.category).toBe("heavy");
    expect(result.appliedRate).toBe(0.04);
    expect(result.reasoning.legalBasis).toBe(PROPERTY.SEPARATE.HEAVY_ENTERTAINMENT);
    expect(result.reasoning.excludedFrom).toContain("comprehensive");
    expect(result.reasoning.excludedFrom).toContain("special_aggregated");
  });
});

// ============================================================
// [P5-13] 정밀도 테스트 (TC-14~16)
// ============================================================

describe("P5-13: 세액 정밀도 — 천원 절사·BigInt overflow 없음", () => {
  it("TC-14: 시가표준액 1억원 → taxBase 70,000,000원 → 저율 세액 49,000원", () => {
    // 과세표준 = 100,000,000 × 70% = 70,000,000 (천원 단위 절사 후 동일)
    // 세액 = floor(70,000,000 × 0.0007) = floor(49,000) = 49,000
    const result = calculateSeparateTax(
      makeInput({ assessedValue: 100_000_000, isFarmland: true }),
    );

    expect(result.taxBase).toBe(70_000_000);
    expect(result.fairMarketRatio).toBe(0.70);
    expect(result.calculatedTax).toBe(49_000);
  });

  it("TC-15: 시가표준액 999,999원 → 과세표준 699,999 (지방세법 §113 절사 규정 없음)", () => {
    // 999,999 × 70% = 699,999.3 → applyRate(floor) = 699,999 (원 단위)
    const result = calculateSeparateTax(
      makeInput({ assessedValue: 999_999, isFarmland: true }),
    );

    expect(result.taxBase).toBe(699_999);
  });

  it("TC-16: 초대형 시가표준액 (100조원) → BigInt overflow 없이 계산", () => {
    // 100조원 × 70% = 70조원 → 과세표준
    // 일반 0.2% 적용 → 세액 1,400억원 이상 (Number 범위 내)
    const hugeValue = 100_000_000_000_000; // 100조
    const result = calculateSeparateTax(
      makeInput({ assessedValue: hugeValue, isTerminalOrParking: true }),
    );

    expect(result.isApplicable).toBe(true);
    expect(result.taxBase).toBeGreaterThan(0);
    expect(result.calculatedTax).toBeGreaterThan(0);
    expect(Number.isFinite(result.calculatedTax!)).toBe(true);
  });
});

// ============================================================
// [P5-14] 경계·배제관계 테스트 (TC-17~20)
// ============================================================

describe("P5-14: 경계·배제관계", () => {
  it("TC-17: 중과 + 저율 동시 해당 → 중과(4%) 우선 판정", () => {
    // 회원제 골프장이면서 isFarmland=true → 중과 우선
    const result = calculateSeparateTax(
      makeInput({
        isGolfCourse: true,
        golfCourseType: "member",
        isFarmland: true, // 저율 조건도 충족
      }),
    );

    expect(result.category).toBe("heavy");
    expect(result.appliedRate).toBe(0.04);
  });

  it("TC-18: 분리과세 해당 시 excludedFrom에 comprehensive + special_aggregated 모두 포함", () => {
    const result = classifySeparateTaxation(makeInput({ isSaltField: true }));

    expect(result.reasoning.excludedFrom).toContain("comprehensive");
    expect(result.reasoning.excludedFrom).toContain("special_aggregated");
    expect(result.reasoning.excludedFrom).toHaveLength(2);
  });

  it("TC-19: 분리과세 비해당 → isExcludedFromComprehensiveTax = false", () => {
    const result = classifySeparateTaxation(makeInput({}));

    expect(result.isApplicable).toBe(false);
    expect(isExcludedFromComprehensiveTax(result)).toBe(false);
  });

  it("TC-20: 중과 분리과세 → isExcludedFromComprehensiveTax = true", () => {
    const result = classifySeparateTaxation(
      makeInput({ isHighClassEntertainment: true }),
    );

    expect(result.isApplicable).toBe(true);
    expect(isExcludedFromComprehensiveTax(result)).toBe(true);
  });

  it("TC-21: calculateSeparateTaxationTax 직접 호출 — 세액 정확도", () => {
    // 판정 후 세액 계산 분리 호출
    const input = makeInput({ assessedValue: 50_000_000, isFarmland: true });
    const classification = classifySeparateTaxation(input);
    const result = calculateSeparateTaxationTax(classification, input.assessedValue);

    // 5천만 × 70% = 3,500만 → 세액 = floor(35,000,000 × 0.0007) = 24,500
    expect(result.taxBase).toBe(35_000_000);
    expect(result.calculatedTax).toBe(24_500);
  });
});
