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
});
