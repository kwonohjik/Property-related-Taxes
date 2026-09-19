/**
 * 다건 합산(/multi) 미지원 모드 안내 — ⑧(`multi-transfer-tax-validate.ts`)과 ⑫(`lib/api/transfer-tax-schema.ts`)가
 * **같은 문구**를 쓰도록 모은 곳. 서버 스키마가 import하므로 이 파일은 **의존성이 없어야** 한다
 * (validate 파일은 클라이언트 컴포넌트·스토어를 끌고 온다).
 */

/** 다건 route(⑭)는 `carryoverTaxation`을 매핑하지 않는다 — 이월과세는 단건 전용(F-5). */
export const MULTI_CARRYOVER_UNSUPPORTED_MESSAGE = "배우자등 이월과세(§97의2)는 단건 계산기에서만 지원됩니다.";

/**
 * F-12 — 합산 경로가 처리하지 못하는 서브객체 모드. ⑧(`validateMultiSupportedMode`)은 화면 폼으로,
 * ⑫(`transfer-tax-schema-multi-refines.ts`)는 API 본문으로 같은 모드를 막는다.
 */
export const MULTI_BURDENED_GIFT_UNSUPPORTED_MESSAGE = "부담부증여(소령 §159)는 단건 계산기에서만 지원됩니다.";
export const MULTI_REDEVELOPMENT_UNSUPPORTED_MESSAGE = "재개발·재건축(시행령 §166)은 단건 계산기에서만 지원됩니다.";
export const MULTI_MIXED_USE_UNSUPPORTED_MESSAGE = "겸용주택 분리계산은 단건 계산기에서만 지원됩니다.";
export const MULTI_BUILDING_VALUATION_UNSUPPORTED_MESSAGE =
  "일반건물·상업용건물(토지·건물 일괄/환산취득가)은 단건 계산기에서만 지원됩니다.";
export const MULTI_PHD_UNSUPPORTED_MESSAGE = "개별주택가격 미공시 환산취득가(영 §164⑦)는 단건 계산기에서만 지원됩니다.";
export const MULTI_FAMILY_BUSINESS_UNSUPPORTED_MESSAGE = "가업상속공제(§97의2④) 의제 취득가액은 단건 계산기에서만 지원됩니다.";
export const MULTI_COMPANION_UNSUPPORTED_MESSAGE = "한 건 내 다자산 일괄양도는 단건 계산기에서만 지원됩니다.";
/** API 전용 — 화면(⑧)은 신고가액 공란을 막고, 다건은 신고가액을 `acquisitionPrice`로 직접 쓴다. */
export const MULTI_INHERITANCE_VALUATION_UNSUPPORTED_MESSAGE =
  "상속 취득가액 평가(보충적평가·환산)는 단건 계산기에서만 지원됩니다. 다건은 상속세 신고가액을 취득가액으로 입력하세요.";
/** 합산은 세율군을 다시 계산하면서 §98 20% 단일세율·§98의3계 단기세율 배제를 잃는다(anchor `multi-block-reason-rate-special`). */
export const MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE =
  "미분양·신축주택 감면(조특법 §98·§98의2~§98의8·§99·§99의2·§99의3)은 단건 계산기에서만 지원됩니다. " +
  "합산 계산은 세율군을 다시 계산하는 과정에서 세율 특칙(§98① 20% 단일세율·§98의3계 단기세율 배제)을 반영하지 못합니다.";
