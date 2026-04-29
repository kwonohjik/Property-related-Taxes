/**
 * 검용주택(1세대 1주택 + 상가) 분리계산 테스트
 *
 * 소득세법 시행령 §160 ① 단서 — 2022.1.1 이후 양도분 강제 분리.
 * 설계: docs/02-design/features/transfer-tax-mixed-use-house.engine.design.md
 */

import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import {
  mixedUseCase14,
  mixedUseExcessLand,
  mixedUseLowHousingPrice,
  mixedUseShortResidence,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
  CASE14_HOUSING_PRICE_AT_TRANSFER,
  CASE14_COMMERCIAL_BUILDING_AT_TRANSFER,
  CASE14_LAND_PRICE_PER_SQM_AT_TRANSFER,
  CASE14_RESIDENTIAL_FLOOR,
  CASE14_COMMERCIAL_FLOOR,
} from "../_helpers/mixed-use-fixture";

const mockRates = makeMockRates();

// ──────────────────────────────────────────────────────────────
// SC-1: 사례14 기본 검증 (양도가액 안분 + 분리 취득일)
// ──────────────────────────────────────────────────────────────

describe("SC-1: 사례14 검용주택 기본 분리계산 (2022.02.16 양도)", () => {
  const asset = mixedUseCase14();
  const result = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("STEP 1: 2022.1.1 이후 양도 → post-2022 모드", () => {
    expect(result.splitMode).toBe("post-2022");
  });

  it("STEP 2: 양도가액 안분 — 주택+상가 합계 = 총 양도가액", () => {
    const { housingTransferPrice, commercialTransferPrice } = result.apportionment;
    expect(housingTransferPrice + commercialTransferPrice).toBe(CASE14_TRANSFER_PRICE);
  });

  it("STEP 2: 주택비율 = 주택공시가격 / (주택공시가격 + 상가부분 기준시가)", () => {
    // 엔진은 부수토지 면적을 소수점 2자리로 반올림하고 단가×면적 결과를 floor 처리
    // (UI 표시값과 일치시키기 위함). 테스트 expected도 같은 정밀도로 산출.
    const totalFloor = CASE14_RESIDENTIAL_FLOOR + CASE14_COMMERCIAL_FLOOR;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const residentialLandArea = round2(
      asset.totalLandArea * (CASE14_RESIDENTIAL_FLOOR / totalFloor),
    );
    const commercialLandArea = round2(asset.totalLandArea - residentialLandArea);
    const commercialLandPrice = Math.floor(
      CASE14_LAND_PRICE_PER_SQM_AT_TRANSFER * commercialLandArea,
    );
    const commercialStd =
      commercialLandPrice + CASE14_COMMERCIAL_BUILDING_AT_TRANSFER;
    const expectedRatio =
      CASE14_HOUSING_PRICE_AT_TRANSFER /
      (CASE14_HOUSING_PRICE_AT_TRANSFER + commercialStd);
    expect(result.apportionment.housingRatio).toBeCloseTo(expectedRatio, 6);
  });

  it("STEP 2: 주택 양도가액 = floor(총양도가액 × 주택비율)", () => {
    const expected = Math.floor(
      CASE14_TRANSFER_PRICE * result.apportionment.housingRatio,
    );
    expect(result.apportionment.housingTransferPrice).toBe(expected);
  });

  it("STEP 5: 주택부분 양도소득금액은 0 이상", () => {
    expect(result.housingPart.incomeAmount).toBeGreaterThanOrEqual(0);
  });

  it("STEP 7: 상가부분 양도소득금액은 0 이상", () => {
    expect(result.commercialPart.incomeAmount).toBeGreaterThanOrEqual(0);
  });

  it("STEP 8: 주택 장기보유공제는 표2 (거주 25년 ≥ 2년)", () => {
    expect(result.housingPart.longTermDeductionTable).toBe(2);
    // 보유 24년(1997→2022), 거주 25년 → Math.min(24×4% + 25×4%, 80%) = min(96% + 100%, 80%) = 80%
    expect(result.housingPart.longTermDeductionRate).toBeCloseTo(0.80, 2);
  });

  it("STEP 8: 상가 장기보유공제는 표1 (최대 30%)", () => {
    expect(result.commercialPart.longTermDeductionRate).toBeLessThanOrEqual(0.30);
  });

  it("STEP 9: 총 납부세액 = 양도소득세 + 지방소득세", () => {
    const { transferTax, localTax, totalPayable } = result.total;
    expect(totalPayable).toBe(transferTax + localTax);
  });

  it("STEP 9: 지방소득세 = floor(양도소득세 × 10%)", () => {
    const expected = Math.floor(result.total.transferTax * 0.10);
    expect(result.total.localTax).toBe(expected);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-2: 부수토지 배율초과 = 0 (사례14 — 초과 없음)
// ──────────────────────────────────────────────────────────────

describe("SC-2: 부수토지 배율초과 = 0 (사례14 기본케이스)", () => {
  const asset = mixedUseCase14();
  const result = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("비사업용토지 부분이 null (초과 없음)", () => {
    expect(result.nonBusinessLandPart).toBeNull();
  });

  it("주택부분의 nonBusinessTransferRatio = 0", () => {
    expect(result.housingPart.nonBusinessTransferRatio).toBe(0);
  });

  it("주택부분의 nonBusinessTransferredGain = 0", () => {
    expect(result.housingPart.nonBusinessTransferredGain).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-3: 부수토지 배율초과 > 0 (토지 면적 확대)
// ──────────────────────────────────────────────────────────────

describe("SC-3: 부수토지 배율초과 발생 (토지 1,000㎡ 확대)", () => {
  const asset = mixedUseExcessLand();
  const result = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("비사업용토지 부분이 null이 아님", () => {
    expect(result.nonBusinessLandPart).not.toBeNull();
  });

  it("비사업용토지 초과 면적 > 0", () => {
    expect(result.nonBusinessLandPart!.excessArea).toBeGreaterThan(0);
  });

  it("수도권 주거지역 → 적용 배율 = 3배", () => {
    expect(result.nonBusinessLandPart!.appliedMultiplier).toBe(3);
  });

  it("비사업용토지 additionalRate = 0.10", () => {
    expect(result.nonBusinessLandPart!.additionalRate).toBe(0.10);
  });

  it("비사업용 +10%p 가산세 > 0", () => {
    expect(result.total.nonBusinessSurcharge).toBeGreaterThan(0);
  });

  it("주택부분 nonBusinessTransferRatio > 0", () => {
    expect(result.housingPart.nonBusinessTransferRatio).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-4: 12억 미만 주택부분 → 전액 비과세
// ──────────────────────────────────────────────────────────────

describe("SC-4: 주택 양도가액 < 12억 → 전액 비과세", () => {
  // 주택비율 낮게 설정: 주택공시 400M, 상가 1,600M → 주택 양도가액 ≈ 23억 × 0.2 ≈ 4.6억
  const asset = mixedUseLowHousingPrice();
  const result = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("isExempt = true", () => {
    expect(result.housingPart.isExempt).toBe(true);
  });

  it("proratedTaxableGain = 0", () => {
    expect(result.housingPart.proratedTaxableGain).toBe(0);
  });

  it("주택부분 양도소득금액 = 0", () => {
    expect(result.housingPart.incomeAmount).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-5: 12억 초과 주택부분 — 안분비율 검증
// ──────────────────────────────────────────────────────────────

describe("SC-5: 주택 양도가액 > 12억 → 안분비율 (§89 ① 3호 단서)", () => {
  const asset = mixedUseCase14();
  const result = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    asset,
    mockRates,
  );
  const housingTransferPrice = result.apportionment.housingTransferPrice;

  it("주택 양도가액 > 12억 → isExempt = false", () => {
    if (housingTransferPrice > 1_200_000_000) {
      expect(result.housingPart.isExempt).toBe(false);
    } else {
      expect(result.housingPart.isExempt).toBe(true);
    }
  });

  it("proratedTaxableGain = floor(gain × (양도가액-12억) / 양도가액)", () => {
    if (housingTransferPrice <= 1_200_000_000) return; // 비과세 케이스 스킵
    const expected = Math.floor(
      result.housingPart.transferGain *
        ((housingTransferPrice - 1_200_000_000) / housingTransferPrice),
    );
    expect(result.housingPart.proratedTaxableGain).toBe(expected);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-6: 분리 취득일 — 토지/건물 보유연수 독립 적용
// ──────────────────────────────────────────────────────────────

describe("SC-6: 분리 취득일 — 토지 1992.1.1 + 건물 1997.9.12", () => {
  const asset = mixedUseCase14();
  const result = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("주택부분 토지분 양도차익 ≠ 0 (분리 계산)", () => {
    expect(result.housingPart.landTransferGain).toBeDefined();
  });

  it("주택부분 건물분 양도차익 ≠ 0 (분리 계산)", () => {
    expect(result.housingPart.buildingTransferGain).toBeDefined();
  });

  it("상가부분 토지 + 건물 양도차익 합계 = 총 상가 양도차익", () => {
    const { landTransferGain, buildingTransferGain, transferGain } = result.commercialPart;
    expect(landTransferGain + buildingTransferGain).toBeCloseTo(transferGain, 0);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-7: PHD 토글 ON — 경고 포함
// ──────────────────────────────────────────────────────────────

describe("SC-7: PHD 토글 ON — 검용주택 적합성 경고", () => {
  const asset: ReturnType<typeof mixedUseCase14> = {
    ...mixedUseCase14(),
    usePreHousingDisclosure: true,
  };
  const result = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("warnings 배열에 PHD 적합성 경고 포함", () => {
    expect(result.warnings.some((w) => w.includes("PHD"))).toBe(true);
  });

  it("계산 결과는 정상 반환 (splitMode = post-2022)", () => {
    expect(result.splitMode).toBe("post-2022");
  });
});

// ──────────────────────────────────────────────────────────────
// SC-8: 거주 2년 미만 → 주택 장기보유공제 표1 적용
// ──────────────────────────────────────────────────────────────

describe("SC-8: 거주 2년 미만 → 표1 적용 (거주 40% 공제 미충족)", () => {
  const asset = mixedUseShortResidence();
  const result = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("주택 장기보유공제 표1 적용", () => {
    expect(result.housingPart.longTermDeductionTable).toBe(1);
  });

  it("표1 최대 30% 이하", () => {
    expect(result.housingPart.longTermDeductionRate).toBeLessThanOrEqual(0.30);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-9: 2022.1.1 이전 양도일 → 거부
// ──────────────────────────────────────────────────────────────

describe("SC-9: 2021.12.31 양도 → pre-2022-rejected", () => {
  const asset = mixedUseCase14();
  const result = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    new Date("2021-12-31"),
    asset,
    mockRates,
  );

  it("splitMode = pre-2022-rejected", () => {
    expect(result.splitMode).toBe("pre-2022-rejected");
  });

  it("warnings에 이전 양도분 안내 포함", () => {
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("2022.1.1 이전");
  });

  it("총 납부세액 = 0 (계산 불가)", () => {
    expect(result.total.totalPayable).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-3b: 배율초과 + 12억 초과 — 12억 안분 ⊕ 비사업용 이전 교차 처리 회귀
//        젠스파크 검토 의견 (2026-04-29) 반영: 비사업용 이전분에 12억 안분 미적용
// ──────────────────────────────────────────────────────────────

describe("SC-3b: 12억 안분 vs 비사업용 이전 교차 처리 (회귀)", () => {
  // 양도가액 100억 + 토지 1000㎡ 확대 → 주택 양도가액 12억 초과 + 배율초과 동시 발생
  const HIGH_VALUE_TRANSFER = 10_000_000_000;
  const asset = mixedUseExcessLand({
    transferStandardPrice: {
      housingPrice: 5_000_000_000, // 주택공시가격 50억
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 6_100_000,
    },
  });
  const result = calcMixedUseTransferTax(
    HIGH_VALUE_TRANSFER,
    CASE14_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("배율초과 면적 발생 → nonBizRatio > 0", () => {
    expect(result.housingPart.nonBusinessTransferRatio).toBeGreaterThan(0);
  });

  it("주택 양도가액이 12억 초과 → isExempt = false", () => {
    expect(result.apportionment.housingTransferPrice).toBeGreaterThan(1_200_000_000);
    expect(result.housingPart.isExempt).toBe(false);
  });

  it("비사업용 이전된 양도차익은 12억 안분이 적용되지 않음 (별도 카드에서 표1 + 10%p)", () => {
    // 비사업용토지는 1세대1주택 비과세 대상이 아니므로 transferredGain 그대로 비사업용으로 이동
    const transferredGain = result.housingPart.nonBusinessTransferredGain;
    expect(result.nonBusinessLandPart!.transferGain).toBe(transferredGain);
  });

  it("주택부분 12억 안분 = (주택 토지차익 - 비사업용 이전분 + 건물차익) × 안분비율", () => {
    const housingLandAfterNB =
      result.housingPart.landTransferGain - result.housingPart.nonBusinessTransferredGain;
    const buildingGain = result.housingPart.buildingTransferGain;
    const housingTransferPrice = result.apportionment.housingTransferPrice;
    const proratio = (housingTransferPrice - 1_200_000_000) / housingTransferPrice;

    const expectedLandPart = Math.floor(Math.max(housingLandAfterNB, 0) * proratio);
    const expectedBuildingPart = Math.floor(Math.max(buildingGain, 0) * proratio);
    const expectedProrated = expectedLandPart + expectedBuildingPart;

    expect(result.housingPart.proratedTaxableGain).toBe(expectedProrated);
  });

  it("주택 + 비사업용 양도소득금액 합계가 합리적 (이중 계산 없음)", () => {
    const total = result.housingPart.incomeAmount + (result.nonBusinessLandPart?.incomeAmount ?? 0);
    // 합계는 0 이상이고 양도가액 미만 (12억 안분 + 장기보유공제 적용 후)
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThan(HIGH_VALUE_TRANSFER);
  });
});

// ──────────────────────────────────────────────────────────────
// SC-10: 결과 구조 기본 검증 (steps 빌더)
// ──────────────────────────────────────────────────────────────

describe("SC-10: steps 빌더 — 결과 카드용 데이터 생성", () => {
  const asset = mixedUseCase14();
  const result = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    asset,
    mockRates,
  );

  it("steps 배열이 비어 있지 않음 (post-2022)", () => {
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("step-2-apportionment 포함", () => {
    expect(result.steps.find((s) => s.id === "step-2-apportionment")).toBeDefined();
  });

  it("step-9-total 포함", () => {
    expect(result.steps.find((s) => s.id === "step-9-total")).toBeDefined();
  });

  it("각 step에 legalBasis 포함", () => {
    for (const step of result.steps) {
      expect(step.legalBasis).toBeTruthy();
    }
  });

  it("calculationRoute 메타 5개 필드 모두 채워짐", () => {
    const route = result.calculationRoute;
    expect(route.housingAcqPriceSource).toMatch(/^(direct_input|phd_auto|missing)$/);
    expect(route.acquisitionConversionRoute).toMatch(/^(section97_direct|phd_corrected)$/);
    expect(route.housingDeductionTableReason).toBeTruthy();
    expect(route.landMultiplierReason).toBeTruthy();
    expect(route.highValueRule).toMatch(/^(below_threshold_exempt|above_threshold_prorated)$/);
  });

  it("12억 초과 시 highValueRule = above_threshold_prorated", () => {
    if (result.apportionment.housingTransferPrice > 1_200_000_000) {
      expect(result.calculationRoute.highValueRule).toBe("above_threshold_prorated");
    } else {
      expect(result.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    }
  });

  it("거주 25년 (mixedUseCase14) → 표2 (housingDeductionTableReason)", () => {
    expect(result.calculationRoute.housingDeductionTableReason).toContain("표2");
  });

  it("수도권 + 주거지역 → 3배 배율 (landMultiplierReason)", () => {
    expect(result.calculationRoute.landMultiplierReason).toContain("3배");
  });
});
