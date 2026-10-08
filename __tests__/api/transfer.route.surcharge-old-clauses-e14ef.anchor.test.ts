/**
 * E-14e·f route 관측 — 폼 → ④ API 변환 → ⑫ Zod → ⑭ route(단건·다건) → 엔진 구 호(2023.2.28. 전 양도분).
 * leaf·엔진 anchor와 법령 근거: `__tests__/tax-engine/transfer/surcharge-old-clauses-e14ef.anchor.test.ts`.
 *
 * 🔑 새 사용자 입력은 없다 — 기존 입력(명부 · 일시적 2주택 · 입주권 · 혼인일)이 새 판정에 실제로 도달하는지 본다
 *    (`feedback_leaf_anchor_skips_zod_layer`).
 * 세율은 양도일 기준 프로덕션 fallback · 강남 · 20억 · 조정 취득(§154① 거주 2년 요건) · 거주 0.
 *
 * | 시료 | 수정 전 | 수정 후 | 근거 |
 * |---|---:|---:|---|
 * | 2주택 · 명부 도출 일시적 2주택 · §154① 미충족 · 2022-03-02 | 1,141,772,500 | 768,322,500 | 구 §167의10①8호 |
 * | 2주택 · 종전 취득 후 1년 이내 신규(0869) | 1,141,772,500 | 768,322,500 | 구 8호 |
 * | 주택 1 + 조합원입주권 1(§156의2③) · §154① 미충족 | 1,141,772,500 | 768,322,500 | 구 §167의11①1호 |
 * | 주택 1 + 입주권 1 · 혼인 합가(각자 보유) | 423,115,000 | 236,365,800 | 구 §167의11①7호 |
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
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const GANGNAM = "1168010100";
const T = "2022-03-02";

const ROW: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2021-07-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function form(acq: string, houses: HouseEntry[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: acq,
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate: T,
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    houses,
    ...over,
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

async function single(f: Form): Promise<{ totalTax: number; reasons: string }> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as { exclusionReasons: { type: string }[] } | undefined;
  return { totalTax: r.totalTax as number, reasons: (mh?.exclusionReasons ?? []).map((x) => x.type).join(",") };
}
async function multiTotal(f: Form): Promise<number> {
  const mf = {
    taxYear: Number(f.transferDate.slice(0, 4)),
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { totalTax: number } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.totalTax;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(T)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

const RIGHT = (acq: string) =>
  [{ id: "r1", type: "redevelopment_right", memberOrigin: "successor" as const, acquisitionDate: acq, region: "capital", regionCode: GANGNAM }] as Form["presaleRights"];

describe("E-14e 구 §167의10①8호 — route", () => {
  it("RE-1 2주택(명부 도출 일시적 2주택) · §154① 미충족 → 8호 배제 768,322,500 (수정 전 1,141,772,500 · 단건 = 다건)", async () => {
    const f = form("2019-06-01", [ROW]);
    expect(await single(f)).toMatchObject({ totalTax: 768_322_500, reasons: "temporary_two_house" });
    expect(await multiTotal(f)).toBe(768_322_500);
  });

  it("RE-2 사전-2021-법령해석재산-0869 — 종전 취득 후 1년 이내 신규 · 3년 내 → 8호 배제 768,322,500 (수정 전 1,141,772,500 · 단건 = 다건)", async () => {
    const f = form("2019-06-01", [{ ...ROW, acquisitionDate: "2020-03-01" }], { residencePeriodMonths: "24" });
    expect(await single(f)).toMatchObject({ totalTax: 768_322_500, reasons: "temporary_two_house" });
    expect(await multiTotal(f)).toBe(768_322_500);
  });

  it("RE-2n 부정 짝 — 신규 취득 후 3년 경과(2018-06 신규) → 중과 1,141,772,500", async () => {
    const f = form("2016-01-01", [{ ...ROW, acquisitionDate: "2018-06-01" }], { residencePeriodMonths: "24" });
    expect(await single(f)).toMatchObject({ totalTax: 1_141_772_500, reasons: "" });
  });
});

describe("E-14f 구 §167의11①1·7호 — route", () => {
  it("RF-1 주택 1 + 조합원입주권 1(§156의2③) · §154① 미충족 → 구 1호 배제 768,322,500 (수정 전 1,141,772,500 · 단건 = 다건)", async () => {
    const f = form("2019-06-01", [], { householdHousingCount: "1", presaleRights: RIGHT("2021-01-01") });
    expect(await single(f)).toMatchObject({ totalTax: 768_322_500, reasons: "right_holding_one_house" });
    expect(await multiTotal(f)).toBe(768_322_500);
  });

  it("RF-2 주택 1 + 입주권 1 · 혼인 합가(주택 2016 · 입주권 2019 · 혼인 2020-05-01) → 7호 배제 236,365,800 (수정 전 423,115,000)", async () => {
    const f = form("2016-01-01", [], {
      householdHousingCount: "1",
      wasRegulatedAtAcquisition: false,
      marriageDate: "2020-05-01",
      presaleRights: RIGHT("2019-01-01"),
    });
    expect(await single(f)).toMatchObject({ totalTax: 236_365_800, reasons: "marriage_merge" });
  });
});
