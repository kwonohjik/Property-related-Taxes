/**
 * 양도세 §97② 2호 단서 swap 로직 — 케이스 인벤토리 anchor 테스트.
 *
 * 디자인: docs/02-design/features/transfer-tax-acq-cost-swap.engine.design.md
 *
 * 케이스 1~5, 8 (split·multi-parcel은 별도 파일)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

/**
 * 결과에서 양도차익(gain) 추출.
 * `result.amount` 단계 중 "양도차익" 라벨로 노출되거나 또는 final calculation steps에 등장.
 * 여기서는 result.calculatedTax 대신 양도차익 직접 검증을 위해 calcTransferGain을 별도 import.
 */
import { calcTransferGain } from "@/lib/tax-engine/transfer-tax-helpers";

describe("§97② 2호 단서 — 환산취득가/감정가액 모드 필요경비 swap", () => {
  // 환산취득가 = 5억 × (1억/5억) = 1억
  // 개산공제 = 1억 × 3% = 3,000,000
  // estimatedSide = 100,000,000 + 3,000,000 = 103,000,000

  describe("케이스 1 — 환산 모드 + swap 미발동 (estimated ≥ direct)", () => {
    it("자본+양도비(5천만) < 환산+개산(1억3백만) → 본문 적용 (개산공제만)", () => {
      const input = baseTransferInput({
        transferPrice: 500_000_000,
        useEstimatedAcquisition: true,
        standardPriceAtAcquisition: 100_000_000,
        standardPriceAtTransfer: 500_000_000,
        capitalExpenditure: 30_000_000,
        transferExpense: 20_000_000,
      });
      const result = calcTransferGain(input);

      expect(result.usedEstimated).toBe(true);
      expect(result.estimatedBase).toBe(100_000_000);
      expect(result.estimatedDeduction).toBe(3_000_000);
      expect(result.necessaryExpenseMode).toBe("estimated_with_deduction");
      expect(result.swapApplied).toBe(false);
      expect(result.expenses).toBe(3_000_000); // 개산공제만
      expect(result.gain).toBe(500_000_000 - 100_000_000 - 3_000_000); // 397,000,000
      expect(result.swapComparison).toEqual({
        estimatedSide: 103_000_000,
        directSide: 50_000_000,
        chosen: "estimated",
      });
    });
  });

  describe("케이스 2 — 환산 모드 + swap 발동 (direct > estimated)", () => {
    it("자본+양도비(2억) > 환산+개산(1억3백만) → 단서 적용 (자본+양도비)", () => {
      const input = baseTransferInput({
        transferPrice: 500_000_000,
        useEstimatedAcquisition: true,
        standardPriceAtAcquisition: 100_000_000,
        standardPriceAtTransfer: 500_000_000,
        capitalExpenditure: 150_000_000,
        transferExpense: 50_000_000,
      });
      const result = calcTransferGain(input);

      expect(result.necessaryExpenseMode).toBe("swap_to_direct");
      expect(result.swapApplied).toBe(true);
      // acquisitionCost = estimated(1억) 유지, expenses = directSide(2억)으로 swap
      expect(result.expenses).toBe(200_000_000);
      expect(result.gain).toBe(500_000_000 - 100_000_000 - 200_000_000); // 200,000,000
      expect(result.swapComparison).toEqual({
        estimatedSide: 103_000_000,
        directSide: 200_000_000,
        chosen: "direct",
      });
    });
  });

  describe("케이스 3 — 환산 모드 + 자본·양도비 둘 다 0 (회귀)", () => {
    it("두 필드 미입력 → 본문 적용, swap 미고려 (legacy 호환)", () => {
      const input = baseTransferInput({
        transferPrice: 500_000_000,
        useEstimatedAcquisition: true,
        standardPriceAtAcquisition: 100_000_000,
        standardPriceAtTransfer: 500_000_000,
        // capitalExpenditure / transferExpense 미입력
      });
      const result = calcTransferGain(input);

      expect(result.necessaryExpenseMode).toBe("estimated_with_deduction");
      expect(result.swapApplied).toBe(false);
      expect(result.expenses).toBe(3_000_000); // 개산공제만
      expect(result.swapComparison).toBeUndefined(); // swapEligible=false
    });
  });

  describe("케이스 4 — 감정가액 모드 + swap 발동", () => {
    it("자본+양도비 > 감정+개산 → 단서 적용", () => {
      const input = baseTransferInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 0,
        acquisitionMethod: "appraisal",
        appraisalValue: 80_000_000,
        standardPriceAtAcquisition: 100_000_000,
        capitalExpenditure: 100_000_000,
        transferExpense: 30_000_000,
      });
      const result = calcTransferGain(input);

      // estimatedSide = 80M(감정) + 3M(3% of 100M) = 83M
      // directSide = 130M > 83M → swap
      expect(result.usedEstimated).toBe(true);
      expect(result.estimatedBase).toBe(80_000_000);
      expect(result.estimatedDeduction).toBe(3_000_000);
      expect(result.necessaryExpenseMode).toBe("swap_to_direct");
      expect(result.expenses).toBe(130_000_000);
      expect(result.gain).toBe(500_000_000 - 80_000_000 - 130_000_000); // 290,000,000
    });
  });

  describe("케이스 5 — 실가 모드 + 자본/양도비 분리 입력", () => {
    it("실가 모드는 swap 무관, 자본+양도비 직접 차감", () => {
      const input = baseTransferInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        useEstimatedAcquisition: false,
        capitalExpenditure: 20_000_000,
        transferExpense: 5_000_000,
      });
      const result = calcTransferGain(input);

      expect(result.usedEstimated).toBe(false);
      expect(result.necessaryExpenseMode).toBe("actual");
      expect(result.swapApplied).toBe(false);
      expect(result.expenses).toBe(25_000_000);
      expect(result.gain).toBe(500_000_000 - 300_000_000 - 25_000_000); // 175,000,000
    });

    it("실가 모드 + legacy expenses 단일 필드 호환 (자본·양도비 미입력)", () => {
      const input = baseTransferInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        useEstimatedAcquisition: false,
        expenses: 30_000_000,
      });
      const result = calcTransferGain(input);

      expect(result.expenses).toBe(30_000_000);
      expect(result.gain).toBe(170_000_000);
    });
  });

  describe("케이스 8 — 환산 모드 본문 expenses 이중차감 회귀 방어", () => {
    it("legacy expenses(자본+양도비 미입력) 환산 모드 → expenses 무시 (개산공제만)", () => {
      const input = baseTransferInput({
        transferPrice: 500_000_000,
        useEstimatedAcquisition: true,
        standardPriceAtAcquisition: 100_000_000,
        standardPriceAtTransfer: 500_000_000,
        expenses: 50_000_000, // ← legacy 단일 필드. 환산 모드에서는 무시되어야 함.
      });
      const result = calcTransferGain(input);

      // 환산 + 개산공제만, legacy expenses는 무시
      expect(result.necessaryExpenseMode).toBe("estimated_with_deduction");
      expect(result.expenses).toBe(3_000_000); // 50M 무시, 3M 개산공제만
      expect(result.gain).toBe(500_000_000 - 100_000_000 - 3_000_000); // 397M
    });
  });

  describe("경계값 — estimatedSide == directSide", () => {
    it("동률은 본문 적용 (단서는 '적은 경우' 명시 — 동률 미포함)", () => {
      // estimatedSide = 100M + 3M = 103M
      // directSide = 100M + 3M = 103M (동률)
      const input = baseTransferInput({
        transferPrice: 500_000_000,
        useEstimatedAcquisition: true,
        standardPriceAtAcquisition: 100_000_000,
        standardPriceAtTransfer: 500_000_000,
        capitalExpenditure: 100_000_000,
        transferExpense: 3_000_000,
      });
      const result = calcTransferGain(input);

      expect(result.necessaryExpenseMode).toBe("estimated_with_deduction");
      expect(result.swapApplied).toBe(false);
      expect(result.expenses).toBe(3_000_000);
    });
  });

  describe("End-to-end — calculateTransferTax 통합", () => {
    it("swap 발동이 최종 산출세액까지 반영", () => {
      const inputNoSwap = baseTransferInput({
        transferPrice: 500_000_000,
        useEstimatedAcquisition: true,
        standardPriceAtAcquisition: 100_000_000,
        standardPriceAtTransfer: 500_000_000,
        capitalExpenditure: 30_000_000,
        transferExpense: 20_000_000,
        isOneHousehold: false, // 비과세 우회
      });
      const inputSwap = baseTransferInput({
        transferPrice: 500_000_000,
        useEstimatedAcquisition: true,
        standardPriceAtAcquisition: 100_000_000,
        standardPriceAtTransfer: 500_000_000,
        capitalExpenditure: 150_000_000,
        transferExpense: 50_000_000,
        isOneHousehold: false,
      });
      const noSwap = calculateTransferTax(inputNoSwap, rates);
      const swap = calculateTransferTax(inputSwap, rates);

      // swap 발동 케이스가 양도차익 더 작음 → 산출세액 더 작음
      expect(swap.calculatedTax).toBeLessThan(noSwap.calculatedTax);
    });
  });
});
