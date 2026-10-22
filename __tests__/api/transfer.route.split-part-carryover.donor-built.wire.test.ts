/**
 * PR-3 ⑫⑬⑭ — 주택 split 파트 이월과세 **건물 파트**의 «증여자 신축·증축» §114조의2 가산세가 route를 지나 엔진에 닿는다 (2026-10-22)
 *
 * 계획: docs/00-pm/carryover-donor-built-114-2.plan.md §5.2(P6 두 셀) · §13 PR-3
 *   · ⑫ 건물 파트 shape(`splitCarryoverBuildingPartShape`)만 `donorBuilt`를 받는다 — 토지 파트·`housing` 키·불완전 증축·날짜 범위는 400.
 *   · ⑭ 합성기가 `constructionDate`를 Date 로 바꿔 엔진에 싣는다 — 안 바꾸면 5년 기산(`addYears`)이 침묵 오작동한다.
 *   · 침묵 strip 방지: ⑫에 없는 키는 400이 아니라 200 + 가산세 0 이다. A 채택 셀의 가산세 5,000,000 이 그 증거다.
 * mock 세율 — 같은 시드끼리 상대 비교만 의미가 있다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const BASE = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 800_000_000,
  transferDate: "2025-06-30",
  acquisitionPrice: 0,
  expenses: 0,
  isOneHousehold: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  residencePeriodMonths: 120,
  annualBasicDeductionUsed: 0,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landTransferPrice: 480_000_000,
  buildingTransferPrice: 320_000_000,
  landStandardPriceAtTransfer: 480_000_000,
  buildingStandardPriceAtTransfer: 320_000_000,
};

const DB_NEW = { buildingType: "new", constructionDate: "2021-08-01" };

/** 건물 증여 2024-06-15(증여자 건물 2021-08-01 환산) / 토지 매매 2008-01-01 — 계획서 §5.2 P6 시드(probe p3) */
const B = (std: number, giftVal: number, donorBuilt?: Record<string, unknown>, part: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
  ...BASE,
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2024-06-15",
  buildingAcquisitionPrice: giftVal,
  landAcquisitionCause: "purchase",
  landAcquisitionDate: "2008-01-01",
  landAcquisitionPrice: 120_000_000,
  isSeparateAcquisition: true,
  carryoverGiftEvent: { giftRegistryDate: "2024-06-15", giftTaxCalculated: 0, giftTaxBase: giftVal, donorRelation: "lineal" },
  buildingCarryoverPart: {
    donorAcquisitionDate: "2021-08-01",
    useEstimatedAcquisition: true,
    donorStandardPriceAtAcquisition: std,
    ...(donorBuilt ? { donorBuilt } : {}),
    ...part,
  },
  ...over,
});

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = await res.json();
  return { status: res.status, r: json?.data?.result, errors: (json?.error?.fieldErrors ?? {}) as Record<string, string[]> };
}
const errText = (o: { errors: Record<string, string[]> }) => Object.entries(o.errors).map(([k, v]) => `${k}: ${v.join(" ")}`).join(" | ");

