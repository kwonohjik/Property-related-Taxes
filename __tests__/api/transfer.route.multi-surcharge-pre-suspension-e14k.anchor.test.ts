/**
 * E-14k route 관측 — 다건 route에서 2022.5.10. 전 양도분의 다주택 중과가 빠지던 결함.
 *
 * ## 원인
 *
 * 다건 route는 세율을 **과세기간 말일**로 한 번 읽는다(`app/api/calc/transfer/multi/route.ts` `rateDate`).
 * 2022년 말일에는 `surcharge:_default`의 2022-05-10 행(`surcharge_suspended: true` · `suspended_until`
 * 2026-05-09)이 골라진다. 그런데 유예 판정 두 곳이 **상한만** 봤다.
 * - `isSurchargeSuspended`(tax-utils) — `referenceDate <= suspended_until`
 * - `checkGracePeriodExemption` 가목 게이트 — `transferDate <= 2026-05-09`
 * 그래서 2022.1.1.~5.9. 양도분이 다건에서만 유예됐다. 단건은 양도일로 행을 골라(2022-05-10 전 → 1990 행 ·
 * 유예 정보 없음) 중과가 붙었다. 하한은 seed `effective_date`로만 표현돼 있었다 — 계획서 §2 원칙
 * 「seed(`tax_rates.effective_date`)로 연혁 표현 금지(다건 route가 과세기간 말일로 행을 고름)」 위반.
 *
 * ## 법령
 *
 * 대통령령 제32654호(2022.5.31.) 부칙 제4조: 「제167조의3제1항제12호의2, 제167조의4제3항제6호의2,
 * 제167조의10제1항제12호의2 및 제167조의11제1항제12호의 개정규정은 2022년 5월 10일 이후 주택을 양도하는
 * 경우부터 적용한다.」 ⇒ 그 전 양도분에는 12의2(한시 배제)가 없다. 「소득세법」 §104⑤2호는 자산별
 * 산출세액을 「제1항부터 제4항까지 및 제7항」에 따라 계산하므로 다건 합산에서도 §104⑦ 중과가 그대로 들어간다.
 *
 * 세율은 프로덕션 fallback(각 route가 고른 날짜 그대로) · 강남 양도 주택 2015 취득 · 20억.
 *
 * | 시료 | 수정 전 단건 / 다건 | 수정 후 (단건 = 다건) |
 * |---|---:|---:|
 * | K-1 3주택 명부 · 2022.3.15. | 1,328,497,500 / 650,512,500 | 1,328,497,500 |
 * | K-2 2주택 명부 · 2022.3.15. | 1,141,772,500 / 650,512,500 | 1,141,772,500 |
 * | K-3 명부 없음 · 주택 수 3 · 2022.1.3. (원시 fallback 경로) | 1,328,497,500 / 650,512,500 | 1,328,497,500 |
 * | K-4 2주택 + 분양권 · 2022.5.9. (하한 전날) | 1,328,497,500 / 650,512,500 | 1,328,497,500 |
 * | K-5 3주택 + 한시 유예 계약 입력(gracePeriod) · 2022.3.15. | 1,328,497,500 / 650,512,500 | 1,328,497,500 |
 * | P-1 3주택 · 2022.5.10. (하한 당일 — 유예) | 650,512,500 / 650,512,500 | 불변 |
 * | P-2 3주택 · 2022.3.15. · 보유 1년 | 1,328,497,500 / 1,328,497,500 | 불변 |
 * | P-3 3주택 · 2021.8.1. | 1,328,497,500 / 1,328,497,500 | 불변 |
 * | P-4 3주택 · 2026.5.9. (상한 당일 — 유예) | 582,598,500 / 582,598,500 | 불변 |
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
import type { HouseEntry, PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const GANGNAM = "1168010100";
const ROW: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2016-06-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};
const OLD: HouseEntry = { ...ROW, id: "h6", acquisitionDate: "2012-01-01" };
const PRESALE: PresaleRightEntry = {
  id: "r1",
  type: "presale_right",
  acquisitionDate: "2021-03-01",
  region: "capital",
  regionCode: GANGNAM,
  rightValue: "500000000",
};

function form(transferDate: string, houses: HouseEntry[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate,
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

async function single(f: Form): Promise<{ totalTax: number; surchargeType: unknown; suspended: unknown }> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  return { totalTax: r.totalTax as number, surchargeType: r.surchargeType, suspended: r.isSurchargeSuspended };
}
async function multi(f: Form): Promise<{ totalTax: number; rateGroup: unknown }> {
  const mf = {
    taxYear: Number(f.transferDate.slice(0, 4)),
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { totalTax: number; properties: Obj[] } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return { totalTax: json.data.totalTax, rateGroup: json.data.properties[0]?.rateGroup };
}

/**
 * 세율 로드는 route가 넘긴 날짜 그대로 — DB `preload_tax_rates(date)`와 같은 의미론.
 * (Supabase 환경변수가 없으면 route가 `loadFallbackTransferRates(date)`를 직접 부른다 — 결과는 같다.)
 */
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_types, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

