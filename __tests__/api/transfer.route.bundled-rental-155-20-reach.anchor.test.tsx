/**
 * anchor — 일괄(bundled, 소령 §166⑥) 주 자산도 §155⑳ 거주주택 특례 경로(`runRentalHousingExceptionStep`)에
 * 도달하고, 그 조기반환이 싣는 주택 수 제외 판정 4필드(`specialHouseExclusionDetail`·`new994Detail`·
 * `unsold989Detail`·`houseCountExclusionDetails`)가 일괄 응답의 주 자산에 실려 결과뷰 카드(+「보유 주택 N」)로 뜬다.
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.8 — #1963 「일괄에서 §155⑳ 도달 여부는 미실측」의
 * 별건(사용자 결정 2026-10-04 「별건으로 처리」). **실측 결과 도달한다 — 코드 변경 없이 고정만 한다.**
 *
 * 경로: 폼 → `callTransferTaxAPI`(④ primary의 `rentalHousingException`) → route 5-a 주 자산 `...engineInput`
 * (`app/api/calc/transfer/route.ts` primaryItem) → `calculateTransferTaxAggregate` → 자산별 단건 엔진 STEP 2.5
 * (`transfer-tax.ts` `runRentalHousingExceptionStep`) → `pickReductionDetails`(`transfer-tax-aggregate-pickers.ts`)
 * → `BundledAllocationCard` → `PropertyCard` → `ReductionDetailCards`.
 *
 * 시료: #1963(RH-3)·#1964(BND) 시료를 합친 것 — 강남 주택 20억(2015 취득 · §155⑳ 가목 · 거주 48개월) +
 * 컴패니언 토지 3억(actual 모드). 명부 = [§99의2 h6, §99의4 h5, §98의9 h3, 장기임대 h4].
 *
 * | # | 명부 | 주 자산 결정세액 = 단건 | 4필드 |
 * |---|---|---|---|
 * | BR-1 | §99의2 + §99의4 + §98의9 + 장기임대 | 92,806,000 (단건 총 102,086,600) | 단건과 같은 값 |
 * | BR-2 | (음성) 장기임대만 | 92,806,000 | 없음 |
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const TRANSFER_DATE = "2026-09-18";
const GANGNAM = "1168010100";
const EUMSEONG = "4377037000"; // 충북 음성군 (수도권 밖 · 광역시 아님)
const FIELDS = ["specialHouseExclusionDetail", "new994Detail", "unsold989Detail", "houseCountExclusionDetails"] as const;
/** §155⑳ 특례 적용 후 주 자산 결정세액(국세) — 단건 #1963 RH 시료와 같은 값 */
const RH_DETERMINED = 92_806_000;
const RH_SINGLE_TOTAL = 102_086_600;
const REF = "count-exclusion-house-ref";
const RURAL_TITLE = "§99의4 — 농어촌주택 소유주택 제외";
const UNSOLD_TITLE = "§98의9 — 준공후미분양주택 소유주택 제외";

