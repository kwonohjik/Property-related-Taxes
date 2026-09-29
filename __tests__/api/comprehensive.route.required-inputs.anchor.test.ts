/**
 * 종합부동산세 — 엔진이 필요로 하는 값을 ④가 채우거나 ⑫가 비워 두게 두던 결함 (2026-09-30 Zod↔엔진 필수 점검).
 *
 * - C4 (UI 도달): 합산배제 임대주택의 등록일·임대개시일·면적이 비면 ④가 `과세연도-01-01`·60㎡로 채워
 *   보냈다 → 합산배제가 조용히 **적용**. ⑧ 검증이 없었다.
 * - C3 (UI 도달): 토지 집계 입력의 재산세 과세표준이 비면(0) 비율 안분 공제가 0 → 세액 증가.
 * - C1 (API): 1세대1주택자 토글 + 일반주택 2채 — ⑧은 막지만 ⑫는 받아 12억 공제.
 * - C2 (API): 직전연도 총세액 직접입력 + 자동계산 동시 — 엔진이 직접입력을 조용히 쓴다.
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
import {
  callComprehensiveApi,
  validateRequiredExclusionAndLandInputs,
} from "@/lib/calc/comprehensive-api";
import { defaultFormData, makeProperty } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveFormData } from "@/lib/stores/comprehensive-wizard-store";

type Json = { data?: Record<string, unknown>; error?: { issues?: { path: (string | number)[] }[] } };
async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/comprehensive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
const paths = (json: Json) => (json.error?.issues ?? []).map((i) => i.path.join("."));

/** ④가 보내는 본문 — fetch를 가로챈다 */
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

describe("C4 — 합산배제 임대주택 빈 칸 (UI 도달)", () => {
  const form = (over: Record<string, unknown>): ComprehensiveFormData => ({
    ...defaultFormData,
    assessmentYear: "2025",
    properties: [
      {
        ...makeProperty(),
        assessedValue: "500,000,000",
        exclusionType: "private_purchase_rental_long",
        currentRent: "1,000,000",
        ...over,
      },
      { ...makeProperty(), assessedValue: "1,500,000,000" },
    ],
  } as ComprehensiveFormData);

  it("🔴 ⑧ 등록일·임대개시일·면적 비면 차단", () => {
    expect(validateRequiredExclusionAndLandInputs(form({}))).toMatch(/임대사업자 등록일/);
    expect(
      validateRequiredExclusionAndLandInputs(form({ rentalRegistrationDate: "2020-01-01" })),
    ).toMatch(/임대개시일/);
    expect(
      validateRequiredExclusionAndLandInputs(
        form({ rentalRegistrationDate: "2020-01-01", rentalStartDate: "2020-01-01" }),
      ),
    ).toMatch(/전용면적/);
  });

  it("🟢 ⑧ 모두 있으면 통과", () => {
    expect(
      validateRequiredExclusionAndLandInputs(
        form({ rentalRegistrationDate: "2020-01-01", rentalStartDate: "2020-01-01", area: "84" }),
      ),
    ).toBeNull();
  });

  it("🔴 ④는 빈 칸을 과세연도 1월 1일·60㎡로 채우지 않는다", async () => {
    const body = await bodyOf(form({}));
    const info = (body.properties as { rentalInfo?: Record<string, unknown> }[])[0].rentalInfo!;
    expect(info.rentalRegistrationDate).not.toBe("2025-01-01");
    expect(info.rentalStartDate).not.toBe("2025-01-01");
    expect(info.area).not.toBe(60);
  });

  it("🟢 값이 있으면 그대로 싣는다", async () => {
    const body = await bodyOf(
      form({ rentalRegistrationDate: "2020-01-01", rentalStartDate: "2020-02-01", area: "84" }),
    );
    const info = (body.properties as { rentalInfo?: Record<string, unknown> }[])[0].rentalInfo!;
    expect(info).toMatchObject({ rentalRegistrationDate: "2020-01-01", rentalStartDate: "2020-02-01", area: 84 });
  });
});

