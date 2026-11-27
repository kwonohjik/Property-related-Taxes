/**
 * 국외자산 부동산 — 계산 경로 분기 문구. 의존성 없음.
 *
 * U1의 「계산 연결 전」 차단 문구(`FOREIGN_CALC_PENDING_MESSAGE`)는 U2가 ④ 호출을 연결하면서 걷었다.
 * 남은 것: 국내 호출 가드(국외 폼이 국내 계산 경로로 새는 것을 막는다) · 다건(연간 합산) 차단 안내. 이력 저장 보류 안내는 U3가 걷었다.
 */

/**
 * `callTransferTaxAPI`(국내 전용) 가드 — 국외 폼은 `callForeignRealEstateAPI`로만 계산한다.
 * 이 가드가 없으면 빈 국내 자산이 조용히 계산된다.
 */
export const FOREIGN_DOMESTIC_PATH_GUARD_MESSAGE =
  "국외자산 부동산은 국내 양도소득세 계산 경로로 계산할 수 없습니다. 국외 전용 계산(callForeignRealEstateAPI)을 사용하세요.";

/**
 * 다건(`/multi` 연간 합산) 차단 안내 — 사용자 결정 D-M(2026-11-27): 국외 자산 여러 개는 한 건의 계산 안(`foreignAssets[]` ≤ 20)에서 받는다.
 * 합산 화면에서 사용자가 국외 건을 만나는 모든 자리(건 목록 · 건 편집 · 합산 계산 검증)가 이 한 문구를 쓴다.
 */
export const MULTI_FOREIGN_UNSUPPORTED_MESSAGE =
  "국외 자산은 한 건 계산 안에서 여러 개를 추가하세요. 연간 합산(다건) 계산에는 국외 건을 넣을 수 없으니, 이 건은 단건 계산기에서 계산하세요.";
