/**
 * 명부 없이 §155①(일시적 2주택)·⑦(농어촌주택) 의제가 선 2주택 세대 — 입력된 사실로 행을 구성해 정밀 중과 판정
 * (사용자 결정 2026-10-04 — #1955 「알게 된 것」 · 계획서 docs/00-pm/one-house-exemption-fix.plan.md §9.8).
 *
 * 배경: 명부가 없으면 원시 플래그(조정지역 · 세대 주택 수 ≥ 2)로 중과했다 — 강남 20억 §155① 422,521,000 + #1955
 * 고지, 같은 세대를 명부에 입력하면 15호(영 §167의10①15호) 배제로 102,086,600. 의제 사실(신규 주택 취득일 ·
 * 농어촌주택 사실)은 폼에 확정 입력돼 있다 ⇒ #1947(§155⑳ `noRosterRentalResidenceHouses`)처럼 행을 구성해
 * 명부 경로와 **같은** `determineMultiHouseSurcharge`를 돌린다(`noRosterTwoHouseDeemingHouses`).
 * 모르는 사실(다른 주택의 소재지·기준시가·각 호 해당)은 불리하게 두고, 그 사실이 결론을 가를 수 있는 경우
 * (중과가 남는 경우)는 정밀 판정을 쓰지 않는다 → 종전(원시 플래그 + 고지).
 *
 * 강남 · 2015 취득 · 2026-09-18 양도 · 20억 · fallback 세율(#1955 anchor와 같은 시료).
 *
 * | 시료 | 종전 | 이후 | 명부 입력 |
 * |---|---:|---:|---:|
 * | A-1 §155① · 명부 없음(단건 = 다건) | 422,521,000 + 고지 | **102,086,600**(15호) | 102,086,600 |
 * | A-2 §155⑦ 농어촌(레거시 스칼라) · 명부 없음 | 422,521,000 + 고지 | **102,086,600**(15호) | 102,086,600 |
 * | N-1 §155① 처분기한 경과(신규 2022-01-01) | 1,141,178,500 + 고지 | 불변 | 1,141,178,500 |
 * | N-2 §155① 선언 · 세대 3채 | 1,327,903,500 + 고지 | 불변 | — |
 * | N-3 세대 3채 · 조특법 §99의4 제외로 의제 주택 수 2 | 497,046,000 + 고지 | **102,086,600**(13호 — 정책 변경, 아래) | 102,086,600 |
 * | N-4 §155① 의제는 서나 §154① 미충족(조정 2018 취득 · 거주 0) | 1,141,178,500 + 고지 | 불변(15호 불성립 → 구성 미사용) | 1,141,178,500 |
 * | N-5 일반 2주택(의제 없음) · 비조정(부산) | 582,598,500 | 불변 · 정밀 판정 없음 | — |
 *
 * N-3은 #1958에서 「3채 이상이면 열지 않는다」로 고정했다가 사용자 결정(2026-10-04 「정밀 판정으로 열어라」)으로
 * 확인된 조특법 제외 주택까지 행으로 구성해 연다 — 그 축의 양성·음성 짝은
 * `transfer.route.no-roster-155-1-special-act-exclusion-precise-surcharge.anchor.test.ts`.
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
import { noRosterSurchargeFallbackNotice } from "@/lib/tax-engine/transfer-tax-surcharge-predicate";
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

/** 명부 행 기본값 — 강남 · 일반 주택 */
const BASE_ROW: HouseEntry = {
  id: "h4",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2016-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
};

