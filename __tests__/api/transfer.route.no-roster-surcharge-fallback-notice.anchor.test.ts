/**
 * 명부 없이 원시 플래그로 다주택 중과를 건 경우의 「확인 필요」 고지 (사용자 결정 2026-10-04 —
 * 계획서 docs/00-pm/one-house-exemption-fix.plan.md §9.8 「명부 없음 2채 중과 고지」).
 *
 * 배경: #1947이 명부 없는 §155⑳ 거주주택 세대(사실이 입력으로 확정되는 경우)만 정밀 판정으로 돌렸다. 그 밖의
 * 명부 없는 2채 이상 세대는 여전히 `resolveSurchargeApplication`의 원시 플래그(조정지역 · 세대 주택 수 ≥ 2)로
 * 중과한다. 다른 주택이 영 §167의10①(2주택)·§167의3①(3주택 이상) 각 호 — 1호 지방 저가주택(주택 수 불산입) ·
 * 2호 장기임대주택 · 10호 · 15호(13호) 등 — 에 해당하면 결론이 바뀌지만 명부 없이는 알 수 없다.
 * 원칙(모름 → 불리 적용 + 결론을 가를 때만 「확인 필요」)대로 **세액은 그대로**, 중과가 실제로 걸렸을 때만 고지한다.
 *
 * 강남 · 양도 2026-09-18 · 2015 취득 · 20억 · fallback 세율 (#1947 anchor와 같은 시료).
 *
 * | 시료 | 세액(불변) | 고지 |
 * |---|---:|---|
 * | F-1 §155⑳ 불성립(거주 0) · 명부 없음 2채 | 1,141,178,500 | **있음**(2주택 · 단건 = 다건) |
 * | F-2 같은 세대 · 명부 입력 | 1,141,178,500 | 없음 |
 * | F-3 §155⑳ 요건 미확인(모름) · 명부 없음 2채 | 1,141,178,500 | **있음** |
 * | F-4 일반 2주택 · 명부 없음 / 3주택 | 1,141,178,500 / 1,327,903,500 | **있음**(2주택 / 3주택 이상 문언) |
 * | F-5 비조정지역(부산) | 582,598,500 | 없음(중과 미적용) |
 * | F-6 #1947 0채 met(정밀 판정) | 102,086,600 | 없음 |
 * | F-7 한시 유예(2026-05-09 양도) | 582,598,500 | 없음(중과 미적용) |
 * | F-8 전액 비과세 · 차손 | 0 | 없음(세액 0 — 결론 무관) |
 * | F-9 §155① 일시적 2주택 20억 · 명부 없음 | 422,521,000 | **있음**(명부 입력 시 15호 → 102,086,600) |
 * | F-10 재개발 신축주택 3주택 fallback (엔진) | 불변 | **있음** · 명부 입력 시 없음 |
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
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { noRosterSurchargeFallbackNotice } from "@/lib/tax-engine/transfer-tax-surcharge-predicate";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRatesWithHouseEngine, makeHouseInfo, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../tax-engine/transfer-tax/redevelopment/_helpers";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const BUSAN = "2635010500";
const MARKER = "세대 보유 주택 목록이 입력되지 않아";

/** 고지 기대값 — 엔진과 같은 leaf를 「명부 없음 · 중과 적용」 인자로 부른다(leaf가 꺼지면 undefined라 단언이 실패한다). */
const notice = (householdHousingCount: number) =>
  noRosterSurchargeFallbackNotice({
    houses: [],
    householdHousingCount,
    multiHouseSurchargeResult: undefined,
    isSurchargeApplied: true,
  });

const RENTAL_ROW: HouseEntry = {
  id: "h4",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2016-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: true,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
};

const unit = (unitId: string) => ({
  ...makeDefaultRentalUnit(),
  unitId,
  businessRegistrationDate: "2019-03-01",
  rentalRegistrationDate: "2019-03-01",
  standardPriceAtRentalStart: "250,000,000",
  rentalInputMode: "direct" as const,
  rentalMonths: "90",
  requirementsConfirmed: true,
});

function form(opts: {
  count: number;
  rental?: boolean;
  houses?: HouseEntry[];
  regionCode?: string;
  residence?: string;
  transferDate?: string;
  price?: string;
}): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  const regionCode = opts.regionCode ?? GANGNAM;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: opts.residence ?? "48",
  };
  if (opts.rental) {
    f.assets[0].rentalHousingException = {
      ...f.assets[0].rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [unit("u1")],
    };
  }
  return Object.assign(f, {
    transferDate: opts.transferDate ?? TRANSFER_DATE,
    contractTotalPrice: opts.price ?? "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(opts.count),
    isRegulatedArea: regionCode === GANGNAM,
    wasRegulatedAtAcquisition: false,
    houses: opts.houses ?? [],
  });
}

