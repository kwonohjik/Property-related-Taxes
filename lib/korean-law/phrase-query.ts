/**
 * 큰따옴표로 감싼 결정례 검색어 = 본문에서 그 구절이 그대로 나오는 결정 (DRF search=2 + 구절 일치).
 *
 * 순수 함수만 둔다 — 판례 탭(클라이언트)과 search-decisions 라우트(서버)가 같은 판정을 쓴다.
 * 근거 실측: __tests__/korean-law/article-precedent-routing.anchor.test.ts 머리말.
 */

export function isQuotedPhrase(q: string): boolean {
  return /^"[^"]+"$/.test(q.trim());
}

/** `"소득세법 제89조의2"` → { lawName: "소득세법", articleNo: "제89조의2" }. 조문 인용 구절이 아니면 null. */
export function parseArticleCitationPhrase(q: string): { lawName: string; articleNo: string } | null {
  const m = /^"(.+?)\s+(제\d+조(?:의\d+)?)"$/.exec(q.trim());
  return m ? { lawName: m[1], articleNo: m[2] } : null;
}
