/**
 * P6 ⑫⑬⑭ — 주택 split 파트 이월과세의 «증여자 취득가액 환산»(증여자 취득 당시 그 파트 기준시가)이 route를 지나 엔진에 닿는다 (2026-10-21)
 *
 * 계획: docs/00-pm/transfer-split-part-carryover-p6.plan.md §5.1 · §6 Q1·Q2
 *   · ⑫ 파트 shape: `useEstimatedAcquisition`(optional) · `donorStandardPriceAtAcquisition`(양수) · `donorAcquisitionPrice`(optional) — 상호배타 + 하나 필수.
 *   · ⑫ 환산 파트는 그 파트 양도시 기준시가(분모)가 필수다.
 *   · ⑭ 합성기가 분자를 엔진 input으로 옮긴다 — 안 옮기면 UI가 켠 환산이 꺼진 채(실가 경로) 계산되거나 400이 아니라 조용히 strip된다.
 *   · Q1 증여자 같은 날 취득 × 환산은 leaf S10이 ⑫에서도 막는다.
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
import { PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE } from "@/lib/tax-engine/transfer-split-part-cause";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 비1주택 · 양도 8억(토지 4.8억 + 건물 3.2억) · 양도일 2025-06-30 */
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

const EVENT = (over: Record<string, unknown> = {}) => ({
  giftRegistryDate: "2024-06-15",
  giftTaxCalculated: 20_000_000,
  giftTaxBase: 200_000_000,
  donorRelation: "lineal",
  ...over,
});

/** A1 — 건물 매매 2022-06-01 / 토지 증여 2024-06-15 · 증여자 토지 2005-01-01 (M1 시드) */
const A1 = (part: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  ...BASE,
  acquisitionCause: "purchase",
  acquisitionDate: "2022-06-01",
  buildingAcquisitionPrice: 200_000_000,
  landAcquisitionCause: "carryover_gift",
  landAcquisitionDate: "2024-06-15",
  landAcquisitionPrice: 300_000_000,
  isSeparateAcquisition: true,
  carryoverGiftEvent: EVENT({ giftTaxBase: 300_000_000 }),
  landCarryoverPart: { donorAcquisitionDate: "2005-01-01", ...part },
  ...over,
});

/** B2 — 건물 증여 2024-06-15 · 증여자 건물 2015-06-01 / 토지 매매 2008-01-01 */
const B2 = (part: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  ...BASE,
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2024-06-15",
  buildingAcquisitionPrice: 200_000_000,
  landAcquisitionCause: "purchase",
  landAcquisitionDate: "2008-01-01",
  landAcquisitionPrice: 120_000_000,
  isSeparateAcquisition: true,
  carryoverGiftEvent: EVENT(),
  buildingCarryoverPart: { donorAcquisitionDate: "2015-06-01", ...part },
  ...over,
});

/** C — 통째 증여 2024-06-15 · 증여자 토지 1995-03-01 / 건물 2015-06-01 */
const C = (landPart: Record<string, unknown>, buildingPart: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  ...BASE,
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2024-06-15",
  buildingAcquisitionPrice: 200_000_000,
  landAcquisitionCause: "carryover_gift",
  landAcquisitionDate: "2024-06-15",
  landAcquisitionPrice: 200_000_000,
  isSeparateAcquisition: false,
  carryoverGiftEvent: EVENT({ giftTaxCalculated: 30_000_000, giftTaxBase: 400_000_000 }),
  landCarryoverPart: { donorAcquisitionDate: "1995-03-01", ...landPart },
  buildingCarryoverPart: { donorAcquisitionDate: "2015-06-01", ...buildingPart },
  ...over,
});

const EST = (n: number, extra: Record<string, unknown> = {}) => ({ useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: n, ...extra });

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = await res.json();
  return { status: res.status, json, r: json?.data?.result, errors: (json?.error?.fieldErrors ?? {}) as Record<string, string[]> };
}
const errText = (o: { errors: Record<string, string[]> }) => Object.values(o.errors).flat().join(" | ");

