/**
 * 재산세 메인 엔진 단위 테스트
 *
 * T01~T05: calcTaxBase — 공정시장가액비율 (지방세법 §110, 절사 규정 없음)
 * T06~T10: calcHousingTax — 일반 4구간 + 1세대1주택 특례
 * T11~T12: calcBuildingTax — 일반 / 사치성
 * T13~T15: applyTaxCap — §122 단서(주택 미적용) + 비주택 150% + 전년도 미입력
 * T16~T18: calcSurtax — 지방교육세·도시지역분·지역자원시설세(§146③1호 6구간 초과누진)
 * T19~T21: calculatePropertyTax — 통합 시나리오
 * T22~T23: 종부세 연동 시나리오 (P1-17)
 * R1 회귀: 주택 세부담상한 배제·§146③ 세율표·2026 1세대1주택 공정시장가액비율
 */

import { describe, it, expect } from "vitest";
import {
  calcTaxBase,
  calcHousingTax,
  calcBuildingTax,
  applyTaxCap,
  calcSurtax,
  calculatePropertyTax,
  applyHousingTaxBaseCap,
} from "../../lib/tax-engine/property-tax";

// ============================================================
// T01~T05: calcTaxBase
// ============================================================

describe("calcTaxBase — 공정시장가액비율 (원 단위)", () => {
  it("T01: 주택 10억 → 과세표준 6억 (60%)", () => {
    const { taxBase, fairMarketRatio } = calcTaxBase(1_000_000_000, "housing");
    expect(fairMarketRatio).toBe(0.60);
    expect(taxBase).toBe(600_000_000);
  });

  it("T02: 토지 1억 → 과세표준 7,000만 (70%)", () => {
    const { taxBase, fairMarketRatio } = calcTaxBase(100_000_000, "land");
    expect(fairMarketRatio).toBe(0.70);
    expect(taxBase).toBe(70_000_000);
  });

  it("T03: 건축물 5억 → 과세표준 3.5억 (70%)", () => {
    const { taxBase } = calcTaxBase(500_000_000, "building");
    expect(taxBase).toBe(350_000_000);
  });

  it("T04: 주택 1억 1,500원 → 원 단위 그대로 (지방세법 §110 절사 규정 없음)", () => {
    // 100_001_500 × 0.60 = 60_000_900 (원 단위 유지)
    const { taxBase } = calcTaxBase(100_001_500, "housing");
    expect(taxBase).toBe(60_000_900);
  });

  it("T05: 공시가격 0원 → 과세표준 0원", () => {
    const { taxBase } = calcTaxBase(0, "housing");
    expect(taxBase).toBe(0);
  });
});

// ============================================================
// T06~T10: calcHousingTax
// ============================================================

describe("calcHousingTax — 일반 4구간 + 1세대1주택 특례", () => {
  it("T06: 과세표준 6천만 이하 → 일반 0.1% (경계값)", () => {
    // 60_000_000 × 0.001 - 0 = 60_000
    const { tax, appliedRate } = calcHousingTax(60_000_000, 200_000_000, false);
    expect(appliedRate).toBe(0.001);
    expect(tax).toBe(60_000);
  });

  it("T07: 과세표준 1억5천만 이하 → 일반 0.15% 구간", () => {
    // 150_000_000 × 0.0015 - 30_000 = 225_000 - 30_000 = 195_000
    const { tax, appliedRate } = calcHousingTax(150_000_000, 400_000_000, false);
    expect(appliedRate).toBe(0.0015);
    expect(tax).toBe(195_000);
  });

  it("T08: 과세표준 3억 경계 → 일반 0.25% 구간", () => {
    // 300_000_000 × 0.0025 - 180_000 = 750_000 - 180_000 = 570_000
    const { tax } = calcHousingTax(300_000_000, 500_000_000, false);
    expect(tax).toBe(570_000);
  });

  it("T09: 과세표준 3억 초과 → 일반 0.4% 최고 구간", () => {
    // 400_000_000 × 0.004 - 630_000 = 1_600_000 - 630_000 = 970_000
    const { tax, appliedRate } = calcHousingTax(400_000_000, 700_000_000, false);
    expect(appliedRate).toBe(0.004);
    expect(tax).toBe(970_000);
  });

  it("T10: 1세대1주택 특례 — 공시가격 9억 이하, 과세표준 6천만 → 0.05%", () => {
    // 60_000_000 × 0.0005 - 0 = 30_000
    const { tax, appliedRate, oneHouseSpecialApplied } =
      calcHousingTax(60_000_000, 800_000_000, true);
    expect(appliedRate).toBe(0.0005);
    expect(tax).toBe(30_000);
    expect(oneHouseSpecialApplied).toBe(true);
  });

  it("T10-a: 1세대1주택 신청 BUT 공시가격 9억 초과 → 일반 세율 적용", () => {
    const { oneHouseSpecialApplied } =
      calcHousingTax(400_000_000, 1_000_000_000, true);
    expect(oneHouseSpecialApplied).toBe(false);
  });
});

