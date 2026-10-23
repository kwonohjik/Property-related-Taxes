/**
 * anchor(⑬→⑫→⑭→엔진) — 명부 없는 중과 판정 구성의 양도 주택 행 기준시가(계획서 `calc-selling-house-std-price-value-region.plan.md`
 * Q-4 a · V-1 · SP-6).
 *
 * 명부가 없어도 엔진은 서면 사실로 행을 구성해 정밀 판정한다(`noRosterSellingHouse`). 그 양도 주택 행은 주 본문
 * `standardPriceAtTransfer`를 읽었는데 실가 모드에서는 ④가 그 값을 싣지 않아 늘 0이었다 — 칸에 값을 넣어도 무시됐다.
 * ⇒ 전용 키 `sellingHouseStdPriceAtTransfer`(⑬ 단건·다건 · ⑫ 공용 shape · ⑭ 단건 `engine-input.ts`·다건 route).
 *
 * 시료(V-1 실측): 전주 완산구(가액기준 · 2021-06-01 조정) 양도 · 명부 없음(다른 보유 주택 없음 확인) · §155⑳ 신청 ·
 * 거주 0개월 → 불성립 → 임대 카드 1호(임대개시 기준시가 9억 — 2호 장기임대 아님)를 세대 주택 수에 되돌린다 → 2주택.
 *
 * | # | 칸 | 본문 키 | 수정 전 | 수정 후 |
 * |---|---|---|---:|---:|
 * | N-1 | 4억 | 400,000,000 | 667,342,500(값 무시 · 0 → 1호) | **1,141,772,500**(2주택 중과) |
 * | N-2 | 2억 | 200,000,000 | 667,342,500 | 667,342,500(1호 — 값으로 판정) |
 * | N-3 | 비움(⑧ 우회 — 옛 이력) | 없음 | 667,342,500 | **1,141,772,500** + 판정 불가 경고(backstop) |
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
const TD = "2021-06-01";
const JEONJU = "4511110100";
const SURCHARGED = 1_141_772_500;
const LOW_PRICE = 667_342_500;

function form(std: string): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: JEONJU,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "0",
    standardPriceAtTransfer: std,
  };
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException,
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        ...makeDefaultRentalUnit(),
        unitId: "u1",
        businessRegistrationDate: "2019-03-01",
        rentalRegistrationDate: "2019-03-01",
        standardPriceAtRentalStart: "900,000,000",
        rentalInputMode: "direct",
        rentalMonths: "90",
        requirementsConfirmed: true,
      },
    ],
  };
  return Object.assign(f, {
    transferDate: TD,
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses: [],
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
  handler(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

async function single(f: Form) {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  // 판정 불가 경고는 중과 상세(`multiHouseSurchargeDetail.warnings` — 결과 카드 `MultiHouseSurchargeDetailCard`가 그린다)에 실린다
  const detail = json.data.result.multiHouseSurchargeDetail as { warnings?: string[] } | undefined;
  return { body, totalTax: json.data.result.totalTax as number, surchargeWarnings: detail?.warnings ?? [] };
}
async function multi(f: Form) {
  const mf = { taxYear: 2021, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { totalTax: number } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return { body, totalTax: json.data.totalTax };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("SP-6 명부 없는 구성 — 양도 주택 기준시가 전용 키", () => {
  it("[N-1] 칸 4억 → 본문 키 400,000,000 · 2주택 중과 · 단건 = 다건", async () => {
    const s = await single(form("400000000"));
    expect(s.body.sellingHouseStdPriceAtTransfer).toBe(400_000_000);
    expect(s.body.houses).toBeUndefined(); // 명부 경로가 아니다
    expect(s.totalTax).toBe(SURCHARGED);
    const m = await multi(form("400000000"));
    expect((m.body.properties as Obj[])[0].sellingHouseStdPriceAtTransfer).toBe(400_000_000);
    expect(m.totalTax).toBe(SURCHARGED);
  });
  // 미입력도 backstop으로 산입되므로 4억(N-1)으로는 「값이 도착했는가」를 가르지 못한다 — 1호가 서는 2억이 ⑫⑬⑭ 각 층의 짝이다.
  it("[N-2] 칸 2억 → 1호로 중과 없음(값으로 판정한다) · 단건 = 다건", async () => {
    expect((await single(form("200000000"))).totalTax).toBe(LOW_PRICE);
    expect((await multi(form("200000000"))).totalTax).toBe(LOW_PRICE);
  });
  it("[N-3] 비움(옛 이력) → 키 없음 · backstop: 산입 → 2주택 중과 + 판정 불가 경고", async () => {
    const s = await single(form(""));
    expect("sellingHouseStdPriceAtTransfer" in s.body).toBe(false);
    expect(s.totalTax).toBe(SURCHARGED);
    expect(s.surchargeWarnings.join("\n")).toMatch(/양도 주택의 양도 당시 기준시가가 입력되지 않아 지방 저가주택/);
  });
});