const ROW: HouseEntry = {
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
/** §99의2 감면주택 — 명부 행 special (#1961 MS-5 · #1964 BND 시료) */
const SPECIAL_ROW: HouseEntry = {
  ...ROW,
  id: "h6",
  acquisitionDate: "2013-06-01",
  countExclusion: {
    kind: "special",
    special: {
      article: "unsold_99_2",
      houseAcquisitionDate: "2013-06-01",
      houseContractDate: "2013-06-01",
      isNationalHousing: false,
      requirementsConfirmed: true,
    },
  },
};
/** §99의4 농어촌주택 — #1963 RH-1 시료 */
const RURAL_ROW: HouseEntry = {
  ...ROW,
  id: "h5",
  region: "non_capital",
  regionCode: EUMSEONG,
  acquisitionDate: "2020-01-01",
  officialPrice: "400000000",
  countExclusion: {
    kind: "reduction",
    reduction: {
      type: "new_99_4_rural",
      ruralHouseAcquisitionDate: "",
      ruralHouseStdPrice: "250000000",
      isRegisteredHanok: false,
      isAdjacentArea: false,
      meetsLocationRequirement: true,
    } as RowCountExclusionReduction,
  },
};
/** §98의9 준공후미분양 — #1963 RH-2 시료 */
const UNSOLD_ROW: HouseEntry = {
  ...ROW,
  id: "h3",
  region: "non_capital",
  regionCode: EUMSEONG,
  acquisitionDate: "2025-03-01",
  officialPrice: "400000000",
  acquisitionPrice: "500000000",
  exclusiveArea: "84",
  countExclusion: {
    kind: "reduction",
    reduction: {
      type: "unsold_98_9",
      unsoldHouseAcquisitionDate: "",
      unsoldHouseAcquisitionPrice: "",
      unsoldHouseExclusiveArea: "",
      isNonCapitalRegion: true,
      wasOneHouseholdAtAcquisition: true,
      meetsSellerAndContractRequirement: true,
    } as unknown as RowCountExclusionReduction,
  },
};
const RENTAL_ROW: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2016-01-01", isLongTermRental: true, isApartment: false };
const ALL = [SPECIAL_ROW, RURAL_ROW, UNSOLD_ROW, RENTAL_ROW];

/** 단건·일괄 공통 폼 — `bundled`면 actual 모드 + 컴패니언 토지 3억 (#1964 BND 시료) */
function form(houses: HouseEntry[], bundled: boolean): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
    ...(bundled ? { actualSalePrice: "2,000,000,000" } : {}),
  };
  if (bundled) {
    f.assets.push({
      ...makeDefaultAsset(2),
      assetKind: "land",
      landNature: "standalone",
      acquisitionDate: "2010-01-01",
      acquisitionArea: "300",
      fixedAcquisitionPrice: "100,000,000",
      actualSalePrice: "300,000,000",
    });
  }
  Object.assign(f, {
    transferDate: TRANSFER_DATE,
    contractTotalPrice: bundled ? "2,300,000,000" : "2,000,000,000",
    ...(bundled ? { bundledSaleMode: "actual" } : {}),
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses,
  });
  // §155⑳ 거주주택 특례 — 가목 장기일반민간임대(2019.3.1. 등록) · 거주 48개월 (#1949·MS-1·#1963 시료)
  const a = f.assets[0];
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = "48";
  a.rentalHousingException = {
    ...a.rentalHousingException,
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        ...makeDefaultRentalUnit(),
        businessRegistrationDate: "2019-03-01",
        rentalRegistrationDate: "2019-03-01",
        standardPriceAtRentalStart: "250,000,000",
        rentalInputMode: "direct",
        rentalMonths: "90",
        requirementsConfirmed: true,
      },
    ],
  };
  return f;
}

async function post(f: Form): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data: Obj };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data;
}

async function single(houses: HouseEntry[]): Promise<TransferTaxResult & Obj> {
  const data = await post(form(houses, false));
  expect(data.mode).toBe("single");
  return data.result as TransferTaxResult & Obj;
}
async function bundled(houses: HouseEntry[]) {
  const data = await post(form(houses, true));
  expect(data.mode).toBe("bundled");
  const aggregated = data.aggregated as AggregateTransferResult;
  const primary = aggregated.properties.find((p) => p.propertyId === "primary")! as PerPropertyBreakdown & Obj;
  const land = aggregated.properties.find((p) => p.propertyId !== "primary")! as PerPropertyBreakdown & Obj;
  return { apportionment: data.apportionment as never, aggregated, primary, land };
}
const pick = (o: Obj) => Object.fromEntries(FIELDS.map((k) => [k, o[k]]));

