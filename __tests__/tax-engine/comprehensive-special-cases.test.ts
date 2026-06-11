/**
 * 종합부동산세 후속 특례 — Pre-Do anchor (Phase 0)
 *
 * 출처:
 *   - 국세청 「2022 귀속 종합부동산세 계산 사례」 사례5 (pdf11~13, 300dpi 재실측)
 *   - 종합부동산세법 시행령 §2의4② (토지 FMR 2021=95%)
 *   - 신고서 작성방법 pdf38 ⑥·⑦ (재산세 안분 ⑤ 분자·⑥ 분모 산식)
 *
 * 설계: docs/02-design/features/comprehensive-tax-special-cases.engine.design.md
 *
 * ★ Pre-Do 상태: G-7·SC-A1은 엔진 수정 전 — 실패가 정상 (갭 실증).
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import { comprehensiveTaxInputSchema } from "../../lib/validators/comprehensive-input";
import type { ComprehensiveTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

// ============================================================
// G-7: 주택분 재산세 안분 ⑥ 분모 — 합산 단일 누진 (시행령 §4의3)
// ============================================================

describe("G-7 (사례5): 다주택 재산세 안분 ⑥ = 합산 단일 누진 — pdf12 실측", () => {
  // 사례5 (2022 귀속, 부부 공동명의 특례 §10의2 — 엔진 관점은 1세대1주택 경로):
  //   공시가격 합산: 15억(성동, 부부 50%×2 합산) + 2억(세종) = 17억
  //   과세표준: (17억 − 11억) × 60% = 3.6억
  //   산출세액: 3.6억 × 0.8% − 600,000 = 2,280,000
  //   ⓐ 부과 재산세 합계: 성동 2,970,000(9억×0.4%−63만) + 세종 150,000(1.2억×0.15%−3만) = 3,120,000
  //   ⑤ = 3.6억 × 60% × 0.4% = 864,000
  //   ⑥ = 17억 × 60% × 0.4% − 630,000 = 3,450,000   ★ 합산 단일 누진 (Σ per-house 3,120,000 아님)
  //   공제 = floor(3,120,000 × 864,000 / 3,450,000) = 781,356
  //   공제 후: 2,280,000 − 781,356 = 1,498,644 (pdf13 확인)
  it("사례5: 공제 781,356 · 공제 후 1,498,644 (현행 Σ per-house 분모는 864,000 — 갭)", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: true, // §10의2 특례 = 1세대1주택 의제 (Do 단계에서 isJointOwnershipSpecialCase로 대체)
      properties: [
        { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" },
        { propertyId: "p2", assessedValue: 200_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(1_100_000_000);
    expect(result.taxBase).toBe(360_000_000);
    expect(result.calculatedTax).toBe(2_280_000);          // 사례5 ① (pdf11)

    // ★ G-7 핵심: ⑥ 분모는 합산 단일 누진 3,450,000
    expect(result.propertyTaxCredit.creditAmount).toBe(781_356);   // pdf12 ④
    expect(result.calculatedTax - result.propertyTaxCredit.creditAmount).toBe(
      1_498_644,                                            // pdf12 ③ 상한 적용 전 종부세
    );
  });
});

// ============================================================
// SC-A1: 토지 FMR 연도화 — 2021 = 95% (시행령 §2의4②)
// ============================================================

describe("SC-A1: 2021 종합합산 토지 FMR 95%", () => {
  // 과세표준 = trunc10k(floor((10억 − 5억) × 0.95)) = 475,000,000
  // 현행 엔진: fairMarketRatioLand 전달 경로 부재 → 100% 고정 = 5억 (갭)
  it("공시 10억 → 과표 4.75억 · echo fairMarketRatio 0.95", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2021,
      isOneHouseOwner: false,
      properties: [
        { propertyId: "p1", assessedValue: 500_000_000, exclusionType: "none" },
      ],
      landAggregate: {
        totalOfficialValue: 1_000_000_000,
        propertyTaxBase: 700_000_000,
        propertyTaxAmount: 2_000_000,
      },
    };
    const result = calculateComprehensiveTax(input);

    expect(result.aggregateLandTax?.taxBase).toBe(475_000_000);
    expect(result.aggregateLandTax?.fairMarketRatio).toBe(0.95);
  });
});

// ============================================================
// SC-B: 법인 주택분 §9② (Phase B)
//   법령: 현행 §9②3호 가·나목 2.7%/5.0% · 구법(≤2022) §9② 3.0%/6.0%
//        기본공제 0원 §8①2호 · 세부담상한 배제 §10 단서 (Phase 0 축자 확정)
// ============================================================

describe("SC-B: 법인 §9②3호 — 단일세율·기본공제 0·상한 배제", () => {
  const corporateBase = (
    year: number,
    values: number[],
  ): ComprehensiveTaxInput => ({
    assessmentYear: year,
    taxpayerType: "corporate_special",
    isOneHouseOwner: false,
    properties: values.map((v, i) => ({
      propertyId: `p${i + 1}`,
      assessedValue: v,
      exclusionType: "none" as const,
    })),
  });

  it("SC-B1: 2024 가목(2주택 이하) 공시 20억 → 공제 0 → 과표 12억 × 2.7% = 32,400,000", () => {
    const result = calculateComprehensiveTax(corporateBase(2024, [2_000_000_000]));

    expect(result.basicDeduction).toBe(0);                  // §8①2호
    expect(result.taxBase).toBe(1_200_000_000);             // 20억 × 60%
    expect(result.appliedRate).toBe(0.027);                 // §9②3호 가목
    expect(result.progressiveDeduction).toBe(0);            // 단일 비례 — 누진공제 없음
    expect(result.calculatedTax).toBe(32_400_000);
    expect(result.isMultiHouseRateApplied).toBe(false);     // 개인 multi 표 echo 아님
    expect(result.taxpayerType).toBe("corporate_special");
  });

  it("SC-B2: 2024 나목(3주택 이상) 합산 30억 → 과표 18억 × 5.0% = 90,000,000", () => {
    const result = calculateComprehensiveTax(
      corporateBase(2024, [1_000_000_000, 1_000_000_000, 1_000_000_000]),
    );

    expect(result.taxBase).toBe(1_800_000_000);
    expect(result.appliedRate).toBe(0.05);                  // §9②3호 나목
    expect(result.calculatedTax).toBe(90_000_000);
  });

  it("SC-B3: 법인 상한 배제 — previousYearTotalTax 입력해도 taxCap undefined (§10 단서)", () => {
    const input = corporateBase(2024, [2_000_000_000]);
    input.previousYearTotalTax = 10_000_000;
    const result = calculateComprehensiveTax(input);

    expect(result.taxCap).toBeUndefined();
  });

  it("SC-B4: 법인 + 1세대1주택 입력 잔존 → 전부 무시 (공제 0·세액공제 없음)", () => {
    const input = corporateBase(2024, [2_000_000_000]);
    input.isOneHouseOwner = true;
    input.birthDate = new Date("1950-01-01");
    input.acquisitionDate = new Date("2000-01-01");
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(0);                  // 12억 공제 미적용
    expect(result.oneHouseDeduction).toBeUndefined();       // §9⑤~⑨ 개인 전용
    expect(result.calculatedTax).toBe(32_400_000);
  });

  it("SC-B5: 2024 §9②1호(공공주택사업자 등) 3주택 30억 → 공제 9억 → general 표 (multi 금지)", () => {
    const input = corporateBase(2024, [1_000_000_000, 1_000_000_000, 1_000_000_000]);
    input.taxpayerType = "corporate_general";
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(900_000_000);
    expect(result.taxBase).toBe(1_260_000_000);             // (30억 − 9억) × 60%
    expect(result.appliedRate).toBe(0.013);                 // §9①1호 12억~25억 (중과 아님)
    expect(result.calculatedTax).toBe(10_380_000);          // 12.6억 × 1.3% − 600만
    expect(result.isMultiHouseRateApplied).toBe(false);
  });

  it("SC-B6: 2024 §9②2호(공익법인등) 3주택 30억 → §9①2호 multi 표", () => {
    const input = corporateBase(2024, [1_000_000_000, 1_000_000_000, 1_000_000_000]);
    input.taxpayerType = "corporate_public";
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(900_000_000);
    expect(result.appliedRate).toBe(0.02);                  // §9①2호 12억~25억 중과
    expect(result.calculatedTax).toBe(10_800_000);          // 12.6억 × 2.0% − 1,440만
    expect(result.isMultiHouseRateApplied).toBe(true);
  });

  it("SC-B7: 2022 가목 공시 20억 → 과표 12억 × 3.0% = 36,000,000 (구법 §9②)", () => {
    const result = calculateComprehensiveTax(corporateBase(2022, [2_000_000_000]));

    expect(result.basicDeduction).toBe(0);                  // 구법 §8① 괄호
    expect(result.taxBase).toBe(1_200_000_000);
    expect(result.appliedRate).toBe(0.03);
    expect(result.calculatedTax).toBe(36_000_000);
  });

  it("SC-B8: 2022 나목 조정 2주택 합산 20억 → 과표 12억 × 6.0% = 72,000,000", () => {
    const input = corporateBase(2022, [1_000_000_000, 1_000_000_000]);
    input.isMultiHouseInAdjustedArea = true;                // ≤2022 나목 = 조정 2주택 포함
    const result = calculateComprehensiveTax(input);

    expect(result.taxBase).toBe(1_200_000_000);
    expect(result.appliedRate).toBe(0.06);
    expect(result.calculatedTax).toBe(72_000_000);
  });
});

// ============================================================
// SC-C: 부부 공동명의 1주택자 특례 §10의2 (Phase C)
//   §10의2③ 1세대1주택자 의제 · 령 §5의2⑥ 지분 합산 · ⑧ 신청인 기준 공제
// ============================================================

describe("SC-C: §10의2 부부 공동명의 특례 — 1세대1주택자 의제", () => {
  it("SC-C1: 2024 특례 + 공시 15억 → 공제 12억 → 90만 → 신청인 71세·16년 보유 80% 캡 공제", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2024,
      isOneHouseOwner: false,
      isJointOwnershipSpecialCase: true,
      birthDate: new Date("1953-01-01"),       // 과세기준일 2024-06-01 기준 71세 → 고령 40%
      acquisitionDate: new Date("2008-01-01"), // 16년 보유 → 장기 50% (합 90% → 80% 캡)
      properties: [
        { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(1_200_000_000);      // §8①1호 의제 (§10의2③)
    expect(result.taxBase).toBe(180_000_000);               // (15억 − 12억) × 60%
    expect(result.calculatedTax).toBe(900_000);             // 1.8억 × 0.5%
    expect(result.oneHouseDeduction?.combinedRate).toBe(0.8); // 40%+50% → 80% 캡
    expect(result.oneHouseDeduction?.deductionAmount).toBe(720_000);
    expect(result.isJointOwnershipApplied).toBe(true);
  });

  it("SC-C2: 상호배타 — isOneHouseOwner + 특례 동시 true는 Zod refine 거부", () => {
    const parsed = comprehensiveTaxInputSchema.safeParse({
      assessmentYear: 2024,
      isOneHouseOwner: true,
      isJointOwnershipSpecialCase: true,
      properties: [{ propertyId: "p1", assessedValue: 1_500_000_000 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("SC-C3: 2022 특례 → 기본공제 11억 (연도 준용) → 2.4억 × 0.6% = 1,440,000", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      isJointOwnershipSpecialCase: true,
      properties: [
        { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(1_100_000_000);
    expect(result.taxBase).toBe(240_000_000);
    expect(result.calculatedTax).toBe(1_440_000);
  });

  // 사례5 (국세청 2022 사례집 pdf11~13): 부부 공동명의 특례 + 지방저가주택 — 특례 신청 시 본인 합산
  //   ※ 고령자 공제 15억/17억 안분(528,933)·결정세액 969,711은 §8④ 지방저가 특례 범위 외 — 공제후까지 anchor
  it("SC-C4 (사례5): 특례 경로 — 산출 2,280,000 → 안분 공제 781,356 → 공제후 1,498,644", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      isJointOwnershipSpecialCase: true,
      properties: [
        { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" },
        { propertyId: "p2", assessedValue: 200_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(1_100_000_000);
    expect(result.calculatedTax).toBe(2_280_000);                       // pdf11 ①
    expect(result.propertyTaxCredit.creditAmount).toBe(781_356);        // pdf12 ④
    expect(result.calculatedTax - result.propertyTaxCredit.creditAmount).toBe(1_498_644); // pdf12 ③
    expect(result.isJointOwnershipApplied).toBe(true);
  });

  it("SC-C5: 법인 + 특례 잔존 입력 → 특례 무시 (공제 0 유지)", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2024,
      taxpayerType: "corporate_special",
      isOneHouseOwner: false,
      isJointOwnershipSpecialCase: true, // 법인 전환 후 잔존 가정
      properties: [
        { propertyId: "p1", assessedValue: 2_000_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(0);
    expect(result.isJointOwnershipApplied).toBe(false);
    expect(result.calculatedTax).toBe(32_400_000);
  });
});
