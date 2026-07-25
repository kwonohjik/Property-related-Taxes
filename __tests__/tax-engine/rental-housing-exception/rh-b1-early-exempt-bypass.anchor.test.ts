/**
 * anchor: §155⑳·§161 시나리오 B — STEP 1a 전액 비과세 조기 반환 우회 버그 (P1~P6)
 *
 * 계획서: docs/02-design/features/rental-housing-prhp-161-early-exempt-bypass.plan.md
 * 버그 1: B(임대→거주 전환 양도)에서 일반 1세대1주택 요건 충족 시 STEP 1a가 먼저 발동해
 *         §161① 안분(STEP 2.5) 미도달 → 전액 비과세 오답.
 * 버그 2: buildExemptEarlyResult가 estimatedBase·estimatedDeduction 미echo →
 *         신고서 취득가액에 환산취득가+개산공제 합산 표시(분리표시 정책 위반).
 *
 * P1 기대값 = 기존 단위 anchor(rh-b1-prhp-under-12.test.ts, 사례문제 PDF#1 사례 25)와 동일 상수:
 *   전체 양도차익 311,000,000 (환산 480M + 개산 9M) / 표1 장특 80,860,000 /
 *   §95① 230,140,000 / §161① 75% → 과세 172,605,000 · 비과세 57,535,000 / 산출세액 44,699,900
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

const rentalUnitOk = {
  businessRegistrationDate: new Date("2016-06-01"),
  rentalRegistrationDate: new Date("2016-06-01"),
  rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const,
  isApartment: false,
  region: "seoul-metro" as const,
  isRegulatedAreaNewAcq: false,
  standardPriceAtRentalStart: 300_000_000,
  hasMinimum2Units: false,
  rentalMonths: 96,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};

/** PDF#1 사례 25 — B 시나리오 전엔진 입력 (환산취득가 480M + 개산 9M → gain 311M) */
const scenarioBInput = (extra?: Partial<TransferTaxInput>): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    transferDate: new Date("2023-03-03"),
    acquisitionPrice: 0,
    acquisitionDate: new Date("2009-08-12"),
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 300_000_000,
    standardPriceAtTransfer: 500_000_000,
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 1, // 임대주택 주택수 제외 특례 전제 (UI 안내대로 1채 입력)
    residencePeriodMonths: 24,
    rentalHousingException: {
      applyException: true,
      scenario: "B",
      rentalUnits: [rentalUnitOk],
      priorResidenceTransferDate: new Date("2016-08-25"),
      standardPriceAtAcquisition: 300_000_000,
      standardPriceAtPriorTransfer: 450_000_000,
      standardPriceAtTransfer: 500_000_000,
    },
    ...extra,
  });

