/**
 * 별건 ⑥ — §155⑳1호 거주주택 「거주기간 2년」에 증여·상속 전 동일세대 거주를 통산한다 (계획서
 * `docs/00-pm/rental-residence-gift-inheritance-residence-consolidation.plan.md`).
 *
 * 근거: 서면-2022-부동산-2643(동일세대원 간 증여 — 증여 전 동일세대 거주 통산) · 서면-2016-부동산-3992(피상속인과 함께 거주한 기간 통산).
 * 사용자 결정(2026-10-19): 거주만 통산(보유기간·공제율 거주분은 본인 기간) · 통산 적용 시 확인 필요 고지 없음(Q-1) · 입력된 개월만(Q-2).
 *
 * 시료: 거주주택 증여일(=취득일) 2021-01-04 · 양도일 2025-03-03 · 본인 거주 12개월 · 장기임대 1호(A, 요건 충족) · 세대 주택 수 1.
 * 종전에는 §154① 거주요건·표2 대상 판정만 통산하고 §155⑳은 본인 거주만 봐서, 같은 입력이 §155⑳ 미충족으로 전액 과세됐다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { judgeRentalHousingEligibility } from "@/lib/tax-engine/transfer-tax-rental-housing-step";
import { buildRentalHousingVerdict } from "@/lib/tax-engine/one-house/rental-housing-verdict";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import type { GiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

const unit: RentalUnitInput = {
  businessRegistrationDate: new Date("2018-06-01"),
  rentalRegistrationDate: new Date("2018-06-01"),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 300_000_000,
  hasMinimum2Units: false,
  rentalMonths: 96,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};

const input = (over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 900_000_000,
    transferDate: new Date("2025-03-03"),
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2021-01-04"),
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 12,
    acquisitionCause: "gift",
    rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [unit] },
    ...over,
  });

const gift = (over: Partial<GiftHouseholdBasis> = {}): GiftHouseholdBasis => ({
  giftDate: new Date("2021-01-04"),
  donorAcquisitionDate: new Date("2015-03-02"),
  continuousSameHousehold: true,
  householdHoldingStartDate: new Date("2015-03-02"),
  priorHouseholdResidenceMonths: 18,
  ...over,
});

const inherited: Partial<TransferTaxInput> = {
  acquisitionCause: "inheritance",
  decedentSameHouseholdBeforeInheritance: true,
  decedentCohabitationResidenceMonths: 18,
};

/** 종전(통산 없음) 세액 — 본인 거주 12개월로 §155⑳ 미충족 → 일반 과세. */
const UNCONSOLIDATED_TAX = 132_286_000;

/** 통산 내역 — 세액 경로는 계산 단계, 전액 비과세 조기반환은 안내(warnings)에 같은 문장이 실린다. */
const traceOf = (r: ReturnType<typeof calculateTransferTax>) =>
  r.steps.find((s) => s.label === "거주주택 거주기간 — 동일세대 거주 통산")?.formula ??
  r.warnings?.find((w) => w.startsWith("장기임대주택 보유자 거주주택 특례의 거주기간"));

