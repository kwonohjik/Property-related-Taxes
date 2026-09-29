/**
 * E-1 한계 G5 — §155⑳ 시나리오 A **미충족** + 세대 주택 수 1(「임대주택 주택수 제외」 안내대로 입력) (엔진 공통).
 *
 * 영 §155⑳ 「… 국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다」가 불성립하면 임대주택은 주택
 * 수에 들어가고 세대는 1주택이 아니다 ⇒ 비과세 · 12억 초과분 안분(법 §95③ · 영 §160①) · 표2(영 §159의4)가 모두 없다.
 * 종전(F3)은 STEP 1a 조기반환만 막아 하류가 주택 수 1을 봤다 — 12억 초과 거주주택이면 **안분까지** 받았다.
 * 판정 전에 주택 수를 되돌리는 `restoreRentalUnitsToHouseCount`(STEP 0.96)가 정본이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

/** 기준시가 상한(수도권 6억) 초과 → 요건 불충족 */
const capFail: RentalUnitInput = {
  businessRegistrationDate: new Date("2018-06-01"),
  rentalRegistrationDate: new Date("2018-06-01"),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 700_000_000,
  hasMinimum2Units: false,
  rentalMonths: 96,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};

const input = (count: number, over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2025-03-03"),
    acquisitionPrice: 700_000_000,
    acquisitionDate: new Date("2012-08-12"),
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: count,
    residencePeriodMonths: 60,
    rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [capFail] },
    ...over,
  });

describe("G5 — A 미충족이면 임대주택을 주택 수에 되돌린다", () => {
  it("RA-1 ★ 15억 거주주택 · 주택 수 1: 12억 초과분 안분·표2 없이 전액 과세 — 주택 수 2 입력과 같은 세액", () => {
    const one = calculateTransferTax(input(1), rates);
    const two = calculateTransferTax(input(2), rates);
    expect(one.isExempt).toBe(false);
    expect(one.isPartialExempt).toBe(false);
    expect(one.exemptReason).toBeUndefined();
    expect(one.taxableGain).toBe(800_000_000);
    expect(one.longTermHoldingRate).toBe(0.24); // 표1 — 보유 12년 6개월
    expect(one.totalTax).toBe(two.totalTax);
    expect(one.warnings?.some((w) => w.includes("임대주택 1호를 세대 주택 수에 넣어(2주택)"))).toBe(true);
  });

  it("RA-2 부정 짝 — 요건을 채우면(기준시가 6억 이하) 주택 수 1 그대로 특례 적용(12억 초과분 과세 · 사유 §155⑳)", () => {
    const ok = calculateTransferTax(
      input(1, { rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [{ ...capFail, standardPriceAtRentalStart: 300_000_000 }] } }),
      rates,
    );
    expect(ok.warnings?.some((w) => w.includes("세대 주택 수에 넣어")) ?? false).toBe(false);
    expect(ok.taxableGain).toBeLessThan(800_000_000);
  });

  it("RA-3 부정 짝 — 주택 수 2 이상은 건드리지 않는다(임대주택을 이미 센 입력 — 이중 계상 방지) · B 시나리오는 종전 고지", () => {
    const two = calculateTransferTax(input(2), rates);
    expect(two.warnings?.some((w) => w.includes("세대 주택 수에 넣어")) ?? false).toBe(false);
    const b = calculateTransferTax(
      input(1, {
        rentalHousingException: {
          applyException: true,
          scenario: "B",
          rentalUnits: [capFail],
          priorResidenceTransferDate: new Date("2020-08-25"),
          standardPriceAtAcquisition: 300_000_000,
          standardPriceAtPriorTransfer: 450_000_000,
          standardPriceAtTransfer: 500_000_000,
          postRegistrationResidenceMonths: 60,
        },
      }),
      rates,
    );
    expect(b.warnings?.some((w) => w.includes("세대 주택 수에 넣어")) ?? false).toBe(false);
  });
});
