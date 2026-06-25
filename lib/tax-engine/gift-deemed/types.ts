/**
 * 증여로 보는 경우 (증여 예시·추정·의제) — 공통 타입.
 * Phase 1: 보험금§34 · 저가고가§35 · 채무면제§36 · 부동산무상사용§37 · 금전무상대출§41의4.
 */
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { BargainTransferInput } from "../bargain-transfer";

/** Phase 1 의제 유형 (discriminated union 판별자) */
export type DeemedGiftType =
  | "trust_benefit" // §33 신탁이익의 증여 (1)
  | "insurance" // §34 (2)
  | "bargain_transfer" // §35 (3)
  | "debt_forgiveness" // §36 (4)
  | "free_realestate" // §37 (5)
  | "free_loan" // §41의4 (6)
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
  | "specific_corp"; // §45의5 특정법인과의 거래 (Phase 3)

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
   * §37 다기간(G2/G3) — window별 별개 증여 산출. plain 배열(Map 금지).
   * ⚠️ 합산 금지: deemedGiftValue는 첫 window(현재 증여)만 — 나머지는 미래 별건.
   */
  periodBreakdown?: {
    index: number;
    giftDate: string; // window 증여일
    baseValue: number; // free_use 부동산가액 / collateral 차입금
    benefit: number; // free_use 5년 현가합 / collateral 차입이익
    applied: boolean; // 기준금액(1억/1천만) 충족
  }[];
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

/** (6) 금전무상대출 §41의4 */
export interface FreeLoanInput {
  loanAmount: number;
  actualInterestPaid: number; // 무상이면 0
  appropriateRate: { numer: number; denom: number }; // 적정이자율 분수 (4.6%={46,1000})
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean; // §41의4③
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

/** (10) 현물출자 §39의3 — 저가인수(low, ①1호) / 고가인수(high, ①2호) */
export interface ContributionInput {
  caseType?: "low" | "high"; // 기본 low
  preContribPrice: number; // 현물출자 전 1주당 평가가액
  preContribShares: number; // 현물출자 전 발행주식총수
  newSharePrice: number; // 신주 1주당 인수가액
  contributedShares: number; // 현물출자 주식수
  allocatedShares: number; // 배정받은 신주수 (low) / 인수 신주수 (high)
  // high 전용 (①2호)
  relatedRatio?: { numer: number; denom: number }; // 현물출자자 특수관계인 주주등 지분비율
  // §39의3②: 이익을 증여한 소액주주(§29⑤) 2명 이상 → 1인 의제 (저가인수 ①1호 한정)
  smallShareholderImputation?: boolean;
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
  propertyValue: number; // 명의신탁 재산 가액
  hasTaxAvoidancePurpose: boolean; // §45의2③ 조세회피목적 (타인명의 등기 시 추정 true)
  isExcluded?: boolean; // §45의2①1·3·4 배제 (신탁등기·비거주자 법정대리인 등)
}

/** §41의2 초과배당 (소득세상당액은 시행규칙 §10의3 율표 — 직접 입력) */
export interface ExcessDividendInput {
  excessDividend: number; // 초과배당금액 = (특수관계인 실수령 − 균등배당) × 최대주주등 과소배당 비율
  incomeTaxEquivalent: number; // 초과배당금액에 대한 소득세 상당액 (공제)
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

/** §42의3 재산취득 후 가치증가 */
export interface ValueIncreaseInput {
  currentValue: number; // 사유발생일 현재 재산가액
  acquisitionCost: number; // 취득가액(증여재산은 증여세 과세가액)
  normalIncrease: number; // 통상적인 가치상승분
  contribution: number; // 가치상승기여분(자본적지출액 등)
}

/** §45의5 특정법인과의 거래 */
export interface SpecificCorpInput {
  transactionBenefit: number; // 거래이익(증여재산가액·채무면제이익·시가−대가 차액)
  corporateTax: number; // 법인세 상당액 = (산출세액−공제감면)×min(거래이익/소득금액,1)
  ownershipRatio: { numer: number; denom: number }; // 지배주주등 주식보유비율
}

/** 판별 유니온 입력 (§35는 기존 BargainTransferInput 재사용) */
export type DeemedGiftInput =
  | ({ type: "trust_benefit" } & TrustBenefitInput)
  | ({ type: "insurance" } & InsuranceInput)
  | ({ type: "bargain_transfer" } & BargainTransferInput)
  | ({ type: "debt_forgiveness" } & DebtForgivenessInput)
  | ({ type: "free_realestate" } & FreeRealEstateInput)
  | ({ type: "free_loan" } & FreeLoanInput)
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
  | ({ type: "specific_corp" } & SpecificCorpInput);
