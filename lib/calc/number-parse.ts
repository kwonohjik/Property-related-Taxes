/**
 * 입력 문자열 → 숫자 (순수 함수).
 *
 * 🔴 **`"use client"` 파일에 두지 않는다** — 종전에는 `CurrencyInput.tsx`·`DecimalInput.tsx`에 있었는데, 서버 경로
 *    (`/api/one-house-ai/extract`)가 판정 메뉴 ⑧ 검증을 부르자 Next가 그 함수를 클라이언트 참조로 바꿔 500이 났다
 *    (「Attempted to call parseAmount() from the server」). 브라우저·vitest에서는 드러나지 않는다.
 *    `lib/**`는 이 모듈에서 가져온다. 화면 쪽 기존 import는 두 컴포넌트가 다시 내보내 그대로 둔다.
 */

/**
 * 콤마 제거 후 정수 반환. undefined/null 안전.
 * 음수 부호(`-`)는 보존하되, 파싱 불가(예: 전이 상태 `"-"`)는 0으로 가드 (NaN 전파 방지).
 */
export function parseAmount(value: string | undefined | null): number {
  if (value == null) return 0;
  const n = parseInt(value.replace(/,/g, "") || "0", 10);
  return Number.isNaN(n) ? 0 : n;
}

/** 문자열 → 숫자 변환 (parseAmount의 소수점 버전). undefined/null 안전. */
export function parseDecimal(value: string | undefined | null): number {
  if (value == null || value === "") return 0;
  const n = parseFloat(value.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
