/**
 * 취득세 — 원인별 필수 입력을 ⑫가 비워 두게 두던 결함 (2026-09-30 Zod↔엔진 필수 점검).
 *
 * 비우면 400이 아니라 200 + 다른 세액이었다. ⑧(`components/calc/acquisition/shared.ts`)은 요구한다.
 * - A1 유상취득 취득가액 → 과세표준 0 · 총세액 0 (시가표준액 경고만)
 * - A2 부담부증여 채무액 → 유상분 없이 계산 (6,600,000 → 3,600,000)
 * - A5 간주취득 서브객체 → 「과세 요건 미충족」 0 (4,400,000 → 0)
 * - A6 간주취득 사치성 유형 → 10% (별장 폐지 후 villa 2% 4,400,000 → 22,000,000)
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/acquisition/route";

type Json = { data?: { totalTax: number }; error?: { details?: Record<string, unknown> } };
async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/acquisition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
async function expectTotal(body: unknown, total: number) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  expect(r.json.data!.totalTax).toBe(total);
}
async function expectRejected(body: unknown, key: string) {
  const r = await post(body);
  expect(r.status).toBe(400);
  expect(Object.keys(r.json.error?.details ?? {})).toContain(key);
}

const PURCHASE = {
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  houseCountAfter: 1,
  isMetropolitanRegion: true,
  balancePaymentDate: "2025-03-01",
};
const RENO = {
  propertyType: "building",
  acquisitionCause: "deemed_renovation",
  acquiredBy: "individual",
  reportedPrice: 0,
  balancePaymentDate: "2025-03-01",
};
const RENO_INPUT = { renovation: { renovationType: "major_repair", prevStandardValue: 100_000_000, newStandardValue: 300_000_000 } };

describe("취득세 원인별 필수 입력", () => {
  it("A1 🟢 취득가액 5억 → 6,500,000 / 🔴 생략 400 (종전 총세액 0)", async () => {
    await expectTotal({ ...PURCHASE, reportedPrice: 500_000_000 }, 6_500_000);
    await expectRejected(PURCHASE, "reportedPrice");
  });

  it("A2 🟢 채무액 2억 → 6,600,000 / 🔴 생략 400 (종전 3,600,000)", async () => {
    const bg = {
      ...PURCHASE,
      acquisitionCause: "burdened_gift",
      reportedPrice: 0,
      standardValue: 300_000_000,
      giftRelation: "other",
    };
    await expectTotal({ ...bg, encumbrance: 200_000_000 }, 6_600_000);
    await expectRejected(bg, "encumbrance");
  });

  it("A5 🟢 개수 입력 → 4,400,000 / 🔴 서브객체 없음·빈 객체 400 (종전 0)", async () => {
    await expectTotal({ ...RENO, deemedInput: RENO_INPUT }, 4_400_000);
    await expectRejected(RENO, "deemedInput");
    await expectRejected({ ...RENO, deemedInput: {} }, "deemedInput");
  });

  it("A5b 🔴 원인과 다른 서브객체(지목변경 원인 + 개수 입력)도 400", async () => {
    await expectRejected({ ...RENO, acquisitionCause: "deemed_land_category", deemedInput: RENO_INPUT }, "deemedInput");
  });

  it("A6 🟢 사치성 별장(villa) → 4,400,000 / 🔴 유형 생략 400 (종전 10% 22,000,000)", async () => {
    const lux = { ...RENO, deemedInput: RENO_INPUT, isLuxuryProperty: true, balancePaymentDate: "2024-01-01" };
    await expectTotal({ ...lux, luxuryType: "villa" }, 4_400_000);
    await expectRejected(lux, "luxuryType");
  });
});
