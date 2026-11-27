/**
 * 증여 후 우회양도 판정 → 양도세 계산기 «증여자 직접양도 기준 계산» 진입 신호.
 *
 * 판정 화면 2호 카드의 «양도세 계산기로» 링크가 `?new=1&basis=101-2-donor`로 계산기를 열면,
 * 계산기는 빈 폼으로 초기화한 직후 `giftResaleDonorBasis`를 켠다. 이 표지가 이력 키를
 * 수증자 기준 계산과 갈라 준다(`lib/storage/business-key.ts`).
 *
 * 계획서: docs/00-pm/transfer-history-101-2-donor-key.plan.md
 */

const BASIS_PARAM = "basis";
const DONOR_BASIS_VALUE = "101-2-donor";

/** 판정 화면 2호 카드 → 양도세 계산기(증여자 기준) */
export const GIFT_RESALE_DONOR_CALC_HREF = `/calc/transfer-tax?new=1&${BASIS_PARAM}=${DONOR_BASIS_VALUE}`;

/** `window.location.search`가 증여자 기준 계산 진입인가 */
export function isGiftResaleDonorBasisEntry(search: string): boolean {
  return new URLSearchParams(search).get(BASIS_PARAM) === DONOR_BASIS_VALUE;
}
