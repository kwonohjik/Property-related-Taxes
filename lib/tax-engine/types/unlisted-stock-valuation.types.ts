/**
 * 비상장주식 V2 평가 — 별지 부표3 완전 재현 (Phase 2~4)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation.engine.design.md
 * Legal Verification: docs/02-design/features/inheritance-unlisted-stock-valuation.legal-verification.md
 *
 * 분리 사유: inheritance-gift.types.ts 800줄 정책 준수 (2026-05-22)
 * Barrel re-export로 inheritance-gift.types.ts 호환 보존.
 */

/**
 * §54④ 순자산가치만 적용 사유 (V2 — 4호 삭제 반영, 5종)
 *   KoreanLaw 검증 2026-05-22: 4호 삭제 / 5호 = 자산 중 주식 80% 이상
 */
export type UnlistedNetAssetOnlyReason =
  | "liquidation"        // 1호: 청산·해산·합병 (무조건)
  | "lt3y"               // 2호: 사업개시 3년 미만·휴·폐업 (무조건)
  | "real_estate_80"     // 3호: 부동산 80% 이상 (단서: 가중평균 < 순자산일 때만)
  | "stock_holding_80"   // 5호: 주식등 80% 이상 (단서: 가중평균 < 순자산일 때만)
  | "remaining_3y";      // 6호: 잔여 존속기한 3년 이내 (무조건)

/**
 * §53⑧ 최대주주 할증평가 배제 사유 9가지
 */
export type UnlistedPremiumExclusionReason =
  | "continuous_loss_3y"        // 1호
  | "all_sold_within_6m"        // 2호
  | "calc_gift_profit"          // 3호
  | "subsidiary_other_max"      // 4호
  | "all_negative_op_income_3y" // 5호
  | "liquidation_confirmed"     // 6호
  | "not_max_after_succession"  // 7호
  | "deemed_gift_nominee"       // 8호
  | "small_medium_enterprise";  // 9호 (중소·중견기업)

/** 자본금 변동 (환산주식수 산정) — 상증규 §17의3⑤ */
export interface UnlistedCapitalChange {
  changeType: "paid_in" | "free_issue" | "capital_reduction";
  /** 변동일. 새 행 추가 시 빈값(undefined)으로 시작 — 사용자가 직접 입력해야 함. validate가 미입력 차단. */
  changeDate: Date | undefined;
  sharesIssued: number;
  /** 유상증자 1주당 납입금액 (액면가가 아닐 수 있음 — §56⑤1호) */
  pricePerShare?: number;
}

/** 사업연도별 가산·차감 항목 (별지 부표3 6쪽 ①~㉒) — §56④ 매핑 */
export interface FiscalYearAdjustment {
  /** 사업연도 표기 (예: "2023.1.1.~12.31.") */
  fiscalYearLabel: string;
  /** 사업연도 종료일 */
  fiscalYearEndDate: Date;
  /**
   * 사업연도 개시일 (§17의3② 1년 미만 사업연도 연환산용).
   * 미입력 시 12개월 가정(종료일−1년+1일) — 회귀 0.
   * 신설법인 첫 사업연도·결산기 변경 등 1년 미만 시 입력하면 순손익액 1년 환산.
   */
  fiscalYearStartDate?: Date;
  /** ① 각 사업연도 소득금액 (법인세법 §14) */
  taxableIncome: number;

  // 가산 항목 (②~⑦) — §56④ 1호 가~마
  addRefundInterest?: number;          // ② 국세·지방세 환급금 이자 (§18 4호)
  addLossFromDividend?: number;        // ③ 수입배당금 익금불산입 (§18의2·§18의4)
  addCarriedDonation?: number;         // ④ 이월 기부금 손금산입 (§24⑤)
  addCarriedCarPayment?: number;       // ⑤ 이월 업무용승용차 손금산입 (§27의2 ③·④)
  addForexValuationGain?: number;      // ⑥ 외화환산이익 (§56④1라)
  addOtherByOrdinance?: number;        // ⑦ 기타 (§56④1마)

