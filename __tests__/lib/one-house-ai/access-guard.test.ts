/** AI 사실 추출 게이트 — 로컬 개발 서버(NODE_ENV=development) + opt-in 환경변수(2026-11 리뷰 D-34 · Q-9 ③)에서만 연다. */
import { describe, it, expect } from "vitest";
import { aiRateLimitBypass, checkOneHouseAiAccess } from "@/lib/one-house-ai/access-guard";

describe("AI 사실 추출 게이트", () => {
  it("개발 서버 + opt-in이면 연다", () => {
    expect(checkOneHouseAiAccess("development", true)).toEqual({ ok: true });
  });
  it("D-34 — 개발 서버라도 opt-in이 없으면 403(LAN 노출 기본 차단)", () => {
    expect(checkOneHouseAiAccess("development", false)).toMatchObject({ ok: false, status: 403 });
  });
  it.each(["production", "test", undefined] as const)("%s이면 opt-in이 있어도 403", (env) => {
    expect(checkOneHouseAiAccess(env, true)).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN" });
  });
  it("D-34 — 비용 상한 우회 헤더는 테스트에서만 받는다", () => {
    expect(aiRateLimitBypass(true, "development")).toBe(false);
    expect(aiRateLimitBypass(true, "test")).toBe(true);
    expect(aiRateLimitBypass(false, "test")).toBe(false);
  });
});
