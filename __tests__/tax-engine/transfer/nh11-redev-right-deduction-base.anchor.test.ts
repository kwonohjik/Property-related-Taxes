/**
 * anchor — NH-11 (Q-21 a 인가 전 기초식) — 원조합원 **입주권** 양도의 §99·§99의3 차감 기초 = 관리처분계획 인가 전 양도소득금액
 * (기획재정부 재산세제과-694 · 사전-2021-법령해석재산-1339 「당초 취득한 신축주택에 대한 양도소득 범위 내」).
 * 리뷰(`docs/reviews/new-housing-99-review-2026-11.md`) S1: 144,443,998 → 178,044,000 (+33,600,002).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { newHouseDeductionBase } from "@/lib/tax-engine/transfer-reductions/new-99-redev-right-base";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 리뷰 F-106 시료 S1 — 원조합원 입주권 · 종전주택(§99의3 1호 신축주택) 2002 계약 · 인가 2016-03-01 · 양도 2024-06-01 */
function rightS1(withReduction: boolean, over: Record<string, unknown> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: 700_000_000,
      transferDate: D("2024-06-01"),
      acquisitionDate: D("2004-06-30"),
      acquisitionPrice: 150_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      householdRightCount: 1,
      residencePeriodMonths: 0,
      assetContractDate: D("2002-03-01"),
      redevelopment: {
        subject: "right",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: D("2016-03-01"),
        rightsValue: 350_000_000,
        settlementDirection: "pay",
        settlementAmount: 0,
        preApprovalExpenses: 0,
        postApprovalExpenses: 0,
        originalAssetType: "housing",
        isSuccessorMember: false,
      },
      reductions: withReduction
        ? [
            {
              type: "new_99_3",
              contractDate993: D("2002-03-01"),
              acquisitionType993: "from_builder",
              firstContract993: "yes",
              region993: "outside_speculation",
              isResident993: true,
              isHousingConstructionBusiness993: false,
              exclusiveAreaSqm993: 84,
              standardPriceAtAcquisition993: 100_000_000,
              standardPriceAt5Years: 180_000_000,
              standardPriceAtTransfer993: 400_000_000,
            },
          ]
        : [],
      ...over,
    } as never) as TransferTaxInput,
    rates,
  );
}

describe("NH-11 — 원조합원 입주권 §99의3 차감 기초 = 인가 전 양도소득금액", () => {
  it("S1: 기초 156,000,000(인가 전 차익 200,000,000 − 장특 44,000,000) × 80,000,000/300,000,000 = 41,600,000 · 총세액 178,044,000", () => {
    const r = rightS1(true);
    expect(r.new993Detail?.isEligible).toBe(true);
    expect(r.new993Detail?.transferIncomeApplied).toBe(156_000_000);
    expect(r.new993Detail?.reducibleTransferIncome).toBe(41_600_000);
    expect(r.totalTax).toBe(178_044_000);
    // 고지 — 기초를 제한한 사실과 해석
    expect(r.new993Detail?.warnings?.some((w) => w.includes("재산세제과-694") && w.includes("156,000,000"))).toBe(true);
  });

  it("감면 미선택 대조 193,083,000 — 감면은 여전히 세액을 줄인다", () => {
    expect(rightS1(false).totalTax).toBe(193_083_000);
  });

  it("기초 판정 leaf — 승계조합원·완공 아파트·다른 차감형과 함께 고른 경우는 제한하지 않는다", () => {
    const res = { preApproval: { gain: 200, lthd: 44 }, total: { taxableIncome: 506 } } as never;
    expect(newHouseDeductionBase({ subject: "right", isSuccessorMember: false }, res, [{ type: "new_99_3" }])).toEqual({ base: 156, totalIncome: 506 });
    expect(newHouseDeductionBase({ subject: "right", isSuccessorMember: false }, res, [{ type: "new_99" }])?.base).toBe(156);
    expect(newHouseDeductionBase({ subject: "right", isSuccessorMember: true }, res, [{ type: "new_99_3" }])).toBeUndefined();
    expect(newHouseDeductionBase({ subject: "apt", isSuccessorMember: false }, res, [{ type: "new_99_3" }])).toBeUndefined();
    expect(newHouseDeductionBase({ subject: "right", isSuccessorMember: false }, res, [{ type: "unsold_98_3" }])).toBeUndefined();
    // 인가 후 차익이 음수(청산금 납부 후 손실)면 전체 양도소득금액이 상한 — 「범위 내」
    const loss = { preApproval: { gain: 600, lthd: 96 }, total: { taxableIncome: 404 } } as never;
    expect(newHouseDeductionBase({ subject: "right", isSuccessorMember: false }, loss, [{ type: "new_99_3" }])?.base).toBe(404);
  });
});

