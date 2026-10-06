/**
 * E-14 — 영 §167의10①15호 ① 요소(「제155조 … 에 따라 1세대가 국내에 1개의 주택을 소유하고 있는 것으로 보거나
 * 1세대 1주택으로 보아 제154조제1항이 적용되는 주택」)를 **비과세와 같은 세대 주택 수**로 판정한다.
 * 계획서: docs/00-pm/one-house-exemption-fix.plan.md §9.3 E-14 (P0 레인 E-10 측정 — PR #1814 본문).
 *
 * 결함: 중과 쪽 `resolveDeemedOneHouseBy155`의 §155① 분기가 세대 주택 수를 보지 않았다. 명부 도출
 *   (`resolveTemporaryTwoHouse`)이 중과 주택 수에서만 빠지는 주택(영 §167의3①1호 지방 저가 · 12호 소형신축·
 *   준공후미분양)을 「신규 주택」으로 고르면, §155 기준 3주택 세대에 15호가 성립해 2주택 중과가 빠졌다
 *   — **주택을 하나 더 가졌더니 세액이 157,850,000 줄었다**.
 *
 * 법령·해석 (2026-09-28 실독):
 * - 소득세법 시행령 §155①(MST 286211) 「국내에 1주택을 소유한 1세대가 … 다른 주택을 취득함으로써 일시적으로
 *   2주택이 된 경우」.
 * - 서면-2018-부동산-1836(부동산납세과-1179, 2018.12.12.) — 사실관계가 이 결함과 같다(A 전주 기준시가 3억 이하
 *   = §167의10①1호 · B 마포 · C 강남 신규 · C 취득 3년 내 B 양도): 「1세대 3주택자가 해당 주택을 양도하는
 *   경우에는 같은 호[구 8호 — 일시적 2주택]가 적용되지 아니하는 것입니다」. 현행 15호는 거기에 §155 의제와
 *   §154① 충족까지 요구하므로 더 좁다.
 * - §155②(상속주택 + 일반주택 → 「국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용」)는
 *   15호 문언에 그대로 들어간다. 2021.2.17.~2023.2.27. 양도분은 구 13호(대통령령 제31442호 신설 · 부칙 제2조②
 *   「이 영 시행 이후 양도하는 분부터」)가 같은 내용이다. 그 전 양도분에는 이 호가 없다.
 *
 * 🔑 route를 통과시켜 관측한다(`feedback_leaf_anchor_skips_zod_layer`) — 단건·다건 둘 다.
 *    세율은 프로덕션 fallback(`loadFallbackTransferRates`) — 중과가 실제로 걸리는 연혁.
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
import { withIdentityStdInBody } from "../tax-engine/_helpers/mixed-use-identity-std";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
/** 서울 강남구 역삼동 — 양도일 현재 조정대상지역. */
const GANGNAM = "1168010100";

/** 다른 일반주택 — 양도 주택(2015-01-01)보다 **먼저** 취득(명부 도출의 「신규 주택」 후보가 아니다). */
const B: HouseEntry = {
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2012-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
};
/** 영 §167의3①1호 — 지방(VALUE) 기준시가 2억, 양도 주택보다 **나중** 취득 → 도출이 「신규 주택」으로 고른다. */
const LOCAL_CHEAP: HouseEntry = {
  ...B,
  id: "h3",
  region: "non_capital",
  regionCode: undefined as unknown as string,
  acquisitionDate: "2025-01-01",
  officialPrice: "200000000",
  isApartment: false,
};
/** 영 §167의3①12호 나목 — 비수도권 준공 후 미분양(85㎡ 이하 · 6억 이하 · 2024.1.10.~2026.12.31. 취득). */
const UNSOLD_NEW: HouseEntry = {
  ...LOCAL_CHEAP,
  officialPrice: "400000000",
  isApartment: true,
  isUnsoldNewHouse: true,
  exclusiveArea: "84",
  acquisitionPrice: "500000000",
};
/** 영 §167의3①12호 가목 — 소형 신축(60㎡ 이하 · 수도권 6억 이하 · 아파트 아님 · 2024.1.10.~ 준공). */
const SMALL_NEW: HouseEntry = {
  ...B,
  id: "h3",
  acquisitionDate: "2025-01-01",
  isApartment: false,
  exclusiveArea: "59",
  acquisitionPrice: "500000000",
  completionDate: "2024-12-01",
};
/** 진짜 일시적 2주택의 신규 주택(중과 주택 수에 산입). */
const NEW_GANGNAM: HouseEntry = { ...B, id: "h3", acquisitionDate: "2025-01-01" };
/** §155② 단독 상속주택 — 상속개시 2019(5년 경과 → §167의3①7호·§167의10①10호는 걸리지 않는다). */
const INH_OLD: HouseEntry = { ...B, id: "h3", isInherited: true, acquisitionDate: "2019-06-01", inheritedDate: "2019-06-01" };
/** §155② 단독 상속주택 — 상속개시 2025(종전에는 「신규 주택」으로 도출돼 §155① 분기로 우연히 덮였다). */
const INH_NEW: HouseEntry = { ...INH_OLD, acquisitionDate: "2025-01-01", inheritedDate: "2025-01-01" };
/** §155② 단서 — 상속개시 당시 동일세대(동거봉양 합가 예외 없음) → 상속주택 특례 불성립. */
const INH_SAME_HH: HouseEntry = { ...INH_OLD, decedentSameHouseholdAtInheritance: true };