// ============================================================
// T11~T12: calcBuildingTax
// ============================================================

describe("calcBuildingTax — 건축물 세율", () => {
  it("T11: 일반 건축물 → 0.25%", () => {
    // 100_000_000 × 0.0025 = 250_000
    const { tax, appliedRate } = calcBuildingTax(100_000_000, "general");
    expect(appliedRate).toBe(0.0025);
    expect(tax).toBe(250_000);
  });

  it("T12: 골프장 → 4%", () => {
    // 100_000_000 × 0.04 = 4_000_000
    const { tax, appliedRate } = calcBuildingTax(100_000_000, "golf_course");
    expect(appliedRate).toBe(0.04);
    expect(tax).toBe(4_000_000);
  });

  it("T12-a: 고급오락장 → 4%", () => {
    const { tax } = calcBuildingTax(50_000_000, "luxury");
    expect(tax).toBe(2_000_000);
  });
});

// ============================================================
// T13~T15: applyTaxCap
// ============================================================

describe("applyTaxCap — 세부담상한 (§122, R1 회귀)", () => {
  it("T13: 주택 → §122 단서로 상한 미적용 (전년도 입력해도 산출세액 그대로)", () => {
    // 산출 300만, 전년 200만 — 구법이라면 105~130% 상한 절단. 현행법은 주택 배제.
    const { determinedTax, taxCapRate, warnings } = applyTaxCap(
      3_000_000, "housing", 2_000_000
    );
    expect(taxCapRate).toBe(1);
    expect(determinedTax).toBe(3_000_000);
    expect(warnings.some((w) => w.includes("주택은 세부담상한"))).toBe(true);
  });

  it("T13-a: 주택 + 전년도 미입력 → 상한 미적용 + 안내 warning 없음", () => {
    const { determinedTax, taxCapRate, warnings } = applyTaxCap(
      1_200_000, "housing"
    );
    expect(taxCapRate).toBe(1);
    expect(determinedTax).toBe(1_200_000);
    expect(warnings).toHaveLength(0);
  });

  it("T14: 건축물 → 150% 상한 (전년 100만 → 상한 150만)", () => {
    const { determinedTax, taxCapRate } = applyTaxCap(
      2_000_000, "building", 1_000_000
    );
    expect(taxCapRate).toBe(1.50);
    expect(determinedTax).toBe(1_500_000);
  });

  it("T14-b: 토지 → 150% 상한", () => {
    const { taxCapRate } = applyTaxCap(2_000_000, "land", 1_000_000);
    expect(taxCapRate).toBe(1.50);
  });

  it("T15: 비주택 전년도 세액 미입력 → 상한 미적용 + warning", () => {
    const { determinedTax, taxCapRate, warnings } = applyTaxCap(
      1_200_000, "land"
    );
    expect(taxCapRate).toBe(1);
    expect(determinedTax).toBe(1_200_000);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("전년도 납부세액 미입력");
  });

  it("T15-a: 산출세액이 상한 미만 → 산출세액 그대로 반환 (토지)", () => {
    // calculatedTax=80만 < 상한=100만×1.5=150만 → 80만 유지
    const { determinedTax } = applyTaxCap(800_000, "land", 1_000_000);
    expect(determinedTax).toBe(800_000);
  });
});

// ============================================================
// T16~T18: calcSurtax
// ============================================================

