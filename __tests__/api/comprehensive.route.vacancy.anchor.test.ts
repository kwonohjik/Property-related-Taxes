/**
 * anchor — 공실 2년(T-12 · 종부령 §3⑦4호) — 화면 경로(⑤술어 → ⑧ → ④ → ⑫⑭ → 엔진) 세액·막다른 길 고정.
 * 엔진 판정은 __tests__/tax-engine/comprehensive-exclusion-vacancy.anchor.test.ts.
 * 실측(변경 전 교재 대조 probe P11): 현재 임대료 빈칸(공실)이어도 기간과 무관하게 성립.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.2·§4 A12
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
const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/calc/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

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

describe("A12 화면 경로 — 공실 2년", () => {
  it("A12-2 ★ 퇴거 2023-05-30 → 불성립 · 3,426,370원", async () => {
    const r = await run(form({ rentalVacantAtAssessment: true, vacancyEvictionDate: "2023-05-30" }));
    expect(r.aggregationExclusion.propertyResults[0].failReasons).toEqual([COMPREHENSIVE_EXCL.VACANCY_OVER_2Y]);
    expect(r.totalHousingTax).toBe(3_426_370);
  });

  it("A12-1 퇴거 2023-06-01 → 성립 1,267,200원 + 경고", async () => {
    const r = await run(form({ rentalVacantAtAssessment: true, vacancyEvictionDate: "2023-06-01" }));
    expect(r.totalHousingTax).toBe(1_267_200);
    expect(r.warnings).toContain(`임대주택 1번째: ${COMPREHENSIVE_EXCL.VACANCY_WITHIN_2Y_WARNING}`);
  });

  it("A12-5 ★ 막다른 길 없음 — 공실 · 5% 토글 OFF · 직전 임대료 빈칸이어도 ⑧·⑫ 통과 · 남은 임대료는 보내지 않음", async () => {
    const f = form({ rentalVacantAtAssessment: true, vacancyEvictionDate: "2024-12-01", isInitialContract: false, previousRent: "", currentRent: "1,200,000" });
    const info = ((await bodyOf(f)) as Body).properties[0].rentalInfo;
    expect(info).toMatchObject({ rentalVacantAtAssessment: true, vacancyEvictionDate: "2024-12-01", currentRent: 0, isInitialContract: true });
    expect(info.previousRent).toBeUndefined();
    expect((await run(f)).aggregationExclusion.excludedCount).toBe(1);
  });

  it("A12-5′ ⑫ 직접 API — 공실이면 토글 OFF·직전 임대료 없음도 200(⑧과 같은 면제) · 공실 아니면 400", async () => {
    const body = (await bodyOf(form({ rentalVacantAtAssessment: true, vacancyEvictionDate: "2024-12-01" }))) as unknown as Body & Record<string, unknown>;
    body.properties[0].rentalInfo.isInitialContract = false;
    delete body.properties[0].rentalInfo.previousRent;
    expect((await post(body)).status).toBe(200);
    delete body.properties[0].rentalInfo.rentalVacantAtAssessment;
    expect((await post(body)).status).toBe(400);
  });

  it("A12-4 ⑧ 퇴거일 빈칸 · 과세기준일 뒤 · 임대개시일 앞 차단", () => {
    expect(validateRequiredExclusionAndLandInputs(form({ rentalVacantAtAssessment: true }))).toMatch(/기존 임차인 퇴거일을 입력하세요/);
    expect(validateRequiredExclusionAndLandInputs(form({ rentalVacantAtAssessment: true, vacancyEvictionDate: "2025-06-02" }))).toMatch(
      /과세기준일\(2025\.6\.1\.\) 뒤/,
    );
    expect(validateRequiredExclusionAndLandInputs(form({ rentalVacantAtAssessment: true, vacancyEvictionDate: "2023-02-01" }))).toMatch(
      /임대개시일보다 앞섭니다/,
    );
  });

  it("A12-6 공실 ON 뒤 4호로 바꾸면 공실 값을 보내지 않는다", async () => {
    const f = form({
      rentalVacantAtAssessment: true,
      vacancyEvictionDate: "2023-05-30",
      exclusionType: "vacant_construction_rental",
      rentalRegistrationType: "vacant_construction",
    });
    const info = ((await bodyOf(f)) as Body).properties[0].rentalInfo;
    expect(info.rentalVacantAtAssessment).toBeUndefined();
    expect(info.vacancyEvictionDate).toBeUndefined();
  });
});
