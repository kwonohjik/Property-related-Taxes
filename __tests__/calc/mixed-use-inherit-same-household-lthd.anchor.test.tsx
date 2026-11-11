/**
 * anchor — 겸용 동일세대 상속 12억 초과: 장기보유특별공제 기산·표·공제율이 일반 주택 경로와 같다(V-5 · 2026-11-11).
 * 계획서 `docs/00-pm/mixed-use-inherit-same-household-holding.plan.md` V-5.
 *
 * §154⑧3호 통산은 §154①(비과세 요건)의 것이다 — 장특 보유기간(소득세법 §95④)은 상속개시일부터다. 표2 **대상** 판정은 통산 거주,
 * 공제율의 거주분은 실거주다(#2609 정책). 실측(mock 세율 · 양도가 30억 · 양도 2024-09-18 · 피상속인 취득 2015-01-01 · 동거 개시 2015-06-01 · 통산 거주 60개월):
 *   A 상속 2019-10-01 · 실거주 0  — 동일세대 표2 4년 16% / 별도세대 표1 4년 8%
 *   B 상속 2019-10-01 · 실거주 36 — 두 세대 모두 표2 보유 16% + 거주 12% = 28%
 *   C 상속 2021-10-01            — 보유 2년 → 0%
 * 겸용(주택분)과 일반 주택의 기산일·공제율이 같다 — 결함 없음. 겸용 공제액(주택분 과세 차익 389,418,603 기준)도 고정한다 —
 * 대표 공제율 echo는 건물 기준이라 토지분 보유연수가 틀려도 율만으로는 잡히지 않는다(뮤테이션 실측).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const NC = "4682025021";
const GANGNAM = "1168010100";
const MIXED = {
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};
type Case = {
  mixed: boolean;
  same: boolean;
  region?: string;
  /** 동일세대 거주·보유 개시일 */
  start?: string;
  /** 상속개시 전 동일세대 거주 개월 */
  cohabRes?: string;
  price?: string;
  temp?: boolean;
};
const form = (c: Case) => {
  const region = c.region ?? NC;
  return redevAptForm({
    kind: "housing", price: c.price ?? "1000000000", count: c.temp ? "2" : "1",
    houses: (c.temp
      ? [houseRow("b", "2023-09-01", { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general" } as never)]
      : []) as never,
    assetOver: {
      ...(c.mixed ? MIXED : {}), regionCode: region, fixedAcquisitionPrice: "600000000", publishedValueAtInheritance: "600000000",
      residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [],
      acquisitionCause: "inheritance", acquisitionDate: "2022-10-01", inheritanceStartDate: "2022-10-01", inheritanceAssetKind: "house_individual",
      decedentSameHouseholdBeforeInheritance: c.same,
      decedentCohabitationHoldingStartDate: c.same ? (c.start ?? "2015-01-01") : "",
      decedentCohabitationResidenceMonths: c.same ? (c.cohabRes ?? "60") : "",
      decedentAcquisitionDate: "2015-01-01",
    },
    formOver: {
      transferDate: "2023-09-18", filingDate: "2023-12-31", residencePeriodMonths: "0",
      ...(c.temp ? { temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2023-09-01" } : {}),
      ...(region === GANGNAM ? { isRegulatedArea: true, wasRegulatedAtAcquisition: false } : {}),
    } as never,
  });
};
type R = Awaited<ReturnType<typeof runCalc>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const res = (r: R) => r.result as any;



type Lthd = { table: 1 | 2; years: number; rate: number; amount: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mixedLthd = (x: any): Lthd => ({ table: x.housingPart.longTermDeductionTable, years: x.housingPart.holdingYears, rate: x.housingPart.longTermDeductionRate, amount: x.housingPart.longTermDeductionAmount });

describe("겸용 동일세대 상속 · 장특 = 일반 경로(V-5)", () => {
  it.each([
    ["A 상속 2019-10 · 실거주 0 · 동일세대", "2019-10-01", "0", true, { table: 2, years: 4, rate: 0.16, amount: 62_306_975 }],
    ["A 상속 2019-10 · 실거주 0 · 별도세대", "2019-10-01", "0", false, { table: 1, years: 4, rate: 0.08, amount: 31_153_487 }],
    ["B 상속 2019-10 · 실거주 36 · 동일세대", "2019-10-01", "36", true, { table: 2, years: 4, rate: 0.28, amount: 109_037_208 }],
    ["B 상속 2019-10 · 실거주 36 · 별도세대", "2019-10-01", "36", false, { table: 2, years: 4, rate: 0.28, amount: 109_037_208 }],
    ["C 상속 2021-10 · 실거주 0 · 동일세대", "2021-10-01", "0", true, { table: 2, years: 2, rate: 0, amount: 0 }],
  ] as const)("%s", async (_n, inh, own, same, expected) => {
    const run = async (mixed: boolean) => {
      const f = form({ mixed, same, price: "3000000000", start: "2015-06-01", cohabRes: "60" });
      Object.assign(f.assets[0], { acquisitionDate: inh, inheritanceStartDate: inh, residencePeriodMonthsAsset: own });
      Object.assign(f, { transferDate: "2024-09-18", filingDate: "2024-12-31" });
      const r = await runCalc(f);
      expect(r.issues).toEqual([]);
      return res(r);
    };
    const m = mixedLthd(await run(true));
    expect(m).toEqual(expected);
    const g = await run(false);
    expect(g.lthdStartDate).toBe(`${inh}T00:00:00.000Z`); // 상속개시일 기산(§95④) — 동거 개시일로 옮기지 않는다
    expect(g.longTermHoldingRate).toBe(m.rate); // 일반 경로는 표 번호·연수 echo가 없다 — 기산일·공제율로 대조
  });
});
