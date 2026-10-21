/**
 * P5 ⑫⑬⑭ — 주택 split 파트 이월과세 증여 사건의 §97의2②2호 판정 사실(세대 사실·배우자 예외)이 route를 지나 엔진에 닿는다 (2026-10-21)
 *
 * 계획: docs/00-pm/transfer-split-part-carryover-p5.plan.md §6 Q3·Q4
 *   · 세대 사실은 건물(주택)이 이월과세일 때만(B·C) — 토지만(A)이면 ⑫가 막는다(조용히 버려지는 입력 방지).
 *   · 배우자 예외는 통째 증여(C)만 — 한 파트만이면 ⑫가 막는다.
 *   · 일반건물 사건 shape(`carryoverGiftEventShape`)는 이 키를 받지 않는다 — 주택 split 전용 확장(`splitCarryoverGiftEventShape`).
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
import {
  SPLIT_CARRYOVER_HOUSEHOLD_LAND_ONLY_MESSAGE,
  SPLIT_CARRYOVER_SPOUSE_EXCEPTION_PART_MESSAGE,
} from "@/lib/api/transfer-tax-schema-split-carryover";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 1세대1주택 · 양도 8억(토지 4.8억 + 건물 3.2억) · 양도일 2025-06-30 · 거주 120개월 · 비조정 */
const BASE = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 800_000_000,
  transferDate: "2025-06-30",
  acquisitionPrice: 0,
  expenses: 0,
  isOneHousehold: true,
  householdHousingCount: 1,
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

/** B2 — 건물 증여 2024-06-15(1년) · 증여자 2015-06-01 1억 / 토지 2008-01-01 매매 1.2억 */
const B2 = (ev: Record<string, unknown> = {}) => ({
  ...BASE,
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2024-06-15",
  buildingAcquisitionPrice: 200_000_000,
  landAcquisitionCause: "purchase",
  landAcquisitionDate: "2008-01-01",
  landAcquisitionPrice: 120_000_000,
  isSeparateAcquisition: true,
  carryoverGiftEvent: EVENT(ev),
  buildingCarryoverPart: { donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 100_000_000 },
});

/** C2 — 통째 증여 2024-06-15(1년) · 증여자 토지 1995-03-01 · 건물 2015-06-01 */
const C2 = (ev: Record<string, unknown> = {}) => ({
  ...BASE,
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2024-06-15",
  buildingAcquisitionPrice: 200_000_000,
  landAcquisitionCause: "carryover_gift",
  landAcquisitionDate: "2024-06-15",
  landAcquisitionPrice: 200_000_000,
  isSeparateAcquisition: false,
  carryoverGiftEvent: EVENT({ giftTaxCalculated: 30_000_000, giftTaxBase: 400_000_000, ...ev }),
  landCarryoverPart: { donorAcquisitionDate: "1995-03-01", donorAcquisitionPrice: 50_000_000 },
  buildingCarryoverPart: { donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 50_000_000 },
});

/** A1 — 건물 매매 2022-06-01 / 토지 증여 2024-06-15 · 증여자 2005-01-01 */
const A1 = (ev: Record<string, unknown> = {}) => ({
  ...BASE,
  acquisitionCause: "purchase",
  acquisitionDate: "2022-06-01",
  buildingAcquisitionPrice: 200_000_000,
  landAcquisitionCause: "carryover_gift",
  landAcquisitionDate: "2024-06-15",
  landAcquisitionPrice: 300_000_000,
  isSeparateAcquisition: true,
  carryoverGiftEvent: EVENT({ giftTaxBase: 300_000_000, ...ev }),
  landCarryoverPart: { donorAcquisitionDate: "2005-01-01", donorAcquisitionPrice: 100_000_000 },
});

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = await res.json();
  return { status: res.status, json, r: json?.data?.result, errors: (json?.error?.fieldErrors ?? {}) as Record<string, string[]> };
}
const errText = (o: { errors: Record<string, string[]> }) => Object.values(o.errors).flat().join(" | ");

