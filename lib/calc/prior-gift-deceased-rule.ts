/**
 * 증여자 사망 합산제외 검증 단일진실 헬퍼 (재산-58·재삼46014-1228·서일46014-11750)
 *
 * 동기화 지점 ⑧: client validatePriorGift + ⑫ Zod priorGiftSchema.superRefine 양쪽이
 * 동일 규칙을 공유하여 API-직접/비로그인 경로에서도 client와 동일하게 차단한다.
 *
 * 검증 범위: donorDeceasedDate(토글 ON 시 정의됨)의 형식 + "그 회차 증여일보다 이후" 만.
 *   금번 증여일 비교(증여 후 사망=합산 유지)는 엔진(gift-prior-aggregation.ts)이 판정 —
 *   단건 함수는 금번 증여일을 모르므로 여기서 차단하지 않는다.
 *
 * 반환값:
 *   null   — 통과 (또는 토글 OFF=donorDeceasedDate undefined)
 *   string — 위반 메시지 (client는 UI 표시, Zod superRefine은 ctx.addIssue 메시지로 사용)
 */

/** 공유 헬퍼가 필요로 하는 PriorGift 최소 형태 */
export interface DeceasedRuleInput {
  giftDate: string;
  donorDeceasedDate?: string;
}

export function checkDeceasedDonorRule(gift: DeceasedRuleInput): string | null {
  // 토글 OFF — 검사 범위 밖
  if (gift.donorDeceasedDate === undefined) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(gift.donorDeceasedDate)) {
    return "증여자 사망일을 입력하세요 (YYYY-MM-DD).";
  }
  if (gift.donorDeceasedDate <= gift.giftDate) {
    return "증여자 사망일은 그 회차 증여일보다 이후여야 합니다.";
  }
  return null;
}
