/**
 * 증여로 보는 경우 — **Phase 3 추정·의제** 폼 필드(§45 재산취득자금 · §45의2 명의신탁 ·
 * §41의2 초과배당 · §41의3 상장이익 · §42 재산사용 · §42의2 조직변경 · §42의3 가치증가 ·
 * §45의3 일감몰아주기 · §45의5 특정법인).
 *
 * deemed-form-state.ts에서 분리(800줄 정책 선제 대응) — 신규 필드는 이 파일에 추가한다.
 * 타입·초기값을 **한 파일에 짝으로** 두어 한쪽만 추가하는 누락을 막는다.
 */
import type { ValueIncreaseAcquisitionCause, ValueIncreaseReason } from "@/lib/tax-engine/gift-deemed/types";
import type { EdShareholderRow, RcIntermediaryRow, RcSalesRow, RcShareholderRow, ScIntermediaryRow, ScPriorTxRow, ScShareholderRow } from "./deemed-form-rows";
import type { ScCounterparty, ScTransactionType } from "@/lib/tax-engine/gift-deemed/types";

export interface DeemedPhase3Fields {
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
  /** 법 §45의5① 거래상대방 — ""=미선택(⑧이 차단). 3의2호는 「지배주주 본인」이 빠진다(영 §34의5②) */
  scCounterparty: "" | ScCounterparty;
  /** 법 §45의5① 각 호 거래유형. 기본 1호(무상) — `scTransactionBenefit`가 곧 이익인 유일한 호다 */
  scTransactionType: ScTransactionType;
  /** 2·3호 — 영 §34의5⑧ 시가(「법인세법 시행령」 §89) */
  scMarketValue: string;
  /** 2·3호 — 대가 */
  scConsideration: string;
  /** 4호 — 영 §34의5⑥ 단서: 해산 중 + 잔여재산 없음 → 제외 */
  scIsDissolvingNoResidual: boolean;
  scRatioPct: string;
  /**
   * §45의5① ⓐ 특정법인 해당성 판정용 — 지배주주등(지배주주와 그 친족) **전원**의
   * 주식보유비율 합계(직접+간접, %). 승수 `scRatioPct`(ⓑ 인별)와 다른 축이다.
   * roster에서는 주주 명부의 직접지분 합계를 간접분만큼 보정하는 신고값으로 쓴다(미입력 = 간접 0%).
   */
  scGroupRatioPct: string;
  // §45의3 일감몰아주기
  rcEnterpriseSize: "small" | "medium" | "large" | "";
  rcTotalSalesStr: string;
  rcPreTaxAdjOperatingIncomeStr: string;
  rcTaxableIncomeStr: string;
  rcCorporateTaxNetStr: string;
  /** §⑮ 배당소득공제 고급 토글 (기본 OFF) — ④·⑧의 렌더 게이트 원본 */
  rcShowDividendDeduction: boolean;
  /** §⑮1호·2호 분모 — 수혜법인의 사업연도 말일 배당가능이익 */
  rcDistributableProfitStr: string;
  rcShareholders: RcShareholderRow[];
  rcIntermediaryCorps: RcIntermediaryRow[];
  rcSalesPartners: RcSalesRow[];
  /**
   * 과세 수증자 선택 인덱스 (증여세 마법사 이관용).
   *
   * §45의3①은 지배주주와 그 친족이 이익을 「**각각** 증여받은 것으로 본다」고 하므로
   * 지배주주등은 각자 독립 납세의무자다. 마법사 세션 1개 = 신고 1건이라 선택된 1명만
   * 이관한다 — 현물출자 고가(`conSelectedDoneeIndex`)·감자 §39의2(`cdSelectedDoneeIndex`)·
   * 특정법인 §45의5(`scSelectedDoneeIndex`)와 같은 축.
   */
  rcSelectedDoneeIndex: number;
  // §45의5 확장 — 모드 토글 + 다주주 roster
  /** 입력 방식: "single"=지분율 직접 / "roster"=주주 명단 */
  scMode: "single" | "roster";
  /** 법인세 상당액 모드: "direct"=직접 입력 / "auto"=산출세액+소득금액 자동안분 */
  scCorporateTaxMode: "direct" | "auto";
  /** §43②·영 §32의4 11호 — 소급 1년 이내 같은 호 선행거래 (미사용 시 undefined) */
  scPriorTransactions?: ScPriorTxRow[];
  /** auto: 법인세 산출세액 */
  scCorpTaxAssessed: string;
  /** auto: 「법인세법」 §55의2 토지등 양도소득에 대한 법인세액 (영 §34의5④2호가목 — 산출세액에서 제외) */
  scCorpTaxLandTransfer: string;
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
  /** §45의5 간접출자관계 (개인 → 법인 → 특정법인). 「주식보유비율」은 직접+간접이다(법 §45의3①) */
  scIntermediaryCorps?: ScIntermediaryRow[];
  /**
   * 과세 수증자 선택 인덱스 — **한도표 표시 + 증여세 마법사 이관** 양쪽에 쓴다.
   * (종전 JSDoc은 「한도표 표시용」이라고만 적어 prefill이 이 값을 무시하는 상태와
   *  `gift-deemed-prefill.ts`가 이 필드를 선례로 인용하는 주석이 서로 모순됐다.)
   */
  scSelectedDoneeIndex: number;
  /** §45의5② 한도 ㉮㉠ 증여재산공제 */
  scGiftDeduction: string;
  /**
   * §68① 단서 — 특정법인의 **사업연도 종료일**. 증여일(거래한 날)과 다른 축이다.
   * §45의3은 증여시기 자체가 사업연도 종료일이라(§45의3③) `giftDate`가 그 역할을 하지만,
   * §45의5의 증여일은 「거래한 날」(§45의5①)이라 사업연도를 별도로 받아야 신고기한이 선다.
   */
  scCorpFiscalYearEndDate: string;
  /**
   * 법인세법 §60① 괄호 — 성실신고확인서를 제출하는 법인은 신고기한이 **4개월**이다.
   * §45의3·§45의5 공통(한 번에 한 유형만 활성이다).
   */
  corpHonestFilingConfirm: boolean;
}

export const INITIAL_DEEMED_PHASE3: DeemedPhase3Fields = {
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
  scCounterparty: "",
  scTransactionType: "gratuitous",
  scMarketValue: "",
  scConsideration: "",
  scIsDissolvingNoResidual: false,
  scRatioPct: "",
  scGroupRatioPct: "",
  // §45의3 일감몰아주기
  rcEnterpriseSize: "",
  rcTotalSalesStr: "",
  rcPreTaxAdjOperatingIncomeStr: "",
  rcTaxableIncomeStr: "",
  rcCorporateTaxNetStr: "",
  rcShowDividendDeduction: false,
  rcDistributableProfitStr: "",
  rcShareholders: [],
  rcIntermediaryCorps: [],
  rcSalesPartners: [],
  rcSelectedDoneeIndex: 0,
  scMode: "single",
  scCorporateTaxMode: "direct",
  scPriorTransactions: undefined,
  scCorpTaxAssessed: "",
  scCorpTaxLandTransfer: "",
  scCorpTaxDeduction: "",
  scCorpIncome: "",
  scTotalShares: "",
  scShareholders: undefined,
  scIntermediaryCorps: undefined,
  scSelectedDoneeIndex: 0,
  scGiftDeduction: "",
  scCorpFiscalYearEndDate: "",
  corpHonestFilingConfirm: false,
};
