/**
 * ③ normalize helper (빈 문자열 → undefined / 숫자 파싱)
 *
 * `stock-transfer-tax-api.ts`와 `stock-transfer-tax-api-foreign-exit.ts`가 공유한다.
 * 800줄 정책으로 도메인을 가를 때 **파싱 규칙까지 복사되면** 한쪽만 고치는 사고가 나므로
 * 무의존 leaf로 뽑아 단일 소스로 둔다.
 */

export function parseIntOrUndef(s: string): number | undefined {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? undefined : n;
}

export function parseFloatOrUndef(s: string): number | undefined {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? undefined : n;
}

export function parseIntOrZero(s: string): number {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}
