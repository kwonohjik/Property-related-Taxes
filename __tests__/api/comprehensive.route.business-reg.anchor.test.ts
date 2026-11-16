/**
 * anchor — 세무서 사업자등록 기한(T-13 · 종부령 §3① 각 호 외의 부분) — 화면 경로(⑤술어 → ⑧ → ④ → ⑫⑭ → 엔진) 세액 고정.
 * 엔진 판정은 __tests__/tax-engine/comprehensive-exclusion-business-reg.anchor.test.ts.
 * 실측(변경 전 교재 대조 probe P12): 8호 세무서 등록일은 결과에 영향 없음 — 8호는 칸을 묻지도 싣지도 않았다.
 * V-7: 8호 나목2) 법인 판정은 「사업자등록 신청일」이 있으면 등록일을 보지 않는다(appStatus) — 화면은 신청일을 ⑧로 받으므로 불변.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.1·§4 A13
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
import { asksBusinessRegistrationField } from "@/lib/calc/comprehensive-rental-business-reg";

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

/** 8호 장기일반 민간매입 수도권 5억 + 일반주택 15억 · 2025 과세연도 · 지자체 2025.2.20. 등록 · 2025.3. 임대개시 */
const form = (biz: string, over: Partial<PropertyEntry> = {}, top: Partial<ComprehensiveFormData> = {}): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: "2025",
    ...top,
    properties: [
      {
        ...makeProperty(),
        assessedValue: "500,000,000",
        exclusionType: "private_purchase_rental_long",
        rentalRegistrationType: "private_purchase_long",
        rentalRegistrationDate: "2025-02-20",
        rentalApplicationDate: "2025-02-20",
        businessRegistrationDate: biz,
        rentalStartDate: "2025-03-01",
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

describe("A13 화면 경로 — 세무서 사업자등록 기한", () => {
  it("A13-3 ★ 세무서 2025-10-01 → 불성립 · 종부세+농특세 3,426,370원", async () => {
    const f = form("2025-10-01");
    expect(((await bodyOf(f)).properties as { rentalInfo: Record<string, unknown> }[])[0].rentalInfo.businessRegistrationDate).toBe(
      "2025-10-01",
    );
    const r = await run(f);
    expect(r.aggregationExclusion.propertyResults[0].failReasons).toEqual([COMPREHENSIVE_EXCL.BUSINESS_REGISTERED_AFTER_FILING_DEADLINE]);
    expect(r.totalHousingTax).toBe(3_426_370);
  });

  it("A13-2 세무서 2025-09-30 → 성립 1,267,200원 · 경고 없음(의제)", async () => {
    const r = await run(form("2025-09-30"));
    expect(r.aggregationExclusion.excludedCount).toBe(1);
    expect(r.totalHousingTax).toBe(1_267_200);
    expect(r.aggregationExclusion.propertyResults[0].warnings).toBeUndefined();
  });

  it("A13-5 ★ ⑧ 빈칸 차단 — 각 호 외의 부분 문구", () => {
    expect(validateRequiredExclusionAndLandInputs(form(""))).toMatch(/주택 1: 세무서 사업자등록일을 입력하세요 — 과세기준일/);
  });

  it("A13-8 V-7 법인 8호 나목2) — 사업자등록 신청일이 있으면 세무서 등록일이 달라도 판정 같음", async () => {
    const corp = (biz: string) =>
      form(
        biz,
        { pnu: "1168010100100010000", rentalRegistrationDate: "2021-03-10", rentalApplicationDate: "2021-03-01", businessRegistrationApplicationDate: "2021-03-01" },
        { assessmentYear: "2026", taxpayerType: "corporate" } as Partial<ComprehensiveFormData>,
      );
    const a = (await run(corp("2021-03-10"))).aggregationExclusion.propertyResults[0];
    const b = (await run(corp("2019-01-10"))).aggregationExclusion.propertyResults[0];
    // 나목2)를 실제로 거친다 — 강남 2021 신청 법인은 불성립(8na anchor 2)와 같은 사유)
    expect(a.failReasons).toContain(COMPREHENSIVE_EXCL.EXCLUDED_8NA2_CORP_REGULATED_APP);
    expect(b.failReasons).toEqual(a.failReasons);
  });
});

describe("⑤④⑧ 술어 asksBusinessRegistrationField — 묻는 유형·연도", () => {
  it("민간 8유형은 묻고(10·11호는 2026부터) · 공공·3·4·5·9호는 묻지 않는다", () => {
    for (const t of ["private_construction", "private_purchase_short", "private_purchase_long", "public_support_construction", "public_support_purchase", "unsold_purchase"])
      expect(asksBusinessRegistrationField(t, "2025")).toBe(true);
    for (const t of ["private_short_term_6y_construction", "private_short_term_6y_purchase"]) {
      expect(asksBusinessRegistrationField(t, "2025")).toBe(false);
      expect(asksBusinessRegistrationField(t, "2026")).toBe(true);
    }
    for (const t of ["public_construction", "public_purchase", "existing_rental", "vacant_construction", "reit_purchase", "public_conversion_pending"])
      expect(asksBusinessRegistrationField(t, "2025")).toBe(false);
  });
});
