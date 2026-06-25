/**
 * 증여로 보는 경우 (증여 예시·추정·의제) — 공통 타입.
 * Phase 1: 보험금§34 · 저가고가§35 · 채무면제§36 · 부동산무상사용§37 · 금전무상대출§41의4.
 */
import type { CalculationStep, GiftDonorRelation } from "../types/inheritance-gift.types";
import type { BargainTransferInput } from "../bargain-transfer";

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
  // ── §45의5 특정법인 멀티 · §43②합산 · §45의2 · §42의3 (origin/master) ──
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

// ── 입력 타입 ──

/** (1) 신탁이익의 증여 §33 — 평가 상증령 §61·이자율 상증칙 §19의2(연 3%) */
export interface TrustBenefitInput {
  /** §61① 수익자 구성: 동일(1호) / 원본만(2호가목) / 수익만(2호나목) */
  beneficiaryType: "same" | "diff_principal" | "diff_income";
  /** 평가기준일(증여시기) 현재 상증법 평가 신탁재산(원본) 가액 */
  trustPropertyValue: number;
  /** 확정 수익률 분수 (미입력=미확정 → 상증칙 §19의2② 원본×30/1000) */
  yieldRate?: { numer: number; denom: number };
  /** 원천징수세율 분수 (예: 15.4% = {154, 1000}) */
  withholdingRate: { numer: number; denom: number };
  /** 유기정기금 수익 분할 횟수(=현가합 항 수). annuityType="finite"일 때 사용 */
  installments?: number;
  /** §61②→§62 정기금 유형: 유기(installments)/무기(20년)/종신(기대여명 floor). 기본 finite */
  incomeAnnuityType?: "finite" | "perpetual" | "lifetime";
  /** 회차 간 연수 (할인 nₖ = k×interval). 기본 1 */
  incomeIntervalYears?: number;
  /** 종신정기금 기대여명(연). 미입력 시 2023표 floor 조회 */
  expectedRemainingYears?: number;
  /** 종신정기금 기대여명 조회용 성별·연령 (expectedRemainingYears 미입력 시) */
  beneficiaryGender?: "male" | "female";
  beneficiaryAge?: number;
  /** 수익권 증여시기(§25① — 분할=최초지급일). diff_income·same 표시용 */
  incomeGiftDate?: Date;
  /** 원본권 증여시기(§25① — 원본 실제지급일). diff_principal·same 표시용 */
  principalGiftDate?: Date;
  /** 해지·철회·취소 일시금 (§61① 단서 — 전체 합계 Max, 미입력 0) */
  surrenderValue?: number;
  /** §25① 증여시기 종류 라벨(메타 — 입력 날짜의 의미) */
  giftTimingType?: "actual" | "decedent_death" | "agreed" | "first_installment";
}

/** (2) 보험금 §34 */
export interface InsuranceInput {
  /** 1호: 수령인 ≠ 납부자 / 2호: 증여재산으로 납부 */
  caseType: "non_payer" | "gifted_premium";
  insuranceProceeds: number; // 보험금
  totalPremiumPaid: number; // 납부보험료총액 (>0)
  relevantPremium: number; // 1호=수령인외납부 / 2호=증여재산납부
  isInheritanceInsurance: boolean; // §34② §8 상속재산 → true면 미적용
}

/** (4) 채무면제 §36 */
export interface DebtForgivenessInput {
  forgivenDebt: number; // 면제·인수·변제 채무액
  compensation: number; // 보상(지급)액 (없으면 0)
  occurType: "creditor_waiver" | "third_party_assumption"; // 증여시기 라벨
}

/** (5) 부동산무상사용 §37 */
export interface FreeRealEstateInput {
  subType: "free_use" | "collateral";
  propertyValue?: number; // free_use: 부동산가액 (단일기간)
  loanAmount?: number; // collateral: 차입금 (단일기간)
  actualInterestPaid?: number; // collateral 실제지급이자
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean; // §37③
  /** 다기간 (시행령§27③ 5년·§27⑤ 1년 초과 재과세). undefined=단일 / [...]=다기간 (빈 []은 validate 차단) */
  periods?: FreeUsePeriod[];
  /** 경정청구 (§79②1호·시행령§81⑨) — 무상사용기간 중 소유자 사망·양도 등 중단 시 잔여기간분 */
  rectification?: RectificationInput;
}

/** §37 다기간 window — 각 window는 별개 증여일의 별개 증여 */
export interface FreeUsePeriod {
  startDate: string; // ISO. window 개시일(=증여일). free_use 5년·collateral 1년 단위
  propertyValue?: number; // free_use: window 증여일 기준 §4장 평가가액
  loanAmount?: number; // collateral: 차입금
  actualInterestPaid?: number; // collateral 실제지급이자
}

