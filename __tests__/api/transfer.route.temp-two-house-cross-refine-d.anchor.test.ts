/**
 * §155① 일시적 2주택 리뷰 묶음 D(2026-11-12 리뷰 A-3 · E-4=J-8) — 직접 API 교차 검증 ⑩ `refineTemporaryTwoHouseCross`.
 *
 * 수정 전 실측(강남 이외 · 2018-06-01 취득 · 2026-06-01 10억 양도 · 세대 2주택):
 * | 시료 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | A-3 신규 주택 취득일 2026-09-01(양도일 뒤) | 200 · 비과세 0원 (§155① 없음이면 192,159,000) | 400 |
 * | A-3 신규 주택 취득일 = 양도일 | 200 · 비과세 0원 | 400 |
 * | E-4 강남 2025 취득 · 신규 2026-02 · 나목(출국 2026-03 · 출국일 1주택 예) | 200 · 비과세 불성립인데 중과는 15호 배제 | 400 |
 *
 * 화면 경로는 같은 규칙으로 싣지 않는다 — 명부·직접 선언 모두 양도일 전 취득만(`isOwnedAtTransfer`) · ④ `effectiveProvisoReason`이 나·다목을 지운다.
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
import { propertyItemSchema } from "@/lib/api/transfer-tax-schema";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { resolveTemporaryTwoHouse } from "@/lib/calc/household-house-count";
import { withIdentityStdInBody } from "../tax-engine/_helpers/mixed-use-identity-std";

const BASE = {
  transferPrice: 1_000_000_000,
  transferDate: "2026-06-01",
  acquisitionPrice: 400_000_000,
  acquisitionDate: "2018-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 60,
  propertyType: "housing" as const,
};
const tt = (newAcquisitionDate: string) => ({
  temporaryTwoHouse: { previousAcquisitionDate: "2018-06-01", newAcquisitionDate },
});

async function post(over: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withIdentityStdInBody({ ...BASE, ...over })),
    }),
  );
  return { status: res.status, json: (await res.json()) as { data?: { result: { isExempt: boolean } }; error?: unknown } };
}
const issueText = (json: unknown) => JSON.stringify(json);

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("A-3 — 신규 주택 취득일은 양도일보다 앞서야 한다", () => {
  it("🔴 양도일 뒤 취득 → 400", async () => {
    const r = await post(tt("2026-09-01"));
    expect(r.status).toBe(400);
    expect(issueText(r.json)).toContain("신규 주택 취득일은 양도일보다 앞서야 합니다");
  });

  it("🔴 양도일과 같은 날 → 400(명부의 같은 날 제외 규칙과 같다)", async () => {
    expect((await post(tt("2026-06-01"))).status).toBe(400);
  });

  it("긍정 짝 — 양도일 전 취득(1년 경과·3년 내) → 200 비과세", async () => {
    const r = await post(tt("2024-05-30"));
    expect(r.status).toBe(200);
    expect(r.json.data?.result.isExempt).toBe(true);
  });

  it("다건 항목 스키마도 같은 규칙", () => {
    const item = { propertyId: "p1", propertyLabel: "주택", ...withIdentityStdInBody({ ...BASE, ...tt("2026-09-01") }) };
    const parsed = propertyItemSchema.safeParse(item);
    expect(parsed.success).toBe(false);
    expect(issueText(parsed.error?.issues)).toContain("신규 주택 취득일은 양도일보다 앞서야 합니다");
    expect(propertyItemSchema.safeParse({ ...item, ...tt("2024-05-30") }).success).toBe(true);
  });
});

describe("E-4 — 일시적 2주택에는 나·다목 단서를 받지 않는다", () => {
  const G = "1168010100";
  const E = {
    transferPrice: 1_500_000_000,
    acquisitionPrice: 1_000_000_000,
    acquisitionDate: "2025-01-01",
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    regionCode: G,
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: "2025-01-01",
      newAcquisitionDate: "2026-02-01",
      newHouseRegulatedAtAcquisition: true,
      previousHouseRegulatedAtNewAcquisition: true,
    },
  };
  const proviso = (reason: string) => ({
    oneHouseExemptionProviso: { reason, departureDate: "2026-03-01", departureOnlyHouse: true },
  });

  it.each(["overseas_migration", "overseas_residence"])("🔴 %s + 일시적 2주택 → 400", async (reason) => {
    const r = await post({ ...E, ...proviso(reason) });
    expect(r.status).toBe(400);
    expect(issueText(r.json)).toContain("일시적 2주택(temporaryTwoHouse)에는 이 §154① 단서 사유를 적용하지 않습니다");
  });

  it("긍정 짝 — 받는 사유(3호 부득이) + 일시적 2주택 → 200", async () => {
    const r = await post({ ...E, oneHouseExemptionProviso: { reason: "unavoidable" }, residencePeriodMonths: 13 });
    expect(r.status).toBe(200);
  });

  it("긍정 짝 — 일시적 2주택 없이 나목 → 막지 않는다", async () => {
    const r = await post({ ...E, ...proviso("overseas_migration"), temporaryTwoHouse: undefined });
    expect(r.status).toBe(200);
  });

  it("긍정 짝 — 주택 수 1(④도 지우지 않는 1주택 모드) → 막지 않는다", async () => {
    const r = await post({ ...E, ...proviso("overseas_migration"), householdHousingCount: 1 });
    expect(r.status).toBe(200);
  });
});

describe("A-3 화면 경로 — 직접 선언 폴백도 명부와 같은 「양도일 전 취득」 규칙", () => {
  const base = {
    primaryKind: "housing",
    primaryAcquisitionDate: "2018-06-01",
    transferDate: "2026-06-01",
    houses: [],
    mergeContext: undefined,
    legacyPrecedence: false,
    declaredSpecial: true,
    excludedHouseIds: new Set<string>(),
    rentalResidenceHouseIds: new Set<string>(),
  };

  it.each(["2026-06-01", "2026-09-01"])("🔴 선언 신규 주택 취득일 %s(양도일 이후) → 도출 안 함(④가 싣지 않는다)", (d) => {
    expect(resolveTemporaryTwoHouse({ ...base, declaredNewHouseDate: d })).toBeUndefined();
  });

  it("긍정 짝 — 양도일 전 선언 → 그대로 도출", () => {
    expect(resolveTemporaryTwoHouse({ ...base, declaredNewHouseDate: "2024-05-30" })).toMatchObject({
      source: "declared",
      newAcquisitionDate: "2024-05-30",
    });
  });
});
