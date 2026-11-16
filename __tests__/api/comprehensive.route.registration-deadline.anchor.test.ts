/**
 * anchor — 종부령 §3① 신고기간 종료일(9.30.)까지 등록 — 화면 경로(④⑫⑭ → 엔진) 세액 고정.
 * 엔진 판정은 __tests__/tax-engine/comprehensive-exclusion-registration-deadline.anchor.test.ts.
 * 실측(변경 전 probe P12): 2025-10-01 등록도 성립 1,267,200원 — 합산 시 3,426,370원(과소 2,159,170원).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-tax-defects-3.plan.md §3 A15-3
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

import { POST } from "@/app/api/calc/comprehensive/route";
import { callComprehensiveApi, validateRequiredExclusionAndLandInputs } from "@/lib/calc/comprehensive-api";
import { defaultFormData, makeProperty } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveFormData, PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";

type Result = {
  totalHousingTax: number;
  warnings?: string[];
  aggregationExclusion: { excludedCount: number; propertyResults: { failReasons?: string[]; warnings?: string[] }[] };
};

async function bodyOf(form: ComprehensiveFormData): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }),
  );
  try {
    await callComprehensiveApi(form).catch(() => undefined);
  } finally {
    vi.unstubAllGlobals();
  }
  return body;
}

/** 화면 경로 끝까지 — ⑧ 통과를 먼저 확인하고 ④ 본문을 route에 보낸다 */
async function run(form: ComprehensiveFormData): Promise<Result> {
  expect(validateRequiredExclusionAndLandInputs(form)).toBeNull();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await bodyOf(form)),
    }),
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Result }).data;
}

/** 8호 장기일반 민간매입 수도권 5억 + 일반주택 15억 · 2025 과세연도 · 2025.3. 임대개시 */
const form = (reg: string): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: "2025",
    properties: [
      {
        ...makeProperty(),
        assessedValue: "500,000,000",
        exclusionType: "private_purchase_rental_long",
        rentalRegistrationType: "private_purchase_long",
        rentalRegistrationDate: reg,
        businessRegistrationDate: "2025-02-20", // 세무서 등록은 기한 안 — 지자체 등록 기한만 본다(T-13 분리)
        rentalApplicationDate: reg,
        rentalStartDate: "2025-03-01",
        area: "84",
        location: "metro",
        currentRent: "1,000,000",
        rentalAcquisitionDate: "2016-01-01",
        isApartment: "no",
        convertedFromShortTerm: "no",
      } as PropertyEntry,
      { ...makeProperty(), assessedValue: "1,500,000,000" },
    ],
  }) as ComprehensiveFormData;

describe("A15 화면 경로 — 신고기간 종료일까지 등록", () => {
  it("A15-3 ★ 2025-10-01 등록 → 불성립 · 종부세+농특세 3,426,370원", async () => {
    const r = await run(form("2025-10-01"));
    expect(r.aggregationExclusion.excludedCount).toBe(0);
    expect(r.aggregationExclusion.propertyResults[0].failReasons?.[0]).toBe(
      COMPREHENSIVE_EXCL.REGISTERED_AFTER_FILING_DEADLINE,
    );
    expect(r.totalHousingTax).toBe(3_426_370);
  });

  it("A15-2 2025-09-30 등록 → 성립 1,267,200원 + 확인 필요 경고(순번 접두)", async () => {
    const r = await run(form("2025-09-30"));
    expect(r.aggregationExclusion.excludedCount).toBe(1);
    expect(r.totalHousingTax).toBe(1_267_200);
    expect(r.warnings).toContain(`임대주택 1번째: ${COMPREHENSIVE_EXCL.REGISTERED_AFTER_ASSESSMENT_DEEMED}`);
  });

  it("A15-1 2025-02-20 등록 → 성립 1,267,200원 · 경고 없음(불변)", async () => {
    const r = await run(form("2025-02-20"));
    expect(r.aggregationExclusion.excludedCount).toBe(1);
    expect(r.totalHousingTax).toBe(1_267_200);
    expect(r.aggregationExclusion.propertyResults[0].warnings).toBeUndefined();
  });
});