describe("환산 파트 — route 끝까지 (키 strip 없음)", () => {
  it("A 토지만 환산: 200 · 환산 분기로 계산 (M1 141,212,000 — 실가 2천만 141,380,000과 다르다)", async () => {
    const o = await post(A1(EST(20_000_000)));
    expect(o.status).toBe(200);
    const land = o.r.splitDetail.land;
    expect(land.acqMode).toBe("estimated"); // 합성기가 환산을 꺼서(고정 false) 보내면 actual이 된다
    expect(land.carryover.estimated).toEqual({
      donorStdPriceAtAcquisition: 20_000_000,
      stdPriceAtTransfer: 480_000_000,
      estimatedAcquisitionPrice: 20_000_000,
      lumpDeduction: 600_000,
    });
    expect(land.carryover.donorAcquisitionPrice).toBeUndefined();
    expect(o.r.determinedTax).toBe(141_212_000);
    const actual = await post(A1({ donorAcquisitionPrice: 20_000_000 }));
    expect(actual.status).toBe(200);
    expect(actual.r.determinedTax).toBe(141_380_000);
    expect(actual.r.splitDetail.land.carryover.donorAcquisitionPrice).toBe(20_000_000);
    expect(actual.r.splitDetail.land.carryover.estimated).toBeUndefined();
  });

  it("분자가 세액에 도달한다 — 2천만과 4천만이 다르다 (분자 strip이면 같다)", async () => {
    const a = await post(A1(EST(20_000_000)));
    const b = await post(A1(EST(40_000_000)));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.r.determinedTax).not.toBe(b.r.determinedTax);
    expect(b.r.splitDetail.land.carryover.estimated.donorStdPriceAtAcquisition).toBe(40_000_000);
  });

  it("증여자 자본적지출도 환산 파트에 닿는다 (2,100만 > 20.6M → 단서 swap)", async () => {
    const o = await post(A1(EST(20_000_000, { donorCapitalExpenditure: 21_000_000 })));
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.land.swapApplied).toBe(true);
    expect(o.r.determinedTax).toBe(141_100_000);
  });

  it("B 건물만 환산: 200 · ②3호로 미적용 221,700,000 · 분자 echo", async () => {
    const o = await post(B2(EST(30_000_000)));
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(221_700_000);
    expect(o.r.splitDetail.building.carryover.estimated).toEqual({ donorStdPriceAtAcquisition: 30_000_000 });
  });

  it("C 토지만 환산 + 건물 실가 혼합: 200 · 244,170,000", async () => {
    const o = await post(C(EST(50_000_000), { donorAcquisitionPrice: 50_000_000 }));
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(244_170_000);
    expect(o.r.splitDetail.land.carryover.estimated.donorStdPriceAtAcquisition).toBe(50_000_000);
    expect(o.r.splitDetail.building.carryover.donorAcquisitionPrice).toBe(50_000_000);
  });

  it("C 둘 다 환산: 200 · 244,170,000", async () => {
    const o = await post(C(EST(50_000_000), EST(50_000_000)));
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(244_170_000);
  });

  it("옛 payload(환산 키 없음 · 실가) 그대로 200 — 회귀 0", async () => {
    const o = await post(C({ donorAcquisitionPrice: 50_000_000 }, { donorAcquisitionPrice: 50_000_000 }));
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(244_800_000);
  });
});

describe("⑫ refine — 가액 ⇔ 환산 분자 (상호배타 + 하나 필수)", () => {
  it("환산인데 증여자 취득가액도 보내면 400", async () => {
    const o = await post(A1(EST(20_000_000, { donorAcquisitionPrice: 20_000_000 })));
    expect(o.status).toBe(400);
    expect(o.errors["landCarryoverPart.donorAcquisitionPrice"]?.join(" ")).toContain("둘 중 하나만 입력합니다");
  });

  it("환산인데 분자가 없으면 400", async () => {
    const o = await post(A1({ useEstimatedAcquisition: true }));
    expect(o.status).toBe(400);
    expect(o.errors["landCarryoverPart.donorStandardPriceAtAcquisition"]?.join(" ")).toContain("증여자 취득 당시 그 파트 기준시가가 필요합니다");
  });

  it("환산이 아닌데 분자를 보내면 400 (조용히 버려지는 입력 금지) — 미지정·false 모두", async () => {
    for (const flag of [{}, { useEstimatedAcquisition: false }]) {
      const o = await post(A1({ ...flag, donorAcquisitionPrice: 20_000_000, donorStandardPriceAtAcquisition: 20_000_000 }));
      expect(o.status).toBe(400);
      expect(o.errors["landCarryoverPart.donorStandardPriceAtAcquisition"]?.join(" ")).toContain("환산취득가액을 쓸 때만 보낼 수 있습니다");
    }
  });

  it("환산이 아닌데 가액도 없으면 400 — 가액이 optional이 되어도 필수는 그대로다", async () => {
    const o = await post(A1({}));
    expect(o.status).toBe(400);
    expect(o.errors["landCarryoverPart.donorAcquisitionPrice"]?.join(" ")).toContain("증여자 취득가액이 필요합니다");
  });

  it("분자는 양수 정수 — 0·음수·소수는 400 (0이면 환산취득가 0 침묵)", async () => {
    for (const bad of [0, -1, 1.5]) {
      const o = await post(A1(EST(bad)));
      expect(o.status).toBe(400);
    }
  });

  it("건물 파트도 같은 규칙", async () => {
    expect((await post(B2(EST(30_000_000, { donorAcquisitionPrice: 1 })))).status).toBe(400);
    expect((await post(B2({ useEstimatedAcquisition: true }))).status).toBe(400);
    expect((await post(B2({}))).status).toBe(400);
  });
});

