/** AI 사실 추출 게이트 — 로컬 개발 서버(NODE_ENV=development)에서만 연다. */
import { describe, it, expect } from "vitest";
import { checkOneHouseAiAccess } from "@/lib/one-house-ai/access-guard";

describe("AI 사실 추출 게이트", () => {
  it("개발 서버면 연다", () => {
    expect(checkOneHouseAiAccess("development")).toEqual({ ok: true });
  });
  it.each(["production", "test", undefined] as const)("%s이면 403", (env) => {
    expect(checkOneHouseAiAccess(env)).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN" });
  });
});
