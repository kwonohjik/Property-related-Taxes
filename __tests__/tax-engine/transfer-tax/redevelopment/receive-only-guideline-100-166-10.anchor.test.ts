/**
 * 청산금 수령분 단독 신고 — 양도소득세 집행기준 100-166-10 anchor.
 *
 *   양도가액 = 지급받은 청산금
 *   취득가액 = (기존건물과 딸린 토지의 취득가액 + 필요경비 등) × (청산금 수령액 ÷ 평가액)
 *
 * 사례: 취득가액 50,000천원 · 평가액 120,000천원 · 지급받은 청산금 20,000천원
 *   양도차익 11,667천원 = 20,000천원 − [50,000천원 × (20,000천원 / 120,000천원)]
 *
 * 🔴 시행령 §166①2호 가목([양도가액 − (평가액 − 지급받은 청산금) − 필요경비])의 값이 아니다 —
 *    같은 입력을 가목에 넣으면 −80,000천원이다.
 */
import { describe, expect, it } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { redevBranchTotals } from "@/lib/tax-engine/redev-acquisition-inverse";
import { redevFilingTotals } from "@/lib/tax-engine/redev-acquisition-inverse";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case46RedevelopmentInfo } from "./_helpers";

function calc(preApprovalExpenses: number, postApprovalExpenses: number) {
  const detail = calculateTransferTax(
    baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 20_000_000,
      transferDate: new Date("2023-02-17"),
      acquisitionDate: new Date("2016-05-06"),
      acquisitionPrice: 50_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      redevelopment: {
        ...case46RedevelopmentInfo(),
        rightsValue: 120_000_000,
        settlementAmount: 20_000_000,
        preApprovalExpenses,
        postApprovalExpenses,
      },
    }),
    makeMockRates(),
  ).redevelopmentDetail;
  if (!detail) throw new Error("redevelopmentDetail 없음");
  return detail;
}

describe("집행기준 100-166-10", () => {
  it("사례 — 필요경비가 없으면 양도차익 11,666,667 (사례의 11,667천원)", () => {
    const { settlement } = calc(0, 0);
    expect(settlement.apportionedTransfer).toBe(20_000_000);
    expect(settlement.apportionedAcquisition).toBe(8_333_333);
    expect(settlement.expenses).toBe(0);
    expect(settlement.gain).toBe(11_666_667);
  });

  // (50,000,000 + 12,000,000) ÷ 6 = 10,333,333 → 20,000,000 − 10,333,333 = 9,666,667
  it("인가전 필요경비 + 자본적지출·양도비를 합쳐 청산금 비율로 안분해 뺀다", () => {
    const { settlement } = calc(6_000_000, 6_000_000);
    expect(settlement.expenses).toBe(2_000_000);
    expect(settlement.gain).toBe(9_666_667);
  });

  // (50,000,000 + 1,000,000) ÷ 6 = 8,500,000 → 20,000,000 − 8,500,000 = 11,500,000
  it("나누어떨어지지 않는 필요경비도 잔액 흡수로 안분한다", () => {
    const { settlement } = calc(1_000_000, 0);
    expect(settlement.expenses).toBe(166_667);
    expect(settlement.gain).toBe(11_500_000);
  });

  // 취득가액 환산 = 120,000,000 × 60,000,000 ÷ 120,000,000 = 60,000,000 → 안분 10,000,000
  // 개산공제 = 60,000,000 × 3% = 1,800,000 → 안분 300,000 / 실비 칸은 택일이라 쓰이지 않는다
  it("환산이면 개산공제를 안분하고 실비는 쓰지 않는다", () => {
    const { settlement } = calculateTransferTax(
      baseTransferInput({
        propertyType: "redevelopment_apt",
        transferPrice: 20_000_000,
        transferDate: new Date("2023-02-17"),
        acquisitionDate: new Date("2016-05-06"),
        acquisitionPrice: 0,
        expenses: 0,
        useEstimatedAcquisition: true,
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
        redevelopment: {
          ...case46RedevelopmentInfo(),
          rightsValue: 120_000_000,
          settlementAmount: 20_000_000,
          preApprovalExpenses: 6_000_000,
          postApprovalExpenses: 6_000_000,
          acquisitionHousingPrice: 60_000_000,
          managementDisposalHousingPrice: 120_000_000,
        },
      }),
      makeMockRates(),
    ).redevelopmentDetail!;
    expect(settlement.apportionedAcquisition).toBe(10_000_000);
    expect(settlement.expenses).toBe(300_000);
    expect(settlement.gain).toBe(9_700_000);
  });

  // 증여세 상당액 6,000,000 × 20,000,000 ÷ 120,000,000 = 1,000,000 → 11,666,667 − 1,000,000
  it("이월과세 증여세 상당액도 같은 비율로 안분하고, 공제한 몫만 보고한다", () => {
    const detail = calculateTransferTax(
      baseTransferInput({
        propertyType: "redevelopment_apt",
        transferPrice: 20_000_000,
        transferDate: new Date("2023-02-17"),
        acquisitionDate: new Date("2016-05-06"),
        acquisitionPrice: 50_000_000,
        expenses: 0,
        useEstimatedAcquisition: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
        carryoverGiftTaxExpense: 6_000_000,
        redevelopment: { ...case46RedevelopmentInfo(), rightsValue: 120_000_000, settlementAmount: 20_000_000 },
      }),
      makeMockRates(),
    ).redevelopmentDetail!;
    expect(detail.settlement.expenses).toBe(1_000_000);
    expect(detail.settlement.gain).toBe(10_666_667);
    expect(detail.carryoverGiftTaxApplied).toBe(1_000_000);
    expect(detail.preApproval.expenses).toBe(0);
  });

  it("미신고 파트에는 필요경비를 붙이지 않고, 합계는 차익·경비가 맞물린다", () => {
    const detail = calc(6_000_000, 6_000_000);
    expect(detail.preApproval.expenses).toBe(0);
    expect(detail.postApprovalExistingHouse.expenses).toBe(0);
    expect(detail.preApproval.gain).toBe(0);
    expect(detail.postApprovalExistingHouse.gain).toBe(0);
    expect(detail.total.gain).toBe(9_666_667);
    expect(redevBranchTotals(detail).expenses).toBe(2_000_000);
    expect(redevBranchTotals(detail).gain).toBe(9_666_667);
    expect(redevFilingTotals(detail, 20_000_000).acquisition).toBe(8_333_333);
  });
});
