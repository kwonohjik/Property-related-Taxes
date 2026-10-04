/**
 * 명부 없이 **확인된 조특법 제외만으로** 1주택이 되는 세대(의제 `special_act_house_exclusion` — §155① 아님) — 제외 주택을
 * 행으로 구성해 정밀 중과 판정(사용자 결정 2026-10-04 「정밀 판정으로 열어라」 · 계획서
 * docs/00-pm/one-house-exemption-fix.plan.md §9.8 · 선례 #1947·#1958·#1965).
 *
 * 배경: #1965는 §155①⑦ 의제가 선 세대만 열었다. 2채 중 1채가 조특법 §99의4 등(`SPECIAL_ACT_15HO_VERIFIED_ARTICLES`)으로
 * 소유주택에서 빠져 양도 주택 하나가 남은 세대는 명부 없이 422,521,000 + #1955 고지, 같은 세대를 명부에 입력하면
 * 15호(영 §167의10①15호)로 102,086,600이었다. 같은 helper(`noRosterTwoHouseDeemingHouses`)가 이 의제에서는 「다른 주택」
 * 행 없이 양도 주택 + 확인 제외 주택 행으로 구성한다 — 가드(전부 확인 조문 · 결과 `none`일 때만 · 산입 수 전 경우 검사)는
 * #1965와 같다.
 *
 * 강남 · 2015 취득 · 2026-09-18 양도 · 20억 · 거주 48개월 · fallback 세율(#1965 anchor와 같은 시료).
 *
 * | 시료 | 종전 | 이후 | 명부 입력 |
 * |---|---:|---:|---:|
 * | S-1 §99의4 감면 선언 1채 제외 · 2채(단건 = 다건) | 422,521,000 + 고지 | **102,086,600**(15호) | 102,086,600 |
 * | S-2 §98의9 감면 선언 1채 제외 · 2채 | 422,521,000 + 고지 | **102,086,600**(15호) | 102,086,600 |
 * | S-3 보유 감면주택 §99의2(폼 전역) · 2채 | 422,521,000 + 고지 | **102,086,600**(15호) | 102,086,600 |
 * | S-4 §99의4·§98의9 2채 제외 · 3채 | 497,046,000 + 고지 | **102,086,600**(13호) | 102,086,600 |
 * | N-1 목록 밖 조문(조특령 §98②·⑥ 미분양) · 2채 | 422,521,000 + 고지 | 불변 | — |
 * | N-2 §99의4(확인) + 조특령 §98(목록 밖) · 3채 | 497,046,000 + 고지 | 불변 | — |
 * | N-3 §99의4 제외해도 2채 남음(§155 의제 없음) · 3채 | 1,327,903,500 + 고지 | 불변 | — |
 * | N-4 §154① 미충족 + §99의4 · 2채 | 1,141,178,500 + 고지 | 불변 | — |
 * | N-5 2021-09-18 양도(15호 전) + §99의4 · 2채 | 597,025,000 + 고지 | 불변(받는 호 없음) | 597,025,000 |
 * | N-6 2021-09-18 양도 + §99의4·§99의2 · 3채 | 699,600,000 + 고지 | 불변(1호 불산입이면 2채 중과) | 219,087,000(산입) / 597,025,000(1호 불산입) |
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
  /** 정밀 판정의 중과 배제 사유 문구(받은 호) */
  exclusionDetail: string;
  /** 정밀 판정의 중과 주택 수 — 구성 행 수가 명부 경로와 같은가 */
  effectiveHouseCount?: number;
  warnings: string[];
}
async function single(f: Form): Promise<Single> {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await post(SINGLE, "http://l/api/calc/transfer", body);
  const json = (await res.json()) as { data: { result: Obj } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  const r = json.data.result;
  const mh = r.multiHouseSurchargeEvaluation as
    | { effectiveHouseCount?: number; exclusionReasons?: { type: string; detail?: string }[] }
    | undefined;
  return {
    totalTax: r.totalTax as number,
    sentHouses: Array.isArray(body.houses),
    evaluated: mh !== undefined,
    exclusionTypes: (mh?.exclusionReasons ?? []).map((e) => e.type),
    exclusionDetail: (mh?.exclusionReasons ?? []).map((e) => e.detail ?? "").join(" | "),
    effectiveHouseCount: mh?.effectiveHouseCount,
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

/** 의제 배제(15호 — 2채 구성 · 13호 — 3채 구성)와 같은 세액 */
const EXCLUDED_15 = 102_086_600;
const hasMarker = (ws: string[]) => ws.some((w) => w.includes(MARKER));


/** §154① 미충족 — 조정대상지역 2018 취득 · 거주 0(2017.8.3. 이후 조정 취득은 거주 2년 요건) */
function unmet154(f: Form): Form {
  f.assets[0].acquisitionDate = "2018-01-01";
  return Object.assign(f, { wasRegulatedAtAcquisition: true });
}


/** 조특법 §99의4 농어촌주택 — 2016-01-01 취득 · 취득 당시 1.5억(비과세 주택 수에서 뺀다 — 의제 주택 수 3 → 2) */
const RURAL_994_DECL = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "2016-01-01",
  ruralHouseStdPrice: "150000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};
/** 조특법 §98의9 준공후미분양 — 수도권 밖 · 2024-06-01 취득 · 5억 · 84㎡ */
const UNSOLD_989_DECL = {
  type: "unsold_98_9",
  unsoldHouseAcquisitionDate: "2024-06-01",
  unsoldHouseAcquisitionPrice: "500,000,000",
  unsoldHouseExclusiveArea: "84",
  isNonCapitalRegion: true,
  wasOneHouseholdAtAcquisition: true,
  meetsSellerAndContractRequirement: true,
};
/** 보유 감면주택(폼 전역 · 명부 행 없음) */
const special = (article: string, houseAcquisitionDate: string) => ({
  article,
  houseAcquisitionDate,
  houseContractDate: houseAcquisitionDate,
  isNationalHousing: false,
  requirementsConfirmed: true,
});

/** 감면 선언(명부 없음 — 양도 자산의 감면 목록) */
function withReductions(f: Form, reductions: unknown[]): Form {
  (f.assets[0] as unknown as { reductions: unknown[] }).reductions = reductions;
  return f;
}
const withSpecials = (f: Form, items: unknown[]) => Object.assign(f, { specialHouseExclusions: items });

/** 명부 행 — 음성(수도권 밖) · 행 ⑥ 감면 선언(취득일은 행에서) */
const EUMSEONG = "4377037000";
const RURAL_994_ROW = (officialPrice = "400000000", id = "r994"): HouseEntry => ({
  ...BASE_ROW,
  id,
  region: "non_capital",
  regionCode: EUMSEONG,
  acquisitionDate: "2016-01-01",
  officialPrice,
  countExclusion: { kind: "reduction", reduction: { ...RURAL_994_DECL, ruralHouseAcquisitionDate: "" } as never },
});
const UNSOLD_989_ROW: HouseEntry = {
  ...BASE_ROW,
  id: "u989",
  region: "non_capital",
  regionCode: EUMSEONG,
  acquisitionDate: "2024-06-01",
  officialPrice: "400000000",
  acquisitionPrice: "500000000",
  exclusiveArea: "84",
  countExclusion: { kind: "reduction", reduction: { ...UNSOLD_989_DECL, unsoldHouseAcquisitionDate: "" } as never },
};

/** 보유 감면주택 명부 행(행 ⑥ 「보유 감면주택」) — 강남 밖 · 2013 취득 */
const SPECIAL_992_ROW: HouseEntry = {
  ...BASE_ROW,
  id: "s992",
  region: "non_capital",
  regionCode: EUMSEONG,
  acquisitionDate: "2013-06-01",
  officialPrice: "400000000",
  countExclusion: { kind: "special", special: special("unsold_99_2", "2013-06-01") as never },
};

/** 영 §167의10①15호 — 2채(양도 주택 + 확인 제외 주택) 구성 */
const CLAUSE_15 = "§167의10①15호";
/** 영 §167의3①13호 — 3채 이상 구성 */
const CLAUSE_13 = "§167의3①13호";

const S1 = () => withReductions(form({ count: 2 }), [RURAL_994_DECL]);

describe("명부 없음 · 확인된 조특법 제외만으로 1주택(의제 special_act_house_exclusion) → 제외 주택까지 구성해 정밀 판정", () => {
  it("S-1 §99의4 1채 제외 · 2채 → 102,086,600(15호) · 고지 없음 · 단건 = 다건 = 명부 경로", async () => {
    const s = await single(S1());
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, sentHouses: false, evaluated: true, effectiveHouseCount: 2 });
    expect(s.exclusionTypes).toEqual(["special_act_house_exclusion"]);
    expect(s.exclusionDetail).toContain(CLAUSE_15);
    expect(hasMarker(s.warnings)).toBe(false);
    const m = await multi(S1());
    expect(m.totalTax).toBe(EXCLUDED_15);
    expect(hasMarker(m.warnings)).toBe(false);
    const roster = await single(form({ count: 2, houses: [RURAL_994_ROW()] }));
    expect(roster).toMatchObject({ totalTax: EXCLUDED_15, sentHouses: true, evaluated: true, effectiveHouseCount: 2 });
    expect(roster.exclusionDetail).toBe(s.exclusionDetail);
  });

  it("S-2 §98의9 1채 제외 · 2채 → 102,086,600(15호) · 단건 = 다건 = 명부 경로", async () => {
    const f = () => withReductions(form({ count: 2 }), [UNSOLD_989_DECL]);
    const s = await single(f());
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, evaluated: true, effectiveHouseCount: 2 });
    expect(s.exclusionTypes).toEqual(["special_act_house_exclusion"]);
    expect(s.exclusionDetail).toContain(CLAUSE_15);
    expect(hasMarker(s.warnings)).toBe(false);
    expect((await multi(f())).totalTax).toBe(EXCLUDED_15);
    const roster = await single(form({ count: 2, houses: [UNSOLD_989_ROW] }));
    expect(roster).toMatchObject({ totalTax: EXCLUDED_15, sentHouses: true, evaluated: true });
    expect(roster.exclusionDetail).toBe(s.exclusionDetail);
  });

  it("S-3 보유 감면주택 §99의2(폼 전역 · 확인 조문) · 2채 → 102,086,600(15호) · 단건 = 다건 = 명부 경로", async () => {
    const f = () => withSpecials(form({ count: 2 }), [special("unsold_99_2", "2013-06-01")]);
    const s = await single(f());
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, evaluated: true, effectiveHouseCount: 2 });
    expect(s.exclusionTypes).toEqual(["special_act_house_exclusion"]);
    expect(s.exclusionDetail).toContain(CLAUSE_15);
    expect(hasMarker(s.warnings)).toBe(false);
    expect((await multi(f())).totalTax).toBe(EXCLUDED_15);
    const roster = await single(form({ count: 2, houses: [SPECIAL_992_ROW] }));
    expect(roster).toMatchObject({ totalTax: EXCLUDED_15, sentHouses: true, evaluated: true });
    expect(roster.exclusionDetail).toBe(s.exclusionDetail);
  });

  it("S-4 §99의4·§98의9 2채 제외 · 3채 → 102,086,600(13호) · 명부 경로와 같다", async () => {
    const s = await single(withReductions(form({ count: 3 }), [RURAL_994_DECL, UNSOLD_989_DECL]));
    expect(s).toMatchObject({ totalTax: EXCLUDED_15, evaluated: true, effectiveHouseCount: 3 });
    expect(s.exclusionTypes).toEqual(["special_act_house_exclusion"]);
    expect(s.exclusionDetail).toContain(CLAUSE_13);
    expect(hasMarker(s.warnings)).toBe(false);
    const roster = await single(form({ count: 3, houses: [RURAL_994_ROW(), UNSOLD_989_ROW] }));
    expect(roster).toMatchObject({ totalTax: EXCLUDED_15, sentHouses: true, evaluated: true });
    expect(roster.exclusionDetail).toBe(s.exclusionDetail);
  });
});

