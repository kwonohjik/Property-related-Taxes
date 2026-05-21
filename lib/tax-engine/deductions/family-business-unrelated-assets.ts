/**
 * 가업상속공제 법인 주식 사업무관자산 차감 산식 (상증령 §15⑤2호)
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - §15⑤2호 본문 산식 — 주식가액 × (총자산 − 사업무관자산) / 총자산
 *   - §15⑤2호 가~마 — 사업무관자산 5종:
 *     가. 법인세법 §55의2 자산 (비사업용 토지)
 *     나. 법인세법 시행령 §49 자산 + 타인 임대 부동산 (단서 — 임직원용 국민주택규모/6억 이하 5년 무상 임대 주택 제외)
 *     다. 법인세법 시행령 §61①2호 자산 (단서 — 임직원 학자금·기준시가 6억 이하 전세금 제외)
 *     라. 과다보유현금 — 직전 5개 사업연도 말 평균 현금 보유액의 100분의 200 초과분
 *     마. 영업활동 무관 주식·채권·금융상품 (라목 제외)
 *
 * scope — 본 PR은 5종 입력값을 사용자로부터 받아 산식 적용. 5종 각 자산의 자동 분류는 후속 PR.
 *
 * 사용 — businessType="corporate" + EstateItem.familyBusinessCategory="corporate_stock"일 때
 *        본 함수로 주식 평가 가액을 사업무관자산 차감 후 가액으로 변환.
 */

export interface UnrelatedAssetsBreakdown {
  /** 가목 비사업용토지 (법인세법 §55의2) */
  nonBusinessLand: number;
  /** 나목 타인 임대 부동산 (단서 적용 후) */
  leasedRealEstate: number;
  /** 다목 임직원 외 대여금 (단서 적용 후) */
  excessiveLoans: number;
  /** 라목 과다보유현금 (5개년 평균 200% 초과분) */
  excessCash: number;
  /** 마목 영업무관 주식·채권·금융상품 */
  unrelatedFinancialAssets: number;
}

export interface FamilyBusinessStockValuationInput {
  /** 가업 법인 주식 평가가액 (원, 상증법 §60·§63 보충적 평가) */
  rawStockValue: number;
  /** 법인 총자산가액 (원, 상속개시일 현재 §4장 평가) */
  totalAssetValue: number;
  /** 사업무관자산 5종 (§15⑤2호 가~마) */
  unrelatedAssets: UnrelatedAssetsBreakdown;
}

export interface FamilyBusinessStockValuationResult {
  /** 사업무관자산 차감 후 가업상속 재산가액 (원) */
  adjustedStockValue: number;
  /** 사업무관자산 합계 (가~마) */
  unrelatedTotal: number;
  /** 사업관련자산 비율 (총자산 − 사업무관자산) / 총자산 */
  businessAssetRatio: number;
  /** breakdown */
  breakdown: Array<{ label: string; amount: number; lawRef?: string }>;
  /** 가드 발동 사유 (zero_total / negative_business / unrelated_exceeds_total) */
  guardReason?: "zero_total" | "negative_business" | "unrelated_exceeds_total";
}

/**
 * 사업무관자산 차감 가업 주식가액 산정.
 *
 * 산식: rawStockValue × (totalAssetValue − unrelatedTotal) / totalAssetValue
 *
 * 가드:
 *   - totalAssetValue ≤ 0 → 결과 0 (zero_total)
 *   - unrelatedTotal ≥ totalAssetValue → 결과 0 (unrelated_exceeds_total) — 사업관련자산이 0 이하
 *   - 정상 산식 결과가 음수 → 0 가드 (negative_business)
 */
export function calcFamilyBusinessStockValuation(
  input: FamilyBusinessStockValuationInput,
  lawRef: string,
): FamilyBusinessStockValuationResult {
  const { rawStockValue, totalAssetValue, unrelatedAssets } = input;

  const unrelatedTotal =
    unrelatedAssets.nonBusinessLand +
    unrelatedAssets.leasedRealEstate +
    unrelatedAssets.excessiveLoans +
    unrelatedAssets.excessCash +
    unrelatedAssets.unrelatedFinancialAssets;

  const breakdown: Array<{ label: string; amount: number; lawRef?: string }> = [
    { label: "법인 주식 평가가액 (raw)", amount: rawStockValue },
    { label: "법인 총자산가액", amount: totalAssetValue },
    { label: "사업무관자산 가목 — 비사업용토지", amount: unrelatedAssets.nonBusinessLand },
    { label: "사업무관자산 나목 — 임대 부동산 (단서 적용 후)", amount: unrelatedAssets.leasedRealEstate },
    { label: "사업무관자산 다목 — 임직원 외 대여금", amount: unrelatedAssets.excessiveLoans },
    { label: "사업무관자산 라목 — 과다보유현금", amount: unrelatedAssets.excessCash },
    { label: "사업무관자산 마목 — 영업무관 주식·채권·금융상품", amount: unrelatedAssets.unrelatedFinancialAssets },
    { label: "사업무관자산 합계 (가~마)", amount: unrelatedTotal },
  ];

  // 가드 1 — 총자산 0 이하
  if (totalAssetValue <= 0) {
    return {
      adjustedStockValue: 0,
      unrelatedTotal,
      businessAssetRatio: 0,
      guardReason: "zero_total",
      breakdown: [
        ...breakdown,
        { label: "가드: 총자산가액 0 이하 → 결과 0", amount: 0, lawRef },
      ],
    };
  }

  const businessAssetValue = totalAssetValue - unrelatedTotal;

  // 가드 2 — 사업무관 > 총자산 → 사업관련 0 이하
  if (businessAssetValue <= 0) {
    return {
      adjustedStockValue: 0,
      unrelatedTotal,
      businessAssetRatio: 0,
      guardReason: "unrelated_exceeds_total",
      breakdown: [
        ...breakdown,
        {
          label: "가드: 사업무관자산이 총자산 초과 → 사업관련 0, 결과 0",
          amount: 0,
          lawRef,
        },
      ],
    };
  }

  const businessAssetRatio = businessAssetValue / totalAssetValue;
  const adjustedRaw = rawStockValue * businessAssetRatio;
  const adjustedStockValue = Math.max(0, Math.floor(adjustedRaw));
  const guardReason = adjustedRaw < 0 ? "negative_business" as const : undefined;

  return {
    adjustedStockValue,
    unrelatedTotal,
    businessAssetRatio,
    guardReason,
    breakdown: [
      ...breakdown,
      { label: "사업관련자산 (총자산 − 사업무관)", amount: businessAssetValue },
      {
        label: `사업관련자산 비율 (${(businessAssetRatio * 100).toFixed(4)}%)`,
        amount: Math.floor(businessAssetRatio * 1_000_000),
      },
      {
        label: "사업무관자산 차감 후 가업 주식가액",
        amount: adjustedStockValue,
        lawRef,
      },
    ],
  };
}
