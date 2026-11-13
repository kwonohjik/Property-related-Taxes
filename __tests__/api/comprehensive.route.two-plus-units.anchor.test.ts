/**
 * anchor — 종부령 §3①1·3·7·10호 「요건을 모두 갖춘 주택이 2호 이상」 화면 파이프라인(⑧④⑫⑭ → 엔진).
 * 술어 `qualifyingUnitHo`·`validateQualifyingUnits`(lib/calc/comprehensive-rental-units.ts) · 엔진 판정은
 * __tests__/tax-engine/comprehensive-exclusion-two-plus-units.anchor.test.ts.
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
import { callComprehensiveApi } from "@/lib/calc/comprehensive-api";
import { validateRequiredExclusionAndLandInputs } from "@/lib/calc/comprehensive-api";
import { defaultFormData, makeProperty } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveFormData, PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { COMPREHENSIVE_EXCL as E } from "@/lib/tax-engine/legal-codes";

type Excl = { excludedCount: number; propertyResults: { failReasons?: string[] }[] };

async function bodyOf(form: ComprehensiveFormData): Promise<{ properties: { rentalInfo?: Record<string, unknown> }[] }> {
  let body = { properties: [] };
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

/** 1호 민간건설 1채 + 일반 1채 · 2025 과세 — 2017 등록·사업자등록(단서 충족) · 4억 · 80㎡ */
const form = (over: Partial<PropertyEntry>, top: Partial<ComprehensiveFormData> = {}): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: "2025",
    ...top,
    properties: [
      {
        ...makeProperty(),
        assessedValue: "400,000,000",
        exclusionType: "private_construction_rental",
        rentalRegistrationType: "private_construction",
        rentalRegistrationDate: "2017-01-01",
        businessRegistrationDate: "2017-01-01",
        rentalStartDate: "2020-02-01",
        area: "80",
        currentRent: "1,000,000",
        ...over,
      },
      { ...makeProperty(), assessedValue: "1,500,000,000" },
    ],
  }) as ComprehensiveFormData;

const EXISTING_3HO = {
  exclusionType: "existing_rental" as const,
  rentalRegistrationType: "existing_rental",
  rentalRegistrationDate: "2003-01-01",
  businessRegistrationDate: "",
  assessedValue: "250,000,000",
};

describe("⑧ 호수 칸", () => {
  it("★ 1호 호수를 비우면 막는다(같은 시·도 · §3⑤) · 3호는 전국(⑤ 없음)", () => {
    expect(validateRequiredExclusionAndLandInputs(form({}))).toMatch(/같은 시·도에서 1호 요건.*§3①1호·§3⑤/);
    const msg = validateRequiredExclusionAndLandInputs(form(EXISTING_3HO));
    expect(msg).toMatch(/전국에서 3호 요건/);
    expect(msg).not.toMatch(/§3⑤/);
  });
  it("30호 이상 호수인데 「30호 이상 임대」를 끄면 막는다 · 켜면 통과 · 30호 미만에 켠 것은 막지 않는다", () => {
    expect(validateRequiredExclusionAndLandInputs(form({ qualifyingUnitCount: 30 }))).toMatch(/30호 이상 임대/);
    expect(validateRequiredExclusionAndLandInputs(form({ qualifyingUnitCount: 30, isThirtyPlusUnits: true }))).toBeNull();
    expect(validateRequiredExclusionAndLandInputs(form({ qualifyingUnitCount: 25, isThirtyPlusUnits: true }))).toBeNull();
    // 30호 구간이 없던 2024는 토글을 묻지 않으므로 막지 않는다
    expect(validateRequiredExclusionAndLandInputs(form({ qualifyingUnitCount: 30 }, { assessmentYear: "2024" }))).toBeNull();
  });
  it("2·8·11호는 호수를 묻지도 보내지도 않는다", async () => {
    const p8 = form({
      exclusionType: "private_purchase_rental_short",
      rentalRegistrationType: "private_purchase_short",
      qualifyingUnitCount: 1,
    });
    expect(validateRequiredExclusionAndLandInputs(p8)).toBeNull();
    expect((await bodyOf(p8)).properties[0].rentalInfo?.qualifyingUnitCount).toBeUndefined();
  });
});

describe("⑫⑭ → 엔진 (화면 경로 끝까지)", () => {
  it("★ 1호 1채 → 불성립(2호 미만) · 2호 → 성립", async () => {
    const one = await run(form({ qualifyingUnitCount: 1 }));
    expect(one.excludedCount).toBe(0);
    expect(one.propertyResults[0].failReasons).toContain(E.TWO_PLUS_UNITS_UNDER_2);
    expect((await run(form({ qualifyingUnitCount: 2 }))).excludedCount).toBe(1);
  });
  it("★ 3호 1채 → 불성립 · 2호 → 성립", async () => {
    expect((await run(form({ ...EXISTING_3HO, qualifyingUnitCount: 1 }))).excludedCount).toBe(0);
    expect((await run(form({ ...EXISTING_3HO, qualifyingUnitCount: 2 }))).excludedCount).toBe(1);
  });
});
