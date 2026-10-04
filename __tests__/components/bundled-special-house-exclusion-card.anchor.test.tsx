/**
 * anchor — 일괄(bundled) 결과 「자산별 계산 결과」 카드에 단건·다건과 같은 「보유 주택 N」
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.8 「일괄 감면주택 카드 보유 주택 N」(사용자 결정 2026-10-04 「추가해라」).
 *
 * 일괄 결과뷰는 단건 계산기(`TransferTaxCalculator.tsx`)의 `mode: "bundled"` 분기 → `BundledAllocationCard` →
 * `PropertyCard`(`BundledAllocationSubCards.tsx`) → 공용 `ReductionDetailCards`다. 폼은 **단건과 같은 폼**이라
 * 명부도 단건과 같은 `formData.houses`이고, 엔진 detail의 행 id(`houseId`)는 그 명부의 행 id다
 * (route 5-a 주 자산 = `...engineInput` — 단건과 같은 변환본 · BND-0이 route를 실제로 거쳐 확인한다).
 * 종전에는 `PropertyCard`가 `houses`를 넘기지 않아 카드는 뜨되 「보유 주택 N」만 빠졌다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { PropertyCard } from "@/components/calc/results/BundledAllocationSubCards";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Obj = Record<string, unknown>;

const GANGNAM = "1168010100";
const REF = "count-exclusion-house-ref";

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
/** §99의2 감면주택 — 명부 행 ⑥ special(#1961 MS-5와 같은 시료) */
const SPECIAL_ROW: HouseEntry = {
  ...ROW,
  id: "h3",
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
/** §99의4 농어촌주택 — 명부 행 reduction 종류(MS-10과 같은 시료) */
const RURAL: RowCountExclusionReduction = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "",
  ruralHouseStdPrice: "150000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};
const RURAL_ROW: HouseEntry = {
  ...ROW,
  id: "h4",
  region: "non_capital",
  regionCode: undefined,
  acquisitionDate: "2021-01-01",
  officialPrice: "150000000",
  countExclusion: { kind: "reduction", reduction: RURAL },
};
/** §98의9 수도권 밖 준공후미분양 — 명부 행 reduction 종류(CR-12d와 같은 시료) */
const UNSOLD = {
  type: "unsold_98_9",
  unsoldHouseAcquisitionDate: "",
  unsoldHouseAcquisitionPrice: "",
  unsoldHouseExclusiveArea: "",
  isNonCapitalRegion: true,
  wasOneHouseholdAtAcquisition: true,
  meetsSellerAndContractRequirement: true,
} as unknown as RowCountExclusionReduction;
const UNSOLD_ROW: HouseEntry = {
  ...ROW,
  id: "h5",
  region: "non_capital",
  regionCode: undefined,
  acquisitionDate: "2024-02-01",
  officialPrice: "150000000",
  isApartment: false,
  acquisitionPrice: "500000000",
  exclusiveArea: "84",
  countExclusion: { kind: "reduction", reduction: UNSOLD },
} as HouseEntry;
const ALL = [ROW, SPECIAL_ROW, RURAL_ROW, UNSOLD_ROW];

/** 일괄(§166⑥ 본문 actual) — 주 자산 주택(강남) + 컴패니언 토지. 명부 = [일반 h2, §99의2 h3, §99의4 h4, §98의9 h5] */
function bundledForm(houses: HouseEntry[]): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
    actualSalePrice: "2,000,000,000",
  };
  f.assets.push({
    ...makeDefaultAsset(2),
    assetKind: "land",
    landNature: "standalone",
    acquisitionDate: "2010-01-01",
    acquisitionArea: "300",
    fixedAcquisitionPrice: "100,000,000",
    actualSalePrice: "300,000,000",
  });
  return Object.assign(f, {
    transferDate: "2026-09-18",
    contractTotalPrice: "2,300,000,000",
    bundledSaleMode: "actual",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    houses,
  });
}

async function bodyOf(f: Form): Promise<Obj> {
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
  return body as Obj;
}

async function bundled(f: Form): Promise<{ apportionment: never; aggregated: AggregateTransferResult }> {
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await bodyOf(f)),
    }),
  );
  const json = (await res.json()) as { data: { mode: string; apportionment: never; aggregated: AggregateTransferResult } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(json.data.mode).toBe("bundled");
  return json.data;
}

