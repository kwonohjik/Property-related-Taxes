/**
 * anchor — 가격 요건 판정 기준 공시가격(T-03) — 화면 경로(⑤술어 → ④ → ⑫⑭ → 엔진).
 * 종부령 §3①2호 가목1) 「해당 주택의 임대를 개시한 날 또는 최초로 제9항에 따른 합산배제신고를 한 연도의 과세기준일을 기준으로 하여」
 * (서면-2020-부동산-5030). 엔진은 종전에 그해 공시가격만 비교했다.
 * 실측(변경 전 probe P1): 2호 2017 등록 · 2025 공시 7억 → 합산 4,537,951원 / 임대개시일 가격으로 배제 시 1,267,200원(3,270,751원 과다).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-tax-defects-3.plan.md §2.3·§3
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
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";
import { asksPriceBasisValue } from "@/lib/calc/comprehensive-rental-price-basis";

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
function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/calc/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function run(form: ComprehensiveFormData): Promise<Result> {
  expect(validateRequiredExclusionAndLandInputs(form)).toBeNull();
  const res = await post(await bodyOf(form));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: Result }).data;
}

const notEntered = (won: string) => `가격 판정: ${won}원(그해 공시가격) — ${E.PRICE_BASIS_NOT_ENTERED}`;
const byBasis = (won: string) => `가격 판정: ${won}원 — ${E.PRICE_JUDGED_BY_BASIS}`;

/** 2호 민간매입(단기) 수도권 + 일반주택 15억 · 2025 과세연도 · 2017 등록·사업자등록·임대개시 */
const ho2 = (assessed: string, basis?: string): PropertyEntry =>
  ({
    ...makeProperty(),
    assessedValue: assessed,
    exclusionType: "private_purchase_rental_short",
    rentalRegistrationType: "private_purchase_short",
    rentalRegistrationDate: "2017-03-01",
    businessRegistrationDate: "2017-03-01",
    rentalStartDate: "2017-04-01",
    area: "84",
    location: "metro",
    currentRent: "1,000,000",
    priceBasisValue: basis,
  }) as PropertyEntry;

const form = (rental: PropertyEntry, year = "2025"): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: year,
    properties: [rental, { ...makeProperty(), assessedValue: "1,500,000,000" }],
  }) as ComprehensiveFormData;

type Body = { properties: { rentalInfo?: Record<string, unknown> }[] };

describe("A03 화면 경로 — 기준 공시가격", () => {
  it("A03-1 ★ 2호 · 그해 7억 · 기준 5억 → 성립 1,267,200원", async () => {
    const f = form(ho2("700,000,000", "500,000,000"));
    expect(((await bodyOf(f)) as Body).properties[0].rentalInfo?.priceBasisValue).toBe(500_000_000);
    const r = await run(f);
    expect(r.aggregationExclusion.excludedCount).toBe(1);
    expect(r.totalHousingTax).toBe(1_267_200);
  });

  it("A03-2 기준 6.5억 → 불성립 · 판정값 표시 · 4,537,951원", async () => {
    const r = await run(form(ho2("700,000,000", "650,000,000")));
    expect(r.aggregationExclusion.propertyResults[0].failReasons).toEqual([E.PRICE_EXCEEDED, byBasis("650,000,000")]);
    expect(r.totalHousingTax).toBe(4_537_951);
  });

  it("A03-3 기준 비움 → 그해 7억으로 판정 + 안내(Q-2 a) · 4,537,951원(종전과 같음)", async () => {
    const r = await run(form(ho2("700,000,000")));
    expect(r.aggregationExclusion.propertyResults[0].failReasons).toEqual([E.PRICE_EXCEEDED, notEntered("700,000,000")]);
    expect(r.totalHousingTax).toBe(4_537_951);
  });

  it("A03-4 그해 5억(상한 이하) → 칸을 묻지 않고 남은 값도 보내지 않음 · 성립", async () => {
    const f = form(ho2("500,000,000", "900,000,000"));
    expect(asksPriceBasisValue(f.properties[0], "private_purchase_short", "2025")).toBe(false);
    expect(((await bodyOf(f)) as Body).properties[0].rentalInfo?.priceBasisValue).toBeUndefined();
    expect((await run(f)).aggregationExclusion.excludedCount).toBe(1);
  });

  it("A03-9 ⑫ 기준 0원을 직접 보내면 400(Zod positive) · 화면은 0을 보내지 않는다", async () => {
    const f = form(ho2("700,000,000", "0"));
    const body = (await bodyOf(f)) as Body;
    expect(body.properties[0].rentalInfo?.priceBasisValue).toBeUndefined();
    body.properties[0].rentalInfo!.priceBasisValue = 0;
    expect((await post(body)).status).toBe(400);
  });
});

describe("A03 ⑤④ 술어 — 대상 유형 · 상한", () => {
  const p = (over: Partial<PropertyEntry>) => ({ ...ho2("700,000,000"), ...over }) as PropertyEntry;
  it("A03-5 8호 30호 이상 2025 수도권 — 10억이면 묻고(상한 9억) 8억이면 묻지 않음", () => {
    const h8 = { exclusionType: "private_purchase_rental_long", rentalRegistrationType: "private_purchase_long", isThirtyPlusUnits: true };
    expect(asksPriceBasisValue(p({ ...h8, assessedValue: "1,000,000,000" }), "private_purchase_long", "2025")).toBe(true);
    expect(asksPriceBasisValue(p({ ...h8, assessedValue: "800,000,000" }), "private_purchase_long", "2025")).toBe(false);
    // 2024는 30호 구간 전 — 같은 8억도 상한 6억을 넘어 묻는다
    expect(asksPriceBasisValue(p({ ...h8, assessedValue: "800,000,000" }), "private_purchase_long", "2024")).toBe(true);
  });
  it("A03-7 7호 2023 — 사용승인 2022(9억)면 8억을 묻지 않고, 사용승인 2020(6억)이면 묻는다", () => {
    const h7 = { assessedValue: "800,000,000", exclusionType: "public_support_construction_rental", rentalRegistrationType: "public_support_construction" };
    expect(asksPriceBasisValue(p({ ...h7, usageApprovalDate: "2022-01-01" }), "public_support_construction", "2023")).toBe(false);
    expect(asksPriceBasisValue(p({ ...h7, usageApprovalDate: "2020-01-01" }), "public_support_construction", "2023")).toBe(true);
  });
  it("A03-8 3호·4호·5호는 묻지 않는다(기준일이 다름 · Q-9) · 9호는 바탕 유형으로", () => {
    for (const t of ["existing_rental", "vacant_construction", "reit_purchase"])
      expect(asksPriceBasisValue(p({ assessedValue: "2,000,000,000" }), t, "2025")).toBe(false);
    expect(asksPriceBasisValue(p({ conversionBase: "purchase" }), "public_conversion_pending", "2025")).toBe(true);
    expect(asksPriceBasisValue(p({ conversionBase: "" }), "public_conversion_pending", "2025")).toBe(false);
  });
});