/** §155① 일시적 2주택 — 신규 주택 2025-06-01 취득(종전 주택 2015 취득 · 양도 2026-09-18) */
const temporaryTwoHouse = (f: Form) =>
  Object.assign(f, { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2025-06-01" });

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

interface Single {
  totalTax: number;
  sentHouses: boolean;
  /** 정밀 판정 echo — 없으면 원시 플래그 경로 */
  evaluated: boolean;
  warnings: string[];
}
async function single(f: Form): Promise<Single> {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  return {
    totalTax: r.totalTax as number,
    sentHouses: Array.isArray(body.houses),
    evaluated: r.multiHouseSurchargeEvaluation !== undefined,
    warnings: (r.warnings ?? []) as string[],
  };
}
async function multi(f: Form): Promise<{ totalTax: number; warnings: string[] }> {
  const mf = {
    taxYear: Number(f.transferDate.slice(0, 4)),
    annualBasicDeductionUsed: "0",
    basicDeductionAllocation: "EARLIEST_TRANSFER",
  } as MultiTransferFormData;
  const body = await bodyOf(() =>
    callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]),
  );
  const res = await post(MULTI, "http://l/api/calc/transfer/multi", body);
  const json = (await res.json()) as { data: { totalTax: number; warnings?: string[] } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return { totalTax: json.data.totalTax, warnings: json.data.warnings ?? [] };
}

let ratesDate = TRANSFER_DATE;
beforeEach(() => {
  ratesDate = TRANSFER_DATE;
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(ratesDate)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

const TWO_HOUSE_SURCHARGED = 1_141_178_500;
const THREE_HOUSE_SURCHARGED = 1_327_903_500;
const NOT_SURCHARGED = 582_598_500;
const EXCLUDED_15 = 102_086_600;
const hasMarker = (ws: string[]) => ws.some((w) => w.includes(MARKER));

describe("명부 없음 · 원시 플래그 중과 — 「확인 필요」 고지 (세액 불변)", () => {
  it("F-1 §155⑳ 불성립(거주 0) · 명부 없음 2채 → 중과 유지 1,141,178,500 + 2주택 고지 · 단건 = 다건", async () => {
    const f = form({ count: 2, rental: true, residence: "0" });
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: TWO_HOUSE_SURCHARGED, sentHouses: false, evaluated: false });
    expect(s.warnings).toContain(notice(2));
    const m = await multi(f);
    expect(m.totalTax).toBe(TWO_HOUSE_SURCHARGED);
    expect(m.warnings).toContain(`[p1] ${notice(2)}`);
  });

  it("F-2 (짝) 같은 세대 · 명부 입력 → 같은 세액 · 고지 없음", async () => {
    const s = await single(form({ count: 2, rental: true, residence: "0", houses: [RENTAL_ROW] }));
    expect(s).toMatchObject({ totalTax: TWO_HOUSE_SURCHARGED, sentHouses: true, evaluated: true });
    expect(hasMarker(s.warnings)).toBe(false);
  });

  it("F-3 §155⑳ 요건 미확인(모름) · 명부 없음 2채 → 중과 유지 + 고지", async () => {
    const f = form({ count: 2, rental: true });
    f.assets[0].rentalHousingException.rentalUnits[0].requirementsConfirmed = false;
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: TWO_HOUSE_SURCHARGED, evaluated: false });
    expect(s.warnings).toContain(notice(2));
  });

  it("F-4 일반 2주택 · 3주택(§155⑳ 없음) · 명부 없음 → 중과 유지 + 주택 수별 문언", async () => {
    const two = await single(form({ count: 2 }));
    expect(two.totalTax).toBe(TWO_HOUSE_SURCHARGED);
    expect(two.warnings).toContain(notice(2));
    expect(notice(2)).toMatch(/1세대 2주택 중과.*§167의10①은 1호.*10호.*15호/);

    const three = await single(form({ count: 3 }));
    expect(three.totalTax).toBe(THREE_HOUSE_SURCHARGED);
    expect(three.warnings).toContain(notice(3));
    expect(notice(3)).toMatch(/1세대 3주택 이상 중과.*§167의3①은 1호.*10호.*13호/);
    expect(three.warnings).not.toContain(notice(2));
  });

  it("F-5 비조정지역(부산) → 중과 미적용 · 고지 없음", async () => {
    const s = await single(form({ count: 2, regionCode: BUSAN }));
    expect(s.totalTax).toBe(NOT_SURCHARGED);
    expect(hasMarker(s.warnings)).toBe(false);
  });

  it("F-6 #1947 명부 없음 0채 met → 정밀 판정(15호 배제) 102,086,600 · 고지 없음", async () => {
    const s = await single(form({ count: 2, rental: true }));
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, evaluated: true });
    expect(hasMarker(s.warnings)).toBe(false);
  });

  it("F-7 한시 유예 중(2026-05-09 양도 · 보유 2년 이상) → 중과 미적용 · 고지 없음", async () => {
    ratesDate = "2026-05-09";
    const s = await single(form({ count: 2, transferDate: "2026-05-09" }));
    expect(s.totalTax).toBe(NOT_SURCHARGED);
    expect(hasMarker(s.warnings)).toBe(false);
  });

  it("F-8 세액 0인 경로(§155① 비과세 10억 · 차손) → 고지 없음", async () => {
    const exempt = await single(temporaryTwoHouse(form({ count: 2, price: "1,000,000,000" })));
    expect(exempt.totalTax).toBe(0);
    expect(hasMarker(exempt.warnings)).toBe(false);
    const loss = await single(form({ count: 2, price: "200,000,000" }));
    expect(loss.totalTax).toBe(0);
    expect(hasMarker(loss.warnings)).toBe(false);
  });

  it("F-9 §155① 일시적 2주택 20억 · 명부 없음 → 원시 중과 422,521,000 + 고지 (명부 입력 시 15호 → 102,086,600)", async () => {
    const s = await single(temporaryTwoHouse(form({ count: 2 })));
    expect(s).toMatchObject({ totalTax: 422_521_000, evaluated: false });
    expect(s.warnings).toContain(notice(2));
    const newHouse: HouseEntry = {
      ...RENTAL_ROW,
      id: "nh",
      isLongTermRental: false,
      acquisitionDate: "2025-06-01",
      officialPrice: "800000000",
    };
    const roster = await single(temporaryTwoHouse(form({ count: 2, houses: [newHouse] })));
    expect(roster).toMatchObject({ totalTax: EXCLUDED_15, evaluated: true });
    expect(hasMarker(roster.warnings)).toBe(false);
  });
});

