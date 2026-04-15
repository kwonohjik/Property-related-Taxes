/**
 * 상속세·증여세 계산 엔진 타입 정의
 *
 * 5개 모듈 간 데이터 계약:
 *   - inheritance-tax.ts (메인 엔진)
 *   - gift-tax.ts (메인 엔진)
 *   - property-valuation.ts (재산평가)
 *   - inheritance-deductions.ts + gift-deductions.ts (공제)
 *   - inheritance-gift-tax-credit.ts (세액공제)
 *   - exemption-rules.ts (비과세)
 */


// ============================================================
// 공통 공유 타입
// ============================================================

/** 계산 단계별 산식·금액 내역 (결과 breakdown 공통) */
export interface CalculationStep {
  label: string;
  amount: number;
  /** 상증법 §XX 등 근거 조문 */
  lawRef?: string;
  note?: string;
}

/** 공통 계산 결과 메타 */
export interface TaxResultMeta {
  breakdown: CalculationStep[];
  appliedLaws: string[];
  warnings: string[];
  /** 계산에 적용된 세법 기준일 (YYYY-MM-DD) */
  appliedLawDate: string;
}

// ============================================================
// 재산평가 (property-valuation.ts)
// ============================================================

/** 평가 방법 우선순위 (상증법 §60 원칙) */
export type ValuationMethod =
  | "market_value"           // 시가 (매매·감정·수용·경매)
  | "similar_sales"          // 유사매매사례가액 (시행령 §49①5호)
  | "standard_price"         // 보충적 평가 — 개별공시지가·기준시가
  | "appraisal"              // 감정평가액
  | "acquisition_cost"       // 취득가액 (예외적 보충)
  | "book_value";            // 장부가액 (비상장주식 보충)

/** 평가 대상 자산 종류 */
export type AssetCategory =
  | "real_estate_land"       // 토지
  | "real_estate_building"   // 건물
  | "real_estate_apartment"  // 아파트 (시세 조회 가능)
  | "listed_stock"           // 상장주식
  | "unlisted_stock"         // 비상장주식
  | "cash"                   // 현금 (지폐·동전 — §22 금융재산공제 대상 아님)
  | "financial"              // 예금·펀드·채권 (§22 금융재산공제 대상)
  | "deposit"                // 전세보증금 반환채권 (임차인인 경우 — 상속세 전용)
  | "other";                 // 기타재산

/** 재산 평가 입력 (단일 자산) */
export interface EstateItem {
  id: string;
  category: AssetCategory;
  name: string;
  /** 시가 (직접 입력 or 조회) — null이면 보충적 평가 */
  marketValue?: number;
  /** 개별공시지가 (토지) or 기준시가 (건물·아파트) */
  standardPrice?: number;
  /** 감정평가액 */
  appraisedValue?: number;
  /** 상장주식: 전후 2개월 일평균 종가 */
  listedStockAvgPrice?: number;
  listedStockShares?: number;
  /** 비상장주식 평가 데이터 */
  unlistedStockData?: UnlistedStockData;
  /** 임대차 정보 (임대보증금 차감) */
  leaseDeposit?: number;
  /** 저당권 설정 여부 */
  mortgageAmount?: number;
}

/** 비상장주식 평가 데이터 (시행령 §54) */
export interface UnlistedStockData {
  totalShares: number;
  ownedShares: number;
  /** 최근 3년 순손익 가중평균 (분자) */
  weightedNetIncome: number;
  /** 순자산가치 */
  netAssetValue: number;
  /** 자본환원율 (기본 10%) */
  capitalizationRate: number;
}

/** 재산 평가 결과 (단일 자산) */
export interface PropertyValuationResult {
  estateItemId: string;
  method: ValuationMethod;
  valuatedAmount: number;
  breakdown: CalculationStep[];
  warnings: string[];
}

// ============================================================
// 비과세·과세가액 불산입 (exemption-rules.ts / exemption-evaluator.ts)
// ============================================================

/**
 * 체크리스트 기반 비과세 항목 (ExemptionChecklist 컴포넌트 출력)
 * exemption-evaluator.ts에도 동일 인터페이스 export됨 (하위 호환)
 */
