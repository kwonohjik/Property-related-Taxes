/**
 * 증여로 보는 경우 (증여 예시·추정·의제) — 공통 타입.
 * Phase 1: 보험금§34 · 저가고가§35 · 채무면제§36 · 부동산무상사용§37 · 금전무상대출§41의4.
 */
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { BargainTransferInput } from "../bargain-transfer";

/** Phase 1 의제 유형 (discriminated union 판별자) */
export type DeemedGiftType =
  | "insurance" // §34 (2)
  | "bargain_transfer" // §35 (3)
  | "debt_forgiveness" // §36 (4)
  | "free_realestate" // §37 (5)
  | "free_loan" // §41의4 (6)
  | "merger" // §38 (7)
  | "capital_increase" // §39 (8)
  | "capital_decrease" // §39의2 (9)
  | "contribution" // §39의3 (10)
  | "convertible_stock" // §39①3호 전환주식 (8-3)
  | "convertible_bond"; // §40 (11)

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
}

// ── 입력 타입 ──

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
  propertyValue?: number; // free_use: 부동산가액
  loanAmount?: number; // collateral: 차입금
  actualInterestPaid?: number; // collateral 실제지급이자
  isRelatedParty: boolean;
  hasJustifiableReason?: boolean; // §37③
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
  overvaluedSharePrice: number; // 합병당사법인 1주당 평가가액
  majorShares: number; // 대주주등 주식수
  // stock 전용
  mergedSharePrice?: number; // ㉮ 합병 후 신설·존속법인 1주당 평가가액
  preMergerShares?: number; // 과대평가법인 합병 전 주식수
  exchangedShares?: number; // 과대평가법인 주주가 교부받은 신설·존속법인 주식수
  // non_stock 전용 (§28③2)
  faceValue?: number; // 액면가액
  mergeConsideration?: number; // 합병대가(액면 미달 시 적용)
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
  sharePrice: number; // 감자주식 1주당 평가액
  redemptionPrice: number; // 소각 시 지급한 1주당 금액
  // low 전용 (①1호)
  totalRedeemedShares?: number; // 총감자 주식수
  majorPostRatio?: { numer: number; denom: number }; // 대주주등 감자 후 지분비율
  relatedRedeemedShares?: number; // 대주주등 특수관계인의 감자 주식수
  // high 전용 (①2호 — 평가액이 액면가 미달 한정)
  faceValue?: number; // 액면가액
  ownRedeemedShares?: number; // 해당 주주등의 감자 주식수
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
  increasedShares?: number; // 전환등 증가주식수(=교부받은 주식수)
  interestLoss?: number; // 이자손실분 (시행규칙 §10의2) — conversion 차감
  acquisitionGainPrior?: number; // §30①1호 이익(인수 시 기과세분) — conversion 차감
  // conversion_reverse(라목, §30①3) 비율
  relatedPreRatio?: { numer: number; denom: number }; // 교부받은 자의 특수관계인이 전환 전 보유 지분비율
}

/** 판별 유니온 입력 (§35는 기존 BargainTransferInput 재사용) */
export type DeemedGiftInput =
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
  | ({ type: "convertible_bond" } & ConvertibleBondInput);