describe("P1~P3: 시나리오 B — STEP 1a 조기 반환 억제 (§161① 안분 도달)", () => {
  it("P1: B + 일반 비과세 요건 충족 → §161① 75% 안분 (전액 비과세 아님) — PDF 사례 25", () => {
    const r = calculateTransferTax(scenarioBInput(), rates);
    // 현행 RED: isExempt=true 전액 비과세 (STEP 1a 조기 반환)
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.rentalHousingExceptionDetail?.scenarioId).toBe("RH-B1");
    expect(r.rentalHousingExceptionDetail?.taxableGain).toBe(172_605_000);
    expect(r.rentalHousingExceptionDetail?.exemptGain).toBe(57_535_000);
    expect(r.longTermHoldingDeduction).toBe(80_860_000); // 표1 26%
    expect(r.calculatedTax).toBe(44_699_900);
    expect(r.isExempt).toBe(false);
  });

  it("P2(회귀): 시나리오 A + 전액 비과세 요건 충족 → STEP 1a 전액 비과세 유지", () => {
    const r = calculateTransferTax(
      scenarioBInput({
        rentalHousingException: {
          applyException: true,
          scenario: "A",
          rentalUnits: [rentalUnitOk],
        },
      }),
      rates,
    );
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("P3: B + 임대 요건 미충족(applied=false) → 과세 경로 + steps 사유 + warnings 재확인 안내", () => {
    const r = calculateTransferTax(
      scenarioBInput({
        rentalHousingException: {
          applyException: true,
          scenario: "B",
          rentalUnits: [{ ...rentalUnitOk, rentalMonths: 12 }], // 의무임대기간 미충족
          priorResidenceTransferDate: new Date("2016-08-25"),
          standardPriceAtAcquisition: 300_000_000,
          standardPriceAtPriorTransfer: 450_000_000,
          standardPriceAtTransfer: 500_000_000,
        },
      }),
      rates,
    );
    // 침묵 비과세 소급 금지 — 특례 전제(주택수 1채) 무효 가능 → 과세 + 재확인 경고
    expect(r.isExempt).toBe(false);
    expect(r.rentalHousingExceptionDetail).toBeUndefined();
    expect(r.determinedTax).toBeGreaterThan(0);
    expect(r.steps.some((s) => s.label.includes("장기임대주택 거주주택 비과세 특례"))).toBe(true);
    expect(r.warnings?.some((w) => w.includes("주택수"))).toBe(true);
  });

  it("P7(F3): 시나리오 A + 임대 요건 미충족 + count=1 → 과세 (STEP 1a 조기반환 억제, over-exemption 차단)", () => {
    const r = calculateTransferTax(
      scenarioBInput({
        rentalHousingException: {
          applyException: true,
          scenario: "A",
          rentalUnits: [{ ...rentalUnitOk, rentalMonths: 12 }], // 의무임대기간 미충족 → eligibility 실패
        },
      }),
      rates,
    );
    // 수정 전 RED: STEP 1a가 eligibility 우회 조기반환 → isExempt=true, totalTax=0 (over-exemption)
    expect(r.isExempt).toBe(false);
    expect(r.rentalHousingExceptionDetail).toBeUndefined();
    expect(r.determinedTax).toBeGreaterThan(0);
    // STEP 2.5가 "적용 불가" 사유를 steps에 기록 (침묵 실패 차단)
    expect(r.steps.some((s) => s.label.includes("적용 불가"))).toBe(true);
  });
});

describe("P4~P6: 전액 비과세 + 환산취득가 — 개산공제 분리 표시 (버그 2)", () => {
  // 특례 없는 일반 전액 비과세 + 환산 (양도 800M · 기준시가 300/500 → 환산 480M · 개산 9M · gross 311M)
  const exemptEstimatedInput = (): TransferTaxInput =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 800_000_000,
      transferDate: new Date("2023-03-03"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("2009-08-12"),
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 300_000_000,
      standardPriceAtTransfer: 500_000_000,
      expenses: 0,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 24,
    });

  it("P4: buildExemptEarlyResult가 estimatedBase·estimatedDeduction echo", () => {
    const r = calculateTransferTax(exemptEstimatedInput(), rates);
    expect(r.isExempt).toBe(true);
    expect(r.exemptGrossGain).toBe(311_000_000);
    // 현행 RED: undefined
    expect(r.estimatedBase).toBe(480_000_000);
    expect(r.estimatedDeduction).toBe(9_000_000);
  });

  it("P5: 신고서 — 취득가액 480,000,000(환산) / 필요경비 9,000,000(개산공제) 분리 표시", () => {
    const r = calculateTransferTax(exemptEstimatedInput(), rates);
    const rows = buildRows(r, "single", undefined, undefined, 800_000_000);
    const val = (label: string) => rows.find((x) => x.label === label)?.values["total"] ?? null;
    // 현행 RED: 취득가액 489,000,000 (합산) · 필요경비 null
    expect(val("취득가액")).toBe(480_000_000);
    expect(val("필요경비")).toBe(9_000_000);
    expect(val("전체 양도차익")).toBe(311_000_000);
  });

  it("P6(회귀): 실가 전액 비과세 — 역산 취득가액 표시 불변", () => {
    const r = calculateTransferTax(baseTransferInput(), rates); // 실가 5억→3억, gross 2억
    const rows = buildRows(r, "single", undefined, undefined, 500_000_000);
    const val = (label: string) => rows.find((x) => x.label === label)?.values["total"] ?? null;
    expect(val("취득가액")).toBe(300_000_000);
  });
});
