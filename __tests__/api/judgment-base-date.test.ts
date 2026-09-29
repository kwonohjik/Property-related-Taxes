/**
 * 판정 기준일 — 서버(UTC) 시각을 **한국 날짜**로 자른다 (2026-09-29).
 * 00:00~08:59 KST에 UTC 날짜를 그대로 쓰면 하루 전날이 되는 경계를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { resolveJudgmentBaseDate } from "@/lib/api/judgment-base-date";

const iso = (d: Date) => d.toISOString();

describe("resolveJudgmentBaseDate", () => {
  it("UTC 2026-09-28 15:00 = KST 09-29 00:00 → 2026-09-29 (UTC 자정 형식)", () => {
    expect(iso(resolveJudgmentBaseDate(new Date("2026-09-28T15:00:00Z")))).toBe("2026-09-29T00:00:00.000Z");
  });
  it("UTC 2026-09-28 14:59 = KST 09-28 23:59 → 2026-09-28", () => {
    expect(iso(resolveJudgmentBaseDate(new Date("2026-09-28T14:59:59Z")))).toBe("2026-09-28T00:00:00.000Z");
  });
  it("UTC 2026-12-31 20:00 = KST 2027-01-01 05:00 → 연도 경계", () => {
    expect(iso(resolveJudgmentBaseDate(new Date("2026-12-31T20:00:00Z")))).toBe("2027-01-01T00:00:00.000Z");
  });
});