describe("calcSurtax — 지방교육세·도시지역분·지역자원시설세", () => {
  it("T16: 지방교육세 = 재산세 × 20%", () => {
    const { surtax } = calcSurtax(
      1_000_000, 600_000_000, 1_000_000_000, "housing", false
    );
    expect(surtax.localEducationTax).toBe(200_000);
  });

  it("T17: 도시지역 주택 → 도시지역분 과세 (0.14%)", () => {
    // taxBase=600_000_000 × 0.0014 = 840_000
    const { surtax } = calcSurtax(
      1_000_000, 600_000_000, 1_000_000_000, "housing", true
    );
    expect(surtax.urbanAreaTax).toBe(840_000);
  });

  it("T17-a: 비도시지역 → 도시지역분 0원", () => {
    const { surtax } = calcSurtax(
      1_000_000, 600_000_000, 1_000_000_000, "housing", false
    );
    expect(surtax.urbanAreaTax).toBe(0);
  });

  it("T18: 건축물 → 소방분 지역자원시설세 초과누진 (§146③1호, R1 회귀)", () => {
    // 시가표준액 3억 (6,400만 초과): 49,100 + (3억 − 6,400만) × 12/10,000 = 332,300
    const { surtax } = calcSurtax(
      250_000, 210_000_000, 300_000_000, "building", false
    );
    expect(surtax.regionalResourceTax).toBe(332_300);
  });

  it("T18-b: §146③1호 6구간 경계값 전수 (R1 회귀)", () => {
    // 법정 표의 구간별 누계세액(base)과 경계 산식 일치 검증
    const cases: [number, number][] = [
      [6_000_000, 2_400],     // 600만 × 4/10,000
      [10_000_000, 4_400],    // 2,400 + 400만 × 5/10,000
      [13_000_000, 5_900],    // 2,400 + 700만 × 5/10,000 (법정 2구간 누계)
      [26_000_000, 13_700],   // 법정 3구간 누계
      [39_000_000, 24_100],   // 법정 4구간 누계
      [64_000_000, 49_100],   // 법정 5구간 누계
      [100_000_000, 92_300],  // 49,100 + 3,600만 × 12/10,000
    ];
    for (const [price, expected] of cases) {
      const { surtax } = calcSurtax(0, 0, price, "building", false);
      expect(surtax.regionalResourceTax).toBe(expected);
    }
  });

  it("T18-a: 주택 → 지역자원시설세 0원", () => {
    const { surtax } = calcSurtax(
      1_000_000, 600_000_000, 1_000_000_000, "housing", false
    );
    expect(surtax.regionalResourceTax).toBe(0);
  });
});

// ============================================================
// T19~T21: calculatePropertyTax — 통합 시나리오
// ============================================================

