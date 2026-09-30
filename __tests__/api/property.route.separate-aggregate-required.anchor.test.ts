/**
 * 재산세 별도합산 필지 — 바닥면적·철거일 누락이 조용히 종합합산이 되던 결함 (2026-09-30 Zod↔엔진 필수 점검).
 *
 * 엔진(`separate-aggregate-land.ts`)은 바닥면적이 없으면 「건축물 없음」, 철거일이 없으면 「철거일 미확인」으로
 * **종합합산** 처리한다. ⑧(`components/calc/property/shared.ts` step 2)은 두 값을 요구하지만 ⑫ Zod는
 * 요구하지 않았다 — 그래서 누락이 200으로 통과해 고지액이 2,280,000 → 0이 됐다.
 *
 * - SA-UI: **UI로도 닿았다.** ④가 공장용지일 때 바닥면적을 빼고 보냈다(⑧은 바닥면적을 요구·통과).
 * - SA-1·2: API 직접 호출 — 누락은 400(정확한 경로), 값이 있으면 세액 불변.
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
// .env.local의 NEXT_PUBLIC_SUPABASE_URL이 있어도 네트워크로 나가지 않는다 — 실패 시 내부 상수 경로.
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockRejectedValue(new Error("offline")) };
});

import { POST } from "@/app/api/calc/property/route";
import {
  INITIAL_FORM,
  buildPropertyTaxRequestBody,
  validateStep,
  type FormState,
} from "@/components/calc/property/shared";

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

const paths = (json: { error?: { details?: Record<string, unknown> } }, raw: unknown) =>
  JSON.stringify(raw ?? json);

const ITEM = {
  id: "p1",
  jurisdictionCode: "000000",
  landArea: 1000,
  officialLandPrice: 1_000_000,
  zoningDistrict: "industrial",
  buildingFloorArea: 300,
};
const LAND = {
  objectType: "land",
  publishedPrice: 1_000_000_000,
  landTaxType: "separate_aggregate",
  targetDate: "2025-06-01",
};

describe("SA-UI — 공장용지 체크 시 ④가 바닥면적을 싣는다", () => {
  const form: FormState = {
    ...INITIAL_FORM,
    objectType: "land",
    publishedPrice: "1,000,000,000",
    landTaxType: "separate_aggregate",
    saZoningDistrict: "industrial",
    saLandArea: "1000",
    saBuildingFloorArea: "300",
  };

  it("⑧ 통과 + body에 바닥면적 + 공장용지·일반 고지액이 같다(기준면적 = 바닥면적 × 배율)", async () => {
    const factory = { ...form, saIsFactory: true };
    expect(validateStep(2, factory)).toBeNull();
    const body = buildPropertyTaxRequestBody(factory);
    expect(body.separateAggregateItem).toMatchObject({ isFactory: true, buildingFloorArea: 300 });

    const f = await post({ ...body, targetDate: "2025-06-01" });
    const g = await post({ ...buildPropertyTaxRequestBody(form), targetDate: "2025-06-01" });
    expect(f.status, paths(f.json, f.json.error)).toBe(200);
    expect(g.status).toBe(200);
    expect(g.json.data.totalPayable).toBe(2_280_000);
    expect(f.json.data.totalPayable).toBe(2_280_000);
  });
});

describe("SA-1·2 — API 직접 호출 누락은 400", () => {
  it("🟢 대조군: 바닥면적 있음 → 200 · 2,280,000", async () => {
    const r = await post({ ...LAND, separateAggregateItem: ITEM });
    expect(r.status).toBe(200);
    expect(r.json.data.totalPayable).toBe(2_280_000);
  });

  it("🟢 대조군: 철거 + 철거일 있음 → 200 · 2,280,000", async () => {
    const r = await post({
      ...LAND,
      separateAggregateItem: { ...ITEM, demolished: true, demolishedDate: "2025-03-01" },
    });
    expect(r.status).toBe(200);
    expect(r.json.data.totalPayable).toBe(2_280_000);
  });

  it("SA-1 🔴 바닥면적 없음 → 400 `separateAggregateItem.buildingFloorArea`", async () => {
    const { buildingFloorArea: _omit, ...item } = ITEM;
    const r = await post({ ...LAND, separateAggregateItem: item });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("바닥면적");
  });

  it("SA-1b 🔴 공장용지 + 바닥면적 없음 → 400", async () => {
    const { buildingFloorArea: _omit, ...item } = ITEM;
    const r = await post({ ...LAND, separateAggregateItem: { ...item, isFactory: true } });
    expect(r.status).toBe(400);
  });

  it("SA-2 🔴 철거 + 철거일 없음 → 400 `separateAggregateItem.demolishedDate`", async () => {
    const r = await post({ ...LAND, separateAggregateItem: { ...ITEM, demolished: true } });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("철거일");
  });
});

describe("주택 — 부속토지 시가표준액 정수", () => {
  it("P5b 🔴 부속토지 시가표준액 소수 → 400 (종전 BigInt RangeError 500)", async () => {
    const r = await post({
      objectType: "housing",
      publishedPrice: 600_000_000,
      isUrbanArea: true,
      targetDate: "2025-06-01",
      housingBuildingValue: 200_000_000,
      taxpayerInfo: { registeredOwner: "A", isHouseSplit: true, buildingOwner: "B", landOwner: "C", landStdValue: 400_000_000.5 },
    });
    expect(r.status).toBe(400);
  });
});
