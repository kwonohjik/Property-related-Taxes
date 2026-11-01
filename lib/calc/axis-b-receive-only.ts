/**
 * 축 B 청산금 수령 단독 신고 — 지분 사이의 불일치 판정. ⑧ 폼과 ⑫ 본문이 같은 함수·문구를 쓴다.
 *
 * ④는 첫 지분이 단독이면 묶음 양도일을 그 지분의 고시일 다음날로 바꾼다. 신고 하나에 양도일이 하나라
 * 지분마다 단독 여부·고시일이 다르면 표현할 수 없고, 카드 순서에 따라 세액이 달라진다
 * (실측 39,094,000·198,000 — 계획서 `axis-b-receive-only.plan.md` V-3·V-4).
 * 이전고시는 대지·건축물 단위이고 그 다음날 소유권을 취득한다(「도시 및 주거환경정비법」 §86).
 */
export const RECEIVE_ONLY_MIXED_MESSAGE =
  "지분 분할 취득: 청산금 수령분 단독 신고는 전 지분이 같아야 합니다. 일부 지분만 단독 신고하면 양도일이 달라지므로 따로 계산하세요.";
export const RECEIVE_ONLY_DATE_MESSAGE =
  "지분 분할 취득: 같은 주택의 소유권이전 고시일 다음날은 전 지분이 같아야 합니다.";

export function receiveOnlyShareIssue(
  shares: readonly { receiveOnly: boolean; saleDate?: string | null }[],
): string | null {
  const receiving = shares.filter((s) => s.receiveOnly);
  if (receiving.length === 0) return null;
  if (receiving.length < shares.length) return RECEIVE_ONLY_MIXED_MESSAGE;
  const dates = new Set(receiving.map((s) => s.saleDate).filter(Boolean));
  return dates.size > 1 ? RECEIVE_ONLY_DATE_MESSAGE : null;
}
