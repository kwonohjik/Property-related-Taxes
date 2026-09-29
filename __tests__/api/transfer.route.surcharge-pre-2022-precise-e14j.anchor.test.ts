/**
 * E-14j route 관측 — 폼 → ④ API 변환 → ⑫ Zod → ⑭ route(단건·다건) → 엔진 STEP 0.5(2018.4.1.~2021.12.31. 양도분).
 * 엔진 anchor와 법령 근거: `__tests__/tax-engine/transfer/surcharge-pre-2022-precise-e14j.anchor.test.ts`.
 *
 * 🔑 새 사용자 입력은 없다 — 기존 입력(명부·권리)이 그 기간에도 정밀 판정에 도달하는지 본다(`feedback_leaf_anchor_skips_zod_layer`).
 * 세율은 **각 route가 부르는 날짜의** 프로덕션 fallback(단건 = 양도일 · 다건 = 자산별 양도일 + 과세기간 말일 — E-14n)이다.
 * 강남 · 양도가액 20억 · 취득가액 3억.
 *
 * | 시료 | 수정 전 | 수정 후 | 근거 |
 * |---|---:|---:|---|
 * | 2주택 · 신규 2018-06 · 2019-06-01 양도 | 494,450,000 | 288,202,200 | 구 영 §167의10①8호 |
 * | 다른 주택이 지방 기준시가 1억 · 2020-06-01 | 932,030,000 | 635,349,000 | 영 §167의10① 본문 괄호(1호 불산입) |
 * | 보유 10년 이상 · 2020-03-02 | 932,030,000 | 572,517,000 | 영 §167의10①12호(2020.2.11. 신설) |
 * | 주택 1 + 조합원입주권 1 · 2020-09-01 | 698,181,000 | 932,030,000 | 법 §104⑦2호 |
 * | 2018-03-31 양도(§104⑦ 시행 전) | 391,875,000 | 391,875,000 | 법률 제15225호 부칙 제1조1호 |
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

const row = (acq: string, over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: acq,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});

function form(acq: string, transfer: string, houses: HouseEntry[], over: Partial<Form> = {}): Form {
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
    transferDate: transfer,
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
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
  // route가 넘기는 날짜 그대로 — 단건은 양도일, 다건은 자산별 양도일 + 과세기간 말일(E-14n).
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_types, date) => loadFallbackTransferRates(date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("E-14j — 2022.1.1. 전 양도분 route (단건 = 다건)", () => {
  it("RJ-1 구 §167의10①8호 · 2019-06-01 → 288,202,200 (수정 전 494,450,000)", async () => {
    const f = form("2016-06-01", "2019-06-01", [row("2018-06-01")]);
    expect(await single(f)).toMatchObject({ totalTax: 288_202_200, reasons: "temporary_two_house" });
    expect(await multiTotal(f)).toBe(288_202_200);
  });

  it("RJ-2 다른 주택이 지방(청주) 기준시가 1억 → 주택 수 불산입 · 2020-06-01 → 635,349,000 (수정 전 932,030,000)", async () => {
    const f = form("2013-06-01", "2020-06-01", [
      row("2014-01-01", { region: "non_capital", regionCode: "4311110100", officialPrice: "100000000" }),
    ]);
    expect((await single(f)).totalTax).toBe(635_349_000);
    expect(await multiTotal(f)).toBe(635_349_000);
  });

  it("RJ-3 보유 10년 이상 · 2020-03-02 → 영 §167의10①12호 572,517,000 (수정 전 932,030,000)", async () => {
    const f = form("2008-12-01", "2020-03-02", [row("2014-01-01")]);
    expect(await single(f)).toMatchObject({ totalTax: 572_517_000, reasons: "long_holding_10y_until_2020_06_30" });
    expect(await multiTotal(f)).toBe(572_517_000);
  });

  it("RJ-4 주택 1 + 조합원입주권 1(§156의2③ 1년 요건 미충족) · 2020-09-01 → 법 §104⑦2호 중과 932,030,000 (수정 전 698,181,000)", async () => {
    const f = form("2017-09-01", "2020-09-01", [], {
      householdHousingCount: "1",
      wasRegulatedAtAcquisition: true,
      presaleRights: [
        { id: "r1", type: "redevelopment_right", acquisitionDate: "2017-10-01", region: "capital", regionCode: GANGNAM },
      ] as Form["presaleRights"],
    });
    expect(await single(f)).toMatchObject({ totalTax: 932_030_000, reasons: "" });
    expect(await multiTotal(f)).toBe(932_030_000);
  });

  it("RJ-5 2018-03-31 양도(§104⑦ 시행 전) → 391,875,000 불변 · 2018-04-01 → 구 8호 391,875,000 (수정 전 494,450,000)", async () => {
    const before = form("2015-06-01", "2018-03-31", [row("2017-06-01")]);
    expect((await single(before)).totalTax).toBe(391_875_000);
    // E-14n 전 다건은 과세기간 말일(2018-12-31)로 세율을 읽어 2018-04-01 행이 실렸다 — §104⑦ 전 양도분은 세율 층이 막았다.
    // (이 시료는 보유 3년 미만이라 장특 축이 보이지 않는다. 보유 3년 이상은 `transfer.route.multi-rate-date-e14n` H-1~H-3.)
    expect(await multiTotal(before)).toBe(391_875_000);
    const f = form("2015-06-01", "2018-04-01", [row("2017-06-01")]);
    expect(await single(f)).toMatchObject({ totalTax: 391_875_000, reasons: "temporary_two_house" });
    expect(await multiTotal(f)).toBe(391_875_000);
  });
});