describe("calculatePropertyTax — 통합 시나리오", () => {
  it("T19: 주택 공시가격 2억, 일반, 도시지역, 전년도 없음", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 200_000_000,
      isOneHousehold: false,
      isUrbanArea: true,
    });

    // 과세표준 = 200_000_000 × 0.60 = 120_000_000
    expect(result.taxBase).toBe(120_000_000);
    // 세율 0.15% 구간: 120_000_000 × 0.0015 - 30_000 = 180_000 - 30_000 = 150_000
    expect(result.calculatedTax).toBe(150_000);
    // 주택은 세부담상한 미적용 (§122 단서)
    expect(result.taxCapRate).toBe(1);
    expect(result.determinedTax).toBe(150_000);
    // 지방교육세 = 150_000 × 0.20 = 30_000
    expect(result.surtax.localEducationTax).toBe(30_000);
    // 도시지역분 = 120_000_000 × 0.0014 = 168_000
    expect(result.surtax.urbanAreaTax).toBe(168_000);
    // 분납 안내: 150_000 < 200_000 → 불가
    expect(result.installment.eligible).toBe(false);
    // 주택은 전년도 세액 안내 warning 없음 (§122 단서 — R1 회귀)
    expect(result.warnings.some(w => w.includes("전년도 납부세액 미입력"))).toBe(false);
  });

  it("T20: 주택 공시가격 3억, 1세대1주택, 2026년 — 비율 43% + 특례세율 + 상한 미적용", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 300_000_000,
      isOneHousehold: true,
      isUrbanArea: false,
      previousYearTax: 300_000,
      targetDate: "2026-06-01",
    });

    // 과세표준 = 300_000_000 × 0.43 = 129_000_000 (시행령 §109①2호 단서, 3억 이하 43%)
    expect(result.fairMarketRatio).toBe(0.43);
    expect(result.taxBase).toBe(129_000_000);
    // 특례세율 적용 (공시가격 3억 ≤ 9억)
    expect(result.oneHouseSpecialApplied).toBe(true);
    // 특례 세율 0.1% 구간 (1.5억 이하): 129_000_000 × 0.001 - 30_000 = 99_000
    expect(result.calculatedTax).toBe(99_000);
    // 주택 2026년: 직전본세(previousYearHousingBaseTax) 미입력 → 부칙 제15조 경과조치 미적용 안내
    expect(result.taxCapRate).toBe(1);
    expect(result.determinedTax).toBe(99_000);
    expect(result.warnings.some((w) => w.includes("세부담상한"))).toBe(true);
  });

  it("T21: 건축물 일반, 공시가격 5억, 비도시지역", () => {
    const result = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 500_000_000,
      buildingType: "general",
      isUrbanArea: false,
    });

    // 과세표준 = 500_000_000 × 0.70 = 350_000_000
    expect(result.taxBase).toBe(350_000_000);
    // 세율 0.25%: 350_000_000 × 0.0025 = 875_000
    expect(result.calculatedTax).toBe(875_000);
    // 소방분 지역자원시설세 (§146③1호): 49,100 + (5억 − 6,400만) × 12/10,000 = 572,300
    expect(result.surtax.regionalResourceTax).toBe(572_300);
    // 분납: 비주택(건축물) 기준 250만원 초과여야 가능 (지방세법 §115①)
    // 875_000 < 2_500_000 → 분납 불가
    expect(result.installment.eligible).toBe(false);
    expect(result.installment.firstPayment).toBe(875_000);
    expect(result.installment.secondPayment).toBe(0);
  });
});

// ============================================================
// T22~T23: 종부세 연동 시나리오 (P1-17)
// ============================================================

describe("종부세 연동 — taxBase·determinedTax 타입 호환성", () => {
  it("T22: 주택 A — taxBase·determinedTax number 타입 반환", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 800_000_000,
      isOneHousehold: false,
      isUrbanArea: false,
    });

    // 종부세 연동 필드 타입 검증
    expect(typeof result.taxBase).toBe("number");
    expect(typeof result.determinedTax).toBe("number");
    expect(result.taxBase).toBeGreaterThan(0);
    expect(result.determinedTax).toBeGreaterThan(0);
  });

  it("T23: 2주택 시나리오 — 각 주택 독립 계산 후 taxBase 합산 가능", () => {
    const house1 = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 600_000_000,
      isOneHousehold: false,
      isUrbanArea: false,
    });
    const house2 = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 400_000_000,
      isOneHousehold: false,
      isUrbanArea: false,
    });

    // 종부세는 인별 전국 합산 → 두 주택 taxBase 합산 가능해야 함
    const combinedTaxBase = house1.taxBase + house2.taxBase;
    expect(combinedTaxBase).toBe(
      house1.taxBase + house2.taxBase
    );
    // house1: 600_000_000 × 0.60 = 360_000_000
    expect(house1.taxBase).toBe(360_000_000);
    // house2: 400_000_000 × 0.60 = 240_000_000
    expect(house2.taxBase).toBe(240_000_000);
    expect(combinedTaxBase).toBe(600_000_000);

    // 각각 determinedTax도 number 타입
    expect(typeof house1.determinedTax).toBe("number");
    expect(typeof house2.determinedTax).toBe("number");
  });
});

// ============================================================
// R1 회귀 — 2026 1세대1주택 공정시장가액비율 (시행령 §109①2호 단서)
// ============================================================

