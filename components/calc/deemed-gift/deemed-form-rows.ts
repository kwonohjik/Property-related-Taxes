/**
 * 증여로 보는 경우 — 폼 상태의 **roster 행 타입 + 행 팩토리**.
 * deemed-form-state.ts에서 분리(800줄 정책 선제 대응).
 * deemed-form-state.ts가 re-export하여 하위호환 유지 — 기존 import 경로는 그대로 쓴다.
 */
import type { DonorRelation } from "@/lib/tax-engine/types/inheritance-gift-deduction.types";
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
  /**
   * 영리법인 주주 — 「상증법」§2 9호·§4의2①·③상 증여세 납세의무자가 아니다(이익·검증내역은 보존).
   * optional인 것은 ③ 때문이다 — 이 필드가 생기기 전에 저장된 sessionStorage 행은 `undefined`로
   * 들어오고, 그때는 **개인**으로 본다(안전측 — 법인으로 오판하면 과소과세 방향이다).
   */
  isCorporate?: boolean;
  /**
   * 이 주주가 소유한 주식등의 **액면가액 합계액** — 「상증령」§29⑤ 소액주주 판정의 액면 요건
   * (3억원 미만)이고, 지분율 요건(100분의 1 미만)과 함께 「상증법」§39② 1인 의제를 자동 판정한다.
   * 선택 입력이며 **미입력은 「소액주주 아님」**이다(요건 미입증 — 엔진 주석 참조).
   * optional인 것은 ③ 때문이다 — 이 필드가 생기기 전 sessionStorage 행은 `undefined`로 들어온다.
   */
  faceValueSum?: string;
}

export function makeCapTableRow(id: string): CapTableRow {
  return { id, name: "", preShares: "", entitledShares: "", subscribedShares: "", reallocatedShares: "", relatedTo: [], allocationMethod: "normal", isCorporate: false, faceValueSum: "" };
}

/**
 * §45의5 특정법인 다주주 명단 행 (전부 string — parseAmount 변환은 API 변환 시).
 * relation은 ScRelation 열거값. isDonor=증여자 본인 여부(과세제외 donor_self).
 */
export interface ScShareholderRow {
  id: string;
  name: string;
  relation: ScRelation;
  shares: string; // 직접보유 주식수 (CurrencyInput) — 간접분은 ScIntermediaryRow로 표현한다
  isDonor: boolean; // 증여자 본인 → donor_self 제외
  /** 법인주주 → 간접출자법인 후보. 지배주주등은 개인뿐이라(법 §45의4①) 이 행은 과세 대상이 아니다 */
  isCorporate: boolean;
  /**
   * §53 증여재산공제 구분 — 「**증여자와의** 관계」. 위 `relation`(지배주주와의 관계)과 다른 축이다.
   * ""=미지정 → 입력 단의 단일 「증여재산공제」로 떨어진다(기사용 공제가 있을 때 쓰는 경로).
   */
  donorRelation: "" | DonorRelation;
  /** §57① 세대생략 — 증여자의 자녀가 아닌 직계비속(손자녀 등) */
  isGenerationSkip: boolean;
}

export function makeScShareholderRow(id: string): ScShareholderRow {
  return {
    id,
    name: "",
    relation: "lineal_descendant",
    shares: "",
    isDonor: false,
    isCorporate: false,
    donorRelation: "",
    isGenerationSkip: false,
  };
}

/** §45의5 — 간접출자법인의 개인소유주 1행 */
export interface ScIntermediaryOwnerRow {
  individualId: string; // ScShareholderRow.id
  ratioPctStr: string; // 그 법인에 대한 직접보유비율 %
}

/**
 * §45의5 — 간접출자관계 1건 (개인 → 법인 → 특정법인).
 *
 * §45의3의 `RcIntermediaryRow`와 달리 **법인의 특정법인 지분을 따로 받지 않는다** —
 * 경유 법인이 roster의 한 행이므로 그 행의 주식수가 곧 그 값이다. §45의3은 두 곳에서
 * 따로 받아 교차검증이 없다(RC-L). 같은 결함을 새로 만들지 않는다.
 */
