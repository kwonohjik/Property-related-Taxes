/**
 * anchor — ⑫ 소령 §167의3①3호 선언 시 **임대기간 필수** (⑧ `taxIncentiveRentalPeriodMissing`의 거울).
 *
 * ## 결함 — 선언만 오고 임대기간이 없으면 200 + 중과
 *
 * 3호는 「…감면되는 임대주택으로서 **5년 이상 임대한** 국민주택」이다(MST 290841 실독). 엔진은
 * `calcRentalPeriodYears`가 미입력을 0년으로 읽어 3호를 **조용히** 불적용한다(중과 유지). ⑧은 UI에서 막지만
 * ⑫ `houseSchema`에는 그 조건이 없어, ⑧을 거치지 않은 본문은 200으로 선언이 사라진 세액을 받았다.
 *
 * ## ⑧ ↔ ⑫ 같은 조건
 *
 * ⑧ 명부 행 `taxIncentiveRentalPeriodMissing(h)` · 양도 주택 `taxIncentiveRentalPeriodMissing(effectiveSellingTaxIncentiveRental(se))`
 * — 양도 주택은 2호 선언이 켜져 있으면 **2호 칸의 임대기간**을 쓴다(같은 사실). ④는 그 유효 사실을
 * `houses[i].rentalPeriodYears`로 싣는다 ⇒ ⑫는 행 단위 `isTaxIncentiveRental === true && !(rentalPeriodYears > 0)`
 * 하나로 두 경로를 다 덮는다. 아래 각 케이스는 **⑧ 차단 여부와 ⑫ 400 여부가 같다**는 것을 함께 본다
 * (「UI 통과 ↔ API 400」 모순 금지).
 *
 * 단건·다건(「합산 계산」)·판정 메뉴 route가 같은 `refinePropertyRequiredInputs`를 지난다.
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
import { POST as JUDGMENT } from "@/app/api/calc/one-house-exemption/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;
type SellingExclusion = NonNullable<Form["sellingHouseExclusion"]>;

const GANGNAM = "1168010100";
const MSG = "조특법 감면 임대주택(소득세법 시행령 §167의3①3호)은 임대기간(년)이 필요합니다";

const general = (id: string, over: Partial<HouseEntry> = {}): HouseEntry => ({
  id,
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2014-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});

function form(houses: HouseEntry[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "1995-03-01",
    fixedAcquisitionPrice: "100,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate: "2026-08-01",
    contractTotalPrice: "1,500,000,000",
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

type RouteOutcome = { status: number; messages: string[]; fieldKeys: string[]; json: Obj };
async function outcome(res: Response): Promise<RouteOutcome> {
  const json = (await res.json()) as Obj;
  const fe = ((json.error as Obj | undefined)?.fieldErrors ?? {}) as Record<string, string[]>;
  return { status: res.status, messages: Object.values(fe).flat(), fieldKeys: Object.keys(fe), json };
}
const single = async (f: Form) =>
  outcome(await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f))));
async function multi(f: Form) {
  const mf = {
    taxYear: Number(f.transferDate.slice(0, 4)),
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  return outcome(await post(MULTI, "http://l/api/calc/transfer/multi", body));
}
/** ⑧ — 3호 임대기간 문구가 step 1 issue로 나오는가 */
const blockedBy8 = (f: Form) => collectStep1Issues(f).some((i) => i.message.includes("조특법 감면 임대주택") && i.message.includes("임대기간"));

