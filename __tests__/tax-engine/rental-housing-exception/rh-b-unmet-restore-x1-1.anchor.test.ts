/**
 * 결정 #19(X1-1) anchor — §155⑳ **시나리오 B(직전거주주택보유주택) 불충족**도 임대주택을 주택 수에 되돌려 1세대1주택 비과세를 거둔다.
 *
 * 영 §155⑳ 후단의 §161①은 「요건을 충족한 경우」에 이어지는 문장이다(「이 경우」 — 전단 충족 전제). 불충족이면 남은 임대주택은 그냥 주택이라
 * §154① 비과세·12억 안분·표2(영 §159의4)가 모두 없다. 판정 메뉴(`applyRentalHousingVerdict`)는 이미 과세로 답한다.
 * 종전 계산기는 B에서 임대주택을 되돌리지 않아 부분 비과세·표2를 그대로 냈다 — 불충족 세액이 충족 세액보다 적은 역전이 났다.
 *
 * 시료(mock 세율): 양도 2023-03-03 · 취득 2009-08-12(4억) · 거주 60개월 · 직전거주주택 양도 2016-08-25 · 임대 1호(기준시가 상한 초과 = 불충족).
 * 기준시가 3·4.5·5억(§161① 비율 0.75). 충족 짝은 기준시가 3억 임대주택.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

const unit = (over: Partial<RentalUnitInput> = {}): RentalUnitInput => ({
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
  ...over,
});
const CAP_FAIL = { standardPriceAtRentalStart: 700_000_000 };

const input = (
  price: number,
  count: number,
  units: RentalUnitInput[],
  over: Partial<TransferTaxInput> = {},
  rh: Record<string, unknown> = {},
): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: price,
    transferDate: new Date("2023-03-03"),
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2009-08-12"),
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: count,
    residencePeriodMonths: 60,
    rentalHousingException: {
      applyException: true,
      scenario: "B",
      rentalUnits: units,
      priorResidenceTransferDate: new Date("2016-08-25"),
      standardPriceAtAcquisition: 300_000_000,
      standardPriceAtPriorTransfer: 450_000_000,
      standardPriceAtTransfer: 500_000_000,
      postRegistrationResidenceMonths: 60,
      ...rh,
    },
    ...over,
  } as Partial<TransferTaxInput>);

/** 같은 사실을 「임대주택 포함 주택 수 2」로 입력하고 특례를 선언하지 않은 기준선 */
const baseline = (price: number) =>
  calculateTransferTax(
    input(price, 2, [], {}, { applyException: false }),
    rates,
  );

describe("X1-1 B 불충족 — 임대주택을 주택 수에 되돌린다", () => {
  it("B-1 ★ 15억 · 주택 수 1 · 임대 1호(상한 초과) → 부분 비과세·표2 없이 전액 과세 — 주택 수 2 기준선과 같은 세액", () => {
    const r = calculateTransferTax(input(1_500_000_000, 1, [unit(CAP_FAIL)]), rates);
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(false);
    expect(r.exemptReason).toBeUndefined();
    expect(r.rentalHousingExceptionDetail).toBeUndefined();
    const base = baseline(1_500_000_000);
    expect(r.totalTax).toBe(base.totalTax);
    expect(r.longTermHoldingRate).toBe(base.longTermHoldingRate);
    expect(r.longTermHoldingRate).toBe(0.26); // 표1(보유 13년) — 종전 표2 60%
    expect(r.totalTax).toBe(335_379_000); // 전 16,236,000(부분 비과세 · 표2)
  });
  it("B-2 ★ 10억(12억 이하) 불충족 → 전액 비과세가 아니라 과세 — 주택 수 2 기준선과 같은 세액", () => {
    const r = calculateTransferTax(input(1_000_000_000, 1, [unit(CAP_FAIL)]), rates);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(baseline(1_000_000_000).totalTax);
    expect(r.totalTax).toBe(165_726_000); // 전 77,341,000(표2 60%)
  });
  it("B-3 고지 — 임대 호수·주택 수·표2/안분 미적용·§161 미적용·다른 특례는 보유 주택 목록 입력, 「일반 과세 경로로 계산되었습니다」는 쓰지 않는다", () => {
    const r = calculateTransferTax(input(1_500_000_000, 1, [unit(CAP_FAIL)]), rates);
    const w = (r.warnings ?? []).find((x) => x.includes("세대 주택 수에 넣어")) ?? "";
    expect(w).toContain("임대주택 1호");
    expect(w).toContain("(2주택)");
    expect(w).toContain("12억 초과분 안분");
    expect(w).toContain("소득세법 시행령 §161① 안분도 적용하지 않았습니다");
    expect(w).toContain("「보유 주택 목록」에 임대주택을 취득일과 함께 넣어야 판정합니다"); // F-1 Q-4 — 주택 수만으로는 판정되지 않는다
    expect(w).not.toContain("일반 과세 경로로 계산되었습니다");
  });
  it("B-4 ★ 긍정 짝 — 요건 충족(상한 이내)이면 §161① 안분 그대로 (세액 불변 · 되돌림 고지 없음)", () => {
    const ok = calculateTransferTax(input(1_500_000_000, 1, [unit()]), rates);
    expect(ok.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(ok.rentalHousingExceptionDetail?.scenarioId).toBe("RH-B2");
    expect((ok.warnings ?? []).some((x) => x.includes("세대 주택 수에 넣어"))).toBe(false);
  });
  it("B-5 ★ 회귀 가드 — 불충족 세액이 충족 세액보다 적지 않다 (12억 이하 · §161① 비율 0.5 초과 시료 포함)", () => {
    for (const price of [800_000_000, 1_000_000_000, 1_500_000_000]) {
      const unmet = calculateTransferTax(input(price, 1, [unit(CAP_FAIL)]), rates);
      const met = calculateTransferTax(input(price, 1, [unit()]), rates);
      expect(unmet.totalTax).toBeGreaterThanOrEqual(met.totalTax);
    }
  });
  it("B-6 이중 계상 방지 — 주택 수 2 이상(임대주택을 이미 센 입력)은 건드리지 않는다 (명부 없음)", () => {
    const r = calculateTransferTax(input(1_500_000_000, 2, [unit(CAP_FAIL)]), rates);
    expect((r.warnings ?? []).some((x) => x.includes("세대 주택 수에 넣어"))).toBe(false);
    expect(r.totalTax).toBe(baseline(1_500_000_000).totalTax);
  });
  it("B-7 0호 짝(§154⑩ 경로) — 되돌릴 임대주택은 없지만 §154⑩ 불충족이면 12억 초과도 비과세를 거둔다 (사용자 결정 2026-10-12)", () => {
    const r = calculateTransferTax(
      input(1_500_000_000, 1, [], {}, { wasRegisteredRentalOrChildcare: false }),
      rates,
    );
    expect((r.warnings ?? []).some((x) => x.includes("세대 주택 수에 넣어"))).toBe(false);
    // 종전에는 부분 비과세가 남고 「주택수에 산입될 수 있어」 재확인 고지만 붙었다
    expect(r.isPartialExempt || r.isExempt).toBe(false);
    expect((r.warnings ?? []).some((x) => x.includes("영 §154⑩ 거주요건 특례가 요건을 충족하지 못해"))).toBe(true);
    expect((r.warnings ?? []).some((x) => x.includes("주택수에 산입될 수 있어"))).toBe(false);
  });
});
