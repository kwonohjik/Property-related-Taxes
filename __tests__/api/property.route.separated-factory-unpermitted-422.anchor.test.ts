/**
 * PSA-X — 분리과세 공장용지 허가·사용승인 미이행(영 §102①1호 단서) 422 안내 문구.
 * 별도합산으로 입력해도 영 §101① 단서(PSA-E3)로 같은 건축물이 제외되어 최종 과세는 종합합산이므로
 * 「종합합산 또는 별도합산」이 아니라 «종합합산 과세 유형으로 재입력» 안내여야 한다. 세액·판정은 불변(422 유지).
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
import { PROPERTY, PROPERTY_SEPARATE } from "@/lib/tax-engine/legal-codes";

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

const separated = (item: Record<string, unknown>) => ({
  objectType: "land",
  landTaxType: "separated",
  publishedPrice: 300_000_000,
  targetDate: "2026-06-01",
  separateTaxationItem: item,
});

describe("PSA-X — 분리과세 공장용지 허가·사용승인 미이행 422", () => {
  it("허가·사용승인 미이행 공장용지 → 422 · «종합합산 과세 유형으로 재입력» (별도합산 안내 없음) · 단서 조문 상수 인용", async () => {
    const r = await post(separated({ isFactoryLand: true, factoryLocation: "industrial_zone", factoryIsUnpermitted: true }));
    expect(r.status, JSON.stringify(r.json)).toBe(422);
    const msg: string = r.json.error.message;
    expect(msg).toContain("종합합산 과세 유형으로 재입력하세요.");
    expect(msg).not.toContain("종합합산 또는 별도합산");
    expect(msg).toContain(`${PROPERTY.SEPARATE.STANDARD_FACTORY} 단서`);
    expect(msg).toContain(PROPERTY_SEPARATE.BUILDING_PERMIT_101);
  });

  it("공장용지가 아닌 분리과세 요건 불충족(농지 아님·용도 불일치)은 종전 문구 유지 — 별도합산 안내가 맞는 경우", async () => {
    const r = await post(separated({ landCategory: "대", actualUsage: "주차장" }));
    expect(r.status, JSON.stringify(r.json)).toBe(422);
    expect(r.json.error.message).toBe("분리과세 대상 요건을 충족하지 않습니다. 종합합산 또는 별도합산 과세 유형으로 재입력하세요.");
  });

  it("공장용지이나 단서 미해당(허가 이행) 요건 불충족은 종전 문구 유지", async () => {
    const r = await post(separated({ isFactoryLand: true, factoryLocation: "urban", factoryIsUnpermitted: false }));
    expect(r.status, JSON.stringify(r.json)).toBe(422);
    expect(r.json.error.message).toContain("종합합산 또는 별도합산 과세 유형으로 재입력하세요.");
  });
});