describe("②2호 — route 끝까지 (⑫·⑭·엔진)", () => {
  it("B2: 이월과세를 적용해야 비로소 1세대1주택 → 건물 미적용(one_house_exemption) · 200", async () => {
    const o = await post(B2());
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.carryoverEvent.oneHouseExclusion).toBe(true);
    expect(o.r.splitDetail.building.carryover.exclusionReason).toBe("one_house_exemption");
    expect(o.r.determinedTax).toBe(221_700_000);
  });

  it("C2: 주택 일체 판정 — 두 파트 모두 미적용", async () => {
    const o = await post(C2());
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.land.carryover.exclusionReason).toBe("one_house_exemption");
    expect(o.r.splitDetail.building.carryover.exclusionReason).toBe("one_house_exemption");
  });
});

describe("세대 사실(Q3) — 건물 파트로 엔진에 닿는다 (strip 아님)", () => {
  it("B2 + 계속 같은 세대(세대 보유 시작 2015-06-01) → B 세계도 세대 통산으로 비과세 → ②2호 미발동 · 0원", async () => {
    const o = await post(B2({ donorRelation: "spouse", donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: "2015-06-01" }));
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.carryoverEvent.oneHouseExclusion).toBeUndefined();
    expect(o.r.determinedTax).toBe(0);
  });

  it("B2 + 별도 세대(false) → 통산 없음 → ②2호", async () => {
    const o = await post(B2({ donorSameHouseholdContinuous: false }));
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.carryoverEvent.oneHouseExclusion).toBe(true);
  });

  it("계속 같은 세대인데 세대 보유 시작일이 없으면 400 — 자산 단위와 같은 규칙·문구", async () => {
    const o = await post(B2({ donorSameHouseholdContinuous: true }));
    expect(o.status).toBe(400);
    expect(errText(o)).toContain("세대 보유 시작일이 필요합니다");
  });

  it("세대 보유 시작일은 건물 증여자 취득일 이후 — 2015-06-01 전이면 400", async () => {
    const o = await post(B2({ donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: "2010-01-01" }));
    expect(o.status).toBe(400);
    expect(errText(o)).toContain("세대 보유 시작일은 증여자 취득일 이후, 증여일 이전이어야 합니다");
  });

  it("토지만(A)이면 세대 사실을 받지 않는다 — 건물은 본인 취득", async () => {
    const o = await post(A1({ donorSameHouseholdContinuous: false }));
    expect(o.status).toBe(400);
    expect(errText(o)).toContain(SPLIT_CARRYOVER_HOUSEHOLD_LAND_ONLY_MESSAGE);
  });
});

describe("배우자 예외(Q4) — 통째 증여(C)만", () => {
  it("C2 + 배우자 + 증여일 현재 1세대1주택 → ②2호 취소 · echo (strip 아님)", async () => {
    const o = await post(C2({ donorRelation: "spouse", spouseGiftOneHouseAtGiftDate: true }));
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.carryoverEvent.spouseOneHouseExceptionApplied).toBe(true);
    expect(o.r.splitDetail.carryoverEvent.oneHouseExclusion).toBeUndefined();
  });

  it("건물만(B)이면 400", async () => {
    const o = await post(B2({ donorRelation: "spouse", spouseGiftOneHouseAtGiftDate: true }));
    expect(o.status).toBe(400);
    expect(errText(o)).toContain(SPLIT_CARRYOVER_SPOUSE_EXCEPTION_PART_MESSAGE);
  });

  it("토지만(A)이면 400", async () => {
    const o = await post(A1({ donorRelation: "spouse", spouseGiftOneHouseAtGiftDate: false }));
    expect(o.status).toBe(400);
    expect(errText(o)).toContain(SPLIT_CARRYOVER_SPOUSE_EXCEPTION_PART_MESSAGE);
  });
});