describe("별건 ⑥ — §155⑳ 거주요건 동일세대 거주 통산", () => {
  it("RC-1 ★ 증여 전 같은 세대 거주 18개월 + 본인 12개월 = 30개월 → 요건 충족, 9억 거주주택 비과세 0", () => {
    const i = input({ giftHouseholdBasis: gift() });
    expect(judgeRentalHousingEligibility(i)?.passed).toBe(true);
    const r = calculateTransferTax(i, rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(traceOf(r)).toContain("본인 거주 12개월 + 증여 전 같은 세대 거주 18개월 = 30개월");
  });

  it("RC-2 동일세대 상속 — 피상속인과 함께 거주 18개월을 통산(§154⑧3호와 같은 leaf) → 비과세 0", () => {
    const i = input(inherited);
    expect(judgeRentalHousingEligibility(i)?.passed).toBe(true);
    const r = calculateTransferTax(i, rates);
    expect(r.totalTax).toBe(0);
    expect(traceOf(r)).toContain("본인 거주 12개월 + 상속개시 전 같은 세대 거주 18개월 = 30개월");
  });

  it("RC-3 부정 짝 — 증여 전 거주 개월 미답(Q-2: 입력된 개월만) · 0개월 · 별도세대면 통산하지 않는다", () => {
    for (const g of [gift({ priorHouseholdResidenceMonths: undefined }), gift({ priorHouseholdResidenceMonths: 0 }), gift({ continuousSameHousehold: false })]) {
      const i = input({ giftHouseholdBasis: g });
      expect(judgeRentalHousingEligibility(i)?.residenceFailReasons).toEqual(["거주주택 거주기간 2년 미충족 (현재: 1년)"]);
      const r = calculateTransferTax(i, rates);
      expect(r.totalTax).toBe(UNCONSOLIDATED_TAX);
      expect(traceOf(r)).toBeUndefined();
    }
    expect(calculateTransferTax(input(), rates).totalTax).toBe(UNCONSOLIDATED_TAX);
    expect(calculateTransferTax(input({ ...inherited, decedentSameHouseholdBeforeInheritance: false }), rates).totalTax).toBe(UNCONSOLIDATED_TAX);
  });

  it("RC-4 ★ 15억 — 통산은 표2 대상·요건만, 공제율 거주분은 본인 거주(보유 4년 16% + 거주 1년 0%)", () => {
    const consolidated = calculateTransferTax(input({ transferPrice: 1_500_000_000, giftHouseholdBasis: gift() }), rates);
    expect(consolidated.longTermHoldingRate).toBe(0.16);
    expect(consolidated.taxableGain).toBe(168_000_000);
    expect(consolidated.totalTax).toBe(47_245_000);
    // 세액 경로(STEP 2.5)는 계산 단계에 통산 내역을 남긴다.
    expect(consolidated.steps.find((s) => s.label === "거주주택 거주기간 — 동일세대 거주 통산")?.formula).toContain("= 30개월");
    // 대조 — 본인이 30개월 거주했다면 거주분 8%가 붙는다(24%). 통산값이 공제율에 들어가면 이 값과 같아진다.
    const own30 = calculateTransferTax(input({ transferPrice: 1_500_000_000, residencePeriodMonths: 30 }), rates);
    expect(own30.longTermHoldingRate).toBe(0.24);
    expect(own30.totalTax).toBe(40_573_500);
  });

  it("RC-5 판정 메뉴(buildRentalHousingVerdict)도 같은 leaf — 계산기와 같은 결론", () => {
    expect(buildRentalHousingVerdict(input({ giftHouseholdBasis: gift() }))?.passed).toBe(true);
    expect(buildRentalHousingVerdict(input(inherited))?.passed).toBe(true);
    expect(buildRentalHousingVerdict(input())?.passed).toBe(false);
  });

  it("RC-6 범위 밖 — B(직전거주주택보유주택)는 등록 이후 거주기간으로 판정해 통산이 결론·세액을 바꾸지 않는다", () => {
    const b = (over: Partial<TransferTaxInput>) =>
      input({
        rentalHousingException: {
          applyException: true,
          scenario: "B",
          rentalUnits: [unit],
          priorResidenceTransferDate: new Date("2023-08-25"),
          standardPriceAtAcquisition: 300_000_000,
          standardPriceAtPriorTransfer: 450_000_000,
          standardPriceAtTransfer: 500_000_000,
          postRegistrationResidenceMonths: 12,
        },
        ...over,
      });
    const withGift = calculateTransferTax(b({ giftHouseholdBasis: gift() }), rates);
    const without = calculateTransferTax(b({ giftHouseholdBasis: gift({ priorHouseholdResidenceMonths: 0 }) }), rates);
    expect(withGift.totalTax).toBe(without.totalTax);
    expect(traceOf(withGift)).toBeUndefined();
  });

  it("RC-7 §154⑩ 종전규정(B · 장기임대 0호 · 2019.2.12 전 취득 · 취득 당시 조정대상지역)의 §154① 거주 2년도 통산값", () => {
    const b = (over: Partial<TransferTaxInput>) =>
      input({
        acquisitionDate: new Date("2016-01-04"),
        wasRegulatedAtAcquisition: true,
        rentalHousingException: {
          applyException: true,
          scenario: "B",
          rentalUnits: [],
          priorResidenceTransferDate: new Date("2020-08-25"),
          wasRegisteredRentalOrChildcare: true,
          standardPriceAtAcquisition: 300_000_000,
          standardPriceAtPriorTransfer: 450_000_000,
          standardPriceAtTransfer: 500_000_000,
        },
        ...over,
      });
    expect(judgeRentalHousingEligibility(b({}))?.residenceFailReasons.some((r) => r.includes("§154①"))).toBe(true);
    expect(judgeRentalHousingEligibility(b(inherited))?.passed).toBe(true);
  });
});
