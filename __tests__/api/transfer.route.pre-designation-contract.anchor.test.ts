/**
 * 공고 전 매매계약 중과 배제 — route 관측 (계획서 `docs/00-pm/regulated-area-region-code-match.plan.md` §6.1).
 * 폼 → ④ `buildHousesPayload` → ⑫ `houseSchema` → ⑭ `mapHousesToEngine` → 엔진 11호. 엔진 anchor와 법령 근거:
 * `__tests__/tax-engine/transfer/surcharge-pre-designation-contract.anchor.test.ts`.
 *
 * 🔴 종전에는 이 호에 **API 경로로 도달할 수 없었다** — 폼에 양도 계약일 칸이 없었고(D-2), 본문에 주입해도
 *    ⑫가 `contractDate`를 벗겼으며, 10자리 코드는 명부(5자리)와 맞지 않았다(D-1). 엔진 leaf anchor는
 *    이 배관을 증명하지 못한다(`feedback_leaf_anchor_skips_zod_layer`) ⇒ 여기서 **폼부터** 보낸다.
 *
 * 강남 · 양도가액 20억 · 취득가액 3억 · 2013-06-01 취득 · 2주택(다른 주택 강남 2014).
 * 세율은 각 route가 부르는 날짜의 프로덕션 fallback(단건 = 양도일 · 다건 = 과세기간 말일).
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
const MAPO = "1144010100";

const other: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2014-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function form(regionCode: string, transfer: string, over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2013-06-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode,
  };
  return Object.assign(f, {
    transferDate: transfer,
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: "2",
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses: [other],
    ...over,
  });
}
const saleFacts = (saleContractDate: string, saleDepositReceived = true): Partial<Form> => ({
  sellingHouseExclusion: { saleDepositReceived, saleContractDate },
});

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

async function singleBody(body: Obj): Promise<{ totalTax: number; reasons: string }> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as { exclusionReasons: { type: string }[] } | undefined;
  return { totalTax: r.totalTax as number, reasons: (mh?.exclusionReasons ?? []).map((x) => x.type).join(",") };
}
const single = async (f: Form) => singleBody(await bodyOf(() => callTransferTaxAPI(f)));
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
    async (_types, date) => loadFallbackTransferRates(date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("공고 전 매매계약 — 폼부터 route까지 (단건 = 다건)", () => {
  it("RC-1 강남 10자리 · 2018-09-01 양도 · 양도계약 2017-07-01 · 계약금 수령 → 666,765,000 (종전 932,030,000)", async () => {
    const f = form(GANGNAM, "2018-09-01", saleFacts("2017-07-01"));
    const body = await bodyOf(() => callTransferTaxAPI(f));
    // ④ 본문에 실린다 — 양도 주택 행에만
    const houses = body.houses as Obj[];
    expect(houses[0]).toMatchObject({ id: "selling", contractDate: "2017-07-01", saleDepositReceived: true });
    expect(houses[1].contractDate).toBeUndefined();
    expect(await singleBody(body)).toMatchObject({ totalTax: 666_765_000, reasons: "pre_designation_contract" });
    expect(await multiTotal(f)).toBe(666_765_000);
  });

  it("RC-1n [짝] 같은 계약일 · 계약금 수령 ❌ → 932,030,000 (④가 계약일도 싣지 않는다)", async () => {
    const f = form(GANGNAM, "2018-09-01", saleFacts("2017-07-01", false));
    const body = await bodyOf(() => callTransferTaxAPI(f));
    expect((body.houses as Obj[])[0].contractDate).toBeUndefined();
    expect(await singleBody(body)).toMatchObject({ totalTax: 932_030_000, reasons: "" });
    expect(await multiTotal(f)).toBe(932_030_000);
  });

  it("RC-2 마포 10자리(명부 서울 \"11\") · 2019-06-01 · 계약 2017-07-01 → 651,057,000 (종전 932,030,000)", async () => {
    const f = form(MAPO, "2019-06-01", saleFacts("2017-07-01"));
    expect(await single(f)).toMatchObject({ totalTax: 651_057_000, reasons: "pre_designation_contract" });
    expect(await multiTotal(f)).toBe(651_057_000);
  });

  it("RC-2p [짝] 마포 · 계약 2017-11-11(2017년 차수 공고일 다음 날) → 932,030,000", async () => {
    const f = form(MAPO, "2019-06-01", saleFacts("2017-11-11"));
    expect(await single(f)).toMatchObject({ totalTax: 932_030_000, reasons: "" });
    expect(await multiTotal(f)).toBe(932_030_000);
  });

  it("RC-3 [두 축 분리 — D-3] 본문 양도 주택 행에 계약일 + 장기임대 아목 `hasContractDepositProof`만 → 배제 없음 932,030,000", async () => {
    const body = await bodyOf(() => callTransferTaxAPI(form(GANGNAM, "2018-09-01")));
    const houses = body.houses as Obj[];
    houses[0] = { ...houses[0], contractDate: "2017-07-01", hasContractDepositProof: true };
    expect(await singleBody(body)).toMatchObject({ totalTax: 932_030_000, reasons: "" });
  });
});

/**
 * 겸용주택(`propertyType: "mixed-use-house"`)도 같은 매퍼(`mapHousesToEngine`)로 `houses[]`를 받는다(계획서 §3.2 ·
 * §8.2-4 「코드 대조만 했다」 → 여기서 실측). 겸용 경로는 2022.1.1. 전 양도분을 받지 않으므로 12의2 가목 창 밖인
 * 2026-08-01 양도로 본다. 본문은 폼 어댑터 없이 직접 만든다 — 겸용 폼 어댑터의 `houses[]`는 위 단건과 같은
 * `buildHousesPayload`다.
 */
