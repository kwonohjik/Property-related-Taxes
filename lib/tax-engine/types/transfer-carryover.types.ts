/**
 * 배우자등 이월과세 + 비교과세 타입 — 소득세법 §97조의2
 *
 * TransferTaxInput.carryoverTaxation 입력 타입과
 * TransferTaxResult.carryoverTaxationDetail 결과 타입을 분리 정의.
 *
 * acquisitionCause === "carryover_gift" 일 때만 유효.
 */

import type { RateBasisFacts } from "../transfer-rate-holding-basis";

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
   * 증여자가 보유 중 지출한 자본적지출액 (§97조의2 ① 2호, 2023.12.31. 개정).
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
   * §97조의2 ① — 증여자와의 관계.
   * 배제 문언·시행시기 게이트가 **이 축으로 갈린다**(`carryover-donor-death.ts`).
   * 증여재산공제용 5분류(`bgDonorRelation`)와 **다른 축**이므로 재사용하지 않는다.
   */
  donorRelation?: "spouse" | "lineal" | "other";
  /**
   * §97조의2 ① 괄호 — 관계별로 **묻는 사실이 다르다**.
   * · spouse : 「**사망으로** 혼인관계가 소멸」 (이혼 소멸은 false — 이월과세가 **적용**된다)
   * · lineal : 「**양도 당시** 사망」
   */
  donorDeceased?: boolean;
  /**
   * 적용배제 — 사용자 선언 (§97조의2 ② 1호·2호·④항).
   * ② 3호(비교과세)는 자동 판정이므로 선언 불필요.
   * ⚠️ ① 관계요건(위 2필드)은 조문 계층이 달라 여기 넣지 않는다.
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
   * §97조의2 ① 3호, 시행령 §163의2 ②
   */
  giftTaxAddedToExpense: number;
  /** 증여세 상당액 한도 발동 여부 (잔액 한도 = 증여세 가산 전 양도차익) */
  giftTaxLimitApplied: boolean;
  /** 증여세 상당액 한도 캡 = 증여세 가산 직전 양도차익 */
  giftTaxLimitCap: number;
  /**
   * **부담부증여 전용** — 증여세 상당액이 채무비율로 안분된 내역 (「소득세법 시행령」 §163의2② 2호).
   *
   * ## 왜 시나리오 A에 싣는가 — 결과 카드가 **채택과 무관하게** 설명해야 한다
   *
   * 최종 `TransferTaxResult.transferBurdenedGiftBreakdown`은 **채택된 시나리오의 것**이라
   * B가 채택되면 A의 안분 내역이 사라진다. 그런데 비교 카드는 **A 컬럼을 항상 그린다** —
   * 거기 뜬 `giftTaxAddedToExpense`가 입력액과 다른 이유를 설명하려면 A 자신이 들고 있어야 한다.
   *
   * 일반 양도에서는 안분이 없으므로 undefined다.
   */
  giftTaxApportionment?: {
    /** 사용자가 입력한 증여세 상당액(총액). */
    raw: number;
    /** 채무비율 안분 후 = raw × 인수채무 ÷ 증여가액. */
    apportioned: number;
    /** 인수 채무액 B (산식 분자). */
    debtAmount: number;
    /** 증여가액 C (산식 분모). */
    giftValuation: number;
  };
  /**
   * 필요경비 가산 — 증여자 자본적지출 (시행시기 가드 후 실제 산입액).
   * §97조의2 ① 2호, 2023.12.31. 개정. 양도일 < 2024.1.1 시 0.
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
  /**
   * 본문 필요경비가 **개산공제(§163⑥)로 확정**됐는가 — 표시 라벨 분기 전용.
   *
   * 종전에는 UI가 `필요경비 === floor(기준시가 × 3%)` **금액 자기일치**로 이를 역추론했다.
   * 그 방식은 공유지분 축소·§97② swap 등으로 등식이 깨지면 개산공제를 "양도비 등"으로
   * **성격 자체를 오표시**한다. 엔진이 아는 사실이므로 엔진이 알려준다
   * (memory `feedback_ui_engine_dual_truth_avoidance`).
   */
  necessaryExpenseIsLumpDeduction?: boolean;
  /**
   * 개산공제 base로 **실제 사용된 값**(= 지분 기준시가 = floor(기준시가 × 지분율)).
   * 표시 산식 「… × 3%」가 표시된 값을 만들어내도록 하는 echo
   * (memory `feedback_engine_result_display_drift`). 단독소유면 기준시가와 같다.
   */
  lumpDeductionBase?: number;
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
  /**
   * **[echo] 채택 시나리오가 실제로 쓴 §104② 기산 사실.** 단건 세액에는 영향이 없다
   * (이미 그 입력으로 계산된 결과를 그대로 되비출 뿐이다).
   *
   * ## 왜 필요한가 — 다건 엔진이 「채택 결과」를 볼 방법이 없었다
   *
   * 단건 엔진은 STEP 0.475에서 `workingInput`을 **채택 시나리오의 입력**으로 갈아탄 뒤
   * 세율을 정한다. 시나리오 A는 `acquisitionDate`가 **증여자 취득일**(+ `acquisitionCause`는
   * `"gift"`)이고, 시나리오 B는 **증여 등기접수일**(+ `"purchase"`)이다
   * (`transfer-tax-carryover.ts` `inputABase` · `buildInputB`).
   *
   * 반면 다건 엔진(`transfer-tax-aggregate.ts`)의 세율군 분류(`classifyRateGroup`)와
   * 그룹 세액 재계산(`aggregateByGroup` → `calcTax`)은 **원본 item**을 본다. 그 item은
   * `acquisitionCause === "carryover_gift"` 그대로라 §104②2호 판정이 **채택 결과와 무관하게**
   * 최상위 `donorAcquisitionDate`의 유무만으로 갈렸다 — A를 채택했는데 `short_term`으로,
   * B를 채택했는데 `progressive`로 분류되는 어긋남이다.
   *
   * ## 왜 재도출이 아니라 echo인가
   *
   * 「A면 증여자 취득일, B면 등기접수일」을 다건 쪽에서 다시 유도하면 시나리오 입력 구성이
   * 바뀔 때 한쪽만 따라가는 dual-truth가 된다. 그래서 **단건이 실제로 쓴 입력**을 그대로 싣는다.
   *
   * 형태는 §104② 판정 헬퍼가 받는 **사실 집합**(`RateBasisFacts`)과 동일하다 —
   * 소비자는 이 값을 그대로 입력에 덮어쓰기만 하면 된다(판단을 넘기지 않는다).
   */
  adoptedRateBasis?: RateBasisFacts;
}
