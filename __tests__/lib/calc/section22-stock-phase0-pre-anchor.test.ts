/**
 * Phase 0 Pre-Do anchor — 비상장주식 §22 suggest 누락 버그 실증
 *
 * 계획서: docs/00-pm/inheritance-stock-section22-toggle-consolidation.plan.md §0 D-0
 *
 * 목적: 비상장 V2·V1 실제 폼 형태(marketValue 없음)에서
 *       suggestNetFinancialAssets.value > 0 을 기대.
 *       구현 전 RED(=0), 구현 후 GREEN(>0) 확인.
 *
 * NOTE: Phase 0 구현(getValuatedAmount → computeStockValuation fallback) 이후에는
 *       이 파일의 AN-V2-RED / AN-V1-RED 모두 GREEN이어야 함.
 */

import { describe, expect, it } from "vitest";
import { suggestNetFinancialAssets } from "@/lib/calc/inheritance-deduction-suggest";
import type {
  EstateItem,
  UnlistedStockData,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ============================================================
// 헬퍼 — 실제 폼 형태와 동일하게 marketValue를 채우지 않음
// ============================================================

/**
 * 비상장 V2 자산 — 실제 폼 형태.
 * marketValue 없음. computeStockValuation → evaluateUnlistedStockV2가 도출해야 하는 값.
 * 최소 필수 필드 기반 (기존 besshi-pdf-2025-parity.test.tsx 구조 참조).
 */
function unlistedV2ItemRealForm(): EstateItem {
  const v2Input: UnlistedStockValuationInput = {
    corpName: "테스트법인",
    representative: "홍길동",
    businessRegistrationNumber: "123-45-67890",
    capital: 50_000_000,
    businessStartDate: new Date("2010-01-01"),
    evaluationDate: new Date("2024-06-30"),
    faceValuePerShare: 5_000,
    totalShares: 10_000,
    ownedShares: 1_000,
    isRealEstateHeavy: false,
    fiscalYears: [
      {
        fiscalYearLabel: "2023",
        fiscalYearEndDate: new Date("2023-12-31"),
        taxableIncome: 100_000_000,
      },
      {
        fiscalYearLabel: "2022",
        fiscalYearEndDate: new Date("2022-12-31"),
        taxableIncome: 80_000_000,
      },
      {
        fiscalYearLabel: "2021",
        fiscalYearEndDate: new Date("2021-12-31"),
        taxableIncome: 60_000_000,
      },
    ],
    capitalChanges: [],
    netAssetValueRaw: {
      bsTotalAssets: 2_000_000_000,
      assetValuationDelta: 0,
      corpTaxReservedAmount: 0,
      paidInCapitalIncrease: 0,
      otherEarnedRights: 0,
      prepaidExpenses: 0,
      preGiftRetainedEarnings: 0,
      bsTotalLiabilities: 500_000_000,
      corporateTaxPayable: 0,
      farmingSurtax: 0,
      localIncomeTax: 0,
      dividendPayable: 0,
      retirementProvision: 0,
      otherProvision: 0,
      reserveExcluded: 0,
      allowanceExcluded: 0,
      deferredTaxAdjustment: 0,
    },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.10,
    isMaxShareholder: false,
    companySize: "large",
  };

  return {
    id: "v2-real",
    category: "unlisted_stock",
    name: "비상장주식 V2 (실제 폼)",
    // marketValue 미입력 — 폼에서 사용자가 직접 입력하지 않음
    unlistedValuationMode: "formal",
    unlistedStockValuationV2: v2Input,
  };
}

/**
 * 비상장 V1(간편) 자산 — 실제 폼 형태.
 * marketValue 없음. computeStockValuation → calcUnlistedStockPerShareValue가 도출해야 하는 값.
 * UnlistedStockData 필드: weightedNetIncome, netAssetValue, capitalizationRate (필수).
 */
function unlistedV1ItemRealForm(): EstateItem {
  const v1Data: UnlistedStockData = {
    totalShares: 10_000,
    ownedShares: 1_000,
    weightedNetIncome: 150_000_000,   // 3년 가중평균 순손익 (회사 전체)
    netAssetValue: 1_500_000_000,     // 순자산가액 (회사 전체)
    capitalizationRate: 0.10,
  };

  return {
    id: "v1-real",
    category: "unlisted_stock",
    name: "비상장주식 V1 (간편)",
    // marketValue 미입력
    unlistedValuationMode: "simple",
    unlistedStockData: v1Data,
  };
}

// ============================================================
// Phase 0 anchor (구현 후 GREEN)
// ============================================================

describe("[Phase 0] 비상장주식 §22 suggest 평가액 연동 (구현 후 GREEN)", () => {
  /**
   * AN-V2: 비상장 V2 실제 폼(marketValue 없음) → suggest.value > 0
   *
   * getValuatedAmount → computeStockValuation(item) → evaluateUnlistedStockV2(v2)
   * → totalValuation = 순자산 1,500,000,000 / 10,000주 × 1,000주 계산 기반 값
   * 정확한 값은 엔진 내부에 의존하므로 > 0 으로만 검증.
   */
  it("AN-V2: V2 실제 폼(marketValue 없음) suggest.value > 0", () => {
    const item = unlistedV2ItemRealForm();
    const result = suggestNetFinancialAssets([item], []);
    expect(result.value).toBeGreaterThan(0);
    expect(result.isApplicable).toBe(true);
  });

  /**
   * AN-V1: 비상장 V1(간편) 실제 폼(marketValue 없음) → suggest.value > 0
   *
   * getValuatedAmount → computeStockValuation(item) → calcUnlistedStockPerShareValue
   * → 1주당 가액 × 1,000주 > 0
   */
  it("AN-V1: V1 간편(marketValue 없음) suggest.value > 0", () => {
    const item = unlistedV1ItemRealForm();
    const result = suggestNetFinancialAssets([item], []);
    expect(result.value).toBeGreaterThan(0);
    expect(result.isApplicable).toBe(true);
  });

  /**
   * AN-LISTED: 상장주식 avg×shares → 50,000,000 (회귀 0 — 기존 경로 보존)
   * computeStockValuation이 listed_stock에서 evaluateListedStockValue를 호출 → 동일 결과.
   */
  it("AN-LISTED: 상장주식 avg=50,000 × shares=1,000 → 50,000,000", () => {
    const item: EstateItem = {
      id: "listed-1",
      category: "listed_stock",
      name: "상장주식",
      listedStockAvgPrice: 50_000,
      listedStockShares: 1_000,
    };
    const result = suggestNetFinancialAssets([item], []);
    expect(result.value).toBe(50_000_000);
  });

  /**
   * AN-MKTVAL: marketValue 있으면 computeStockValuation보다 우선 (AN-2 보존)
   * 비상장 V2지만 marketValue=663,200,000이 있으면 663,200,000 반환.
   */
  it("AN-MKTVAL: marketValue 있으면 computeStockValuation보다 우선 (AN-2 보존)", () => {
    const item: EstateItem = {
      id: "v2-with-mktval",
      category: "unlisted_stock",
      name: "비상장주식 V2 (marketValue 입력)",
      marketValue: 663_200_000,
      unlistedValuationMode: "formal",
      unlistedStockValuationV2: unlistedV2ItemRealForm().unlistedStockValuationV2,
    };
    const result = suggestNetFinancialAssets([item], []);
    // marketValue 우선 → computeStockValuation 호출 없음
    expect(result.value).toBe(663_200_000);
  });

  /**
   * AN-MAJOR: §22② 최대주주 ON → V2 실제 폼에서도 제외 (numeric 유효화 확인)
   * Phase 0 이전: V2 suggest=0, ON/OFF 무효과
   * Phase 0 이후: V2 suggest>0이 되어야 OFF/ON 차이가 발생함
   */
  it("AN-MAJOR: §22② 최대주주 OFF → 포함, ON → 제외 (numeric 차이 발생)", () => {
    const offItem = unlistedV2ItemRealForm(); // isSection22MajorShareholder=false
    const onItem: EstateItem = {
      ...unlistedV2ItemRealForm(),
      unlistedStockValuationV2: {
        ...unlistedV2ItemRealForm().unlistedStockValuationV2!,
        isSection22MajorShareholder: true,
      },
    };

    const offResult = suggestNetFinancialAssets([offItem], []);
    const onResult = suggestNetFinancialAssets([onItem], []);

    // OFF: 포함 → value > 0
    expect(offResult.value).toBeGreaterThan(0);
    // ON: 제외 → value = 0
    expect(onResult.value).toBe(0);
    // 차이 발생 (Phase 0 전에는 both=0, Phase 0 후에는 OFF>ON)
    expect(offResult.value).toBeGreaterThan(onResult.value);
  });
});
