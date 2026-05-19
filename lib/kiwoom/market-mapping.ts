/**
 * 키움 응답 MarketType (uppercase) ↔ store form data marketType (lowercase) 변환.
 *
 * 키움 ka10001 응답: "KOSPI" | "KOSDAQ" | "KONEX" | "UNKNOWN"
 * store form 필드 `marketType`: "kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset" | ""
 *
 * 본 단일 변환 모듈로 두 표현 간 매핑 일원화 (feedback_ui_engine_dual_truth_avoidance 정합).
 */

import type { MarketType as ApiMarketType } from "./types";

export type StoreMarketType =
  | "kospi"
  | "kosdaq"
  | "konex"
  | "unlisted"
  | "other_asset"
  | "";

const API_TO_STORE: Record<ApiMarketType, StoreMarketType> = {
  KOSPI: "kospi",
  KOSDAQ: "kosdaq",
  KONEX: "konex",
  UNKNOWN: "",
};

/**
 * 키움 API 응답의 MarketType(uppercase) → store form 필드(lowercase) 변환.
 *
 * 키움이 비상장 종목 정보를 반환하지 않으므로 "unlisted" 매핑은 본 함수 외부(UI 분기)에서 처리.
 */
export function normalizeMarketTypeToStore(api: ApiMarketType): StoreMarketType {
  return API_TO_STORE[api] ?? "";
}

const STORE_TO_API: Partial<Record<StoreMarketType, ApiMarketType>> = {
  kospi: "KOSPI",
  kosdaq: "KOSDAQ",
  konex: "KONEX",
};

export function storeMarketToApi(store: StoreMarketType): ApiMarketType {
  return STORE_TO_API[store] ?? "UNKNOWN";
}

/**
 * 자동조회 가능 시장 여부.
 *
 * 비상장(`unlisted`)·기타자산(`other_asset`)·빈값은 키움 API 미지원 → false.
 */
export function isKiwoomFetchable(store: StoreMarketType): boolean {
  return store === "kospi" || store === "kosdaq" || store === "konex";
}
