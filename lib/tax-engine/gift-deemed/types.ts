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

/** (7) 합병 §38 — 주식교부 (대주주등) */
export interface MergerInput {
  mergedSharePrice: number; // ㉮ 합병 후 신설·존속법인 1주당 평가가액
  overvaluedSharePrice: number; // 과대평가 합병당사법인 1주당 평가가액
  preMergerShares: number; // 과대평가법인 합병 전 주식수
  exchangedShares: number; // 과대평가법인 주주가 교부받은 신설·존속법인 주식수
  majorShares: number; // 대주주등이 교부받은 주식수
}

/** (8) 증자 §39 — 저가발행·실권주 재배정 (§39①1호가) */
export interface CapitalIncreaseInput {
  preIssuePrice: number; // 증자 전 1주당 평가가액
  preIssueShares: number; // 증자 전 발행주식총수
  newSharePrice: number; // 신주 1주당 인수가액
  issuedShares: number; // 증자 주식수
  forfeitedShares: number; // 배정받은 실권주수
}

/** (9) 감자 §39의2 — 저가소각 (§39의2①1호) */
export interface CapitalDecreaseInput {
  sharePrice: number; // 감자주식 1주당 평가액
  redemptionPrice: number; // 소각 시 지급한 1주당 금액
  totalRedeemedShares: number; // 총감자 주식수
  majorPostRatio: { numer: number; denom: number }; // 대주주등 감자 후 지분비율
  relatedRedeemedShares: number; // 대주주등 특수관계인의 감자 주식수
}

/** (10) 현물출자 §39의3 — 저가인수 (§39의3①1호) */
export interface ContributionInput {
  preContribPrice: number; // 현물출자 전 1주당 평가가액
  preContribShares: number; // 현물출자 전 발행주식총수
  newSharePrice: number; // 신주 1주당 인수가액
  contributedShares: number; // 현물출자 주식수
  allocatedShares: number; // 배정받은 신주수
}

/** (11) 전환사채 §40 — 저가 인수·취득 (§40①1호) */
export interface ConvertibleBondInput {
  bondMarketValue: number; // 전환사채 시가
  acquisitionPrice: number; // 인수·취득가액
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
  | ({ type: "convertible_bond" } & ConvertibleBondInput);