function form(opts: {
  count: number;
  houses?: HouseEntry[];
  regionCode?: string;
  residence?: string;
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
  return Object.assign(f, {
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "2,000,000,000",
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
  /** 정밀 판정의 중과 배제 사유 유형 */
  exclusionTypes: string[];
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
    exclusionTypes: ((r.multiHouseSurchargeEvaluation as { exclusionReasons?: { type: string }[] } | undefined)
      ?.exclusionReasons ?? []).map((e) => e.type),
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

const TWO_HOUSE_SURCHARGED = 1_141_178_500;
const THREE_HOUSE_SURCHARGED = 1_327_903_500;
const NOT_SURCHARGED = 582_598_500;
const EXCLUDED_15 = 102_086_600;
const hasMarker = (ws: string[]) => ws.some((w) => w.includes(MARKER));

const NEW_HOUSE: HouseEntry = {
  ...BASE_ROW,
  id: "nh",
  acquisitionDate: "2025-06-01",
  officialPrice: "800000000",
};

/** §155⑦ 1호 상속 농어촌주택 — 레거시 스칼라(명부 행이 없을 때의 입력 경로 · `deriveOneHouseFactsFromHouses` 폴백) */
const ruralLegacy = (f: Form) =>
  Object.assign(f, {
    ruralHouseSpecial: true,
    ruralHouseKind: "inherited",
    ruralHouseOutsideCapitalEupMyeon: true,
    ruralHouseDecedentResidenceYears: "10",
  });
const RURAL_ROW = {
  ...BASE_ROW,
  id: "rh",
  region: "non_capital",
  regionCode: "4783025000",
  acquisitionDate: "2020-01-01",
  officialPrice: "50000000",
  oneHouseRuralHouse: true,
  ruralHouseKind: "inherited",
  ruralOutsideCapitalEupMyeon: true,
  ruralDecedentResidenceYears: "10",
} as HouseEntry;

/** 조특법 §99의4 농어촌주택 — 비과세 주택 수에서 뺀다(의제 주택 수 3 → 2). */
const RURAL_994 = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "2016-01-01",
  ruralHouseStdPrice: "150000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};

/** §154① 미충족 — 조정대상지역 2018 취득 · 거주 0(2017.8.3. 이후 조정 취득은 거주 2년 요건) */
function unmet154(f: Form): Form {
  f.assets[0].acquisitionDate = "2018-01-01";
  return Object.assign(f, { wasRegulatedAtAcquisition: true });
}

describe("명부 없음 · §155①⑦ 2주택 의제 → 정밀 판정(15호)", () => {
  it("A-1 §155① 일시적 2주택 20억 → 102,086,600(15호) · 고지 없음 · 단건 = 다건 = 명부 경로", async () => {
    const s = await single(temporaryTwoHouse(form({ count: 2 })));
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, sentHouses: false, evaluated: true });
    expect(s.exclusionTypes).toEqual(["temporary_two_house"]);
    expect(hasMarker(s.warnings)).toBe(false);
    const m = await multi(temporaryTwoHouse(form({ count: 2 })));
    expect(m.totalTax).toBe(EXCLUDED_15);
    expect(hasMarker(m.warnings)).toBe(false);
    const roster = await single(temporaryTwoHouse(form({ count: 2, houses: [NEW_HOUSE] })));
    expect(roster).toMatchObject({ totalTax: EXCLUDED_15, sentHouses: true, evaluated: true });
  });

  it("A-2 §155⑦ 농어촌주택(레거시 스칼라) 20억 → 102,086,600(15호) · 단건 = 다건 = 명부 경로", async () => {
    const s = await single(ruralLegacy(form({ count: 2 })));
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, sentHouses: false, evaluated: true });
    expect(s.exclusionTypes).toEqual(["rural_house"]);
    expect(hasMarker(s.warnings)).toBe(false);
    const m = await multi(ruralLegacy(form({ count: 2 })));
    expect(m.totalTax).toBe(EXCLUDED_15);
    expect(hasMarker(m.warnings)).toBe(false);
    const roster = await single(form({ count: 2, houses: [RURAL_ROW] }));
    expect(roster).toMatchObject({ totalTax: EXCLUDED_15, sentHouses: true, evaluated: true });
  });
});

describe("음성 짝 — 열지 않는다(원시 플래그 + #1955 고지 · 세액 불변)", () => {
  it("N-1 §155① 처분기한 경과(신규 2022-01-01 → 3년 경과) → 의제 불성립 · 중과 1,141,178,500 + 고지", async () => {
    const late = (f: Form) => Object.assign(f, { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2022-01-01" });
    const s = await single(late(form({ count: 2 })));
    expect(s).toMatchObject({ totalTax: TWO_HOUSE_SURCHARGED, evaluated: false });
    expect(s.warnings).toContain(notice(2));
    const m = await multi(late(form({ count: 2 })));
    expect(m.totalTax).toBe(TWO_HOUSE_SURCHARGED);
    expect(m.warnings).toContain(`[p1] ${notice(2)}`);
  });

  it("N-2 §155① 선언 · 세대 3채 → 의제 불성립 · 3주택 중과 1,327,903,500 + 고지", async () => {
    const s = await single(temporaryTwoHouse(form({ count: 3 })));
    expect(s).toMatchObject({ totalTax: THREE_HOUSE_SURCHARGED, evaluated: false });
    expect(s.warnings).toContain(notice(3));
  });

  it("N-3 세대 3채 · §99의4 제외로 의제 주택 수 2 → 정책 변경(2026-10-04): 제외 주택까지 구성해 13호 102,086,600 · 고지 없음", async () => {
    const f = temporaryTwoHouse(form({ count: 3 }));
    (f.assets[0] as unknown as { reductions: unknown[] }).reductions = [RURAL_994];
    const s = await single(f);
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, evaluated: true });
    expect(hasMarker(s.warnings)).toBe(false);
  });

  it("N-4 §155① 의제는 서나 §154① 미충족 → 15호 불성립 · 구성 행 미사용(중과 1,141,178,500 + 고지 = 종전)", async () => {
    const s = await single(unmet154(temporaryTwoHouse(form({ count: 2, residence: "0" }))));
    expect(s).toMatchObject({ totalTax: TWO_HOUSE_SURCHARGED, evaluated: false });
    expect(s.warnings).toContain(notice(2));
    const roster = await single(unmet154(temporaryTwoHouse(form({ count: 2, residence: "0", houses: [NEW_HOUSE] }))));
    expect(roster).toMatchObject({ totalTax: TWO_HOUSE_SURCHARGED, evaluated: true });
  });

  it("N-5 의제 없는 2주택(비조정 부산) → 정밀 판정을 열지 않는다(582,598,500)", async () => {
    const s = await single(form({ count: 2, regionCode: BUSAN }));
    expect(s).toMatchObject({ totalTax: NOT_SURCHARGED, evaluated: false });
    expect(hasMarker(s.warnings)).toBe(false);
  });
});
