/**
 * anchor — 동일세대 상속 겸용주택 × 상생임대(§155의3) · 합가(§155④⑤) 교차: 일반 주택 경로와 결론이 같다(2026-11-11).
 * 계획서 `docs/00-pm/mixed-use-inherit-same-household-holding.plan.md` 「남은 공백」.
 *
 * 화면 경로(④ → route → 엔진)로만 잰다. ⚠️ 요청 최상위의 주택 수·합가만 바꿔 보내면 겸용 서브입력(④가 폼에서 만든 1주택 사실)이 남아
 * 겸용만 비과세로 나온다 — 시료 구성 오류이지 엔진 결함이 아니다(2026-11-11 probe에서 확인). 상생임대는 판정 메뉴 운반 상자
 * `importedOneHouseFacts`로 실린다(`buildOneHouseExtraFactsPayload`).
 * 공통: 상속 2022-10-01 · 피상속인 취득 2015-01-01 · 양도 2023-09-18 · 10억 · mock 세율. 겸용 과세 세액 173,866,000(상가분 포함) · 일반 146,366,000.
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



const TAX_MIXED = 173_866_000;
const TAX_GENERAL = 146_366_000;
type Out = { exempt: boolean; tax: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const outOf = (r: any): Out => ({ exempt: r.result.housingPart?.isExempt ?? r.result.isExempt, tax: r.result.total?.totalPayable ?? r.result.totalTax });
const pair = async (mk: (mixed: boolean) => ReturnType<typeof form>) => {
  const out: Record<"mixed" | "general", Out> = {} as never;
  for (const mixed of [true, false]) {
    const r = await runCalc(mk(mixed));
    expect(r.issues).toEqual([]);
    out[mixed ? "mixed" : "general"] = outOf(r);
  }
  return out;
};
const EXEMPT = { mixed: { exempt: true, tax: 0 }, general: { exempt: true, tax: 0 } };
const TAXED = { mixed: { exempt: false, tax: TAX_MIXED }, general: { exempt: false, tax: TAX_GENERAL } };

const WW = { winWinRentalSpecial: true, winWinRentalContractDate: "2022-01-10", winWinRentalIncreaseRatePct: "3", winWinRentalPriorLeaseMonths: "24", winWinRentalLeaseMonths: "24" };
describe("상생임대(§155의3) × 동일세대 상속 겸용 — 강남 · 동거 개시 2018(취득 당시 조정) · 통산 거주 0", () => {
  it.each([
    ["상생임대 없음 → 거주 미달 과세", true, false, TAXED],
    ["상생임대 → 거주요건 면제 · 통산 보유 5년 8개월 → 비과세", true, true, EXEMPT],
    ["별도세대 + 상생임대 → 보유 0년 11개월 미달 과세", false, true, TAXED],
  ] as const)("%s", async (_n, same, ww, expected) => {
    expect(
      await pair((mixed) => {
        const f = form({ mixed, same, region: GANGNAM, cohabRes: "0", start: "2018-01-01" });
        if (ww) Object.assign(f, { importedOneHouseFacts: WW });
        return f;
      }),
    ).toEqual(expected);
  });
});

const spouse = houseRow("spouse", "2016-01-01", { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", mergeOrigin: "counterpart_side" } as never);
const MERGE = {
  none: {},
  marriage: { marriageDate: "2023-01-01", isFirstTransferredInMerge: true },
  parental: { parentalCareMergeDate: "2023-01-01", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true },
} as const;
describe("합가(§155④⑤) × 동일세대 상속 겸용 — 비조정 · 동거 개시 2015 · 상대 세대 주택 1채(2016)", () => {
  it.each([
    ["합가 없음 2주택 · 동일세대 → 과세(대조)", "none", true, TAXED],
    ["혼인합가 · 동일세대 → 통산 보유로 비과세", "marriage", true, EXEMPT],
    ["혼인합가 · 별도세대 → 보유 미달 과세", "marriage", false, TAXED],
    ["동거봉양 합가 · 동일세대 → 비과세", "parental", true, EXEMPT],
    ["동거봉양 합가 · 별도세대 → 과세", "parental", false, TAXED],
  ] as const)("%s", async (_n, kind, same, expected) => {
    expect(
      await pair((mixed) => {
        const f = form({ mixed, same });
        Object.assign(f, { householdHousingCount: "2", houses: [spouse], ...MERGE[kind] });
        return f;
      }),
    ).toEqual(expected);
  });
});