const primaryOf = (a: AggregateTransferResult) => a.properties.find((p) => p.propertyId === "primary")!;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BND 일괄 결과 — 감면주택·§99의4·§98의9 카드에 그 명부의 「보유 주택 N」", () => {
  it("BND-0 (전제) 일괄 route의 주 자산 detail은 폼 명부(`formData.houses`)의 행 id를 싣는다", async () => {
    const data = await bundled(bundledForm(ALL));
    const p = primaryOf(data.aggregated);
    expect(p.specialHouseExclusionDetail?.entries.map((e) => [e.article, e.houseId])).toEqual([["unsold_99_2", "h3"]]);
    expect(p.houseCountExclusionDetails?.map((d) => [d.id, d.houseId])).toEqual([
      ["new_99_4_rural", "h4"],
      ["unsold_98_9", "h5"],
    ]);
    // 컴패니언 토지에는 명부 행 선언이 닿지 않는다(카드 없음)
    const land = data.aggregated.properties.find((x) => x.propertyId !== "primary")!;
    expect(land.specialHouseExclusionDetail?.entries ?? []).toEqual([]);
  });

  it("BND-1 일괄 결과뷰 — 감면주택·§99의4·§98의9 카드에 단건과 같은 「보유 주택 N (취득일) — 」", async () => {
    const f = bundledForm(ALL);
    const data = await bundled(f);
    render(<BundledAllocationCard apportionment={data.apportionment} aggregated={data.aggregated} formData={f} />);

    const card = screen.getByTestId("special-house-exclusion-card");
    expect(within(card).getByText("조특법 감면주택 보유 — 주택수 제외")).toBeInTheDocument();
    expect(within(card).getByTestId(REF).parentElement?.textContent).toBe(
      "보유 주택 2 (2013-06-01 취득) — §99의2 신축주택등",
    );
    const refs = screen.getAllByTestId(REF).map((n) => n.textContent);
    expect(refs).toContain("보유 주택 2 (2013-06-01 취득) — ");
    // §99의4 카드(`New994DetailCard`)는 「대상: 」 접두 — 단건 결과뷰와 같은 컴포넌트·같은 라벨 함수
    expect(refs).toContain("대상: 보유 주택 3 (2021-01-01 취득)");
    expect(refs).toContain("대상: 보유 주택 4 (2024-02-01 취득)");
    expect(refs).toHaveLength(3);
  });

  it("BND-2 (음성) 명부에 그 행 id가 없으면 카드는 그대로 뜨고 라벨만 없다", async () => {
    const f = bundledForm(ALL);
    const data = await bundled(f);
    render(
      <BundledAllocationCard
        apportionment={data.apportionment}
        aggregated={data.aggregated}
        formData={{ ...f, houses: [ROW] }}
      />,
    );
    expect(screen.getByTestId("special-house-exclusion-card")).toBeInTheDocument();
    expect(screen.queryByTestId(REF)).toBeNull();
  });

  it("BND-3 (음성) 명부 행 선언이 없으면 카드도 라벨도 없다", async () => {
    const f = bundledForm([ROW]);
    const data = await bundled(f);
    render(<BundledAllocationCard apportionment={data.apportionment} aggregated={data.aggregated} formData={f} />);
    expect(screen.queryByTestId("special-house-exclusion-card")).toBeNull();
    expect(screen.queryByTestId(REF)).toBeNull();
  });

  it("BND-4 (음성) `PropertyCard`에 명부를 넘기지 않으면 라벨 없이 카드만 — 명부를 모르는 호출부는 종전 동작", () => {
    const breakdown = {
      propertyId: "primary",
      propertyLabel: "주택",
      transferGain: 1,
      longTermHoldingDeduction: 0,
      income: 1,
      reductionAmount: 0,
      isExempt: false,
      steps: [],
      specialHouseExclusionDetail: {
        excludedCount: 1,
        entries: [
          { article: "unsold_99_2", articleLabel: "§99의2 신축주택등", eligible: true, legalBasis: "조특법 §99의2②", houseId: "h3" },
        ],
      },
    } as unknown as PerPropertyBreakdown;
    render(<PropertyCard breakdown={breakdown} />);
    expect(screen.getByTestId("special-house-exclusion-card")).toBeInTheDocument();
    expect(screen.queryByTestId(REF)).toBeNull();
  });
});
