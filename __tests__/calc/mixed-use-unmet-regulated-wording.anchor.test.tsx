/**
 * anchor — 겸용 1세대1주택 미충족 사유 문장의 「취득 당시 조정대상지역 해당/미해당」은 판정과 같은 술어다(V-3 · 2026-11-11).
 * 계획서 `docs/00-pm/mixed-use-inherit-same-household-holding.plan.md` V-3.
 *
 * 판정(`meetsOneHouseResidenceRequirement`)은 `resolveWasRegulatedAtAcquisition` — 법정동 코드 · 통산 기산일(§154⑧3호) 기준이다.
 * 종전 문장은 입력 플래그 `wasRegulatedAtAcquisition`을 그대로 써서, 직접 API에서 플래그가 코드와 어긋나면 판정과 반대로 적었다
 * (D1 강남 + false → 「미해당」 · D2 비조정 + true → 「해당」 · D3 수성구 동일세대 통산 보유 2년 8개월 + false → 「미해당」이라 사유가 없는 문장).
 * 화면 경로는 ④가 같은 기준으로 플래그를 계산해 보내 종전에도 일치했다(SU · S8 — 짝). 세액 무관.
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
import { runCalc, redevAptForm, houseRow, captureBody, postTransfer } from "./_helpers/redev-one-house-route";

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



const SUSEONG = "2726010100"; // 대구 수성구 — 2020-11-20 지정 · 2022-09-25 해제
const sentence = (warnings: string[] | undefined) => (warnings ?? []).filter((x) => x.includes("미충족으로 주택분도 과세됩니다"));

describe("겸용 미충족 사유 문장 — 조정대상지역 해당 여부 = 판정 술어(V-3)", () => {
  it.each([
    ["D1 강남 · 별도세대 · 요청 플래그 false", { mixed: true, same: false, region: GANGNAM }, false, /^건물 보유기간 0년 11개월 · 거주기간 1년 미만 · 취득 당시 조정대상지역 해당 — /],
    ["D2 비조정 · 별도세대 · 요청 플래그 true", { mixed: true, same: false }, true, /^건물 보유기간 0년 11개월 · 거주기간 1년 미만 · 취득 당시 조정대상지역 미해당 — /],
    ["D3 수성구 · 동일세대 개시 2021(조정) · 상속 2022-10-01(해제 후) · 요청 플래그 false", { mixed: true, same: true, region: SUSEONG, cohabRes: "0", start: "2021-01-01" }, false, /^세대 통산 보유기간 2년 8개월 · 거주기간 1년 미만 · 취득 당시 조정대상지역 해당 — /],
  ] as const)("직접 API %s", async (_n, c, flag, re) => {
    const body = await captureBody(form(c as Case));
    const r = await postTransfer({ ...body, wasRegulatedAtAcquisition: flag });
    expect(r.status).toBe(200);
    const rr = r.result as { warnings?: string[]; total?: { totalPayable: number } };
    expect(rr.total?.totalPayable).toBe(173_866_000); // 세액은 종전과 같다(판정은 원래 코드 기준)
    expect(sentence(rr.warnings)).toEqual([expect.stringMatching(re)]);
  });

  it("🔴 짝: 화면 경로 수성구 동일세대 — ④가 통산 기산일 기준 플래그(true)를 싣고 문장도 「해당」", async () => {
    const r = await runCalc(form({ mixed: true, same: true, region: SUSEONG, cohabRes: "0", start: "2021-01-01" }));
    expect(r.issues).toEqual([]);
    expect(r.body.wasRegulatedAtAcquisition).toBe(true);
    expect(sentence(res(r).warnings)).toEqual([expect.stringMatching(/취득 당시 조정대상지역 해당 — /)]);
  });
});