describe("2026 1세대1주택 공정시장가액비율 — 시행령 §109①2호 단서 (R1 회귀)", () => {
  const base2026 = {
    objectType: "housing" as const,
    isOneHousehold: true,
    isUrbanArea: false,
    targetDate: "2026-06-01",
  };

  it("R1-1: 공시 2억 (3억 이하) → 43%, 과세표준 8,600만, 특례세율 5.6만", () => {
    const r = calculatePropertyTax({ ...base2026, publishedPrice: 200_000_000 });
    expect(r.fairMarketRatio).toBe(0.43);
    expect(r.taxBase).toBe(86_000_000);
    // 특례세율 0.1% 구간: 86,000,000 × 0.001 - 30,000 = 56,000
    expect(r.calculatedTax).toBe(56_000);
  });

  it("R1-2: 공시 3억 경계 → 43% / 3억 초과 → 44%", () => {
    expect(calculatePropertyTax({ ...base2026, publishedPrice: 300_000_000 }).fairMarketRatio).toBe(0.43);
    expect(calculatePropertyTax({ ...base2026, publishedPrice: 300_000_001 }).fairMarketRatio).toBe(0.44);
  });

  it("R1-3: 공시 5억 (6억 이하) → 44%, 과세표준 2.2억, 특례세율 26만", () => {
    const r = calculatePropertyTax({ ...base2026, publishedPrice: 500_000_000 });
    expect(r.fairMarketRatio).toBe(0.44);
    expect(r.taxBase).toBe(220_000_000);
    // 특례세율 0.2% 구간: 220,000,000 × 0.002 - 180,000 = 260,000
    expect(r.calculatedTax).toBe(260_000);
  });

  it("R1-4: 공시 6억 경계 → 44% / 8억 → 45%", () => {
    expect(calculatePropertyTax({ ...base2026, publishedPrice: 600_000_000 }).fairMarketRatio).toBe(0.44);
    const r = calculatePropertyTax({ ...base2026, publishedPrice: 800_000_000 });
    expect(r.fairMarketRatio).toBe(0.45);
    expect(r.taxBase).toBe(360_000_000);
    // 특례세율 0.35% 구간: 360,000,000 × 0.0035 - 630,000 = 630,000
    expect(r.calculatedTax).toBe(630_000);
  });

  it("R1-5: 공시 12억 — 비율 특례는 9억 초과 포함, 특례세율(§111의2)은 배제", () => {
    const r = calculatePropertyTax({ ...base2026, publishedPrice: 1_200_000_000 });
    expect(r.fairMarketRatio).toBe(0.45);
    expect(r.taxBase).toBe(540_000_000);
    expect(r.oneHouseSpecialApplied).toBe(false);
    // 일반세율 0.4% 구간: 540,000,000 × 0.004 - 630,000 = 1,530,000
    expect(r.calculatedTax).toBe(1_530_000);
  });

  it("R1-6: 연도 게이트 — 2024·2025·2026 구간별 적용(v3), 2023은 특례 없음 60%, 다주택은 60%", () => {
    // v3: 2025년 1세대1주택도 구간별 특례 적용 (시행령 §109①2호 단서 "각 목" — applicable_law 확정)
    expect(
      calculatePropertyTax({ ...base2026, publishedPrice: 200_000_000, targetDate: "2025-06-01" })
        .fairMarketRatio,
    ).toBe(0.43);
    // 2023년은 각 목 특례 없음 (applicable_law 2023-06-01 "2022년도 45%"만) → 본문 60%
    expect(
      calculatePropertyTax({ ...base2026, publishedPrice: 200_000_000, targetDate: "2023-06-01" })
        .fairMarketRatio,
    ).toBe(0.6);
    // 다주택(특례 미신청)은 연도 무관 60%
    expect(
      calculatePropertyTax({ ...base2026, publishedPrice: 200_000_000, isOneHousehold: false })
        .fairMarketRatio,
    ).toBe(0.6);
  });

  it("R1-7: calcTaxBase 직접 호출 — opts 미전달 시 기존 동작(60%) 보존", () => {
    const { fairMarketRatio } = calcTaxBase(200_000_000, "housing");
    expect(fairMarketRatio).toBe(0.6);
    const special = calcTaxBase(200_000_000, "housing", undefined, {
      isOneHousehold: true,
      taxYear: 2026,
    });
    expect(special.fairMarketRatio).toBe(0.43);
    expect(special.taxBase).toBe(86_000_000);
  });
});

// ============================================================
// T24~: 주택 과세표준상한제 (지방세법 §110③, 시행령 §109의2)
//   과세표준상한액 = 직전연도 과세표준 상당액 + (당해 과세표준 × 5%)
// ============================================================

