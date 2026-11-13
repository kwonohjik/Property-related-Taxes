/**
 * anchor — 종부령 §3①6호 미분양매입임대 화면 파이프라인(⑤⑧④⑫⑭ → 엔진).
 * 술어 `ho6Asks`(lib/calc/comprehensive-rental-6ho.ts) · 엔진 판정은
 * __tests__/tax-engine/comprehensive-exclusion-6ho.anchor.test.ts.
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
    assessmentYear: "2025",
    ...top,
    properties: [
      {
        ...makeProperty(),
        assessedValue: "250,000,000",
        location: "non_metro",
        exclusionType: "unsold_purchase_rental",
        rentalRegistrationType: "unsold_purchase",
        rentalRegistrationDate: "2019-05-01",
        rentalStartDate: "2019-06-01",
        area: "84",
        currentRent: "1,000,000",
        ...over,
      },
      { ...makeProperty(), assessedValue: "1,500,000,000" },
    ],
  }) as ComprehensiveFormData;

/** 6호 요건을 모두 갖춘 화면 입력(2019 단기 등록 — 2호였다면 2018.3.31. 상한으로 불성립) */
const OK: Partial<PropertyEntry> = {
  unsoldContractDate: "2009-03-02",
  isUnsoldFirstComeSupply: "yes",
  unsoldUnitCount: 5,
  unsoldDocsSubmitted: "yes",
  rentalRegistrationKind: "short_term",
  rentalApplicationDate: "2019-04-20",
};

describe("⑧ 6호 묻는 순서", () => {
  it("계약일 → 미분양 → 호수 → 서류 → 등록 종류", () => {
    expect(validateRequiredExclusionAndLandInputs(form({}))).toMatch(/분양계약·계약금 납부일.*§3①6호/);
    expect(validateRequiredExclusionAndLandInputs(form({ unsoldContractDate: "2009-03-02" }))).toMatch(/선착순/);
    const u = { unsoldContractDate: "2009-03-02", isUnsoldFirstComeSupply: "yes" as const };
    expect(validateRequiredExclusionAndLandInputs(form(u))).toMatch(/미분양매입임대주택 호수/);
    expect(validateRequiredExclusionAndLandInputs(form({ ...u, unsoldUnitCount: 5 }))).toMatch(/사본/);
    expect(
      validateRequiredExclusionAndLandInputs(form({ ...u, unsoldUnitCount: 5, unsoldDocsSubmitted: "yes" })),
    ).toMatch(/등록 종류/);
  });
  it("미분양 5호 미만이면 2·3·5호 호수를 묻는다 · 5호 이상이면 묻지 않는다", () => {
    expect(validateRequiredExclusionAndLandInputs(form({ ...OK, unsoldUnitCount: 3 }))).toMatch(/2호·3호·5호/);
    expect(validateRequiredExclusionAndLandInputs(form(OK))).toBeNull();
  });
  it("등록일이 2020.7.11. 전이면 신청일을 묻지 않는다 · 뒤면 묻는다", () => {
    expect(validateRequiredExclusionAndLandInputs(form({ ...OK, rentalApplicationDate: "" }))).toBeNull();
    expect(
      validateRequiredExclusionAndLandInputs(form({ ...OK, rentalApplicationDate: "", rentalRegistrationDate: "2020-08-01" })),
    ).toMatch(/등록 신청일/);
  });
  it("장기일반 7.11. 이후 신청이면 아파트 · 장기일반·공공지원은 변경신고를 묻는다", () => {
    const lt = { ...OK, rentalRegistrationKind: "long_term_general" as const, rentalRegistrationDate: "2020-08-10", rentalApplicationDate: "2020-08-01" };
    expect(validateRequiredExclusionAndLandInputs(form(lt))).toMatch(/아파트인지/);
    expect(validateRequiredExclusionAndLandInputs(form({ ...lt, isApartment: "no" }))).toMatch(/변경신고한 주택인지/);
    expect(
      validateRequiredExclusionAndLandInputs(form({ ...OK, rentalRegistrationKind: "public_support", convertedFromShortTerm: "yes" })),
    ).toMatch(/변경신고일/);
  });
  it("2020 과세연도(가목 단서 시행 전)에는 등록 종류를 묻지 않는다", () => {
    const { rentalRegistrationKind: _k, ...noKind } = OK;
    void _k;
    expect(validateRequiredExclusionAndLandInputs(form(noKind, { assessmentYear: "2020" }))).toBeNull();
  });
});

describe("⑫⑭ → 엔진 (화면 경로 끝까지)", () => {
  it("★ P2 반전: 2019 단기 등록 미분양 주택 → 6호로 성립", async () => {
    const r = await run(form(OK));
    expect(r.excludedCount).toBe(1);
  });
  it("수도권 → 불성립(다목)", async () => {
    const r = await run(form({ ...OK, location: "metro" }));
    expect(r.excludedCount).toBe(0);
    expect(r.propertyResults[0].failReasons).toContain(E.UNSOLD_6HO_METRO);
  });
  it("미분양 3 + 3호(같은 시·도) 2 → 성립 · 미분양 3 + 2호 4 → 불성립", async () => {
    const units = { ...OK, unsoldUnitCount: 3, purchaseRental2hoCount: 0, existingRental3hoSameRegionCount: 2, reitRental5hoCount: 0 };
    expect((await run(form(units))).excludedCount).toBe(1);
    const r = await run(form({ ...units, existingRental3hoSameRegionCount: 0, purchaseRental2hoCount: 4 }));
    expect(r.propertyResults[0].failReasons).toContain(E.UNSOLD_6HO_UNITS_UNDER_5);
  });
  it("★ 가목 단서 1) 단기 2020-07-11 신청 → 불성립", async () => {
    const r = await run(form({ ...OK, rentalRegistrationDate: "2020-07-20", rentalApplicationDate: "2020-07-11" }));
    expect(r.propertyResults[0].failReasons).toEqual([E.UNSOLD_6HO_GA1_SHORT_AFTER_0711]);
  });
  it("★ 가목 단서 3) 공공지원 2021-01-05 변경신고 → 불성립", async () => {
    const r = await run(
      form({ ...OK, rentalRegistrationKind: "public_support", convertedFromShortTerm: "yes", shortTermConversionDate: "2021-01-05" }),
    );
    expect(r.propertyResults[0].failReasons).toEqual([E.UNSOLD_6HO_GA3_CONVERTED_AFTER_0711]);
  });
  it("계약일 2009-07-01 → 불성립 · 서류 미제출 → 불성립", async () => {
    expect((await run(form({ ...OK, unsoldContractDate: "2009-07-01" }))).propertyResults[0].failReasons).toEqual([
      E.UNSOLD_6HO_NOT_UNSOLD,
    ]);
    expect((await run(form({ ...OK, unsoldDocsSubmitted: "no" }))).propertyResults[0].failReasons).toEqual([
      E.UNSOLD_6HO_DOCS_NOT_SUBMITTED,
    ]);
  });
});
