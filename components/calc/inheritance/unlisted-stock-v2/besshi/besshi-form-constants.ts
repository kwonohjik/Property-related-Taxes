/**
 * besshi-form-constants — 별지 부표3 제1쪽 양식 단일 출처 상수 (2025.07.10 개정)
 *
 * 화면(`Page1CoverSection.tsx`)과 PDF(`lib/pdf/UnlistedStockBesshiPdfDocument.tsx`)가
 * 동일한 셀 라벨·사유 6행 정의를 import 재사용 → 양식 개정 시 한 곳만 수정(재드리프트 방지).
 *
 * Plan: docs/00-pm/inheritance-besshi-pdf-2025-revision-parity.plan.md §2.1 (C2)
 * 법령: 상증령 §54④ (순자산가치 단독 평가 사유) · 상증법 §63③ (최대주주 할증)
 *
 * M-6 수정 (2026-06-04):
 *   BESSHI_P2_LIABILITY_ROWS에 보험준비금 3필드 가산 추가.
 *   공식 양식 ⑨~⑱에 전용 행 번호 없음(§17의2 4호 단서 나·다) → ⑮ 아래 가산 항목으로 흡수.
 *   sumNetAssetRows(BESSHI_P2_LIABILITY_ROWS) = 엔진 calcNetAssetTotal.totalLiabilities 정합.
 *   보험사 입력 시 다(⑧−⑲) = 엔진 netAssetBeforeGoodwill → 마(다+라) 자기일관 성립.
 */

