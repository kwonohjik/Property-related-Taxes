import type { DonorRelation } from "../types/inheritance-gift-deduction.types";

/**
 * 증여로 보는 경우 — **Phase 3(추정·의제)** Input 타입.
 *
 * `gift-deemed-input-types.ts`에서 분리했다(800줄 정책 선제 대응 — 분리 시점 747줄).
 * 「타입 전용 파일은 재성장 위험이 낮다」는 예외의 전제가 이 파일에서는 **깨졌다**:
 * 3개 패키지에서 692 → 747줄(+55)로 늘었고, 남은 §45의5·§45의3 작업이 전부 이 구역을 지난다.
 *
 * ⚠️ **import 경로는 바뀌지 않는다** — `gift-deemed-input-types.ts`가 전량 re-export한다.
 * 신규 Phase 3 타입은 이 파일에 넣고 barrel의 re-export 목록에 **반드시 추가**할 것
 * (누락하면 기존 import 경로에서 조용히 사라진다).
 */

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

/** §41의3 상장이익 / §41의5 합병상장이익 (시행령 §31의3·§31의5) */
export interface ListingGainInput {
  eventType?: "listing" | "merger"; // §41의3 상장 / §41의5 합병상장, 기본 listing
  settlementPerSharePrice: number; // 정산기준일(상장일·합병등기일 +3개월) 현재 1주당 평가가액(§63)
  perShareAcqValue: number; // 1주당 증여세 과세가액(또는 취득가액)
  perShareCorpGrowth: number; // 1주당 기업가치 실질증가이익(§31의3⑤). corpGrowthAuto 지정 시 무시(자동계산)
  shares: number; // 증여·유상취득 주식수
  /**
   * 1주당 기업가치 실질증가이익 자동계산(령§31의3⑤) — 지정 시 perShareCorpGrowth 대신 사용.
   * = (사업연도별 1주당 순손익 합계 ÷ 분모월수) × 곱수월수. 월수 1월미만은 1월(령§31의3⑤ 각호).
   */
  corpGrowthAuto?: {
    totalNetIncomePerShare: number; // 증여·취득일 속한 사업연도개시일~상장전일 1주당 순손익액 합계(령§31의3⑤1)
    monthsBusinessStartToListingPrevDay: number; // 분모 월수 — 사업연도개시일~상장전일(1월미만=1월)
    monthsAcqToSettlement: number; // 곱수 월수 — 증여·취득일~정산기준일(령§31의3⑤2, 1월미만=1월)
  };
  /** §63③ 최대주주등 — true면 정산기준일 평가가액에 20% 가산(할증) */
  isMajorShareholder?: boolean;
  /** §63③ 단서 할증 배제 대상(중소기업·중견기업·3년연속 결손법인) — true면 최대주주여도 할증 미적용 */
  isSurchargeExemptEntity?: boolean;
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

/**
 * §45의5 관계 — **지배주주 기준**이다("other"=비친족(타인)). 증여자 본인은 isDonor 플래그로 분리.
 * 🔴 SC-4-e: 「지배주주등」(법 §45의4① 「지배주주와 그 친족」을 §45의5가 준용)에는 **지배주주 본인**이
 *    포함되는데 그 행을 표현할 값이 없어 「기타친족」 등으로 우회 입력해야 했다(세액은 같으나 표기가 틀린다).
 */
export type ScRelation =
  | "self"
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
  /**
   * 법인주주 — `intermediaryCorps`의 경유 법인이 된다. 지배주주등은 「지배주주와 그 친족」(법 §45의4①)
   * 이라 **개인**만이므로, 법인 행은 ⓐ 해당성 합계와 수증자 판정 양쪽에서 빠진다(간접 귀속으로만 반영).
   */
  isCorporate?: boolean;
  /**
   * §53 증여재산공제 구분 — 「**증여자와의** 관계」다. 위 `relation`(지배주주와의 관계)과 **다른 축**이라
   * 재사용할 수 없다: `relation`은 `isRelated` 판정에만 쓰이는 passthrough다.
   * 미전달이면 입력 단의 단일 `giftDeduction`으로 떨어진다(하위호환).
   */
  donorRelation?: DonorRelation;
  /** §57① 세대생략 — 증여자의 자녀가 아닌 직계비속(손자녀 등). 미성년 40% 판정은 `donorRelation`이 담는다 */
  isGenerationSkip?: boolean;
}