export interface ExemptionCheckedItem {
  ruleId: string;
  /** 해당 항목의 자산 가액 또는 금액 */
  claimedAmount: number;
  /** 장애인 신탁: 10년 합산 기사용 공제액 */
  priorDisabledTrustUsed?: number;
  /**
   * 공익법인 동족주식 초과분 금액 (§16 ②)
   * 5%(성실공익법인 10%) 초과 보유 주식의 시가 — 이 금액은 과세됨
   */
  excessStockAmount?: number;
  /** 공익법인 동족주식 5% 초과 보유 여부 (§16 ②) */
  relatedStockExceeded?: boolean;
  /** 혼인공제 기사용 여부 (§53의2 — 평생 1회) */
  marriageExemptionAlreadyUsed?: boolean;
  /** 면적 한도 항목의 실제 면적 (㎡) — 금양임야·묘토 */
  claimedAreaM2?: number;
  /** @deprecated claimedAreaM2 사용 권장 */
  areaM2?: number;
  /** 문화재 지정 취소 여부 (§12 1호 단서 — 취소 시 추징) */
  culturalDesignationRevoked?: boolean;
}

/**
 * 비과세 입력 (상증법 §11·§12·§46·§46의2)
 * @deprecated ExemptionCheckedItem[] 방식으로 대체됨.
 */
export interface ExemptionInput {
  /** 전사자 해당 여부 (§11) */
  isWarHero?: boolean;
  /** 국가 기증 재산 금액 (§12①) */
  donatedToState?: number;
  /** 제사용 재산 (§12②) */
  ceremonialProperty?: number;
  /** 문화재 자산 (§12③) */
  culturalProperty?: number;
  /** 비과세 증여 — 사회통념상 금품·학자금·치료비 등 (§46) */
  socialNormGifts?: number;
  /** 공익법인 출연재산 (§46의2) */
  publicInterestContribution?: number;
}

