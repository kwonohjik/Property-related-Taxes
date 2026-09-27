/**
 * route anchor (A3 · OH-35 · OH-47) — 엔진 수정이 **단건 계산기 route**와 **판정 메뉴 route** 모두에 도달한다.
 *
 * 입력 필드는 모두 기존 배관(⑫⑭)을 탄다 — 새 필드가 없다. 여기서는 route 조립(Zod → engine-input)을 지나도
 * 판정이 엔진 anchor와 같은지만 본다(`feedback_leaf_anchor_skips_zod_layer`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { POST as POST_SINGLE } from "@/app/api/calc/transfer/route";
import { POST as POST_JUDGE } from "@/app/api/calc/one-house-exemption/route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const BASE = {
  propertyType: "housing",
  transferPrice: 900_000_000,
  acquisitionPrice: 400_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  annualBasicDeductionUsed: 0,
  reductions: [],
};

async function single(body: Record<string, unknown>) {
  const res = await POST_SINGLE(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...BASE, ...body }),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.result as { isExempt: boolean };
}
async function judge(body: Record<string, unknown>) {
  const res = await POST_JUDGE(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify({ ...BASE, ...body }),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.judgment as { isExempt: boolean };
}

/**
 * 명부 행 — 판정 route는 주택 수를 명부에서 도출한다. 엔진 명부는 양도 대상 행(`selling` —
 * ④ `buildHousesPayload`가 붙인다)을 **포함**하므로 양도 대상 + 1채 = 2주택.
 */
const row = (id: string, acq: string) => ({
  id,
  region: "capital",
  acquisitionDate: acq,
  officialPrice: 300_000_000,
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});
const roster = (acq: string) => [row("selling", "2019-06-01"), row("h1", acq)];

describe("OH-35 — §155⑯ 1년 면제는 연접 지역 요건에 묶인다 (route)", () => {
  const body = (newHouseSigunguCode: string) => ({
    acquisitionDate: "2019-06-01",
    transferDate: "2022-06-01",
    householdHousingCount: 2,
    residencePeriodMonths: 36,
    houses: roster("2020-01-01"),
    sellingHouseId: "selling",
    temporaryTwoHouse: {
      previousAcquisitionDate: "2019-06-01",
      newAcquisitionDate: "2020-01-01",
      publicInstitutionRelocation: true,
      relocatedSigunguCode: "4111700000",
      newHouseSigunguCode,
    },
  });

  it("🔴 단건 — 비연접(제주) 과세 / 연접(기흥) 비과세", async () => {
    expect((await single(body("5011000000"))).isExempt).toBe(false);
    expect((await single(body("4146300000"))).isExempt).toBe(true);
  });

  it("🔴 판정 메뉴 — 같은 결론", async () => {
    expect((await judge(body("5011000000"))).isExempt).toBe(false);
    expect((await judge(body("4146300000"))).isExempt).toBe(true);
  });
});

describe("OH-47 — §156의2③ 후단 1년 요건 면제 (route)", () => {
  const body = (proviso: boolean) => ({
    acquisitionDate: "2023-01-02",
    transferDate: "2024-06-01",
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    presaleRights: [
      { id: "r1", type: "redevelopment_right", acquisitionDate: "2023-06-01", region: "capital" },
    ],
    ...(proviso
      ? {
          oneHouseExemptionProviso: {
            reason: "expropriation",
            businessApprovalDate: "2023-03-01",
            expropriationDate: "2024-05-01",
          },
        }
      : {}),
  });

  it("🔴 단건 — 수용(2호가목) 선언 비과세 / 미선언 과세", async () => {
    expect((await single(body(true))).isExempt).toBe(true);
    expect((await single(body(false))).isExempt).toBe(false);
  });

  it("🔴 판정 메뉴 — 같은 결론", async () => {
    expect((await judge(body(true))).isExempt).toBe(true);
    expect((await judge(body(false))).isExempt).toBe(false);
  });
});
