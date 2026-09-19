/**
 * F-15 — §155㉑ route 경유(폼 → ④ → ⑫ → ⑭ → 엔진). 엔진 anchor:
 * `__tests__/tax-engine/rental-housing-exception/rental-period-pending-155-21-f15.anchor.test.ts`.
 *
 * 화면에서 임대 36개월(마목 · 의무 10년)을 입력해도 거주주택 8억은 비과세, ㉒ 안내가 뜬다.
 * 수정 전: 결정세액 > 0 (특례 적용 불가 → 과세).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI, type TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function form(rentalMonths: string): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2025-03-03";
  f.householdHousingCount = "1";
  const a = f.assets[0];
  Object.assign(a, {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-08-12",
    actualSalePrice: "800,000,000",
    fixedAcquisitionPrice: "400,000,000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
  });
  a.rentalHousingException = {
    ...a.rentalHousingException,
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        ...makeDefaultRentalUnit(),
        businessRegistrationDate: "2021-06-01",
        rentalRegistrationDate: "2021-06-01",
        standardPriceAtRentalStart: "300,000,000",
        rentalInputMode: "direct",
        rentalMonths,
        requirementsConfirmed: true,
      },
    ],
  };
  f.contractTotalPrice = "800,000,000";
  return f;
}

async function calculate(f: TransferFormData) {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data: TransferAPIResult };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  if (json.data.mode !== "single") throw new Error("single 기대");
  return json.data.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("F-15 route — 임대기간요건 충족 전 거주주택 양도", () => {
  it("F15-R1 임대 36개월 → 비과세 0 · ㉒ 안내 (기간 충족 120개월과 같은 세액)", async () => {
    const pending = await calculate(form("36"));
    const met = await calculate(form("120"));
    expect(met.totalTax).toBe(0);
    expect(pending.totalTax).toBe(0);
    expect(pending.warnings?.some((w) => w.includes("§155㉒"))).toBe(true);
    expect(met.warnings?.some((w) => w.includes("§155㉒")) ?? false).toBe(false);
  });

  it("F15-R2 (대조) 기준시가 상한 초과는 기간과 무관하게 과세", async () => {
    const f = form("36");
    f.assets[0].rentalHousingException.rentalUnits[0].standardPriceAtRentalStart = "700,000,000";
    expect((await calculate(f)).totalTax).toBeGreaterThan(0);
  });
});