  // 차감 항목 (⑧~㉒) — §56④ 2호 가~마
  subCorporateTax?: number;            // ⑧ 당해 사업연도 법인세 (§56④2가)
  subAdditionalTaxes?: number;         // ⑨ 법인세 감면액·농특세·지방소득세 (§56④2가)
  subFines?: number;                   // ⑩ 벌금·과료·과태료·가산금·체납처분비 (§21 3호·4호)
  subCompulsoryPublicCharges?: number; // ⑪ 법령상 의무 아닌 공과금 손금불산입 (§21의2)
  subPunitiveDamages?: number;         // ⑫ 징벌적 손해배상금 (§21의2·§27)
  subWithholdingPenalty?: number;      // ⑬ 징수불이행 세액 (§56④2나)
  subExcessiveExpenses?: number;       // ⑭ 과다경비 손금불산입 (§24~§28)
  subDonationExcess?: number;          // ⑮ 기부금 한도초과 (§24)
  subEntertainmentExcess?: number;     // ⑯ 접대비 한도초과 (§25)
  subNonBusinessExpenses?: number;     // ⑰ 업무무관 비용 (§27)
  subNonBusinessCarExpenses?: number;  // ⑱ 업무용승용차 비용 손금불산입 (§27의2)
  subInterestPayment?: number;         // ⑲ 지급이자 손금불산입 (§28)
  subDepreciationShortage?: number;    // ⑳ 감가상각 시인부족액 (§56④2라)
  subForexValuationLoss?: number;      // ㉑ 외화환산손실 (§56④2마)
  subOtherByOrdinance?: number;        // ㉒ 기타 (§56④2다·§136)
}

/** 순자산가액 계산 입력 (별지 부표3 2~3쪽) — §55① + §17의2 1~4호 매핑 */
export interface UnlistedNetAssetCalculation {
  // 자산총액 (가) — §17의2 1·2호
  bsTotalAssets: number;            // ① 재무상태표상 자산가액
  assetValuationDelta: number;      // ② 평가차액 (§60·§66 평가가액 − 장부)
  corpTaxReservedAmount: number;    // ③ 법인세법상 유보금액
  paidInCapitalIncrease: number;    // ④ 유상증자 등
  otherEarnedRights: number;        // ⑤ 평가기준일 현재 지급받을 권리 확정 가액 (§17의2 1호)
  prepaidExpenses: number;          // ⑥ 선급비용 + 법인세령 §24①2호바목 무형자산 (§17의2 2호 — 자산 차감)
  preGiftRetainedEarnings: number;  // ⑦ 증자일 전의 잉여금 유보액 (차감)

  // 부채총액 (나) — §17의2 3·4호
  bsTotalLiabilities: number;       // ⑨ 재무상태표상 부채액
  corporateTaxPayable: number;      // ⑩ 법인세 (§17의2 3호 가)
  farmingSurtax: number;            // ⑪ 농어촌특별세 (§17의2 3호 가)
  localIncomeTax: number;           // ⑫ 지방소득세 (§17의2 3호 가)
  dividendPayable: number;          // ⑬ 평가기준일 현재 확정 배당금·상여금 (§17의2 3호 나)
  retirementProvision: number;      // ⑭ 임원·사용인 전원 퇴직 시 퇴직급여 추계액 (§17의2 3호 다)
  otherProvision: number;           // ⑮ 기타 충당금 중 비용 확정분 (§17의2 4호 가)
  reserveExcluded: number;          // ⑯ 제준비금 부채 차감 (§17의2 4호 본문)
  allowanceExcluded: number;        // ⑰ 제충당금 부채 차감 (§17의2 4호 본문)
  deferredTaxAdjustment: number;    // ⑱ 기타 (이연법인세대 등)

  // 보험사업 단서 — §17의2 4호 나·다 (F-11 후속, optional)
  insuranceReservePolicy?: number;
  insuranceExtraordinaryReserve?: number;
  insuranceSurrenderReserve?: number;

