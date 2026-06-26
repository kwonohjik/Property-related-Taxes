/**
 * 증여로 보는 경우 (증여 예시·추정·의제) — 공통 타입.
 * Phase 1: 보험금§34 · 저가고가§35 · 채무면제§36 · 부동산무상사용§37 · 금전무상대출§41의4.
 *
 * 분할 구조:
 *   - 이 파일: Result 타입 (DeemedGiftResult·하위 result 타입) + DeemedGiftType + union
 *   - gift-deemed-input-types.ts: Input 인터페이스 + input 하위타입
 */
import type { CalculationStep, GiftDonorRelation } from "../types/inheritance-gift.types";

// Input 타입은 gift-deemed-input-types.ts에서 전부 re-export (기존 import 경로 보존)
export type {
  TrustBenefitInput,
  InsuranceInput,
  DebtForgivenessInput,
  FreeRealEstateInput,
  FreeUsePeriod,
  RectificationInput,
  FreeLoanInput,
  FreeLoanAggregatedInput,
  FreeLoanItem,
  MergerInput,
  MergerShareholders,
  CapitalIncreaseInput,
  CapShareholder,
  CapitalIncreaseAllocationInput,
  ConvertibleStockInput,
  CapitalDecreaseInput,
  CapitalDecreaseShareholder,
  ContributionParty,
  ContributionInput,
  ConvertibleBondInput,
  AcquisitionFundPresumptionInput,
  NomineeTrustInput,
  ShareholderDividend,
  ExcessDividendGiftTaxContext,
  ExcessDividendInput,
  ListingGainInput,
  PropertyServiceUseInput,
  OrgChangeInput,
  ValueIncreaseAcquisitionCause,
  ValueIncreaseReason,
  ValueIncreaseInput,
  ScRelation,
  SpecificCorpShareholder,
  SpecificCorpInput,
  RcShareholder,
  RcIntermediaryCorpItem,
  RcExclusionType,
  RcSalesPartner,
  RelatedCorpInput,
  DeemedGiftInput,
} from "./gift-deemed-input-types";

/** Phase 1 의제 유형 (discriminated union 판별자) */
export type DeemedGiftType =
  | "trust_benefit" // §33 신탁이익의 증여 (1)
  | "insurance" // §34 (2)
  | "bargain_transfer" // §35 (3)
  | "debt_forgiveness" // §36 (4)
  | "free_realestate" // §37 (5)
  | "free_loan" // §41의4 (6)
  | "free_loan_aggregated" // §41의4 §43② 1년내 동일거래 합산 (6b)
  | "merger" // §38 (7)
  | "capital_increase" // §39 (8) — 단건
  | "capital_increase_allocation" // §39 cap-table 다수증자·다증여자 (8b)
  | "capital_decrease" // §39의2 (9)
  | "contribution" // §39의3 (10)
  | "convertible_stock" // §39①3호 전환주식 (8-3)
  | "convertible_bond" // §40 (11)
  | "acquisition_fund_presumption" // §45 재산취득자금·채무상환 증여추정 (Phase 3)
  | "nominee_trust" // §45의2 명의신탁 증여의제 (Phase 3)
  | "excess_dividend" // §41의2 초과배당 (Phase 3)
  | "listing_gain" // §41의3 상장이익 / §41의5 합병상장이익 (Phase 3)
  | "property_service_use" // §42 재산사용·용역제공 (Phase 3)
  | "org_change" // §42의2 법인 조직변경 (Phase 3)
  | "value_increase" // §42의3 재산취득 후 가치증가 (Phase 3)
  | "specific_corp" // §45의5 특정법인과의 거래 (Phase 3)
  | "related_corp"; // §45의3 특수관계법인과의 거래(일감몰아주기) (Phase 3)

/** §41의2 초과배당 결과 상세 (DeemedGiftResult.excessDividendDetail) */
export interface ExcessDividendDetail {
  // 초과배당금액 자동산정 내역
  totalDividend: number;        // 법인 전체 배당총액
  proportionalDividend: number; // 특수관계인 비례 배당(지분×총배당)
  excessBeforeRatio: number;    // ①가액 = 실수령 − 비례
  majorShortfall: number;       // 최대주주 과소배당금액
  totalShortfall: number;       // 총과소배당금액
  ratioNumer: number;           // ②비율 분자 = majorShortfall
  ratioDenom: number;           // ②비율 분모 = totalShortfall
  excessDividendAmount: number; // 초과배당금액 = ①×②