export interface ScIntermediaryRow {
  id: string;
  corpShareholderId: string; // ScShareholderRow.id (isCorporate인 행)
  owners: ScIntermediaryOwnerRow[];
}

export function makeScIntermediaryRow(id: string): ScIntermediaryRow {
  return { id, corpShareholderId: "", owners: [] };
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
  /** §⑮1호 — 이 주주가 **수혜법인으로부터** 받은 배당소득 (CurrencyInput) */
  dividendFromBeneficiaryStr: string;
}

/** §45의3 — 간접출자법인 개인소유주 1행 */
export interface RcIntermediaryOwnerRow {
  individualId: string;
  ratioPctStr: string;
  /** §⑮2호 — 이 개인이 **이 간접출자법인으로부터** 받은 배당소득 (CurrencyInput) */
  dividendIncomeStr: string;
}

/** §45의3 — 간접출자법인 roster 1행 */
export interface RcIntermediaryRow {
  id: string;
  corpShareholderId: string;
  stakeInBeneficiaryPctStr: string;
  /** §⑮2호 분모 — 이 간접출자법인의 사업연도 말일 배당가능이익 (CurrencyInput) */
  distributableProfitStr: string;
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
  /**
   * §⑩ 과세제외유형 — 영 §34의3⑩ 후단 「동시에 해당하는 경우에는 더 큰 금액으로 한다」이므로
   * 한 매출액이 여러 호를 가질 수 있다. 빈 배열 = 과세대상.
   * ⑤는 슬롯마다 select를 그리고 «없음»을 `""`로 받으므로 원소에 `""`가 섞일 수 있다 —
   * ④가 걸러낸다(`rowTypes`).
   */
  exclusionTypes: RcExclusionTypeStr[];
  /** §⑩3호 전용 — 수혜법인의 «이 매출처»에 대한 주식보유비율(%) */
  beneficiaryStakePctStr: string;
  /** §⑭1호 — 이 매출처가 §⑱ 간접출자법인이면 그 법인주주 id (`RcIntermediaryRow.corpShareholderId`) */
  intermediaryCorpShareholderId: string;
  rulingStakes: RcRulingStakeRow[];
}

// ── §45의3 일감몰아주기 roster 행 팩토리 ──
export function makeRcShareholderRow(id: string): RcShareholderRow {
  return { id, name: "", relation: "other", directRatioPctStr: "", isCorporate: false, dividendFromBeneficiaryStr: "" };
}

export function makeRcIntermediaryRow(id: string): RcIntermediaryRow {
  return { id, corpShareholderId: "", stakeInBeneficiaryPctStr: "", distributableProfitStr: "", owners: [] };
}

export function makeRcSalesRow(id: string): RcSalesRow {
  return { id, name: "", salesAmountStr: "", isRelated: false, exclusionTypes: [], beneficiaryStakePctStr: "", intermediaryCorpShareholderId: "", rulingStakes: [] };
}

/**
 * §43②·영 §32의4 11호 — 증여일부터 소급 1년 이내의 **같은 호** 선행거래 1건.
 *
 * 합산하지 않으면 쪼갠 거래가 각각 영 §34의5⑤ 1억원 미만이 되어 전부 비과세로 빠진다.
 * 호가 다른 거래는 합산 대상이 아니다 — 11호 괄호가 「같은 항 각 호의 거래에 따른 이익별로
 * 구분된 이익」이라고 못박는다.
 */
export interface ScPriorTxRow {
  id: string;
  /** 거래한 날 (YYYY-MM-DD) */
  date: string;
  /** 그 거래의 영 §34의5④1호 이익 */
  benefit: string;
  label: string;
}

export function makeScPriorTxRow(id: string): ScPriorTxRow {
  return { id, date: "", benefit: "", label: "" };
}
