import { describe, it, expect, beforeEach } from "vitest";
import { useCalcWizardStore, makeDefaultAsset, computeTransferSummary } from "@/lib/stores/calc-wizard-store";

function computeSummary() {
  const { formData, result } = useCalcWizardStore.getState();
  return computeTransferSummary(formData, result);
}

beforeEach(() => {
  useCalcWizardStore.getState().reset();
});

describe("useTransferSummary (store 로직 검증)", () => {
  it("초기 상태 — 모든 합계 0, estimatedTax null", () => {
    const s = computeSummary();
    expect(s.totalSalePrice).toBe(0);
    expect(s.totalAcqPrice).toBe(0);
    expect(s.totalNecessaryExpense).toBe(0);
    expect(s.netTransferIncome).toBe(0);
    expect(s.estimatedTax).toBeNull();
  });

  it("단일 자산 — 양도가액·취득가액·필요경비 합산 및 양도소득금액", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            actualSalePrice: "100000000",
            fixedAcquisitionPrice: "50000000",
            directExpenses: "1000000",
          },
        ],
      },
    }));

    const s = computeSummary();
    expect(s.totalSalePrice).toBe(100_000_000);
    expect(s.totalAcqPrice).toBe(50_000_000);
    expect(s.totalNecessaryExpense).toBe(1_000_000);
    expect(s.netTransferIncome).toBe(49_000_000);
  });

  it("3건 자산 — 양도가액 합산", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          { ...makeDefaultAsset(1), actualSalePrice: "100000000", fixedAcquisitionPrice: "0", directExpenses: "0" },
          { ...makeDefaultAsset(2), actualSalePrice: "200000000", fixedAcquisitionPrice: "0", directExpenses: "0" },
          { ...makeDefaultAsset(3), actualSalePrice: "300000000", fixedAcquisitionPrice: "0", directExpenses: "0" },
        ],
      },
    }));

    const s = computeSummary();
    expect(s.totalSalePrice).toBe(600_000_000);
  });

  it("result가 없으면 estimatedTax null", () => {
    expect(useCalcWizardStore.getState().result).toBeNull();
    expect(computeSummary().estimatedTax).toBeNull();
  });

  it("result mode=single 이면 totalTax 반환", () => {
    useCalcWizardStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: { mode: "single", result: { totalTax: 5_000_000 } } as any,
    });
    expect(computeSummary().estimatedTax).toBe(5_000_000);
  });

  // ── 필요경비 = 개산공제(§163⑥) 즉시 표시 (계획서: sidebar-necessary-expense-estimated-deduction-timing-fix) ──
  describe("환산·감정 모드 개산공제 필요경비", () => {
    it("환산 모드 + 취득기준시가 → result 없이도 개산공제(3%) 즉시 표시", () => {
      useCalcWizardStore.setState((st) => ({
        formData: {
          ...st.formData,
          assets: [
            {
              ...makeDefaultAsset(1),
              useEstimatedAcquisition: true,
              standardPriceAtAcq: "400000000",
              actualSalePrice: "800000000",
            },
          ],
        },
      }));
      // 400,000,000 × 3% = 12,000,000 (엔진 applyRate floor 미러)
      expect(computeSummary().totalNecessaryExpense).toBe(12_000_000);
    });

    it("감정가액 모드도 개산공제 3% 적용", () => {
      useCalcWizardStore.setState((st) => ({
        formData: {
          ...st.formData,
          assets: [
            { ...makeDefaultAsset(1), isAppraisalAcquisition: true, standardPriceAtAcq: "400000000" },
          ],
        },
      }));
      expect(computeSummary().totalNecessaryExpense).toBe(12_000_000);
    });

    it("미등기 자산은 개산공제 0.3%", () => {
      useCalcWizardStore.setState((st) => ({
        formData: {
          ...st.formData,
          isUnregistered: true,
          assets: [
            { ...makeDefaultAsset(1), useEstimatedAcquisition: true, standardPriceAtAcq: "400000000" },
          ],
        },
      }));
      // 400,000,000 × 0.3% = 1,200,000
      expect(computeSummary().totalNecessaryExpense).toBe(1_200_000);
    });

    it("result(single) 도착 시 expenses(실차감 필요경비) 권위값으로 override", () => {
      useCalcWizardStore.setState((st) => ({
        formData: {
          ...st.formData,
          assets: [
            { ...makeDefaultAsset(1), useEstimatedAcquisition: true, standardPriceAtAcq: "400000000" },
          ],
        },
        // 본문 모드: expenses=개산공제(=estimatedDeduction). 합산 아닌 expenses 단독 사용(이중계산 방지).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result: { mode: "single", result: { totalTax: 0, estimatedDeduction: 12_000_000, expenses: 12_000_000 } } as any,
      }));
      expect(computeSummary().totalNecessaryExpense).toBe(12_000_000);
    });

    it("swap 모드 result: expenses(자본·양도비)만 반영, 개산공제 echo 이중계산 안 함", () => {
      useCalcWizardStore.setState((st) => ({
        formData: {
          ...st.formData,
          assets: [
            { ...makeDefaultAsset(1), useEstimatedAcquisition: true, standardPriceAtAcq: "400000000" },
          ],
        },
        // swap: estimatedDeduction=12M(echo·미차감), expenses=710M(directSide) → 710M만
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result: { mode: "single", result: { totalTax: 0, estimatedDeduction: 12_000_000, expenses: 710_000_000, swapApplied: true } } as any,
      }));
      expect(computeSummary().totalNecessaryExpense).toBe(710_000_000);
    });

    it("환산 모드: 취득가액도 환산취득가(양도가×취득기준시가/양도기준시가) 즉시 표시", () => {
      useCalcWizardStore.setState((st) => ({
        formData: {
          ...st.formData,
          assets: [
            {
              ...makeDefaultAsset(1),
              useEstimatedAcquisition: true,
              actualSalePrice: "800000000",
              standardPriceAtAcq: "400000000",
              standardPriceAtTransfer: "600000000",
            },
          ],
        },
      }));
      // 800,000,000 × 400,000,000 / 600,000,000 = 533,333,333 (floor, safeMulThenDiv)
      expect(computeSummary().totalAcqPrice).toBe(533_333_333);
    });

    it("환산 모드 result 도착 시 취득가액을 엔진 acquisitionPrice로 override", () => {
      useCalcWizardStore.setState((st) => ({
        formData: {
          ...st.formData,
          assets: [
            {
              ...makeDefaultAsset(1),
              useEstimatedAcquisition: true,
              actualSalePrice: "800000000",
              standardPriceAtAcq: "400000000",
              standardPriceAtTransfer: "600000000",
            },
          ],
        },
        // 환산 모드: estimatedBase = 환산취득가(개산공제 제외). expenses = 개산공제.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result: { mode: "single", result: { totalTax: 0, estimatedBase: 533_333_333, expenses: 12_000_000 } } as any,
      }));
      const s = computeSummary();
      expect(s.totalAcqPrice).toBe(533_333_333);
      expect(s.totalNecessaryExpense).toBe(12_000_000);
    });

    it("실지취득 모드는 개산공제 미적용 — 기존 capex/양도비 회귀 불변", () => {
      useCalcWizardStore.setState((st) => ({
        formData: {
          ...st.formData,
          assets: [
            {
              ...makeDefaultAsset(1),
              fixedAcquisitionPrice: "50000000",
              directExpenses: "1000000",
              standardPriceAtAcq: "400000000", // 실지모드면 무시돼야 함
            },
          ],
        },
      }));
      expect(computeSummary().totalNecessaryExpense).toBe(1_000_000);
    });
  });
});