/** 법 §45의5① 각 호 거래유형 */
export type ScTransactionType =
  | "gratuitous" // 1호 재산·용역을 무상으로 제공받는 것
  | "low_price" // 2호 현저히 낮은 대가로 양도·제공**받는** 것 → 이익 = 시가 − 대가
  | "high_price" // 3호 현저히 높은 대가로 양도·제공**하는** 것 → 이익 = 대가 − 시가
  | "capital_transaction" // 3의2호 불균등 감자 등 자본거래 (영 §34의5② 8유형)
  | "debt_relief"; // 4호 채무면제·인수·변제 (영 §34의5⑥)

/**
 * 법 §45의5① 거래상대방 — 「특정법인이 **지배주주 및 그 특수관계인**과 … 거래를 하는 경우」.
 *
 * ⚠️ 3의2호(자본거래)만 상대방 집합이 좁다 — 영 §34의5②은 「특정법인과 **지배주주의 특수관계인**
 * 사이에 이루어지거나 지배주주의 특수관계인 사이에 이루어지는」이라 **지배주주 본인이 빠진다**
 * (법 ①은 2026.1.1에 「지배주주 및 그」로 넓혀졌으나 영 ②은 개정되지 않았다).
 */
export type ScCounterparty =
  | "ruling_shareholder" // 지배주주 본인
  | "ruling_related" // 지배주주의 특수관계인
  | "other"; // 그 밖의 자 → §45의5① 부적용

/**
 * §43②·영 §32의4 11호 — 증여일부터 소급 1년 이내의 **같은 호** 거래 1건.
 * 「이익」은 그 거래의 영 §34의5④1호 이익(가목 증여재산가액·채무면제이익 / 나목 준용계산액 /
 * 다목 시가−대가 차액)이다. 요건(현저성 등)을 충족한 거래의 이익만 넣는다.
 */
export interface ScPriorTransaction {
  /** 거래한 날 (YYYY-MM-DD) */
  date: string;
  /** 그 거래의 §34의5④1호 이익 */
  benefit: number;
  /** 표시용 라벨 */
  label?: string;
}

