/**
 * 결정 #33·#34 — 이월과세 「증여자와 계속 같은 세대」 사실 · API 경로 anchor (⑫ Zod · ⑭ route 매핑).
 *
 * - 두 필드가 ⑫·⑭를 지나 엔진에 닿는다(침묵 strip 금지). 일자는 `toOptionalDate`로 Date가 된다 — string이 그대로 도달하면
 *   `Date < string` 비교가 침묵 false가 되어 통산이 조용히 꺼진다.
 * - OH-1(15억 배우자 고가주택): 같은 세대로 확인되면 B가 고가주택 비과세라 ②2호가 걸리지 않고 ②3호로 A 58,378,000이 채택된다.
 *   아니오·미확인은 종전 0 그대로(미확인은 확인 필요 고지).
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { carryoverTaxationEngineShape } from "@/lib/api/transfer-tax-building-schemas";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const BASE = {
  propertyType: "housing",
  transferPrice: 1_500_000_000,
  transferDate: "2026-02-16",
  acquisitionPrice: 0,
  acquisitionDate: "2025-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  acquisitionCause: "carryover_gift",
};
const carry = (over: Record<string, unknown>) => ({
  ...BASE,
  carryoverTaxation: {
    giftRegistryDate: "2025-06-01",
    donorAcquisitionDate: "2000-06-01",
    donorAcquisitionPrice: 10_000_000,
    useEstimatedAcquisition: false,
    giftTaxAmount: 0,
    giftDateValuation: 1_500_000_000,
    donorRelation: "spouse",
    ...over,
  },
});

async function post(body: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: { result: { determinedTax: number; warnings?: string[]; carryoverTaxationDetail?: { adoptedScenario: string; exclusionReason?: string } } }; error?: unknown };
  return { status: res.status, json, result: json.data?.result };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("G4-2 route — ⑫·⑭", () => {
  it("[R-1] 같은 세대(예) + 시작일 → 일자가 Date로 도달해 B가 고가주택 비과세 → ②3호로 A 58,378,000", async () => {
    const { status, result } = await post(
      carry({ donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: "2000-06-01" }),
    );
    expect(status).toBe(200);
    expect(result!.carryoverTaxationDetail?.exclusionReason).toBeUndefined();
    expect(result!.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(result!.determinedTax).toBe(58_378_000);
  });

  it("[R-2] 부정 짝: 아니오 → 종전 ②2호로 B 0", async () => {
    const { result } = await post(carry({ donorSameHouseholdContinuous: false }));
    expect(result!.carryoverTaxationDetail?.exclusionReason).toBe("one_house_exemption");
    expect(result!.determinedTax).toBe(0);
  });

  it("[R-3] 미확인(필드 미전송) → 종전 0 + 확인 필요 고지가 응답 warnings에 있다 · 아니오는 고지가 없다", async () => {
    const unknown = await post(carry({}));
    expect(unknown.result!.determinedTax).toBe(0);
    expect(unknown.result!.warnings?.some((w) => w.includes("계속 같은 세대였는지"))).toBe(true);
    const no = await post(carry({ donorSameHouseholdContinuous: false }));
    expect((no.result!.warnings ?? []).some((w) => w.includes("계속 같은 세대"))).toBe(false);
  });

  it("[R-4] 「예」인데 시작일이 없으면 400(⑫ refine — 일반 증여 R-6과 같은 규칙, 결정 #38) · 엔진은 미확인으로 읽어 효과가 없으므로 입구에서 막는다", async () => {
    const bad = await post(carry({ donorSameHouseholdContinuous: true }));
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.json)).toContain("donorHouseholdHoldingStartDate");
    // 부정 짝: 「아니오」는 시작일이 없어도 통과
    expect((await post(carry({ donorSameHouseholdContinuous: false }))).status).toBe(200);
  });

  it("[R-4b] 시작일 순서 ±1 — 증여자 취득일 하루 전·증여 등기접수일 당일은 400, 증여자 취득일 당일·접수일 하루 전은 통과", async () => {
    const at = (d: string) => post(carry({ donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: d }));
    expect((await at("2000-05-31")).status).toBe(400);
    expect((await at("2025-06-01")).status).toBe(400);
    expect((await at("2000-06-01")).status).toBe(200);
    expect((await at("2025-05-31")).status).toBe(200);
  });

  it("[R-4c] 컴패니언·GB 파트 shape도 같은 refine — 「예」+시작일 공란·범위 밖은 실패, 「아니오」는 통과", () => {
    const part = (over: Record<string, unknown>) =>
      carryoverTaxationEngineShape.safeParse({
        giftRegistryDate: "2023-06-01",
        donorAcquisitionDate: "2000-06-01",
        useEstimatedAcquisition: false,
        giftTaxAmount: 0,
        giftDateValuation: 1_500_000_000,
        ...over,
      });
    const missing = part({ donorSameHouseholdContinuous: true });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues.map((i) => i.path.join("."))).toContain("donorHouseholdHoldingStartDate");
    expect(part({ donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: "2023-06-01" }).success).toBe(false);
    expect(part({ donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: "2000-05-31" }).success).toBe(false);
    expect(part({ donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: "2023-05-31" }).success).toBe(true);
    expect(part({ donorSameHouseholdContinuous: false }).success).toBe(true);
  });

  it("[R-5] 컴패니언·GB 파트 shape도 두 필드를 보존한다(단건 인라인 shape과 parity)", () => {
    const parsed = carryoverTaxationEngineShape.parse({
      giftRegistryDate: "2023-06-01",
      donorAcquisitionDate: "2000-06-01",
      useEstimatedAcquisition: false,
      giftTaxAmount: 0,
      giftDateValuation: 1_500_000_000,
      donorSameHouseholdContinuous: true,
      donorHouseholdHoldingStartDate: "2001-01-01",
    });
    expect(parsed.donorSameHouseholdContinuous).toBe(true);
    expect(parsed.donorHouseholdHoldingStartDate).toBe("2001-01-01");
  });
});

describe("G4-5 route — 일반 증여(판정 메뉴가 보내는 모양) ⑫ refine", () => {
  const gift = (over: Record<string, unknown>) => ({
    ...BASE,
    acquisitionCause: "gift",
    acquisitionPrice: 600_000_000,
    transferPrice: 900_000_000,
    donorAcquisitionDate: "2010-03-01",
    ...over,
  });
  it("[R-6] 같은 세대(예)인데 시작일이 없으면 400 · 있으면 통산해 비과세", async () => {
    const bad = await post(gift({ giftSameHouseholdContinuous: true }));
    expect(bad.status).toBe(400);
    const ok = await post(gift({ giftSameHouseholdContinuous: true, giftHouseholdHoldingStartDate: "2010-03-01" }));
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(ok.result!.determinedTax).toBe(0);
  });
  it("[R-7] 시작일 순서 ±1 — 증여일과 같은 날은 400, 하루 전은 통과", async () => {
    expect((await post(gift({ giftSameHouseholdContinuous: true, giftHouseholdHoldingStartDate: "2025-06-01" }))).status).toBe(400);
    expect((await post(gift({ giftSameHouseholdContinuous: true, giftHouseholdHoldingStartDate: "2025-05-31" }))).status).toBe(200);
  });
  it("[R-8] 세대 사실 미전송(D2·두 번째 이후 자산·다건·사실 없는 API)은 종전대로 증여일 기준 + 확인 필요 고지", async () => {
    const { result } = await post(gift({ residencePeriodMonths: 0 }));
    expect(result!.determinedTax).toBeGreaterThan(0);
    expect(result!.warnings?.some((w) => w.includes("세대 관계가 입력되지 않아"))).toBe(true);
  });
});
