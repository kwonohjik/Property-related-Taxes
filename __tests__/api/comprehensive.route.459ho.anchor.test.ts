/**
 * anchor — 종부령 §3①4·5·9호 화면 파이프라인(⑧④⑫⑭ → 엔진).
 * 술어 `ho459`·`validate459hoInputs`·`rental459hoApiFields`(lib/calc/comprehensive-rental-459ho.ts) · 엔진 판정은
 * __tests__/tax-engine/comprehensive-exclusion-459ho.anchor.test.ts.
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

type Excl = { excludedCount: number; propertyResults: { failReasons?: string[]; reason?: string }[] };
type Body = { properties: { rentalInfo?: Record<string, unknown> }[] };

async function bodyOf(form: ComprehensiveFormData): Promise<Body> {
  let body: Body = { properties: [] };
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

async function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/calc/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** 화면 경로 끝까지 — ⑧ 통과를 먼저 확인하고 ④ 본문을 route에 보낸다 */
async function run(form: ComprehensiveFormData): Promise<Excl> {
  expect(validateRequiredExclusionAndLandInputs(form)).toBeNull();
  const res = await post(await bodyOf(form));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { aggregationExclusion: Excl } }).data.aggregationExclusion;
}

const form = (over: Partial<PropertyEntry>, year = "2025"): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: year,
    properties: [{ ...makeProperty(), ...over }, { ...makeProperty(), assessedValue: "1,500,000,000" }],
  }) as ComprehensiveFormData;

/** 4호 — 2022 등록 · 사용승인 2024-03-01 · 미임대 · 120㎡ · 8억 · 임대개시일 없음 */
const HO4: Partial<PropertyEntry> = {
  exclusionType: "vacant_construction_rental",
  rentalRegistrationType: "vacant_construction",
  rentalRegistrationDate: "2022-03-01",
  usageApprovalDate: "2024-03-01",
  neverRentedSinceApproval: "yes",
  assessedValue: "800,000,000",
  area: "120",
};
/** 5호 — 2008 취득 · 5호 · 2008 공시가격 6억 이하 · 비수도권 · 100㎡ · 현재 9억 */
const HO5: Partial<PropertyEntry> = {
  exclusionType: "reit_purchase_rental",
  rentalRegistrationType: "reit_purchase",
  rentalRegistrationDate: "2008-05-01",
  rentalStartDate: "2008-06-01",
  reitAcquisitionDate: "2008-05-01",
  reitRental5hoCount: 5,
  reitPrice2008Under6eok: "yes",
  location: "non_metro",
  assessedValue: "900,000,000",
  area: "100",
};
/** 9호 — 공공건설 바탕 · 만료 2024-03-01 · 미전환 · 84㎡ · 5억 · 임대개시일 없음 */
const HO9: Partial<PropertyEntry> = {
  exclusionType: "public_conversion_pending_rental",
  rentalRegistrationType: "public_conversion_pending",
  rentalRegistrationDate: "2014-03-01",
  conversionBase: "construction",
  isConversionPublicRental: "yes",
  mandatoryPeriodEndDate: "2024-03-01",
  conversionCompleted: "no",
  assessedValue: "500,000,000",
  area: "84",
};

describe("⑧ 묻는 칸 · 임대개시일", () => {
  it("★ 4·9호는 임대개시일을 묻지 않는다 · 그 밖 유형은 종전대로 묻는다", () => {
    expect(validateRequiredExclusionAndLandInputs(form(HO4))).toBeNull();
    expect(validateRequiredExclusionAndLandInputs(form(HO9))).toBeNull();
    expect(validateRequiredExclusionAndLandInputs(form({ ...HO5, rentalStartDate: "" }))).toMatch(/임대개시일/);
  });
  it("4호: 사용승인일 → 임대 사실 · 5호: 취득일 → 호수 → 2008 공시가격 · 9호: 종류 → 분양전환공공임대 → 만료일 → 분양전환", () => {
    expect(validateRequiredExclusionAndLandInputs(form({ ...HO4, usageApprovalDate: "" }))).toMatch(/사용승인일.*§3①4호/);
    expect(validateRequiredExclusionAndLandInputs(form({ ...HO4, neverRentedSinceApproval: "" }))).toMatch(/임대한 적/);
    expect(validateRequiredExclusionAndLandInputs(form({ ...HO5, reitAcquisitionDate: "" }))).toMatch(/취득한 날.*§3①5호/);
    expect(validateRequiredExclusionAndLandInputs(form({ ...HO5, reitRental5hoCount: undefined }))).toMatch(/5호 매입임대주택 호수/);
    expect(validateRequiredExclusionAndLandInputs(form({ ...HO5, reitPrice2008Under6eok: "" }))).toMatch(/2008년도/);
    expect(validateRequiredExclusionAndLandInputs(form({ ...HO9, conversionBase: "" }))).toMatch(/공공건설임대.*§3①9호/);
    expect(validateRequiredExclusionAndLandInputs(form({ ...HO9, isConversionPublicRental: "" }))).toMatch(/분양전환공공임대주택인지/);
    expect(validateRequiredExclusionAndLandInputs(form({ ...HO9, mandatoryPeriodEndDate: "" }))).toMatch(/만료일/);
    expect(validateRequiredExclusionAndLandInputs(form({ ...HO9, conversionCompleted: "" }))).toMatch(/분양전환이 이루어졌는지/);
  });
});