describe("공고 전 매매계약 — 겸용주택 route", () => {
  const h = (id: string, acq: string, extra: Obj = {}) => ({
    id, region: "capital", regionCode: GANGNAM, acquisitionDate: acq, officialPrice: 300_000_000,
    isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, ...extra,
  });
  const MIXED = {
    transferPrice: 3_000_000_000, acquisitionPrice: 700_000_000, acquisitionDate: "2014-03-15", transferDate: "2026-08-01",
    expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 2, isRegulatedArea: true,
    wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true,
    reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0, regionCode: GANGNAM,
    propertyType: "mixed-use-house",
    mixedUse: {
      isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100,
      totalLandArea: 200, landAcquisitionDate: "2014-03-15", buildingAcquisitionDate: "2014-03-15",
      transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000 },
      acquisitionStandardPrice: { housingPrice: 300_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 2_500_000 },
      residencePeriodYears: 0, zoneType: "general_residential",
    },
  };
  async function mixed(selling: Obj) {
    const res = await post(SINGLE, "http://l/api/calc/transfer", {
      ...MIXED, sellingHouseId: "selling", houses: [h("selling", "2014-03-15", selling), h("n", "2014-01-01")],
    });
    const json = (await res.json()) as { data: { mode: string; result: Obj } };
    expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
    expect(json.data.mode).toBe("mixed-use");
    const r = json.data.result as { total: { determinedTax: number }; multiHouseSurcharge?: { exclusionReasons: { type: string }[] } };
    return { tax: r.total.determinedTax, reasons: (r.multiHouseSurcharge?.exclusionReasons ?? []).map((x) => x.type).join(",") };
  }

  it("RC-M 강남 · 계약 2017-07-01 · 계약금 수령 → 409,284,688 (종전 484,365,648 — Zod가 계약일을 벗겼다) · 2017-11-11 짝 → 484,365,648", async () => {
    expect(await mixed({})).toMatchObject({ tax: 484_365_648, reasons: "" });
    expect(await mixed({ contractDate: "2017-07-01", saleDepositReceived: true })).toMatchObject({
      tax: 409_284_688,
      reasons: "pre_designation_contract",
    });
    expect(await mixed({ contractDate: "2017-11-11", saleDepositReceived: true })).toMatchObject({ tax: 484_365_648, reasons: "" });
  });
});