const P8 = "800,000,000";
/** 12억 초과 — 1세대1주택이어도 초과분이 과세되어 중과 여부가 세액에 드러난다. */
const P20 = "2,000,000,000";

/** 강남 양도 주택 2015-01-01 취득(취득 당시 비조정 → 거주요건 없음) · 3억 취득 · 양도 2026-09-18. */
function form(houses: HouseEntry[], price = P8): Form {
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
    transferDate: TRANSFER_DATE,
    contractTotalPrice: price,
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    houses,
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
      body: JSON.stringify(withIdentityStdInBody(body)),
    }),
  );

interface Verdict {
  totalTax: number;
  /** 중과 배제 사유 — 없으면 "" */
  reasons: string;
  effectiveHouseCount: number | undefined;
  surchargeType: string | undefined;
}

async function single(f: Form): Promise<Verdict> {
  const res = await post(SINGLE, "http://l/api/calc/transfer", await bodyOf(() => callTransferTaxAPI(f)));
  expect(res.status).toBe(200);
  const r = ((await res.json()) as { data: { result: Obj } }).data.result;
  const mh = r.multiHouseSurchargeEvaluation as
    | { exclusionReasons: { type: string }[]; effectiveHouseCount: number; surchargeType: string }
    | undefined;
  return {
    totalTax: r.totalTax as number,
    reasons: (mh?.exclusionReasons ?? []).map((x) => x.type).join(","),
    effectiveHouseCount: mh?.effectiveHouseCount,
    surchargeType: mh?.surchargeType,
  };
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
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { totalTax: number } }).data.totalTax;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

/** 2주택 중과(강남 2채) 세액 — 수정 전 결함 값 141,966,000과의 차이 157,850,000. */
const TWO_HOUSE_SURCHARGED_8 = 299_816_000;

describe("E-14 🔴 §155 기준 3주택 — 15호 불성립(2주택 중과)", () => {
  it("E14-0 [대조군] 강남 2채 → 2주택 중과 299,816,000", async () => {
    const r = await single(form([B]));
    expect(r).toEqual({
      totalTax: TWO_HOUSE_SURCHARGED_8,
      reasons: "",
      effectiveHouseCount: 2,
      surchargeType: "multi_house_2",
    });
  });

  it.each([
    ["§167의3①1호 지방 저가(단건 재현 — B1 무관)", LOCAL_CHEAP],
    ["§167의3①12호 나목 준공 후 미분양(E-10 F2)", UNSOLD_NEW],
    ["§167의3①12호 가목 소형 신축(E-10 F3)", SMALL_NEW],
  ])("E14-1 %s를 더한 3주택 → 대조군과 같은 2주택 중과 (단건 = 다건)", async (_n, extra) => {
    const f = form([B, extra]);
    const s = await single(f);
    // 수정 전: 141,966,000 · reasons "temporary_two_house"
    expect(s).toEqual({
      totalTax: TWO_HOUSE_SURCHARGED_8,
      reasons: "",
      effectiveHouseCount: 2,
      surchargeType: "multi_house_2",
    });
    expect(await multiTotal(f)).toBe(TWO_HOUSE_SURCHARGED_8);
  });

  it("E14-1b 12억 초과 양도도 같다 — 1,141,178,500 = 대조군 (수정 전 582,598,500)", async () => {
    const control = await single(form([B], P20));
    const r = await single(form([B, LOCAL_CHEAP], P20));
    expect(control.totalTax).toBe(1_141_178_500);
    expect(r).toEqual(control);
    expect(await multiTotal(form([B, LOCAL_CHEAP], P20))).toBe(1_141_178_500);
  });
});

describe("E-14 ✅ 긍정 짝 — 15호가 성립해야 하는 경로는 그대로", () => {
  it("E14-2 진짜 일시적 2주택(강남 신규 1채) 12억 초과 → 15호 배제 204,355,800 (단건 = 다건)", async () => {
    const f = form([NEW_GANGNAM], P20);
    expect(await single(f)).toEqual({
      totalTax: 204_355_800,
      reasons: "temporary_two_house",
      effectiveHouseCount: 2,
      surchargeType: "none",
    });
    expect(await multiTotal(f)).toBe(204_355_800);
  });

  it("E14-2b 양도 주택 + 지방 저가 신규 1채(§155 기준 2주택) → 일시적 2주택 비과세 0", async () => {
    const f = form([LOCAL_CHEAP]);
    expect((await single(f)).totalTax).toBe(0);
    expect(await multiTotal(f)).toBe(0);
  });
});

