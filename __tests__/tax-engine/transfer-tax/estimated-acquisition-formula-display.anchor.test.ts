/**
 * Anchor — 환산취득가 모드 결과 산식의 실제 변수값 표시 + 필요경비 이중계산 수정.
 *
 * 1) 엔진: estimated 모드(split 아님)에서 취득시/양도시 기준시가를 echo 필드로 노출
 *    (estimatedStdPriceAtAcquisition / estimatedStdPriceAtTransfer). 계산 로직 불변.
 * 2) UI(buildStatementItems): 취득가액·필요경비 산식을 실제값으로 풀어씀.
 *    + 필요경비 표시값이 개산공제를 이중 계산하던 버그 수정 (expenses − capEx 만).
 */
import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const mockRates = makeMockRates();

// 환산취득가 = floor(1,000,000,000 × 100,000,000 / 500,000,000) = 200,000,000
// 개산공제 = floor(100,000,000 × 3%) = 3,000,000
const ESTIMATED_INPUT: TransferTaxInput = baseTransferInput({
  transferPrice: 1_000_000_000,
  acquisitionPrice: 0,
  expenses: 0,
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: 100_000_000,
  standardPriceAtTransfer: 500_000_000,
  // 1세대1주택 비과세(12억 이하 early return) 회피 — 과세 케이스로 echo·산식 검증
  isOneHousehold: false,
  householdHousingCount: 2,
});

describe("환산취득가 모드 — 기준시가 echo + 산식 실제값 표시", () => {
  it("엔진: estimated 모드에서 취득시/양도시 기준시가를 echo로 노출하고 계산은 불변", () => {
    const result = calculateTransferTax(ESTIMATED_INPUT, mockRates);

    expect(result.usedEstimatedAcquisition).toBe(true);
    expect(result.estimatedBase).toBe(200_000_000);
    expect(result.estimatedDeduction).toBe(3_000_000);
    // echo (표시 전용)
    expect(result.estimatedStdPriceAtAcquisition).toBe(100_000_000);
    expect(result.estimatedStdPriceAtTransfer).toBe(500_000_000);
    // 양도차익 = 10억 − 2억 − 개산공제 3,000,000 (개산공제 1회만)
    expect(result.transferGain).toBe(1_000_000_000 - 200_000_000 - 3_000_000);
    // expenses = 개산공제만
    expect(result.expenses).toBe(3_000_000);
  });

  it("UI: 취득가액·필요경비 산식이 실제 변수값을 풀어쓰고, 필요경비는 이중계산 없이 개산공제 1회", () => {
    const result = calculateTransferTax(ESTIMATED_INPUT, mockRates);
    const formData = {
      transferDate: "2024-05-01",
      contractTotalPrice: "1000000000",
      assets: [{}],
    } as unknown as TransferFormData;

    const items = buildStatementItems(
      result,
      formData,
      undefined,
      undefined,
      1_000_000_000,
    );

    const acq = items.get("acquisitionPrice")!;
    expect(acq.value).toBe(200_000_000);
    // 환산취득가 산식은 Frac 분수 표기 (PR #746 표준) — 인라인 ÷ 미노출
    const { container: acqC } = render(createElement("div", null, acq.formula));
    expect(acqC.textContent).toContain(
      "환산취득가 200,000,000 = 양도가액 1,000,000,000 ×",
    );
    expect(acqC.textContent).toContain("취득시 기준시가 100,000,000");
    expect(acqC.textContent).toContain("양도시 기준시가 500,000,000");
    expect(acqC.textContent).not.toContain("÷");

    const exp = items.get("expenses")!;
    // ★ 이중계산 수정: 6,000,000(2배) 아니라 3,000,000
    expect(exp.value).toBe(3_000_000);
    expect(exp.formula).toContain("개산공제 3,000,000 = 취득시 기준시가 100,000,000 × 3%");
  });

  it("실거래 모드: 취득가액·필요경비도 실제값 표기", () => {
    const directInput: TransferTaxInput = baseTransferInput({
      transferPrice: 1_000_000_000,
      acquisitionPrice: 600_000_000,
      expenses: 5_000_000,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
    });
    const result = calculateTransferTax(directInput, mockRates);
    expect(result.estimatedStdPriceAtAcquisition).toBeUndefined();

    const formData = {
      transferDate: "2024-05-01",
      contractTotalPrice: "1000000000",
      assets: [{}],
    } as unknown as TransferFormData;
    const items = buildStatementItems(result, formData, undefined, undefined, 1_000_000_000);

    const acq = items.get("acquisitionPrice")!;
    expect(acq.value).toBe(600_000_000);
    expect(acq.formula).toContain("취득가액 600,000,000");
    const exp = items.get("expenses")!;
    expect(exp.value).toBe(5_000_000);
  });
});
