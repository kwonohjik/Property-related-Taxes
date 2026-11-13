/**
 * anchor — 종부령 §3①11호 나목 1)·2) + 10·11호 시행 시점 화면 파이프라인(⑤⑧④⑫⑭ → 엔진).
 * 술어 `na8Asks`(lib/calc/comprehensive-rental-8na.ts)의 11호 분기 · 엔진 판정은
 * __tests__/tax-engine/comprehensive-exclusion-11ho-na.anchor.test.ts.
 * 강남구(11680): 2017.8.3. 이후 해제 없음 → 공고일 2017.11.10.(11호 시행 전 공고 → 1) 기준일 2018.9.13.·2) 2020.6.17.)
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

const GANGNAM_PNU = "1168010100100010000";

type Excl = { excludedCount: number; propertyResults: { failReasons?: string[] }[] };

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
async function run(form: ComprehensiveFormData): Promise<Excl> {
  expect(validateRequiredExclusionAndLandInputs(form)).toBeNull();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await bodyOf(form)),
    }),
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { aggregationExclusion: Excl } }).data.aggregationExclusion;
}

const form = (over: Partial<PropertyEntry>, top: Partial<ComprehensiveFormData> = {}): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: "2026",
    ...top,
    properties: [
      {
        ...makeProperty(),
        assessedValue: "300,000,000",
        exclusionType: "private_short_term_rental_6y_purchase",
        rentalRegistrationType: "private_short_term_6y_purchase",
        rentalRegistrationDate: "2025-07-01",
        rentalStartDate: "2024-03-01",
        area: "59",
        currentRent: "1,000,000",
        pnu: GANGNAM_PNU,
        ...over,
      },
      { ...makeProperty(), assessedValue: "1,500,000,000" },
    ],
  }) as ComprehensiveFormData;

const NA1 = { rentalAcquisitionDate: "2021-03-01", householdOwnedAtAcquisition: "yes" as const };

describe("⑧ 11호 묻는 순서 — 8호 칸을 그대로 쓴다", () => {
  it("개인 11호: 취득일 → 보유 주택 (8호 3)·4) 칸은 묻지 않는다)", () => {
    expect(validateRequiredExclusionAndLandInputs(form({}))).toMatch(/임대주택 취득일.*11호 나목1\)/);
    expect(validateRequiredExclusionAndLandInputs(form({ rentalAcquisitionDate: "2021-03-01" }))).toMatch(/다른 주택을 보유/);
    expect(validateRequiredExclusionAndLandInputs(form({ rentalAcquisitionDate: "2018-09-13" }))).toBeNull();
  });
  it("법인 11호: 세무서 신청일 → 지자체 신청일", () => {
    const corp = (over: Partial<PropertyEntry>) => form(over, { taxpayerType: "corporate" });
    expect(validateRequiredExclusionAndLandInputs(corp({}))).toMatch(/세무서 사업자등록.*11호 나목2\)/);
    expect(validateRequiredExclusionAndLandInputs(corp({ businessRegistrationApplicationDate: "2025-06-20" }))).toMatch(
      /등록 신청일/,
    );
  });
  it("2025 과세연도: 10·11호 모두 아파트 여부를 묻는다 · 2026은 묻지 않는다", () => {
    const y25 = { assessmentYear: "2025" };
    expect(
      validateRequiredExclusionAndLandInputs(form({ rentalAcquisitionDate: "2018-01-01" }, y25)),
    ).toMatch(/아파트인지.*부칙/);
    const c10 = {
      exclusionType: "private_short_term_rental_6y_construction" as const,
      rentalRegistrationType: "private_short_term_6y_construction",
      qualifyingUnitCount: 2, // 10호 「2호 이상」 — comprehensive.route.two-plus-units.anchor
    };
    expect(validateRequiredExclusionAndLandInputs(form(c10, y25))).toMatch(/아파트인지/);
    expect(validateRequiredExclusionAndLandInputs(form(c10))).toBeNull();
  });
});

describe("⑫⑭ → 엔진 (화면 경로 끝까지)", () => {
  it("Q1 ★ 개인 강남 2021 취득(1주택 보유) → 불성립 · 무주택이면 성립", async () => {
    const hit = await run(form(NA1));
    expect(hit.excludedCount).toBe(0);
    expect(hit.propertyResults[0].failReasons).toContain(E.EXCLUDED_11NA1_REGULATED_NEW_ACQ);
    expect((await run(form({ ...NA1, householdOwnedAtAcquisition: "no" }))).excludedCount).toBe(1);
  });
  it("Q2 ★ 법인 강남 2025-06-20 신청 → 불성립", async () => {
    const r = await run(
      form(
        { rentalApplicationDate: "2025-06-20", businessRegistrationApplicationDate: "2025-06-20" },
        { taxpayerType: "corporate" },
      ),
    );
    expect(r.excludedCount).toBe(0);
    expect(r.propertyResults[0].failReasons).toContain(E.EXCLUDED_11NA2_CORP_REGULATED_APP);
  });
  it("Q3 ★ 2024 과세연도 11호 → 시행 전 불성립", async () => {
    const r = await run(form({ rentalAcquisitionDate: "2018-01-01", rentalRegistrationDate: "2024-01-10" }, { assessmentYear: "2024" }));
    expect(r.excludedCount).toBe(0);
    expect(r.propertyResults[0].failReasons).toEqual([E.SHORT_TERM_6Y_NOT_IN_FORCE]);
  });
  it("2025: 9-30 등록·아파트 아님 → 성립 · 10-01 등록 → 불성립 · 아파트 → 불성립", async () => {
    const y25 = { assessmentYear: "2025" };
    const base = { rentalAcquisitionDate: "2018-01-01", isApartment: "no" as const };
    expect((await run(form({ ...base, rentalRegistrationDate: "2025-09-30" }, y25))).excludedCount).toBe(1);
    const late = await run(form({ ...base, rentalRegistrationDate: "2025-10-01" }, y25));
    expect(late.propertyResults[0].failReasons).toEqual([E.SHORT_TERM_6Y_2025_REGISTERED_LATE]);
    const apt = await run(form({ ...base, isApartment: "yes", rentalRegistrationDate: "2025-09-01" }, y25));
    expect(apt.propertyResults[0].failReasons).toEqual([E.SHORT_TERM_6Y_2025_APARTMENT]);
  });
});