const sellingSe = (se: SellingExclusion): Partial<Form> => ({ sellingHouseExclusion: se });
const TIR = { isTaxIncentiveRental: true, isNationalSizeHousing: true, isApartment: true } as const;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_types, date) => loadFallbackTransferRates(date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("P-1 양도 주택 3호 — 단건 route", () => {
  it("선언 + 임대기간 없음 → ⑧ 차단 · ⑫ 400(houses.0.rentalPeriodYears)", async () => {
    const f = form([general("h2")], sellingSe({ taxIncentiveRental: { ...TIR } }));
    expect(blockedBy8(f)).toBe(true);
    const r = await single(f);
    expect(r.status).toBe(400);
    expect(r.messages).toContain(MSG);
    expect(r.fieldKeys).toContain("houses.0.rentalPeriodYears");
  });

  it("선언 + 임대기간 \"0\" → ⑧ 차단 · ⑫ 400 (0년은 「5년 이상 임대」 판정 불가)", async () => {
    const f = form([general("h2")], sellingSe({ taxIncentiveRental: { ...TIR, rentalPeriodYears: "0" } }));
    expect(blockedBy8(f)).toBe(true);
    expect((await single(f)).status).toBe(400);
  });

  it("선언 + 임대기간 6년 → ⑧ 통과 · 200 (3호 중과 배제 412,071,000 — 기존 anchor A2와 같은 값)", async () => {
    const f = form([general("h2")], sellingSe({ taxIncentiveRental: { ...TIR, rentalPeriodYears: "6" } }));
    expect(blockedBy8(f)).toBe(false);
    const r = await single(f);
    expect(r.status).toBe(200);
    expect(((r.json.data as Obj).result as Obj).totalTax).toBe(412_071_000);
  });

  it("미선언 → 영향 없음 (⑧ 통과 · 200 · 중과 926,678,500)", async () => {
    const f = form([general("h2")]);
    expect(blockedBy8(f)).toBe(false);
    const r = await single(f);
    expect(r.status).toBe(200);
    expect(((r.json.data as Obj).result as Obj).totalTax).toBe(926_678_500);
  });

  it("2호 선언이 켜져 있으면 2호 칸의 임대기간을 쓴다 — 3호 자체 칸이 비어도 200 (⑧과 같은 유효 사실)", async () => {
    const f = form(
      [general("h2")],
      sellingSe({
        longTermRental: { isLongTermRental: true, rentalPeriodYears: "6", isApartment: true },
        taxIncentiveRental: { ...TIR },
      } as SellingExclusion),
    );
    expect(blockedBy8(f)).toBe(false);
    const r = await single(f);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  });

  it("2호 선언이 켜져 있고 2호 칸도 비면 → ⑧ 차단 · ⑫ 400 (3호 자체 칸 값은 쓰이지 않는다)", async () => {
    const f = form(
      [general("h2")],
      sellingSe({
        longTermRental: { isLongTermRental: true, isApartment: true },
        taxIncentiveRental: { ...TIR, rentalPeriodYears: "6" },
      } as SellingExclusion),
    );
    expect(blockedBy8(f)).toBe(true);
    const r = await single(f);
    expect(r.status).toBe(400);
    expect(r.messages).toContain(MSG);
  });
});

describe("P-2 다른 보유 주택 3호 (명부 행) — 단건 route", () => {
  const rental3ho = (over: Partial<HouseEntry> = {}) =>
    general("h2", { isTaxIncentiveRental: true, isNationalSizeHousing: true, ...over });

  it("선언 + 임대기간 없음 → ⑧ 차단 · ⑫ 400(houses.1.rentalPeriodYears)", async () => {
    const f = form([rental3ho()]);
    expect(blockedBy8(f)).toBe(true);
    const r = await single(f);
    expect(r.status).toBe(400);
    expect(r.fieldKeys).toContain("houses.1.rentalPeriodYears");
  });

  it("선언 + 임대기간 6년 → ⑧ 통과 · 200 (10호 412,071,000)", async () => {
    const f = form([rental3ho({ rentalPeriodYears: "6" })]);
    expect(blockedBy8(f)).toBe(false);
    const r = await single(f);
    expect(r.status).toBe(200);
    expect(((r.json.data as Obj).result as Obj).totalTax).toBe(412_071_000);
  });

  it("3호 미선언 행은 임대기간이 없어도 영향 없다(2호도 미선언)", async () => {
    const f = form([general("h2", { isTaxIncentiveRental: false })]);
    expect(blockedBy8(f)).toBe(false);
    expect((await single(f)).status).toBe(200);
  });
});

describe("P-3 「합산 계산」(다건 route)도 같은 refine", () => {
  it("선언 + 임대기간 없음 → 400 · 있으면 200", async () => {
    const missing = await multi(form([general("h2")], sellingSe({ taxIncentiveRental: { ...TIR } })));
    expect(missing.status).toBe(400);
    expect(missing.messages).toContain(MSG);
    const ok = await multi(form([general("h2")], sellingSe({ taxIncentiveRental: { ...TIR, rentalPeriodYears: "6" } })));
    expect(ok.status).toBe(200);
  });
});

describe("P-4 판정 메뉴 route — 같은 스키마, 그리고 3호는 비과세 판정 입력이 아니다", () => {
  /** 판정 메뉴는 3호 칩을 숨기므로(`HousesListSection` `taxIncentiveRentalEnabled={!hideSellingHouseExclusion}`)
   *  아래 3호 행은 손으로 만든 본문이다 — 스키마가 같다는 것과 판정 무영향을 함께 고정한다. */
  const BASE = {
    propertyType: "housing",
    transferDate: "2024-06-01",
    acquisitionDate: "2019-06-01",
    transferPrice: 1_000_000_000,
    acquisitionPrice: 300_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    annualBasicDeductionUsed: 0,
    reductions: [],
  } as const;
  const row = (id: string, over: Obj = {}) => ({
    id,
    region: "non_capital",
    acquisitionDate: "2018-01-01",
    officialPrice: 300_000_000,
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  });
  const judge = async (h2: Obj) =>
    outcome(
      await post(JUDGMENT, "http://l/api/calc/one-house-exemption", {
        ...BASE,
        houses: [row("selling", { acquisitionDate: "2019-06-01" }), h2],
        sellingHouseId: "selling",
      }),
    );
  const verdict = (o: RouteOutcome) => {
    const d = o.json.data as { judgment: { isExempt: boolean }; houseCount: { total: number } };
    return { isExempt: d.judgment.isExempt, total: d.houseCount.total };
  };

  it("3호 선언 + 임대기간 없음 → 400 (단건·다건과 같은 스키마)", async () => {
    const r = await judge(row("h2", { isTaxIncentiveRental: true, isNationalSizeHousing: true }));
    expect(r.status).toBe(400);
    expect(r.messages).toContain(MSG);
  });

  it("3호 선언 유무가 판정을 바꾸지 않는다 — 소령 §167의3①3호는 중과 축이고 판정 route는 중과를 부르지 않는다", async () => {
    const plain = await judge(row("h2"));
    const declared = await judge(
      row("h2", { isTaxIncentiveRental: true, isNationalSizeHousing: true, rentalPeriodYears: 6 }),
    );
    expect(plain.status).toBe(200);
    expect(declared.status).toBe(200);
    expect(verdict(declared)).toEqual(verdict(plain));
    expect(verdict(plain)).toEqual({ isExempt: false, total: 2 });
  });
});