import type {
  UnlistedNetAssetOnlyReason,
  FiscalYearBreakdown,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ─────────────────────────────────────────────────────────────────
// 2번 — 순자산가치로만 평가하는 경우 [v] (상증령 §54④) 6행 (가~바)
//   다(3호)는 2018.2.13. 삭제 — 회색 비활성 표시
// ─────────────────────────────────────────────────────────────────
export interface NetAssetReasonRow {
  code: string;
  label: string;
  reason?: UnlistedNetAssetOnlyReason;
  deleted?: boolean;
}

export const NET_ASSET_REASON_ROWS: NetAssetReasonRow[] = [
  { code: "가", label: "신고기한 내 청산절차 진행·사업계속 곤란 (1호)", reason: "liquidation" },
  { code: "나", label: "사업개시 전·3년 미만·휴업·폐업 (2호)", reason: "lt3y" },
  { code: "다", label: "3년 연속 결손금 (2018.2.13. 삭제)", deleted: true },
  { code: "라", label: "자산총액 중 부동산 80% 이상 (3호)", reason: "real_estate_80" },
  { code: "마", label: "자산총액 중 주식 등 80% 이상 (5호)", reason: "stock_holding_80" },
  { code: "바", label: "잔여 존속기한 3년 이내 (6호)", reason: "remaining_3y" },
];

// ─────────────────────────────────────────────────────────────────
// 3번 — 1주당 가액의 평가 셀 라벨 (공식 2025.07.10 순서·문구)
//   공식 양식: ⑥(헤더 "많은 금액") → ㉮(가중평균) → ㉯(80%),
//             ⑦(헤더) → ㉮(⑥×할증율) → ㉯(⑥+㉮)
// ─────────────────────────────────────────────────────────────────
export const BESSHI_P1_SECTION3 = {
  /** ③ 순자산가액 — 제2쪽 4.마 */
  netAssetTotal: "순자산가액 (제2쪽 4.마)",
  /** ④ 1주당 순자산가액 (③ ÷ ①) */
  netAssetPerShare: "1주당 순자산가액 (③ ÷ ①)",
  /** ⑤ 공식 장문 라벨 — 제6쪽 7.차 */
  netIncomeValue:
    "최근 3년간 순손익액의 가중평균액에 의한 1주당가액 또는 2 이상의 신용평가전문기관(회계법인 포함)이 산출한 1주당 추정이익의 평균액 (제6쪽 7.차)",
  /** ⑥ 헤더 — ㉮·㉯ 중 많은 금액 (㉮·㉯ 위에 배치) */
  finalPerShareHeader: "1주당 평가액 (㉮·㉯ 중 많은 금액)",
  /** ⑥㉮ 가중평균 — 일반 */
  weightedAvgNormal: "[{(④×2)+(⑤×3)}÷5]",
  /** ⑥㉮ 가중평균 — 부동산과다보유법인 병기 각주 */
  weightedAvgRealEstateNote: "* 부동산과다보유법인 [{(④×3)+(⑤×2)}÷5]",
  /** ⑥㉯ 80% 하한 */
  netAssetFloor80: "1주당 순자산가액(④)의 80%",
  /** ⑦ 헤더 — 최대주주등 해당 시 */
  maxShareholderHeader: "최대주주등에 해당하는 경우 1주당 평가액",
  /** ⑦㉮ 할증분 (⑥ × 할증율) */
  premiumSurcharge: (pct: string) => `최대주주등의 주식등의 1주당 평가액 (⑥ × 할증율 ${pct}%)`,
  /** ⑦㉯ (⑥ + ㉮) */
  premiumTotal: "(⑥ + ㉮)",
  /** ⑦ 비최대주주 분기 */
  nonMaxShareholder: "최대주주 해당 없음 (⑥ 적용)",
  /** ⑨ 보충적 평가가액 */
  reportingValue: "보충적 평가가액",
  /** 총 상속재산가액 (⑨ × 보유주식수) */
  total: (shares: string) => `상속재산가액 (⑨ × 보유주식수 ${shares}주)`,
} as const;

// ─────────────────────────────────────────────────────────────────
// 제2쪽 — 4. 순자산가액 (공식 2025.07.10 양식 단일 출처)
//   상증령 §55① + §17의2. ⑮(기타 충당금)은 §17의2 3호 가 → 가산(차감 아님).
//   ⑲ 소계 = ⑨+⑩+⑪+⑫+⑬+⑭+⑮ − ⑯ − ⑰ − ⑱  (2025.07.10 양식)
// ─────────────────────────────────────────────────────────────────

/**
 * 순자산가액 행이 참조하는 raw 숫자 필드 (배열·메타 필드 제외).
 *
 * M-6: 보험준비금 3필드 추가 — §17의2 4호 단서 나목(법인세법 §30·§31)·다목(법인세법 §32).
 *   공식 양식에 전용 행 번호 없음 → BESSHI_P2_LIABILITY_ROWS에 가산 항목으로 흡수.
 *   sumNetAssetRows 함수의 raw 파라미터 타입이 자동 확장됨.
 */
export type NetAssetNumericField =
  | "bsTotalAssets" | "assetValuationDelta" | "corpTaxReservedAmount"
  | "paidInCapitalIncrease" | "otherEarnedRights" | "prepaidExpenses" | "preGiftRetainedEarnings"
  | "bsTotalLiabilities" | "corporateTaxPayable" | "farmingSurtax" | "localIncomeTax"
  | "dividendPayable" | "retirementProvision" | "otherProvision"
  | "reserveExcluded" | "allowanceExcluded" | "deferredTaxAdjustment"
  /** M-6: 보험준비금 3필드 (§17의2 4호 단서 나·다 — 보험사만 해당, 미해당 시 undefined→0) */
  | "insuranceReservePolicy" | "insuranceExtraordinaryReserve" | "insuranceSurrenderReserve";

export interface NetAssetRowDef {
  cellNum: string;
  /** raw 데이터 필드 (화면·PDF 공통 매핑) */
  field: NetAssetNumericField;
  /** 항목 라벨 (공식 문구) */
  label: string;
  /** 회색 참조열 문구 (②·라만) — 그 외 빈칸 */
  ref?: string;
  /** 산식 차감 항목(⑥⑦⑯⑰⑱). ⑮은 가산이므로 false */
  isSubtract?: boolean;
}

/** 가. 자산총액 ①~⑦ */
export const BESSHI_P2_ASSET_ROWS: NetAssetRowDef[] = [
  { cellNum: "①", field: "bsTotalAssets", label: "재무상태표상의 자산가액" },
  { cellNum: "②", field: "assetValuationDelta", label: "평가차액", ref: "제4쪽 5. 평가차액 「가」" },
  { cellNum: "③", field: "corpTaxReservedAmount", label: "법인세법상 유보금액" },
  { cellNum: "④", field: "paidInCapitalIncrease", label: "유상증자 등" },
  { cellNum: "⑤", field: "otherEarnedRights", label: "기타(평가기준일 현재 지급받을 권리가 확정된 가액 등)" },
  { cellNum: "⑥", field: "prepaidExpenses", label: "선급비용 등", isSubtract: true },
  { cellNum: "⑦", field: "preGiftRetainedEarnings", label: "증자일 전의 잉여금의 유보액", isSubtract: true },
];

/**
 * 나. 부채총액 ⑨~⑱ (⑮ 가산) + 보험준비금 3항목 (M-6 추가)
 *
 * 보험준비금 (§17의2 4호 단서 나·다목):
 *   공식 양식(2025.07.10)에 전용 행 번호 없음 → ⑲ 소계 가산 항목으로 흡수.
 *   비보험사(undefined)는 sumNetAssetRows에서 0 처리 → 기존값 불변.
 *   엔진 calcNetAssetTotal(totalLiabilities) = sumNetAssetRows(BESSHI_P2_LIABILITY_ROWS) 정합.
 *   라벨은 §17의2 4호 단서 나목·다목 법령 문구 기반 (추정 금지).
 */
export const BESSHI_P2_LIABILITY_ROWS: NetAssetRowDef[] = [
  { cellNum: "⑨", field: "bsTotalLiabilities", label: "재무상태표상의 부채액" },
  { cellNum: "⑩", field: "corporateTaxPayable", label: "법인세" },
  { cellNum: "⑪", field: "farmingSurtax", label: "농어촌특별세" },
  { cellNum: "⑫", field: "localIncomeTax", label: "지방소득세" },
  { cellNum: "⑬", field: "dividendPayable", label: "배당금·상여금" },
  { cellNum: "⑭", field: "retirementProvision", label: "퇴직급여추계액" },
  { cellNum: "⑮", field: "otherProvision", label: "기타(충당금 중 평가기준일 현재 비용으로 확정된 것 등)" },
  { cellNum: "⑯", field: "reserveExcluded", label: "제준비금", isSubtract: true },
  { cellNum: "⑰", field: "allowanceExcluded", label: "제충당금", isSubtract: true },
  { cellNum: "⑱", field: "deferredTaxAdjustment", label: "기타(이연법인세대 등)", isSubtract: true },
  /**
   * 보험준비금 — §17의2 4호 단서 나목(법인세법 §30·§31)·다목(법인세법 §32)
   * 공식 양식에 행 번호 미부여 → ⑲ 소계 직산 가산. 비보험사(undefined)는 0.
   * 라벨에 법령 근거 명시 (양식 미부여 사실 포함).
   */
  { cellNum: "*", field: "insuranceReservePolicy", label: "책임준비금 (§17의2 4호 단서 나·다 / 보험사 한정)" },
  { cellNum: "*", field: "insuranceExtraordinaryReserve", label: "비상위험준비금 (§17의2 4호 단서 나·다 / 보험사 한정)" },
  { cellNum: "*", field: "insuranceSurrenderReserve", label: "해약환급금준비금 (§17의2 4호 단서 다 / 보험회사 한정)" },
];

/** 제2쪽 헤더·소계·다·라·마 라벨 (공식 2025.07.10 문구) */
export const BESSHI_P2_SECTION4 = {
  header: "4. 순자산가액",
  unitNote: "(단위 : 원)",
  pageNote: "(제2쪽)",
  assetGroup: "가. 자산총액",
  liabilityGroup: "나. 부채총액",
  /** ⑧ 소계 산식 */
  assetSubtotalFormula: "소계 (①+②+③+④+⑤−⑥−⑦)",
  /** ⑲ 소계 산식 (⑮ 가산) */
  liabilitySubtotalFormula: "소계 (⑨+⑩+⑪+⑫+⑬+⑭+⑮−⑯−⑰−⑱)",
  /** 다 영업권 포함 전 순자산가액 */
  preGoodwillLabel: "영업권포함전 순자산가액(⑧-⑲)",
  /** 라 영업권 + 회색 참조 */
  goodwillLabel: "영업권",
  goodwillRef: "제5쪽 6. 영업권 「자」",
  /** 마 순자산가액 */
  netAssetLabel: "순자산가액 (다 + 라)",
} as const;

/**
 * 순자산가액 행 합계 — isSubtract면 차감, 그 외 가산.
 * 화면·PDF·엔진(`net-asset-calc`) 부호를 단일 정의로 일치 (⑮ 가산 드리프트 방지).
 *
 * M-6: raw 타입을 `Partial<Record<NetAssetNumericField, number>>` 허용으로 확장.
 *   보험준비금 3필드가 UnlistedNetAssetCalculation에서 optional이므로 undefined는 0 처리.
 *   비보험사 케이스에서 기존값 불변.
 */
export function sumNetAssetRows(
  rows: NetAssetRowDef[],
  raw: Partial<Record<NetAssetNumericField, number>>,
): number {
  return rows.reduce((acc, r) => acc + (r.isSubtract ? -(raw[r.field] ?? 0) : (raw[r.field] ?? 0)), 0);
}

// ─────────────────────────────────────────────────────────────────
// 제4쪽 — 5. 평가차액 (공식 2025.07.10 양식 단일 출처)
//   상증령 §55② + 상증규 §17의2. 좌우 2블록(자산금액 │ 부채금액), 각 4열.
//   가. 평가차액 = ① 자산 차액 합 − ② 부채 차액 합 → 제2쪽 4. 순자산가액 「가」의 ② 기재.
// ─────────────────────────────────────────────────────────────────
export const BESSHI_P4_SECTION5 = {
  header: "5. 평가차액",
  unitNote: "(단위 : 원)",
  pageNote: "(제4쪽)",
  /** 헤더 바 좌 */
  calcTitle: "가. 평가차액 계산 (① − ②)",
  /** 헤더 바 우 — 제2쪽으로의 cross-reference */
  crossRef: "제2쪽 4. 순자산가액 「가」의 ② 기재",
  assetBlock: "자산금액",
  liabilityBlock: "부채금액",
  /** 각 블록 4열 헤더 */
  columns: ["계정과목", "상증법에 따른 평가액", "재무상태표상 금액", "차액"] as const,
  /** 합계 행 (맨 위) */
  assetTotalLabel: "① 합계",
  liabilityTotalLabel: "② 합계",
  /** 가. 평가차액 값 라벨 */
  deltaLabel: "가. 평가차액 (① − ②)",
  /** 총액 fallback 입력 시 안내 (행 단위 명세 없음) */
  totalModeNote: "총액 입력 — 계정과목별 명세 없음, 평가차액은 제2쪽 ②에 반영",
  /** 작성방법 푸터 */
  guideTitle: "작 성 방 법",
  guideBody:
    "평가기준일 또는 직전사업연도말 현재의 재무상태표의 자산 또는 부채금액을 기준으로 하여 순자산가액을 계산 시 재무상태표상 미계상된 경우를 포함한 평가차액을 계산하는 경우에 사용합니다.",
  guideItems: [
    "계정과목란에는 평가대상 자산 또는 부채를 재무상태표에 기재된 계정명으로 기입하며 재무상태표상 미계상된 경우에는 추가로 기재합니다.",
    "평가차액은 「①」에서 「②」를 차감한 잔액을 기재합니다.",
  ] as const,
  /** 빈 양식 시 표시할 빈 행 수 (템플릿) */
  emptyTemplateRows: 5,
} as const;

// ─────────────────────────────────────────────────────────────────
// 제5쪽 — 6. 영업권 (공식 2025.07.10 양식 단일 출처)
//   상증령 §59② + §55③ + 상증규 §19①. 3열 [라벨][금액][산식·참조·회색].
//   col2(금액): 가/①②③/나/다/마/사/아/자. 라·바는 빈칸(파라미터 → col3).
//   col3: 가=가중평균 산식 / 라=이자율 / 바=지속연수 / 자=cross-ref / 그 외 회색 빈칸.
// ─────────────────────────────────────────────────────────────────
export const BESSHI_P5_SECTION6 = {
  header: "6. 영업권",
  unitNote: "(단위 : 원)",
  pageNote: "(제5쪽)",
  // col1 라벨 (공식 문구) — ①②③은 연도 annotation을 컴포넌트에서 부착
  weightedAvgLabel: "평가기준일 이전 3년간 순손익액의 가중평균액",
  fy1Label: "평가기준일 이전 1년이 되는 사업연도 순손익액",
  fy2Label: "평가기준일 이전 2년이 되는 사업연도 순손익액",
  fy3Label: "평가기준일 이전 3년이 되는 사업연도 순손익액",
  halfLabel: "가 × 50%",
  selfCapitalLabel: "평가기준일 현재 자기자본",
  rateLabel: "기획재정부령이 정하는 이자율",
  selfCapitalRateLabel: "다 × 라",
  durationLabel: "영업권 지속연수",
  goodwillCalcLabel: "영업권 계산액",
  goodwillCalcFormula: "Σⁿ₌₁ⁿ [ (나 − 마) / (1 + 0.1)ⁿ ]",
  goodwillCalcNote: "n은 평가기준일부터의 경과연수",
  intangibleLabel:
    "영업권 상당액에 포함된 매입한 무체재산권가액 중 평가기준일까지의 감가상각비를 공제한 금액",
  finalLabel: "영업권 평가액 (사 − 아)",
  // col3 정적 문구
  weightedAvgFormula: "(① × 3 + ② × 2 + ③) / 6",
  finalCrossRef: "제2쪽 4. 순자산가액 「라」 기재",
  // col3 동적 포맷터
  ratePct: (rate: number) => `${(rate * 100).toFixed(0)}%`,
  durationLabel2: (years: number) => `${years}년`,
} as const;

// ─────────────────────────────────────────────────────────────────
// 제6쪽 — 7. 순손익액 (공식 2025.07.10 양식 단일 출처)
//   상증령 §56④ (가산 ②~⑦ / 차감 ⑧~㉒) · §59 · 상증규 §17. 화면·PDF 공유.
//   라벨은 이미지26 공식 문구. key = FiscalYearBreakdown echo 필드.
// ─────────────────────────────────────────────────────────────────
export interface NetIncomeAdjustmentRow {
  num: string;
  label: string;
  key: keyof FiscalYearBreakdown;
}

/** 소득에 가산할 금액 (②~⑦) — §56④ 1호 */
export const P6_ADD_ROWS: NetIncomeAdjustmentRow[] = [
  { num: "②", label: "국세, 지방세 과오납에 대한 환급금이자", key: "addRefundInterest" },
  { num: "③", label: "수입배당금 중 익금불산입액", key: "addLossFromDividend" },
  { num: "④", label: "이월된 기부금 손금산입액", key: "addCarriedDonation" },
  { num: "⑤", label: "이월된 업무용승용차 관련 손금산입액", key: "addCarriedCarPayment" },
  { num: "⑥", label: "외화환산이익(법인세 계산시 해당 이익을 반영하지 않은 경우)", key: "addForexValuationGain" },
  { num: "⑦", label: "그 밖에 기획재정부령으로 정하는 금액", key: "addOtherByOrdinance" },
];

/** 소득에서 차감할 금액 (⑧~㉒) — §56④ 2호 */
export const P6_SUB_ROWS: NetIncomeAdjustmentRow[] = [
  { num: "⑧", label: "당해 사업연도의 법인세액", key: "subCorporateTax" },
  { num: "⑨", label: "법인세액의 감면액 또는 과세표준에 부과되는 농어촌특별세액, 지방소득세액", key: "subAdditionalTaxes" },
  { num: "⑩", label: "벌금, 과료, 과태료, 가산금 및 강제징수비 손금불산입액", key: "subFines" },
  { num: "⑪", label: "법령에 따라 의무적으로 납부하는 것이 아닌 공과금 손금불산입액", key: "subCompulsoryPublicCharges" },
  { num: "⑫", label: "징벌적 목적의 손해배상금 등에 대한 손금불산입액", key: "subPunitiveDamages" },
  { num: "⑬", label: "각 세법에서 규정하는 징수불이행으로 인해 납부하였거나 납부할 세액", key: "subWithholdingPenalty" },
  { num: "⑭", label: "과다경비 등의 손금불산입액", key: "subExcessiveExpenses" },
  { num: "⑮", label: "기부금 손금불산입액", key: "subDonationExcess" },
  { num: "⑯", label: "기업업무추진비 손금불산입액", key: "subEntertainmentExcess" },
  { num: "⑰", label: "업무와 관련 없는 비용 손금불산입액", key: "subNonBusinessExpenses" },
  { num: "⑱", label: "업무용승용차 관련 비용의 손금불산입액", key: "subNonBusinessCarExpenses" },
  { num: "⑲", label: "지급이자의 손금불산입액", key: "subInterestPayment" },
  { num: "⑳", label: "감가상각비 시인부족액에서 상각부인액을 손금으로 추인한 금액을 뺀 금액", key: "subDepreciationShortage" },
  { num: "㉑", label: "외화환산손실(법인세 계산시 해당 손실을 반영하지 않은 경우)", key: "subForexValuationLoss" },
  { num: "㉒", label: "그 밖에 기획재정부령으로 정하는 금액", key: "subOtherByOrdinance" },
];

export const BESSHI_P6_SECTION7 = {
  header: "7. 순손익액",
  unitNote: "(단위 : 원)",
  pageNote: "(제6쪽)",
  fyHeaderLabel: "평가기준일 1년, 2년, 3년이 되는 사업연도",
  incomeLabel: "① 각 사업연도 소득금액",
  addGroupLabel: "소득에 가산할 금액",
  subGroupLabel: "소득에서 차감할 금액",
  addSubtotalLabel: "가. 소계(① + ② + …⑦)",
  subSubtotalLabel: "나. 소계(⑧ + …㉒)",
  netLabel: "다. 순손익액(가 - 나)",
  capAdjLabel: "라. 유상증(감)자시 반영액",
  finalLabel: "마. 순손익액(다 ± 라)",
  sharesLabel: "바. 사업연도말 주식수 또는 환산주식수",
  perShareLabel: "사. 주당순손익액 (마 ÷ 바)",
  perShareMarkers: ["㉓", "㉔", "㉕"] as const,
  weightedAvgLabel: "아. 가중평균액  {(㉓ × 3 + ㉔ × 2 + ㉕) / 6}",
  rateLabel: "자. 기획재정부령이 정하는 율",
  finalPerShareLabel: "차. 최근 3년간 순손익액의 가중평균액에 의한 1주당 가액 (아÷자)",
} as const;

/**
 * 자본금 표시값 fallback — 명시 입력값(capital)이 없으면 액면가 × 발행주식총수로 도출.
 * 입력 폼(CorporateInfoSection)의 capitalDisplay와 동일 로직 → 화면·PDF·입력 3곳 일관.
 * (store에는 쓰지 않는 display fallback — mirror-pattern. capital은 평가 산식 미사용 표시 전용.)
 * @returns 표시할 자본금(원). 도출 불가 시 undefined.
 */
export function resolveCapitalDisplay(
  capital: number | undefined,
  faceValuePerShare: number,
  totalShares: number,
): number | undefined {
  if (capital && capital > 0) return capital;
  if (faceValuePerShare > 0 && totalShares > 0) return faceValuePerShare * totalShares;
  return undefined;
}