describe("WIRE-1 — 건물 파트 donorBuilt 가 엔진에 닿는다 (strip 이면 가산세 0)", () => {
  it("A 채택: 가산세 5,000,000 · 총납부 176,497,200 (donorBuilt 없으면 170,997,200)", async () => {
    const on = await post(B(100_000_000, 315_000_000, DB_NEW));
    expect(on.status, errText(on)).toBe(200);
    expect(on.r.penaltyTax).toBe(5_000_000);
    expect(on.r.penaltyBase).toBe(100_000_000);
    expect(on.r.totalTax).toBe(176_497_200);
    expect(on.r.splitDetail.building.carryover.donorBuiltPenalty).toMatchObject({ applied: true, base: 100_000_000, penalty: 5_000_000, fifthAnniversary: "2026-08-01" });
    const off = await post(B(100_000_000, 315_000_000));
    expect(off.r.penaltyTax).toBe(0);
    expect(off.r.totalTax).toBe(170_997_200);
    expect(off.r.splitDetail.building.carryover.donorBuiltPenalty).toBeUndefined();
  });

  it("②3호 B 채택: 총납부 243,870,000 변화 0 · echo scenario_b", async () => {
    const on = await post(B(250_000_000, 200_000_000, DB_NEW));
    expect(on.status, errText(on)).toBe(200);
    expect(on.r.totalTax).toBe(243_870_000);
    expect(on.r.penaltyTax).toBe(0);
    expect(on.r.splitDetail.building.carryover.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
  });

  it("증축 85.01㎡: 증축 부분 환산취득가액 2천만의 5% = 1,000,000 (85㎡는 0)", async () => {
    const ext = (area: number) => ({ buildingType: "extension", constructionDate: "2021-08-01", extensionFloorArea: area, extensionStdPriceAtAcquisition: 20_000_000 });
    expect((await post(B(100_000_000, 315_000_000, ext(85)))).r.penaltyTax).toBe(0);
    const o = await post(B(100_000_000, 315_000_000, ext(85.01)));
    expect(o.status, errText(o)).toBe(200);
    expect(o.r.penaltyTax).toBe(1_000_000);
    expect(o.r.penaltyBase).toBe(20_000_000);
  });
});

describe("WIRE-2 ⑫ 거부 — 400 (조용히 무시하지 않는다)", () => {
  it("토지 파트 donorBuilt", async () => {
    const o = await post({
      ...BASE,
      acquisitionCause: "purchase",
      acquisitionDate: "2022-06-01",
      buildingAcquisitionPrice: 200_000_000,
      landAcquisitionCause: "carryover_gift",
      landAcquisitionDate: "2024-06-15",
      landAcquisitionPrice: 300_000_000,
      isSeparateAcquisition: true,
      carryoverGiftEvent: { giftRegistryDate: "2024-06-15", giftTaxCalculated: 0, giftTaxBase: 300_000_000, donorRelation: "lineal" },
      landCarryoverPart: { donorAcquisitionDate: "2005-01-01", useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 20_000_000, donorBuilt: DB_NEW },
    });
    expect(o.status).toBe(400);
  });
  it("건물 파트가 실가 입력(환산 아님)", async () => {
    const o = await post(B(0, 315_000_000, DB_NEW, { useEstimatedAcquisition: undefined, donorStandardPriceAtAcquisition: undefined, donorAcquisitionPrice: 50_000_000 }));
    expect(o.status).toBe(400);
    expect(errText(o)).toContain("환산취득가액으로 계산할 때만");
  });
  it("일체 주택 안분 housing 키 — split 파트는 받지 않는다(strict)", async () => {
    const o = await post(B(100_000_000, 315_000_000, { ...DB_NEW, housing: { landPricePerSqmAtAcquisition: 1, landArea: 1, buildingStdPriceAtAcquisition: 1, landStdPriceAtTransfer: 1, buildingStdPriceAtTransfer: 1 } }));
    expect(o.status).toBe(400);
  });
  it("증축 — 바닥면적·증축 부분 기준시가 누락", async () => {
    const a = await post(B(100_000_000, 315_000_000, { buildingType: "extension", constructionDate: "2021-08-01", extensionStdPriceAtAcquisition: 20_000_000 }));
    expect(a.status).toBe(400);
    expect(errText(a)).toContain("바닥면적");
    const b = await post(B(100_000_000, 315_000_000, { buildingType: "extension", constructionDate: "2021-08-01", extensionFloorArea: 90 }));
    expect(b.status).toBe(400);
    expect(errText(b)).toContain("증축 부분");
  });
  it("신축일이 증여자 취득일 전 / 증여 등기접수일 후", async () => {
    expect((await post(B(100_000_000, 315_000_000, { buildingType: "new", constructionDate: "2021-07-31" }))).status).toBe(400);
    expect((await post(B(100_000_000, 315_000_000, { buildingType: "new", constructionDate: "2024-06-16" }))).status).toBe(400);
  });
});
