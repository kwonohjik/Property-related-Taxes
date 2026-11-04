/**
 * §155⑳ 직전거주주택보유주택(B) × 다주택 중과 → 장기보유특별공제 배제 — 단건 route = 다건 route(자산 1건) (계획서 C-10 · V-2).
 *
 * 소득세법 §95② 괄호 「제104조제7항 각 호에 따른 자산은 제외」 — 사용자 결정 2026-11-04 D-2
 * (`docs/00-pm/rental-155-20-review-fixes.plan.md` PR-2). 다건은 ⑳ 슬롯을 단건 step 결과로 읽으므로 같은 세액이어야 한다.
 * 입력은 `__tests__/calc/rental-prhp-surcharge-unverified-notice.anchor.test.ts` N-1과 같다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

function form(count: string, transferDate = "2026-08-01"): Form {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate, householdHousingCount: count, isOneHousehold: true, isRegulatedArea: true, wasRegulatedAtAcquisition: false, contractTotalPrice: "1,500,000,000" });
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-08-12", actualSalePrice: "1,500,000,000", fixedAcquisitionPrice: "489,000,000", useEstimatedAcquisition: false, residenceInputMode: "direct", residencePeriodMonthsAsset: "30" });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException,
    applyException: true,
    scenario: "B",
    rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct" as const, rentalMonths: "80", requirementsConfirmed: true }],
    priorResidenceTransferDate: "2016-08-25",
    standardPriceAtAcquisitionForPhrp: "300,000,000",
    standardPriceAtPriorTransfer: "450,000,000",
    standardPriceAtTransferForPhrp: "500,000,000",
    postRegistrationResidenceMonths: "30",
    wasRegisteredRentalOrChildcare: true,
  };
  return f;
}

async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}
const post = (handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  handler(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

async function single(f: Form): Promise<{ totalTax: number; lthd: number }> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: { totalTax: number; longTermHoldingDeduction: number } } };
  expect(res.status).toBe(200);
  return { totalTax: json.data.result.totalTax, lthd: json.data.result.longTermHoldingDeduction };
}
async function multi(f: Form): Promise<number> {
  const mf = { taxYear: Number(f.transferDate.slice(0, 4)), annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  const body = await bodyOf(() => callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]));
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { totalTax: number } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.totalTax;
}

describe("§155⑳ B × 다주택 중과 — 장특 배제 단건 = 다건", () => {
  it("C-8·C-10 주택 수 2 · 조정 · 2026-08-01 → 장특 0 · 510,362,600 (단건 = 다건)", async () => {
    const s = await single(form("2"));
    expect(s).toEqual({ totalTax: 510_362_600, lthd: 0 });
    expect(await multi(form("2"))).toBe(510_362_600);
  });

  it("C-9 [짝] 주택 수 1(중과 없음) → 장특 그대로 · 216,673,182 (단건 = 다건)", async () => {
    const s = await single(form("1"));
    expect(s).toEqual({ totalTax: 216_673_182, lthd: 303_300_000 });
    expect(await multi(form("1"))).toBe(216_673_182);
  });
});
