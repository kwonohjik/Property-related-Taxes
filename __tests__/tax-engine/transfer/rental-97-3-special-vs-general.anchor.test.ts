/**
 * anchor — 조특법 §97의3 특례 공제액 vs 일반 공제액 중 큰 쪽 (PR-B: 계획서 #1 · §4.3)
 *
 * 조특법 §97의3③ 「제1항에 따라 과세특례를 적용받으려는 자는 … 과세특례 적용의 신청을 하여야 한다」.
 * 일반 공제율(표2 80% 등)이 특례율보다 높아 특례가 공제액을 줄이면 신청하지 않는다(사용자 결정 Q-1 (a)).
 * 종전에는 적격이면 비교 없이 대체했다 — R1-1에서 장특 480,000,000 → 428,571,427 (세액 25,685,000 → 44,252,857).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { case45RedevelopmentInfo } from "@/__tests__/tax-engine/transfer-tax/redevelopment/_helpers";
import { applyRental97Lthd, shouldApplyRental973Special } from "@/lib/tax-engine/transfer-tax-lthd-rental97";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 2016 등록·임대 10년 (2022.12.31 전 등록 · 매입임대 시한 2020.12.31 이내) */
const R973 = {
  type: "rental_97_3" as const,
  registrationDate: D("2016-01-01"),
  rentalStartDate: D("2016-01-01"),
  isTaxRegistered: true,
  taxRegistrationDate: D("2016-01-01"),
  isNationalHousingScale: true,
  officialPriceAtStart: 400_000_000,
  region: "capital" as const,
  isPrivateConstructionRental: false,
  rentalContinuesToTransfer: true,
  rentIncreaseViolated: false,
};

/** 1세대1주택, 보유 20년·거주 10년(표2 80%), 양도가 20억·취득가 5억, 기준시가 취득 3억 / 양도 10억 */
function oneHouse(reductions: Any[], over: Record<string, unknown> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 2_000_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: D("2006-01-01"),
      transferDate: D("2026-06-01"),
      residencePeriodMonths: 120,
      standardPriceAtAcquisition: 300_000_000,
      standardPriceAtTransfer: 1_000_000_000,
      reductions,
      ...over,
    } as Any),
    rates,
  ) as Any;
}

describe("#1 일반 경로 — 특례·일반 공제액 비교", () => {
  const none = oneHouse([]);

  it("대조군 — 특례 미선택: 표2 80%, 장특 480,000,000 · 세액 25,685,000", () => {
    expect(none.longTermHoldingDeduction).toBe(480_000_000);
    expect(none.longTermHoldingRate).toBe(0.8);
    expect(none.determinedTax ?? none.totalTax).toBe(25_685_000);
  });

  it("R1-1 🔴 표2 80% > 특례 70% × 6/7 → 특례 미적용(미선택과 동일), echo에 두 공제액", () => {
    const r = oneHouse([R973]);
    expect(r.longTermHoldingDeduction).toBe(480_000_000);
    expect(r.determinedTax ?? r.totalTax).toBe(25_685_000);
    const d = r.rental97LthdDetail;
    expect(d.isEligible).toBe(true); // 요건은 충족 — 선택 결과
    expect(d.specialApplied).toBe(false);
    expect(d.deductionWithSpecial).toBe(428_571_427);
    expect(d.deductionWithoutSpecial).toBe(480_000_000);
    expect(d.deductionApplied).toBe(480_000_000);
  });

  it("R1-2 비율 1(취득 즉시 등록·임대) — 70% < 80% → 미적용", () => {
    const r = oneHouse([{ ...R973, registrationDate: D("2006-01-01"), rentalStartDate: D("2006-01-01"), taxRegistrationDate: D("2006-01-01") }]);
    expect(r.longTermHoldingDeduction).toBe(480_000_000);
    expect(r.rental97LthdDetail.deductionWithSpecial).toBe(420_000_000);
    expect(r.rental97LthdDetail.specialApplied).toBe(false);
  });

  it("R1-3 8년 50%(2018 등록) — 50% < 80% → 미적용", () => {
    const r = oneHouse([{ ...R973, registrationDate: D("2018-06-01"), rentalStartDate: D("2018-06-01"), taxRegistrationDate: D("2018-06-01") }]);
    expect(r.rental97LthdDetail.overrideRate).toBe(0.5);
    expect(r.longTermHoldingDeduction).toBe(480_000_000);
    expect(r.rental97LthdDetail.specialApplied).toBe(false);
  });

  it("R1-4 구별력 — 2주택(표1 30%)은 특례가 커서 채택한다(종전 값 유지)", () => {
    const r = oneHouse([R973], { householdHousingCount: 2, isOneHousehold: false, residencePeriodMonths: 0 });
    expect(r.longTermHoldingDeduction).toBe(964_285_713);
    expect(r.determinedTax ?? r.totalTax).toBe(188_010_000);
    expect(r.rental97LthdDetail.specialApplied).toBe(true);
    expect(r.rental97LthdDetail.deductionApplied).toBe(964_285_713);
  });
});

