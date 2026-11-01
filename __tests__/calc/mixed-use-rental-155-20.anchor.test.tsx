/**
 * anchor — 겸용주택 × §155⑳ 거주주택 · §155④⑤ 합가 상대 쪽 임대 (`docs/00-pm/mixed-use-rental-155-20.plan.md`)
 * 금액은 mock 세율. 대조는 같은 구성의 일반 주택과 「임대 행을 뺀 겸용」 측정값.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
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
import { MIXED_USE_RENTAL_B_UNSUPPORTED } from "@/lib/tax-engine/transfer-tax-mixed-use-rental-residence-message";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(cleanup);

const GANGNAM = "1168010100";
const NC = "4682025021";
const TAXED = 172_766_000;
const other = (id: string, acq: string, o: object = {}) =>
  houseRow(id, acq, { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", ...o } as never);
const PRICEY = { region: "capital", regionCode: GANGNAM, officialPrice: "400000000", isApartment: true };
const unit = (o: object = {}) => ({
  ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26",
  standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct" as const, rentalMonths: "48", requirementsConfirmed: true, ...o,
});
const RHE = (o: object = {}) => ({ applyException: true, scenario: "A", rentalUnits: [unit()], priorRentalExemptionHistory: "none", counterpartHouseResidedTwoYears: "", ...o });
const CARVE = RHE({ counterpartHouseResidedTwoYears: "yes" });
const PARENTAL = { parentalCareMergeDate: "2023-06-28", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const LATE = { ...PARENTAL, parentalCareMergeDate: "2025-06-28" };
const MARRIAGE = { marriageDate: "2023-06-28", isFirstTransferredInMerge: true };
const A = other("a", "2018-09-27", { mergeOrigin: "counterpart_side" });
const B = other("b", "2018-09-27", { mergeOrigin: "counterpart_side", isLongTermRental: true });
const R = other("r", "2018-09-27", { isLongTermRental: true });
const R0 = { residenceInputMode: "direct", residencePeriods: [] };
const R30 = { residencePeriods: [{ moveInDate: "2019-08-08", moveOutDate: "2022-02-08" }] };
const MIXED = {
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};
const BIG = { mixedTransferHousingPrice: "1500000000" };
const SMALL = { residentialFloorArea: "60", nonResidentialFloorArea: "100" };

function form(o: { mixed?: boolean; region?: string; res?: object; rhe?: object | null; merge?: object; houses?: unknown[]; transfer?: string; extra?: object; price?: string; count?: string }) {
  const houses = (o.houses ?? []) as never[];
  const transfer = o.transfer ?? "2023-09-18";
  return redevAptForm({
    kind: "housing",
    price: o.price ?? "1000000000",
    count: o.count ?? String(houses.length + 1),
    houses,
    assetOver: {
      acquisitionDate: "2019-08-08",
      regionCode: o.region ?? NC,
      ...(o.res ?? R0),
      ...(o.rhe === null ? {} : { rentalHousingException: o.rhe ?? RHE() }),
      ...(o.mixed === false ? {} : MIXED),
      ...(o.extra ?? {}),
    },
    formOver: { residencePeriodMonths: "0", transferDate: transfer, filingDate: `${transfer.slice(0, 4)}-12-31`, ...(o.merge ?? {}) } as never,
  });
}
const payable = (r: { result: { total: { totalPayable: number } } }) => r.result.total.totalPayable;
const w = (r: { result: { warnings?: string[] } }) => (r.result.warnings ?? []).join("\n");

describe("⑳ 거주주택 — 겸용을 거주주택으로", () => {
  it("MX-1 ★ 임대 1채(명부) · 거주 30 → 일반 주택과 같은 0 · 근거 고지", async () => {
    const f = form({ res: R30, houses: [R] });
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.result.housingPart.isExempt).toBe(true);
    expect(payable(r)).toBe(0);
    expect(w(r)).toContain("겸용주택의 주택 부분을 거주주택으로");
    expect((await runCalc(form({ mixed: false, res: R30, houses: [R] }))).result.totalTax).toBe(0);
  });
  it("MX-2 임대를 카드로만(명부 없음 · 주택 수 1) · 거주 30 → 0", async () => {
    const r = await runCalc(form({ res: R30 }));
    expect(payable(r)).toBe(0);
    expect(w(r)).toContain("겸용주택의 주택 부분을 거주주택으로");
  });
  it("MX-3 ★ 거주 0 → 불성립 — 카드만이어도 임대를 주택 수에 되돌려 과세(종전 침묵 비과세)", async () => {
    const r = await runCalc(form({}));
    expect(r.result.housingPart.isExempt).toBe(false);
    expect(payable(r)).toBe(TAXED);
    expect(w(r)).toContain("특례(소득세법 시행령 §155⑳)를 적용하지 않았습니다");
  });
  it("MX-4 거주 0 · 명부 임대 → 과세 · 불성립 고지", async () => {
    const r = await runCalc(form({ houses: [R] }));
    expect(payable(r)).toBe(TAXED);
    expect(w(r)).toContain("를 적용하지 않았습니다");
  });
  it("MX-5 주택 ≤ 상가 · 거주 30 → 주택 부분만 비과세, 상가분 과세", async () => {
    const r = await runCalc(form({ res: R30, houses: [R], extra: SMALL }));
    expect(r.result.housingPart.isExempt).toBe(true);
    expect(payable(r)).toBeGreaterThan(0);
    const plain = await runCalc(form({ res: R30, rhe: null, extra: SMALL }));
    expect(payable(r)).toBe(payable(plain));
  });
  it("MX-6 12억 초과 · 거주 30 → 임대 없는 1주택 겸용과 같은 세액", async () => {
    const r = await runCalc(form({ res: R30, houses: [R], price: "2000000000", extra: BIG }));
    const plain = await runCalc(form({ res: R30, rhe: null, price: "2000000000", extra: BIG }));
    expect(payable(r)).toBe(payable(plain));
    expect(r.result.housingPart.longTermDeductionTable).toBe(2);
  });
  it("MX-7 ★ 강남 2026-06 · 거주 30 · 임대(4억) → 중과 배제 — 임대 없는 1주택과 같은 세액", async () => {
    const opt = { region: GANGNAM, res: R30, price: "2000000000", extra: BIG, transfer: "2026-06-01" };
    const r = await runCalc(form({ ...opt, houses: [{ ...R, ...PRICEY }] }));
    expect(r.result.multiHouseSurcharge.surchargeApplicable).toBe(false);
    expect(payable(r)).toBe(payable(await runCalc(form({ ...opt, rhe: null }))));
  });
  it("MX-8 불성립 · 강남 2026-06 · 명부 임대 + 다른 주택 2채 → 3중첩 불성립 · 과세", async () => {
    const r = await runCalc(form({ res: R30, houses: [R, other("x", "2018-01-01"), other("y", "2018-01-02")] }));
    expect(r.result.housingPart.isExempt).toBe(false);
    expect(w(r)).toContain("를 적용하지 않았습니다");
  });
  it("MX-17 명부 없음 · 주택 수 2 · 강남 2026-06 · 거주 30 → 원시 플래그로 중과하지 않는다", async () => {
    const opt = { region: GANGNAM, res: R30, price: "2000000000", extra: BIG, transfer: "2026-06-01" };
    const r = await runCalc(form({ ...opt, count: "2" }));
    expect(r.result.housingPart.isExempt).toBe(false);
    expect(r.result.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    expect(payable(r)).toBe(payable(await runCalc(form({ ...opt, rhe: null }))));
  });
  it("MX-18 불성립 · 카드만 · 강남 2026-06 · 거주 0 → 임대를 더한 2주택으로 판정 · 일반 주택과 같은 중과 결론", async () => {
    const opt = { region: GANGNAM, price: "2000000000", transfer: "2026-06-01" };
    const r = await runCalc(form({ ...opt, extra: BIG }));
    const plain = await runCalc(form({ ...opt, mixed: false }));
    expect(r.result.housingPart.isExempt).toBe(false);
    expect(r.result.multiHouseSurcharge.rawHouseCount).toBe(2);
    expect(r.result.multiHouseSurcharge.surchargeType).toBe("none");
    expect(payable(r)).toBe(579_628_500);
    expect(plain.result.totalTax).toBe(579_628_500);
  });
  it("MX-9 ★ B는 ⑧·⑫가 막는다", async () => {
    const f = form({ res: R30, rhe: RHE({ scenario: "B" }) });
    expect(JSON.stringify(allIssues(f))).toContain(MIXED_USE_RENTAL_B_UNSUPPORTED);
    const r = await runCalc(f);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain(MIXED_USE_RENTAL_B_UNSUPPORTED);
  });
  it("MX-19 ★ 1세대 아님 → ⑳ 미적용 · 과세", async () => {
    const r = await runCalc(form({ res: R30, houses: [R], merge: { isOneHousehold: false } }));
    expect(r.result.housingPart.isExempt).toBe(false);
    expect(w(r)).not.toContain("겸용주택의 주택 부분을 거주주택으로");
  });
  it("MX-20 ★ 불성립 + 임대 카드만 + 합가 [A] → 임대를 더해 3주택 — §155④ 의제가 서지 않는다(일반 주택과 같음)", async () => {
    const rhe = RHE({ rentalUnits: [unit({ requirementsConfirmed: false })] });
    const opt = { houses: [A], res: R30, merge: PARENTAL, rhe };
    const r = await runCalc(form(opt));
    expect(r.result.housingPart.isExempt).toBe(false);
    expect((await runCalc(form({ ...opt, mixed: false }))).result.isExempt).toBe(false);
    expect(payable(await runCalc(form({ houses: [A], res: R30, merge: PARENTAL, rhe: null })))).toBe(0);
  });
});

describe("§155④⑤ 합가 상대 쪽 임대 (0061)", () => {
  it("MX-10 ★ 비조정 거주 0 동거봉양 → 0 · 0061", async () => {
    const r = await runCalc(form({ houses: [A, B], rhe: CARVE, merge: PARENTAL }));
    expect(payable(r)).toBe(0);
    expect(w(r)).toContain("기준-2024-법규재산-0061");
  });
  it("MX-11 혼인 → 0 · 확인 필요", async () => {
    const r = await runCalc(form({ houses: [A, B], rhe: CARVE, merge: MARRIAGE }));
    expect(payable(r)).toBe(0);
    expect(w(r)).toContain("확인 필요");
  });
  it("MX-12 강남 거주 0 → §154① 그대로 과세 / 거주 30 → 0", async () => {
    const zero = await runCalc(form({ region: GANGNAM, houses: [A, B], rhe: CARVE, merge: PARENTAL }));
    expect(zero.result.housingPart.isExempt).toBe(false);
    expect(payable(zero)).toBe(TAXED);
    expect(payable(await runCalc(form({ region: GANGNAM, res: R30, houses: [A, B], rhe: CARVE, merge: PARENTAL })))).toBe(0);
  });
  it("MX-13 12억 초과 → 임대 행을 뺀 겸용과 같은 세액 181,050,279", async () => {
    const r = await runCalc(form({ houses: [A, B], rhe: CARVE, merge: PARENTAL, price: "2000000000", extra: BIG }));
    expect(payable(r)).toBe(181_050_279);
  });
  it("MX-14 ★ 2026-06 강남 거주 30 · 다른 주택 4억 → 15호로 중과 배제 148,976,416 (종전 1,022,070,217)", async () => {
    const r = await runCalc(form({ region: GANGNAM, res: R30, price: "2000000000", extra: BIG, transfer: "2026-06-01", merge: LATE, rhe: CARVE, houses: [{ ...A, ...PRICEY }, { ...B, ...PRICEY }] }));
    expect(r.result.multiHouseSurcharge.surchargeApplicable).toBe(false);
    expect(payable(r)).toBe(148_976_416);
  });
  it("MX-15 상대 쪽 거주 「아니오」 · 거주 0 → 불성립 · 과세", async () => {
    const r = await runCalc(form({ houses: [A, B], rhe: RHE({ counterpartHouseResidedTwoYears: "no" }), merge: PARENTAL }));
    expect(payable(r)).toBe(TAXED);
  });
  it("MX-16 ⑳ 미선언 → 과세 · 입력 안내", async () => {
    const r = await runCalc(form({ houses: [A, B], rhe: null, merge: PARENTAL }));
    expect(payable(r)).toBe(TAXED);
    expect(w(r)).toContain("장기임대주택 특례");
    expect(w(r)).toContain("기준-2024-법규재산-0061");
  });
});

describe("합가 상대 쪽 임대 — 중과 고지", () => {
  const notice = (r: { result: { warnings?: string[] } }) => (r.result.warnings ?? []).filter((m) => m.includes("중과 판정의 주택 수는")).join("\n");
  const rows = [other("a", "2018-09-27", { mergeOrigin: "counterpart_side", ...PRICEY }), other("b", "2018-09-27", { mergeOrigin: "counterpart_side", isLongTermRental: true, ...PRICEY })];
  const base = { region: GANGNAM, rhe: CARVE, merge: PARENTAL, houses: rows, transfer: "2026-06-18", extra: BIG };
  it("MX-21 ★ 강남 거주 0 · 3주택 중과 → 겸용도 같은 문장", async () => {
    const r = await runCalc(form(base));
    expect(payable(r)).toBeGreaterThan(0);
    expect(notice(r)).toContain("3주택으로 보고 중과세율을 적용했습니다");
    expect(notice(r)).toContain("§167의3①13호의 중과 배제를 받지 못합니다");
  });
  it("MX-22 거주 30 → 13호 배제 · 고지 없음", async () => {
    expect(notice(await runCalc(form({ ...base, res: R30 })))).toBe("");
  });
  it("MX-23 ⑳ 미선언 → 이 경로가 아니라 고지 없음", async () => {
    expect(notice(await runCalc(form({ ...base, rhe: null })))).toBe("");
  });
  it("MX-24 ⑳ 선언 · 상대 쪽 거주 문항 미답 → 합가 임대 경로가 아니라 중과여도 고지 없음", async () => {
    const r = await runCalc(form({ ...base, rhe: RHE() }));
    expect(w(r)).toContain("를 적용하지 않았습니다");
    expect(r.result.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    expect(notice(r)).toBe("");
  });
});
