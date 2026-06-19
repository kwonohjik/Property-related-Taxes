/**
 * 상속세 물납(§73) 타입 — 상증법 §73 / 상증령 §73·§74
 * 설계: docs/02-design/features/inheritance-payment-in-kind.engine.design.md §3
 *
 * 결정세액 미영향 납부방법 투영. inheritance-gift.types.ts에서 re-export(800줄 정책).
 * 분모 확정(조심2016서3563·2024중4490): estateBase = grossEstateValue − exemptAmount + priorGiftToHeirTotal.
 */

/** 물납 충당재산 가액 — estate 자동도출 + 관리처분 보정 후. 엔진은 계산만. */
export interface PaymentInKindAssets {
  /** §74①1호 국내소재 부동산 (상속인 거주주택 heirResidenceValue 포함 — 요건1 분자) */
  realEstateValue: number;
  /** §74①2호 충당가능 유가증권 = 국채·공채·내국법인채권 + 처분제한 상장 (분류 자동화는 후속 — §73①3호 금융재산 정의 검증 필요) */
  eligibleSecuritiesValue: number;
  /** §74②5호 비상장주식 (§73④ 캡·최후순위) */
  unlistedStockValue: number;
  /** §73①2호 차감 — 처분제한 없는 거래소 상장 유가증권 */
  tradableListedValue: number;
  /** §73⑤ 금융재산 순액 (금융회사 채무 차감) */
  netFinancialValue: number;
  /** §73④ 차감 — 상속개시일 현재 상속인 거주 주택·부수토지 (담보채무 차감) */
  heirResidenceValue: number;
  /** §73③·§71 관리처분 부적당으로 청구액에서 제외할 부동산·유가증권 가액 (보정 입력) */
  ineligibleManagementValue: number;
}

export interface PaymentInKindInput {
  /** 상속세 납부세액 = 산출세액 − 세액공제 (result.finalTax) — 조심2016서3563 */
  finalTax: number;
  /** 본래+간주 상속재산 평가액 (result.grossEstateValue, 비과세 차감 前) */
  grossEstateValue: number;
  /** 비과세재산 (result.exemptAmount) — 분모 차감 */
  exemptAmount: number;
  /** 상속인·수유자 사전증여 §13 (result.priorGiftToHeirTotal echo) — 분모·1/2 요건 가산 */
  priorGiftToHeirTotal: number;
  /** 상속세 과세가액 (result.taxableEstateValue) — §73④ 비상장 캡 기준 (채무 차감 後) */
  taxableEstateValue: number;
  assets: PaymentInKindAssets;
  /** 사용자 희망 물납액 (미입력 시 허용한도로 안내) */
  requestedAmount?: number;
}

export interface PaymentInKindRequirement {
  /** 충당가능 부동산·유가증권 합 (§73③ 제외 반영) */
  realEstateSecuritiesValue: number;
  /** estateBase × 1/2 */
  halfThreshold: number;
  /** 요건1 — §73①1호 */
  meetsOverHalf: boolean;
  /** 20,000,000 */
  taxThreshold: number;
  /** 요건2 — §73①2호 */
  meetsTaxOver20M: boolean;
  /** 금융재산 순액 */
  financialValue: number;
  /** 요건3 — §73①3호 */
  meetsTaxOverFinancial: boolean;
}

export interface FillOrderStep {
  /** 1..6 (§74②) */
  order: number;
  label: string;
  /** 해당 단계 가용 충당재산 가액 */
  availableValue: number;
  note?: string;
}

export interface PaymentInKindResult {
  /** 3요건 모두 충족 */
  eligible: boolean;
  requirement: PaymentInKindRequirement;
  /** 해당 상속재산가액(분모) = gross − 비과세 + 사전증여(상속인) — echo, §1.3 */
  estateBase: number;
  /** 1호: floor(finalTax × 충당가능부동산유가증권 / estateBase) */
  limit1: number;
  /** 2호: max(0, finalTax − 순금융 − 처분제한제외상장) */
  limit2: number;
  /** min(limit1, limit2) ≥ 0 */
  allowedLimit: number;
  /** §73④ 비상장 별도 캡 (기준=taxableEstateValue) */
  unlistedStockCap: number;
  /** §74② 충당순서 6단계 */
  fillOrder: FillOrderStep[];
  requestedAmount?: number;
  /** min(requestedAmount, allowedLimit) — 별지9호 ㊵ 표시값 */
  acceptedRequest?: number;
  warnings: string[];
}
