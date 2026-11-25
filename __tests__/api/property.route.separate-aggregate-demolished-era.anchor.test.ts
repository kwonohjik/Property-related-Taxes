/**
 * 재산세 별도합산 철거 유예기간 — API 경로 (영 §103의2 1호 과세기준일 시행본 연혁).
 * 화면 경로(targetDate 미전송 → 올해 6.1.)는 1년 그대로, 직접 API로 과거 연도를 보낼 때만 6개월이 적용된다.
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
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockRejectedValue(new Error("offline")) };
});

import { POST } from "@/app/api/calc/property/route";

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

const ITEM = {
  id: "p1",
  jurisdictionCode: "000000",
  landArea: 1000,
  officialLandPrice: 1_000_000,
  zoningDistrict: "industrial",
  buildingFloorArea: 300,
  demolished: true,
  // PSA-E2 — 철거 요건 칸: 건축물 · 허가·사용승인 받음 · 건축 외 용도 아님(과세기준일 2025.6.1.·2026.6.1. 시행본이 기간 안에서 요구하는 칸 전부)
  demolishedKind: "building",
  demolishedPermit: "yes",
  demolishedOtherUse: "no",
};
// PSA-E4 — 같은 관할구역 합산 칸(요구되는 칸만 읽힌다): 0 = 없음을 명시
const LAND = {
  objectType: "land",
  publishedPrice: 1_000_000_000,
  landTaxType: "separate_aggregate",
  otherSeparateAggregateValue: 0,
  otherComprehensiveValue: 0,
};

describe("직접 API — 철거 유예기간 과세기준일 연혁", () => {
  it("targetDate 2025.6.1.: 철거 2024.12.1.(6개월 당일) → 별도합산 2,280,000", async () => {
    const r = await post({ ...LAND, targetDate: "2025-06-01", separateAggregateItem: { ...ITEM, demolishedDate: "2024-12-01" } });
    expect(r.status).toBe(200);
    expect(r.json.data.totalPayable).toBe(2_280_000);
  });

  it("targetDate 2025.6.1.: 철거 2024.11.30.(6개월 초과) → 별도합산에서 빠져 종합합산 이관분 세액 3,900,000(PSA-E4 — 종전엔 0원 + 경고)", async () => {
    const r = await post({ ...LAND, targetDate: "2025-06-01", separateAggregateItem: { ...ITEM, demolishedDate: "2024-11-30" } });
    expect(r.status).toBe(200);
    expect(r.json.data.totalPayable).toBe(3_900_000); // 종합합산 1,000,000,000 → 과표 700,000,000 → 3,250,000 + 지방교육세 650,000
  });

  it("targetDate 2026.6.1.: 철거 2025.6.1.(1년 당일) → 별도합산 / 2025.5.31. → 종합합산", async () => {
    const a = await post({ ...LAND, targetDate: "2026-06-01", separateAggregateItem: { ...ITEM, demolishedDate: "2025-06-01" } });
    const b = await post({ ...LAND, targetDate: "2026-06-01", separateAggregateItem: { ...ITEM, demolishedDate: "2025-05-31" } });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.json.data.totalPayable).toBe(2_280_000);
    expect(b.json.data.totalPayable).toBe(3_900_000); // 종합합산 이관분(PSA-E4)
  });
});
