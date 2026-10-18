/**
 * route 관측 — 「소득세법」 §104⑤2호 단서는 2019.1.1. 이후 양도분부터(법률 제16104호 부칙 제2조②, A1 β).
 * 화면 폼 → `callMultiTransferTaxAPI` 변환 → 다건 route → 엔진까지 같은 값이 나오는지 고정한다.
 *
 * 시료: 조정대상지역 3주택(명부 없음, 주택 수 3) · 1년 미만 보유 주택 2채 — B 3천만(①3호 40% 승) · C 3억(⑦3호 승).
 * 세율은 route가 고른 날짜(과세기간 말일)의 연혁 fallback.
 *
 * | 양도일 | 산출세액 | 근거 |
 * |---|---:|---|
 * | 2018-10-01 | 166,600,000 | 자산별 큰 세액의 합 12,000,000 + 154,600,000 (단서 없음) |
 * | 2019-01-02 | 172,600,000 | 합산 3억 3천만에 호별 세율 · 큰 것 ⑦3호 (단서) |
 *
 * 계획서: docs/02-design/features/transfer-104-5-2-proviso-era.plan.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

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

import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const GANGNAM = "1168010100";

/** 조정대상지역(강남) 3주택 · 1년 미만 보유 주택 — 명부 없이 주택 수 3(원시 경로). */
function form(transferDate: string, price: string): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2018-01-15", fixedAcquisitionPrice: "0", regionCode: GANGNAM };
  return Object.assign(f, {
    transferDate, contractTotalPrice: price, residencePeriodMonths: "0",
    householdHousingCount: "3", isRegulatedArea: true, wasRegulatedAtAcquisition: false, houses: [],
  });
}

async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: {} }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}

async function multi(transferDate: string): Promise<Obj> {
  const mf = { taxYear: Number(transferDate.slice(0, 4)), annualBasicDeductionUsed: "2500000", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [
      { propertyId: "B", propertyLabel: "B", form: form(transferDate, "30,000,000"), completionPercent: 100 },
      { propertyId: "C", propertyLabel: "C", form: form(transferDate, "300,000,000"), completionPercent: 100 },
    ]),
  );
  const res = await MULTI(new NextRequest("http://l/api/calc/transfer/multi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = (await res.json()) as { data: Obj };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_types, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("A1 β 다건 route — 단서 적용 시기", () => {
  it("2018-10-01 양도 → 166,600,000 (자산별 큰 세액의 합)", async () => {
    expect((await multi("2018-10-01")).calculatedTax).toBe(166_600_000);
  });
  it("2019-01-02 양도 → 172,600,000 (단서 — 합산 후 호별 MAX)", async () => {
    expect((await multi("2019-01-02")).calculatedTax).toBe(172_600_000);
  });
});
