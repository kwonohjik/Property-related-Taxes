/**
 * anchor — 임대료 증가율 5% 비교 기준 계약(T-07a) · 직전 임대료 빈칸 차단(Q-11) — 화면 경로(⑧④⑫⑭ → 엔진).
 * 기준 계약: 2019.2.12. 이후 처음 쓴 표준임대차계약(부칙<제29524호> §3 · 서면-2020-부동산-2435),
 * 8호는 등록·재등록 뒤 처음 쓴 계약(서면-2021-부동산-5682·2749).
 * 실측(변경 전 probe P10): 8호 2021 등록 · 10% 인상 — 토글 OFF 3,426,370원 / ON 1,267,200원.
 * 변경 전에는 OFF + 직전 임대료 빈칸이 ⑧·⑫를 지나 엔진이 증가율을 보지 않고 성립시켰다(과다배제).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-tax-defects-3.plan.md §2.2
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

/** 8호 장기일반 민간매입 수도권 5억 + 일반주택 15억 · 2025 과세연도 · 2021.3. 등록·임대개시 */
const form = (initial: boolean, previousRent: string, regType = "private_purchase_long", exclusionType = "private_purchase_rental_long"): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: "2025",
    properties: [
      {
        ...makeProperty(),
        assessedValue: "500,000,000",
        exclusionType,
        rentalRegistrationType: regType,
        rentalRegistrationDate: "2021-03-01",
        businessRegistrationDate: "2021-03-01", // 세무서 사업자등록(§3① 각 호 외의 부분 · T-13)
        rentalApplicationDate: "2021-03-01",
        rentalStartDate: "2021-03-01",
        area: "84",
        location: "metro",
        currentRent: "1,100,000",
        previousRent,
        isInitialContract: initial,
        rentalAcquisitionDate: "2016-01-01",
        isApartment: "no",
        convertedFromShortTerm: "no",
      } as PropertyEntry,
      { ...makeProperty(), assessedValue: "1,500,000,000" },
    ],
  }) as ComprehensiveFormData;

describe("A07 화면 경로 — 5% 비교 기준 계약", () => {
  it("A07-1 ★ 처음 쓴 표준임대차계약 아님 · 10% 인상 → 불성립 · 3,426,370원", async () => {
    const r = await run(form(false, "1,000,000"));
    expect(r.aggregationExclusion.excludedCount).toBe(0);
    expect(r.aggregationExclusion.propertyResults[0].failReasons).toContain(COMPREHENSIVE_EXCL.RENT_INCREASE_EXCEEDED);
    expect(r.totalHousingTax).toBe(3_426_370);
  });

  it("A07-2 처음 쓴 표준임대차계약(토글 ON) → 5% 비교 제외 · 성립 1,267,200원", async () => {
    const r = await run(form(true, "1,000,000"));
    expect(r.aggregationExclusion.excludedCount).toBe(1);
    expect(r.totalHousingTax).toBe(1_267_200);
  });

  it("A07-3 토글 OFF · 5% 이내(1,000,000 → 1,050,000) → 성립 1,267,200원", async () => {
    const f = form(false, "1,000,000");
    (f.properties[0] as PropertyEntry).currentRent = "1,050,000";
    const r = await run(f);
    expect(r.aggregationExclusion.excludedCount).toBe(1);
    expect(r.totalHousingTax).toBe(1_267_200);
  });
});

describe("Q-11 토글 OFF · 직전 임대료 빈칸 — ⑧·⑫ 차단", () => {
  it("⑧ 빈칸 → 차단 문구", () => {
    expect(validateRequiredExclusionAndLandInputs(form(false, ""))).toMatch(/주택 1: 처음 쓴 표준임대차계약이 아니면 직전 임대료/);
  });

  it("⑧ 0원 → 차단(엔진이 0으로 나눈다)", () => {
    expect(validateRequiredExclusionAndLandInputs(form(false, "0"))).toMatch(/직전 임대료/);
  });

  it("⑫ 같은 본문을 직접 보내면 400", async () => {
    const body = await bodyOf(form(true, ""));
    const props = body.properties as { rentalInfo: Record<string, unknown> }[];
    expect(props[0].rentalInfo.previousRent).toBeUndefined();
    props[0].rentalInfo.isInitialContract = false;
    const res = await post(body);
    expect(res.status).toBe(400);
  });

  it("⑧ 3호(임대료 요건 없음)는 막지 않는다 — 엔진과 같은 술어", () => {
    const f = form(false, "", "existing_rental", "existing_rental");
    (f.properties[0] as PropertyEntry).qualifyingUnitCount = 2;
    expect(validateRequiredExclusionAndLandInputs(f)).toBeNull();
  });
});