describe("applyHousingTaxBaseCap — 과세표준상한 순수 함수 (§110③)", () => {
  it("AC-1: 직전 5억 / 당해 7억 / 일반 60% → 상한 작동 (4.2억 → 3.21억)", () => {
    // currentTaxBase = 700,000,000 × 60% = 420,000,000
    const cap = applyHousingTaxBaseCap(420_000_000, 0.6, 500_000_000);
    expect(cap.taxBaseBeforeCap).toBe(420_000_000);
    // priorEquiv = 500,000,000 × 60% = 300,000,000
    expect(cap.priorYearTaxBaseEquivalent).toBe(300_000_000);
    // capIncrement = 420,000,000 × 5% = 21,000,000 → 상한액 321,000,000
    expect(cap.taxBaseCapLimit).toBe(321_000_000);
    expect(cap.cappedTaxBase).toBe(321_000_000);
    expect(cap.taxBaseCapApplied).toBe(true);
    expect(cap.taxBaseCapRate).toBe(0.05);
  });

  it("AC-2: 직전 미입력(undefined) → 상한 미작동 (당해값 동치)", () => {
    const cap = applyHousingTaxBaseCap(420_000_000, 0.6, undefined);
    expect(cap.priorYearTaxBaseEquivalent).toBe(420_000_000);
    expect(cap.cappedTaxBase).toBe(420_000_000);
    expect(cap.taxBaseCapApplied).toBe(false);
  });

  it("AC-3: 완만 상승(당해 ≤ 직전×1.05) → 상한 미도달", () => {
    // 직전 4억×60%=2.4억, 당해 2.5억×60%=1.5억... 직전이 더 큼 → 미도달
    const cap = applyHousingTaxBaseCap(150_000_000, 0.6, 400_000_000);
    expect(cap.taxBaseCapApplied).toBe(false);
    expect(cap.cappedTaxBase).toBe(150_000_000);
  });
});

describe("calculatePropertyTax — 과세표준상한 통합 (§110③)", () => {
  it("AC-INT-1: 주택 당해 7억 / 직전 5억 / 일반 → taxBase 321,000,000", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 700_000_000,
      priorYearPublishedPrice: 500_000_000,
      isOneHousehold: false,
    });
    expect(result.taxBaseBeforeCap).toBe(420_000_000);
    expect(result.taxBaseCapLimit).toBe(321_000_000);
    expect(result.taxBase).toBe(321_000_000);
    expect(result.taxBaseCapApplied).toBe(true);
    // 세율: 3.21억은 4구간(3억 초과) → 321,000,000 × 0.004 - 630,000 = 1,284,000 - 630,000 = 654,000
    expect(result.calculatedTax).toBe(654_000);
  });

  it("AC-INT-2: 주택 당해 7억 / 직전 미입력 → 상한 미적용 taxBase 420,000,000", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 700_000_000,
      isOneHousehold: false,
    });
    expect(result.taxBase).toBe(420_000_000);
    expect(result.taxBaseCapApplied).toBe(false);
  });

  it("AC-INT-3: 1세대1주택 2026 / 당해 7억 / 직전 5억 → 45% 양쪽 적용 taxBase 240,750,000", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 700_000_000,
      priorYearPublishedPrice: 500_000_000,
      isOneHousehold: true,
      targetDate: "2026-06-01",
    });
    // 당해 = 700,000,000 × 45% = 315,000,000 / 직전 = 500,000,000 × 45% = 225,000,000
    // 증가분 = 315,000,000 × 5% = 15,750,000 → 상한액 240,750,000
    expect(result.taxBaseBeforeCap).toBe(315_000_000);
    expect(result.taxBaseCapLimit).toBe(240_750_000);
    expect(result.taxBase).toBe(240_750_000);
    expect(result.taxBaseCapApplied).toBe(true);
  });

  it("AC-INT-4: 건축물 — priorYearPublishedPrice 무시·기존 결과 불변(회귀)", () => {
    const withPrior = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 700_000_000,
      priorYearPublishedPrice: 500_000_000,
      buildingType: "general",
    });
    const without = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 700_000_000,
      buildingType: "general",
    });
    expect(withPrior.taxBase).toBe(without.taxBase);
    expect(withPrior.taxBaseCapApplied).toBeUndefined();
    expect(withPrior.taxBaseBeforeCap).toBeUndefined();
  });
});

