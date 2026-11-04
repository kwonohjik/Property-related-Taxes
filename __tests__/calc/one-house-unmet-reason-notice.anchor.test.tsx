/**
 * anchor — 계산기에서 1주택 · 일시적 2주택 · 합가 비과세가 성립하지 않아 과세되면, 판정 메뉴의 요건 순차 검토(`requirementReview`)
 * 미충족 행을 결과 고지 1건으로 낸다(`docs/00-pm/one-house-154-1-unmet-reason-calc.plan.md` · Q-A2 · Q 전부 권장안).
 *
 * 종전: 결과 steps·warnings 어디에도 사유가 없었다(2026-11-04 실측 · mock 세율). 세액은 그대로다.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
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
const R = (m: string) => ({ residenceInputMode: "direct", residencePeriodMonthsAsset: m, residencePeriods: [] });
const other = (id: string, acq: string, o: object = {}) =>
  houseRow(id, acq, { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", ...o } as never);
const sale = (region: string, acq: string, resid: string, formOver: object = {}, houses: unknown[] = [], assetOver: object = {}) =>
  redevAptForm({
    kind: "housing", price: "1000000000", count: String(houses.length + 1), houses: houses as never,
    assetOver: { regionCode: region, acquisitionCause: "purchase", acquisitionDate: acq, fixedAcquisitionPrice: "600000000", ...R(resid), ...assetOver },
    formOver: {
      transferDate: "2023-09-18", filingDate: "2023-12-31", residencePeriodMonths: resid,
      ...(region === GANGNAM ? { isRegulatedArea: true, wasRegulatedAtAcquisition: true } : {}), ...formOver,
    } as never,
  });
const TEMP = (newAcq: string) => ({ temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: newAcq });
const PARENTAL = { parentalCareMergeDate: "2023-06-28", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const HEAD = /(?:1세대1주택 비과세|일시적 2주택 비과세 특례|동거봉양 합가 비과세 특례|혼인 합가 비과세 특례)\(.+?\)를 적용하지 않았습니다 — /;
const noticesOf = (r: Awaited<ReturnType<typeof runCalc>>) => ((r.result.warnings ?? []) as string[]).filter((w) => HEAD.test(w));

const RH0 = makeDefaultAsset(1).rentalHousingException;
const E1_RHE = {
  ...RH0, applyException: true, scenario: "A", priorRentalExemptionHistory: "none", counterpartHouseResidedTwoYears: "yes",
  rentalUnits: [{
    ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26",
    standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "48", requirementsConfirmed: true,
  }],
};
const E1 = sale(GANGNAM, "2022-10-01", "0", PARENTAL,
  [other("a", "2018-09-27", { mergeOrigin: "counterpart_side" }), other("b", "2018-09-27", { mergeOrigin: "counterpart_side", isLongTermRental: true })],
  { rentalHousingException: E1_RHE });
/** 완공APT(V-2) — 원조합원 취득 2017-09-01(조정) · 인가 2019-06-01 · 거주 0 · 12억 이하 */
const REDEV = redevAptForm({
  price: "1000000000",
  assetOver: { regionCode: GANGNAM, acquisitionDate: "2017-09-01", redevApprovalDate: "2019-06-01", ...R("0") },
  formOver: { transferDate: "2024-09-18", filingDate: "2024-12-31", residencePeriodMonths: "0", isRegulatedArea: true, wasRegulatedAtAcquisition: true } as never,
});

const H154 = "1세대1주택 비과세(소득세법 시행령 §154①)를 적용하지 않았습니다 — ";
const HOLD_11 = "보유기간 2년 이상 미충족(보유 기산일 2022-10-01, 보유기간 0년 11개월)";
const RESID = (m: number) => `거주기간 2년 이상(취득 당시 조정대상지역인 경우) 미충족(취득 당시 조정대상지역 해당, 거주기간 ${m}개월)`;