describe("⑫ refine — 환산 파트는 그 파트 양도시 기준시가(분모)가 필수", () => {
  it("토지 환산인데 양도시 토지 기준시가가 없으면 400 (연혁 면제 없음)", async () => {
    const o = await post(A1(EST(20_000_000), { landStandardPriceAtTransfer: undefined }));
    expect(o.status).toBe(400);
    expect(errText(o)).toContain("환산취득가액의 분모인 양도 당시 토지 기준시가가 필요합니다");
    expect(o.errors["landStandardPriceAtTransfer"]).toBeDefined();
  });

  it("건물 환산인데 양도시 건물 기준시가가 없으면 400", async () => {
    const o = await post(B2(EST(30_000_000), { buildingStandardPriceAtTransfer: undefined }));
    expect(o.status).toBe(400);
    expect(o.errors["buildingStandardPriceAtTransfer"]?.join(" ")).toContain("환산취득가액의 분모인 양도 당시 건물 기준시가가 필요합니다");
  });

  it("양도시 감정평가가액 양쪽이 있어 V7이 건너뛰어져도 환산 분모는 요구한다 (엔진 throw → 400 대신 필드 오류)", async () => {
    const o = await post(
      A1(EST(20_000_000), { landStandardPriceAtTransfer: undefined, landAppraisalAtTransfer: 480_000_000, buildingAppraisalAtTransfer: 320_000_000 }),
    );
    expect(o.status).toBe(400);
    expect(o.errors["landStandardPriceAtTransfer"]).toBeDefined();
  });

  it("실가 파트는 분모를 요구하지 않는다 — 환산이 없는 경로는 현행 그대로 (건물 환산만 분모 필수라 토지 분모 없이도 건물 환산 통과 여부는 V7이 정한다)", async () => {
    const o = await post(A1({ donorAcquisitionPrice: 20_000_000 }));
    expect(o.status).toBe(200);
  });
});

describe("Q1 — 증여자 같은 날 취득 × 환산은 ⑫에서 막는다 (leaf S10)", () => {
  it("A: 증여자 토지 취득일 = 건물 취득일 → 400, 앵커 landCarryoverPart", async () => {
    const o = await post(A1(EST(20_000_000, { donorAcquisitionDate: "2022-06-01" })));
    expect(o.status).toBe(400);
    expect(o.errors["landCarryoverPart"]?.join(" ")).toContain(PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE);
  });

  it("B: 증여자 건물 취득일 = 토지 취득일 → 400, 앵커 buildingCarryoverPart", async () => {
    const o = await post(B2(EST(30_000_000, { donorAcquisitionDate: "2008-01-01" })));
    expect(o.status).toBe(400);
    expect(o.errors["buildingCarryoverPart"]?.join(" ")).toContain(PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE);
  });

  it("C: 증여자 토지 = 증여자 건물 취득일 → 400 (한 파트만 환산이어도)", async () => {
    const o = await post(C(EST(50_000_000, { donorAcquisitionDate: "2005-03-01" }), { donorAcquisitionPrice: 50_000_000, donorAcquisitionDate: "2005-03-01" }));
    expect(o.status).toBe(400);
    expect(errText(o)).toContain(PART_CARRYOVER_ESTIMATED_SAME_DAY_MESSAGE);
  });

  it("환산 없는 같은 날 실가 입력은 막지 않는다 (회귀 0)", async () => {
    const o = await post(A1({ donorAcquisitionPrice: 20_000_000, donorAcquisitionDate: "2022-06-01" }));
    expect(o.status).toBe(200);
  });
});
