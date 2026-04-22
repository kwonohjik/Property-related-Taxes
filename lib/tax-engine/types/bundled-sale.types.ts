/**
 * 일괄양도 안분(Bundled Sale Apportionment) 공개 타입
 *
 * 하나의 매매계약으로 여러 자산(예: 1세대 1주택 + 별도 필지 농지)을 양도할 때,
 * 기준시가 비율로 자산별 양도가액·취득가액·필요경비를 안분하기 위한 타입.
 *
 * 근거 조문:
 *   - 소득세법 시행령 §166 ⑥ — 양도가액 안분(기준시가 비율)
 *
 * Layer 2 (Pure Engine) 퍼블릭 타입. 엔진 본체(`../bundled-sale-apportionment.ts`)
 * 외에도 API Route / Store / UI / 테스트에서 공유되므로 본체와 분리한다.
 *
 * 다필지 안분(`../multi-parcel-transfer.ts` ParcelInput)은 **같은 토지를 면적으로
 * 안분**하는 반면, 본 모듈은 **종류가 다른 자산(주택·토지·건물 혼재)을 기준시가로
 * 안분**하는 용도이므로 별도 타입으로 둔다.
 */

/** 일괄양도 대상 자산의 종류 */
export type BundledAssetKind = "housing" | "land" | "building";

export interface BundledAssetInput {
  /** 자산 식별자 (표시·디버그용, 고유) */
  assetId: string;
  /** 자산 표시명 (예: "거주 주택", "농지 54번지") */
  assetLabel: string;
  /** 자산 종류 */
  assetKind: BundledAssetKind;
  /**
   * 양도시점 기준시가 (원) — 안분 키.
   * - 주택: 개별주택가격(또는 공동주택가격) 양도 당시 고시액
   * - 토지: 개별공시지가(원/㎡) × 면적
   * - 건물: 국세청장 고시 기준시가
   */
  standardPriceAtTransfer: number;
  /**
   * 취득시점 기준시가 (원) — 취득가액 안분용 (선택).
   * `totalAcquisitionPrice`로 취득가를 안분할 때 비율 키로 사용.
   * 미지정 시 `standardPriceAtTransfer`를 키로 사용.
   */
  standardPriceAtAcquisition?: number;
  /**
   * 자산 직접 귀속 필요경비 (원).
   * 매매 관련 공통경비(중개수수료 등)는 `commonExpenses`에 두고 비율 안분한다.
   */
  directExpenses?: number;
  /**
   * 자산별 취득가액이 상위에서 이미 확정된 경우 주입 (원).
   * 예: 상속·증여 자산의 상속개시일 보충적 평가액 등.
   * 지정 시 해당 자산은 안분 대상에서 제외되고 이 값이 그대로 `allocatedAcquisitionPrice`로 사용된다.
   */
  fixedAcquisitionPrice?: number;
  /**
   * 계약서에 구분 기재된 실제 양도가액 (원, 선택).
   * 소득세법 시행령 §166 ⑥ 본문 — 지정 시 이 자산은 양도가액 안분 대상에서 제외되고
   * 이 값이 그대로 `allocatedSalePrice`로 사용된다. 잔여 totalSalePrice는 다른
   * (fixedSalePrice가 없는) 자산들에 기준시가 비율로 안분된다.
   */
  fixedSalePrice?: number;
}

/**
 * 안분 방식.
 * v1은 양도시점 기준시가 비율 1종만 지원. 추후 감정가 비율 등 확장 가능.
 */
export type BundledApportionmentMethod = "standard_price_transfer";

export interface BundledApportionmentInput {
  /** 총 양도가액 (원, 매매계약 상 합계) */
  totalSalePrice: number;
  /**
   * 총 취득가액 (원, 선택).
   * 일괄매수 후 일괄양도인 경우 지정. 자산별 `fixedAcquisitionPrice`가 있으면 무시.
   */
  totalAcquisitionPrice?: number;
  /**
   * 공통 필요경비 (원, 선택).
   * 양도가액 비율 키로 각 자산에 배분된다.
   */
  commonExpenses?: number;
  /** 안분 대상 자산 (최소 2건) */
  assets: BundledAssetInput[];
  /** 안분 방식 (v1 고정: standard_price_transfer) */
  method?: BundledApportionmentMethod;
}

export interface BundledApportionedAsset {
  /** 입력 자산 식별자 */
  assetId: string;
  /** 입력 자산 표시명 */
  assetLabel: string;
  /** 입력 자산 종류 */
  assetKind: BundledAssetKind;
  /** 안분된 양도가액 (원) — Σ = totalSalePrice 보장 (말단 잔여값 보정) */
  allocatedSalePrice: number;
  /** 안분·확정된 취득가액 (원) */
  allocatedAcquisitionPrice: number;
  /** 안분된 공통경비 + 직접경비 합계 (원) */
  allocatedExpenses: number;
  /** 표시용 비율 (0~1, 소수 4자리 내외, 계산에는 미사용) */
  displayRatio: number;
  /** 안분에 사용한 양도시점 기준시가 (원) — 결과 참조용 passthrough */
  standardPriceAtTransfer: number;
  /** 취득시점 기준시가 (원) — 참조용 passthrough */
  standardPriceAtAcquisition?: number;
  /**
   * 양도가액 결정 방식 (결과 표시용).
   * - "actual": 계약서에 구분 기재된 실제가액 사용(§166⑥ 본문)
   * - "apportioned": 기준시가 비율 안분(§166⑥ 단서)
   */
  saleMode?: "actual" | "apportioned";
  /**
   * 매매 환산취득가 사용 여부 (결과 표시용).
   * 라우트 어댑터에서 안분 후 환산 적용 시 true.
   */
  usedEstimatedAcquisition?: boolean;
}

export interface BundledApportionmentResult {
  /** 자산별 안분 결과 (입력 순서 유지) */
  apportioned: BundledApportionedAsset[];
  /** 사용된 양도시점 기준시가 합계 (분모, fixedSalePrice 없는 자산만) */
  totalStandardAtTransfer: number;
  /**
   * 말단 잔여값을 흡수한 자산 id (원 단위 오차 보정 대상).
   * 모든 자산이 fixedSalePrice인 경우 안분 자체가 없으므로 null.
   */
  residualAbsorbedBy: string | null;
  /** 법적 근거 조문 (legal-codes/transfer.ts BUNDLED_APPORTIONMENT) */
  legalBasis: string;
  /** 안분 경고 (0 기준시가 자산, 합계 불일치 경고 등) */
  warnings: string[];
}
