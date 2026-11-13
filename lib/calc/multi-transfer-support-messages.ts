/**
 * 다건 합산(/multi) 미지원 모드 안내 — ⑧(`multi-transfer-tax-validate.ts`)과 ⑫(`lib/api/transfer-tax-schema.ts`)가
 * **같은 문구**를 쓰도록 모은 곳. 서버 스키마가 import하므로 이 파일은 **의존성이 없어야** 한다
 * (validate 파일은 클라이언트 컴포넌트·스토어를 끌고 온다).
 */

/**
 * 배우자등 이월과세(§97의2) — 자산 단위 사건·채무 인수분·토지·건물 파트 이월과세 모두 다건도 계산한다
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 CO·CO-DEBT·CO-PART).
 */
/**
 * 파트 이월과세(토지만·건물만·증여자 분리) 고지(Q-4 b) — 엔진(STEP 0.476)은 파트 A/B를 **그 자산의 결정세액**으로 정한다. 연간 합산의 다른 이월과세는
 * 그 해 전체 결정세액으로 비교한다(§97의2②3호 「양도소득 결정세액」 = §92③2호 · 기본공제는 인별·과세기간). 다른 자산과 함께 신고할 때만 싣는다.
 */
export const MULTI_SPLIT_CARRYOVER_ASSET_SCOPE_NOTICE =
  "확인 필요: 토지·건물을 나눈 이월과세(소득세법 §97의2)는 그 자산의 결정세액만으로 적용 여부(§97의2 ② 3호)를 비교했습니다. 이 신고의 다른 이월과세는 그 해 전체 결정세액으로 비교하므로, 함께 신고한 자산에 따라 결론이 달라질 수 있습니다.";
/**
 * F-12 — 합산 경로가 처리하지 못하는 서브객체 모드. ⑧(`validateMultiSupportedMode`)은 화면 폼으로,
 * ⑫(`transfer-tax-schema-multi-refines.ts`)는 API 본문으로 같은 모드를 막는다.
 */
/** API 전용 — 연간 합산 자산은 각자 다른 증여다. 물건·증여계약 전체 §159 명세는 단건(축 B·함께 양도)에서만 받는다(트랙 BG). */
export const MULTI_BURDENED_GIFT_WHOLE_UNSUPPORTED_MESSAGE =
  "부담부증여 물건 전체 명세(지분 묶음·함께 양도)는 단건 계산기에서만 지원됩니다.";
export const MULTI_REDEVELOPMENT_UNSUPPORTED_MESSAGE = "재개발·재건축(시행령 §166)은 단건 계산기에서만 지원됩니다.";
export const MULTI_RIGHT_TO_MOVE_IN_UNSUPPORTED_MESSAGE =
  "조합원입주권(시행령 §166① / 승계취득분 §97①1호)은 단건 계산기에서만 지원됩니다.";
export const MULTI_MIXED_USE_UNSUPPORTED_MESSAGE = "겸용주택 분리계산은 단건 계산기에서만 지원됩니다.";
/** 다필지(§114⑦ 필지별 독립 계산) — ⑧(`validateMultiSupportedMode`)과 ⑫(`MULTI_REJECT_RULES.parcels`)가 같은 문구를 쓴다. */
export const MULTI_PARCELS_UNSUPPORTED_MESSAGE = "다필지 토지는 단건 계산기에서만 지원됩니다.";
export const MULTI_PRE_DEEMED_PURCHASE_UNSUPPORTED_MESSAGE =
  "의제취득일(1985.1.1.) 전 매수 자산의 취득가액 비교(소득세법 시행령 §176조의2④)는 단건 계산기에서만 지원됩니다.";
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
