/**
 * 상속·증여 자산 취득가액 산정(Inheritance Acquisition Price) 공개 타입
 *
 * 양도소득세 계산 시 상속·증여로 취득한 자산의 취득가액은 해당 자산의
 * 상속개시일(또는 증여일) 현재 상속세및증여세법(상증법)상 평가가액으로 본다.
 *
 * 근거 조문:
 *   - 소득세법 §97 — 양도소득 필요경비 (취득가액)
 *   - 소득세법 시행령 §163 ⑨ — 상속·증여 자산의 취득가액 의제
 *   - 소득세법 시행령 §176조의2 ④ — 의제취득일 전 상속: max(환산가액, 취득실가×물가상승률)
 *   - 상증법 §60 — 평가의 원칙 (시가주의 + 보충적평가액)
 *   - 상증법 §61 ~ §66 — 부동산 등 보충적평가방법
 *
 * 평가 우선순위 (시가주의 원칙):
 *   1. 시가 (marketValue) — 유사 매매사례가액·공매·경매·감정가 등
 *   2. 2개 이상 감정평가액 평균 (appraisalAverage)
 *   3. 보충적평가액 (supplementary) — 공시가격 기반
 *      - 토지: 개별공시지가(원/㎡) × 면적
 *      - 주택: 개별주택가격 또는 공동주택가격
 */

/** 평가 대상 자산 종류 */
export type InheritanceAssetKind = "land" | "house_individual" | "house_apart";

/**
 * 의제취득일(1985.1.1.) — 소득세법 부칙(1985.1.1. 개정)
 * 1984.12.31. 이전에 취득한 자산은 이 날짜에 취득한 것으로 간주한다.
 */
export const DEEMED_ACQUISITION_DATE = new Date("1985-01-01T00:00:00.000Z");

/**
 * 취득가액 산정 방법
 *
 * 의제취득일 전 상속:
 *   - pre_deemed_max: max(환산가액, 취득실가×물가상승률) — 소령 §176조의2 ④
 *
 * 의제취득일 이후 상속 / 일반 상속:
 *   - market_value:      매매사례가액 (시가, 상증법 §60 ①)
 *   - appraisal:         감정평가액 평균 (상증법 §60 ⑤)
 *   - auction_public_sale: 수용·경매·공매가액 (상증법 §60 ②)
 *   - similar_sale:      유사매매사례가액 (상증법 시행령 §49)
 *   - supplementary:     보충적평가액 (상증법 §61)
 */
export type InheritanceAcquisitionMethod =
  | "market_value"          // 매매사례 (시가)
  | "appraisal"             // 감정평가
  | "auction_public_sale"   // 수용·경매·공매
  | "similar_sale"          // 유사매매사례
  | "supplementary"         // 보충적평가
  | "pre_deemed_max";       // 의제취득일 전 max(환산, 실가×CPI)

export interface InheritanceAcquisitionInput {
  /** 상속개시일 (의제취득일 분기 기준) */
  inheritanceDate: Date;

  /** 자산 종류 */
  assetKind: InheritanceAssetKind;

  // ── 보충적평가 보조 입력 ──

  /** 토지 면적 (㎡) — assetKind === "land"일 때 필수 */
  landAreaM2?: number;

  /**
   * 상속개시일 직전 공시된 단가 또는 공시가격 (원).
   * - land: 개별공시지가 (원/㎡)
   * - house_individual: 개별주택가격 (원, 총액)
   * - house_apart: 공동주택가격 (원, 총액)
   */
  publishedValueAtInheritance?: number;

  /**
   * 시가 (원, 선택).
   * 유사 매매사례가액·감정가·공매가액 등 시가로 인정되는 금액.
   * 지정 시 보충적평가보다 우선 적용.
   */
  marketValue?: number;

  /**
   * 감정평가액 평균 (원, 선택).
   * 상증법 §60 ⑤: 평가기간 내 2개 이상 감정평가 평균.
   */
  appraisalAverage?: number;

  // ── 의제취득일 이후 상속 (case B): 상속세 신고가액 ──

  /**
   * 상속세 신고 시 평가가액 (원).
   * 신고한 평가방법에 따른 금액을 그대로 취득가액으로 한다.
   */
  reportedValue?: number;

  /** 신고 시 적용한 평가방법 */
  reportedMethod?: InheritanceAcquisitionMethod;

  // ── 의제취득일 전 상속 (case A): 환산가액 + 물가상승률 ──

  /** 피상속인 취득일 — 물가상승률 산정 기준 */
  decedentAcquisitionDate?: Date;

  /** 피상속인 실지취득가액 (원) — 입증 가능한 경우만 입력 */
  decedentActualPrice?: number;

  /** 양도일 — CPI 비율 분자 시점 */
  transferDate?: Date;

  /** 양도가액 (원) — 환산취득가 공식의 분자 */
  transferPrice?: number;

  /**
   * 의제취득일(1985.1.1.) 시점 기준시가 (원).
   * 토지: 1990.8.30. 이전 토지등급가액 환산 결과 또는 직접 입력.
   * 건물: 국세청 기준시가.
   */
  standardPriceAtDeemedDate?: number;

  /** 양도시 기준시가 (원) */
  standardPriceAtTransfer?: number;
}

/** 의제취득일 전 상속(case A) 계산 내역 */
export interface PreDeemedBreakdown {
  /** 환산취득가: 양도가 × (의제취득일 기준시가 ÷ 양도시 기준시가) */
  convertedAmount: number;
  /** 취득실가 × 물가상승률 (null = 피상속인 실가 미입증) */
  inflationAdjustedAmount: number | null;
  /** 선택된 방법 */
  selectedMethod: "converted" | "inflation_adjusted";
  /** 피상속인 취득 연도 */
  cpiFromYear: number;
  /** 양도 연도 */
  cpiToYear: number;
  /** 물가상승률 비율 (양도시 CPI ÷ 취득시 CPI) */
  cpiRatio: number;
}

export interface InheritanceAcquisitionResult {
  /** 최종 취득가액 (원) */
  acquisitionPrice: number;
  /** 선택된 산정방법 */
  method: InheritanceAcquisitionMethod;
  /** 상증법·소득세법 근거 */
  legalBasis: string;
  /** 계산 산식 설명 (UI 표시용) */
  formula: string;
  /** 의제취득일 전 상속(case A) 비교 내역 */
  preDeemedBreakdown?: PreDeemedBreakdown;
  /** 경고 메시지 (CPI 범위 외, 입력 누락 fallback 등) */
  warnings?: string[];
}
