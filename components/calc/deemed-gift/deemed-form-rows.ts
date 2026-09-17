/**
 * 증여로 보는 경우 — 폼 상태의 **roster 행 타입 + 행 팩토리**.
 * deemed-form-state.ts에서 분리(800줄 정책 선제 대응).
 * deemed-form-state.ts가 re-export하여 하위호환 유지 — 기존 import 경로는 그대로 쓴다.
 */
import type { ScRelation, ShareAllocationMethod } from "@/lib/tax-engine/gift-deemed/types";

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
  allocationMethod: ShareAllocationMethod; // §39① 공모 모집 배정 제외 판정 (행별)
}

export function makeCapTableRow(id: string): CapTableRow {
  return { id, name: "", preShares: "", entitledShares: "", subscribedShares: "", reallocatedShares: "", relatedTo: [], allocationMethod: "normal" };
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