  // ===== PR-N: 3쪽 평가차액 행 단위 입력 (UI 통합 v3) =====
  /**
   * 평가차액 자산·부채 행 단위 입력 (3쪽 5.평가차액).
   * 자산·부채는 `category` 필드로 단일 배열에 통합 저장.
   * 미입력 시 `assetValuationDelta` 총액 사용 (3중 패턴 fallback).
   *
   * 엔진 진입점(`unlisted-orchestrator.ts`)이 `resolveEvaluationDelta()`를 호출하여
   * 자산·부채 행의 **차액(자산 합 − 부채 합)**을 `assetValuationDelta`에 주입.
   * 별지 양식 2쪽 4.가.② "평가차액" 항목과 1:1 매핑.
   *
   * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-ui-integration.plan.md §2-1
   */
  evaluationDeltaRows?: import("@/lib/tax-engine/property-valuation/evaluation-delta").EvaluationDeltaRow[];
}

/** 비상장주식 V2 평가 입력 (별지 부표3 양식 1:1 매핑) */
export interface UnlistedStockValuationInput {
  // === 1쪽: 평가대상 비상장법인 ===
  corpName: string;
  representative?: string;
  /** 사업자등록번호 (제1쪽 1번 — 표시 전용, 계산 무관) */
  businessRegistrationNumber?: string;
  /** 자본금 (제1쪽 1번 — 표시 전용, 계산 무관) */
  capital?: number;
  businessStartDate: Date;
  evaluationDate: Date;                  // 평가기준일 (상속개시일 or 증여일)
  faceValuePerShare: number;             // 1주당 액면가액
  totalShares: number;                   // 발행주식총수 (평가기준일 현재)
  ownedShares: number;                   // 피상속인·수증인 소유 주식수

  /** §54① 본문 괄호 부동산과다보유법인 여부 — 소법 §94①4호다목 (자산 50% 이상). 사용자 ON/OFF 직접 지정. */
  isRealEstateHeavy: boolean;

  /**
   * §22② 최대주주 해당 여부 (금융재산 상속공제 배제 토글).
   * true  = 최대주주 해당 → 이 비상장주식을 §22 금융재산 상속공제 대상금액에서 제외 (법 §22②).
   * false/undefined = 미해당 → §22 포함 (비상장 default).
   * resolveFinancialEligibility가 본 값을 최우선 가드로 참조한다.
   * ※ §22②(금융재산공제 배제)는 §63③(할증평가 ×120%, isMaxShareholder)와 다른 개념.
   */
  isSection22MajorShareholder?: boolean;

  /** §54④ 순자산 단독 평가 사유 (5종) */
  netAssetOnlyReason?: UnlistedNetAssetOnlyReason;

  /** 3개년 사업연도 가산·차감 (인덱스 0=1년전 ×3, 1=2년전 ×2, 2=3년전 ×1) */
  fiscalYears: [FiscalYearAdjustment, FiscalYearAdjustment, FiscalYearAdjustment];

  /** 자본금 변동 (유상증자·무상증자·감자) — §56③·⑤ */
  capitalChanges: UnlistedCapitalChange[];

  /** 순자산가액 계산 입력 */
  netAssetValueRaw: UnlistedNetAssetCalculation;

  /** §55③ 3호 결손법인 — 평가기준일 직전 3년 계속 결손 → 영업권 자동 0 */
  isContinuousLossLastThreeYears: boolean;

  /** 비상장주식 §54① 환원율 (기본 0.10 — 상증규 §17) */
  capitalizationRate: number;

  /** 영업권 §59② 이자율 (기본 0.10 — 상증규 §19①). 통상 환원율과 동일 */
  goodwillRate?: number;

