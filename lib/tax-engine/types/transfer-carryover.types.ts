/**
 * 배우자등 이월과세 + 비교과세 타입 — 소득세법 §97조의2
 *
 * TransferTaxInput.carryoverTaxation 입력 타입과
 * TransferTaxResult.carryoverTaxationDetail 결과 타입을 분리 정의.
 *
 * acquisitionCause === "carryover_gift" 일 때만 유효.
 */

// ============================================================
// 입력 타입
// ============================================================

/**
 * 배우자등 이월과세 입력 (소득세법 §97조의2).
 * acquisitionCause === "carryover_gift" 일 때만 유효.
 */
export interface CarryoverTaxationInput {
  /**
   * 증여 등기접수일 — §97조의2 ③ 등기부 소유기간 기산점.
   * UI 라벨: "증여 등기접수일" ("잔금일"·"사실상 취득일" 사용 금지).
   */
  giftRegistryDate: Date;
  /**
   * 증여자의 취득일 — 보유기간·장기보유특별공제 기산점 (§95 ④).
   * Scenario A에서 acquisitionDate를 이 값으로 교체.
   */
  donorAcquisitionDate: Date;
  /**
   * 증여자의 취득가액 — 직접 입력 시.
   * useEstimatedAcquisition === false 이면 필수. true이면 PHD/APD 환산으로 대체.
   */
  donorAcquisitionPrice?: number;
  /**
   * 환산취득가액 사용 여부.
   * true이면 rawInput.preHousingDisclosure 또는 rawInput.apartmentPreDisclosure 경로로 환산.
   */
  useEstimatedAcquisition: boolean;
  /**
   * 증여세 상당액 (사용자 직접 입력).
   * §163의2 산식: 증여세산출세액 × (해당 자산가액 / 증여재산총액) — UI에서 산식 안내.
   * 0 허용 (실제 증여세 0원 케이스). 한도(잔액한도)는 엔진이 자동 적용.
   */
  giftTaxAmount: number;
  /**
   * 증여자가 보유 중 지출한 자본적지출액 (§97조의2 ① 2호 후단, 2023.12.31. 신설).
   * 리모델링·증축·발코니확장 등. 0 허용.
   * 시행시기 가드: 양도일 < 2024-01-01이면 엔진에서 0 처리, 결과에 경고 표시.
   */
  donorCapitalExpenditure?: number;
  /**
   * 증여 당시 평가액 (보충적평가액·시가 등) — 비교과세 Scenario B의 취득가액.
   * 환산취득가액 사용 여부와 무관하게 필수 입력.
   */
  giftDateValuation: number;
  /**
   * 적용배제 — 사용자 선언 (§97조의2 ② 1호·2호·④항).
   * ② 3호(비교과세)는 자동 판정이므로 선언 불필요.
   */
  exclusionDeclared?: {
    /**
     * ② 1호 — 사업인정고시일 2년 이전에 증여받은 토지·건물의 협의매수·수용
     */
    expropriationWithin2Years?: boolean;
    /**
     * ② 2호 — 이월과세 적용 시 §89①3호 각 목 주택 비과세 해당 (12억 초과 고가주택 포함).
     * UI 라벨에 "고가주택 포함" 명시.
     */
    oneHouseExemptionApplies?: boolean;
    /**
     * ④항 — 가업상속공제 적용 자산 (v1 미지원, validation에서 진행 차단).
     * true 입력 시 엔진 진입 전 validation 오류로 차단됨.
     */
    isFamilyBusinessInheritedAsset?: boolean;
  };
}

// ============================================================
// 결과 타입
// ============================================================

/**
 * Scenario A (이월과세 적용) 상세 결과
 */
