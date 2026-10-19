/**
 * 1세대1주택 AI 사실 추출 — **로컬 개발 서버 전용** 게이트(사용자 결정 2026-10-19).
 *
 * 추출 1회마다 Anthropic API 비용이 든다. 이 앱에는 로그인 화면이 없어(`lib/storage/current-user.ts` — 로컬 사용자 고정)
 * 로그인 이메일로 관리자를 가릴 수 없다. 그래서 `npm run dev`(NODE_ENV=development)에서만 열고, 배포(production)에서는
 * 키가 설정돼 있어도 항상 닫는다. API 키 유무는 호출부가 따로 본다(화면은 버튼을 숨기고, 서버 경로는 503).
 */
export type AccessGateResult = { ok: true } | { ok: false; status: 403; code: "FORBIDDEN"; message: string };

export function checkOneHouseAiAccess(nodeEnv = process.env.NODE_ENV): AccessGateResult {
  if (nodeEnv === "development") return { ok: true };
  return { ok: false, status: 403, code: "FORBIDDEN", message: "AI 사실 추출은 로컬 개발 서버에서만 쓸 수 있습니다." };
}
