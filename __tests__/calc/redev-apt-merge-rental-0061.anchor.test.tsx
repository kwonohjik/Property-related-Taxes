/**
 * anchor — 재개발·재건축 완공APT × §155④⑤ 합가 상대 쪽 임대(기준-2024-법규재산-0061).
 * 금액은 mock 세율. 대조는 같은 구성에서 임대 행을 뺀 완공APT 측정값이다.
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
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { runCalc, redevAptForm, houseRow, allIssues } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const GANGNAM = "1168010100";
const NC = "4682025021";
const RULING = "기준-2024-법규재산-0061";
const other = (id: string, o: object = {}) =>
  houseRow(id, "2018-09-27", { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", mergeOrigin: "counterpart_side", ...o } as never);
const PRICEY = { region: "capital", regionCode: GANGNAM, officialPrice: "400000000", isApartment: true };
const unit = () => ({
  ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26",
  standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct" as const, rentalMonths: "48", requirementsConfirmed: true,
});
const RHE = (answer: "" | "yes" | "no" = "yes") => ({ applyException: true, scenario: "A", rentalUnits: [unit()], priorRentalExemptionHistory: "none", counterpartHouseResidedTwoYears: answer });
const PARENTAL = { parentalCareMergeDate: "2023-06-28", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const MARRIAGE = { marriageDate: "2023-06-28", isFirstTransferredInMerge: true };
const R0 = { residenceInputMode: "direct", residencePeriods: [] };
const R30 = { residencePeriods: [{ moveInDate: "2019-08-08", moveOutDate: "2022-02-08" }] };
const A = other("a");
const B = other("b", { isLongTermRental: true });
const A4 = other("a", PRICEY);
const B4 = other("b", { ...PRICEY, isLongTermRental: true });

const SUCCESSOR = {
  acquisitionDate: "2017-03-01", fixedAcquisitionPrice: "500,000,000", redevApprovalDate: "2016-05-01", redevIsSuccessorMember: "yes", redevCompletionDate: "2020-06-30",
};

function form(o: { region?: string; res?: object; rhe?: object | null; merge?: object; price?: string; houses?: unknown[]; transfer?: string; asset?: object }) {
  const houses = (o.houses ?? [A, B]) as never[];
  const transfer = o.transfer ?? "2023-09-18";
  return redevAptForm({
    price: o.price ?? "1000000000",
    count: String(houses.length + 1),
    houses,
    assetOver: { regionCode: o.region ?? NC, ...(o.res ?? R0), ...(o.rhe === null ? {} : { rentalHousingException: o.rhe ?? RHE() }), ...(o.asset ?? {}) },
    formOver: { residencePeriodMonths: "0", transferDate: transfer, filingDate: `${transfer.slice(0, 4)}-12-31`, ...(o.merge ?? PARENTAL) } as never,
  } as never);
}
const tax = async (o: Parameters<typeof form>[0]) => (await runCalc(form(o))).result.totalTax;
const warn = (r: { result: { warnings?: string[] } }) => (r.result.warnings ?? []).join("\n");

describe("성립 — 임대를 뺀 합가 의제와 같다", () => {
  it("RM-1 ★ 비조정 10억 거주 0 → ⑧ 통과 · 비과세 · 근거 고지", async () => {
    const f = form({});
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.result.totalTax).toBe(0);
    expect(warn(r)).toContain(RULING);
    expect(await tax({ houses: [A], rhe: null })).toBe(0);
  });
  it("RM-2 혼인 합가 → 0 · 확인 필요 고지", async () => {
    const r = await runCalc(form({ merge: MARRIAGE }));
    expect(r.result.totalTax).toBe(0);
    expect(warn(r)).toContain("확인 필요");
  });
  it("RM-3 ★ 비조정 20억 → 12억 안분이 임대 없는 완공APT와 같다", async () => {
    const carved = await tax({ price: "2000000000" });
    expect(carved).toBeGreaterThan(0);
    expect(carved).toBe(await tax({ price: "2000000000", houses: [A], rhe: null }));
  });
  it("RM-4 강남 조정 취득 · 거주 30 → 임대 없는 완공APT와 같다", async () => {
    const asset = { acquisitionDate: "2018-01-01", redevApprovalDate: "2019-06-01" };
    expect(await tax({ region: GANGNAM, res: R30, asset })).toBe(0);
    expect(await tax({ region: GANGNAM, res: R30, asset, houses: [A], rhe: null })).toBe(0);
    expect(await tax({ region: GANGNAM, asset })).toBeGreaterThan(0);
  });
  it("RM-5 승계조합원 → 판정 번역을 거쳐 임대 없는 완공APT와 같다", async () => {
    const asset = SUCCESSOR;
    const carved = await runCalc(form({ price: "2000000000", asset }));
    expect(carved.status).toBe(200);
    expect(warn(carved)).toContain(RULING);
    expect(carved.result.totalTax).toBe(await tax({ price: "2000000000", asset, houses: [A], rhe: null }));
  });
});

describe("§154① 거주는 남는다 · 중과 주택 수는 그대로", () => {
  const asset = { acquisitionDate: "2018-01-01", redevApprovalDate: "2019-06-01" }; // 취득 당시 조정대상지역
  const late = { region: GANGNAM, price: "2000000000", transfer: "2026-06-18", houses: [A4, B4], asset };
  it("RM-6 ★ 강남 거주 0 · 2026-06 → 3주택 중과 · 근거 고지", async () => {
    const r = await runCalc(form(late));
    expect(r.result.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
    expect(r.result.multiHouseSurchargeEvaluation?.effectiveHouseCount).toBe(3);
    expect(warn(r)).toContain("3주택으로 보고 중과세율을 적용했습니다");
    expect(warn(r)).toContain("§167의3①13호의 중과 배제를 받지 못합니다");
  });
  it("RM-7 ★ 강남 거주 30 · 2026-06 → 13호로 중과 배제 · 고지 없음", async () => {
    const r = await runCalc(form({ ...late, res: R30 }));
    expect(r.result.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    expect(warn(r)).not.toContain("중과 판정의 주택 수는");
    expect(r.result.totalTax).toBe(await tax({ ...late, res: R30, houses: [A4], rhe: null }));
  });
  it("RM-7a ⑳ 미선언 중과 → 이 경로가 아니라 중과 고지 없음", async () => {
    const r = await runCalc(form({ ...late, rhe: null }));
    expect(r.result.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
    expect(warn(r)).not.toContain("중과 판정의 주택 수는");
  });
  it("RM-8 2026-05-08 → 한시 배제 · 고지 없음", async () => {
    const r = await runCalc(form({ ...late, transfer: "2026-05-08" }));
    expect(r.result.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    expect(warn(r)).not.toContain("중과 판정의 주택 수는");
  });
});

describe("이 경로가 아닌 입력", () => {
  it("RM-9 ★ 상대 쪽 거주 미답 → ⑧이 문항으로 보낸다", () => {
    expect(allIssues(form({ rhe: RHE("") })).map((i) => i.field)).toContain("rentalHousingException.counterpartHouseResidedTwoYears");
  });
  it("RM-10 「아니오」 → ⑧ 거주 2년 · 엔진은 ⑳ 불성립 과세", async () => {
    const f = form({ rhe: RHE("no") });
    expect(allIssues(f).map((i) => i.field)).toContain("residencePeriods");
    expect((await runCalc(f)).result.totalTax).toBeGreaterThan(0);
  });
  it("RM-11 ⑳ 미선언 · 거주 요건 충족 → 입력 안내", async () => {
    const r = await runCalc(form({ rhe: null, region: GANGNAM, res: R30 }));
    expect(r.result.totalTax).toBeGreaterThan(0);
    expect(warn(r)).toContain("장기임대주택 특례(소득세법 시행령 §155⑳)를 선언해 임대 요건을 입력하세요");
  });
  it("RM-11a ⑳ 미선언 · 승계조합원 준공 후 2년 미만 → 판정 번역 기준 보유 미달이라 입력 안내 없음", async () => {
    const r = await runCalc(form({ rhe: null, asset: { ...SUCCESSOR, redevCompletionDate: "2022-06-30" } }));
    expect(r.status).toBe(200);
    expect(warn(r)).not.toContain("선언해 임대 요건을 입력하세요");
  });
  it("RM-12 ★ 청산금 수령 단독신고 → 이 경로를 열지 않는다(엔진 · ⑧)", async () => {
    const asset = { redevSettlementDirection: "receive", redevReceiveOnlyMode: "yes", redevSettlementSaleDate: "2023-09-18", redevSettlementAmount: "50000000", redevExemptionEligibleAtApproval: "yes" };
    expect(allIssues(form({ asset, rhe: RHE("") })).map((i) => i.field)).not.toContain("rentalHousingException.counterpartHouseResidedTwoYears");
    const yes = await runCalc(form({ asset, price: "2000000000" }));
    expect(yes.status).toBe(200);
    expect(warn(yes)).not.toContain(RULING);
    // 「예」가 경로를 열면 임대가 빠져 청산금분 판정 축이 달라진다 — 「아니오」(이 경로 없음)와 세액이 같아야 한다.
    expect(yes.result.totalTax).toBe(await tax({ asset, price: "2000000000", rhe: RHE("no") }));
  });
  it("RM-13 임대 2채 → 열지 않는다", async () => {
    const r = await runCalc(form({ houses: [A, B, other("c", { isLongTermRental: true })] }));
    expect(warn(r)).not.toContain(RULING);
    expect(r.result.totalTax).toBeGreaterThan(0);
  });
});