const THREE = 1_328_497_500;
const TWO = 1_141_772_500;
const SUSPENDED_2022 = 650_512_500;

describe("E-14k 다건 route — 2022.5.10. 전 양도분은 12의2 한시 배제가 없다 (제32654호 부칙 제4조)", () => {
  it("K-1 3주택 명부 · 2022.3.15. → 단건 = 다건 = 1,328,497,500 (수정 전 다건 650,512,500)", async () => {
    const f = form("2022-03-15", [OLD, ROW]);
    expect(await single(f)).toMatchObject({ totalTax: THREE, surchargeType: "multi_house_3plus", suspended: false });
    expect(await multi(f)).toEqual({ totalTax: THREE, rateGroup: "multi_house_surcharge" });
  });

  it("K-2 2주택 명부 · 2022.3.15. → 단건 = 다건 = 1,141,772,500 (수정 전 다건 650,512,500)", async () => {
    const f = form("2022-03-15", [OLD]);
    expect(await single(f)).toMatchObject({ totalTax: TWO, surchargeType: "multi_house_2" });
    expect(await multi(f)).toEqual({ totalTax: TWO, rateGroup: "multi_house_surcharge" });
  });

  it("K-3 명부 없음 · 주택 수 3 · 2022.1.3. (원시 fallback 경로) → 단건 = 다건 (수정 전 다건 650,512,500)", async () => {
    const f = form("2022-01-03", [], { householdHousingCount: "3" });
    expect(await single(f)).toMatchObject({ totalTax: THREE, surchargeType: "multi_house_3plus" });
    expect((await multi(f)).totalTax).toBe(THREE);
  });

  it("K-4 2주택 + 분양권 · 2022.5.9.(하한 전날) → 단건 = 다건 (수정 전 다건 650,512,500)", async () => {
    const f = form("2022-05-09", [OLD], { presaleRights: [PRESALE] });
    expect(await single(f)).toMatchObject({ totalTax: THREE, surchargeType: "multi_house_3plus" });
    expect((await multi(f)).totalTax).toBe(THREE);
  });

  it("K-5 3주택 + 한시 유예 계약 입력(gracePeriod) · 2022.3.15. → 가목 게이트도 하한을 본다", async () => {
    const f = form("2022-03-15", [OLD, ROW], {
      gracePeriod: { contractDate: "2022-03-15", isLandPermitTarget: false, depositReceiptConfirmed: true },
    });
    expect(await single(f)).toMatchObject({ totalTax: THREE, suspended: false });
    expect((await multi(f)).totalTax).toBe(THREE);
  });
});

describe("E-14k 긍정 짝 — 이미 같던 세대는 그대로", () => {
  it("P-1 3주택 · 2022.5.10.(하한 당일) → 양쪽 유예 650,512,500", async () => {
    const f = form("2022-05-10", [OLD, ROW]);
    expect(await single(f)).toMatchObject({ totalTax: SUSPENDED_2022, suspended: true });
    expect(await multi(f)).toEqual({ totalTax: SUSPENDED_2022, rateGroup: "progressive" });
  });

  it("P-2 3주택 · 2022.3.15. · 보유 1년(12의2 보유 2년 미충족) → 양쪽 중과 1,328,497,500", async () => {
    const f = form("2022-03-15", [OLD, ROW]);
    f.assets[0].acquisitionDate = "2021-03-15";
    expect((await single(f)).totalTax).toBe(THREE);
    expect((await multi(f)).totalTax).toBe(THREE);
  });

  it("P-3 3주택 · 2021.8.1. → 양쪽 중과 1,328,497,500", async () => {
    const f = form("2021-08-01", [OLD, ROW]);
    expect((await single(f)).totalTax).toBe(THREE);
    expect((await multi(f)).totalTax).toBe(THREE);
  });

  it("P-4 3주택 · 2026.5.9.(상한 당일) → 양쪽 유예 582,598,500", async () => {
    const f = form("2026-05-09", [OLD, ROW]);
    expect(await single(f)).toMatchObject({ totalTax: 582_598_500, suspended: true });
    expect((await multi(f)).totalTax).toBe(582_598_500);
  });
});
