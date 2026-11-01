/**
 * anchor — §155④⑤ 합가 × §155⑳ 장기임대: 임대주택이 합가 상대 쪽일 때 양도자 쪽 주택 (V-9)
 * `docs/00-pm/parental-merge-rental-155-20.plan.md` · 사용자 결정 2026-11-01 Q-1 (a)·Q-2 (b)·Q-3 (a)·Q-4 (a)·Q-5 (a) · 생애 1회는 보지 않는다.
 *
 * 근거: 기준-2024-법규재산-0061(법규과-2152, 2026.8.20.) 「…자녀 소유 주택을 양도하는 경우 제155조제20항제1호의 거주요건을 적용받지 않는 것」.
 * 금액은 mock 세율. 시료는 회신 사실: 子 2019-08-08 취득 · 합가 2023-06-28 · 양도 2023-09-18 · 父 거주주택·장기임대(경남 비조정).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { mergeRentalState } from "@/lib/calc/merge-rental-carveout-form";
import { runCalc, redevAptForm, houseRow, allIssues } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GANGNAM = "1168010100";
const NC = "4682025021";
const TAXED = 172_766_000;
const RULING = "기준-2024-법규재산-0061";
const other = (id: string, acq: string, o: object = {}) =>
  houseRow(id, acq, { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", ...o } as never);
const unit = (o: object = {}) => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2019-09-26",
  rentalRegistrationDate: "2019-09-26",
  standardPriceAtRentalStart: "250,000,000",
  rentalInputMode: "direct" as const,
  rentalMonths: "48",
  requirementsConfirmed: true,
  ...o,
});
const RHE = (answer: "" | "yes" | "no" = "yes", o: object = {}) => ({
  applyException: true, scenario: "A", rentalUnits: [unit()], priorRentalExemptionHistory: "none", counterpartHouseResidedTwoYears: answer, ...o,
});
const PARENTAL = { parentalCareMergeDate: "2023-06-28", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const MARRIAGE = { marriageDate: "2023-06-28", isFirstTransferredInMerge: true };
const A_ROW = other("a", "2018-09-27", { mergeOrigin: "counterpart_side" });
const B_ROW = other("b", "2018-09-27", { mergeOrigin: "counterpart_side", isLongTermRental: true });
const R0 = { residenceInputMode: "direct", residencePeriods: [] };
const R30 = { residencePeriods: [{ moveInDate: "2019-08-08", moveOutDate: "2022-02-08" }] };

function form(o: { region?: string; res?: object; rhe?: object | null; merge?: object; price?: string; houses?: ReturnType<typeof other>[]; f?: object; transfer?: string; acq?: string }) {
  const houses = o.houses ?? [A_ROW, B_ROW];
  const transfer = o.transfer ?? "2023-09-18";
  return redevAptForm({
    kind: "housing",
    price: o.price ?? "1000000000",
    count: String(houses.length + 1),
    houses,
    assetOver: {
      acquisitionDate: o.acq ?? "2019-08-08",
      regionCode: o.region ?? NC,
      ...(o.res ?? R0),
      ...(o.rhe === null ? {} : { rentalHousingException: o.rhe ?? RHE() }),
    },
    formOver: { residencePeriodMonths: "0", transferDate: transfer, filingDate: `${transfer.slice(0, 4)}-12-31`, ...(o.merge ?? PARENTAL), ...(o.f ?? {}) } as never,
  });
}
const w = (r: { warnings?: string[] }) => (r.warnings ?? []).join("\n");
const F4 = (answer = "yes") => ({
  provisoReason: "rental_registration_4ho", proviso4hoBusinessRegDate: "2019-08-30", proviso4hoRentalRegDate: "2019-08-30",
  proviso4hoRegulatedOneHouse: answer, proviso4hoStatus: "voluntary_cancelled",
});

describe("성립 — 임대 행을 빼고 §155④", () => {
  it("MR-1 ★ 비조정 · 거주 0 → ⑧ 0건 · 비과세 · 사유 §155④ · ⑳ 경로 아님 · 0061 고지", async () => {
    const f = form({});
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toContain("동거봉양 합가 (§155④)");
    expect(r.result.rentalHousingExceptionDetail).toBeUndefined();
    expect(w(r.result)).toContain(RULING);
    expect(w(r.result)).not.toContain("정면 회신은 확인하지 못해");
  });
  it("MR-2 15억 · 거주 0 → 12억 안분 + 표1 53,933,000 (⑳ 경로의 표2가 아니다)", async () => {
    const r = await runCalc(form({ price: "1500000000" }));
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(53_933_000);
  });
  it("MR-3 15억 · 거주 30 → 40,573,500", async () => {
    const r = await runCalc(form({ price: "1500000000", res: R30 }));
    expect(r.result.totalTax).toBe(40_573_500);
    expect(r.result.exemptReason).toContain("§155④");
  });
  it("MR-4 생애 1회 이력이 「있음」이어도 이 경로는 보지 않는다", async () => {
    const r = await runCalc(form({ rhe: RHE("yes", { priorRentalExemptionHistory: "used" }) }));
    expect(r.result.totalTax).toBe(0);
  });
});

describe("§154①은 그대로 — 강남(취득 당시 조정)", () => {
  it("MR-5 거주 0 → 과세 · 거주 30 → 비과세 §155④", async () => {
    const zero = await runCalc(form({ region: GANGNAM }));
    expect(zero.result.isExempt).toBe(false);
    expect(zero.result.totalTax).toBe(TAXED);
    expect(w(zero.result)).not.toContain(RULING + ")");
    const lived = await runCalc(form({ region: GANGNAM, res: R30 }));
    expect(lived.result.totalTax).toBe(0);
    expect(lived.result.exemptReason).toContain("§155④");
  });
  it("MR-6 ★ 삭제 전 4호 완비 → 0 · 0061 / 신청 당시 「아니오」 → 과세", async () => {
    const yes = await runCalc(form({ region: GANGNAM, f: F4() }));
    expect(yes.issues).toEqual([]);
    expect(yes.result.totalTax).toBe(0);
    expect(yes.result.exemptReason).toContain("§154① 단서 4호");
    expect(w(yes.result)).toContain(RULING);
    const no = await runCalc(form({ region: GANGNAM, f: F4("no") }));
    expect(no.result.totalTax).toBe(TAXED);
  });
  it("MR-7 2026-06 양도 · 4호 완비 → 중과 배제 / 4호 없음 → 중과", async () => {
    const late = { region: GANGNAM, transfer: "2026-06-01", houses: [other("a", "2018-09-27", { mergeOrigin: "counterpart_side", officialPrice: "400000000" }), other("b", "2018-09-27", { mergeOrigin: "counterpart_side", isLongTermRental: true, officialPrice: "400000000" })], price: "1500000000" };
    const merge = { ...PARENTAL, parentalCareMergeDate: "2023-06-28" };
    const yes = await runCalc(form({ ...late, merge, f: F4() }));
    expect(yes.result.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    const none = await runCalc(form({ ...late, merge }));
    expect(none.result.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
    expect(none.result.totalTax).toBeGreaterThan(yes.result.totalTax);
  });
});

describe("불성립 — 현행 유지", () => {
  it("MR-8 ⑳ 미선언 → 과세 + 입력 안내(Q-3 a) · 안내는 결론을 가를 때만", async () => {
    const r = await runCalc(form({ rhe: null }));
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(TAXED);
    expect(w(r.result)).toContain("장기임대주택 특례");
    expect(w(r.result)).toContain(RULING);
    const gangnam = await runCalc(form({ rhe: null, region: GANGNAM }));
    expect(w(gangnam.result)).not.toContain(RULING);
  });
  it("MR-9 상대 쪽 거주 미선택 → ⑧이 그 칸으로 안내 · 엔진 불성립(Q-5 a)", async () => {
    const f = form({ rhe: RHE("") });
    const issues = allIssues(f);
    expect(issues.some((i) => i.field === "rentalHousingException.counterpartHouseResidedTwoYears")).toBe(true);
    expect((await runCalc(f)).result.totalTax).toBe(TAXED);
  });
  it("MR-10 「아니오」 → ⑧ 거주 2년 · 과세", async () => {
    const f = form({ rhe: RHE("no") });
    expect(allIssues(f).some((i) => i.field === "residencePeriods")).toBe(true);
    expect((await runCalc(f)).result.totalTax).toBe(TAXED);
  });
  it.each([
    ["임대가 양도자 쪽", [A_ROW, other("b", "2018-09-27", { mergeOrigin: "seller_side", isLongTermRental: true })]],
    ["임대 2채(Q-1 a · 0598 · 2020구단76589)", [A_ROW, B_ROW, other("b2", "2018-09-27", { mergeOrigin: "counterpart_side", isLongTermRental: true })]],
  ])("MR-11 %s → ⑧ 거주 2년 그대로 · 0061 고지 없음", async (_l, houses) => {
    const f = form({ houses });
    expect(allIssues(f).some((i) => i.field === "residencePeriods")).toBe(true);
    const r = await runCalc(f);
    expect(r.result.isExempt).not.toBe(true);
    expect(w(r.result)).not.toContain(RULING);
  });
  it("MR-11′ 임대 1채 + 양도 주택뿐(2주택) · 합가 후 취득 임대(일시적 2주택 중첩) — 다른 경로 · 이 경로 표식 없음", async () => {
    for (const houses of [[B_ROW], [A_ROW, other("b", "2023-08-01", { mergeOrigin: "counterpart_side", isLongTermRental: true })]]) {
      const r = await runCalc(form({ houses }));
      expect(w(r.result)).not.toContain(RULING);
    }
  });
  it("MR-12 임대 호 요건 미충족 → 과세", async () => {
    const r = await runCalc(form({ rhe: RHE("yes", { rentalUnits: [unit({ rentalMonths: "6", requirementsConfirmed: false })] }) }));
    expect(r.result.isExempt).not.toBe(true);
    expect(r.result.totalTax).toBe(TAXED);
  });
  it("MR-13 합가 10년 경과 → 성립 안 함", async () => {
    const r = await runCalc(form({ merge: { ...PARENTAL, parentalCareMergeDate: "2010-01-01" }, acq: "2005-01-01", houses: [other("a", "2005-01-01", { mergeOrigin: "counterpart_side" }), other("b", "2005-01-01", { mergeOrigin: "counterpart_side", isLongTermRental: true })] }));
    expect(w(r.result)).not.toContain(RULING);
  });
  it("MR-14 임대 보유 쪽 거주주택(상대 쪽이 일반주택) — ⑳1호 2년 유지", async () => {
    const seller = [A_ROW, other("b", "2018-09-27", { mergeOrigin: "seller_side", isLongTermRental: true })];
    const lived = await runCalc(form({ houses: seller, res: R30 }));
    expect(lived.result.totalTax).toBe(0);
    expect(lived.result.rentalHousingExceptionDetail?.applied).toBe(true);
  });
});

describe("혼인(⑤) 대칭 — Q-2 (b)", () => {
  it("MR-15 비과세 · 정면 회신 미확보 고지", async () => {
    const f = form({ merge: MARRIAGE });
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.exemptReason).toContain("혼인 합가 (§155⑤)");
    expect(w(r.result)).toContain("정면 회신은 확인하지 못해");
  });
});

describe("판정 메뉴 route — 같은 판정", () => {
  const judge = async (rhe: object, houses: object[]) => {
    const { runOneHouseJudgmentPipeline } = await import("@/app/api/calc/one-house-exemption/judgment-pipeline");
    const { parseRatesFromMap } = await import("@/lib/tax-engine/transfer-tax-helpers");
    const { baseTransferInput } = await import("../tax-engine/_helpers/mock-rates");
    const D = (x: string) => new Date(x);
    const input = baseTransferInput({
      propertyType: "housing", acquisitionDate: D("2019-08-08"), transferDate: D("2023-09-18"), transferPrice: 1_000_000_000, residencePeriodMonths: 0,
      isOneHousehold: true, householdHousingCount: houses.length, sellingHouseId: "selling", houses,
      parentalCareMerge: { mergeDate: D("2023-06-28"), parentAge: "over_60" }, isFirstTransferredInMerge: true, regionCode: NC,
      rentalHousingException: rhe,
    } as never);
    return runOneHouseJudgmentPipeline(input, parseRatesFromMap(makeMockRates()), D("2023-09-18"), false).judgment;
  };
  const row = (id: string, o: object = {}) => ({ id, acquisitionDate: new Date("2018-09-27"), officialPrice: 1e8, region: "non_capital", isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false, ...o });
  const SELL = { ...row("selling"), acquisitionDate: new Date("2019-08-08") };
  const u = (o: object = {}) => ({
    businessRegistrationDate: new Date("2019-09-26"), rentalRegistrationDate: new Date("2019-09-26"), rentalCategory: "long_general", rentalAcquisitionType: "purchase",
    isApartment: false, region: "non_capital", standardPriceAtRentalStart: 250_000_000, acquisitionOfficialPrice: 250_000_000, isNationalSizeHousing: true, hasMinimum2Units: true, rentalMonths: 66, requirementsConfirmed: true, rentalAutoTermination: false, ...o,
  });
  const E = (o: object = {}, unitO: object = {}) => ({ applyException: true, scenario: "A", rentalUnits: [u(unitO)], priorRentalExemptionHistory: "none", counterpartHouseResidedTwoYears: true, ...o });
  it("MR-18 명부 밖 임대 + 상대 쪽 선택 → 비과세 · 0061 확인 사항 / 양도자 쪽 → 과세", async () => {
    const yes = await judge(E({}, { mergeOrigin: "counterpart_side" }), [SELL, row("a", { mergeOrigin: "counterpart_side" })]);
    expect(yes.isExempt).toBe(true);
    expect(yes.undetermined.map((x: { reason: string }) => x.reason).join()).toContain(RULING);
    const no = await judge(E({}, { mergeOrigin: "seller_side" }), [SELL, row("a", { mergeOrigin: "counterpart_side" })]);
    expect(no.isExempt).toBe(false);
  });
  it("MR-19 명부 임대 행 → 비과세 / 문항 미선택 → 과세", async () => {
    const houses = [SELL, row("a", { mergeOrigin: "counterpart_side" }), row("b", { mergeOrigin: "counterpart_side", isLongTermRental: true })];
    expect((await judge(E(), houses)).isExempt).toBe(true);
    expect((await judge(E({ counterpartHouseResidedTwoYears: undefined }), houses)).isExempt).toBe(false);
  });
});

describe("leaf 경계 — withMergeRentalCarveout", () => {
  const D = (x: string) => new Date(x);
  const row = (id: string, o: object = {}) => ({ id, acquisitionDate: D("2018-09-27"), officialPrice: 1e8, region: "non_capital", isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false, ...o });
  const SELL = { ...row("selling"), acquisitionDate: D("2019-08-08") };
  const CP = { mergeOrigin: "counterpart_side" };
  const U = (o: object = {}) => ({
    businessRegistrationDate: D("2019-09-26"), rentalRegistrationDate: D("2019-09-26"), rentalCategory: "long_general", rentalAcquisitionType: "purchase",
    isApartment: false, region: "non_capital", standardPriceAtRentalStart: 250_000_000, acquisitionOfficialPrice: 250_000_000, isNationalSizeHousing: true, hasMinimum2Units: true, rentalMonths: 66, requirementsConfirmed: true, rentalAutoTermination: false, ...o,
  });
  const input = async (o: object = {}, rhe: object = {}) => {
    const { baseTransferInput } = await import("../tax-engine/_helpers/mock-rates");
    return baseTransferInput({
      propertyType: "housing", acquisitionDate: D("2019-08-08"), transferDate: D("2023-09-18"), transferPrice: 1_000_000_000, residencePeriodMonths: 0,
      isOneHousehold: true, householdHousingCount: 3, sellingHouseId: "selling",
      houses: [SELL, row("a", CP), row("b", { ...CP, isLongTermRental: true })],
      parentalCareMerge: { mergeDate: D("2023-06-28"), parentAge: "over_60" }, isFirstTransferredInMerge: true, regionCode: NC,
      rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [U()], priorRentalExemptionHistory: "none", counterpartHouseResidedTwoYears: true, ...rhe },
      ...o,
    } as never);
  };
  const applied = async (o: object = {}, rhe: object = {}) => {
    const { withMergeRentalCarveout } = await import("@/lib/tax-engine/one-house/merge-rental-carveout");
    return withMergeRentalCarveout(await input(o, rhe)).mergeRentalCarveout;
  };
  it("MR-20 성립 — 표식에 임대 행 id, ⑳ 선언을 걷는다", async () => {
    const { withMergeRentalCarveout } = await import("@/lib/tax-engine/one-house/merge-rental-carveout");
    const r = withMergeRentalCarveout(await input());
    expect(r.mergeRentalCarveout).toEqual({ rentalRowId: "b" });
    expect(r.rentalHousingException).toBeUndefined();
  });
  it.each([
    ["임대 2채 + 카드에 상대 쪽(Q-1 a)", { householdHousingCount: 4, houses: [SELL, row("a", CP), row("b", { ...CP, isLongTermRental: true }), row("c", { ...CP, isLongTermRental: true })] }, { rentalUnits: [U({ mergeOrigin: "counterpart_side" })] }],
    ["그 밖의 주택이 양도자 쪽", { houses: [SELL, row("a", { mergeOrigin: "seller_side" }), row("b", { ...CP, isLongTermRental: true })] }, {}],
    ["이중 합가", { marriageMerge: { marriageDate: D("2023-01-01") } }, {}],
    ["시나리오 B", {}, { scenario: "B" }],
    ["주택 수가 명부와 다름", { householdHousingCount: 4 }, {}],
    ["「먼저 양도」 미선언 — 의제 불성립", { isFirstTransferredInMerge: false }, {}],
    ["연령 미해당 — 의제 불성립", { parentalCareMerge: { mergeDate: D("2023-06-28"), parentAge: "none" } }, {}],
    ["3중첩 — 조특법 제외가 겹침(4283)", { specialHouseExclusions: [{ article: "unsold_98_8", houseContractDate: D("2015-06-01"), requirementsConfirmed: true }] }, {}],
  ])("MR-21 %s → 불성립", async (_l, o, rhe) => {
    expect(await applied(o, rhe)).toBeUndefined();
  });
});

describe("⑤ 화면", () => {
  const section = (state: "waived" | "unanswered" | undefined) =>
    render(
      <RentalHousingExceptionSection
        mode="facts"
        rh={RHE(state === "waived" ? "yes" : "") as never}
        asset={makeDefaultAsset(1)}
        acquisitionDate="2019-08-08"
        transferDate="2023-09-18"
        onChange={() => {}}
        mergeRental={state}
      />,
    );
  it("MR-16 이 경로일 때만 문항 · 「예」면 거주 2년을 미충족으로 표시하지 않는다", () => {
    section(undefined);
    expect(screen.queryByTestId("rental-counterpart-resided-hint")).toBeNull();
    cleanup();
    const un = section("unanswered");
    expect(screen.getByTestId("rental-counterpart-resided-hint").textContent).toContain(RULING);
    expect(un.container.textContent).toContain("✗ 미충족 — 현재 0개월");
    cleanup();
    const yes = section("waived");
    expect(yes.container.textContent).toContain("합가 상대 쪽 임대 경로라 적용하지 않음");
    expect(yes.container.textContent).not.toContain("✗ 미충족 — 현재 0개월");
  });
  it("MR-17 상태 술어 — 엔진 구성 leaf와 같은 경계", () => {
    expect(mergeRentalState(form({}))).toBe("waived");
    expect(mergeRentalState(form({ rhe: RHE("") }))).toBe("unanswered");
    expect(mergeRentalState(form({ rhe: RHE("no") }))).toBe("declined");
    expect(mergeRentalState(form({ rhe: null }))).toBeUndefined();
    expect(mergeRentalState(form({ houses: [A_ROW, other("b", "2018-09-27", { mergeOrigin: "seller_side", isLongTermRental: true })] }))).toBeUndefined();
    expect(mergeRentalState(form({ merge: { ...PARENTAL, ...MARRIAGE } }))).toBeUndefined();
    expect(mergeRentalState(form({ houses: [other("a", "2018-09-27", { mergeOrigin: "seller_side" }), B_ROW] }))).toBeUndefined();
  });
});