/** §79②1호 경정청구 입력 */
export interface RectificationInput {
  giftTaxCalculated: number; // 증여세 산출세액(§57 세대생략 할증 가산 포함) — 직접입력
  giftDate: string; // ISO. 당초 증여일(=무상사용/담보 개시일)
  terminationDate: string; // ISO. 중단사유 발생일(소유자 사망·토지 양도 등 §81⑥)
}

/** (6) 금전무상대출 §41의4 — 단건 + 다년 분할(§41의4②) */
export interface FreeLoanInput {
  loanAmount: number;
  actualInterestPaid: number; // 무상이면 0 (다년: 연간 실제이자)
  appropriateRate: { numer: number; denom: number }; // 적정이자율 분수 (4.6%={46,1000})
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean; // §41의4③
  /**
   * §41의4② 다년 분할 — 대출 기간. 두 필드 모두 있을 때만 다년 경로 활성(한쪽 undefined→단건 회귀).
   * YYYY-MM-DD 문자열(date-coerce 불필요). 마지막 해 1년 미만 시 일수 안분(÷365, 명문 부재·교재 기준).
   */
  loanStartDate?: string; // 대출 개시일 (첫 window 증여일)
  loanEndDate?: string; // 대출 종료일 (마지막 window 마지막 날)
}

/**
 * §43② 1년 이내 동일거래(§41의4) 합산 입력 (상증법§43②·상증령§32의4).
 * 복수 대출 건의 raw benefit을 임계판정 전 합산 → 1천만 판정. 선례: capital_increase_allocation.
 */
export interface FreeLoanAggregatedInput {
  loans: FreeLoanItem[]; // 개별 대출 건 (1건 이상)
}

/** §43² 합산 개별 대출 건 */
export interface FreeLoanItem {
  loanDate: string; // 대출 거래일(=해당 건 증여일). YYYY-MM-DD
  loanAmount: number;
  actualInterestPaid: number; // 무상이면 0
  appropriateRate: { numer: number; denom: number };
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean; // §41의4③
  label?: string; // 표시용(㉮·㉯·㉰). 없으면 "건 N"
}

// ── Phase 2: 자본거래 (시가 = §60·§63 평가가액을 input으로 직접 주입) ──

/** (7) 합병 §38 — 주식교부(stock, §28③1) / 주식 외 재산 교부(non_stock, §28③2) */
export interface MergerInput {
  caseType?: "stock" | "non_stock"; // 기본 stock
  // ⚠️ "과대평가" = 합병비율 산정상 상대적 과대평가 = 이익을 얻는 측. 1주 절대평가 크기와 무관.
  overvaluedSharePrice: number; // 과대평가(이익측) 법인 합병전 1주당 평가가액 — §28③1 나목 베이스
  majorShares: number; // 대주주등 주식수 (단일 모드)
  // stock 전용
  mergedSharePrice?: number; // ㉮ 합병 후 신설·존속법인 1주당 평가가액 (direct 모드)
  preMergerShares?: number; // 과대평가법인 합병 전 주식수
  exchangedShares?: number; // 과대평가법인 주주가 교부받은 신설·존속법인 주식수
  // non_stock 전용 (§28③2)
  faceValue?: number; // 액면가액
  mergeConsideration?: number; // 합병대가(액면 미달 시 적용)

  // ── Phase A: 합병후 1주평가 산정(§28⑤). 기본 "direct"(회귀 보존) ──
  mergedPriceMode?: "direct" | "auto"; // auto = 단순평균액 산정
  underSharePrice?: number; // 과소평가(반대) 법인 1주당 평가가액
  underPreShares?: number; // 과소평가법인 합병전 주식수
  postMergerTotalShares?: number; // 합병후 존속법인 주식수 (합병비율 반영 — Σpre 추정 금지)
  listedPostAvgPrice?: number; // 상장 합병등기일후 2월 종가평균 (입력 시 Min)
  isListed?: boolean; // 상장 여부 (§28⑤ Min 분기)
  // ── G0 echo (차단 아님, §28①②) ──
  isRelatedCompany?: boolean; // 특수관계 (사용자 전제)
  shareholderOwnedShares?: number; // 대주주 판정 echo — 보유주식수
  shareholderTotalShares?: number; // 발행주식총수
  faceValueSum?: number; // 액면 합계 (대주주 판정)

  // ── Phase B: 주주 매트릭스(자기증여 차감 재산세과-799) ──
  shareholders?: MergerShareholders;

