/**
 * US-43 · US-71 (리뷰 `unsold-98-series-review-2026-11.md`) — §155⑳ 거주주택 특례 경로가 §98 시리즈를 계산한다.
 * 사용자 결정 Q-15 (a) 2026-11-08 — 일반 경로와 같은 순서(고가주택 안분·장특·§161 반영 후 차감). 세율표 mock.
 *
 * 공통: 양도 15억 · 1세대 · 거주 60개월 · §155⑳ 시나리오 A(장기임대 1호, 2018-06-01 등록).
 *
 * | 시료 | 일반 경로 | §155⑳ 수정 전 | §155⑳ 수정 후 |
 * |---|---|---|---|
 * | C1 §98의5(인하율 25% → 100% · 5년 후 · 2024-06-01) | 4,141,500 | 12,012,000 | 4,141,500 |
 * | C2 §98의7(5년 후) | 3,271,500 | 6,781,500 | 3,271,500 |
 * | C3 §98의5 5년 이내(2015-06-01 · 세액감면형) | 0 | 79,347,400 | 0 |
 * | 시나리오 B · §98의5 | — | 81,604,600(미반영) | 30,217,000 (§161 후 차감 125,100,000 + 확인 필요) |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { RENTAL_HOUSING_INCOME_DEDUCTION_ORDER_NOTICE } from "@/lib/tax-engine/transfer-tax-rental-housing-income-deduction";

const D = (s: string) => new Date(s);
const rates = makeMockRates();
const unit = (reg: string) => ({
  businessRegistrationDate: D(reg), rentalRegistrationDate: D(reg), rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const, isApartment: false, region: "non-metro" as const, isExcluded918Rule: false,
  standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 120, rentalAutoTermination: false, requirementsConfirmed: true,
});
const R985 = {
  type: "unsold_98_5", contractDate985: D("2010-06-15"), priceReductionRatePct985: 25, isNonCapitalUnsoldAtCutoff985: true,
  isFirstContract985: true, isNotOccupiedAtContract985: true, isNotRecontract985: true,
  standardPriceAtAcquisition985: 400_000_000, standardPriceAt5Years985: 600_000_000, standardPriceAtTransfer985: 800_000_000,
};
const R987 = {
  type: "unsold_98_7", contractDate987: D("2012-10-15"), acquisitionPrice987: 850_000_000, isUnsoldAtCutoff987: true,
  isFirstContract987: true, isNotOccupiedAtContract987: true, isNotRecontract987: true,
  standardPriceAtAcquisition987: 400_000_000, standardPriceAt5Years987: 600_000_000, standardPriceAtTransfer987: 800_000_000,
};
const input = (o: { red: unknown[]; acq: string; td: string; acqPrice: number; rhe?: unknown }) =>
  baseTransferInput({
    propertyType: "housing", acquisitionDate: D(o.acq), transferDate: D(o.td), residencePeriodMonths: 60, isOneHousehold: true,
    householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0, transferPrice: 1_500_000_000, acquisitionPrice: o.acqPrice,
    reductions: o.red, ...(o.rhe ? { rentalHousingException: o.rhe } : {}),
  } as never);
const rheA = (reg: string) => ({ applyException: true, scenario: "A", rentalUnits: [unit(reg)] });
const pair = (o: { red: unknown[]; acq: string; td: string; acqPrice: number; reg: string }) => ({
  general: calculateTransferTax(input(o), rates),
  rhe: calculateTransferTax(input({ ...o, rhe: rheA(o.reg) }), rates),
});

describe("US-43 시나리오 A — §155⑳ 경로가 일반 경로와 같은 세액이다", () => {
  it("C1 §98의5 5년 후: 4,141,500 (수정 전 12,012,000)", () => {
    const { general, rhe } = pair({ red: [R985], acq: "2010-07-01", td: "2024-06-01", acqPrice: 600_000_000, reg: "2018-06-01" });
    expect(rhe.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(general.totalTax).toBe(4_141_500);
    expect(rhe.totalTax).toBe(4_141_500);
    expect(rhe.unsold985Detail?.isEligible).toBe(true);
    expect(rhe.warnings ?? []).toContain(RENTAL_HOUSING_INCOME_DEDUCTION_ORDER_NOTICE);
  });
  it("C2 §98의7 5년 후: 3,271,500 (농특세 포함 · 수정 전 6,781,500)", () => {
    const { general, rhe } = pair({ red: [R987], acq: "2013-01-15", td: "2024-06-01", acqPrice: 850_000_000, reg: "2018-06-01" });
    expect(general.totalTax).toBe(3_271_500);
    expect(rhe.totalTax).toBe(3_271_500);
    expect(rhe.ruralSurtax).toBe(general.ruralSurtax);
  });
  it("C3 §98의5 5년 이내(세액감면형): 감면 72,134,000 · 총부담 0 (수정 전 79,347,400)", () => {
    const { general, rhe } = pair({ red: [R985], acq: "2010-07-01", td: "2015-06-01", acqPrice: 600_000_000, reg: "2011-06-01" });
    expect(rhe.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(rhe.reductionAmount).toBe(72_134_000);
    expect(rhe.reductionAmount).toBe(general.reductionAmount);
    expect(rhe.totalTax).toBe(0);
  });
  it("짝: 감면 없음은 종전과 같다 — 12,012,000 · 고지 없음", () => {
    const { rhe } = pair({ red: [], acq: "2010-07-01", td: "2024-06-01", acqPrice: 600_000_000, reg: "2018-06-01" });
    expect(rhe.totalTax).toBe(12_012_000);
    expect(rhe.steps.some((s) => s.label.includes("미반영"))).toBe(false);
  });
});

describe("Q-15 (a) — 시나리오 B: §161 안분 뒤 과세분에서 차감 + 확인 필요", () => {
  const rB = {
    applyException: true, scenario: "B",
    rentalUnits: [{ ...unit("2014-01-01"), isApartment: true, region: "seoul-metro" as const, standardPriceAtRentalStart: 500_000_000 }],
    priorResidenceTransferDate: D("2016-08-25"), standardPriceAtAcquisition: 300_000_000, standardPriceAtPriorTransfer: 450_000_000,
    standardPriceAtTransfer: 800_000_000, postRegistrationResidenceMonths: 30,
  };
  it("§98의5: 81,604,600 → 30,217,000 · 차감 125,100,000 · 적용 순서 확인 필요 단계", () => {
    const base = { acq: "2010-07-01", td: "2024-06-01", acqPrice: 600_000_000, rhe: rB };
    const none = calculateTransferTax(input({ ...base, red: [] }), rates);
    const r = calculateTransferTax(input({ ...base, red: [R985] }), rates);
    expect(none.totalTax).toBe(81_604_600);
    expect(r.unsold985Detail?.reducibleTransferIncome).toBe(125_100_000);
    expect(r.totalTax).toBe(30_217_000);
    expect(r.steps.some((s) => s.label.includes("적용 순서 (확인 필요)"))).toBe(true);
  });
});

describe("US-71 — §155⑳ 경로 고지 분리", () => {
  const run = (red: unknown[]) =>
    calculateTransferTax(input({ red, acq: "2010-07-01", td: "2024-06-01", acqPrice: 600_000_000, rhe: rheA("2018-06-01") }), rates);
  it("§98: 세율 특례 미반영 고지 1건 — «차감형»·«고가주택 배제» 문장 없음", () => {
    const notes = run([{ type: "unsold_98" }]).steps.filter((s) => s.label.includes("미반영"));
    expect(notes.map((s) => s.label)).toEqual(["조특법 감면 — 미반영 (세율 특례)"]);
    expect(notes[0].formula).toContain("세율 100분의 20");
    expect(notes[0].formula).not.toMatch(/차감형|고가주택 배제/);
  });
  it("§98의2: 장특 특례 고지 1건 — §97의3·§97의4 «임대주택» 재확인 문장 없음", () => {
    const notes = run([{ type: "unsold_98_2" }]).steps.filter((s) => s.label.includes("미반영"));
    expect(notes.map((s) => s.label)).toEqual(["조특법 감면 — 미반영 (장기보유특별공제 특례)"]);
    expect(notes[0].formula).toContain("§98의2①1호");
    expect(notes[0].formula).not.toContain("임대주택");
  });
});
