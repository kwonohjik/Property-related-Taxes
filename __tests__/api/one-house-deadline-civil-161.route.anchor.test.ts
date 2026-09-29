/**
 * route anchor (L-1) — 「~이내」 기한 말일의 민법 §161 연장이 **단건 계산기 route · 판정 메뉴 route** 모두에
 * 도달한다(`feedback_leaf_anchor_skips_zod_layer`). 법령·해석: 엔진 anchor
 * `__tests__/tax-engine/transfer/one-house-deadline-civil-161.anchor.test.ts` 머리 주석.
 *
 * §155① 일시적 2주택 — 신규 취득 2021-06-01 → 3년 역상 말일 2024-06-01(토) → 기한 06-03(월).
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

/**
 * 판정 기준일(오늘)을 고정한다 — route가 이미 지난 「이 날까지 양도」 기한을 빼므로(2026-09-29),
 * 과거 기한을 단언하는 테스트는 그 기한 **이전의 오늘**에서 돌려야 한다. `Date`만 가짜로 돌린다.
 */
async function atToday<T>(isoDate: string, fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${isoDate}T03:00:00Z`));
  try {
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}


beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const post = async (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) => {
  const res = await handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data;
};

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
const body = (transferDate: string) => ({
  propertyType: "housing",
  transferPrice: 800_000_000,
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
  acquisitionDate: "2018-01-01",
  transferDate,
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  sellingHouseId: "selling",
  houses: [row("selling", "2018-01-01"), row("h-new", "2021-06-01")],
  temporaryTwoHouse: { previousAcquisitionDate: "2018-01-01", newAcquisitionDate: "2021-06-01" },
});

describe("L-1 — §155① 처분기한 말일 토요일 (route)", () => {
  it("🔴 단건 — 월요일(06-03) 양도 비과세 / 화요일(06-04) 과세", async () => {
    expect((await post(POST_SINGLE, "http://l/api/calc/transfer", body("2024-06-03"))).result.isExempt).toBe(true);
    expect((await post(POST_SINGLE, "http://l/api/calc/transfer", body("2024-06-04"))).result.isExempt).toBe(false);
  });

  it("🔴 판정 메뉴 — 같은 결론 · 화요일이면 기한 2024-06-03과 설명이 응답에 실린다", async () => {
    expect((await post(POST_JUDGE, "http://l/api/calc/one-house-exemption", body("2024-06-03"))).judgment.isExempt).toBe(true);
    // 기한 2024-06-03이 아직 오지 않은 「오늘」에서 판정한다 — 지났으면 이룰 수 없어 pending에서 빠진다.
    const j = (
      await atToday("2024-05-01", () => post(POST_JUDGE, "http://l/api/calc/one-house-exemption", body("2024-06-04")))
    ).judgment;
    expect(j.isExempt).toBe(false);
    const p = j.pending.find((x: { id: string }) => x.id === "155-1-disposal-deadline");
    expect(String(p.deadline).slice(0, 10)).toBe("2024-06-03");
    expect(p.deadlineNote).toContain("2024-06-01");
  });
});
