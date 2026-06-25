/**
 * 증여로 보는 경우 — 폼 상태 타입 + 초기값.
 * shared.tsx에서 분리(800줄 정책). shared.tsx가 re-export하여 하위호환 유지.
 */
import type { DeemedGiftType } from "@/lib/tax-engine/gift-deemed/types";

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
  // 감자 §39의2
  cdCaseType: "low" | "high"; // 저가소각(①1호) / 고가소각(①2호)
  cdSharePrice: string;
  cdRedemptionPrice: string;
  cdTotalShares: string;
  cdMajorRatioPct: string; // 대주주등 감자후 지분비율 (%)
  cdRelatedShares: string;
  cdOwnRedeemedShares: string; // high 해당 주주등 감자 주식수
  // 현물출자 §39의3
  conCaseType: "low" | "high"; // 저가인수(①1호) / 고가인수(①2호)
  conPrePrice: string;
  conPreShares: string;
  conNewPrice: string;
  conContributedShares: string;
  conAllocatedShares: string;
  conRelatedRatioPct: string; // high 현물출자자 특수관계인 지분비율 (%)
  conSmallImputation: boolean; // 저가 §39의3② 소액주주 1인 의제
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
  // 초과배당 §41의2
  edExcessDividend: string;
  edIncomeTax: string;
  // 상장이익 §41의3 / 합병상장 §41의5
  lgEventType: "listing" | "merger";
  lgSettlementPrice: string;
  lgAcqValue: string;
  lgCorpGrowth: string;
  lgShares: string;
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
  // 특정법인 §45의5
  scTransactionBenefit: string;
  scCorporateTax: string;
  scRatioPct: string;
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
  cdCaseType: "low",
  cdSharePrice: "",
  cdRedemptionPrice: "",
  cdTotalShares: "",
  cdMajorRatioPct: "",
  cdRelatedShares: "",
  cdOwnRedeemedShares: "",
  conCaseType: "low",
  conPrePrice: "",
  conPreShares: "",
  conNewPrice: "",
  conContributedShares: "",
  conAllocatedShares: "",
  conRelatedRatioPct: "",
  conSmallImputation: false,
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
  edExcessDividend: "",
  edIncomeTax: "",
  lgEventType: "listing",
  lgSettlementPrice: "",
  lgAcqValue: "",
  lgCorpGrowth: "",
  lgShares: "",
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
  scTransactionBenefit: "",
  scCorporateTax: "",
  scRatioPct: "",
};
