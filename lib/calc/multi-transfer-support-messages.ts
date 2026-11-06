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
export const MULTI_RIGHT_TO_MOVE_IN_UNSUPPORTED_MESSAGE =
  "조합원입주권(시행령 §166① / 승계취득분 §97①1호)은 단건 계산기에서만 지원됩니다.";
export const MULTI_MIXED_USE_UNSUPPORTED_MESSAGE = "겸용주택 분리계산은 단건 계산기에서만 지원됩니다.";
export const MULTI_PRE_DEEMED_PURCHASE_UNSUPPORTED_MESSAGE =
  "의제취득일(1985.1.1.) 전 매수 자산의 취득가액 비교(소득세법 시행령 §176조의2④)는 단건 계산기에서만 지원됩니다.";
export const MULTI_BUILDING_VALUATION_UNSUPPORTED_MESSAGE =
  "일반건물·상업용건물(토지·건물 일괄/환산취득가)은 단건 계산기에서만 지원됩니다.";
export const MULTI_PHD_UNSUPPORTED_MESSAGE = "개별주택가격 미공시 환산취득가(영 §164⑦)는 단건 계산기에서만 지원됩니다.";
export const MULTI_FAMILY_BUSINESS_UNSUPPORTED_MESSAGE = "가업상속공제(§97의2④) 의제 취득가액은 단건 계산기에서만 지원됩니다.";
export const MULTI_COMPANION_UNSUPPORTED_MESSAGE = "한 건 내 다자산 일괄양도는 단건 계산기에서만 지원됩니다.";
/** API 전용 — 비거주자 사실은 1세대1주택 판정 메뉴만 받는다(화면은 계산기로 넘기지 않는다). */
export const MULTI_NON_RESIDENT_UNSUPPORTED_MESSAGE = "비거주자 입력은 1세대1주택 비과세 판정 메뉴에서만 지원됩니다.";
export const MULTI_DEMOLISHED_UNSUPPORTED_MESSAGE = "잔금 전 멸실 특약 입력은 1세대1주택 비과세 판정 메뉴에서만 지원됩니다.";
/** 합산은 세율군을 다시 계산하면서 §98 20% 단일세율·§98의3계 단기세율 배제를 잃는다(anchor `multi-block-reason-rate-special`). */
export const MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE =
  "미분양·신축주택 감면(조특법 §98·§98의2~§98의8·§99·§99의2·§99의3)은 단건 계산기에서만 지원됩니다. " +
  "합산 계산은 세율군을 다시 계산하는 과정에서 세율 특칙(§98① 20% 단일세율·§98의3계 단기세율 배제)을 반영하지 못합니다.";

/**
 * NH-72(Q-16) — 신축주택 감면(조특법 §99·§99의3)은 **2016.1.1. 이후 양도분만** 다건 합산이 단건과 같은 세액을 낸다.
 * 두 조문은 소득금액 차감형이라 §98계 세율 특칙(위 {@link MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE}의 소실 사유)과 무관하다.
 * 2016.1.1. 전 양도분은 단건과 합산의 세액이 갈릴 수 있어(리뷰 NH-72: −8,602,567) 계속 막는다.
 * ⑧(`multi-transfer-tax-validate.ts`)과 ⑫(`transfer-tax-schema-multi-refines.ts`)가 같은 술어를 쓴다.
 */
export const MULTI_NEW_HOUSING_ERA_START = "2016-01-01";
export const MULTI_NEW_HOUSING_PRE_2016_UNSUPPORTED_MESSAGE =
  "신축주택 감면(조특법 §99·§99의3)은 양도일이 2016.1.1. 이후인 건만 합산 계산을 지원합니다. " +
  "2016.1.1. 전 양도분은 단건 계산기에서 계산하세요.";

/** 이 감면이 다건에서 지원되는가 — §99·§99의3이고 양도일(`YYYY-MM-DD`)이 2016.1.1. 이후. 양도일이 비었거나 형식이 다르면 지원하지 않는다(보수적). */
export function isMultiSupportedNewHousingReduction(type: string, transferDate: unknown): boolean {
  if (type !== "new_99" && type !== "new_99_3") return false;
  if (typeof transferDate !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(transferDate)) return false;
  return transferDate.slice(0, 10) >= MULTI_NEW_HOUSING_ERA_START;
}