/** 주 자산이 §155⑳ 특례 경로를 탔고, 세액이 단건과 같다 */
function expectRentalPathTax(s: TransferTaxResult, p: PerPropertyBreakdown & Obj) {
  expect(s.rentalHousingExceptionDetail?.applied).toBe(true);
  expect(s.totalTax).toBe(RH_SINGLE_TOTAL);
  expect((p.rentalHousingExceptionDetail as { applied?: boolean } | undefined)?.applied).toBe(true);
  expect(p.determinedTax).toBe(RH_DETERMINED);
  expect(p.determinedTax).toBe(s.determinedTax);
  expect(p.taxBaseShare).toBe(s.taxBase);
  expect(p.longTermHoldingDeduction).toBe(s.longTermHoldingDeduction);
  expect(p.appliedRate).toBe(s.appliedRate);
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BR route — 일괄 주 자산이 §155⑳ 경로에 도달하고 주택 수 제외 4필드가 단건과 같은 값으로 실린다", () => {
  it("BR-1 §99의2 + §99의4 + §98의9 + 장기임대 명부 — 4필드 = 단건 · 세액 = 단건", async () => {
    const s = await single(ALL);
    const { primary, land } = await bundled(ALL);
    expectRentalPathTax(s, primary);

    expect(primary.specialHouseExclusionDetail?.entries.map((e) => [e.article, e.houseId])).toEqual([
      ["unsold_99_2", "h6"],
    ]);
    expect(primary.new994Detail).toMatchObject({ id: "new_99_4_rural", isEligible: true, houseId: "h5" });
    expect(primary.unsold989Detail).toMatchObject({ id: "unsold_98_9", isEligible: true, houseId: "h3" });
    expect(primary.houseCountExclusionDetails?.map((d) => [d.id, (d as { houseId?: string }).houseId])).toEqual([
      ["new_99_4_rural", "h5"],
      ["unsold_98_9", "h3"],
    ]);
    expect(pick(primary)).toEqual(pick(s));

    // 컴패니언 토지에는 §155⑳·명부 행 선언이 닿지 않는다(top-level 단일 객체 — 주 자산 전용)
    expect(land.rentalHousingExceptionDetail).toBeUndefined();
    for (const k of FIELDS) expect(land[k], k).toBeUndefined();
  });

  it("BR-2 (음성) 장기임대 행만 — §155⑳은 적용되고 4필드는 없다(단건·일괄)", async () => {
    const s = await single([RENTAL_ROW]);
    const { primary } = await bundled([RENTAL_ROW]);
    expectRentalPathTax(s, primary);
    for (const k of FIELDS) {
      expect(s[k], k).toBeUndefined();
      expect(primary[k], k).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BR 결과 화면 — 일괄 결과뷰(`BundledAllocationCard`)에 카드와 「보유 주택 N」이 뜬다(route 응답 그대로)", () => {
  it("BR-3 감면주택·§99의4·§98의9 카드 + 그 명부의 「보유 주택 N」", async () => {
    const f = form(ALL, true);
    const { apportionment, aggregated } = await bundled(ALL);
    render(<BundledAllocationCard apportionment={apportionment} aggregated={aggregated} formData={f} />);

    expect(screen.getByTestId("special-house-exclusion-card")).toBeInTheDocument();
    expect(screen.getByText(RURAL_TITLE)).toBeInTheDocument();
    expect(screen.getByText(UNSOLD_TITLE)).toBeInTheDocument();
    const refs = screen.getAllByTestId(REF).map((n) => n.textContent);
    expect(refs).toEqual(
      expect.arrayContaining([
        "보유 주택 1 (2013-06-01 취득) — ",
        "대상: 보유 주택 2 (2020-01-01 취득)",
        "대상: 보유 주택 3 (2025-03-01 취득)",
      ]),
    );
    expect(refs).toHaveLength(3);
  });

  it("BR-4 (음성) 장기임대 행만 — 카드도 라벨도 없다", async () => {
    const f = form([RENTAL_ROW], true);
    const { apportionment, aggregated } = await bundled([RENTAL_ROW]);
    render(<BundledAllocationCard apportionment={apportionment} aggregated={aggregated} formData={f} />);
    expect(screen.queryByTestId("special-house-exclusion-card")).toBeNull();
    expect(screen.queryByText(RURAL_TITLE)).toBeNull();
    expect(screen.queryByText(UNSOLD_TITLE)).toBeNull();
    expect(screen.queryByTestId(REF)).toBeNull();
  });
});
