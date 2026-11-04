/**
 * anchor — 동일세대로 상속받은 겸용주택도 상속개시 전 동일세대 보유기간을 통산한다(「소득세법 시행령」 §154⑧3호).
 * 계획서 `docs/00-pm/mixed-use-inherit-same-household-holding.plan.md` A-2 · Q 전부 권장안.
 *
 * 종전: 겸용 판정 입력이 거주 이중 통산을 막으려고 `acquisitionCause`·`decedent*`를 통째로 빼, 보유 backdate까지 막혔다.
 *   S1 겸용 173,866,000 / 일반 0 (2026-11-04 실측 · mock 세율). 화면 · 요청 body에는 값이 이미 있었다.
 *
 * 공통: 상속 2022-10-01 · 피상속인 취득 2015-01-01 · 양도 2023-09-18 · 양도가 10억 · 실거주 0 · 1주택 · 겸용 = 주택 100㎡ / 상가 60㎡.
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
import { sameHouseholdInheritanceOf } from "@/app/api/calc/transfer/mixed-use-asset-input";

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
const totalOf = (r: R): number => res(r).total?.totalPayable ?? res(r).totalTax;
const exemptOf = (r: R): boolean => res(r).housingPart?.isExempt ?? res(r).isExempt;

describe("겸용 · 동일세대 상속 보유 통산 — 세액(일반 경로와 결론 일치)", () => {
  it.each([
    // [이름, 시료, 겸용 세액, 겸용 비과세, 일반 세액, 일반 비과세]
    ["S1 비조정 · 개시 2015 · 통산 거주 60", { same: true }, 0, true, 0, true],
    ["S4 강남 · 개시 2015(2017-08-02 이전 — 거주요건 없음) · 통산 거주 0", { same: true, region: GANGNAM, cohabRes: "0" }, 0, true, 0, true],
    ["S5 강남 · 개시 2018(취득 당시 조정) · 통산 거주 0 → 거주 미달", { same: true, region: GANGNAM, cohabRes: "0", start: "2018-01-01" }, 173_866_000, false, 146_366_000, false],
    ["S8 강남 · 개시 2018 · 통산 거주 18 → 거주 미달(이중 통산 없음)", { same: true, region: GANGNAM, cohabRes: "18", start: "2018-01-01" }, 173_866_000, false, 146_366_000, false],
    ["S9 강남 · 개시 2018 · 통산 거주 24 → 거주 충족", { same: true, region: GANGNAM, cohabRes: "24", start: "2018-01-01" }, 0, true, 0, true],
    ["S7 일시적 2주택 · 1년 미경과 → 특례 불성립", { same: true, temp: true }, 173_866_000, false, 146_366_000, false],
  ] as const)("%s", async (_n, c, mixedTotal, mixedExempt, generalTotal, generalExempt) => {
    const m = await runCalc(form({ ...c, mixed: true }));
    const g = await runCalc(form({ ...c, mixed: false }));
    expect(m.issues).toEqual([]);
    expect(g.issues).toEqual([]);
    expect([totalOf(m), exemptOf(m)]).toEqual([mixedTotal, mixedExempt]);
    expect([totalOf(g), exemptOf(g)]).toEqual([generalTotal, generalExempt]);
  });

  it("S2 별도세대 상속 — 통산 없음(상속개시일 기산 · 보유 0년 11개월)", async () => {
    const r = await runCalc(form({ mixed: true, same: false }));
    expect(r.issues).toEqual([]);
    expect([totalOf(r), exemptOf(r)]).toEqual([173_866_000, false]);
    expect((res(r).warnings as string[]).some((w) => w.startsWith("건물 보유기간 0년 11개월 · 거주기간 1년 미만 ·"))).toBe(true);
  });

  it("S6 15억 — 주택분이 비과세 기준까지 통산 반영(종전 403,986,000)", async () => {
    const r = await runCalc(form({ mixed: true, same: true, price: "1500000000" }));
    expect(r.issues).toEqual([]);
    expect(totalOf(r)).toBe(157_493_906);
  });

  it("S10 §154③ 단서(주택 60㎡ ≤ 상가 100㎡) — 통산은 주택분 판정에만 · 상가분은 그대로 과세", async () => {
    const run = async (same: boolean) => {
      const f = form({ mixed: true, same });
      Object.assign(f.assets[0], { residentialFloorArea: "60", nonResidentialFloorArea: "100" });
      const r = await runCalc(f);
      expect(r.issues).toEqual([]);
      return { total: totalOf(r), housingExempt: exemptOf(r), commercialGain: res(r).commercialPart.transferGain };
    };
    // 종전 동일세대도 118,866,000(주택분 과세) — 상가분 양도차익은 통산과 무관하게 같다.
    expect(await run(true)).toEqual({ total: 54_212_980, housingExempt: true, commercialGain: 184_669_812 });
    expect(await run(false)).toEqual({ total: 118_866_000, housingExempt: false, commercialGain: 184_669_812 });
  });

  it("S3 개시일이 상속개시일과 같거나 뒤면 ⑧이 막는다(통산 기간 없음)", async () => {
    for (const start of ["2022-10-01", "2022-12-01"]) {
      const r = await runCalc(form({ mixed: true, same: true, start }));
      expect(r.issues.map((i) => i.message)).toEqual([
        "자산: 동일세대 거주·보유 개시일은 상속개시일(취득일)보다 앞서야 합니다. (§154⑧3호 — 상속개시 전 기간)",
      ]);
    }
  });

  it("S8 사유 문장 — 보유는 「세대 통산」 · 거주는 통산 개월 연 내림(만 1년)", async () => {
    const r = await runCalc(form({ mixed: true, same: true, region: GANGNAM, cohabRes: "18", start: "2018-01-01" }));
    expect((res(r).warnings as string[]).filter((w) => w.includes("미충족으로 주택분도 과세됩니다"))).toEqual([
      expect.stringMatching(/^세대 통산 보유기간 5년 8개월 · 거주기간 만 1년 · /),
    ]);
  });
});

/** 부담부증여 — 양도인이 동일세대로 상속받은 겸용주택(계획서 V-2). 종전 동일세대 98,659,001 / 일반 0. */
const BG = {
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "300000000", bgDepositAttribution: "unallocated", bgMortgageAttribution: "unallocated",
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "500000000",
};
const bgForm = (mixed: boolean, same: boolean) => {
  const f = form({ mixed, same });
  Object.assign(f.assets[0], BG);
  return f;
};
describe("부담부증여 겸용 · 동일세대 상속 보유 통산(V-2)", () => {
  it.each([
    ["겸용 · 동일세대", true, true, 0, true],
    ["겸용 · 별도세대(종전과 같다)", true, false, 98_659_001, false],
    ["일반 · 동일세대", false, true, 0, true],
    ["일반 · 별도세대", false, false, 66_368_500, false],
  ] as const)("%s", async (_n, mixed, same, total, exempt) => {
    const r = await runCalc(bgForm(mixed, same));
    expect(r.issues).toEqual([]);
    expect([totalOf(r), exemptOf(r)]).toEqual([total, exempt]);
  });
});

describe("⑭ 동일세대 상속 사실 선택 leaf — `sameHouseholdInheritanceOf`", () => {
  const D = new Date("2015-01-01");
  it.each([
    ["상속 · 동일세대 · 개시일", { acquisitionCause: "inheritance", decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: D }, { holdingStartDate: D }],
    ["별도세대", { acquisitionCause: "inheritance", decedentSameHouseholdBeforeInheritance: false, decedentCohabitationHoldingStartDate: D }, undefined],
    ["개시일 없음", { acquisitionCause: "inheritance", decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: undefined }, undefined],
    ["상속 아님(남은 값)", { acquisitionCause: "purchase", decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: D }, undefined],
  ] as const)("%s", (_n, ei, expected) => {
    expect(sameHouseholdInheritanceOf(ei)).toEqual(expected);
  });
});
