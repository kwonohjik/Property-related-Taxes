/**
 * PSE-E3 — 분리과세(공장·목장) 면적 한도 초과: 같은 관할구역 종합합산 칸(`otherComprehensiveValue`)의 ⑫ 입구.
 * 계획서 K-2·K-4~K-9·K-12 · M-8. 요구 술어 하나(`propertyLandSplitRequiredFor`)가 ⑧·⑫·엔진을 정한다.
 * - 침묵 strip 가드: 면적 입력 키가 Zod를 통과해 엔진에 도달해야 이관분 세액이 나온다(빠지면 전량 분리과세 = 과소 과세).
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
import { PROPERTY_LAND_SPLIT_INPUT_MESSAGE } from "@/lib/tax-engine/property-land-split-tax";

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
const detailsOf = (json: { error?: { details?: Record<string, string[]> } }) => json.error?.details ?? {};

const FACTORY = { isFactoryLand: true, factoryLocation: "industrial_zone", factoryFloorArea: 1200, factoryAreaRatePercent: 12 };
const F_OVER = { objectType: "land", landTaxType: "separated", publishedPrice: 1_500_000_000, targetDate: "2026-06-01", separateTaxationItem: { ...FACTORY, factoryTotalLandArea: 15000 } };
const F_WITHIN = { ...F_OVER, publishedPrice: 800_000_000, separateTaxationItem: { ...FACTORY, factoryTotalLandArea: 8000 } };
const PASTURE = { isLivestockFarm: true, pastureLivestockType: "hanwoo_breeding", pastureLivestockCount: 50, pastureHasFacility: true, pastureIsUrbanArea: false };
const P_OVER = { objectType: "land", landTaxType: "separated", publishedPrice: 100_000_000, targetDate: "2026-06-01", separateTaxationItem: { ...PASTURE, pastureTotalLandArea: 2000 } };

describe("⑫ — 분리과세 한도 초과 > 0이면 종합합산 칸 필수(K-7)", () => {
  it("공장 초과 · 빈칸 → 400 · 경로 otherComprehensiveValue · 문구는 엔진 상수(별도합산 칸은 요구하지 않는다)", async () => {
    const r = await post(F_OVER);
    expect(r.status).toBe(400);
    expect(detailsOf(r.json).otherComprehensiveValue).toEqual([PROPERTY_LAND_SPLIT_INPUT_MESSAGE.otherComprehensiveValue]);
    expect(detailsOf(r.json).otherSeparateAggregateValue).toBeUndefined();
  });

  it("목장 초과 · 빈칸 → 400", async () => {
    const r = await post(P_OVER);
    expect(r.status).toBe(400);
    expect(detailsOf(r.json).otherComprehensiveValue).toEqual([PROPERTY_LAND_SPLIT_INPUT_MESSAGE.otherComprehensiveValue]);
  });

  it("K-2·K-8 공장 · `0` = 없음 → 200 · 본세 2,480,000 / 총 2,976,000 (면적 키가 strip되면 1,680,000)", async () => {
    const r = await post({ ...F_OVER, otherComprehensiveValue: 0 });
    expect(r.status).toBe(200);
    expect(r.json.data.determinedTax).toBe(2_480_000);
    expect(r.json.data.totalPayable).toBe(2_976_000);
    expect(r.json.data.landSplit.separated.tax).toBe(1_680_000);
    expect(r.json.data.landSplit.comprehensive.share).toBe(800_000);
    expect(r.json.data.landSplit.separated.areaLimit).toEqual({ kind: "factory", totalArea: 15000, standardArea: 12000, recognizedArea: 12000, excessArea: 3000 });
  });

  it("K-4 공장 · 타 종합합산 2억 → 3,096,000 (키가 strip되면 합산이 사라져 2,976,000)", async () => {
    const r = await post({ ...F_OVER, otherComprehensiveValue: 200_000_000 });
    expect(r.status).toBe(200);
    expect(r.json.data.totalPayable).toBe(3_096_000);
    expect(r.json.data.landSplit.comprehensive.share).toBe(900_000);
  });

  it("K-5·K-6 목장 · 0 → 133,874 · 2억 → 230,379", async () => {
    const zero = await post({ ...P_OVER, otherComprehensiveValue: 0 });
    expect(zero.status).toBe(200);
    expect(zero.json.data.totalPayable).toBe(133_874);
    const merged = await post({ ...P_OVER, otherComprehensiveValue: 200_000_000 });
    expect(merged.json.data.totalPayable).toBe(230_379);
  });

  it("K-9 음수·소수·문자열 → 400", async () => {
    for (const v of [-1, 1.5, "0"]) expect((await post({ ...F_OVER, otherComprehensiveValue: v })).status).toBe(400);
  });
});

describe("⑫ — 초과 0·한도 없는 유형·판정 불가는 요구하지 않는다(K-1·K-11·K-12·K-15)", () => {
  it("K-1 한도 이내 · 빈칸 → 200 · landSplit 없음 · 1,344,000 / stale 값(7.77억)이 있어도 같다", async () => {
    const clean = await post(F_WITHIN);
    const stale = await post({ ...F_WITHIN, otherComprehensiveValue: 777_000_000 });
    expect(clean.status).toBe(200);
    expect(stale.status).toBe(200);
    expect(clean.json.data.totalPayable).toBe(1_344_000);
    expect(stale.json.data.totalPayable).toBe(1_344_000);
    expect(clean.json.data.landSplit).toBeUndefined();
    expect(stale.json.data.landSplit).toBeUndefined();
  });

  it("초과 > 0이어도 타 별도합산 칸은 읽지 않는다 — 있어도 결과 동일", async () => {
    const r = await post({ ...F_OVER, otherComprehensiveValue: 0, otherSeparateAggregateValue: 999_000_000 });
    expect(r.status).toBe(200);
    expect(r.json.data.totalPayable).toBe(2_976_000);
  });

  it("K-15 농지·골프장 — 합산 칸 비요구(보내도 무해)", async () => {
    const farm = await post({ objectType: "land", landTaxType: "separated", publishedPrice: 100_000_000, targetDate: "2026-06-01", separateTaxationItem: { isFarmland: true }, otherComprehensiveValue: 5 });
    expect(farm.status).toBe(200);
    expect(farm.json.data.landSplit).toBeUndefined();
  });

  it("K-12 면적 입력 누락 — 술어는 요구 없음이되 엔진이 같은 판정에서 던진다(400 아님 · 침묵 200 아님)", async () => {
    const noTotal = await post({ ...F_OVER, separateTaxationItem: { ...FACTORY } });
    expect(noTotal.status).not.toBe(200);
    expect(noTotal.status).not.toBe(400);
    const noCount = await post({ ...P_OVER, separateTaxationItem: { ...PASTURE, pastureTotalLandArea: 2000, pastureLivestockCount: 0 } });
    expect(noCount.status).not.toBe(200);
  });

  it("K-11 시지역 그 밖 공장·허가 미이행 — 합산 칸을 요구하지 않고 기존 거절 그대로", async () => {
    for (const item of [{ ...FACTORY, factoryTotalLandArea: 15000, factoryLocation: "urban" }, { ...FACTORY, factoryTotalLandArea: 15000, factoryIsUnpermitted: true }]) {
      const r = await post({ ...F_OVER, separateTaxationItem: item });
      expect(r.status).not.toBe(200);
      expect(detailsOf(r.json).otherComprehensiveValue).toBeUndefined();
    }
  });
});