describe("④ 본문", () => {
  it("4호는 2025에도 사용승인일을 보낸다 · 임대개시일은 비면 보내지 않는다", async () => {
    const info = (await bodyOf(form(HO4))).properties[0].rentalInfo;
    expect(info).toMatchObject({ registrationType: "vacant_construction", usageApprovalDate: "2024-03-01", neverRentedSinceApproval: true });
    expect(info?.rentalStartDate).toBeUndefined();
  });
  it("다른 유형에서는 4·5·9호 값을 보내지 않는다", async () => {
    const info = (await bodyOf(form({ ...HO5, exclusionType: "private_purchase_rental_short", rentalRegistrationType: "private_purchase_short" }))).properties[0].rentalInfo;
    expect(info?.reitAcquisitionDate).toBeUndefined();
    expect(info?.reitPrice2008Under6eok).toBeUndefined();
  });
  it("★ 9호는 말소일을 보내지 않는다(칸을 묻지 않음 — 다른 유형에서 넣어 둔 값이 남아도) · 4호는 보낸다", async () => {
    const revoked = { registrationRevokedDate: "2024-04-01" };
    expect((await bodyOf(form({ ...HO9, ...revoked }))).properties[0].rentalInfo?.registrationRevokedDate).toBeUndefined();
    expect((await bodyOf(form({ ...HO4, ...revoked }))).properties[0].rentalInfo?.registrationRevokedDate).toBe("2024-04-01");
  });
});

describe("⑫⑭ → 엔진 (화면 경로 끝까지)", () => {
  it("★ 4호 성립 · 임대한 적 있음 → 불성립", async () => {
    const ok = await run(form(HO4));
    expect(ok.excludedCount).toBe(1);
    expect(ok.propertyResults[0].reason).toBe(E.VACANT_CONSTRUCTION_RENTAL);
    const ng = await run(form({ ...HO4, neverRentedSinceApproval: "no" }));
    expect(ng.propertyResults[0].failReasons).toEqual([E.VACANT_4HO_RENTED]);
  });
  it("★ 5호 성립(현재 9억이어도) · 2007 취득 → 불성립", async () => {
    expect((await run(form(HO5))).excludedCount).toBe(1);
    expect((await run(form({ ...HO5, reitAcquisitionDate: "2007-12-31" }))).propertyResults[0].failReasons).toEqual([
      E.REIT_5HO_NOT_2008,
    ]);
  });
  it("★ 9호 성립 · 공공매입 수도권 7억 → 가격 초과 · 2022 → 시행 전", async () => {
    expect((await run(form(HO9))).excludedCount).toBe(1);
    const purchase = await run(form({ ...HO9, conversionBase: "purchase", assessedValue: "700,000,000" }));
    expect(purchase.propertyResults[0].failReasons).toEqual([E.PRICE_EXCEEDED]);
    const y22 = await run(form({ ...HO9, mandatoryPeriodEndDate: "2021-03-01" }, "2022"));
    expect(y22.propertyResults[0].failReasons).toEqual([E.CONV_9HO_NOT_IN_FORCE]);
  });
  it("⑫ 직접 API: 4·9호가 아닌데 임대개시일이 없으면 400", async () => {
    const body = await bodyOf(form({ ...HO5 }));
    delete body.properties[0].rentalInfo?.rentalStartDate;
    expect((await post(body)).status).toBe(400);
  });
});