// ============================================================
// FH: 화재위험 건축물 소방분 중과 (§146③2호·2의2호, 시행령 §138)
//   base 소방분(§146③1호) × 2(화재위험)/3(대형 화재위험)
// ============================================================

describe("calcSurtax — 화재위험 건축물 소방분 중과 (§146③2호·2의2호)", () => {
  it("FH-1: 건축물 1억 / 화재위험(×2) → 184,600 + echo", () => {
    // base = 49,100 + (1억 − 6,400만) × 12/10,000 = 92,300
    const { surtax } = calcSurtax(0, 0, 100_000_000, "building", false, "fire_hazard");
    expect(surtax.regionalResourceTax).toBe(184_600);
    expect(surtax.regionalResourceTaxBeforeSurcharge).toBe(92_300);
    expect(surtax.fireHazardMultiplier).toBe(2);
  });

  it("FH-2: 건축물 1억 / 대형 화재위험(×3) → 276,900", () => {
    const { surtax } = calcSurtax(0, 0, 100_000_000, "building", false, "large_fire_hazard");
    expect(surtax.regionalResourceTax).toBe(276_900);
    expect(surtax.fireHazardMultiplier).toBe(3);
  });

  it("FH-3: 건축물 1억 / 일반(none) → 92,300 · echo undefined (회귀)", () => {
    const { surtax } = calcSurtax(0, 0, 100_000_000, "building", false, "none");
    expect(surtax.regionalResourceTax).toBe(92_300);
    expect(surtax.regionalResourceTaxBeforeSurcharge).toBeUndefined();
    expect(surtax.fireHazardMultiplier).toBeUndefined();
  });

  it("FH-4: 건축물 1억 / 미지정(undefined) → none 동치 92,300", () => {
    const { surtax } = calcSurtax(0, 0, 100_000_000, "building", false);
    expect(surtax.regionalResourceTax).toBe(92_300);
    expect(surtax.fireHazardMultiplier).toBeUndefined();
  });

  it("FH-5: 주택 / 화재위험 지정 → 무시 (소방분 0·echo undefined)", () => {
    const { surtax } = calcSurtax(0, 0, 700_000_000, "housing", false, "fire_hazard");
    expect(surtax.regionalResourceTax).toBe(0);
    expect(surtax.fireHazardMultiplier).toBeUndefined();
  });

  it("FH-6: 건축물 0원 / 화재위험(×2) → 0 · echo 노출(배율 2) 경계", () => {
    const { surtax } = calcSurtax(0, 0, 0, "building", false, "fire_hazard");
    expect(surtax.regionalResourceTax).toBe(0);
    expect(surtax.regionalResourceTaxBeforeSurcharge).toBe(0);
    expect(surtax.fireHazardMultiplier).toBe(2);
  });
});

describe("calculatePropertyTax — 화재위험 중과 통합 (§146③2호·2의2호)", () => {
  it("FH-INT-1: 건축물 1억 / 대형 화재위험 → 지역자원시설세 276,900", () => {
    const result = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 100_000_000,
      buildingType: "general",
      fireHazardClass: "large_fire_hazard",
    });
    expect(result.surtax.regionalResourceTax).toBe(276_900);
    expect(result.surtax.fireHazardMultiplier).toBe(3);
  });

  it("FH-INT-2: 건축물 1억 / 미지정 → 중과 없음 92,300 (회귀)", () => {
    const result = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 100_000_000,
      buildingType: "general",
    });
    expect(result.surtax.regionalResourceTax).toBe(92_300);
    expect(result.surtax.fireHazardMultiplier).toBeUndefined();
  });
});

// ============================================================
// HB: 주택 건축물분 소방분 (§146④ 단서) — 건물분 × FMR → §146③1호 6구간
// ============================================================

