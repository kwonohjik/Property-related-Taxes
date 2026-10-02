/**
 * route anchor — §97③ 감가상각비가 **폼 → ④ → ⑫ Zod → ⑭ route → 엔진**을 끝까지 통과한다.
 *
 * ⑫⑭는 TypeScript가 못 잡는다(누락 시 **침묵 strip** — 200으로 감가상각비 없는 세액이 나온다).
 * 그래서 이 파일은 필드가 **세액에 닿았는지**를 단건·다건 양쪽에서 본다.
 *
 * 기대값: 같은 거래를 감가상각비 0으로 계산한 결과와 비교한 **양도차익 차이**가 정확히 감가상각비다.
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

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TD = "2026-06-03";
const rates = loadFallbackTransferRates(new Date(TD));

function form(dep: string, over: Obj = {}): Form {
  const f = createDefaultTransferFormData();
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "building",
    addressJibun: "서울 강남구 테스트동 1-1",
    acquisitionCause: "purchase",
    acquisitionDate: "2019-09-10",
    actualSalePrice: "500000000",
    fixedAcquisitionPrice: "300000000",
    capitalExpenditure: "10000000",
    transferExpense: "2000000",
    depreciationAmount: dep,
    ...over,
  };
  return Object.assign(f, {
    transferDate: TD,
    contractTotalPrice: "500000000",
    householdHousingCount: "0",
    isOneHousehold: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
  });
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
  handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function single(f: Form) {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return { body, result: json.data.result };
}

async function multi(f: Form) {
  const mf = {
    taxYear: 2026,
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p0", propertyLabel: "p0", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { properties: Obj[] } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return { body, property: json.data.properties[0] };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(rates as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("D0-1 단건 route — 감가상각비가 세액에 닿는다", () => {
  it("🔴 양도차익이 감가상각비만큼 커진다 (침묵 strip이면 차이 0)", async () => {
    const base = await single(form("0"));
    const dep = await single(form("40000000"));
    expect(dep.body.depreciationAmount).toBe(40_000_000);
    expect(base.result.transferGain).toBe(188_000_000); // 500 − 300 − 12
    expect(dep.result.transferGain).toBe(228_000_000); // 500 − (300 − 40) − 12
    expect(dep.result.depreciationAmount).toBe(40_000_000);
    expect(dep.result.totalTax as number).toBeGreaterThan(base.result.totalTax as number);
  });

  it("긍정 짝 — 감가상각비 0이면 body에 키가 없고 세액이 같다", async () => {
    const a = await single(form("0"));
    expect(a.body.depreciationAmount).toBeUndefined();
    expect(a.result.depreciationAmount).toBeUndefined();
  });

  it("🔴 환산 취득가액에서도 공제된다 (조심2013서4988)", async () => {
    const f = (dep: string) =>
      form(dep, {
        useEstimatedAcquisition: true,
        standardPriceAtAcq: "150000000",
        standardPriceAtTransfer: "300000000",
        actualSalePrice: "400000000",
        capitalExpenditure: "0",
        transferExpense: "0",
      });
    const ff = (dep: string) => {
      const x = f(dep);
      x.contractTotalPrice = "400000000";
      return x;
    };
    const base = await single(ff("0"));
    const dep = await single(ff("20000000"));
    expect(dep.result.transferGain).toBe((base.result.transferGain as number) + 20_000_000);
  });
});

describe("D0-2 다건 route — ⑭ 키 열거에 매핑돼 있다", () => {
  it("🔴 자산별 양도차익이 감가상각비만큼 커진다 (⑭ 누락이면 strip)", async () => {
    const base = await multi(form("0"));
    const dep = await multi(form("40000000"));
    expect(dep.body.properties).toBeDefined();
    expect((dep.body.properties as Obj[])[0].depreciationAmount).toBe(40_000_000);
    expect(base.property.transferGain).toBe(188_000_000);
    expect(dep.property.transferGain).toBe(228_000_000);
    // 표시 echo — 엔진이 취득가액에서 공제한 값
    expect(dep.property.depreciationAmount).toBe(40_000_000);
    expect(dep.property.acquisitionPrice).toBe(260_000_000);
  });
});
