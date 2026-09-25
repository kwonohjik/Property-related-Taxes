/**
 * 증여로 보는 경우 — 의제 Input 인터페이스 + input 하위타입.
 * result 타입(DeemedGiftResult·MergerMatrix 등)은 types.ts에 있음.
 * 순환 import 방지: 이 파일은 types.ts를 import하지 않음.
 */
import type { GiftDonorRelation } from "../types/inheritance-gift.types";
import type { BargainTransferInput } from "../bargain-transfer";

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
  /**
   * 「상증령」§29②2호 **다목**의 「증자후 신주인수자의 지분비율」 — **저가 나목 전용**.
   * 다목 = 실권주 총수 × 이 비율 × (신주인수자의 특수관계인의 실권주수 ÷ 실권주 총수)이며
   * 실권주 총수가 약분되므로 엔진은 **이 비율 × `relatedAcquiredShares`** 로 계산한다.
   *
   * ⚠️ 분모를 `preIssueShares + issuedShares`로 **파생하지 않는다** — 나목은 실권주를 배정하지
   *    않아 소멸시키므로 증자후 발행주식총수가 실제 증가분과 어긋난다. 추정 금지(자동 안분 금지
   *    정책과 같은 층위) ⇒ 분자·분모를 각각 입력으로 받는다.
   * 미입력이면 종전 동작(원시 `forfeitedShares`)을 유지한다 — 입력 필수화는 ⑧ validate 담당.
   */
  postIssueSubscriberRatio?: { numer: number; denom: number };
  // §39②: 이익을 증여한 소액주주(§29⑤) 2명 이상 → 1인 의제 (저가발행 ①1호 한정)
  smallShareholderImputation?: boolean;
  /** 주권상장법인등 — §29②1가 단서(저가 min)·§29②3나 단서(고가 max) */
  /** 배정 방법 — §39① 공모 모집 제외 판정. 미지정 = "normal" */
  allocationMethod?: ShareAllocationMethod;
  isListed?: boolean;
  /**
   * 증자 후 1주당 평가가액 = 평가기준일 전후 각 2개월 종가평균(§63①1가).
   * 평가기준일은 §29① — 상장·코스닥 **주주배정**은 권리락일(1호), 전환주식은 전환한 날(2호),
   * 그 외는 주식대금 납입일(3호). 엔진은 평균액을 계산하지 않고 주입받는다.
   */
  listedMarketAvg?: number;
}

// ── (8b) 증자 §39 cap-table 다수증자·다증여자 배분 (equity-delta 방식) ──

/** 주주 1명의 증자 참여 명세 (cap-table 1행) */
/**
 * 실권주·신주의 배정 방법 — 「상증법」§39① 괄호(주권상장법인 모집방법 배정 제외) 판정.
 *   "normal"                 기본 — 제외 대상 아님(과세)
 *   "public_offering"        주권상장법인이 자본시장법 §9⑦ 모집방법(50인 이상 청약권유)으로 배정
 *                            ⇒ **§39① 적용 제외**(과세 없음)
 *   "deemed_public_offering" 그 모집이 자본시장법 시행령 §11③ **간주모집**(50인 미만 + 전매기준)
 *                            ⇒ 「상증령」§29③으로 위 제외가 **취소**되어 과세(normal과 세액 동일)
 * ⚠️ §39의3(현물출자)에는 적용하지 않는다 — 그쪽은 자본시장법 §165의6①3(일반공모 **방식**)로
 *    별도 규율하며 효과도 「신주수 차감」이라 다르다.
 */
export type ShareAllocationMethod = "normal" | "public_offering" | "deemed_public_offering";

export interface CapShareholder {
  id: string;
  name?: string;
  preShares: number; // 증자 전 보유 주식수
  entitledShares: number; // 균등(당초지분) 배정 신주수
  subscribedShares: number; // 실제 인수한 총 신주수(당초+재배정+제3자+초과)
  reallocatedShares?: number; // 그 중 재배정/제3자/초과로 받은 신주수 (실권처리 판정용)
  relatedTo?: string[]; // 특수관계인 주주 id (없으면 그 증여자 귀속분 과세 0)
  /** 이 주주가 신주를 배정받은 방법 — §39① 공모 제외 판정(행별). 미지정 = "normal" */
  allocationMethod?: ShareAllocationMethod;
}

