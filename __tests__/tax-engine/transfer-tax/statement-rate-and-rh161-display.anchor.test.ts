/**
 * anchor: 상세명세서·자산별 카드의 두 표시 결함 (UI 리뷰 高 2건).
 *
 * ① `surcharge-rate-double-count` — `appliedRate`는 **이미 중과 포함 실효세율**인데
 *    (`transfer-tax-rate-calc.ts:410` · 타입 주석 `transfer-aggregate.types.ts:191`)
 *    표시부가 `surchargeRate`를 다시 더해, 비사업용 토지(45% + 10%p = 실효 55%)가 **65%**로
 *    찍히고 금액은 55%로 낸 값이라 **산술적으로 성립하지 않는 등식**이 출력됐다.
 *    `resolveRefCalculatedTax`는 fallback **계산**이라 라벨이 아니라 금액이 틀렸다.
 *
 * ② `rh161-income-double-deduct` — §161(장기임대주택 보유자 거주주택 비과세) 경로에서 엔진은
 *    `taxableGain` 슬롯에 **이미 장특공제·안분이 끝난** 양도소득금액을 담는다
 *    (`transfer-tax-rental-housing-step.ts:617`). 명세서가 거기서 장특공제를 또 빼
 *    「감면후 소득금액」이 「양도소득금액」보다 **커지는** 자기모순이 남았다.
 *    신고서 카드(`FilingFormTableHelpers.ts:603`)는 이미 옳은 분기를 쓰고 있었다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildCalculatedTaxFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { resolveRefCalculatedTax } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const rates = makeMockRates();

// ── ① 중과 세율 표시 ────────────────────────────────────────────────
/** 비사업용 토지: 기본 45% + 중과 10%p → 엔진이 싣는 실효세율은 55%다. */
function breakdown(over: Partial<PerPropertyBreakdown> = {}): PerPropertyBreakdown {
  return {
    propertyId: "p1",
    label: "토지",
    appliedRate: 0.55,
    surchargeRate: 0.1,
    taxBaseShare: 1_000_000_000,
    progressiveDeduction: 25_940_000,
    refCalculatedTax: 524_060_000,
    ...over,
  } as unknown as PerPropertyBreakdown;
}

describe("① 자산별 산출세액 — 중과세율을 두 번 더하지 않는다", () => {
  it("🔑 명세서 산식이 실효세율(55%)로 찍힌다 — 65% 아님", () => {
    const f = buildCalculatedTaxFormula(breakdown());
    expect(f).toContain("55%");
    expect(f).not.toContain("65%");
  });

  it("중과 사실은 세율을 더하는 대신 문구로 알린다", () => {
    expect(buildCalculatedTaxFormula(breakdown())).toContain("중과 포함");
    expect(buildCalculatedTaxFormula(breakdown({ surchargeRate: undefined }))).not.toContain(
      "중과 포함",
    );
  });

  it("🔑 fallback 계산도 실효세율만 쓴다 — 여기서는 라벨이 아니라 **금액**이 틀렸다", () => {
    // refCalculatedTax가 없으면 자체 계산으로 내려간다(옛 저장 이력·HMR).
    const v = resolveRefCalculatedTax(breakdown({ refCalculatedTax: undefined }));
    expect(v).toBe(Math.max(0, Math.floor(1_000_000_000 * 0.55) - 25_940_000));
    // 종전 식(0.55 + 0.10 = 0.65)이면 1억원 더 크다.
    expect(v).not.toBe(Math.max(0, Math.floor(1_000_000_000 * 0.65) - 25_940_000));
  });

  it("엔진 값이 있으면 그대로 쓴다 (fallback은 보조)", () => {
    expect(resolveRefCalculatedTax(breakdown())).toBe(524_060_000);
  });
});

// ── ② §161 양도소득금액 ────────────────────────────────────────────
const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: new Date("2018-06-01"),
      rentalRegistrationDate: new Date("2018-06-01"),
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
    },
  ],
};

const RH_INPUT: TransferTaxInput = baseTransferInput({
  propertyType: "housing",
  transferPrice: 1_500_000_000,
  acquisitionPrice: 1_100_000_000,
  acquisitionDate: new Date("2014-06-01"),
  transferDate: new Date("2024-06-01"),
  residencePeriodMonths: 60,
  isOneHousehold: true,
  householdHousingCount: 1,
  expenses: 0,
  rentalHousingException: rentalException,
});

const formData = { assets: [] } as unknown as TransferFormData;

describe("② §161 거주주택 비과세 — 장특공제를 두 번 빼지 않는다", () => {
  const result = calculateTransferTax(RH_INPUT, rates);

  it("전제: §161 특례 경로로 들어간다", () => {
    expect(result.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(result.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("🔑 양도소득금액 = 전체 양도차익 − 장특공제 (신고서 카드와 같은 식)", () => {
    const items = buildStatementItems(result, formData, undefined, undefined, 1_500_000_000);
    expect(items.get("incomeAmount")!.value).toBe(
      result.transferGain - result.longTermHoldingDeduction,
    );
  });

  it("🔴 감면후 소득금액이 양도소득금액보다 크지 않다 (표 자기모순 해소)", () => {
    const items = buildStatementItems(result, formData, undefined, undefined, 1_500_000_000);
    const income = items.get("incomeAmount")!.value as number;
    const after = items.get("incomeAmountAfter")!.value as number;
    expect(after).toBeLessThanOrEqual(income);
  });

  it("차이는 비과세 양도소득금액(소령 §161①) 행이 설명한다", () => {
    const items = buildStatementItems(result, formData, undefined, undefined, 1_500_000_000);
    const income = items.get("incomeAmount")!.value as number;
    const after = items.get("incomeAmountAfter")!.value as number;
    expect(items.get("nontaxableIncome")!.value).toBe(income - after);
  });

  it("§161이 아닌 일반 케이스는 종전 식 그대로 (회귀 0)", () => {
    const plain = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 1_500_000_000,
        acquisitionPrice: 1_100_000_000,
        acquisitionDate: new Date("2014-06-01"),
        transferDate: new Date("2024-06-01"),
        isOneHousehold: false,
        householdHousingCount: 2,
        expenses: 0,
      }),
      rates,
    );
    const items = buildStatementItems(plain, formData, undefined, undefined, 1_500_000_000);
    expect(items.get("incomeAmount")!.value).toBe(
      Math.max(0, plain.taxableGain - plain.longTermHoldingDeduction),
    );
  });
});
