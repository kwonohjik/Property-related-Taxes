/**
 * §155⑳ 거주주택 보유 2년 × §154① 단서 — 엔진 anchor (계획서 `docs/00-pm/rental-residence-holding-proviso.plan.md` Q-R1·Q-R2 (a)).
 *
 * 시료(계획서 §4.1): 거주주택 8억(취득가 6억) · 비조정 · 장기임대주택 1호(A · 요건 충족 · ⑳ 이력 없음) · 2주택.
 * 배우자(같은 세대)가 2018-01-01 취득 → 2023-06-01 증여 → 본인 거주 18개월 → 2024-12-01 양도(증여일부터 보유 1년 6개월).
 * 증여 전 같은 세대 거주 36개월을 ⑳1호 거주기간에 통산한다(#2261). 보유는 통산하지 않는다(사용자 결정 2026-10-19·10-26).
 *
 * 「종전」 = 이 수정 전 엔진 실측(master acc03cc97, mock 세율): 단서가 있어도 보유 2년 미충족으로 과세 118,500,000.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { judgeRentalHousingEligibility } from "@/lib/tax-engine/transfer-tax-rental-housing-step";
import { buildRentalHousingVerdict } from "@/lib/tax-engine/one-house/rental-housing-verdict";
import {
  rentalResidenceDecisiveProviso,
  rentalResidenceRequirementHoldYears,
} from "@/lib/tax-engine/one-house/rental-residence-holding-proviso";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const TAXED = 118_500_000; // 결정세액 — 보유 2년 미충족으로 ⑳ 불성립(종전 · 단서 없음)
const TAXED_INHERITED = 55_110_000; // 동일세대 상속 — §104②1호 세율 보유기간 통산으로 세율만 다르다

const rentalUnit = {
  businessRegistrationDate: D("2018-06-01"),
  rentalRegistrationDate: D("2018-06-01"),
  rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const,
  isApartment: false,
  region: "non-metro" as const,
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 250_000_000,
  hasMinimum2Units: false,
  rentalMonths: 96,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};

const gift = (priorMonths: number) => ({
  giftDate: D("2023-06-01"),
  donorAcquisitionDate: D("2018-01-01"),
  continuousSameHousehold: true,
  householdHoldingStartDate: D("2018-01-01"),
  priorHouseholdResidenceMonths: priorMonths,
});

const inherited: Partial<TransferTaxInput> = {
  acquisitionCause: "inheritance",
  decedentAcquisitionDate: D("2018-01-01"),
  decedentSameHouseholdBeforeInheritance: true,
  decedentCohabitationHoldingStartDate: D("2018-01-01"),
  decedentCohabitationResidenceMonths: 36,
};

type Proviso = NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>;
const UNAVOIDABLE: Proviso = { reason: "unavoidable" };
const EXPROPRIATION: Proviso = {
  reason: "expropriation",
  businessApprovalDate: D("2024-01-15"),
  expropriationDate: D("2024-12-01"),
};

function input(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    acquisitionPrice: 600_000_000,
    acquisitionDate: D("2023-06-01"),
    transferDate: D("2024-12-01"),
    acquisitionCause: "gift",
    giftHouseholdBasis: gift(36),
    residencePeriodMonths: 18,
    isOneHousehold: true,
    householdHousingCount: 2,
    rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [rentalUnit], priorRentalExemptionHistory: "none" },
    ...o,
  });
}

const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(input(o), rates);
const unmetStep = (r: ReturnType<typeof run>) => r.steps.find((s) => s.label === "장기임대주택 거주주택 비과세 특례 — 적용 불가")?.formula ?? "";

describe("§155⑳ 거주주택 보유 2년 × §154① 단서 — 엔진", () => {
  it("RP-1 ★ 증여 전 같은 세대 거주 통산 + 3호 부득이 → 보유 2년을 단서가 풀어 ⑳ 비과세(종전 118,500,000)", () => {
    const r = run({ oneHouseExemptionProviso: UNAVOIDABLE });
    expect(r.determinedTax).toBe(0);
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("장기임대주택 보유자 거주주택 비과세 (§155⑳ · §154① 단서 3호 부득이)");
    expect(r.steps.some((s) => s.formula.endsWith("시나리오 적용 · §154① 단서 3호 부득이"))).toBe(true);
  });

  it("RP-2 ★ Q-R2 (a) — 단서로 선 경우 정면 해석례 없음 확인 필요 고지", () => {
    const w = run({ oneHouseExemptionProviso: UNAVOIDABLE }).warnings ?? [];
    expect(w.some((x) => x.includes("§154① 단서 3호 부득이 사유로 보유기간의 제한을 적용하지 않고") && x.includes("확인이 필요합니다"))).toBe(true);
  });

  it("RP-3 2호가목 수용(사업인정 고시 전 증여 취득 · 수용일 = 양도일) → 비과세 · 근거 「2호가 수용」", () => {
    const r = run({ oneHouseExemptionProviso: EXPROPRIATION });
    expect(r.determinedTax).toBe(0);
    expect(r.exemptReason).toContain("§154① 단서 2호가 수용");
  });

  it("RP-4 동일세대 상속(동거 거주 36개월 통산) + 3호 → 비과세(종전 55,110,000)", () => {
    expect(run({ ...inherited, giftHouseholdBasis: undefined }).determinedTax).toBe(TAXED_INHERITED);
    expect(run({ ...inherited, giftHouseholdBasis: undefined, oneHouseExemptionProviso: UNAVOIDABLE }).determinedTax).toBe(0);
  });

  it("RP-5 부정 짝 — 단서 없음이면 종전대로 보유 2년 미충족 과세", () => {
    const r = run();
    expect(r.determinedTax).toBe(TAXED);
    expect(unmetStep(r)).toContain("거주주택 보유기간 2년 미충족 (현재: 1년)");
  });

  it("RP-6 ★ 거주 2년은 단서로 면제되지 않는다(부동산납세과-67) — 통산 없음(거주 18개월) + 3호·2호가목은 과세", () => {
    for (const p of [UNAVOIDABLE, EXPROPRIATION]) {
      const r = run({ giftHouseholdBasis: gift(0), oneHouseExemptionProviso: p });
      expect(r.determinedTax).toBe(TAXED);
      // 보유는 단서가 풀었다 — 남은 사유는 거주뿐
      expect(unmetStep(r)).toBe("거주주택 거주기간 2년 미충족 (현재: 1년)");
    }
  });

  it("RP-7 ★ 받지 않는 사유 — 5호·2호나목·2호다목·삭제 전 4호는 API 직접으로 보내도 ⑳ 보유를 풀지 않는다", () => {
    const departure = { departureDate: D("2024-06-01"), departureOnlyHouse: true };
    for (const p of [
      { reason: "pre_designation_contract" },
      { reason: "overseas_migration", ...departure },
      { reason: "overseas_residence", ...departure },
      { reason: "rental_registration_4ho" },
    ] as Proviso[]) {
      expect(run({ oneHouseExemptionProviso: p }).determinedTax).toBe(TAXED);
    }
  });

  it("RP-8 단서 불성립(3호 1년 거주 미달 · 수용일 미입력)이면 풀지 않는다 — 성립은 정본 `resolveExemptionProviso`", () => {
    // 3호 1년 거주는 통산값으로 본다 — 통산·본인 모두 0이면 불성립
    expect(run({ giftHouseholdBasis: gift(0), residencePeriodMonths: 6, oneHouseExemptionProviso: UNAVOIDABLE }).determinedTax).toBe(TAXED);
    expect(run({ oneHouseExemptionProviso: { reason: "expropriation", businessApprovalDate: D("2024-01-15") } }).determinedTax).toBe(TAXED);
  });

  it("RP-9 보유 2년 이상이면 단서가 결론을 가르지 않는다 — 근거·고지 없음", () => {
    const r = run({ transferDate: D("2025-07-01"), residencePeriodMonths: 25, oneHouseExemptionProviso: UNAVOIDABLE });
    expect(r.determinedTax).toBe(0);
    expect(r.exemptReason).toBe("장기임대주택 보유자 거주주택 비과세 (§155⑳)");
    expect((r.warnings ?? []).some((w) => w.includes("§154① 단서"))).toBe(false);
  });

  it("RP-10 판정 메뉴 verdict — 계산기와 같은 결론 + 확인 필요 고지", () => {
    const on = buildRentalHousingVerdict(input({ oneHouseExemptionProviso: UNAVOIDABLE }));
    expect(on?.passed).toBe(true);
    expect(on?.notices.some((n) => n.includes("§154① 단서 3호 부득이"))).toBe(true);
    const off = buildRentalHousingVerdict(input());
    expect(off?.passed).toBe(false);
    expect(off?.residenceFailReasons).toEqual(["거주주택 보유기간 2년 미충족 (현재: 1년)"]);
  });

  it("RP-11 §154⑩ 단독 경로(B · 임대주택 0호)는 범위 밖 — 단서로 보유를 풀지 않는다", () => {
    const standalone = input({
      oneHouseExemptionProviso: UNAVOIDABLE,
      rentalHousingException: {
        applyException: true,
        scenario: "B",
        rentalUnits: [],
        wasRegisteredRentalOrChildcare: true,
        priorResidenceTransferDate: D("2024-03-01"),
        postRegistrationResidenceMonths: 18,
      },
    });
    expect(rentalResidenceDecisiveProviso(standalone)).toBeUndefined();
    expect(rentalResidenceRequirementHoldYears(standalone)).toBe(1);
    expect(judgeRentalHousingEligibility(standalone)?.residenceFailReasons.join(" ")).toContain("보유기간 2년 미충족");
  });

  it("RP-12 V-R1 — B(직전거주주택보유주택)는 보유를 풀어도 등록 이후 거주 2년(⑳1호 괄호 · 통산 없음)이 남는다", () => {
    const b = input({
      oneHouseExemptionProviso: UNAVOIDABLE,
      rentalHousingException: {
        applyException: true,
        scenario: "B",
        rentalUnits: [rentalUnit],
        priorResidenceTransferDate: D("2024-03-01"),
        standardPriceAtAcquisition: 300_000_000,
        standardPriceAtPriorTransfer: 350_000_000,
        standardPriceAtTransfer: 400_000_000,
        postRegistrationResidenceMonths: 18,
        priorRentalExemptionHistory: "none",
      },
    });
    expect(rentalResidenceRequirementHoldYears(b)).toBe(2);
    const reasons = judgeRentalHousingEligibility(b)?.residenceFailReasons ?? [];
    expect(reasons.some((x) => x.includes("보유기간"))).toBe(false);
    expect(reasons.some((x) => x.includes("거주기간(사업자등록·임대사업자 등록 이후) 2년 미충족"))).toBe(true);
  });
});
