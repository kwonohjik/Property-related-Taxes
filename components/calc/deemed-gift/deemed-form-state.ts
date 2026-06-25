/**
 * 증여로 보는 경우 — 폼 상태 타입 + 초기값.
 * shared.tsx에서 분리(800줄 정책). shared.tsx가 re-export하여 하위호환 유지.
 */
import type { DeemedGiftType, ScRelation, ValueIncreaseAcquisitionCause, ValueIncreaseReason } from "@/lib/tax-engine/gift-deemed/types";
import type { GiftDonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

/** 감자 멀티 모드 주주 행 (전부 string — parseAmount 변환은 API 변환 시) */
export interface CdShareholderRow {
  id: string;
  name: string;
  preShares: string;
  redeemedShares: string;
  redemptionPrice: string;
  relationGroup: string;
}

/** 증자 cap-table 1행 (폼 — string 필드). API 변환에서 CapShareholder(number)로 변환 */
export interface CapTableRow {
  id: string;
  name: string;
  preShares: string; // 증자 전 보유
  entitledShares: string; // 당초(균등) 배정 신주수
  subscribedShares: string; // 실제 인수 신주수
  reallocatedShares: string; // 재배정/제3자/초과로 받은 신주수
  relatedTo: string[]; // 특수관계인 주주 id 목록
}

export function makeCapTableRow(id: string): CapTableRow {
  return { id, name: "", preShares: "", entitledShares: "", subscribedShares: "", reallocatedShares: "", relatedTo: [] };
}

/**
 * §45의5 특정법인 다주주 명단 행 (전부 string — parseAmount 변환은 API 변환 시).
 * relation은 ScRelation 열거값. isDonor=증여자 본인 여부(과세제외 donor_self).
 */
export interface ScShareholderRow {
  id: string;
  name: string;
  relation: ScRelation;
  shares: string; // 주식수 (CurrencyInput)
  isDonor: boolean; // 증여자 본인 → donor_self 제외
}

export function makeScShareholderRow(id: string): ScShareholderRow {
  return { id, name: "", relation: "lineal_descendant", shares: "", isDonor: false };
}

/** §43² 합산 — 개별 대출 건 (전부 string. API 변환에서 number). */
export interface LoanLoanItem {
  id: string;
  loanDate: string; // YYYY-MM-DD (DateInput)
  amount: string; // 대출금액 (CurrencyInput)
  interest: string; // 실제 지급이자 (무이자=빈 문자열)
}

export function makeLoanItem(id: string): LoanLoanItem {
  return { id, loanDate: "", amount: "", interest: "" };
}

/** 초과배당 §41의2 주주 행 (전부 string — parseAmount/parseDecimal 변환은 API 변환 시) */
export interface EdShareholderRow {
  /** 행 고유 ID (클라이언트 UUID) */
  id: string;
  /** 표시용 이름 */
  name: string;
  /**
   * 주주 역할
   * - major_shareholder: 최대주주등 (배당 포기·과소배당 주체)
   * - related_party: 특수관계인 (초과배당 수령자)
   * - other: 기타 주주
   */
  role: "major_shareholder" | "related_party" | "other";
  /** 지분율 (소수점 포함 %) — DecimalInput 입력값 */
  ownershipRatioPctStr: string;
  /** 실제 수령 배당금 — CurrencyInput 입력값 */
  actualDividendStr: string;
}

/** §45의3 일감몰아주기 — 주주 roster 1행 (전부 string) */
export interface RcShareholderRow {
  id: string;
  name: string;
  /** "self" | "relative" | "other" */
  relation: string;
  /** 직접지분 % — DecimalInput */
  directRatioPctStr: string;
  isCorporate: boolean;
}

/** §45의3 — 간접출자법인 개인소유주 1행 */
export interface RcIntermediaryOwnerRow {
  individualId: string;
  ratioPctStr: string;
}

/** §45의3 — 간접출자법인 roster 1행 */
export interface RcIntermediaryRow {
  id: string;
  corpShareholderId: string;
  stakeInBeneficiaryPctStr: string;
  owners: RcIntermediaryOwnerRow[];
}

/** §34의3⑩ 과세제외유형 코드 (string — select) */
export type RcExclusionTypeStr =
  | "sec10_1"
  | "sec10_2"
  | "sec10_3"
  | "sec10_4"
  | "sec10_5"
  | "sec10_5_2"
  | "sec10_5_3"
  | "sec10_6"
  | "sec10_7"
  | "sec10_8"
  | "";

/** §45의3 — 매출처 §⑭3호 지배주주등 보유비율 1행 */
export interface RcRulingStakeRow {
  shareholderId: string;
  ratioPctStr: string;
}

/** §45의3 — 매출처 roster 1행 */
export interface RcSalesRow {
  id: string;
  name: string;
  salesAmountStr: string;
  isRelated: boolean;
  exclusionType: RcExclusionTypeStr;
  rulingStakes: RcRulingStakeRow[];
}

export interface DeemedFormState {
  giftDate: string;
  type: DeemedGiftType | "";
  // 신탁이익 §33
  tbBeneficiaryType: "same" | "diff_principal" | "diff_income";
  tbPropertyValue: string;
  tbYieldDetermined: boolean;
  tbYieldRatePct: string;
  tbWithholdingPct: string;
  tbInstallments: string;
  tbSurrenderValue: string;
  tbGiftTiming: "actual" | "decedent_death" | "agreed" | "first_installment";
  // 증여시기 분리 (§33①1·2호 별개 증여)
  tbIncomeGiftDate: string; // 수익권 증여시기
  tbPrincipalGiftDate: string; // 원본권 증여시기
  // 정기금 유형 (§61②→§62)
  tbAnnuityType: "finite" | "perpetual" | "lifetime";
  tbIntervalYears: string; // 회차 간 연수
  tbBeneficiaryGender: "male" | "female" | ""; // 종신 기대여명 조회용
  tbBeneficiaryAge: string;
  tbExpectedRemainingYears: string; // 종신 기대여명 직접 입력
  // 보험금 §34
  insCaseType: "non_payer" | "gifted_premium";
  insProceeds: string;
  insTotalPremium: string;
  insRelevantPremium: string;
  insIsInheritance: boolean;
  // 저가양수·고가양도 §35
  bargMarketValue: string;
  bargPrice: string;
  bargRelated: boolean;
  bargType: "purchase" | "sale";
  bargJustifiable: boolean;
  bargExcluded: boolean;
  // 채무면제 §36
  debtForgiven: string;
  debtCompensation: string;
  debtOccurType: "creditor_waiver" | "third_party_assumption";
  // 부동산 무상사용 §37
  freeSubType: "free_use" | "collateral";
  freePropertyValue: string;
  freeLoanAmount: string;
  freeInterest: string;
  freeRelated: boolean;
  freeJustifiable: boolean;
  // §37 다기간(G2/G3) — 3-state: undefined=단일 / []=다기간ON빈 / [...]=다기간
  freePeriods?: { startDate: string; value: string; interest: string }[];
  // §37 경정청구(G1, free_use 한정)
  freeRectOn: boolean;
  freeRectTax: string;
  freeRectGiftDate: string;
  freeRectTermDate: string;
  // 금전 무상대출 §41의4
  loanAmount: string;
  loanInterest: string;
  loanRelated: boolean;
  loanJustifiable: boolean;
  // §41의4② 다년 분할 — 대출 기간(빈 문자열=단건). §43² 다건 합산 — loanLoans 3-state
  loanStartDate: string;
  loanEndDate: string;
  loanLoans?: LoanLoanItem[]; // undefined=단건 OFF / []=다건 ON빈(validate 차단) / [...]=데이터
  // ── Phase 2 자본거래 (평가가액·주식수 직접 입력) ──
  // 합병 §38
  mrgCaseType: "stock" | "non_stock"; // 주식교부(§28③1) / 주식 외 재산교부(§28③2)
  mrgMergedPrice: string;
  mrgOvervaluedPrice: string;
  mrgPreShares: string;
  mrgExchangedShares: string;
  mrgMajorShares: string;
  mrgFaceValue: string; // non_stock 액면가액
  mrgConsideration: string; // non_stock 합병대가
  // 합병후 1주평가 산정 §28⑤ (기본 direct — 회귀 보존)
  mrgMergedPriceMode: "direct" | "auto"; // auto = 단순평균액 자동
  mrgUnderSharePrice: string; // 과소평가(반대)법인 1주평가
  mrgUnderPreShares: string; // 과소평가법인 합병전 주식수
  mrgPostMergerTotalShares: string; // 합병후 존속법인 주식수(합병비율 반영)
  mrgIsListed: boolean; // 상장 여부 (Min 분기)
  mrgListedPostAvgPrice: string; // 상장 합병등기일후 2월 종가평균
  mrgIsRelatedCompany: boolean; // G0 특수관계 전제 (기본 true)
  // Phase B 주주 매트릭스 (다수 대주주·동일인 자기증여). id=name.trim() 매칭
  mrgUseShareholders: boolean; // ON 시 주주 테이블 모드 (majorShares 무시·auto 강제)
  mrgOverShareholders: { name: string; shares: string }[]; // 과대평가(이익측) 법인 주주
  mrgUnderShareholders: { name: string; shares: string }[]; // 과소평가(증여자측) 법인 주주
  mrgExchangeNumer: string; // 교부 환산비 분자
  mrgExchangeDenom: string; // 교부 환산비 분모
  // Phase C 분할합병 §28⑦
  mrgIsSplitMerger: boolean;
  mrgSplitMode: "supplementary" | "net_asset_ratio"; // 보충평가(2016.2.5~) / 순자산비율(2016.2.4 이전)
  mrgSplitPrePrice: string; // 분할법인 분할직전 1주평가
  mrgSplitBusinessNetAsset: string; // 분할사업부문 순자산가액
  mrgSplitCompanyNetAsset: string; // 분할법인 순자산가액
  // 증자 §39
  ciDirection: "low" | "high"; // 저가발행(①1호) / 고가발행(①2호)
  ciSubType: "forfeited_realloc" | "third_party" | "excess" | "no_realloc";
  ciPrePrice: string;
  ciPreShares: string;
  ciNewPrice: string;
  ciIssuedShares: string;
  ciForfeitedShares: string;
  ciRelatedAcquiredShares: string; // 고가 나·다라 특수관계인 인수신주수
  ciRatioDenomShares: string; // 고가 나·다라 분모 신주수
  ciSmallImputation: boolean; // 저가 §39② 소액주주 1인 의제
  // 증자 §39 cap-table (다수증자·다증여자)
  ciAllocDirection: "low" | "high";
  ciAllocPrePrice: string; // ㉮ 증자 전 1주당 평가가액
  ciAllocNewPrice: string; // ㉰ 신주 1주당 인수가액
  ciAllocRows: CapTableRow[];
  // 감자 §39의2
  cdCaseType: "low" | "high"; // 저가소각(①1호) / 고가소각(①2호)
  cdSharePrice: string;
  cdRedemptionPrice: string;
  cdTotalShares: string;
  cdMajorRatioPct: string; // 대주주등 감자후 지분비율 (%)
  cdRelatedShares: string;
  cdOwnRedeemedShares: string; // high 해당 주주등 감자 주식수
  // 감자 멀티(불균등 N:N) 모드
  cdMode: "single" | "multi";
  cdFaceValue: string; // 액면가액 (고가 게이트 §29의2①2호 + 대주주 액면 3억 §28②)
  cdPreTotalShares: string; // 감자 전 발행주식총수
  cdShareholders: CdShareholderRow[];
  cdSelectedDoneeIndex: number; // 과세 수증자 선택 (prefill 이관용)
  // 현물출자 §39의3
  conCaseType: "low" | "high"; // 저가인수(①1호) / 고가인수(①2호)
  conPrePrice: string;
  conPreShares: string;
  conNewPrice: string;
  conContributedShares: string;
  conAllocatedShares: string;
  conRelatedRatioPct: string; // high 현물출자자 특수관계인 지분비율 (%)
  conSmallImputation: boolean; // 저가 §39의3② 소액주주 1인 의제
  /**
   * 현물출자 §39의3 당사자 명부 — 3-state (undefined OFF / [] ON빈(validate 차단) / [{...}] 데이터).
   * low: 증여자(현물출자자 外 주주) / high: 수증자(특수관계 기존주주). 분모=conPreShares.
   */
  conParties?: Array<{ name: string; shares: string; relation: GiftDonorRelation | "" }>;
  // 전환사채 §40
  cbCaseType: "acquisition" | "conversion" | "conversion_reverse" | "transfer";
  cbMarketValue: string;
  cbAcquisitionPrice: string;
  cbTransferPrice: string; // transfer 양도가액
  cbPreConvPrice: string; // conversion 전환등 전 1주평가
  cbPreConvShares: string; // conversion 전환등 전 주식총수
  cbConversionPrice: string; // conversion 1주당 전환가액등
  cbIncreasedShares: string; // conversion 전환등 증가주식수(㉡ 가중평균 분모)
  cbInterestLoss: string; // conversion 이자손실분(직접입력)
  cbAcqGainPrior: string; // conversion 인수 시 기과세 이익(§30①1)
  cbRelatedPreRatioPct: string; // conversion_reverse 특수관계인 전환 전 지분비율 (%)
  // §40 보완 — 교부주식수 분리·상장 Min/Max·양도 cap·자동계산 모드
  cbCreditedShares: string; // 교부받은 주식수(초과분; 미입력=증가주식수)
  cbIsListed: boolean; // 주권상장법인 (§30⑤1 Min/Max 단서)
  cbListedMarketAvg: string; // 전환일 전후 2개월 종가평균(㉠)
  cbTransferGainForCap: string; // 전환가능기간 전환사채 양도차익(양도 cap §30①2 단서)
  cbAutoInterestLoss: boolean; // 이자손실분 자동계산(PV §10의2) 모드
  cbBondMaturity: string; // 만기상환금액(원금)
  cbCouponRatePct: string; // 사채발행이율 (%)
  cbPvFactorAppr: string; // 적정할인율 현가계수 (예 0.73502)
  cbAnnuityFactorAppr: string; // 적정할인율 연금현가계수 (예 3.31212)
  cbAutoExcess: boolean; // 균등초과분 자동산정 모드 (⑤)
  cbOwnPreRatioPct: string; // 본인 전환전 지분율 (%)
  cbSubscribedShares: string; // 인수(전환) 주식수
  cbTotalSubscribable: string; // 총인수가능주식수
  // 전환주식 §39①3호 — 전환 시점 / 발행 시점 2구간 (direction·subType 공유)
  csDirection: "low" | "high";
  csSubType: "forfeited_realloc" | "third_party" | "excess" | "no_realloc";
  csConvPrePrice: string;
  csConvPreShares: string;
  csConvNewPrice: string;
  csConvIssuedShares: string;
  csConvForfeitedShares: string;
  csConvRelatedAcquiredShares: string;
  csConvRatioDenomShares: string;
  csIssuePrePrice: string;
  csIssuePreShares: string;
  csIssueNewPrice: string;
  csIssueIssuedShares: string;
  csIssueForfeitedShares: string;
  csIssueRelatedAcquiredShares: string;
  csIssueRatioDenomShares: string;
  // ── Phase 3 추정·의제 ──
  // 재산취득자금 증여추정 §45
  afSubType: "acquisition" | "debt_repayment";
  afAcquisitionValue: string;
  afProvenAmount: string;
  // 명의신탁 증여의제 §45의2
  ntPropertyValue: string;
  ntTaxAvoidance: boolean; // §45의2③ 조세회피목적 (타인명의 등기 시 추정 true)
  ntExcluded: boolean; // §45의2①1·3·4 배제사유
  ntValuationMode: "total" | "per_share"; // total=재산가액 직접 / per_share=유상증자 신주(명의개서일 §63 평가×신주수)
  ntPerSharePrice: string; // per_share: 명의개서일 §63 평가 1주당 가액
  ntNewShares: string; // per_share: 명의신탁 신주 수
  ntSubscriptionPrice: string; // echo: 신주인수가액(발행가액)
  ntTheoreticalExRights: string; // echo: 이론적 권리락 증자후 1주당 가액
  ntPreIncreasePerShare: string; // echo: 증자 전 1주당 평가액
  ntActualOwner: string; // prefill: 실제소유자(증여자) 성명
  ntNominee: string; // prefill: 명의자(증여의제 수증자) 성명
  // 초과배당 §41의2 — 주주 배열 기반 자동산정 (edExcessDividend·edIncomeTax·edDividendDate 폐지)
  edShareholders: EdShareholderRow[] | undefined; // 3-state: undefined=미입력 / []=빈 / [...]
  edIncomeTaxMode: "undetermined" | "separate" | "comprehensive" | "exempt";
  edSeparateTaxAmount: string; // 분리과세 세액 직접입력
  edComprehensiveTaxBase: string; // 종합과세 과세표준 (ⓐ기준)
  edSettlementMode: boolean; // 정산 활성화 ToggleCard
  edActualIncomeTax: string; // 정산 실제 소득세납부세액
  edDonorRelationship:
    | "spouse"
    | "lineal_ascendant_adult"
    | "lineal_ascendant_minor"
    | "lineal_descendant"
    | "other_relative"
    | undefined;
  edPriorDeductionApplied: string; // 10년 내 기적용 공제 누계
  edIsGenerationSkip: boolean; // 세대생략 여부
  edIsMinorGenerationSkip: boolean; // 미성년 세대생략 할증 (§57①)
  edIsWithinFilingDeadline: boolean; // 기한내신고 예정 (신고세액공제 3%)
  edComprehensiveTaxBaseExcluding: string; // 종합과세 ⓑ기준(초과배당 제외) — 미입력 시 자동 추정
  edIncomeTaxYear: string; // 소득 귀속연도 override — 미입력 시 증여일 연도
  // 상장이익 §41의3 / 합병상장 §41의5
  lgEventType: "listing" | "merger";
  lgSettlementPrice: string;
  lgAcqValue: string;
  lgCorpGrowth: string;
  lgShares: string;
  // 령§31의3⑤ 기업가치 자동계산 (direct=직접입력 / auto=월수산식)
  lgCorpGrowthMode: "direct" | "auto";
  lgTotalNetIncome: string; // 사업연도별 1주당 순손익 합계
  lgMonthsBusinessStart: string; // 분모 월수 (사업연도개시일~상장전일)
  lgMonthsAcqToSettlement: string; // 곱수 월수 (증여·취득일~정산기준일)
  lgMajorShareholder: boolean; // §63③ 최대주주 20% 할증
  lgSurchargeExempt: boolean; // §63③ 단서 배제(중소·중견·결손)
  lgStockCode: string; // 키움 §63①1 자동조회용 종목코드 (조회 보조 — 엔진 미전달)
  lgSettlementDate: string; // 키움 §63①1 자동조회용 정산기준일 (상장일+3개월)
  // 재산사용·용역 §42
  psuSubType: "free_use" | "low_price" | "high_price";
  psuMarketValue: string;
  psuConsideration: string;
  // 조직변경 §42의2
  ocSubType: "share_change" | "value_change";
  ocBaseValue: string;
  ocPreShares: string;
  ocPostShares: string;
  ocPostPerShare: string;
  ocPreValue: string;
  ocPostValue: string;
  // 재산가치증가 §42의3
  viCurrentValue: string;
  viAcqCost: string;
  viNormalIncrease: string;
  viContribution: string;
  viAcqCause: ValueIncreaseAcquisitionCause | ""; // 취득사유 ①1·2·3호 (미선택="")
  viReason: ValueIncreaseReason; // 가치증가사유 영①호 (기본 form_change=1호)
  viAcqDate: string; // 취득일 (5년 echo)
  viEventDate: string; // 사유발생일
  // 특정법인 §45의5
  scTransactionBenefit: string;
  scCorporateTax: string;
  scRatioPct: string;
  // §45의3 일감몰아주기
  rcEnterpriseSize: "small" | "medium" | "large" | "";
  rcTotalSalesStr: string;
  rcPreTaxAdjOperatingIncomeStr: string;
  rcTaxableIncomeStr: string;
  rcCorporateTaxNetStr: string;
  rcShareholders: RcShareholderRow[];
  rcIntermediaryCorps: RcIntermediaryRow[];
  rcSalesPartners: RcSalesRow[];
  // §45의5 확장 — 모드 토글 + 다주주 roster
  /** 입력 방식: "single"=지분율 직접 / "roster"=주주 명단 */
  scMode: "single" | "roster";
  /** 법인세 상당액 모드: "direct"=직접 입력 / "auto"=산출세액+소득금액 자동안분 */
  scCorporateTaxMode: "direct" | "auto";
  /** auto: 법인세 산출세액 */
  scCorpTaxAssessed: string;
  /** auto: 법인세 공제·감면 */
  scCorpTaxDeduction: string;
  /** auto: 각사업연도소득금액 (안분 분모) */
  scCorpIncome: string;
  /** roster: 발행주식 총수 (분모) */
  scTotalShares: string;
  /**
   * roster: 주주 명단 — 3-state (undefined=OFF / []=ON빈(validate 차단) / [...]=데이터).
   * feedback_three_state_optional_mode_toggle 준수.
   */
  scShareholders?: ScShareholderRow[];
  /** 결과 수증자 선택 인덱스 (한도표 표시용) */
  scSelectedDoneeIndex: number;
  /** §45의5② 한도 ㉮㉠ 증여재산공제 */
  scGiftDeduction: string;
}

export const INITIAL_DEEMED: DeemedFormState = {
  giftDate: "",
  type: "",
  tbBeneficiaryType: "same",
  tbPropertyValue: "",
  tbYieldDetermined: true,
  tbYieldRatePct: "",
  tbWithholdingPct: "",
  tbInstallments: "",
  tbSurrenderValue: "",
  tbGiftTiming: "first_installment",
  tbIncomeGiftDate: "",
  tbPrincipalGiftDate: "",
  tbAnnuityType: "finite",
  tbIntervalYears: "1",
  tbBeneficiaryGender: "",
  tbBeneficiaryAge: "",
  tbExpectedRemainingYears: "",
  insCaseType: "non_payer",
  insProceeds: "",
  insTotalPremium: "",
  insRelevantPremium: "",
  insIsInheritance: false,
  bargMarketValue: "",
  bargPrice: "",
  bargRelated: true,
  bargType: "purchase",
  bargJustifiable: false,
  bargExcluded: false,
  debtForgiven: "",
  debtCompensation: "",
  debtOccurType: "creditor_waiver",
  freeSubType: "free_use",
  freePropertyValue: "",
  freeLoanAmount: "",
  freeInterest: "",
  freeRelated: true,
  freeJustifiable: false,
  freePeriods: undefined,
  freeRectOn: false,
  freeRectTax: "",
  freeRectGiftDate: "",
  freeRectTermDate: "",
  loanAmount: "",
  loanInterest: "",
  loanRelated: true,
  loanJustifiable: false,
  loanStartDate: "",
  loanEndDate: "",
  loanLoans: undefined,
  mrgCaseType: "stock",
  mrgMergedPrice: "",
  mrgOvervaluedPrice: "",
  mrgPreShares: "",
  mrgExchangedShares: "",
  mrgMajorShares: "",
  mrgFaceValue: "",
  mrgConsideration: "",
  mrgMergedPriceMode: "direct",
  mrgUnderSharePrice: "",
  mrgUnderPreShares: "",
  mrgPostMergerTotalShares: "",
  mrgIsListed: false,
  mrgListedPostAvgPrice: "",
  mrgIsRelatedCompany: true,
  mrgUseShareholders: false,
  mrgOverShareholders: [],
  mrgUnderShareholders: [],
  mrgExchangeNumer: "1",
  mrgExchangeDenom: "1",
  mrgIsSplitMerger: false,
  mrgSplitMode: "supplementary",
  mrgSplitPrePrice: "",
  mrgSplitBusinessNetAsset: "",
  mrgSplitCompanyNetAsset: "",
  ciDirection: "low",
  ciSubType: "forfeited_realloc",
  ciPrePrice: "",
  ciPreShares: "",
  ciNewPrice: "",
  ciIssuedShares: "",
  ciForfeitedShares: "",
  ciRelatedAcquiredShares: "",
  ciRatioDenomShares: "",
  ciSmallImputation: false,
  ciAllocDirection: "low",
  ciAllocPrePrice: "",
  ciAllocNewPrice: "",
  ciAllocRows: [makeCapTableRow("sh-1"), makeCapTableRow("sh-2")],
  cdCaseType: "low",
  cdSharePrice: "",
  cdRedemptionPrice: "",
  cdTotalShares: "",
  cdMajorRatioPct: "",
  cdRelatedShares: "",
  cdOwnRedeemedShares: "",
  cdMode: "single",
  cdFaceValue: "",
  cdPreTotalShares: "",
  cdShareholders: [],
  cdSelectedDoneeIndex: 0,
  conCaseType: "low",
  conPrePrice: "",
  conPreShares: "",
  conNewPrice: "",
  conContributedShares: "",
  conAllocatedShares: "",
  conRelatedRatioPct: "",
  conSmallImputation: false,
  conParties: undefined,
  cbCaseType: "acquisition",
  cbMarketValue: "",
  cbAcquisitionPrice: "",
  cbTransferPrice: "",
  cbPreConvPrice: "",
  cbPreConvShares: "",
  cbConversionPrice: "",
  cbIncreasedShares: "",
  cbInterestLoss: "",
  cbAcqGainPrior: "",
  cbRelatedPreRatioPct: "",
  cbCreditedShares: "",
  cbIsListed: false,
  cbListedMarketAvg: "",
  cbTransferGainForCap: "",
  cbAutoInterestLoss: false,
  cbBondMaturity: "",
  cbCouponRatePct: "",
  cbPvFactorAppr: "",
  cbAnnuityFactorAppr: "",
  cbAutoExcess: false,
  cbOwnPreRatioPct: "",
  cbSubscribedShares: "",
  cbTotalSubscribable: "",
  csDirection: "low",
  csSubType: "forfeited_realloc",
  csConvPrePrice: "",
  csConvPreShares: "",
  csConvNewPrice: "",
  csConvIssuedShares: "",
  csConvForfeitedShares: "",
  csConvRelatedAcquiredShares: "",
  csConvRatioDenomShares: "",
  csIssuePrePrice: "",
  csIssuePreShares: "",
  csIssueNewPrice: "",
  csIssueIssuedShares: "",
  csIssueForfeitedShares: "",
  csIssueRelatedAcquiredShares: "",
  csIssueRatioDenomShares: "",
  afSubType: "acquisition",
  afAcquisitionValue: "",
  afProvenAmount: "",
  ntPropertyValue: "",
  ntTaxAvoidance: true,
  ntExcluded: false,
  ntValuationMode: "total",
  ntPerSharePrice: "",
  ntNewShares: "",
  ntSubscriptionPrice: "",
  ntTheoreticalExRights: "",
  ntPreIncreasePerShare: "",
  ntActualOwner: "",
  ntNominee: "",
  edShareholders: undefined,
  edIncomeTaxMode: "undetermined",
  edSeparateTaxAmount: "",
  edComprehensiveTaxBase: "",
  edSettlementMode: false,
  edActualIncomeTax: "",
  edDonorRelationship: undefined,
  edPriorDeductionApplied: "",
  edIsGenerationSkip: false,
  edIsMinorGenerationSkip: false,
  edIsWithinFilingDeadline: true,
  edComprehensiveTaxBaseExcluding: "",
  edIncomeTaxYear: "",
  lgEventType: "listing",
  lgSettlementPrice: "",
  lgAcqValue: "",
  lgCorpGrowth: "",
  lgShares: "",
  lgCorpGrowthMode: "direct",
  lgTotalNetIncome: "",
  lgMonthsBusinessStart: "",
  lgMonthsAcqToSettlement: "",
  lgMajorShareholder: false,
  lgSurchargeExempt: false,
  lgStockCode: "",
  lgSettlementDate: "",
  psuSubType: "free_use",
  psuMarketValue: "",
  psuConsideration: "",
  ocSubType: "share_change",
  ocBaseValue: "",
  ocPreShares: "",
  ocPostShares: "",
  ocPostPerShare: "",
  ocPreValue: "",
  ocPostValue: "",
  viCurrentValue: "",
  viAcqCost: "",
  viNormalIncrease: "",
  viContribution: "",
  viAcqCause: "",
  viReason: "form_change",
  viAcqDate: "",
  viEventDate: "",
  scTransactionBenefit: "",
  scCorporateTax: "",
  scRatioPct: "",
  // §45의3 일감몰아주기
  rcEnterpriseSize: "",
  rcTotalSalesStr: "",
  rcPreTaxAdjOperatingIncomeStr: "",
  rcTaxableIncomeStr: "",
  rcCorporateTaxNetStr: "",
  rcShareholders: [],
  rcIntermediaryCorps: [],
  rcSalesPartners: [],
  scMode: "single",
  scCorporateTaxMode: "direct",
  scCorpTaxAssessed: "",
  scCorpTaxDeduction: "",
  scCorpIncome: "",
  scTotalShares: "",
  scShareholders: undefined,
  scSelectedDoneeIndex: 0,
  scGiftDeduction: "",
};

// ── §45의3 일감몰아주기 roster 행 팩토리 ──
export function makeRcShareholderRow(id: string): RcShareholderRow {
  return { id, name: "", relation: "other", directRatioPctStr: "", isCorporate: false };
}

export function makeRcIntermediaryRow(id: string): RcIntermediaryRow {
  return { id, corpShareholderId: "", stakeInBeneficiaryPctStr: "", owners: [] };
}

export function makeRcSalesRow(id: string): RcSalesRow {
  return { id, name: "", salesAmountStr: "", isRelated: false, exclusionType: "", rulingStakes: [] };
}
