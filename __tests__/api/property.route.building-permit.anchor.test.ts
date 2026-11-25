/**
 * PSA-E3 — 본 경로(비철거) 건축물 허가·사용승인 칸의 입구: ⑫ Zod 새 키 선언(침묵 strip 가드 · M5) · ⑩ superRefine(`propertyBuildingPermitFactIssue` — ⑧과 같은 함수) · 철거 필지 무시 · 세액.
 * 계획서 docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md §6 ⑫ · §7.3(K-27~K-29).
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
import { PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE } from "@/lib/tax-engine/property-separate-requirements";

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
const itemErrors = (json: { error?: { details?: Record<string, string[]> } }) => json.error?.details?.separateAggregateItem ?? [];

/** 비철거 건축물 300㎡ 상업(3배) · 바닥 100 — 별도합산 430,000 / 516,000 */
const ITEM = { id: "p1", jurisdictionCode: "000000", landArea: 300, officialLandPrice: 1_000_000, zoningDistrict: "commercial", buildingFloorArea: 100 };
const land = (item: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  objectType: "land",
  landTaxType: "separate_aggregate",
  publishedPrice: 300_000_000,
  targetDate: "2026-06-01",
  otherSeparateAggregateValue: 0,
  otherComprehensiveValue: 0,
  separateAggregateItem: item,
  ...extra,
});

describe("⑫ — buildingPermit 선언(침묵 strip 가드 · M5): 선언이 빠지면 yes도 사라져 항상 «허가 없음»으로 접힌다", () => {
  it("대조군 yes → 200 · 별도합산 430,000 / 516,000 (키가 strip되면 800,000 / 960,000)", async () => {
    const r = await post(land({ ...ITEM, buildingPermit: "yes" }));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect([r.json.data.determinedTax, r.json.data.totalPayable]).toEqual([430_000, 516_000]);
    expect(r.json.data.landSplit?.comprehensive).toBeUndefined();
  });

  it("K-27 no → 200 · 종합합산 이관 800,000 / 960,000 · 사유 building_permit · 고지", async () => {
    const r = await post(land({ ...ITEM, buildingPermit: "no" }));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect([r.json.data.determinedTax, r.json.data.totalPayable]).toEqual([800_000, 960_000]);
    expect(r.json.data.landSplit.comprehensive.transferReasons).toEqual(["building_permit"]);
    expect(r.json.data.warnings.join("\n")).toContain("사용승인");
  });

  it("unknown → 200 · 이관 800,000 / 960,000(혜택 불성립 + 확인 필요)", async () => {
    const r = await post(land({ ...ITEM, buildingPermit: "unknown" }));
    expect(r.status).toBe(200);
    expect(r.json.data.determinedTax).toBe(800_000);
    expect(r.json.data.warnings.join("\n")).toContain("확인되지 않아");
  });

  it("3지선다 밖의 값은 400", async () => {
    expect((await post(land({ ...ITEM, buildingPermit: "maybe" }))).status).toBe(400);
  });
});

describe("⑩ — 요구된 칸이 비면 400(⑧과 같은 문구) · 요구되지 않은 칸은 무시", () => {
  it("과세기준일 2026 · 철거 OFF · 칸 없음 → 400 · 허가 문구", async () => {
    const r = await post(land(ITEM));
    expect(r.status).toBe(400);
    expect(itemErrors(r.json)).toEqual([PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE]);
  });

  it("미선택 \"\" → 400 · 같은 문구", async () => {
    expect(itemErrors((await post(land({ ...ITEM, buildingPermit: "" }))).json)).toEqual([PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE]);
  });

  it("공장용지도 같은 요구(§101① 단서는 1호·2호 공통)", async () => {
    expect(itemErrors((await post(land({ ...ITEM, isFactory: true }))).json)).toEqual([PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE]);
    expect((await post(land({ ...ITEM, isFactory: true, buildingPermit: "yes" }))).status).toBe(200);
  });

  it("과세기준일 2011-05-31 이전(2010-06-01) → 칸 비요구 · 200 · 허가 no를 보내도 무시(별도합산 유지 430,000)", async () => {
    const r0 = await post(land(ITEM, { targetDate: "2010-06-01" }));
    expect(r0.status, JSON.stringify(r0.json)).toBe(200);
    expect(r0.json.data.determinedTax).toBe(430_000);
    const r1 = await post(land({ ...ITEM, buildingPermit: "no" }, { targetDate: "2010-06-01" }));
    expect(r1.status).toBe(200);
    expect(r1.json.data.determinedTax).toBe(430_000);
  });

  it("2011-06-01 첫 요구 시행본 — 칸 없음 400 · no 접힘(이관 800,000)", async () => {
    expect((await post(land(ITEM, { targetDate: "2011-06-01" }))).status).toBe(400);
    const r = await post(land({ ...ITEM, buildingPermit: "no" }, { targetDate: "2011-06-01" }));
    expect(r.status).toBe(200);
    expect(r.json.data.determinedTax).toBe(800_000);
  });

  it("철거 ON — 허가 칸 비요구(철거 경로는 demolishedPermit이 맡는다) · buildingPermit no를 보내도 무시", async () => {
    const dem = { ...ITEM, demolished: true, demolishedDate: "2026-01-01", demolishedKind: "building", demolishedPermit: "yes", demolishedOtherUse: "no" };
    const a = await post(land(dem));
    const b = await post(land({ ...dem, buildingPermit: "no" }));
    expect(a.status, JSON.stringify(a.json)).toBe(200);
    expect(b.status).toBe(200);
    expect(b.json.data.determinedTax).toBe(430_000);
    expect(JSON.stringify(b.json.data)).toBe(JSON.stringify(a.json.data));
  });

  it("전량 접힘이면 합산 칸 요구가 바뀐다 — 허가 no는 종합합산 칸만 요구(타 종합합산 빈칸 400 · 타 별도합산 빈칸은 무관)", async () => {
    const noComp = await post(land({ ...ITEM, buildingPermit: "no" }, { otherComprehensiveValue: undefined }));
    expect(noComp.status).toBe(400);
    const noSep = await post(land({ ...ITEM, buildingPermit: "no" }, { otherSeparateAggregateValue: undefined }));
    expect(noSep.status).toBe(200);
  });
});
