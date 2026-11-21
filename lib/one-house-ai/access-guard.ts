/**
 * 1세대1주택 AI 사실 추출 — **로컬 개발 서버 전용** 게이트(사용자 결정 2026-10-19).
 *
 * 추출 1회마다 Anthropic API 비용이 든다. 이 앱에는 로그인 화면이 없어(`lib/storage/current-user.ts` — 로컬 사용자 고정)
 * 로그인 이메일로 관리자를 가릴 수 없다. 그래서 `npm run dev`(NODE_ENV=development)에서만 열고, 배포(production)에서는
 * 키가 설정돼 있어도 항상 닫는다. API 키 유무는 호출부가 따로 본다(화면은 버튼을 숨기고, 서버 경로는 503).
 *
 * 2026-11 리뷰 D-34 · 결정 Q-9 ③ — 개발 서버는 기본 0.0.0.0에 묶여 같은 네트워크(LAN)에서 닿고 rate limit 키는 위조할 수 있는 IP 헤더다.
 * 그래서 개발 서버에서도 **opt-in 환경변수**(`ONE_HOUSE_AI_DEV=1`)를 켰을 때만 연다. 비용 상한(분당 5회)은 테스트(NODE_ENV=test)에서만
 * 우회 헤더를 받는다(`aiRateLimitBypass`).
 */
export type AccessGateResult = { ok: true } | { ok: false; status: 403; code: "FORBIDDEN"; message: string };

export const ONE_HOUSE_AI_OPT_IN_ENV = "ONE_HOUSE_AI_DEV";

export function checkOneHouseAiAccess(
  nodeEnv = process.env.NODE_ENV,
  optIn = process.env[ONE_HOUSE_AI_OPT_IN_ENV] === "1",
): AccessGateResult {
  if (nodeEnv === "development" && optIn) return { ok: true };
  if (nodeEnv === "development") {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: `AI 기능은 로컬 개발 서버에서 ${ONE_HOUSE_AI_OPT_IN_ENV}=1을 켰을 때만 씁니다 — 개발 서버는 같은 네트워크에 열려 있어 비용이 드는 호출을 기본으로 막습니다.`,
    };
  }
  return { ok: false, status: 403, code: "FORBIDDEN", message: "AI 사실 추출은 로컬 개발 서버에서만 쓸 수 있습니다." };
}

/** AI route 비용 상한의 우회 — 테스트에서만 우회 헤더를 받는다(개발 서버는 헤더 하나로 풀렸다 · D-34). */
export function aiRateLimitBypass(headerBypass: boolean, nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "test" && headerBypass;
}