describe("과세 시 요건 검토 미충족 행 고지 — 1건 · 세액 불변", () => {
  it.each([
    ["G1 1주택 비조정 · 보유 11개월", sale(NC, "2022-10-01", "0"), 306_075_000, `${H154}${HOLD_11}.`],
    ["G2 1주택 강남 · 보유 3년 · 거주 0", sale(GANGNAM, "2020-06-01", "0"), 135_806_000, `${H154}${RESID(0)}.`],
    ["G3 1주택 강남 · 보유 11개월 · 거주 0", sale(GANGNAM, "2022-10-01", "0"), 306_075_000, `${H154}${HOLD_11} · ${RESID(0)}.`],
    ["G4 1주택 강남 · 보유 3년 · 거주 12", sale(GANGNAM, "2020-06-01", "12"), 135_806_000, `${H154}${RESID(12)}.`],
    [
      "T1 일시적 2주택 · 처분기한 경과",
      sale(NC, "2018-06-01", "0", TEMP("2020-01-02"), [other("b", "2020-01-02")]),
      128_766_000,
      "일시적 2주택 비과세 특례(소득세법 시행령 §155①)를 적용하지 않았습니다 — 신규주택 취득일부터 3년 이내 종전주택 양도 미충족" +
        "(신규주택 취득일 2020-01-02, 처분기한 2023-01-02, 양도(예정)일 2023-09-18).",
    ],
    [
      "T2 일시적 2주택 · 1년 미경과 · 보유 11개월",
      sale(NC, "2022-10-01", "0", TEMP("2023-09-01"), [other("b", "2023-09-01")]),
      306_075_000,
      "일시적 2주택 비과세 특례(소득세법 시행령 §155①)를 적용하지 않았습니다 — 종전주택 취득일부터 1년 이상 지난 뒤 신규주택 취득 미충족" +
        "(종전주택 취득일 2022-10-01, 1년 경과일 2023-10-02, 신규주택 취득일 2023-09-01) · 종전주택 보유기간 2년 이상 미충족(보유 기산일 2022-10-01, 보유기간 0년 11개월).",
    ],
    [
      "M1 동거봉양 합가 · 보유 11개월",
      sale(NC, "2022-10-01", "0", PARENTAL, [other("b", "2018-09-27", { mergeOrigin: "counterpart_side" })]),
      306_075_000,
      "동거봉양 합가 비과세 특례(소득세법 시행령 §155④)를 적용하지 않았습니다 — 양도주택 보유기간 2년 이상 미충족(보유 기산일 2022-10-01, 보유기간 0년 11개월).",
    ],
  ] as const)("UR-1 ★ %s", async (_n, form, tax, notice) => {
    const r = await runCalc(form);
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(tax);
    expect(noticesOf(r)).toEqual([notice]);
  });

  it("UR-2 완공APT(V-2) — 같은 고지 함수를 거쳐 고지가 실린다", async () => {
    const r = await runCalc(REDEV);
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(159_566_000);
    expect(noticesOf(r)).toEqual([`${H154}${RESID(0)}.`]);
  });
});

describe("짝 — 고지하지 않는 경우", () => {
  it.each([
    ["C1 비조정 · 보유 3년(비과세)", sale(NC, "2020-06-01", "0"), 0],
    ["C2 강남 · 보유 3년 · 거주 30(비과세)", sale(GANGNAM, "2020-06-01", "30"), 0],
    ["G5 2주택 · 특례 없음(검토 대상 아님)", sale(NC, "2020-06-01", "0", {}, [other("b", "2015-01-01")]), 135_806_000],
  ] as const)("UR-3 %s → 0건", async (_n, form, tax) => {
    const r = await runCalc(form);
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(tax);
    expect(noticesOf(r)).toEqual([]);
  });

  it("UR-4 합가 × ⑳ 0061 경로 미달(E1) — 그 고지만 내고 새 고지는 생략(Q-3 a)", async () => {
    const r = await runCalc(E1);
    expect(r.result.totalTax).toBe(306_075_000);
    expect(noticesOf(r)).toEqual([]);
    expect(((r.result.warnings ?? []) as string[]).filter((w) => w.includes("§155④로 판정했지만"))).toHaveLength(1);
  });
});

/**
 * 리뷰 게이트(2026-11-04) R1·R2 — 같은 원인을 앞선 고지가 이미 말했으면 빼고, 이미 지난 기한을 「…까지 양도하면」으로 제안하지 않는다.
 */
const CONFIRM = /^§155④⑤ 합가 특례 — 확인 필요: /;
const confirmsOf = (r: Awaited<ReturnType<typeof runCalc>>) => ((r.result.warnings ?? []) as string[]).filter((w) => CONFIRM.test(w));
describe("리뷰 게이트 R1·R2", () => {
  it.each([
    ["UR-5 합가 전 보유자 미선택", sale(NC, "2020-06-01", "0", PARENTAL, [other("b", "2018-09-27")])],
    ["UR-6 직계존속 연령 미선택", sale(NC, "2020-06-01", "0", { ...PARENTAL, parentalCareParentAge: "" }, [other("b", "2018-09-27", { mergeOrigin: "counterpart_side" })])],
  ] as const)("%s → 합가 확인 필요 고지 1건만 · 새 고지 0건", async (_n, form) => {
    const r = await runCalc(form);
    expect(r.result.totalTax).toBe(135_806_000);
    expect(confirmsOf(r)).toHaveLength(1);
    expect(noticesOf(r)).toEqual([]);
  });

  it("UR-7 합가 기한 경과 — 기한 행은 facts만 · 「…까지 양도하면」 없음", async () => {
    const r = await runCalc(sale(NC, "2010-01-01", "0", { ...PARENTAL, parentalCareMergeDate: "2012-06-01" }, [other("b", "2008-09-27", { mergeOrigin: "counterpart_side" })]));
    expect(r.issues).toEqual([]);
    expect(noticesOf(r)).toEqual([
      "동거봉양 합가 비과세 특례(소득세법 시행령 §155④)를 적용하지 않았습니다 — 합가일부터 10년 이내 양도 미충족" +
        "(합가일 2012-06-01, 기한 2022-06-02, 양도(예정)일 2023-09-18) — 역상 말일 2022-06-01이 토요일·공휴일이라 기한이 2022-06-02까지 늘어났습니다(국세기본법 §4 → 민법 §161).",
    ]);
  });
});