  // ── Phase C: 분할합병 §28⑦ (분할사업부문 합병직전 주식가액) ──
  isSplitMerger?: boolean;
  /** 2016.2.5~ 보충평가(§63①1나, overvaluedSharePrice 직접) / 2016.2.4 이전 순자산비율 안분(상증칙 §10의2) */
  splitValuationMode?: "supplementary" | "net_asset_ratio";
  splitCompanyPreSharePrice?: number; // 분할법인 분할직전 1주당 평가가액
  splitBusinessNetAsset?: number; // 분할사업부문 순자산가액
  splitCompanyNetAsset?: number; // 분할법인 순자산가액
}

/** Phase B — 양 법인 주주 구성.
 *  주주배열은 `shares`만 → preMergerShares=Σovervalued.shares 도출(중복입력 제거).
 *  1주평가(overvaluedSharePrice·underSharePrice)는 평가액이라 배열에 없음 → 스칼라 입력 유지(㉮·㉯ 산정). */
export interface MergerShareholders {
  /** 과대평가(이익측=수증자) 법인 주주. Σshares = preMergerShares */
  overvalued: { id: string; name: string; shares: number }[];
  /** 과소평가(증여자측) 법인 주주. self·안분의 증여자 풀 */
  undervalued: { id: string; name: string; shares: number }[];
  /** 교부주식 환산비(과대평가법인 합병전→합병후 교부). 사례2 = {numer:1, denom:2}(2주→1주) */
  exchangeRatio: { numer: number; denom: number };
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

/** (8) 증자 §39 — 저가발행(low, ①1호) / 고가발행(high, ①2호) sub-case */
export interface CapitalIncreaseInput {
  direction?: "low" | "high"; // 저가발행(①1호) / 고가발행(①2호), 기본 low
  /** 가/다/라목(실권주재배정·제3자직접배정·초과배정) vs 나목(실권주 미배정·특수관계인 인수) */
  subType?: "forfeited_realloc" | "third_party" | "excess" | "no_realloc"; // 기본 forfeited_realloc
  preIssuePrice: number; // 증자 전 1주당 평가가액
  preIssueShares: number; // 증자 전 발행주식총수
  newSharePrice: number; // 신주 1주당 인수가액
  issuedShares: number; // 증자 주식수
  forfeitedShares: number; // 이익 귀속 주식수 (실권주수·직접배정신주수·초과배정신주수·미달분신주수)
  // 고가 나·다·라목 — 특수관계인 비율 가중 (시행령 §29②4·5)
  relatedAcquiredShares?: number; // 특수관계인이 인수한 신주수 (분자)
  ratioDenomShares?: number; // 분모 신주수 (나목=균등증자 증자주식총수 / 다·라목=주주아닌자배정+초과인수 총수)
  // §39②: 이익을 증여한 소액주주(§29⑤) 2명 이상 → 1인 의제 (저가발행 ①1호 한정)
  smallShareholderImputation?: boolean;
}

// ── (8b) 증자 §39 cap-table 다수증자·다증여자 배분 (equity-delta 방식) ──

/** 주주 1명의 증자 참여 명세 (cap-table 1행) */
export interface CapShareholder {
  id: string;
  name?: string;
  preShares: number; // 증자 전 보유 주식수
  entitledShares: number; // 균등(당초지분) 배정 신주수
  subscribedShares: number; // 실제 인수한 총 신주수(당초+재배정+제3자+초과)
  reallocatedShares?: number; // 그 중 재배정/제3자/초과로 받은 신주수 (실권처리 판정용)
  relatedTo?: string[]; // 특수관계인 주주 id (없으면 그 증여자 귀속분 과세 0)
}

/** 증자 cap-table 입력 (equity-delta: 실제 ㉯ + 손해비례 배분) */
export interface CapitalIncreaseAllocationInput {
  direction: "low" | "high"; // 저가/고가 (이익자 방향 결정)
  preIssuePrice: number; // ㉮ 증자 전 1주당 평가가액
  newSharePrice: number; // ㉰ 신주 1주당 인수가액
  shareholders: CapShareholder[];
}

/** 수증자 1명 × 증여자 1명 분할 1행 ((증여자) 카르테시안) */
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

/** 라우터 반환 — 단건 결과 또는 cap-table 배분 결과 (type 판별) */
export type DeemedGiftAnyResult = DeemedGiftResult | CapitalIncreaseAllocationResult;

/** (8-3) 전환주식 §39①3호 — 전환후 §29②1~5 이익 − 발행당시 §29②1~5 이익 (시행령 §29②6) */
export interface ConvertibleStockInput {
  /** 가목: 전환 후 교부받은 주식을 신주로 보아 §29②1~5로 계산한 이익 입력(저가/고가 sub-case) */
  atConversion: CapitalIncreaseInput;
  /** 나목: 전환주식 발행 당시 §29②1~5로 계산한 이익 입력(저가/고가 sub-case) */
  atIssuance: CapitalIncreaseInput;
}

/** (9) 감자 §39의2 — 저가소각(low, ①1호) / 고가소각(high, ①2호) */
export interface CapitalDecreaseInput {
  caseType?: "low" | "high"; // 기본 low
  sharePrice: number; // 감자주식 1주당 평가액 (§53⑧3호: 최대주주 할증 미포함)
  redemptionPrice?: number; // (단일) 소각 시 지급한 1주당 금액. 멀티는 row별 redemptionPricePerShare 사용
  // 단일 low 전용 (①1호)
  totalRedeemedShares?: number; // 총감자 주식수
  majorPostRatio?: { numer: number; denom: number }; // 대주주등 감자 후 지분비율
  relatedRedeemedShares?: number; // 대주주등 특수관계인의 감자 주식수
  // 단일 high 전용 (①2호 — 평가액이 액면가 미달 한정)
  faceValue?: number; // 액면가액 (멀티: 고가 게이트 + 대주주 액면 3억 판정)
  ownRedeemedShares?: number; // 해당 주주등의 감자 주식수
  // 멀티(불균등 감자 N:N) 모드 — shareholders 존재 시 dispatch
  shareholders?: CapitalDecreaseShareholder[]; // 주주 목록 (감자주주 + 잔존주주)
  preTotalShares?: number; // 감자 전 발행주식총수 (멀티 필수)
}

/** 멀티(불균등 감자) 모드 주주 1명 */
export interface CapitalDecreaseShareholder {
  id: string; // 결과 표시 금지(memory feedback_no_internal_id_in_result) — name 우선
  name: string; // 갑/을/병/정/소액주주
  preShares: number; // 감자 전 보유주식수
  redeemedShares: number; // 감자(소각)주식수 (0이면 잔존주주)
  redemptionPricePerShare?: number; // 소각 1주당 대가 (감자주주만)
  relationGroup?: string; // 특수관계 그룹 태그 (같은 문자열 = 특수관계)
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

/**
 * §39의3 현물출자 당사자 명부 1행.
 * caseType=low: 증여자(현물출자자 外 기존 주주) / caseType=high: 수증자(현물출자자 특수관계 기존주주).
 * 분모는 양 caseType 모두 preContribShares.
 */
export interface ContributionParty {
  /** 표시명 (undefined·빈문자열 시 결과뷰 "주주" 대체 — feedback_no_internal_id_in_result) */
  name?: string;
  /** 현물출자 전 보유 주식수 (안분 분자) */
  preShares: number;
  /** 관계 — 증여세 본세 prefill 시 donorRelation(저가)/수증자 관계(고가) 매핑용. 미지정 시 마법사에서 선택 */
  relation?: GiftDonorRelation;
}

/** (10) 현물출자 §39의3 — 저가인수(low, ①1호) / 고가인수(high, ①2호) */
export interface ContributionInput {
  caseType?: "low" | "high"; // 기본 low
  preContribPrice: number; // 현물출자 전 1주당 평가가액
  preContribShares: number; // 현물출자 전 발행주식총수
  newSharePrice: number; // 신주 1주당 인수가액
  contributedShares: number; // 현물출자 주식수
  allocatedShares: number; // 배정받은 신주수 (low) / 인수 신주수 (high)
  // high 전용 (①2호) — roster無 aggregate 경로 (기존 필드 유지, CON-H 회귀 보존)
  relatedRatio?: { numer: number; denom: number }; // 현물출자자 특수관계인 주주등 지분비율
  // §39의3②: 이익을 증여한 소액주주(§29⑤) 2명 이상 → 1인 의제 (저가인수 ①1호 한정)
  smallShareholderImputation?: boolean;
  /**
   * 현물출자 당사자 명부 — 3-state (feedback_three_state_optional_mode_toggle):
   *   undefined = OFF (현행 gross/relatedRatio 경로) / [] = ON 빈 (validate 차단) / [{...}] = 데이터.
   * low: 증여자(현물출자자 外 전체 주주), high: 수증자(특수관계 기존주주만). 분모 = preContribShares.
   */
  parties?: ContributionParty[];
}

/** (11) 전환사채등 §40 — 인수·취득(①1호)·주식전환(①2호 가나다/라목)·양도(①3호) sub-case */
export interface ConvertibleBondInput {
  caseType?: "acquisition" | "conversion" | "conversion_reverse" | "transfer"; // 기본 acquisition
  bondMarketValue: number; // 전환사채등 시가 (acquisition·transfer 이익·기준금액)
  // acquisition(§40①1호, §30①1)
  acquisitionPrice?: number; // 인수·취득가액
  // transfer(§40①3호, §30①4)
  transferPrice?: number; // 양도가액
  // conversion / conversion_reverse(§40①2호, §30①2·3) — §30⑤1 교부주식가액 산식
  preConvPrice?: number; // 전환등 전 1주당 평가가액
  preConvShares?: number; // 전환등 전 발행주식총수
  conversionPrice?: number; // 주식 1주당 전환가액등
  increasedShares?: number; // 전환등 증가주식수 (㉡ §30⑤1 가중평균 분모/분자)
  creditedShares?: number; // 교부받은 주식수=이익승수 (미입력=increasedShares; ④⑥ 전부 / ⑤ 초과분)
  isListed?: boolean; // 주권상장법인 — §30⑤1 단서 Min(가나다)/Max(라목)
  listedMarketAvg?: number; // 전환일 전후 2개월 종가평균(㉠) — 상장 Min/Max용
  interestLoss?: number; // 이자손실분 (시행규칙 §10의2) — 최종값(초과분 안분 포함, 엔진 재안분 금지). conversion 차감
  acquisitionGainPrior?: number; // §30①1호 이익(인수 시 기과세분) — conversion 차감
  bondTransferGainForCap?: number; // 전환가능기간 전환사채 양도차익(양도가−취득가) — Min cap 한도 (영§30①2 단서)
  // conversion_reverse(라목, §30①3) 비율
  relatedPreRatio?: { numer: number; denom: number }; // 교부받은 자의 특수관계인이 전환 전 보유 지분비율
}

// ── Phase 3: 추정·의제 ──

/** §45 재산취득자금·채무상환 증여추정 */
export interface AcquisitionFundPresumptionInput {
  subType: "acquisition" | "debt_repayment"; // §45① 재산취득자금 / §45② 채무상환자금
  acquisitionValue: number; // 취득재산가액 또는 채무상환금액
  provenAmount: number; // 입증된 금액 합계 (소득·상속수증·처분대가)
}

/** §45의2 명의신탁재산 증여의제 */
export interface NomineeTrustInput {
  /** 명의신탁 재산 가액 (total 모드). per_share 모드는 미전송 — 엔진이 perSharePrice×nomineeShares로 단일 도출 */
  propertyValue?: number;
  hasTaxAvoidancePurpose: boolean; // §45의2③ 조세회피목적 (타인명의 등기 시 추정 true)
  isExcluded?: boolean; // §45의2①1·3·4 배제 (신탁등기·비거주자 법정대리인 등)
  /**
   * 평가 모드 (3-state, feedback_three_state_optional_mode_toggle).
   * undefined/"total" = 재산가액 총액 직접(현행) / "per_share" = 유상증자 신주 명의신탁
   * (명의개서일 §63 평가 1주당 가액 × 명의신탁 신주수 — 조심2012중3707·2019서2129).
   */
  valuationMode?: "total" | "per_share";
  /** per_share: 증여일(명의개서일) 현재 §60·§63 평가 1주당 가액 (희석효과 반영 — 인수가·권리락 아님) */
  perSharePrice?: number;
  /** per_share: 명의신탁된 신주 수 (제척기간 만료 기존분 제외) */
  nomineeShares?: number;
  /** echo (계산 무영향·이미지28 평가원칙 비교): 신주인수가액(발행가액) */
  subscriptionPrice?: number;
  /** echo: 이론적 권리락 증자후 1주당 가액 */
  theoreticalExRightsPrice?: number;
  /** echo: 증자 전 1주당 평가액 (희석 출발점) */
  preIncreasePerShare?: number;
  /** prefill용 (계산 무영향): 실제소유자(증여자) 성명 */
  actualOwnerName?: string;
  /** prefill용 (계산 무영향): 명의자(증여의제 수증자) 성명 */
  nomineeName?: string;
}

/** 주주별 배당 내역 (시행령 §31의2② 초과배당금액 자동산정용) */
export interface ShareholderDividend {
  /** 식별자 (UI row id) */
  id: string;
  /** 주주 역할 */
  role:
    | "major_shareholder" // 최대주주등 (배당 포기·과소배당 주체)
    | "related_party"     // 특수관계인 (초과배당 수령자)
    | "other";            // 기타 주주
  /** 지분율 분수 (예: 30% → { numer: 30, denom: 100 }) */
  ownershipRatio: { numer: number; denom: number };
  /** 실제 수령 배당금액 (원) */
  actualDividend: number;
  /** 표시용 이름 (결과뷰 echo) */
  name?: string;
}

/** 정산 2-pass 계산을 위한 증여세 과세 맥락 */
export interface ExcessDividendGiftTaxContext {
  /** 수증자와 증여자 관계 (증여재산공제 결정) */
  donorRelationship:
    | "spouse"
    | "lineal_ascendant_adult"
    | "lineal_ascendant_minor"
    | "lineal_descendant"
    | "other_relative";
  /** 10년 내 기적용 공제 누계 (원). 잔여공제 = 총한도 - 이 값. */
  priorDeductionApplied?: number;
  /** 세대생략 해당 여부 */
  isGenerationSkip?: boolean;
  /** 세대생략 미성년자 해당 여부 */
  isMinorGenerationSkip?: boolean;
  /** 신고기한 내 신고 예정 여부 (신고세액공제 3% 적용). 기본 true. */
  isWithinFilingDeadline?: boolean;
}

/** §41의2 초과배당 (시행령 §31의2 주주배열 기반 자동산정) */
export interface ExcessDividendInput {
  // ── ① 주주 배열 (영§31의2② 자동산정) ──────────────────
  /** 주주별 배당 내역. 비례배당 자동산정에 필요. 1개 이상 필수. */
  shareholders: ShareholderDividend[];

