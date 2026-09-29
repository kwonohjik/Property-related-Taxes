/**
 * anchor — 장기임대주택 「임대료등 5% 증가율」 요건의 적용 시기 (대통령령 제29523호 부칙 제6조) — E-14m
 *
 * 폼 → ④ API 변환 → ⑫ Zod → ⑭ route(단건·다건) → 엔진 `checkRentalArticle` 5% 게이트까지 본다
 * ([[feedback_leaf_anchor_skips_zod_layer]]). 계획서 `docs/00-pm/regulated-area-region-code-match.plan.md` §9 (a).
 *
 * ## 법문 (DRF 실독 2026-09-29)
 *
 * - 부칙<제29523호, 2019.2.12.> 제6조(MST 207800 부칙단위): 「제154조제1항제4호, 제155조제20항제2호 및
 *   제167조의3제1항제2호(제167조의10제1항제2호가 적용되는 경우를 포함한다)의 개정규정은 이 영 시행 이후
 *   주택 임대차계약을 체결하거나 기존 계약을 갱신하는 분부터 적용한다.」
 * - 5% 문언은 이 개정에서 가·다·마·바목에 들어왔다 — 직전 시행본(MST 204914 · 2018.10.23.)의 가·다·마·바목에는
 *   「임대보증금 또는 임대료의 연 증가율」 문언이 없다. 같은 부칙 제2조② 「양도소득세에 관한 개정규정은 이 영
 *   시행 이후 양도하는 분부터 적용한다」.
 * - 해석: 5% 비교 기준(최초 계약)은 2019.2.12. 이후 최초로 체결(갱신 포함)한 표준임대차계약
 *   (서면-2021-법규재산-3399 · 서면-2020-부동산-3300 · 조심 2022서7263).
 *
 * ## 시료 — 2주택 · 강남 양도 주택(2013-06 취득) + 가목 등록임대 1채(2015-01 등록 · 임대기간 5.5년)
 *
 * 다른 주택이 영 §167의10①2호(= §167의3①2호 가목)에 해당하면 양도 주택은 같은 항 10호(「1개의 주택만을
 * 소유」)로 중과에서 빠진다. 5% 요건만 가른다.
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
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry, RentalDeclaration } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const GANGNAM = "1168010100";

/** 가목(A) 등록임대 — 2015-01-01 등록(두 등록 모두) · 임대개시 기준시가 3억 · 임대기간 5.5년 */
const RENTAL_A: Partial<HouseEntry> = {
  isLongTermRental: true,
  isApartment: false,
  isRegisteredRental: true,
  rentalRegistrationDate: "2015-01-01",
  businessRegistrationDate: "2015-01-01",
  rentalPeriodYears: "5.5",
  rentalType: "A",
  rentalStartOfficialPrice: "300000000",
};

const row = (over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2014-06-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...RENTAL_A,
  ...over,
});