describe("E-14 §155② 상속주택 + 일반주택 → 15호(구 13호) 경로", () => {
  it("E14-3 상속 2025(종전: §155① 분기로 우연히 배제) → 상속 경로로 같은 세액 204,355,800", async () => {
    const f = form([INH_NEW], P20);
    expect(await single(f)).toEqual({
      totalTax: 204_355_800,
      reasons: "inherited_general_house",
      effectiveHouseCount: 2,
      surchargeType: "none",
    });
    expect(await multiTotal(f)).toBe(204_355_800);
  });

  it("E14-4 상속 2019(타이밍 밖 · 5년 경과) → 15호 배제 204,355,800 (수정 전 2주택 중과 422,521,000)", async () => {
    const f = form([INH_OLD], P20);
    expect(await single(f)).toEqual({
      totalTax: 204_355_800,
      reasons: "inherited_general_house",
      effectiveHouseCount: 2,
      surchargeType: "none",
    });
    expect(await multiTotal(f)).toBe(204_355_800);
  });

  it("E14-5 부정 짝 — §155② 단서(상속개시 당시 동일세대) → 상속주택 특례 불성립 → 중과 1,141,178,500", async () => {
    const r = await single(form([INH_SAME_HH], P20));
    expect(r).toEqual({
      totalTax: 1_141_178_500,
      reasons: "",
      effectiveHouseCount: 2,
      surchargeType: "multi_house_2",
    });
  });

  it("E14-6 부정 짝 — 상속주택 + 일반주택 2채(§155 기준 2주택, 중과 3주택) → 3주택 중과 1,327,903,500", async () => {
    const r = await single(form([B, INH_OLD], P20));
    expect(r).toEqual({
      totalTax: 1_327_903_500,
      reasons: "",
      effectiveHouseCount: 3,
      surchargeType: "multi_house_3plus",
    });
  });
});

/**
 * 겸용주택은 같은 정본(`resolveDeemedOneHouseBy155`)을 **비과세 주택 수 축**에도 쓴다(OH-09) — 게이트가 없던
 * 동안 §155 기준 3주택 겸용주택이 명부 도출 §155①로 **비과세**까지 받았다.
 */
describe("E-14 겸용주택 — 같은 정본의 주택 수 게이트", () => {
  const MIXED = {
    transferPrice: 1_000_000_000,
    transferDate: "2026-06-01",
    acquisitionPrice: 400_000_000,
    acquisitionDate: "2018-06-01",
    expenses: 0,
    useEstimatedAcquisition: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    residencePeriodMonths: 60,
    propertyType: "mixed-use-house" as const,
    temporaryTwoHouse: { previousAcquisitionDate: "2018-06-01", newAcquisitionDate: "2024-05-30" },
    mixedUse: {
      isMixedUseHouse: true as const,
      residentialFloorArea: 60,
      nonResidentialFloorArea: 40,
      buildingFootprintArea: 50,
      totalLandArea: 100,
      landAcquisitionDate: "2018-06-01",
      buildingAcquisitionDate: "2018-06-01",
      transferStandardPrice: { housingPrice: 300_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
      acquisitionStandardPrice: { housingPrice: 150_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 1_000_000 },
      residencePeriodYears: 5,
      zoneType: "general_residential" as const,
      isOneHouseExempt: false,
    },
  };
  const rule = async (householdHousingCount: number, over: object = {}) => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
    const res = await post(SINGLE, "http://l/api/calc/transfer", { ...MIXED, householdHousingCount, ...over });
    expect(res.status).toBe(200);
    const r = ((await res.json()) as { data: { result: { calculationRoute: { highValueRule: string } } } }).data
      .result;
    return r.calculationRoute.highValueRule;
  };

  it("E14-7 세대 3주택 → §155① 불성립 → 전액 과세 (수정 전 below_threshold_exempt)", async () => {
    expect(await rule(3)).toBe("non_one_house_full_taxation");
  });
  it("E14-7b 긍정 짝 — 세대 2주택 → §155① 비과세", async () => {
    expect(await rule(2)).toBe("below_threshold_exempt");
  });
  it("E14-7c 세대 3주택 중 보유 감면주택 1채(조특법 제외) → 비과세 주택 수 2 → §155① 비과세 (단건 E-3과 같은 값)", async () => {
    const special = [{ article: "unsold_98_7", houseAcquisitionDate: "2012-10-15", requirementsConfirmed: true }];
    expect(await rule(3, { specialHouseExclusions: special })).toBe("below_threshold_exempt");
  });
});
