/**
 * anchor — 종부령 §3①7호 나목·8호 가목2) 의무임대기간 8/10년 화면 경로(⑤④⑫⑭ → 엔진 경고).
 * 술어 `asksPeriodApplicationDate`(lib/calc/comprehensive-rental-8na.ts) · 엔진은
 * __tests__/tax-engine/comprehensive-mandatory-period-8to10.anchor.test.ts.
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
import { asksPeriodApplicationDate } from "@/lib/calc/comprehensive-rental-8na";
import { na8Context } from "@/lib/calc/comprehensive-rental-8na";
import { defaultFormData, makeProperty } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveFormData, PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";

const GWANGJIN_PNU = "1121510500100010000";

type Excl = { excludedCount: number; propertyResults: { failReasons?: string[]; warnings?: string[] }[] };

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

const form = (over: Partial<PropertyEntry>): ComprehensiveFormData =>
  ({
    ...defaultFormData,
    assessmentYear: "2026",
    properties: [
      {
        ...makeProperty(),
        assessedValue: "300,000,000",
        exclusionType: "private_purchase_rental_long",
        rentalRegistrationType: "private_purchase_long",
        rentalRegistrationDate: "2020-08-25",
        rentalStartDate: "2020-09-01",
        area: "59",
        currentRent: "1,000,000",
        pnu: GWANGJIN_PNU,
        rentalAcquisitionDate: "2017-01-02",
        isApartment: "no",
        convertedFromShortTerm: "no",
        actualRentalYears: "7",
        ...over,
      },
      { ...makeProperty(), assessedValue: "1,500,000,000" },
    ],
  }) as ComprehensiveFormData;

describe("⑤④ 의무임대기간 신청일(선택) 칸", () => {
  it("등록일 2020.8.18. 이후 장기일반 → 칸을 연다 · 2020.8.17. 이전 등록 → 열지 않는다", () => {
    const ctx = na8Context(form({}), "private_purchase_long");
    expect(asksPeriodApplicationDate(form({}).properties[0], ctx)).toBe(true);
    expect(asksPeriodApplicationDate(form({ rentalRegistrationDate: "2020-08-17" }).properties[0], ctx)).toBe(false);
  });
  it("8호 나목3) 칸이 이미 신청일을 물으면(아파트) 따로 열지 않는다", () => {
    const ctx = na8Context(form({}), "private_purchase_long");
    expect(asksPeriodApplicationDate(form({ isApartment: "yes" }).properties[0], ctx)).toBe(false);
  });
  it("비어 있어도 ⑧에서 막지 않는다(경고 전용)", () => {
    expect(validateRequiredExclusionAndLandInputs(form({}))).toBeNull();
  });
});

describe("⑫⑭ → 엔진 경고", () => {
  it("★ 신청일 2020-08-17 입력 → 8년 기준 경고 · ④가 신청일을 보낸다", async () => {
    const body = await bodyOf(form({ rentalApplicationDate: "2020-08-17" }));
    const props = body.properties as { rentalInfo?: Record<string, unknown> }[];
    expect(props[0].rentalInfo?.rentalApplicationDate).toBe("2020-08-17");
    const r = await run(form({ rentalApplicationDate: "2020-08-17" }));
    expect(r.excludedCount).toBe(1);
    expect(r.propertyResults[0].warnings?.[0]).toMatch(/의무임대기간\(8년\) 미충족/);
  });
  it("신청일 비움 → 10년 + 8.17. 이전 신청이면 8년 안내", async () => {
    const r = await run(form({}));
    expect(r.propertyResults[0].warnings?.[0]).toMatch(/의무임대기간\(10년\).*2020\.8\.17\. 이전이면/);
  });
});