  // ── ② 시기·증여일 ──────────────────────────────────────
  /** 배당 지급일 (= 증여일, 법§41의2①). Date 객체. */
  dividendDate: Date;

  // ── ③ 소득세 모드 ──────────────────────────────────────
  /**
   * 소득세 상당액 확정 여부 및 과세유형 (규칙§10의3).
   * - 'undetermined': 미확정 → 율표 자동 적용 (규칙①)
   * - 'separate'    : 확정·분리과세 → 실제 세액 직접입력 (규칙②)
   * - 'comprehensive': 확정·종합과세 → Max(ⓐ−ⓑ, 14%) 자동 계산 (규칙②)
   * - 'exempt'      : 비과세 → 소득세 0 (규칙② 1호)
   */
  incomeTaxMode: "undetermined" | "separate" | "comprehensive" | "exempt";

  // ── ④ 분리과세 직접입력 (incomeTaxMode='separate') ─────
  /** 분리과세 실제 소득세액 (원). incomeTaxMode='separate'일 때 필수. */
  separateIncomeTax?: number;

  // ── ⑤ 종합과세 입력 (incomeTaxMode='comprehensive') ────
  /** 수증자 종합소득과세표준 ⓐ기준 (초과배당금액 포함, 원). */
  comprehensiveTaxBase?: number;
  /** 종합소득과세표준에서 초과배당금액을 제외한 값 ⓑ기준 (원). 미입력 시 자동 추정. */
  comprehensiveTaxBaseExcluding?: number;
  /** 소득세 과세연도 (종합과세 세율표 연도 분기용). 기본: dividendDate.year. */
  incomeTaxYear?: number;