/** 증자 cap-table 입력 (equity-delta: 실제 ㉯ + 손해비례 배분) */
export interface CapitalIncreaseAllocationInput {
  direction: "low" | "high"; // 저가/고가 (이익자 방향 결정)
  preIssuePrice: number; // ㉮ 증자 전 1주당 평가가액
  newSharePrice: number; // ㉰ 신주 1주당 인수가액
  shareholders: CapShareholder[];
  /**
   * 주권상장법인 여부 — 「상증법」§39① 괄호 「**주권상장법인이** …모집방법으로 배정하는 경우는 제외」의
   * AND 조건. 미지정은 비상장으로 본다(안전측 — 제외 오적용은 과소과세 방향).
   *
   * 🚫 **이 값을 증자 후 1주당 평가가액(㉯) 계산에 절대 넣지 말 것.**
   *    「상증령」§29②1가·3나 단서(상장이면 ㉯를 종가평균 Min/Max로)는 equity-delta 모델에서
   *    「증여자 손해 합계 = 수증자 이익 합계」 항등식을 깨뜨린다(실측: 이론 ㉯ 15,000 → Σdelta 0 /
   *    종가평균 12,000 → Σdelta −600,000,000). 그래서 **안 C로 미반영 확정**됐다.
   *    이 필드는 「이 법인이 상장인가」라는 **사실 플래그**로만 쓰여 ㉯에 접촉하지 않는다.
   *    (계획서 `capital-increase-captable-listed-proviso.plan.md` v1.7 §13 · anchor CL-1·CL-2)
   */
  isListed?: boolean;
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
  /** 주권상장법인등 — §29의3①이 준용하는 §29②1가 단서(저가 min)·§29②3나 단서(고가 max) */
  isListed?: boolean;
  /** 현물출자 후 1주당 평가가액 = **현물출자 납입일**(법 §39의3① 본문) 전후 각 2개월 종가평균(§63①1가) */
  listedMarketAvg?: number;
  /**
   * 일반공모(자본시장법 §165의6①3) 방식으로 배정된 신주수 — §29의3①1·2호 괄호로 곱셈 인자에서 제외.
   * 조문이 「주권상장법인이 … 방식으로 배정하는 경우」 한정이라 **isListed일 때만** 차감한다.
   */
  publicOfferingShares?: number;
}

/** (11) 전환사채등 §40 — 인수·취득(①1호)·주식전환(①2호 가나다/라목)·양도(①3호) sub-case */
/**
 * §40①1호·2호 각 목 — 「상증법」§40①1호 가·나·다목 / 2호 가·나·다목.
 *   "from_related"                  가목 — 특수관계인으로부터 전환사채등을 취득
 *   "major_excess"                  나목 — 발행법인의 최대주주나 그의 특수관계인인 **주주**가
 *                                          균등배정 초과 인수등
 *   "major_related_nonshareholder"  다목 — 발행법인 최대주주의 특수관계인(그 법인의 **주주는 제외**)
 *
 * ⚠️ **계산 규칙이 아니라 해당성(분류) 규칙**이다 — 「상증령」§30①1이 「제1호 **각 목**」을,
 *    §30①2가 「제2호 **가목부터 다목까지**」를 각각 **한 산식**으로 묶으므로 목이 달라도 세액은 같다.
 *    목이 가르는 것은 **공모 발행 제외 대상 여부**(나·다목만)다.
 * ⚠️ 라목(교부주식가액 < 전환가액등)은 `caseType: "conversion_reverse"`로 분리돼 있어 여기 없다.
 * ⚠️ 「최대주주」 판정은 사용자 몫이다(「상증령」§30③ — 최대주주등 중 보유주식 최다 1인).
 */
export type ConvertibleBondClause =
  | "from_related"
  | "major_excess"
  | "major_related_nonshareholder";

export interface ConvertibleBondInput {
  caseType?: "acquisition" | "conversion" | "conversion_reverse" | "transfer"; // 기본 acquisition
  /** §40①1호·2호 각 목 — 세액 불변, 공모 발행 제외 대상 판정용. 미지정 = "from_related"(가목) */
  clause?: ConvertibleBondClause;
  /**
   * 전환사채등의 **발행** 방법 — 「상증법」§40①1호나목 괄호 공모 발행 제외 판정.
   * ⚠️ §39의 `allocationMethod`(모집방법 **배정**·주주별 행위)와 **다른 개념**이다.
   *    §40은 「모집방법으로 전환사채등을 **발행**한 법인」이라는 **발행법인 속성**이라 사안 단위 단일값.
   *    타입만 공유하고 필드는 분리한다(겸용 시 dual-truth). 미지정 = "normal"
   */
  issuanceMethod?: ShareAllocationMethod;
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

// ── Phase 3(추정·의제) 타입은 gift-deemed-input-phase3.ts로 분리했다 ──
//    기존 import 경로 보존을 위해 여기서 전량 re-export한다(feedback_800line_split_export_preservation).
//    신규 Phase 3 타입을 추가하면 이 목록에도 반드시 넣을 것.
export type {
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
  ScTransactionType,
  ScCounterparty,
  ScPriorTransaction,
  SpecificCorpInput,
  RcShareholder,
  RcIntermediaryCorpItem,
  RcExclusionType,
  RcSalesPartner,
  RelatedCorpInput,
} from "./gift-deemed-input-phase3";

import type {
  AcquisitionFundPresumptionInput,
  NomineeTrustInput,
  ExcessDividendInput,
  ListingGainInput,
  PropertyServiceUseInput,
  OrgChangeInput,
  ValueIncreaseInput,
  SpecificCorpInput,
  RelatedCorpInput,
} from "./gift-deemed-input-phase3";

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
