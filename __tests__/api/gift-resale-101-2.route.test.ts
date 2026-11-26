/**
 * POST /api/calc/gift-resale-101-2 — §101② 판정 route (⑫ Zod · ⑭ Date 변환 · 응답 형태)
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §5.2·§6 · mutation P-7
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/gift-resale-101-2/route";

/** 교재 사례 — 화면이 보내는 그대로(날짜는 문자열) */
const TEXTBOOK = {
  relation: "related",
  giftRegistryDate: "2026-02-01",
  transferDate: "2026-04-05",
  substantiveAttribution: "no",
  isBurdenedGift: false,
  donorDeceasedAtTransfer: false,
  donorHasOtherTransfersSameYear: false,
  doneeHasOtherTransfersSameYear: false,
  giftTaxIncludesOtherAssets: false,
  giftTaxCalculated: 6_500_000,
  giftTaxCreditsAndReductions: 195_000,
  doneeTransferDeterminedTax: 36_250_000,
  donorTransferDeterminedTax: 13_704_000,
};

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/gift-resale-101-2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as { data?: Record<string, unknown>; error?: { code: string } } };
}

describe("POST /api/calc/gift-resale-101-2", () => {
  it("교재 사례 → 200 · 미적용 · 1호 42,555,000 · deadline ISO 문자열", async () => {
    const { status, json } = await post(TEXTBOOK);
    expect(status).toBe(200);
    expect(json.data).toMatchObject({
      outcome: "not_applied",
      reasonCode: "clause1_not_less",
      clause1Tax: 42_555_000,
      clause2Tax: 13_704_000,
      taxpayer: "donee",
      finalBurden: 42_555_000,
      periodYears: 10,
      deadline: "2036-02-01T00:00:00.000Z",
      needsConfirmation: [],
    });
  });

  it("문자열 날짜가 Date로 바뀌어 기간 판정에 닿는다(⑭) — 10년 초과", async () => {
    const { json } = await post({ ...TEXTBOOK, giftRegistryDate: "2023-03-01", transferDate: "2033-03-02" });
    expect(json.data).toMatchObject({ outcome: "not_applied", reasonCode: "period_exceeded" });
  });

  it("P-7 실질귀속 미선택(생략) → 400 · 「모름」 값도 400", async () => {
    const omitted: Partial<typeof TEXTBOOK> = { ...TEXTBOOK };
    delete omitted.substantiveAttribution;
    expect((await post(omitted)).status).toBe(400);
    expect((await post({ ...TEXTBOOK, substantiveAttribution: "unknown" })).status).toBe(400);
  });

  it.each([
    ["음수 금액", { doneeTransferDeterminedTax: -1 }],
    ["소수 금액", { giftTaxCalculated: 100.5 }],
    ["공제·감면 > 산출", { giftTaxCreditsAndReductions: 6_500_001 }],
    ["존재하지 않는 날짜", { transferDate: "2026-02-30" }],
    ["양도일 < 증여일", { transferDate: "2026-01-31" }],
    ["관계 누락", { relation: undefined }],
    ["관계 enum 밖", { relation: "sibling" }],
  ])("%s → 400", async (_label, patch) => {
    const { status, json } = await post({ ...TEXTBOOK, ...patch });
    expect(status).toBe(400);
    expect(json.error?.code).toBe("VALIDATION_ERROR");
  });

  it("토글이 본문에서 엔진까지 닿는다(⑬⑭ — 침묵 strip 감시)", async () => {
    const { json } = await post({ ...TEXTBOOK, doneeHasOtherTransfersSameYear: true, giftTaxIncludesOtherAssets: true });
    expect(json.data?.needsConfirmation).toEqual(["other_transfers_same_year", "gift_tax_includes_other_assets"]);
  });
});