  // 소득세 상당액 산정 내역
  incomeTaxMode: "undetermined" | "separate" | "comprehensive" | "exempt";
  appliedRateTableSet: "6bracket_2018" | "7bracket_2024" | null;
  incomeTaxEquivalent: number; // 소득세 상당액 (원)
  comprehensiveMaxDetail?: {   // 종합과세 Max 계산 내역
    taxA: number;              // ⓐ과세표준×세율
    taxB: number;              // ⓑ(과세표준−초과배당)×세율
    taxAminusB: number;        // ⓐ−ⓑ
    taxFloor: number;          // 초과배당금액×14%
    appliedAmount: number;     // Max(ⓐ−ⓑ, 14%)
  };

  // 법적 처리 방식
  taxMethod: "current_deduction_from_base" | "legacy_credit_from_tax";

  // 정산 2-pass (현행 2021~, giftTaxContext 제공 시)
  settlement?: {
    initialGiftTax: number;   // ㉮ 당초 증여세액
    settlementGiftTax: number; // ⑭ 정산 증여세액
    settlementDue: number;    // 정산 납부액 (음수=환급)
    isRefund: boolean;
  };

  // 구법 산출세액공제 (2018~2020, giftTaxContext 제공 시)
  legacyCredit?: {
    grossGiftTax: number;       // 할증포함 산출세액
    legacyCreditAmount: number; // min(소득세상당액, 산출세액)
    finalTax: number;           // 산출세액 − 공제액
  };

  // §47② 합산배제 안내
  isAggregationExcluded?: boolean;
}

/** §45의3 수증자 1명의 직접/간접 분해 명세 (배열 요소 — Map 금지) */
export interface RcRecipientBreakdown {
  /** 표시명: name.trim() || "지배주주등" (feedback_no_internal_id_in_result) */
  recipientName: string;
  directGain: number;
  indirectGain: number;
  subtotal: number;
  pretaxProfit: number;
  tradeRatioOver: { numer: number; denom: number };
  /** 직접보유비율(차감 전 raw) — UI 대칭 표시 */
  directRatioRaw: { numer: number; denom: number };
  /** §⑱ recipient 간접보유비율 raw — "미작동"과 "차감후 0" 구분 echo */
  indirectRatioRaw: { numer: number; denom: number };
  directOwnershipOver: { numer: number; denom: number };
  indirectOwnershipOver: { numer: number; denom: number };
  additionalExclusion: number;
  totalExclusion: number;
  dividendDeduction: number;
}

/** Phase B 결과 매트릭스 (Record — NextResponse.json 직렬화 안전, Map 금지) */
export interface MergerMatrix {
  recipients: {
    id: string;
    name: string;
    grossGain: number; // 차감전 이익
    selfGift: number; // 자기증여 차감액
    netGain: number; // 순 증여이익
    applied: boolean; // §28④ 기준금액 이상
    threshold: number;
  }[];
  /** 수증자 id → 증여자 id → 안분액 */
  allocation: Record<string, Record<string, number>>;
  totalDeemedGift: number; // Σ applied 수증자 순이익
}

/** 수증자 1명 × 증여자 1명 분할 1행 ((증여자) 카르테시안) — AllocationResult 하위 타입 */
export interface DonationSplit {
  beneficiaryId: string; // 이익 본 자
  donorId: string; // 손해 본 자(증여자)
  value: number; // 이 쌍 증여재산가액(과세분, 특수관계 아니면 0)
  excludedReason?: string; // value 0 사유 (특수관계 부재 등)
}

/** 증자 cap-table 결과 (전부 array/object — Map 금지) */
export interface CapitalIncreaseAllocationResult {
  type: "capital_increase_allocation";
  perShareAfter: number; // ㉯ 실제 증자후 1주당 평가가액
  perBeneficiary: Array<{ beneficiaryId: string; total: number; byDonor: DonationSplit[] }>;
  /** 교재 검증내역 = 주주별 증자전·후 평가·증감 (Σdelta=0) */
  byShareholder: Array<{ id: string; name?: string; preValuation: number; paidIn: number; postValuation: number; delta: number }>;
  reconciliation: { totalGain: number; totalLoss: number; balanced: boolean };
  splits: DonationSplit[];
}