  /**
   * PR-P (§54③): 평가법인이 다른 비상장주식 10% 이하 보유 시 이동평균법 취득가액 갈음 옵션.
   * 미입력·빈 배열 → 옵션 미적용.
   * Plan: docs/00-pm/inheritance-unlisted-stock-other-holdings-section-54-3.plan.md
   */
  otherUnlistedHoldings?: import("@/lib/tax-engine/property-valuation/other-unlisted-holdings").OtherUnlistedHolding[];

  /**
   * PR-K (§54⑥): 평가심의위원회 신청 옵션 (70~130% 4방법).
   * 미입력 → 옵션 미적용. 참고용 메타로만 동작 — 본 결과 무변경.
   * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md
   */
  evaluationCommittee?: import("@/lib/tax-engine/property-valuation/evaluation-committee-section-54-6").EvaluationCommitteeInput;

  /**
   * PR-G (§56②): 추정이익 갈음 옵션 — 둘 이상 평가기관의 1주당 추정이익 평균가액으로
   * 순손익가치(⑤) 갈음. 미입력 → 옵션 OFF(현행 가중평균 경로).
   * Plan: docs/00-pm/inheritance-unlisted-stock-estimated-profit-section-56-2.plan.md
   */
  estimatedProfit?: import("@/lib/tax-engine/property-valuation/estimated-profit-section-56-2").EstimatedProfitInput;

  /**
   * PR-L (§63②1호): 기업공개 준비 중 법인 평가 옵션.
   * 평가기준일이 [유가증권신고일 − 6개월(상속)/3개월(증여), 거래소 상장 전) 윈도우에 있으면
   * 최종 1주당 평가액(§54)을 MAX(공모가격, §54 보충적평가)로 교체. 미입력 → 옵션 OFF(현행 §54).
   * Plan: docs/00-pm/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.plan.md
   */
  preIpoListing?: import("@/lib/tax-engine/property-valuation/pre-ipo-listing-section-63-2").PreIpoListingInput;

  /**
   * 자기주식 보유 시 평가방법 (상증령 §54②·§55① + 재재산-1494·재산-240).
   * undefined = 자기주식 없음(현행 동작 100% 보존).
   *   - temporary_holding(일시보유): 자기주식을 1주당 평가액(X)으로 재평가해 자산 가산 → 자기참조 평가.
   *   - cancellation(소각·감자): 발행주식총수에서 차감(N−t), 자산 미포함.
   * Plan/Design: docs/02-design/features/inheritance-unlisted-stock-treasury-stock.*
   */
  treasuryStock?: {
    shares: number; // 자기주식수 (0 < shares < totalShares)
    purpose: "temporary_holding" | "cancellation";
  };

  /**
   * 합병 후 3년 미경과 합병법인 순손익액 합산 (상증령 §56③, 상증통 63-56…12·서서-1071·재재산-181).
   * undefined = 합병 없음(현행 fiscalYears 기반 순손익 경로 100% 보존).
   * 설정 시 1주당 순손익액(사)을 합병법인+피합병법인 합산값으로 대체 → 연환산(§17의3②) skip.
   * Design: docs/02-design/features/unlisted-net-income-fiscal-year-change.engine.design.md
   */
  mergerContext?: import("@/lib/tax-engine/types/merger-net-income.types").MergerNetIncomeContext;

  // === 할증평가 §63③ ===
  isMaxShareholder: boolean;
  /**
   * 회사 규모. §63③ + §53⑥⑦⑧ 9호:
   *   - small: 중소기업 → 할증 배제 ×100%
   *   - medium: 중견기업(매출 5천억 미만) → 할증 배제 ×100%
   *   - large: 일반기업 → ×120% (할증 적용)
   */
  companySize: "small" | "medium" | "large";
}