/** 비과세 계산 결과 */
export interface ExemptionResult {
  totalExemptAmount: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

// ============================================================
// 사전증여 내역 (상증법 §13·§47)
// ============================================================

/** 10년 이내 사전증여 내역 */
export interface PriorGift {
  giftDate: string; // ISO date
  /** 수증인 (상속인인지 여부 — 상속인이면 §13 합산, 비상속인이면 §13 ②) */
  isHeir: boolean;
  giftAmount: number;
  /** 당시 납부한 증여세 (§28 증여세액공제 계산용) */
  giftTaxPaid: number;
  /**
   * 당시 증여세 과세표준 (§28 ① 안분 한도 분자용).
   * 제공 시 안분 공식에서 gross 가액 대신 과세표준 사용 (법령 정확성 향상).
   * 미제공 시 giftAmount(gross)로 fallback.
   */
  giftTaxBase?: number;
  /** 수증인 관계 */
  doneeRelation?: DonorRelation;
}

// ============================================================
// 상속인 정보
// ============================================================

/** 상속인 관계 */
export type HeirRelation =
  | "spouse"
  | "child"
  | "lineal_ascendant"
  | "sibling"
  | "other";

/** 상속인 정보 */
export interface Heir {
  id: string;
  relation: HeirRelation;
  name?: string;
  birthDate?: string; // 미성년자·연로자 공제 계산용
  isDisabled?: boolean;
  /** 실제 상속받는 비율 (미입력 시 법정상속분 적용) */
  actualShareRatio?: number;
  isCohabitant?: boolean; // 동거주택 상속공제 요건
}

// ============================================================
// 상속공제 입력 (inheritance-deductions.ts)
// ============================================================

/** 상속공제 입력 (7종 + §24 종합한도) */
export interface InheritanceDeductionInput {
  heirs: Heir[];
  /** 배우자 실제 상속금액 (미입력 시 법정상속분으로 산정) */
  spouseActualAmount?: number;
  /** 일괄공제 선택 여부 (§21 5억 / 기초+인적공제 자동비교) */
  preferLumpSum?: boolean;
  /** 순금융재산 (§22 금융재산공제 계산용) */
  netFinancialAssets?: number;
  /** 동거주택 — 상속주택 공시가격 */
  cohabitHouseStdPrice?: number;
  /** 영농상속 — 농지·목장용지·어선 가액 */
  farmingAssetValue?: number;
  /** 가업상속 — 가업상속재산가액 */
  familyBusinessValue?: number;
  /** 가업 영위 기간 (년) */
  familyBusinessYears?: number;
  /**
   * 상속개시일 (ISO date) — 미성년자·연로자·장애인 인적공제의 나이 기준일.
   * 상증법 §20: 상속개시일 현재 나이로 판정해야 하므로 반드시 전달해야 함.
   * 미제공 시 계산일 기준으로 fallback (소급 계산 오류 가능).
   */
  deathDate?: string;
}

/** 상속공제 계산 결과 */
export interface InheritanceDeductionResult {
  basicDeduction: number;
  spouseDeduction: number;
  personalDeductionTotal: number;
  lumpSumDeduction: number;
  financialDeduction: number;
  cohabitationDeduction: number;
  farmingDeduction: number;
  familyBusinessDeduction: number;
  /** §24 종합한도 적용 후 최종 공제액 */
  totalDeduction: number;
  /** 일괄공제 vs 개별공제 선택 근거 */
  chosenMethod: "lump_sum" | "itemized";
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

// ============================================================
// 증여공제 입력 (gift-deductions.ts)
// ============================================================

/** 증여자와 수증자의 관계 */
export type DonorRelation =
  | "spouse"
  | "lineal_ascendant_adult"    // 성인 직계존속
  | "lineal_ascendant_minor"    // 미성년자 직계존속
  | "lineal_descendant"         // 직계비속
  | "other_relative";           // 기타 친족

/** 증여공제 입력 */
export interface GiftDeductionInput {
  donorRelation: DonorRelation;
  /** 혼인 공제 (§53의2) — ≤ 1억 */
  marriageExemption?: number;
  /** 출산 공제 (§53의2) — ≤ 1억 */
  birthExemption?: number;
  /** 10년 이내 동일인(동일 관계 그룹)에 대한 기사용 공제 합산 */
  priorUsedDeduction?: number;
}

/** 증여공제 계산 결과 */
export interface GiftDeductionResult {
  relationDeduction: number;
  marriageBirthDeduction: number;
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

// ============================================================
// 세액공제 입력 (credits/)
// ============================================================

/** 상속세 세액공제 입력 */
export interface InheritanceTaxCreditInput {
  /** 증여세액공제 (§28) — 사전증여별 납부세액 (PriorGift에서 자동 계산) */
  priorGifts?: PriorGift[];
  /** 외국납부세액 (§29) */
  foreignTaxPaid?: number;
  /** 단기재상속 — 피상속인이 상속받은 날로부터 경과 연수 */
  shortTermReinheritYears?: number;
  /** 단기재상속 — 당시 상속세 납부액 */
  shortTermReinheritTaxPaid?: number;
  /** 법정신고기한 내 신고 여부 (§69 3% 공제) */
  isFiledOnTime: boolean;
}

/** 증여세 세액공제 입력 */
export interface GiftTaxCreditInput {
  /** 외국납부세액 (§59) */
  foreignTaxPaid?: number;
  /** 법정신고기한 내 신고 여부 (§69 3% 공제) */
  isFiledOnTime: boolean;
  /** 조특법 과세특례 선택 (창업자금 §30의5 / 가업승계 §30의6) */
  specialTreatment?: "startup" | "family_business";
  /** 창업자금: 창업법인 설립 후 2년 이내 투자 완료 여부 */
  startupInvestmentCompleted?: boolean;
}

/** 세액공제 계산 결과 (상속·증여 공통 구조) */
export interface TaxCreditResult {
  giftTaxCredit: number;        // §28
  foreignTaxCredit: number;     // §29 or §59
  shortTermReinheritCredit: number; // §30 (상속만)
  filingCredit: number;         // §69
  specialTreatmentCredit: number;   // 조특법 §30의5·§30의6
  totalCredit: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

// ============================================================
// 메인 엔진 Input / Output
// ============================================================

/** 상속세 계산 입력 전체 */
export interface InheritanceTaxInput {
  /** 거주자 / 비거주자 */
  decedentType: "resident" | "non_resident";
  deathDate: string; // ISO date YYYY-MM-DD
  estateItems: EstateItem[];
  /** 장례비 (최대 1,500만원, 봉안시설 추가 시 +500만) */
  funeralExpense: number;
  funeralIncludesBongan: boolean;
  /** 공과금·사적채무 합계 */
  debts: number;
  /** 비과세 체크리스트 항목 (§11·§12) — ExemptionChecklist 컴포넌트 출력 */
  exemptions?: ExemptionCheckedItem[];
  preGiftsWithin10Years: PriorGift[];
  heirs: Heir[];
  deductionInput: InheritanceDeductionInput;
  creditInput: InheritanceTaxCreditInput;
  /** 세대생략 상속 여부 (§27 — 피상속인의 자녀를 건너뛴 손자·외손자 등) */
  isGenerationSkip?: boolean;
  /** 세대생략 수상속인 미성년 여부 (§27 ② — 과세표준 20억 초과 시 40% 적용) */
  isMinorHeir?: boolean;
  /**
   * 세대생략 해당 상속재산가액 (§27 ① 안분 계산용).
   * 전체 상속인 중 일부만 세대생략인 경우, 해당 재산에만 할증 적용.
   * 미제공 시 전체 산출세액에 할증 적용 (전체가 세대생략인 경우에 사용).
   */
  generationSkipAssetAmount?: number;
  /** 평가기준일 (기본: 상속개시일) */
  valuationBaseDate?: string;
}

/** 상속세 계산 결과 전체 */
export interface InheritanceTaxResult extends TaxResultMeta {
  /** 상속재산가액 (평가 후) */
  grossEstateValue: number;
  /** 비과세 차감액 */
  exemptAmount: number;
  /** 장례·채무 차감 */
  deductedBeforeAggregation: number;
  /** 사전증여재산 합산 */
  priorGiftAggregated: number;
  /** 상속세 과세가액 */
  taxableEstateValue: number;
  /** 공제 합계 (§24 한도 적용 후) */
  totalDeduction: number;
  /** 과세표준 */
  taxBase: number;
  /** 산출세액 (누진세율) */
  computedTax: number;
  /** 세대생략 할증액 */
  generationSkipSurcharge: number;
  /** 세액공제 합계 */
  totalTaxCredit: number;
  /** 결정세액 */
  finalTax: number;
  deductionDetail: InheritanceDeductionResult;
  creditDetail: TaxCreditResult;
  valuationResults: PropertyValuationResult[];
}

/** 증여세 계산 입력 전체 */
export interface GiftTaxInput {
  giftDate: string; // ISO date
  donorRelation: DonorRelation;
  giftItems: EstateItem[];
  /** 비과세 체크리스트 항목 (§46·§46의2) — ExemptionChecklist 컴포넌트 출력 */
  exemptions?: ExemptionCheckedItem[];
  priorGiftsWithin10Years: PriorGift[];
  /** 세대생략 증여 여부 */
  isGenerationSkip: boolean;
  /** 수증자 미성년 여부 (세대생략 20억 초과 40% 기준) */
  isMinorDonee: boolean;
  deductionInput: GiftDeductionInput;
  creditInput: GiftTaxCreditInput;
  /** 평가기준일 (기본: 증여일) */
  valuationBaseDate?: string;
}

/** 증여세 계산 결과 전체 */
export interface GiftTaxResult extends TaxResultMeta {
  /** 증여재산가액 (평가 후) */
  grossGiftValue: number;
  /** 비과세 차감액 */
  exemptAmount: number;
  /** 동일인 10년 합산 증여가액 */
  aggregatedGiftValue: number;
  /** 증여재산공제 */
  totalDeduction: number;
  /** 과세표준 (50만원 미만이면 0) */
  taxBase: number;
  /** 산출세액 */
  computedTax: number;
  /** 세대생략 할증액 */
  generationSkipSurcharge: number;
  /** 세액공제 합계 */
  totalTaxCredit: number;
  /** 결정세액 */
  finalTax: number;
  deductionDetail: GiftDeductionResult;
  creditDetail: TaxCreditResult;
  valuationResults: PropertyValuationResult[];
}