  // ── ⑥ 신고기한구분 (영§31의2③1호 분기) ─────────────────
  /**
   * 성실신고확인대상: true → 신고기한 6.30 → 경계 7.1
   * 일반: false → 신고기한 5.31 → 경계 6.1
   * 기본: false (일반)
   */
  isDiligentFiler?: boolean;

  // ── ⑦ 정산 입력 (현행 2021~ + 정산 단계에서만) ──────────
  /** 실제 납부 소득세액 (확정 후). 정산 pass 2에서만 사용. */
  actualIncomeTax?: number;

  // ── ⑧ 증여세 본체 맥락 (정산 2-pass 자동 수행 시 필요) ──
  /** 정산 2-pass를 엔진 내부에서 calcGiftTax로 완결할 경우 증여세 과세 맥락. */
  giftTaxContext?: ExcessDividendGiftTaxContext;
}

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

/** §41의3 상장이익 / §41의5 합병상장이익 (시행령 §31의3·§31의5) */
export interface ListingGainInput {
  eventType?: "listing" | "merger"; // §41의3 상장 / §41의5 합병상장, 기본 listing
  settlementPerSharePrice: number; // 정산기준일(상장일·합병등기일 +3개월) 현재 1주당 평가가액(§63)
  perShareAcqValue: number; // 1주당 증여세 과세가액(또는 취득가액)
  perShareCorpGrowth: number; // 1주당 기업가치 실질증가이익(§31의3⑤)
  shares: number; // 증여·유상취득 주식수
}

/** §42 재산사용·용역제공 */
export interface PropertyServiceUseInput {
  subType: "free_use" | "low_price" | "high_price"; // §32① 1·2·3호
  marketValue: number; // 시가 (무상=시가상당액, 저가/고가=시가)
  consideration?: number; // 대가 (저가·고가)
}

/** §42의2 법인 조직변경 */
export interface OrgChangeInput {
  subType: "share_change" | "value_change"; // 소유지분 변동 / 평가액 변동 (시행령 §32의2①)
  baseValue: number; // 변동 전 해당 재산가액 (기준금액 30% 산정)
  preShares?: number; // share_change 변동 전 지분
  postShares?: number; // share_change 변동 후 지분
  postPerSharePrice?: number; // share_change 변동 후 1주당 가액
  preValue?: number; // value_change 변동 전 가액
  postValue?: number; // value_change 변동 후 가액
}

/** §42의3 취득사유 (①1·2·3호) */
export type ValueIncreaseAcquisitionCause = "gift" | "inside_info" | "borrowed_funds";

/** §42의3 재산가치증가사유 (시행령 §32의3①). 1호는 4개 세분(UI 라벨용 — 법령상 동일 1호) */
export type ValueIncreaseReason =
  | "development"
  | "form_change"
  | "partition"
  | "license"
  | "kotc_registration"
  | "konex_listing"
  | "similar";

/** §42의3 재산취득 후 가치증가 */
export interface ValueIncreaseInput {
  currentValue: number; // 사유발생일 현재 재산가액
  acquisitionCost: number; // 취득가액(증여재산은 증여세 과세가액)
  normalIncrease: number; // 통상적인 가치상승분
  contribution: number; // 가치상승기여분(자본적지출액 등)
  // ── echo (산식 미사용 — 적용요건 표시 전용) ──
  acquisitionCause?: ValueIncreaseAcquisitionCause; // §42의3①1·2·3호
  valueIncreaseReason?: ValueIncreaseReason; // 시행령 §32의3①
  acquisitionDate?: string; // ISO. 취득일
  eventDate?: string; // ISO. 재산가치증가사유 발생일(§42의3② 전단: 사유발생 전 양도 시 양도일)
}

/** §45의5 관계 — "other"=비친족(타인). 증여자 본인은 isDonor 플래그로 분리 */
export type ScRelation =
  | "lineal_ascendant"
  | "lineal_descendant"
  | "spouse"
  | "sibling"
  | "other_relative"
  | "other";

/** §45의5 다주주(roster) 모드 주주 1명 */
export interface SpecificCorpShareholder {
  id: string; // 결과 표시 금지(feedback_no_internal_id_in_result) — name 우선
  name: string;
  relation: ScRelation; // 표시·prefill용 passthrough (엔진 판정은 isDonor·isRelated)
  shares: number; // 보유 주식수
  totalShares: number; // 발행주식 총수 (분모)
  isDonor: boolean; // 증여자 본인 → donor_self 제외
  isRelated: boolean; // 지배주주 친족 여부, false → non_related 제외
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
  relation: ScRelation;
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

/** §45의5 특정법인과의 거래 */
export interface SpecificCorpInput {
  transactionBenefit: number; // §34의5④1호 거래이익(증여재산가액·채무면제이익·시가−대가 차액)
  // ── single(하위호환) 모드: 법인세 안분·지분율을 호출자가 사전 계산 ──
  corporateTax?: number; // 법인세 상당액(이미 안분된 최종값)
  ownershipRatio?: { numer: number; denom: number }; // 지배주주등 주식보유비율
  // ── roster 모드 (shareholders 존재 시 dispatch) ──
  shareholders?: SpecificCorpShareholder[];
  annualIncome?: number; // §34의5④2호나목 각사업연도소득금액(분모)
  corporateTaxComputed?: number; // 법인세 산출세액(안분 前)
  corporateTaxCredit?: number; // 법인세 공제·감면액
  giftDeduction?: number; // §45의5② 한도 ㉮㉠ 증여재산공제 (default 0)
}

/** §45의3 일감몰아주기 — 주주 1명 */
export interface RcShareholder {
  id: string;
  name: string;
  /** "self"=지배주주 후보 / "relative"=친족 / "other"=해당없음 */
  relation: "self" | "relative" | "other";
  /** 수혜법인 직접보유비율 분수 (예: 20% → {numer:20,denom:100}) */
  directRatio: { numer: number; denom: number };
  /** true면 법인주주 → intermediaryCorps에 대응 항목 */
  isCorporate: boolean;
}

/** §45의3 일감몰아주기 — 간접출자법인 1개 (2단계 간접: 개인→법인→수혜법인) */
export interface RcIntermediaryCorpItem {
  /** 이 법인인 법인주주의 id (RcShareholder.id 매칭) */
  corpShareholderId: string;
  /** 이 법인의 수혜법인 직접보유비율 분수 */
  stakeInBeneficiary: { numer: number; denom: number };
  /** 이 법인의 개인 소유주 (§⑱ 자동판정용: 지배주주등 합산≥30% → §⑱1호) */
  owners: {
    individualId: string; // RcShareholder.id
    ratio: { numer: number; denom: number }; // 이 법인에 대한 직접보유비율
  }[];
}

/** §34의3⑩ 과세제외유형 */
export type RcExclusionType =
  | "sec10_1" // 중소-중소
  | "sec10_2" // 수혜법인 50%↑ 출자 특수관계법인
  | "sec10_3" // 수혜법인 50%미만 출자 × 보유비율 (본 사례 미적용)
  | "sec10_4" // 지주회사-자회사·손자회사
  | "sec10_5" // 수출목적
  | "sec10_5_2" // 국외용역
  | "sec10_5_3" // 영세율용역
  | "sec10_6" // 법정의무거래
  | "sec10_7" // 프로스포츠 광고
  | "sec10_8"; // 공공기관

/** §45의3 일감몰아주기 — 매출처 1개 */
export interface RcSalesPartner {
  id: string;
  name: string;
  /** 매출액(원) */
  salesAmount: number;
  /** 특수관계 여부 (사용자 입력 — 엔진이 §2의2 자체판정 불요) */
  isRelated: boolean;
  /** §⑩ 과세제외유형. 없으면 undefined */
  exclusionType?: RcExclusionType;
  /** §⑭3호: 수증자별 이 법인에 대한 보유비율 (⑩ 미해당 시 적용). 없으면 미적용 */
  rulingShareholderStakes?: {
    shareholderId: string; // RcShareholder.id 매칭 키
    ratio: { numer: number; denom: number };
  }[];
}

/** §45의3 일감몰아주기 — 엔진 입력 (nested, 순수함수) */
export interface RelatedCorpInput {
  /** 기업규모 — 비율 3종 분기 단일 분기점 */
  enterpriseSize: "small" | "medium" | "large";
  /** 총 매출액(원) = §⑫ 분모 */
  totalSales: number;
  /** 세무조정 반영 후 영업손익(원) = §⑫1호 */
  preTaxAdjOperatingIncome: number;
  /** 각 사업연도 소득금액(원) = §⑫2호나목 분모 */
  taxableIncome: number;
  /** 법인세 순세액(원) = 산출세액 − 공제감면 = §⑫2호가목 */
  corporateTaxNet: number;
  shareholders: RcShareholder[];
  intermediaryCorps: RcIntermediaryCorpItem[];
  salesPartners: RcSalesPartner[];
}

/** 판별 유니온 입력 (§35는 기존 BargainTransferInput 재사용) */
export type DeemedGiftInput =
  | ({ type: "trust_benefit" } & TrustBenefitInput)
  | ({ type: "insurance" } & InsuranceInput)
  | ({ type: "bargain_transfer" } & BargainTransferInput)
  | ({ type: "debt_forgiveness" } & DebtForgivenessInput)
  | ({ type: "free_realestate" } & FreeRealEstateInput)
  | ({ type: "free_loan" } & FreeLoanInput)
  | ({ type: "free_loan_aggregated" } & FreeLoanAggregatedInput)
  | ({ type: "merger" } & MergerInput)
  | ({ type: "capital_increase" } & CapitalIncreaseInput)
  | ({ type: "capital_decrease" } & CapitalDecreaseInput)
  | ({ type: "contribution" } & ContributionInput)
  | ({ type: "convertible_stock" } & ConvertibleStockInput)
  | ({ type: "convertible_bond" } & ConvertibleBondInput)
  | ({ type: "acquisition_fund_presumption" } & AcquisitionFundPresumptionInput)
  | ({ type: "nominee_trust" } & NomineeTrustInput)
  | ({ type: "excess_dividend" } & ExcessDividendInput)
  | ({ type: "listing_gain" } & ListingGainInput)
  | ({ type: "property_service_use" } & PropertyServiceUseInput)
  | ({ type: "org_change" } & OrgChangeInput)
  | ({ type: "value_increase" } & ValueIncreaseInput)
  | ({ type: "specific_corp" } & SpecificCorpInput)
  | ({ type: "related_corp" } & RelatedCorpInput);