/** 사업연도별 산출 결과 (별지 6쪽 다·라·마·바·사) */
export interface FiscalYearBreakdown {
  label: string;
  taxableIncome: number;
  addTotal: number;                  // 가산 합계 (②~⑦)
  subTotal: number;                  // 차감 합계 (⑧~㉒)
  adjustedNetIncome: number;         // 다. 순손익액 (= ① + 가산 − 차감)
  capitalIncreaseAdjustment: number; // 라. 유상증자·감자 반영액 (§56⑤)
  finalNetIncome: number;            // 마. 최종 순손익액 (다 ± 라)
  convertedShares: number;           // 바. 환산주식수 (§17의3⑤)
  perShareNetIncome: number;         // 사. 1주당 순손익액 = 마 / 바

  // ── 별지 6쪽 ②~㉒ echo (optional — 2025.07.10 양식 21행 표시용, 산식 무관) ──
  addRefundInterest?: number;          // ②
  addLossFromDividend?: number;        // ③
  addCarriedDonation?: number;         // ④
  addCarriedCarPayment?: number;       // ⑤
  addForexValuationGain?: number;      // ⑥
  addOtherByOrdinance?: number;        // ⑦
  subCorporateTax?: number;            // ⑧
  subAdditionalTaxes?: number;         // ⑨
  subFines?: number;                   // ⑩
  subCompulsoryPublicCharges?: number; // ⑪
  subPunitiveDamages?: number;         // ⑫
  subWithholdingPenalty?: number;      // ⑬
  subExcessiveExpenses?: number;       // ⑭
  subDonationExcess?: number;          // ⑮
  subEntertainmentExcess?: number;     // ⑯ 기업업무추진비
  subNonBusinessExpenses?: number;     // ⑰
  subNonBusinessCarExpenses?: number;  // ⑱
  subInterestPayment?: number;         // ⑲
  subDepreciationShortage?: number;    // ⑳
  subForexValuationLoss?: number;      // ㉑
  subOtherByOrdinance?: number;        // ㉒
}

/** 영업권 평가 결과 (별지 5쪽) */
export interface UnlistedGoodwillResult {
  weightedAvg3y: number;          // 가. 3년 순손익액 가중평균 (§59③ 준용 §56①)
  weightedAvgHalf: number;        // 나. 가 × 50%
  selfCapital: number;            // 다. 평가기준일 현재 자기자본 (§55① 영업권 포함 전 순자산가액)
  rate: number;                   // 라. 상증규 §19① 이자율 (10%)
  selfCapitalRate: number;        // 마. 다 × 라
  annualExcessProfit: number;     // 나 − 마 (음수 시 0)
  durationYears: number;          // 바. 영업권 지속연수 = 5년
  goodwillCalc: number;           // 사. ∑(나−마)/(1+r)^n for n=1..5
  intangibleDeduction: number;    // 아. 매입 무체재산권 감가상각비 차감
  goodwillFinal: number;          // 자. max(사 − 아, 0)
  excludedByLaw?: "liquidation" | "real_estate_80" | "lt3y" | "continuous_loss_3y"; // §55③ 자동 배제
}

/** 비상장주식 V2 평가 결과 (별지 부표3 1쪽 ③~⑨ 매핑) */
export interface UnlistedStockValuationResult {
  // === 1쪽 3.1주당 가액의 평가 (③~⑨) ===
  netAssetTotal: number;               // ③ 순자산가액 (영업권 포함 후)
  netAssetPerShare: number;            // ④ 1주당 순자산가액
  netIncomePerShare: number;           // ⑤ 1주당 최근 3년 순손익가치
  weightedAvgPerShare: number;         // ⑥-㉠ 가중평균 = (⑤×3 + ④×2)/5 (or 부동산 (⑤×2+④×3)/5)
  netAssetFloor80: number;             // ⑥-㉡ ④ × 80%
  finalPerShareValue: number;          // ⑥ max(㉠, ㉡)
  perShareValueNonMaxShareholder: number; // ⑦ 비최대주주 1주당 평가액 = ⑥
  premiumPerShare: number;             // ⑧ 최대주주 1주당 평가액 = ⑥ × (1+할증률)
  finalPerShareForReporting: number;   // ⑨ 보충적 평가가액 (⑦ or ⑧)
  netAssetFloorApplied: boolean;

