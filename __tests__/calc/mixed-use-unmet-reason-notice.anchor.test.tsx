/**
 * anchor — 겸용주택도 일시적 2주택 · 합가 의제가 깨져 과세되면 정본 요건 검토표의 미충족 행을 일반 계산기(#2880)와
 * 같은 문장으로 고지한다(`docs/00-pm/mixed-use-unmet-reason-calc.plan.md` · Q 전부 권장안).
 *
 * 종전: 겸용 자체 §154① 문장은 주택 수 축이 설 때만 나와, T1 · T2 · M2는 사유가 0건이었다(2026-11-04 실측 · mock 세율).
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
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const GANGNAM = "1168010100";
const NC = "4682025021";
/** 겸용주택 — 주택 연면적 100 · 주택 외 60 */
const MIXED = {
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};
const other = (id: string, acq: string, o: object = {}) =>
  houseRow(id, acq, { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", ...o } as never);
const sale = (region: string, acq: string, resid: string, formOver: object = {}, houses: unknown[] = [], price = "1000000000") =>
  redevAptForm({
    kind: "housing", price, count: String(houses.length + 1), houses: houses as never,
    assetOver: { ...MIXED, regionCode: region, acquisitionCause: "purchase", acquisitionDate: acq, fixedAcquisitionPrice: "600000000", residenceInputMode: "direct", residencePeriodMonthsAsset: resid, residencePeriods: [] },
    formOver: {
      transferDate: "2023-09-18", filingDate: "2023-12-31", residencePeriodMonths: resid,
      ...(region === GANGNAM ? { isRegulatedArea: true, wasRegulatedAtAcquisition: true } : {}), ...formOver,
    } as never,
  });
const TEMP = (newAcq: string) => ({ temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: newAcq });
const PARENTAL = { parentalCareMergeDate: "2023-06-28", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const HEAD = /(?:1세대1주택 비과세|일시적 2주택 비과세 특례|동거봉양 합가 비과세 특례|혼인 합가 비과세 특례|혼인·동거봉양 이중 합가 비과세 특례)\(.+?\)를 적용하지 않았습니다 — /;
const OWN = /미충족으로 주택분도 과세됩니다/;
type R = Awaited<ReturnType<typeof runCalc>>;
const warningsOf = (r: R) => (r.result?.warnings ?? []) as string[];
const noticesOf = (r: R) => warningsOf(r).filter((w) => HEAD.test(w));
const ownOf = (r: R) => warningsOf(r).filter((w) => OWN.test(w));
const totalOf = (r: R) => (r.result as { total: { totalPayable: number } }).total.totalPayable;
const exemptOf = (r: R) => (r.result as { housingPart: { isExempt: boolean } }).housingPart.isExempt;

const RHE_UNIT = {
  ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26", rentalRegisteredDate: "2019-09-26",
  standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "48", requirementsConfirmed: true,
};
const withRhe = (f: ReturnType<typeof sale>, o: object) => {
  (f.assets[0] as unknown as Record<string, unknown>).rentalHousingException = {
    ...makeDefaultAsset(1).rentalHousingException, applyException: true, scenario: "A", priorRentalExemptionHistory: "none", rentalUnits: [RHE_UNIT], ...o,
  };
  return f;
};

const T155 = "일시적 2주택 비과세 특례(소득세법 시행령 §155①)를 적용하지 않았습니다 — ";
const DEADLINE = "신규주택 취득일부터 3년 이내 종전주택 양도 미충족(신규주택 취득일 2020-01-02, 처분기한 2023-01-02, 양도(예정)일 2023-09-18)";
const P155 = "동거봉양 합가 비과세 특례(소득세법 시행령 §155④)를 적용하지 않았습니다 — ";

describe("겸용 · 일시적 2주택 · 합가 과세 — 정본 검토표 고지 1건 · 세액 불변", () => {
  it.each([
    ["T1 처분기한 경과", sale(NC, "2018-06-01", "0", TEMP("2020-01-02"), [other("b", "2020-01-02")]), 128_766_000, `${T155}${DEADLINE}.`],
    [
      "T2 1년 미경과 · 보유 11개월",
      sale(NC, "2022-10-01", "0", TEMP("2023-09-01"), [other("b", "2023-09-01")]),
      267_191_278,
      `${T155}종전주택 취득일부터 1년 이상 지난 뒤 신규주택 취득 미충족(종전주택 취득일 2022-10-01, 1년 경과일 2023-10-02, 신규주택 취득일 2023-09-01) · ` +
        "종전주택 보유기간 2년 이상 미충족(보유 기산일 2022-10-01, 보유기간 0년 11개월).",
    ],
    [
      "T3 강남 · 취득 역순 · 거주 23개월 — 순서 행은 앞선 고지가 말해 빠지고 거주는 「만 1년」(Q-2 a)",
      sale(GANGNAM, "2020-06-01", "23", TEMP("2020-01-02"), [other("b", "2020-01-02")]),
      135_806_000,
      `${T155}${DEADLINE} · 종전주택 거주기간 2년 이상(취득 당시 조정대상지역인 경우) 미충족(취득 당시 조정대상지역 해당, 거주기간 만 1년).`,
    ],
    [
      "M2 합가 기한 경과",
      sale(NC, "2010-01-01", "0", { ...PARENTAL, parentalCareMergeDate: "2012-06-01" }, [other("b", "2008-09-27", { mergeOrigin: "counterpart_side" })]),
      100_749_000,
      `${P155}합가일부터 10년 이내 양도 미충족(합가일 2012-06-01, 기한 2022-06-02, 양도(예정)일 2023-09-18) — ` +
        "역상 말일 2022-06-01이 토요일·공휴일이라 기한이 2022-06-02까지 늘어났습니다(국세기본법 §4 → 민법 §161).",
    ],
    [
      "M3 합가 전 보유자 미선택(겸용엔 합가 확인 필요 고지가 없어 행 note가 확인 필요를 말한다)",
      sale(NC, "2020-06-01", "0", PARENTAL, [other("b", "2018-09-27")]),
      135_806_000,
      `${P155}합가 전 각자 1주택을 보유하다가 합가로 1세대 2주택이 됨 미충족(세대 주택 수 2채) — 보유 주택 목록에서 합가 전 보유자를 고르지 않아 ` +
        "불성립으로 판정했습니다 — 확인 필요: 보유 주택 목록에서 각 주택의 합가 전 보유자를 고르면 이 요건까지 판정합니다.",
    ],
    ["HV 15억 · 처분기한 경과 — 고가주택 행은 싣지 않는다(V-2)", sale(NC, "2018-06-01", "0", TEMP("2020-01-02"), [other("b", "2020-01-02")], "1500000000"), 333_531_000, `${T155}${DEADLINE}.`],
  ] as const)("MU-1 ★ %s", async (_n, form, tax, notice) => {
    const r = await runCalc(form);
    expect(r.body.mixedUse).toBeDefined();
    expect(exemptOf(r)).toBe(false);
    expect(totalOf(r)).toBe(tax);
    expect(noticesOf(r)).toEqual([notice]);
    expect(ownOf(r)).toEqual([]);
  });
});

describe("짝 — 새 고지를 내지 않는 경우", () => {
  it.each([
    ["T1c 처분기한 내(비과세)", sale(NC, "2018-06-01", "0", TEMP("2021-01-02"), [other("b", "2021-01-02")]), 0, 0],
    ["M2c 합가 기한 내(비과세)", sale(NC, "2010-01-01", "0", { ...PARENTAL, parentalCareMergeDate: "2016-06-01" }, [other("b", "2008-09-27", { mergeOrigin: "counterpart_side" })]), 0, 0],
    ["G5 2주택 · 특례 없음(검토표 없음)", sale(NC, "2020-06-01", "0", {}, [other("b", "2015-01-01")]), 135_806_000, 0],
    [
      "E1s ⑳ 불성립 — ⑳ 고지만",
      withRhe(sale(GANGNAM, "2020-06-01", "0", {}, [other("b", "2018-09-27", { isLongTermRental: true })]), {}),
      135_806_000,
      0,
    ],
    [
      "E1 합가 × ⑳ 0061 · 보유 11개월 — 주택 수 축이 서서 자체 문장만",
      withRhe(
        sale(GANGNAM, "2022-10-01", "0", PARENTAL, [other("a", "2018-09-27", { mergeOrigin: "counterpart_side" }), other("b", "2018-09-27", { mergeOrigin: "counterpart_side", isLongTermRental: true })]),
        { counterpartHouseResidedTwoYears: "yes" },
      ),
      267_191_278,
      1,
    ],
  ] as const)("MU-2 %s → 새 고지 0건", async (_n, form, tax, own) => {
    const r = await runCalc(form);
    expect(r.issues).toEqual([]);
    expect(totalOf(r)).toBe(tax);
    expect(noticesOf(r)).toEqual([]);
    expect(ownOf(r)).toHaveLength(own);
  });
});

describe("Q-2 a — 겸용 자체 §154① 문장의 거주기간 표기", () => {
  it.each([
    ["G1 거주 0", sale(NC, "2022-10-01", "0"), "건물 보유기간 0년 11개월 · 거주기간 1년 미만 · 취득 당시 조정대상지역 미해당"],
    ["G4 강남 거주 23개월", sale(GANGNAM, "2020-06-01", "23"), "건물 보유기간 3년 3개월 · 거주기간 만 1년 · 취득 당시 조정대상지역 해당"],
  ] as const)("MU-3 %s → 자체 문장 1건 · 새 고지 0건", async (_n, form, prefix) => {
    const r = await runCalc(form);
    expect(noticesOf(r)).toEqual([]);
    const own = ownOf(r);
    expect(own).toHaveLength(1);
    expect(own[0].startsWith(prefix)).toBe(true);
  });
});

/**
 * 리뷰 게이트 BLOCK — 상속 취득 겸용은 보유 행을 싣지 않는다. 겸용 엔진은 피상속인과 동일세대로 보유한 기간(영 §154⑧3호)을
 * 통산할 입력을 받지 않아, 동일세대 상속에서도 보유 기산이 상속개시일로 잡힌다(일반 경로는 통산해 보유 충족).
 */
describe("리뷰 게이트 — 상속 취득 겸용", () => {
  const inherited = (same: boolean) =>
    redevAptForm({
      kind: "housing", price: "1000000000", count: "2", houses: [other("b", "2023-09-01")] as never,
      assetOver: {
        ...MIXED, regionCode: NC, fixedAcquisitionPrice: "600000000", residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [],
        acquisitionCause: "inheritance", acquisitionDate: "2022-10-01", inheritanceStartDate: "2022-10-01", inheritanceAssetKind: "house_individual",
        decedentSameHouseholdBeforeInheritance: same, decedentCohabitationHoldingStartDate: same ? "2015-01-01" : "", decedentAcquisitionDate: "2015-01-01",
      },
      formOver: { transferDate: "2023-09-18", filingDate: "2023-12-31", residencePeriodMonths: "0", ...TEMP("2023-09-01") } as never,
    });
  const ONE_YEAR = "종전주택 취득일부터 1년 이상 지난 뒤 신규주택 취득 미충족(종전주택 취득일 2022-10-01, 1년 경과일 2023-10-02, 신규주택 취득일 2023-09-01)";
  it("MU-4 동일세대 상속(동거 보유 2015-01-01부터 통산) · 일시적 2주택 1년 미경과 → 1년 행만 · 보유 행 없음(충족)", async () => {
    const r = await runCalc(inherited(true));
    expect(r.issues).toEqual([]);
    expect(exemptOf(r)).toBe(false);
    expect(noticesOf(r)).toEqual([`${T155}${ONE_YEAR}.`]);
  });
  it("MU-4b 별도세대 상속 · 일시적 2주택 1년 미경과 → 1년 행 + 보유 미충족 행(상속개시일 기산)", async () => {
    const r = await runCalc(inherited(false));
    expect(r.issues).toEqual([]);
    expect(exemptOf(r)).toBe(false);
    expect(noticesOf(r)).toEqual([
      `${T155}${ONE_YEAR} · 종전주택 보유기간 2년 이상 미충족(보유 기산일 2022-10-01, 보유기간 0년 11개월).`,
    ]);
  });
});