export interface CarryoverScenarioADetail {
  /** 증여자 취득가액 (직접 입력 또는 PHD/APD 환산) */
  acquisitionPrice: number;
  /** 증여자 취득일 기산 보유연수 (§95 ④) */
  holdingPeriodYears: number;
  /**
   * 필요경비 가산 — 증여세 상당액 (한도 적용 후 실제 가산 금액).
   * §97조의2 ① 2호 전단, 시행령 §163의2
   */
  giftTaxAddedToExpense: number;
  /** 증여세 상당액 한도 발동 여부 (잔액 한도 = 증여세 가산 전 양도차익) */
  giftTaxLimitApplied: boolean;
  /** 증여세 상당액 한도 캡 = 증여세 가산 직전 양도차익 */
  giftTaxLimitCap: number;
  /**
   * 필요경비 가산 — 증여자 자본적지출 (시행시기 가드 후 실제 산입액).
   * §97조의2 ① 2호 후단, 2023.12.31. 신설. 양도일 < 2024.1.1 시 0.
   */
  donorCapexAddedToExpense: number;
  /** 시행시기 가드 발동 여부 (양도일 < 2024-01-01 로 donorCapex 무시됨) */
  donorCapexGuardApplied: boolean;
  /** 실제 합산 적용된 capex — 수증자 capitalExpenditure + donorCapexAddedToExpense */
  effectiveCapex: number;
  /**
   * 취득가액 산정 방식 echo (표시 전용) — true면 증여자 취득 당시 환산취득가(§163⑨·§164⑦),
   * false면 증여자 취득 당시 실가 승계. 결과뷰 근거 문구 분기용.
   */
  acquisitionWasEstimated?: boolean;
  /** 환산 모드(기준시가 직접 입력)일 때 취득시 기준시가 echo — 환산 산식 재현용 */
  estimatedStdPriceAtAcquisition?: number;
  /** 환산 모드(기준시가 직접 입력)일 때 양도시 기준시가 echo — 환산 산식 재현용 */
  estimatedStdPriceAtTransfer?: number;
  /** 양도차익 (증여세 상당액 차감 후 최종) */
  transferGain: number;
  /**
   * 장기보유특별공제액 (증여자 취득일 기산 보유기간 적용).
   * 결과 카드·신고서 양식 표시용. UI 신고서 양식 표에서 main LTHD 대신 이 값을 사용.
   */
  longTermHoldingDeduction?: number;
  /**
   * 장기보유특별공제율 (증여자 취득일 기산 보유기간 적용).
   * 신고서 양식 보유/거주분 분할 계산에 사용.
   */
  longTermHoldingRate?: number;
  /** 과세대상 양도차익 (12억 초과분 안분 후) */
  taxableGain?: number;
  /** 과세표준 (기본공제 차감 후) */
  taxBase?: number;
  /** 산출세액 */
  calculatedTax?: number;
  /** 결정세액 (산출세액 - 세액공제·감면. 지방소득세·농특세 제외) */
  determinedTax: number;
  /** 지방소득세 (결정세액 × 10%) */
  localIncomeTax?: number;
  /** 총 납부세액 (결정세액 + 지방소득세) */
  totalTax?: number;
}

/**
 * Scenario B (이월과세 미적용) 상세 결과
 */
export interface CarryoverScenarioBDetail {
  /** 증여 당시 평가액 (giftDateValuation) */
  acquisitionPrice: number;
  /** 수증자 증여 등기접수일 기산 보유연수 */
  holdingPeriodYears: number;
  /** 양도차익 */
  transferGain: number;
  /** 장기보유특별공제액 */
  longTermHoldingDeduction?: number;
  /** 장기보유특별공제율 */
  longTermHoldingRate?: number;
  /** 과세표준 */
  taxBase?: number;
  /** 산출세액 */
  calculatedTax?: number;
  /** 결정세액 */
  determinedTax: number;
}

/**
 * 배우자등 이월과세 상세 결과 (TransferTaxResult.carryoverTaxationDetail).
 * carryoverTaxation 입력 제공 시만 포함.
 */
export interface CarryoverTaxationDetail {
  /** 적용 가능 여부 (기간·관계·자산 요건 모두 통과) */
  isEligible: boolean;
  /** 적용기간 (5년 or 10년) — 증여 등기접수일 기준 */
  applicablePeriodYears: 5 | 10;
  /**
   * 적용배제 사유 (있을 시).
   * - "expropriation": ② 1호 사용자 선언
   * - "one_house_exemption": ② 2호 사용자 선언 (고가주택 포함)
   * - "tax_comparison": ② 3호 자동 비교과세 (B 채택)
   * - "period_exceeded": ③ 기간 초과
   * - "relation_invalid": ① 단서 관계 요건 불충족 (사망 등)
   * - "family_business": ④ 가업상속공제 자산 (validation 차단 후 방어코드)
   */
  exclusionReason?: "expropriation" | "one_house_exemption" | "tax_comparison" | "period_exceeded" | "relation_invalid" | "family_business";
  /** Scenario A — 이월과세 적용 시나리오 */
  scenarioA: CarryoverScenarioADetail;
  /** Scenario B — 미적용 시나리오 (비교용) */
  scenarioB: CarryoverScenarioBDetail;
  /** 채택 시나리오 (A·B 중 결정세액 큰 쪽. 동률이면 A) */
  adoptedScenario: "A" | "B";
  /** ② 3호 비교과세 적용배제 여부 (B 채택 시 true) */
  comparisonExclusion: boolean;
}
