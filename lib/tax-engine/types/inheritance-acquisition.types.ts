/**
 * 상속·증여 자산 취득가액 산정(Inheritance Acquisition Price) 공개 타입
 *
 * 양도소득세 계산 시 상속·증여로 취득한 자산의 취득가액은 해당 자산의
 * 상속개시일(또는 증여일) 현재 상속세및증여세법(상증법)상 평가가액으로 본다.
 *
 * 근거 조문:
 *   - 소득세법 §97 — 양도소득 필요경비 (취득가액)
 *   - 소득세법 시행령 §163 ⑨ — 상속·증여 자산의 취득가액 의제
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

export interface InheritanceAcquisitionInput {
  /** 상속개시일 (또는 증여일) — 직전 공시가격 선택 기준 */
  inheritanceDate: Date;
  /** 자산 종류 */
  assetKind: InheritanceAssetKind;
  /** 토지 면적 (㎡) — assetKind === "land"일 때 필수 */
  landAreaM2?: number;
  /**
   * 상속개시일 직전 공시된 단가 또는 공시가격 (원).
   * - land: 개별공시지가 (원/㎡)
   * - house_individual: 개별주택가격 (원, 총액)
   * - house_apart: 공동주택가격 (원, 총액)
   */
  publishedValueAtInheritance: number;
  /**
   * 시가 (원, 선택).
   * 유사 매매사례가액·감정가·공매가액 등 시가로 인정되는 금액.
   * 지정 시 보충적평가보다 우선 적용.
   */
  marketValue?: number;
  /**
   * 감정평가액 평균 (원, 선택).
   * 상증법 §60 ⑤: 평가기간 내 2개 이상 감정평가 평균.
   * 시가가 없고 감정가가 있으면 이를 취득가액으로 본다.
   */
  appraisalAverage?: number;
}

export type InheritanceAcquisitionMethod =
  | "market_value"
  | "appraisal"
  | "supplementary";

export interface InheritanceAcquisitionResult {
  /** 최종 취득가액 (원) */
  acquisitionPrice: number;
  /** 선택된 산정방법 */
  method: InheritanceAcquisitionMethod;
  /** 상증법·소득세법 근거 */
  legalBasis: string;
  /** 계산 산식 설명 (표시용) */
  formula: string;
}