describe("음성 짝 — 열지 않는다(원시 플래그 + #1955 고지 · 세액 불변)", () => {
  it("N-1 목록 밖 조문(조특령 §98②·⑥ 미분양) 1채 제외 · 2채 → 종전 + 고지", async () => {
    const s = await single(withSpecials(form({ count: 2 }), [special("unsold_98", "1997-06-01")]));
    expect(s).toMatchObject({ totalTax: 422_521_000, evaluated: false });
    expect(s.warnings).toContain(notice(2));
  });

  it("N-2 §99의4(확인) + 조특령 §98(목록 밖) · 3채 → 종전 + 고지", async () => {
    const s = await single(withSpecials(withReductions(form({ count: 3 }), [RURAL_994_DECL]), [special("unsold_98", "1997-06-01")]));
    expect(s).toMatchObject({ totalTax: 497_046_000, evaluated: false });
    expect(s.warnings).toContain(notice(3));
  });

  it("N-3 §99의4 1채 제외해도 2채 남음(§155 의제 없음) · 3채 → 종전 + 고지", async () => {
    const s = await single(withReductions(form({ count: 3 }), [RURAL_994_DECL]));
    expect(s).toMatchObject({ totalTax: 1_327_903_500, evaluated: false });
    expect(s.warnings).toContain(notice(3));
  });

  it("N-4 §154① 미충족(조정 2018 취득 · 거주 0) + §99의4 · 2채 → 15호 불성립 · 종전 + 고지", async () => {
    const s = await single(withReductions(unmet154(form({ count: 2, residence: "0" })), [RURAL_994_DECL]));
    expect(s).toMatchObject({ totalTax: 1_141_178_500, evaluated: false });
    expect(s.warnings).toContain(notice(2));
  });

  describe("15호 시행(2023.2.28.) 전 양도분 — 2021-09-18", () => {
    const DATE = "2021-09-18";
    beforeEach(() => {
      vi.mocked(preloadTaxRates).mockImplementation(
        async () => loadFallbackTransferRates(new Date(DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
      );
    });
    const pre = (count: number, houses?: HouseEntry[]) =>
      Object.assign(form({ count, houses }), { transferDate: DATE });

    it("N-5 §99의4 · 2채 → 받는 호 없음(조특법 감면주택을 인용하는 2주택 호는 15호 전에 없었다) · 종전 + 고지", async () => {
      const s = await single(withReductions(pre(2), [RURAL_994_DECL]));
      expect(s).toMatchObject({ totalTax: 597_025_000, evaluated: false });
      expect(s.warnings).toContain(notice(2));
      expect((await single(pre(2, [RURAL_994_ROW()]))).totalTax).toBe(597_025_000);
    });

    it("N-6 §99의4 + 보유 감면주택 §99의2 · 3채 → 제외 주택의 1호 불산입 여부가 결론을 가른다 · 종전 + 고지", async () => {
      const s = await single(withSpecials(withReductions(pre(3), [RURAL_994_DECL]), [special("unsold_99_2", "2013-06-01")]));
      expect(s).toMatchObject({ totalTax: 699_600_000, evaluated: false });
      expect(s.warnings).toContain(notice(3));
      // 같은 세대를 명부에 입력 — 제외 주택이 산입(양도 당시 4억)이면 13호 배제, 1호 불산입(1억)이면 2채 중과(15호 전).
      expect((await single(pre(3, [RURAL_994_ROW("400000000"), SPECIAL_992_ROW]))).totalTax).toBe(219_087_000);
      expect((await single(pre(3, [RURAL_994_ROW("100000000"), SPECIAL_992_ROW]))).totalTax).toBe(597_025_000);
    });
  });
});