  // === 6쪽 순손익가치 명세 ===
  fiscalYearBreakdowns: [FiscalYearBreakdown, FiscalYearBreakdown, FiscalYearBreakdown];
  weightedNetIncomePerShare: number;   // 아. 1주당 가중평균순손익액
  capitalizationRate: number;          // 자. 환원율 (상증규 §17 = 10%)

  /**
   * §17의3② 1년 미만 사업연도 연환산 echo (산식 무변경 — 표시·검증용).
   * annualizationApplied[i] = 해당 사업연도 개월수 < 12 여부.
   * annualizedPerShareNetIncome[i] = 환산 후 1주당 순손익액 (가중평균 입력값).
   */
  annualizationApplied?: [boolean, boolean, boolean];
  annualizedPerShareNetIncome?: [number, number, number];

  /**
   * 합병 후 3년 미경과 순손익 합산 echo (mergerContext 입력 시에만 채움).
   * mergerApplied=true 시 1주당 순손익액(사)이 합병법인+피합병 합산값으로 대체되고 연환산은 skip.
   */
  mergerApplied?: boolean;
  mergerResult?: import("@/lib/tax-engine/types/merger-net-income.types").MergerNetIncomeResult;

  // === 5쪽 영업권 ===
  goodwillCalculation: UnlistedGoodwillResult;

  // === 할증평가 ===
  premiumRate: number;                 // 0 (배제) | 0.20 (×120%)
  premiumExclusionReason?: UnlistedPremiumExclusionReason;

  /**
   * 자기주식 처리 내역 (treasuryStock 입력 시에만 채움).
   * 일시보유=자기참조 평가 / 소각·감자=발행주식총수 차감(N−t).
   */
  treasuryStockApplied?: {
    purpose: "temporary_holding" | "cancellation";
    shares: number;
    effectiveTotalShares: number;      // 일시보유=N, 소각·감자=N−t
    selfReferentialValue?: number;     // 일시보유 X(=⑥). 소각은 undefined
    floor80SelfReferentialApplied?: boolean;
    floor80NetAssetValue?: number;     // NA80 = floor(A/(N−0.8t))
  };

  // === 최종 ===
  totalValuation: number;              // ⑨ × ownedShares
  warnings: string[];
  appliedRules: string[];

  /**
   * PR-P (§54③): 다른 비상장주식 옵션 평가 결과 (참고용 메타).
   * 자산총액(bsTotalAssets) 자동 가산 없음 — 사용자가 별도 입력 책임.
   * 미입력·빈 배열 시 undefined.
   */
  otherUnlistedHoldingsEvaluated?: import("@/lib/tax-engine/property-valuation/other-unlisted-holdings").OtherUnlistedHoldingResult[];

  /**
   * PR-K (§54⑥): 평가심의위원회 신청 옵션 평가 결과 (참고용 메타).
   * 본 결과 (finalPerShareForReporting·totalValuation) 무변경.
   * 미입력 시 undefined.
   */
  evaluationCommitteeApplied?: import("@/lib/tax-engine/property-valuation/evaluation-committee-section-54-6").EvaluationCommitteeResult;

  /**
   * PR-G (§56②): 추정이익 갈음 결과 echo (내부 .applied boolean 보유).
   * applied=true 시 netIncomePerShare(⑤)가 추정이익 평균가액 ÷ 환원율로 갈음됨.
   * 미입력 시 undefined.
   */
  estimatedProfitResult?: import("@/lib/tax-engine/property-valuation/estimated-profit-section-56-2").EstimatedProfitResult;

  /**
   * PR-L (§63②1호): 기업공개 준비 중 평가 결과 echo (내부 .applied boolean 보유).
   * applied=true 시 finalPerShareValue가 MAX(공모가, 보충적평가)로 override됨.
   * 미입력 시 undefined.
   */
  preIpoListingResult?: import("@/lib/tax-engine/property-valuation/pre-ipo-listing-section-63-2").PreIpoListingResult;
}