describe("C3 — 토지 집계 재산세 과세표준 0", () => {
  const land = (base: number) => ({
    properties: [],
    isOneHouseOwner: false,
    assessmentYear: 2025,
    landAggregate: { totalOfficialValue: 1_000_000_000, propertyTaxBase: base, propertyTaxAmount: 3_250_000 },
  });
  it("🟢 과세표준 있음 → 200 · 결정세액 3,250,000", async () => {
    const r = await post(land(700_000_000));
    expect(r.status).toBe(200);
    expect((r.json.data!.aggregateLandTax as { determinedTax: number }).determinedTax).toBe(3_250_000);
  });
  it("🔴 부과세액 있는데 과세표준 0 → 400 (종전 공제 0 · 5,000,000)", async () => {
    const r = await post(land(0));
    expect(r.status).toBe(400);
    expect(paths(r.json)).toContain("landAggregate.propertyTaxBase");
  });
  it("🔴 별도합산 집계도 같은 규칙", async () => {
    const r = await post({
      properties: [],
      isOneHouseOwner: false,
      assessmentYear: 2025,
      landSeparate: [{ landId: "s1", publicPrice: 10_000_000_000, propertyTaxBase: 0, propertyTaxAmount: 20_000_000 }],
    });
    expect(r.status).toBe(400);
    expect(paths(r.json)).toContain("landSeparate.0.propertyTaxBase");
  });
  it("🔴 ⑧ 집계 입력 과세표준 빈 칸 차단", () => {
    const f = {
      ...defaultFormData,
      hasAggregateLand: true,
      landAggregateMode: "summary",
      landAggregate: { ...defaultFormData.landAggregate, totalOfficialValue: "1,000,000,000", propertyTaxBase: "", propertyTaxAmount: "3,250,000" },
    } as ComprehensiveFormData;
    expect(validateRequiredExclusionAndLandInputs(f)).toMatch(/재산세 과세표준/);
    expect(
      validateRequiredExclusionAndLandInputs({ ...f, landAggregate: { ...f.landAggregate, propertyTaxBase: "700,000,000" } }),
    ).toBeNull();
  });
});

describe("C1·C2 — API 직접 호출", () => {
  const two = [
    { propertyId: "h1", assessedValue: 1_000_000_000 },
    { propertyId: "h2", assessedValue: 800_000_000 },
  ];
  it("C1 🟢 1주택 토글 끔 → 200", async () => {
    expect((await post({ properties: two, isOneHouseOwner: false, assessmentYear: 2025 })).status).toBe(200);
  });
  it("C1 🔴 1주택 토글 + 일반주택 2채 → 400 (종전 12억 공제)", async () => {
    const r = await post({ properties: two, isOneHouseOwner: true, assessmentYear: 2025 });
    expect(r.status).toBe(400);
    expect(paths(r.json)).toContain("isOneHouseOwner");
  });
  it("C1 🟢 1채면 토글 허용", async () => {
    expect((await post({ properties: [two[0]], isOneHouseOwner: true, assessmentYear: 2025 })).status).toBe(200);
  });
  it("C2 🔴 직전연도 총세액 직접입력 + 자동계산 → 400 (종전 직접입력이 조용히 이김)", async () => {
    const r = await post({
      properties: [{ propertyId: "h1", assessedValue: 3_000_000_000, priorAssessedValue: 2_000_000_000 }],
      isOneHouseOwner: false,
      assessmentYear: 2025,
      previousYearAuto: { assessedValue: 2_000_000_000, isOneHouseOwner: false, priorHouseValues: [2_000_000_000] },
      previousYearTotalTax: 1_000_000,
    });
    expect(r.status).toBe(400);
    expect(paths(r.json)).toContain("previousYearTotalTax");
  });
});
