/**
 * 양도소득세 감면 유형 → 화면 라벨 **단일 소스**.
 *
 * 종전에는 같은 표가 세 곳에 흩어져 있었고 셋 다 불완전했다:
 *   · `transfer-tax-reductions-calc.ts` 함수 **지역 변수** (30종) — export가 안 돼 재사용 불가
 *   · `MultiTransferTaxResultView.tsx`   로컬 맵 (6종)
 *   · `BundledAllocationCard.tsx`        로컬 맵 (6종) — 같은 키인데 **문구가 달랐다**
 *       self_farming_inherited: 다건 「자경농지 (§69·상속인 경작기간 합산 §66⑪)」
 *                              일괄 「자경농지·상속인 경작기간 합산 (§69·§66⑪)」
 *
 * 그래서 6종에 없는 감면(§97 계열·§98 계열·§77의2·§77의3 …)은 `?? entry.type` 폴백을 타고
 * **내부 enum id가 화면에 그대로 노출**됐다 — `gb_designated_land`·`rental_97_3` 같은 문자열이
 * 사용자에게 보였다. 저장소 규약은 내부 id 노출을 금지한다
 * (memory `feedback_no_internal_id_in_result`).
 *
 * ⚠️ **합집합이어야 한다.** 엔진 맵에는 `livestock`·`fishing`이 없고 UI 맵에만 있었다.
 *   엔진 맵만 옮겼다면 축산업·어업이 「기타 감면」으로 퇴행했을 것이다.
 */

/** 감면 유형 id → 사용자에게 보이는 한국어 라벨. */
export const REDUCTION_TYPE_LABELS: Record<string, string> = {
  // legacy 5개 (Round 8 자동변환 마이그레이션 + 1개월 alias)
  self_farming: "자경농지 (§69)",
  self_farming_inherited: "자경농지 (§69·상속인 경작기간 합산 §66⑪)",
  self_farming_incorp: "자경농지 (§69·편입 §66④1호·§66⑦)",
  livestock: "축산업 (§69의2)",
  fishing: "어업 (§69의3)",
  long_term_rental: "장기임대주택",
  new_housing: "신축주택",
  unsold_housing: "미분양주택",
  public_expropriation: "공익사업용 토지 수용 (§77)",
  gb_designated_land: "개발제한구역 매수 토지 (§77의3)",
  replacement_land_comp: "대토보상 과세특례 (§77의2)",
  // 과거 감면 이력 전용 — 당해연도 계산기는 미구현이나 §133 한도 합산 대상이다 (CA-04)
  farmland_substitute_70: "농지대토 (§70)",
  self_cultivated_forest_69_4: "자경산지 (§69의4)",
  // Round 8 (2026-05-06): 신규 23개 ID 한국어 라벨
  rental_97_main: "장기임대주택 (§97 ① 본문)",
  rental_97_proviso: "장기임대주택 (§97 ① 단서)",
  rental_97_2: "신축임대주택 (§97의2)",
  rental_97_3: "장기일반민간임대 (§97의3)",
  rental_97_4: "장기보유 임대주택 (§97의4)",
  rental_97_5: "장기일반민간임대 100% (§97의5)",
  new_99: "신축주택 (§99 IMF 1차)",
  new_99_3: "신축주택 과세특례 (§99의3 IMF 2차)",
  new_99_4_rural: "농어촌주택 (§99의4)",
  new_99_4_hometown: "고향주택 (§99의4)",
  unsold_98: "미분양 분리과세 (§98)",
  unsold_98_2: "지방 미분양 (§98의2)",
  unsold_98_3: "서울 외 미분양 (§98의3)",
  unsold_98_4: "비거주자 일반주택 (§98의4)",
  unsold_98_5: "수도권 외 미분양 (§98의5)",
  unsold_98_6: "준공후미분양 (§98의6)",
  unsold_98_7: "9억 이하 미분양 (§98의7)",
  unsold_98_8: "준공후미분양 6억·135㎡ (§98의8)",
  unsold_98_9: "수도권 밖 준공후미분양 (§98의9)",
  unsold_99_2: "신축·미분양·1세대1주택 (§99의2)",
};

/** 미등록 유형의 표시 문구 — **내부 id를 화면에 흘리지 않는다**. */
export const UNKNOWN_REDUCTION_LABEL = "기타 감면";

/**
 * 감면 유형 id를 화면 라벨로 바꾼다.
 *
 * 미등록 키는 `?? type`이 아니라 「기타 감면」으로 떨어뜨린다 — 라벨 추가를 잊어도
 * 사용자에게 enum 문자열이 보이는 일은 없다. 누락 자체는 anchor가 잡는다
 * (`__tests__/components/transfer-reduction-type-labels.anchor.test.ts`).
 */
export function reductionTypeLabelOf(type: string | undefined | null): string {
  if (!type) return UNKNOWN_REDUCTION_LABEL;
  return REDUCTION_TYPE_LABELS[type] ?? UNKNOWN_REDUCTION_LABEL;
}