/** §45의5 특정법인과의 거래 */
export interface SpecificCorpInput {
  transactionBenefit: number; // §34의5④1호 거래이익(증여재산가액·채무면제이익·시가−대가 차액)
  /**
   * §45의5① 「**거래한 날**을 증여일로 하여」 — 이 신고의 증여일.
   * §43② 1년 소급 윈도의 기준일이자 §69 신고세액공제율의 기준일이다.
   */
  transactionDate?: string;
  /**
   * §43②·영 §32의4 11호 — 「그 증여일부터 소급하여 1년 이내에 동일한 거래 등이 있는 경우에는
   * 각각의 거래 등에 따른 이익을 해당 이익별로 합산하여 계산한다」.
   *
   * 11호 괄호가 「같은 항 **각 호의 거래에 따른 이익별로 구분된 이익**」이라 **호별**로 합산한다
   * — 이 배열은 `transactionType`이 가리키는 호와 같은 호의 거래만 담는다(UI가 그렇게 안내한다).
   *
   * ⚠️ 법 §43② 본문 괄호 「(시가와 대가의 차액을 말한다)」를 «다목 거래에만 합산한다»로 읽으면
   *    안 된다 — 같은 항이 §37(부동산 무상사용)·§41의2(초과배당)·§41의4(금전무상대출)도 열거하는데
   *    그것들은 시가−대가 차액이 아니다. §45의5의 이익 범위는 위임을 받은 영 §32의4 11호가 정한다.
   *
   * 합산하지 않으면 쪼갠 거래가 각각 영 §34의5⑤ 1억원 미만이 되어 전부 비과세로 빠진다.
   */
  priorTransactions?: ScPriorTransaction[];
  /** 거래상대방 — 미전달이면 **판정하지 않는다**(결과뷰가 고지). ⑧ validate가 제품 경로에서 강제한다 */
  counterparty?: ScCounterparty;
  /**
   * 거래유형. 미전달이면 1호(무상)로 본다 — `transactionBenefit`가 곧 이익인 유일한 호라
   * 종전 코드의 암묵 전제를 이름 붙인 것이다(값을 지어내는 fallback이 아니다).
   */
  transactionType?: ScTransactionType;
  /** 2·3호 — 영 §34의5⑧ 시가(「법인세법 시행령」 §89에 따른다) */
  marketValue?: number;
  /** 2·3호 — 대가 */
  consideration?: number;
  /** 4호 — 영 §34의5⑥ 단서: 해산(합병·분할에 의한 해산 제외) 중 + 주주등에게 분배할 잔여재산 없음 → 제외 */
  isDissolvingWithoutResidual?: boolean;
  // ── single(하위호환) 모드: 법인세 안분·지분율을 호출자가 사전 계산 ──
  corporateTax?: number; // 법인세 상당액(이미 안분된 최종값)
  ownershipRatio?: { numer: number; denom: number }; // ⓑ 승수 — **해당** 지배주주등 1인의 주식보유비율(상증령 §34의5⑨)
  /**
   * ⓐ 「특정법인」 해당성 판정용 — 지배주주등(지배주주와 그 친족) **전원**의 주식보유비율
   * 합계(직접+간접). 승수 `ownershipRatio`(ⓑ 인별)와 **다른 축**이다 — 섞지 말 것.
   * roster에서는 주주 명부의 직접지분 합계를 보정(간접분 가산)하는 신고값으로 쓴다.
   */
  controllingGroupRatio?: { numer: number; denom: number };
  /**
   * 간접출자법인 — 개인이 법인을 통해 특정법인 주식을 보유하는 관계.
   * 「주식보유비율」은 법 §45의3①이 §45의5까지 확장한 정의어라 **직접 또는 간접**을 모두 산입한다.
   * 산식은 상증령 §34의3②(각 단계 직접보유비율의 곱, 경로가 둘 이상이면 합) — §45의3과 공용
   * 헬퍼(`computeIndirectRatioBig`)를 쓴다.
   *
   * ⚠️ `stakeInBeneficiary`는 UI가 따로 받지 않는다 — 경유 법인이 roster의 한 행이므로
   * 그 행의 `shares/totalShares`가 곧 이 값이다. §45의3은 두 곳에서 따로 받아 교차검증이
   * 없는데(RC-L), 같은 결함을 새로 만들지 않기 위해 단일 소스로 둔다.
   */
  intermediaryCorps?: RcIntermediaryCorpItem[];
  // ── roster 모드 (shareholders 존재 시 dispatch) ──
  shareholders?: SpecificCorpShareholder[];
  annualIncome?: number; // §34의5④2호나목 각사업연도소득금액(분모)
  corporateTaxComputed?: number; // 법인세 산출세액(안분 前) — 「법인세법」 §55① 정의상 §55의2분을 «포함»한 값
  /**
   * 「법인세법」 §55의2 토지등 양도소득에 대한 법인세액 — 상증령 §34의5④2호가목이
   * 「산출세액(같은 법 제55조의2에 따른 토지등 양도소득에 대한 법인세액은 제외한다)」로
   * 명시 차감하는 항목. §55① 본문이 산출세액을 「…이를 **합한 금액으로 한다**」로 정의하므로
   * 이 괄호는 확인적 문구가 아니라 실질 차감이다.
   * ⚠️ 조특법 §100의32(투자·상생협력 촉진) 특례세액은 §55①이 같이 합산하지만 상증령 괄호는
   *    열거하지 않는다 — **빼면 안 된다**(확대 적용 금지).
   */
  corporateTaxOnLandTransfer?: number;
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
  /**
   * §34의3⑮1호 분자 — 이 지배주주등이 **수혜법인으로부터** 받은 배당소득(원).
   * 기간은 「직전 사업연도 §68① **단서** 신고기한 다음날 ~ 해당 사업연도 같은 단서 신고기한」.
   *
   * ⚠️ 간접출자법인으로부터 받은 배당은 ⑮**2호**이고 분모가 전혀 다르다
   *    (`RcIntermediaryCorpItem.owners[].dividendIncome`). 돌려쓰면 조용히 틀린다.
   */
  dividendFromBeneficiary?: number;
}

/** §45의3 일감몰아주기 — 간접출자법인 1개 (2단계 간접: 개인→법인→수혜법인) */
export interface RcIntermediaryCorpItem {
  /** 이 법인인 법인주주의 id (RcShareholder.id 매칭) */
  corpShareholderId: string;
  /** 이 법인의 수혜법인 직접보유비율 분수 */
  stakeInBeneficiary: { numer: number; denom: number };
  /** §34의3⑮2호 분모 — 이 간접출자법인의 **사업연도 말일 배당가능이익**(원) */
  distributableProfit?: number;
  /** 이 법인의 개인 소유주 (§⑱ 자동판정용: 지배주주등 합산≥30% → §⑱1호) */
  owners: {
    individualId: string; // RcShareholder.id
    ratio: { numer: number; denom: number }; // 이 법인에 대한 직접보유비율
    /** §34의3⑮2호 분자 — 이 개인이 **이 간접출자법인으로부터** 받은 배당소득(원) */
    dividendIncome?: number;
  }[];
}