function form(transfer: string, houses: HouseEntry[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2013-06-01",
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

async function single(f: Form): Promise<{ totalTax: number; surchargeType: string | undefined }> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as { surchargeType?: string } | undefined;
  return { totalTax: r.totalTax as number, surchargeType: mh?.surchargeType };
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
    async (_types, date) => loadFallbackTransferRates(date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

/** 2020-06-01 양도 · 2주택 중과(+10%p · 장특 배제) — 5% 요건 미충족 시 */
const SURCHARGED_2020 = 932_030_000;
/** 같은 양도 · 다른 주택이 가목 장기임대 → 영 §167의10①10호로 중과 제외 */
const EXEMPT_2020 = 635_349_000;

describe("E-14m ① 5% 초과 증액 계약이 2019.2.12. 전뿐이면 요건을 보지 않는다 (단건 = 다건)", () => {
  it("R5-0 [짝] 5% 충족 선언 → 중과 제외 635,349,000 (수정 전·후 같다)", async () => {
    const f = form("2020-06-01", [row({ rentIncreaseUnder5Pct: true })]);
    expect(await single(f)).toMatchObject({ totalTax: EXEMPT_2020, surchargeType: "none" });
    expect(await multiTotal(f)).toBe(EXEMPT_2020);
  });

  it("R5-1 초과 증액 계약일 2018-06-01 → 중과 제외 635,349,000 (수정 전 932,030,000)", async () => {
    const f = form("2020-06-01", [row({ rentIncreaseUnder5Pct: false, rentIncreaseContractDate: "2018-06-01" })]);
    expect((await single(f)).totalTax).toBe(EXEMPT_2020);
    expect(await multiTotal(f)).toBe(EXEMPT_2020);
  });

  it("R5-2 ±1일 — 2019-02-11 제외 635,349,000 · 2019-02-12 [짝] 중과 932,030,000", async () => {
    const before = form("2020-06-01", [row({ rentIncreaseUnder5Pct: false, rentIncreaseContractDate: "2019-02-11" })]);
    expect((await single(before)).totalTax).toBe(EXEMPT_2020);
    expect(await multiTotal(before)).toBe(EXEMPT_2020);
    const on = form("2020-06-01", [row({ rentIncreaseUnder5Pct: false, rentIncreaseContractDate: "2019-02-12" })]);
    expect(await single(on)).toMatchObject({ totalTax: SURCHARGED_2020, surchargeType: "multi_house_2" });
    expect(await multiTotal(on)).toBe(SURCHARGED_2020);
  });

  it("R5-3 [짝] 미충족 선언 + 계약일 미입력 → 종전대로 중과 932,030,000", async () => {
    const f = form("2020-06-01", [row({ rentIncreaseUnder5Pct: false })]);
    expect((await single(f)).totalTax).toBe(SURCHARGED_2020);
    expect(await multiTotal(f)).toBe(SURCHARGED_2020);
  });
});

describe("E-14m ② 2019.2.12. 전 양도분에는 5% 문언 자체가 없었다 (부칙 제2조② · 직전 시행본 MST 204914)", () => {
  it("R5-4 2019-02-11 양도 · 미충족 선언(계약일 없음) → 중과 제외 666,765,000 (수정 전 932,030,000) · 2019-02-12 [짝] 중과 932,030,000", async () => {
    const exempt = form("2019-02-11", [row({ rentIncreaseUnder5Pct: false })]);
    expect((await single(exempt)).totalTax).toBe(666_765_000);
    expect(await multiTotal(exempt)).toBe(666_765_000);
    // 5% 충족 선언과 같은 값이다 — 요건이 없던 시행본
    expect((await single(form("2019-02-11", [row({ rentIncreaseUnder5Pct: true })]))).totalTax).toBe(666_765_000);

    const on = form("2019-02-12", [row({ rentIncreaseUnder5Pct: false })]);
    expect(await single(on)).toMatchObject({ totalTax: 932_030_000, surchargeType: "multi_house_2" });
    expect(await multiTotal(on)).toBe(932_030_000);
    expect((await single(form("2019-02-12", [row({ rentIncreaseUnder5Pct: true })]))).totalTax).toBe(666_765_000);
  });
});

describe("E-14m ③ ④ 게이트 — 계약일 칸은 ⑤와 같은 범위에서만 실린다", () => {
  const rows = (decl: Partial<HouseEntry>) => {
    const f = form("2020-06-01", [row(decl)]);
    return buildHousesPayload(f.assets[0], f.houses, 0, f.sellingHouseExclusion, f.transferDate) as Obj[];
  };

  it("R5-5 등록 2019-02-12 이후면 stale 계약일이 남아 있어도 싣지 않는다", () => {
    const r = rows({
      rentIncreaseUnder5Pct: false,
      rentIncreaseContractDate: "2018-06-01",
      rentalRegistrationDate: "2019-03-01",
    }).find((x) => x.id === "h2")!;
    expect(r.rentIncreaseContractDate).toBeUndefined();
  });

  it("R5-6 5% 충족 선언이면 싣지 않는다 · 미충족 + 등록 2019-02-11 이전이면 싣는다", () => {
    expect(
      rows({ rentIncreaseUnder5Pct: true, rentIncreaseContractDate: "2018-06-01" }).find((x) => x.id === "h2")!
        .rentIncreaseContractDate,
    ).toBeUndefined();
    expect(
      rows({ rentIncreaseUnder5Pct: false, rentIncreaseContractDate: "2018-06-01" }).find((x) => x.id === "h2")!
        .rentIncreaseContractDate,
    ).toBe("2018-06-01");
  });

  it("R5-7 양도 주택 자신의 장기임대 선언(§167의3①2호)도 같은 규약으로 싣는다", () => {
    const f = form("2020-06-01", [row({ isLongTermRental: false, rentalType: undefined })]);
    const ltr: RentalDeclaration = { ...RENTAL_A, rentIncreaseUnder5Pct: false, rentIncreaseContractDate: "2018-06-01" };
    f.sellingHouseExclusion = { ...f.sellingHouseExclusion, longTermRental: ltr };
    const s = (buildHousesPayload(f.assets[0], f.houses, 0, f.sellingHouseExclusion, f.transferDate) as Obj[]).find(
      (x) => x.id === "selling",
    )!;
    expect(s.rentIncreaseContractDate).toBe("2018-06-01");
  });
});