/** 멀티 모드 결과 (Map 금지 — plain 배열) */
export interface CapitalDecreaseMultiResult {
  caseType: "low" | "high";
  postPerShareExact: number; // 감자 후 1주당 평가액 정확값(검증표·증여이익 계산용; 표시 금지)
  postPerShareDisplay: number; // Math.round(exact) — UI 표시 전용
  donees: CapitalDecreaseMultiDonee[];
  verification: CapitalDecreaseVerification[];
}

export interface CapitalDecreaseMultiDonee {
  name: string;
  isTaxable: boolean; // 대주주등(§28②) AND 특수관계(relationGroup)
  nonTaxableReason?: string; // "비특수관계" | "대주주 아님" | 고가게이트 미충족
  total: number; // 과세 시 총 증여재산가액 (비과세·기준금액 미달 시 0)
  potentialAmount?: number; // 비과세 수증자 참고 산출액 (게이트 무시 가정치)
  thresholdApplied: number; // 적용 기준금액 (0 또는 300_000_000)
  fromDonors: { donorName: string; amount: number }[]; // 증여자별 분해(floor; 마지막 잔액 흡수)
}

export interface CapitalDecreaseVerification {
  name: string;
  preValue: number; // 감자 전 주식가액 = preShares × sharePrice
  redemptionPaid: number; // 감자대가(소각주주만) = redeemedShares × redemptionPricePerShare
  postValue: number; // 감자 후 주식가액(잔존주주 floor + 마지막 잔액 흡수, 감자주주=0)
  delta: number; // 증감 = postValue + redemptionPaid − preValue
}

/** §45의5② 증여세 한도 계산 (수증자별) */
export interface SpecificCorpLimitCalc {
  computedTax: number; // ㉮ 일반 산출세액
  directGiftTax: number; // ㉠ 직접증여 가정 산출세액(법인세 차감 前)
  corpTaxShare: number; // ㉡ 법인세 상당액 × 지분율
  limitAmount: number; // ㉯ = max(0, ㉠ − ㉡)
  finalTax: number; // min(㉮, ㉯)
  filingCredit: number; // §69 floor(finalTax × 3/100)
  selfPayTax: number; // finalTax − filingCredit
}

/** §45의5 수증자별 명세 (Map 금지 — plain 배열) */
export interface SpecificCorpDonee {
  name: string;
  relation: import("./gift-deemed-input-types").ScRelation;
  shares: number;
  totalShares: number;
  ownershipRatioPct: number; // 표시용 백분율
  gain: number; // 증여의제이익 = corpProfit × shares/totalShares
  isTaxable: boolean;
  nonTaxableReason?: "donor_self" | "non_related" | "below_threshold";
  limitCalc?: SpecificCorpLimitCalc; // 과세 주주만
}

/** §45의5 다주주 모드 결과 (Map 금지 — plain 배열) */
export interface SpecificCorpMultiResult {
  corpProfit: number; // 특정법인의 이익 (거래이익 − 법인세 안분)
  corpTaxApportioned: number; // 법인세 안분액
  donees: SpecificCorpDonee[];
}

