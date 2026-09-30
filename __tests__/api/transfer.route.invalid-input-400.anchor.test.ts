/**
 * anchor: 양도세 계열 route — `TaxCalculationError(INVALID_INPUT)` → **HTTP 400** (2026-09-30 결정 ·
 * 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.3).
 *
 * 종전에는 세 route(단건·다건·1주택 판정) 모두 **500**으로 응답해 서버 결함과 입력 결함이 구별되지 않았다.
 * ⑫ refine은 그대로 둔다(이중 방어) — 이 매핑은 refine이 못 잡은 조합의 안전망이다.
 * `details.path`가 있으면 Zod 400과 같은 `fieldErrors` 형태로 싣는다. 그 밖의 코드는 종전대로 500.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";

const inject = vi.hoisted(() => ({ throwCode: undefined as string | undefined }));

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
// 입력만으로 INVALID_INPUT을 확정적으로 만드는 조합은 ⑫ refine이 막아 가므로(이 PR), 엔진 진입점에서 던지게 한다.
vi.mock("@/lib/tax-engine/transfer-tax-aggregate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax-aggregate")>();
  return {
    ...actual,
    calculateTransferTaxAggregate: (...args: Parameters<typeof actual.calculateTransferTaxAggregate>) => {
      if (inject.throwCode)
        throw new TaxCalculationError(inject.throwCode as TaxErrorCode, "주입된 오류", { path: "properties.0.x" });
      return actual.calculateTransferTaxAggregate(...args);
    },
  };
});
vi.mock("@/lib/tax-engine/transfer-tax", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax")>();
  return {
    ...actual,
    calculateTransferTax: (...args: Parameters<typeof actual.calculateTransferTax>) => {
      if (inject.throwCode) throw new TaxCalculationError(inject.throwCode as TaxErrorCode, "주입된 오류");
      return actual.calculateTransferTax(...args);
    },
  };
});
vi.mock("@/lib/tax-engine/one-house/judge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/one-house/judge")>();
  return {
    ...actual,
    judgeOneHouseExemptionFromInput: (...args: Parameters<typeof actual.judgeOneHouseExemptionFromInput>) => {
      if (inject.throwCode) throw new TaxCalculationError(inject.throwCode as TaxErrorCode, "주입된 오류");
      return actual.judgeOneHouseExemptionFromInput(...args);
    },
  };
});

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { POST as ONE_HOUSE } from "@/app/api/calc/one-house-exemption/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { taxCalculationErrorResponse } from "@/lib/api/tax-error-response";

beforeEach(() => {
  inject.throwCode = undefined;
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Json = { error?: { code: string; message: string; fieldErrors?: Record<string, string[]> } };
async function post(handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) {
  const res = await handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}

const HOUSE = {
  propertyType: "housing",
  transferPrice: 800_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2003-01-15",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
};

describe("§4.3 단건 — 엔진이 던진 INVALID_INPUT", () => {
  // 실제 입력으로 INVALID_INPUT을 내던 조합(분리취득 파트 누락 · 일반건물 실가 기준시가 누락 등)은 이 PR에서
  // ⑫ refine이 입구에서 막는다 — 그래서 매핑 자체는 엔진 진입점 주입으로 고정한다.
  it("🔴 400 + code INVALID_INPUT (종전 500) · Zod 거부가 아니다", async () => {
    inject.throwCode = TaxErrorCode.INVALID_INPUT;
    const r = await post(SINGLE, "http://localhost/api/calc/transfer", { ...HOUSE, reductions: [] });
    expect(r.status).toBe(400);
    expect(r.json.error?.code).toBe(TaxErrorCode.INVALID_INPUT);
    expect(r.json.error?.message).toBe("주입된 오류");
  });
});

describe("§4.3 다건·1주택 판정 — 엔진이 던진 INVALID_INPUT", () => {
  it("🔴 다건 → 400 + details.path를 fieldErrors로 (종전 500)", async () => {
    inject.throwCode = TaxErrorCode.INVALID_INPUT;
    const r = await post(MULTI, "http://localhost/api/calc/transfer/multi", {
      taxYear: 2024,
      properties: [{ ...HOUSE, propertyId: "p1", propertyLabel: "자산 1" }],
    });
    expect(r.status).toBe(400);
    expect(r.json.error?.fieldErrors).toEqual({ "properties.0.x": ["주입된 오류"] });
  });

  it("🟢 다건 — 다른 코드(세율 누락)는 종전대로 500", async () => {
    inject.throwCode = TaxErrorCode.TAX_RATE_NOT_FOUND;
    const r = await post(MULTI, "http://localhost/api/calc/transfer/multi", {
      taxYear: 2024,
      properties: [{ ...HOUSE, propertyId: "p1", propertyLabel: "자산 1" }],
    });
    expect(r.status).toBe(500);
  });

  it("🔴 1주택 판정 → 400 (종전 500)", async () => {
    inject.throwCode = TaxErrorCode.INVALID_INPUT;
    const r = await post(ONE_HOUSE, "http://localhost/api/calc/one-house-exemption", {
      ...HOUSE,
      householdHousingCount: 1,
      isOneHousehold: true,
      residencePeriodMonths: 60,
      reductions: [],
    });
    expect(r.status).toBe(400);
    expect(r.json.error?.code).toBe(TaxErrorCode.INVALID_INPUT);
  });
});

describe("taxCalculationErrorResponse", () => {
  it("INVALID_INPUT → 400 · path 없으면 fieldErrors 없음 · 다른 코드 → 500", async () => {
    const a = taxCalculationErrorResponse(new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "m"));
    expect(a.status).toBe(400);
    expect(await a.json()).toEqual({ error: { code: "INVALID_INPUT", message: "m" } });
    const b = taxCalculationErrorResponse(new TaxCalculationError(TaxErrorCode.RATE_SCHEMA_MISMATCH, "m"));
    expect(b.status).toBe(500);
  });
});
