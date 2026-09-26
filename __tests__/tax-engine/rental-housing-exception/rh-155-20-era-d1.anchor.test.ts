/**
 * anchor: §155⑳ 연혁 축 — OH-13(고가주택 기준) · OH-16(마목 1) 포함) · OH-40(생애 1회·PHRP 1주택 한정)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.9~§3.11 · §7(4·5).
 * 리뷰 `docs/reviews/one-house-exemption-review-2026-09.md` OH-13 · OH-16 · OH-40 실패 시나리오.
 *
 * 법령(법제처 DRF 실독 2026-09-26):
 * - 고가주택 기준: 양도일 ≤ 2021-12-07 9억 · ≥ 2021-12-08 12억 (법률 제18578호 부칙 제7조④ ·
 *   `one-house/threshold.ts`). §161②도 「제156조제1항에 따른 고가주택인 경우」.
 * - 마목 1) 포함: 대통령령 제31442호(MST 229391) §155⑳ 괄호 · 부칙 제2조② 양도분부터(2021-02-17).
 *   ⚠️ 2019-02-12~2021-02-16 양도분을 문언대로 배제한 **직접 선례는 미확보**(계획서 §7-4) — 문언 결론 유지.
 * - 생애 1회·PHRP 1주택 한정: 대통령령 제29523호 부칙 제7조①(2019-02-12 이후 취득 주택)·②(경과조치) ·
 *   제35349호 부칙 제14조(2025-02-28 이후 양도분 삭제).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type {
  RentalUnitInput,
  RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

const unitOk: RentalUnitInput = {
  businessRegistrationDate: new Date("2016-06-01"),
  rentalRegistrationDate: new Date("2016-06-01"),
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

function inputA(over: Partial<TransferTaxInput>, rhe?: Partial<RentalHousingExceptionInput>): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 1_000_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2012-01-01"),
    transferDate: new Date("2021-06-01"),
    residencePeriodMonths: 60,
    householdHousingCount: 1,
    rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [unitOk], ...rhe },
    ...over,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OH-13 — §155⑳ 경로 고가주택 기준 = 양도일 기준
// ─────────────────────────────────────────────────────────────────────────────
describe("OH-13 §155⑳ 고가주택 기준 — 양도일 2021-12-07 이전 9억", () => {
  it("OH13-1 A: 2021-06-01 양도 10억 → RH-A2(9억 초과분 과세), 전액 비과세 아님", () => {
    const r = calculateTransferTax(inputA({}), rates);
    const d = r.rentalHousingExceptionDetail!;
    expect(d.applied).toBe(true);
    expect(d.scenarioId).toBe("RH-A2");
    expect(d.formulaTrace.highValueThreshold).toBe(900_000_000);
    // taxableGain = gain95(표2) × (10억 − 9억) / 10억
    expect(d.taxableGain).toBe(Math.floor((d.formulaTrace.gain95Table2 * 100_000_000) / 1_000_000_000));
    expect(d.taxableGain).toBeGreaterThan(0);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("OH13-2 경계: 2021-12-07 양도 → 여전히 9억 기준(RH-A2)", () => {
    const r = calculateTransferTax(inputA({ transferDate: new Date("2021-12-07") }), rates);
    expect(r.rentalHousingExceptionDetail?.scenarioId).toBe("RH-A2");
    expect(r.rentalHousingExceptionDetail?.formulaTrace.highValueThreshold).toBe(900_000_000);
  });

  it("OH13-3 경계 짝(긍정): 2021-12-08 양도 10억 → 12억 이하라 전액 비과세", () => {
    const r = calculateTransferTax(inputA({ transferDate: new Date("2021-12-08") }), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  const inputB = (transferDate: string): TransferTaxInput =>
    inputA(
      { transferDate: new Date(transferDate) },
      {
        scenario: "B",
        priorResidenceTransferDate: new Date("2016-08-25"),
        standardPriceAtAcquisition: 300_000_000,
        standardPriceAtPriorTransfer: 400_000_000,
        standardPriceAtTransfer: 700_000_000,
        postRegistrationResidenceMonths: 60,
      },
    );

  it("OH13-4 B: 2021-06-01 PHRP 10억 → §161②(RH-B2) — 2호 = gain95(표2)×(7억−4억)/(7억−3억)×(10억−9억)/10억", () => {
    const d = calculateTransferTax(inputB("2021-06-01"), rates).rentalHousingExceptionDetail!;
    expect(d.scenarioId).toBe("RH-B2");
    expect(d.formulaTrace.highValueThreshold).toBe(900_000_000);
    const g1 = d.formulaTrace.gain95Table1;
    const g2 = d.formulaTrace.gain95Table2;
    expect(d.formulaTrace.part1).toBe(Math.floor((g1 * 100_000_000) / 400_000_000));
    const before = Math.floor((g2 * 300_000_000) / 400_000_000);
    expect(d.formulaTrace.part2).toBe(Math.floor((before * 100_000_000) / 1_000_000_000));
    expect(d.taxableGain).toBe(d.formulaTrace.part1! + d.formulaTrace.part2!);
  });

  it("OH13-5 B 경계 짝: 2021-12-08 PHRP 10억 → §161①(RH-B1)", () => {
    const d = calculateTransferTax(inputB("2021-12-08"), rates).rentalHousingExceptionDetail!;
    expect(d.scenarioId).toBe("RH-B1");
    expect(d.formulaTrace.highValueThreshold).toBe(1_200_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OH-16 — 마목 1)(2018.9.14 이후 조정대상지역 신규취득)은 2021-02-17 양도분부터 ⑳에 포함
// ─────────────────────────────────────────────────────────────────────────────
describe("OH-16 마목 1) 포함 — 양도일 게이트(대통령령 제31442호 부칙 제2조②)", () => {
  // 등록 2020-08-01(≥ 2020-07-11 → 마목), 매입·비아파트·수도권 3억, 918 해당
  const unitMa918: RentalUnitInput = {
    ...unitOk,
    businessRegistrationDate: new Date("2020-08-01"),
    rentalRegistrationDate: new Date("2020-08-01"),
    rentalMonths: 6, // ㉑(기간 충족 전 양도)
    isExcluded918Rule: true,
  };
  const ctx = (transferDate: string) => ({
    scenario: "A" as const,
    transferDate: new Date(transferDate),
    residenceAcquisitionDate: new Date("2016-01-01"),
  });

  it("OH16-1 2021-02-17 양도 → 마목 1)이 장기임대주택에 포함돼 통과", () => {
    const e = checkEligibility([unitMa918], 5, 5, false, ctx("2021-02-17"));
    expect(e.perUnitVerdict?.[0].derivedArticle).toBe("마");
    expect(e.failReasons.map((f) => f.code)).not.toContain("SHORT_TERM_REGULATED");
    expect(e.passed).toBe(true);
  });

  it("OH16-2 경계 짝(부정): 2021-02-16 양도 → 종전 문언대로 배제(직접 선례 미확보 — 문언 결론)", () => {
    const e = checkEligibility([unitMa918], 5, 5, false, ctx("2021-02-16"));
    expect(e.passed).toBe(false);
    expect(e.failReasons.map((f) => f.code)).toContain("SHORT_TERM_REGULATED");
  });

  it("OH16-3 마목 2)(2020.7.11 이후 등록 아파트)는 포함 대상이 아니다 — 여전히 배제", () => {
    const e = checkEligibility([{ ...unitMa918, isApartment: true }], 5, 5, false, ctx("2024-06-01"));
    expect(e.passed).toBe(false);
    expect(e.failReasons.map((f) => f.code)).toContain("APARTMENT_RESTRICTED");
  });

  it("OH16-4 마목 3)(단기→장기 변경)도 여전히 배제", () => {
    const e = checkEligibility(
      [{ ...unitMa918, isExcludedShortToLongChange: true }],
      5, 5, false, ctx("2024-06-01"),
    );
    expect(e.failReasons.map((f) => f.code)).toContain("SHORT_TO_LONG_CHANGE");
  });

  it("OH16-5 전엔진(리뷰 F5): 2024-06-01 양도 8억 · 918 ON 마목 1호 → 비과세", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: new Date("2016-01-01"),
        transferDate: new Date("2024-06-01"),
        residencePeriodMonths: 60,
        rentalHousingException: {
          applyException: true,
          scenario: "A",
          rentalUnits: [{ ...unitMa918, rentalMonths: 30 }],
        },
      }),
      rates,
    );
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OH-40 — 2019-02-12 이후 취득 · 2025-02-27 이전 양도 구간의 두 괄호
// ─────────────────────────────────────────────────────────────────────────────
describe("OH-40 생애 한 차례 제한(A) — 거주주택 취득일·양도일 게이트", () => {
  const ctxA = (acq: string, tr: string, extra: Record<string, unknown> = {}) => ({
    scenario: "A" as const,
    residenceAcquisitionDate: new Date(acq),
    transferDate: new Date(tr),
    ...extra,
  });
  const LIFE = "생애 한 차례";

  it("OH40-1 취득 2019-02-12 · 양도 2025-02-27 · 이력 있음 → 적용 불가", () => {
    const e = checkEligibility([unitOk], 5, 5, false, ctxA("2019-02-12", "2025-02-27", { priorRentalExemptionHistory: "used" }));
    expect(e.passed).toBe(false);
    expect(e.residenceFailReasons.join()).toContain(LIFE);
  });

  it("OH40-2 양도 경계 짝: 2025-02-28 양도(제35349호 부칙 제14조) → 제한 없음", () => {
    const e = checkEligibility([unitOk], 5, 5, false, ctxA("2019-02-12", "2025-02-28", { priorRentalExemptionHistory: "used" }));
    expect(e.passed).toBe(true);
  });

  it("OH40-3 취득 경계 짝: 2019-02-11 취득(부칙 제7조①) → 제한 없음", () => {
    const e = checkEligibility([unitOk], 5, 5, false, ctxA("2019-02-11", "2025-02-27", { priorRentalExemptionHistory: "used" }));
    expect(e.passed).toBe(true);
  });

  it("OH40-4 경과조치(부칙 제7조② — 시행 당시 거주·시행 전 계약금 지급) → 종전 규정", () => {
    const e = checkEligibility(
      [unitOk], 5, 5, false,
      ctxA("2019-06-01", "2024-06-01", { priorRentalExemptionHistory: "used", residenceTransitionUnderAddendum: true }),
    );
    expect(e.passed).toBe(true);
  });

  it("OH40-5 이력 없음(최초 양도) → 적용", () => {
    const e = checkEligibility([unitOk], 5, 5, false, ctxA("2019-06-01", "2024-06-01", { priorRentalExemptionHistory: "none" }));
    expect(e.passed).toBe(true);
    expect(e.notices ?? []).toHaveLength(0);
  });

  it("OH40-6 이력 미입력 → 결론은 유지하되 판정 보류 고지(침묵 적용 금지)", () => {
    const e = checkEligibility([unitOk], 5, 5, false, ctxA("2019-06-01", "2024-06-01"));
    expect(e.passed).toBe(true);
    expect((e.notices ?? []).join()).toContain(LIFE);
  });

  it("OH40-7 전엔진: 이력 있음 + 주택 수 1 → 과세(STEP 1a 조기반환 억제) + 사유 step", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: new Date("2019-06-01"),
        transferDate: new Date("2024-06-01"),
        residencePeriodMonths: 60,
        rentalHousingException: {
          applyException: true,
          scenario: "A",
          rentalUnits: [unitOk],
          priorRentalExemptionHistory: "used",
        },
      }),
      rates,
    );
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBeGreaterThan(0);
    expect(r.steps.some((s) => s.formula.includes(LIFE))).toBe(true);
  });

  it("OH40-8 전엔진: 이력 미입력 + 요건 충족 → 비과세 + warnings에 판정 보류 고지(STEP 1a 경로)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: new Date("2019-06-01"),
        transferDate: new Date("2024-06-01"),
        residencePeriodMonths: 60,
        rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [unitOk] },
      }),
      rates,
    );
    expect(r.isExempt).toBe(true);
    expect((r.warnings ?? []).join()).toContain(LIFE);
  });
});

describe("OH-40 직전거주주택보유주택(B) 1주택 한정", () => {
  const PHRP = "1주택 외의 주택을 모두 양도";
  const ctxB = (acq: string, tr: string, extra: Record<string, unknown> = {}) => ({
    scenario: "B" as const,
    residenceAcquisitionDate: new Date(acq),
    transferDate: new Date(tr),
    postRegistrationResidenceMonths: 36,
    ...extra,
  });

  it("OH40-B1 PHRP 취득 2019-06-01 · 양도 2024-06-01 · 임대주택 계속 보유 → 적용 불가(리뷰 B-life)", () => {
    const e = checkEligibility([unitOk], 5, 5, false, ctxB("2019-06-01", "2024-06-01"));
    expect(e.passed).toBe(false);
    expect(e.residenceFailReasons.join()).toContain(PHRP);
  });

  it("OH40-B2 경계 짝: 2019-02-11 취득 → 한정 없음", () => {
    const e = checkEligibility([unitOk], 5, 5, false, ctxB("2019-02-11", "2024-06-01"));
    expect(e.residenceFailReasons.join()).not.toContain(PHRP);
    expect(e.passed).toBe(true);
  });

  it("OH40-B3 경계 짝: 2025-02-28 양도 → 한정 없음", () => {
    const e = checkEligibility([unitOk], 5, 5, false, ctxB("2019-06-01", "2025-02-28"));
    expect(e.passed).toBe(true);
  });
});

describe("계획서 §7-5 확인 필요 분기 — 경고만(결론 불변)", () => {
  const unitMa: RentalUnitInput = {
    ...unitOk,
    businessRegistrationDate: new Date("2021-01-01"),
    rentalRegistrationDate: new Date("2021-01-01"),
  };
  it("N-1 2019-02-12 전 취득 거주주택 + 마목 임대주택 → 통과 + 확인 필요 고지", () => {
    const e = checkEligibility([unitMa], 5, 5, false, {
      scenario: "A",
      residenceAcquisitionDate: new Date("2018-01-01"),
      transferDate: new Date("2026-06-01"),
    });
    expect(e.perUnitVerdict?.[0].derivedArticle).toBe("마");
    expect(e.passed).toBe(true);
    expect((e.notices ?? []).join()).toContain("확인이 필요");
  });
  it("N-2 짝: 같은 거주주택 + 가목 임대주택 → 고지 없음", () => {
    const e = checkEligibility([unitOk], 5, 5, false, {
      scenario: "A",
      residenceAcquisitionDate: new Date("2018-01-01"),
      transferDate: new Date("2026-06-01"),
    });
    expect(e.notices ?? []).toHaveLength(0);
  });
});
