/**
 * 고시일자 선택 — 순수 함수(클라이언트·서버 공용).
 *
 * `load-partition.ts`는 `fs`를 import하므로 클라이언트에서 쓸 수 없다.
 * 모달이 시점을 계산해야 해서 이 함수만 별도 모듈로 뒀다(재수출은 load-partition에서).
 */

/**
 * 기준일 이하 고시일자 중 최대. 없으면 null.
 *
 * **기존 헬퍼와의 관계 (dual-truth 회피)** — `lib/hooks/useStandardPriceLookup.ts:35`의
 * `getDefaultPriceYear`는 **달력 cutoff**(토지 5/31·주택 4/29)로 공시연도를 *추정*한다.
 * 그 데이터에는 고시일이 없기 때문이다. 상가 기준시가는 **고시일자가 데이터에 실재**하므로
 * 추정이 불필요하다 — 두 헬퍼는 대상이 달라 dual-truth가 아니다.
 *
 * ⚠️ `getDefaultPriceYear`·`recommendLandPriceYear` 재사용 금지 — 시행 6/1·4/30 전제의
 *    보정이 들어 있는데 기준시가는 **시행 1/1**이라 보정이 없어야 한다.
 *
 * 법령 근거: 소득세법 시행령 §164③ — "새로운 기준시가가 고시되기 전에 취득 또는 양도하는
 * 경우에는 직전의 기준시가에 의한다." 고시 시점 = 시행일 1/1
 * (「2025년 오피스텔 및 상업용 건물에 대한 기준시가 고시」 국세청고시 제2024-39호, [시행 2025.1.1.]).
 */
export function pickNoticeDate(
  availableDates: readonly string[],
  refDate: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(refDate)) return null;
  let best: string | null = null;
  for (const d of availableDates) {
    if (d <= refDate && (best === null || d > best)) best = d;
  }
  return best;
}

/**
 * 고시일자 목록을 아직 모를 때의 1차 추정 — 기준일 연도의 1월 1일.
 * 전 고시가 1/1 시행이므로 그 해 고시분이 존재하면 항상 맞다. 존재하지 않으면
 * 응답의 `availableDates`로 `pickNoticeDate` 재계산이 필요하다.
 */
export function guessNoticeDate(refDate: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(refDate) ? `${refDate.slice(0, 4)}-01-01` : null;
}