describe("calcSurtax — 주택 건축물분 소방분 (§146④ 단서)", () => {
  it("HB-1: 주택 건물분 과세표준 9천만(=1.5억×60%) → base 80,300", () => {
    const { surtax } = calcSurtax(0, 0, 0, "housing", false, undefined, 90_000_000);
    expect(surtax.housingFireServiceTaxBase).toBe(90_000_000);
    // 49,100 + (90,000,000 − 64,000,000) × 12/10,000 = 80,300
    expect(surtax.regionalResourceTax).toBe(80_300);
  });

  it("HB-2: 주택 소방분 과세표준 미전달(undefined) → 0 · echo undefined (회귀)", () => {
    const { surtax } = calcSurtax(0, 0, 0, "housing", false, undefined, undefined);
    expect(surtax.regionalResourceTax).toBe(0);
    expect(surtax.housingFireServiceTaxBase).toBeUndefined();
  });

  it("HB-4: 건축물 → 7번째 인자 무시·기존 publishedPrice 경로(92,300) 불변", () => {
    const { surtax } = calcSurtax(0, 0, 100_000_000, "building", false, undefined, 90_000_000);
    expect(surtax.regionalResourceTax).toBe(92_300);
    expect(surtax.housingFireServiceTaxBase).toBeUndefined();
  });

  it("HB-5: 주택 소방분 + fireHazardClass 지정 → 중과 미적용(배율 1)", () => {
    const { surtax } = calcSurtax(0, 0, 0, "housing", false, "large_fire_hazard", 90_000_000);
    expect(surtax.regionalResourceTax).toBe(80_300);
    expect(surtax.fireHazardMultiplier).toBeUndefined();
  });

  it("HB-7: 주택 건물분 과세표준 0 → 0 · echo 0 노출 (경계)", () => {
    const { surtax } = calcSurtax(0, 0, 0, "housing", false, undefined, 0);
    expect(surtax.regionalResourceTax).toBe(0);
    expect(surtax.housingFireServiceTaxBase).toBe(0);
  });
});

describe("calculatePropertyTax — 주택 건물분 소방분 통합 (§146④ 단서)", () => {
  it("HB-INT-1: 주택 건물분 1.5억 / 일반 60% → 소방분 80,300", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 300_000_000,
      housingBuildingValue: 150_000_000,
      isOneHousehold: false,
    });
    expect(result.surtax.housingFireServiceTaxBase).toBe(90_000_000);
    expect(result.surtax.regionalResourceTax).toBe(80_300);
  });

  it("HB-INT-2: 주택 건물분 미입력 → 소방분 0 (회귀)", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 300_000_000,
      isOneHousehold: false,
    });
    expect(result.surtax.regionalResourceTax).toBe(0);
    expect(result.surtax.housingFireServiceTaxBase).toBeUndefined();
  });

  it("HB-INT-3: 1세대1주택 2026 / publishedPrice 7억(45%) / 건물분 1억 → 과세표준 4,500만 · 소방분 30,100", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 700_000_000,
      housingBuildingValue: 100_000_000,
      isOneHousehold: true,
      targetDate: "2026-06-01",
    });
    // 100,000,000 × 45% = 45,000,000 → 24,100 + (45,000,000 − 39,000,000) × 10/10,000 = 30,100
    expect(result.surtax.housingFireServiceTaxBase).toBe(45_000_000);
    expect(result.surtax.regionalResourceTax).toBe(30_100);
  });
});

// ============================================================
// 과세기준일 6/1 default (지방세법 §114)
// ============================================================

describe("calculatePropertyTax — 과세기준일 6/1 default (지방세법 §114)", () => {
  it("targetDate 미입력 → 현재 연도 6월 1일", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 100_000_000,
    });
    const year = new Date().getFullYear();
    expect(result.targetDate).toBe(`${year}-06-01`);
  });

  it("targetDate 명시 입력 → 입력값 그대로 (default 미적용)", () => {
    const result = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 100_000_000,
      targetDate: "2025-06-01",
    });
    expect(result.targetDate).toBe("2025-06-01");
  });

  it("미입력 default라도 taxYear 파생 동일 → 세액 불변 (현재 연도 6/1 명시와 동일)", () => {
    const year = new Date().getFullYear();
    const implicit = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 100_000_000,
    });
    const explicit = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 100_000_000,
      targetDate: `${year}-06-01`,
    });
    expect(implicit.determinedTax).toBe(explicit.determinedTax);
    expect(implicit.totalPayable).toBe(explicit.totalPayable);
  });
});