describe("재개발 신축주택(엔진) — 같은 leaf", () => {
  /** 사례 44 재개발APT · 3주택 · 조정지역 · 양도 2026-06-01(redevelopment/multi-house-surcharge.anchor RS-02와 같은 시료) */
  const apt = (over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
    baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 525_000_000,
      transferDate: new Date("2026-06-01"),
      acquisitionDate: new Date("2005-04-09"),
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: true,
      isOneHousehold: false,
      householdHousingCount: 3,
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: 0,
      redevelopment: case44RedevelopmentInfo(),
      ...over,
    });
  const rates = makeMockRatesWithHouseEngine();
  const houses = Array.from({ length: 3 }, (_, i) =>
    makeHouseInfo(`h${i + 1}`, i === 0 ? { acquisitionDate: new Date("2005-04-09") } : {}),
  );

  it("F-10 fallback 중과 → 고지 있음 · 명부 입력(정밀) → 같은 세액 · 고지 없음", () => {
    const fallback = calculateTransferTax(apt(), rates);
    const precise = calculateTransferTax(apt({ sellingHouseId: "h1", houses }), rates);
    expect(fallback.calculatedTax).toBe(precise.calculatedTax);
    expect(fallback.warnings).toContain(notice(3));
    expect(hasMarker(precise.warnings ?? [])).toBe(false);
  });
});

describe("leaf 가드 — 겹친 방어는 route에서 서로를 가리므로 leaf에서 하나씩 고정한다", () => {
  const base = { houses: [], householdHousingCount: 2, multiHouseSurchargeResult: undefined, isSurchargeApplied: true };
  it("F-11 정밀 판정이 있으면 · 명부가 있으면(세율 데이터 미로드) · 중과 미적용이면 고지하지 않는다", () => {
    expect(noRosterSurchargeFallbackNotice(base)).toBeDefined();
    expect(
      noRosterSurchargeFallbackNotice({
        ...base,
        multiHouseSurchargeResult: {} as Parameters<typeof noRosterSurchargeFallbackNotice>[0]["multiHouseSurchargeResult"],
      }),
    ).toBeUndefined();
    expect(noRosterSurchargeFallbackNotice({ ...base, houses: [{}] })).toBeUndefined();
    expect(noRosterSurchargeFallbackNotice({ ...base, isSurchargeApplied: false })).toBeUndefined();
  });
});
