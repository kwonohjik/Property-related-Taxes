/**
 * anchor — §3⑧ 5% 위반 뒤 2개 과세연도(T-07b) — 화면 경로(⑤술어 → ⑧ → ④ → ⑫⑭ → 엔진) 세액 고정.
 * 엔진 판정은 __tests__/tax-engine/comprehensive-exclusion-rent-violation.anchor.test.ts.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.3·§4 A07b
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
import { asksRentViolation } from "@/lib/calc/comprehensive-rental-rent-violation";

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

/** 8호 장기일반 민간매입 수도권 5억 + 일반주택 15억 · 2025 과세연도 · 2023.3. 임대개시 */
const form = (over: Partial<PropertyEntry> = {}): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: "2025",
    properties: [
      {
        ...makeProperty(),
        assessedValue: "500,000,000",
        exclusionType: "private_purchase_rental_long",
        rentalRegistrationType: "private_purchase_long",
        rentalRegistrationDate: "2023-02-20",
        rentalApplicationDate: "2023-02-20",
        businessRegistrationDate: "2023-02-20",
        rentalStartDate: "2023-03-01",
        area: "84",
        location: "metro",
        currentRent: "1,000,000",
        rentalAcquisitionDate: "2016-01-01",
        isApartment: "no",
        convertedFromShortTerm: "no",
        ...over,
      } as PropertyEntry,
      { ...makeProperty(), assessedValue: "1,500,000,000" },
    ],
  }) as ComprehensiveFormData;

type Body = { properties: { rentalInfo: Record<string, unknown> }[] };

describe("A07b 화면 경로 — §3⑧", () => {
  it("A07b-1 ★ 위반 2024.3.1. → 불성립 · 3,426,370원", async () => {
    const f = form({ rentViolationRecorded: true, rentViolationDate: "2024-03-01" });
    expect(((await bodyOf(f)) as Body).properties[0].rentalInfo.rentViolationDate).toBe("2024-03-01");
    const r = await run(f);
    expect(r.aggregationExclusion.propertyResults[0].failReasons).toEqual([COMPREHENSIVE_EXCL.RENT_VIOLATION_TWO_YEARS]);
    expect(r.totalHousingTax).toBe(3_426_370);
  });

  it("A07b-2 위반 2023.3.1. → 성립 1,267,200원 · 토글 OFF면 남은 날짜를 보내지 않음", async () => {
    expect((await run(form({ rentViolationRecorded: true, rentViolationDate: "2023-03-01" }))).totalHousingTax).toBe(1_267_200);
    const off = form({ rentViolationRecorded: false, rentViolationDate: "2024-03-01" });
    expect(((await bodyOf(off)) as Body).properties[0].rentalInfo.rentViolationDate).toBeUndefined();
    expect((await run(off)).totalHousingTax).toBe(1_267_200);
  });

  it("⑧ 토글 ON · 계약일 빈칸 차단", () => {
    expect(validateRequiredExclusionAndLandInputs(form({ rentViolationRecorded: true }))).toMatch(/5% 넘게 올린 계약일을 입력하세요/);
  });

  it("술어 — 9호·6호 묻지 않음 · 2019 과세연도 묻지 않음(§3⑧ 2020.2.11. 신설)", () => {
    expect(asksRentViolation("private_purchase_long", "2025")).toBe(true);
    expect(asksRentViolation("private_purchase_long", "2019")).toBe(false);
    expect(asksRentViolation("public_conversion_pending", "2025")).toBe(false);
    expect(asksRentViolation("unsold_purchase", "2025")).toBe(false);
  });
});