/** §34의3⑩ 과세제외유형 */
export type RcExclusionType =
  | "sec10_1" // 중소-중소
  | "sec10_2" // 수혜법인 50%↑ 출자 특수관계법인
  | "sec10_3" // 수혜법인 50%미만 출자 × 보유비율 → `beneficiaryStakeInPartner` 필수
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
  /**
   * §⑩ 과세제외유형 — **하나의 매출액이 여러 호에 동시 해당할 수 있다**.
   *
   * 영 §34의3⑩ 후단 verbatim: 「이 경우 다음 각 호에 동시에 해당하는 경우에는 **더 큰 금액으로
   * 한다**.」 종전에는 이 필드가 스칼라라 「동시 해당」을 표현할 자료구조가 아예 없었고,
   * `computeCommonExclusion`의 `Math.max`는 행 id로 키잉돼 비교 대상이 영원히 하나뿐이었다
   * (주석은 「§⑩ 후단 구현」을 단언하는데 안전망 구별력은 0이었다 — RC-3-i).
   *
   * ⚠️ 호 사이의 max이지 **매출처 사이의 max가 아니다**. 영 §34의3⑪이 「특수관계법인이 둘 이상인
   *    경우에는 각각의 매출액을 **모두 합하여** 계산한다」고 합산을 명령하므로, 서로 다른
   *    매출처는 언제나 합산이다.
   *
   * 빈 배열·undefined = 과세제외 해당 없음(과세대상).
   */
  exclusionTypes?: RcExclusionType[];
  /**
   * §⑩**3호 전용** — 「수혜법인이 본인의 주식보유비율이 100분의 50 **미만**인 특수관계법인과
   * 거래한 매출액에 **그 특수관계법인에 대한 수혜법인의 주식보유비율을 곱한 금액**」.
   *
   * 즉 «수혜법인 → 이 매출처» 방향의 지분율이다. 아래 `rulingShareholderStakes`(§⑭3호의
   * «지배주주등 → 이 매출처» 보유비율)와 **방향도 조문도 다르다** — 돌려쓰면 조용히 틀린다.
   * 3호 이외의 호는 매출액 전액이 제외되므로 이 필드를 쓰지 않는다(2호와 대비되는 지점).
   */
  beneficiaryStakeInPartner?: { numer: number; denom: number };
  /**
   * §⑭**1호** — 「수혜법인이 제18항에 따른 간접출자법인인 특수관계법인과 거래한 매출액」.
   * 이 매출처가 §⑱ 간접출자법인이면 그 법인주주의 id(`RcIntermediaryCorpItem.corpShareholderId`).
   * §⑱ 요건(지배주주등 합산 30% 이상) 충족 여부는 엔진이 `intermediaryCorps`로 판정한다.
   */
  intermediaryCorpShareholderId?: string;
  /** §⑭3호: 수증자별 이 법인에 대한 보유비율 (⑩ 미해당 시 적용). 없으면 미적용 */
  rulingShareholderStakes?: {
    shareholderId: string; // RcShareholder.id 매칭 키
    ratio: { numer: number; denom: number };
  }[];
}

/** §45의3 일감몰아주기 — 엔진 입력 (nested, 순수함수) */
export interface RelatedCorpInput {
  /**
   * §45의3③ 「증여의제이익의 계산은 수혜법인의 **사업연도 단위**로 하고, 수혜법인의 **해당
   * 사업연도 종료일을 증여시기**로 본다」 — 이 조문의 증여시기는 거래일도 신고일도 아니다.
   *
   * 종전에는 `RelatedCorpInput`에 날짜 필드가 하나도 없어 「어느 시점의 사업연도인가」가
   * 엔진에 도달하지 않았다. 행위시법 분기(W12)를 만들 자리 자체가 없었고, 결과에
   * `appliedLawDate`(저장소 4개 엔진의 확립된 관례)도 내보내지 못했다.
   */
  fiscalYearEndDate?: string;
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
  /**
   * §34의3⑮1호 — 「수혜법인의 **사업연도 말일 배당가능이익**」(법인세법 시행령 §86의3①).
   * ⑮1호 계산식의 **분모**이고, ⑮2호 분모에도 「수혜법인 배당가능이익 × 간접출자법인의
   * 수혜법인에 대한 주식보유비율」로 다시 등장한다.
   *
   * ⚠️ 설계서(:260-263)는 배당소득 2필드만 명세했는데 **분모가 빠져 있어 그대로는 계산이
   *    불가능**했다. 조문 계산식대로 분모를 받는다.
   */
  distributableProfit?: number;
  shareholders: RcShareholder[];
  intermediaryCorps: RcIntermediaryCorpItem[];
  salesPartners: RcSalesPartner[];
}