/** 모든 계산기 공통 결과 */
export interface DeemedGiftResult {
  type: DeemedGiftType;
  /** 과세요건·임계 충족 (증여재산가액 > 0) */
  applied: boolean;
  /** 증여재산가액 (원, 정수) */
  deemedGiftValue: number;
  /** 산식 단계 (formula-display-builder) */
  breakdown: CalculationStep[];
  /** 미적용 사유 */
  exclusionReason?: string;
  /** 근거 조문 (GIFT.* 상수) */
  legalBasis: string;
  /** 임계 판정 근거 echo */
  thresholdEcho?: Record<string, number | boolean>;
  /** §41의3 정산 방향 — taxation(과세)/refund(평가손실 환급)/none(기준미달). 미설정 시 일반 의제 */
  direction?: "taxation" | "refund" | "none";
  /** §41의3④ 단서·령§31의3⑥ 환급 대상액(=평가손실 (B+C)−A). direction==="refund"만 > 0 */
  refundBase?: number;
  /** 증여세 합산배제 대상 여부 (§47① — §40①2·3호=true / §40①1호=false). 증여세 연계 echo */
  aggregationExcluded?: boolean;
  /** 증여자 연대납부의무 면제 여부 (§4의2⑥ — §40 등 명시 유형 true). 증여세 연계 echo */
  donorJointLiabilityExempt?: boolean;
  /**
   * §39의3 현물출자 — caseType echo (echo-field-pattern, 산식 불변).
   * 결과뷰·prefill은 gross 대소비교 휴리스틱 대신 이 명시값으로 저가/고가 판정
   * (고가 roster有도 gross(base) ≥ Σper-donee 성립 → gross 비교 시 고가가 저가로 오판).
   */
  caseType?: "low" | "high";
  /**
   * §39의3 gross (법문 §29의3①1, 안분 전 총액) echo. 저가·고가 모두 항상 산출.
   * 저가 roster無: grossDeemedGiftValue === deemedGiftValue.
   * 저가 roster有: grossDeemedGiftValue > deemedGiftValue (자기지분 미제외분 포함) → 결과뷰 amber 경고.
   */
  grossDeemedGiftValue?: number;
  /**
   * §39의3 당사자별 안분 명세 — **배열**(Map 금지, feedback_engine_result_map_json_loss).
   * 저가 roster有=증여자별(자기지분 제외) / 고가 roster有=수증자별 per-donee / roster無=undefined.
   */
  contributionBreakdown?: {
    /** 표시명: name.trim() || "주주" (feedback_no_internal_id_in_result) */
    party: string;
    preShares: number;
    /** 비율 표시 문자열 (예: "55,000/100,000") */
    ratioLabel: string;
    value: number;
    /** 관계 — 증여세 본세 prefill 시 donorRelation 매핑용 (GiftDonorRelation 그대로 전달) */
    relation?: GiftDonorRelation;
  }[];
  /**
   * §37 다기간(G2/G3)·§41의4② 다년 — window별 별개 증여 산출. plain 배열(Map 금지).
   * ⚠️ 합산 금지: deemedGiftValue는 첫 window(현재 증여)만 — 나머지는 미래 별건.
   */
  periodBreakdown?: {
    index: number;
    giftDate: string; // window 증여일
    baseValue: number; // free_use 부동산가액 / collateral·free_loan 대출금
    benefit: number; // free_use 5년 현가합 / collateral·free_loan 대출이익(일수안분 후)
    applied: boolean; // 기준금액(1억/1천만) 충족
    dayCount?: number; // §41의4② 해당 window 실제 일수(마지막 해 안분 표시용). §37=undefined
  }[];
  /** §41의2 초과배당 전용 상세 (excessDividendDetail — plain 객체, Map 금지) */
  excessDividendDetail?: ExcessDividendDetail;
  /** §79②1호 경정청구(G1) — plain 객체(Map 금지) */
  rectification?: {
    giftTaxCalculated: number; // echo
    expiryDate: string; // giftDate + 5년/1년
    remainingMonths: number; // max(0, 역산 월수; 1개월 미만 일수→1)
    totalMonths: number; // 60(free_use) / 12(collateral)
    refundableTax: number; // floor(산출세액 × remainingMonths/totalMonths) — "경정청구 가능 세액"
    steps: CalculationStep[];
  };
  /**
   * 신탁이익(§33) 전용 — 원본권·수익권 별개 증여시기(§33①1·2호) 분리 산출.
   * deemedGiftValue=합계(하위호환). 표시·prefill은 subGifts 사용.
   */
  subGifts?: {
    right: "principal" | "income";
    giftDate?: Date;
    value: number;
    lawRef: string;
  }[];
  /** 감자 §39의2 멀티(불균등 감자 N:N) 모드 결과 — plain 배열(Map 금지) */
  capitalDecreaseMulti?: CapitalDecreaseMultiResult;
  /** 합병(§38) 주주 매트릭스 — Phase B(다수 대주주·동일인 자기증여). deemedGiftValue=Σ applied netGain */
  mergerMatrix?: MergerMatrix;
  // ── §45의3 일감몰아주기 (Phase 3) — base optional 필드 (extends 금지, 기존 패턴) ──
  /** §45의3 수증자별 명세 — 배열(Map 금지, feedback_engine_result_map_json_loss) */
  recipientBreakdown?: RcRecipientBreakdown[];
  /** §45의3 판정된 지배주주 이름 */
  rulingShareholder?: string;
  /** §45의3 특수관계법인거래비율 분수 */
  tradeRatio?: { numer: number; denom: number };
  /** §45의3 특수관계매출 합계(원) */
  relatedSales?: number;
  /** §45의3 수혜법인 단위 공통 과세제외매출(원) */
  taxableExcludedSales?: number;
  /** §45의3 과세매출비율 적용 전 세후영업이익(원) */
  baseAfterTaxProfit?: number;
  /** §45의3 거래비율 분자(특수관계매출 − 과세제외) */
  tradeRatioNumer?: number;
  /** §45의3 거래비율 분모(총매출 − 과세제외) */
  tradeRatioDenom?: number;
  /** §45의3 과세요건 충족 여부 */
  taxRequirementMet?: boolean;
  /** §45의3 정상거래비율 분수 */
  normalTradeRatio?: { numer: number; denom: number };
  /** §45의3 한계보유비율 분수 */
  marginalOwnershipRatio?: { numer: number; denom: number };
  // ── §45의5 특정법인 멀티 · §43²합산 · §45의2 · §42의3 (origin/master) ──
  /** §45의5 특정법인 다주주(roster) 모드 — 주주별 증여가액 + §45의5② 한도 (Map 금지) */
  specificCorpMulti?: SpecificCorpMultiResult;
  /**
   * §43² 1년 이내 동일거래(§41의4) 합산 — 건별 echo. plain 배열(Map 금지, feedback_engine_result_map_json_loss).
   * deemedGiftValue=합산 총액. 증여시기=isThresholdCrossing 건의 loanDate.
   */
  aggregationBreakdown?: {
    label: string; // ㉮·㉯·㉰ 또는 "건 N"
    loanDate: string; // 거래일(=증여일 echo)
    loanAmount: number;
    rawBenefit: number; // 적정이자−실제이자 (임계판정 전, max(0,))
    eligible: boolean; // §41의4③ 게이트 통과
    cumulativeBenefit: number; // 누계 rawBenefit
    isThresholdCrossing: boolean; // 누계 1천만 첫 도달(=증여시기)
  }[];
  /**
   * §45의2 명의신탁 유상증자(per_share 모드) echo — plain 객체(Map 금지, feedback_engine_result_map_json_loss).
   * total 모드는 undefined. 결과뷰가 산식(1주당평가×신주수)·평가원칙 비교(인수가·권리락·증자전) 표시에 사용.
   */
  nomineeCapitalIncrease?: {
    perSharePrice: number;
    nomineeShares: number;
    subscriptionPrice?: number;
    theoreticalExRightsPrice?: number;
    preIncreasePerShare?: number;
  };
  /**
   * §42의3 재산취득 후 가치증가 — 적용요건 echo (산식 불변, feedback_engine_result_map_json_loss: plain 값만).
   * 입력에 사유·날짜가 하나도 없으면 undefined(기존 동작 바이트 동일).
   */
  valueIncreaseDetail?: {
    acquisitionCauseLabel?: string; // 취득사유 라벨 (cause 입력 시)
    reasonLabel?: string; // 가치증가사유 라벨 (reason 입력 시)
    withinFiveYears?: boolean; // acqDate·eventDate 둘 다 입력 시만; undefined=미입력 (echo만, applied 차단 안 함)
    holdingYears?: number; // 취득~사유발생 연수 echo
    isExchangeListingNotice?: boolean; // reason==="similar" → 결과뷰 §41의3 경계 amber
  };
}

/** 라우터 반환 — 단건 결과 또는 cap-table 배분 결과 (type 판별) */
export type DeemedGiftAnyResult = DeemedGiftResult | CapitalIncreaseAllocationResult;