describe("#1 비교 leaf 경계 (R1-7·R1-8 · 동률)", () => {
  const evalOf = (overrideRate: number, ratio: { num: number; den: number } | undefined) =>
    ({
      id: "rental_97_3",
      isEligible: true,
      legalBasis: "조특법 §97의3",
      effectCategory: "long_term_holding_special",
      overrideRate,
      rentalGainRatio: ratio ? ratio.num / ratio.den : 1,
      rentalGainFraction: ratio,
      eligibleRentalYears: 10,
    }) as Any;
  const run = (overrideRate: number, rate: number, ratio?: { num: number; den: number }) =>
    applyRental97Lthd({ rental97Eval: evalOf(overrideRate, ratio), taxableGain: 100_000_000, rate, useTable2: true });

  it("R1-7 비율 1 · 70% — 표2 68%면 채택, 72%면 미적용", () => {
    expect(run(0.7, 0.68)).toMatchObject({ kind: "applied", deduction: 70_000_000 });
    const r = run(0.7, 0.72);
    expect(r.kind).toBe("fallthrough");
    expect((r.rental97LthdDetail as Any).deductionWithoutSpecial).toBe(72_000_000);
  });

  it("R1-8 50% 계층 — 표2 48%면 채택, 52%면 미적용", () => {
    expect(run(0.5, 0.48).kind).toBe("applied");
    expect(run(0.5, 0.52).kind).toBe("fallthrough");
  });

  it("동률(임대분 차익 0) — 특례 채택(기존 경로 유지)", () => {
    const r = run(0.7, 0.4, { num: 0, den: 600_000_000 });
    expect(r).toMatchObject({ kind: "applied", deduction: 40_000_000 });
    expect(shouldApplyRental973Special(40_000_000, 40_000_000)).toBe(true);
  });

  it("§97의4(가산형)는 비교하지 않는다", () => {
    const r = applyRental97Lthd({
      rental97Eval: { id: "rental_97_4", isEligible: true, legalBasis: "조특법 §97의4", effectCategory: "long_term_holding_additional", additionalRate: 0.1, rentalGainRatio: 1, eligibleRentalYears: 10 } as Any,
      taxableGain: 100_000_000,
      rate: 0.3,
      useTable2: false,
    });
    expect(r).toMatchObject({ kind: "applied", deduction: 40_000_000 });
    expect((r.rental97LthdDetail as Any).specialApplied).toBeUndefined();
  });
});

describe("#1 재개발 경로 — 3분기 합계로 비교", () => {
  /** 사례 45 변형: 1세대1주택 표2 장기 거주 → 일반 공제율이 70%를 넘는 분기가 있다 */
  const redev = (reductions: Any[], residence: { prior: number; next: number }) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "redevelopment_apt",
        transferPrice: 1_500_000_000,
        transferDate: D("2026-02-16"),
        acquisitionDate: D("2005-04-09"),
        acquisitionPrice: 450_000_000,
        expenses: 9_000_000,
        useEstimatedAcquisition: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: residence.prior + residence.next,
        standardPriceAtAcquisition: 200_000_000,
        standardPriceAtTransfer: 800_000_000,
        redevelopment: { ...case45RedevelopmentInfo(), priorHouseResidenceMonths: residence.prior, newHouseResidenceMonths: residence.next },
        reductions,
      } as Any),
      rates,
    ) as Any;
  const R973_REDEV = {
    ...R973,
    registrationDate: D("2013-01-01"),
    rentalStartDate: D("2013-01-01"),
    taxRegistrationDate: D("2013-01-01"),
    officialPriceAtStart: 300_000_000,
    isPrivateConstructionRental: true,
  };

  it("R1-5 🔴 일반 합계가 크면 특례 미적용 — 미선택과 같은 공제액·세액", () => {
    const res = { prior: 100, next: 140 };
    const none = redev([], res);
    const r = redev([R973_REDEV], res);
    const d = r.rental97LthdDetail;
    expect(d.isEligible).toBe(true);
    expect(d.deductionWithSpecial).toBeLessThan(d.deductionWithoutSpecial);
    expect(d.specialApplied).toBe(false);
    expect(r.longTermHoldingDeduction).toBe(none.longTermHoldingDeduction);
    expect(r.determinedTax).toBe(none.determinedTax);
    expect(r.steps.some((s: Any) => s.label === "장기보유특별공제 특례 — 미적용 (조특법 §97의3③)")).toBe(true);
  });

  it("R1-6 대조 — 거주가 짧아 일반 합계가 작으면 특례 채택", () => {
    const res = { prior: 0, next: 0 };
    const none = redev([], res);
    const r = redev([R973_REDEV], res);
    expect(r.rental97LthdDetail.specialApplied).toBe(true);
    expect(r.longTermHoldingDeduction).toBeGreaterThan(none.longTermHoldingDeduction);
    expect(r.rental97LthdDetail.deductionApplied).toBe(r.longTermHoldingDeduction);
  });
});
