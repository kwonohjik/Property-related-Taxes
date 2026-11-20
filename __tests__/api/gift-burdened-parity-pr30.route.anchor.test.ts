/**
 * PR-30 route anchor (2026-11 리뷰) — 증여 화면 본문(표식 `houseRosterInputUnavailable`) 그대로 계산기 route.
 * D-83 엔진 분기(2주택 + 두 합가일 → 두 합가 모두 불성립 + 확인 필요) · I-34(단일 합가 비과세 구성 미확인 고지) · D-92(3주택 같은 원인 고지 한 건).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { giftBody, run } from "./_gift-burdened-pr7-harness";
import {
  NO_ROSTER_SINGLE_MERGE_NOTICE,
  NO_ROSTER_THREE_HOUSE_MERGE_NOTICE,
  NO_ROSTER_TWO_MERGE_DATES_NOTICE,
} from "@/lib/tax-engine/one-house/merge-confirm-warnings";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));

// 양도(증여) 주택 2005 취득 · 2008 무주택 배우자와 혼인 · 2020 1주택 60세 이상 부모와 동거봉양 합가 · 2주택 · 먼저 양도 · 2024-12-01 증여
const BASE = { acquisitionDate: new Date("2005-03-01"), householdHousingCount: 2, isOneHousehold: true, isFirstTransferredInMerge: true };
const PARENTAL = { parentalCareMergeDate: "2020-06-01", parentalCareParentAge: "over_60" as const };
const warn = (r: Record<string, unknown>) => (r.warnings as string[] | undefined) ?? [];

describe("D-83 · I-34 2주택 합가(명부 없는 화면)", () => {
  it("두 합가일 → 두 합가 모두 불성립 + 확인 필요(종전: 늘 혼인 축 · 과세였다)", async () => {
    const r = await run(giftBody("2024-12-01", { ...BASE, ...PARENTAL, marriageDate: "2008-01-01" }));
    expect(r.isExempt).toBe(false);
    expect(warn(r)).toContain(NO_ROSTER_TWO_MERGE_DATES_NOTICE);
  });
  it("동거봉양 합가일만 → §155④ 비과세 + 구성 미확인 고지(Q-32)", async () => {
    const r = await run(giftBody("2024-12-01", { ...BASE, ...PARENTAL }));
    expect(r.isExempt).toBe(true);
    expect(warn(r)).toContain(NO_ROSTER_SINGLE_MERGE_NOTICE);
  });
});

describe("D-92 3주택 단일 합가 — 같은 원인 고지 한 건", () => {
  it("「판정하지 않고 계산」 고지만 — 「그 기간 요건을 충족하지 않습니다」 없음", async () => {
    const r = await run(
      giftBody("2025-06-01", { acquisitionDate: new Date("2015-01-01"), householdHousingCount: 3, isOneHousehold: true, isFirstTransferredInMerge: true, marriageDate: "2020-01-01" }),
    );
    expect(warn(r)).toContain(NO_ROSTER_THREE_HOUSE_MERGE_NOTICE);
    expect(warn(r).join("\n")).not.toContain("그 기간 요건을 충족하지 않습니다");
  });
});
