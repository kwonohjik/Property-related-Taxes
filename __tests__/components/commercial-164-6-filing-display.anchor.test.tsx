/**
 * anchor — 상가 §164⑥ 환산의 **신고서 표시**와 **입력 경고** (2026-08-04)
 *
 * 계획서: docs/02-design/features/commercial-164-6-filing-display-gap.plan.md
 *
 * 실사례: 최초고시(2005) ㎡당 고시가를 2,178,000 → 21,780,000으로 10배 오입력하자
 * 환산취득가가 양도가액을 넘어 양도차익이 0이 됐다. 그런데 신고서는 취득가액을
 * **역산**(양도가액 − 양도차익 − 필요경비)해 표시하므로 `취득가액 = 양도가액`이 되어
 * 화면에 단서가 전혀 없었고, 사용자는 엔진 결함으로 오인했다.
 *
 * P1 — 신고서가 환산취득가를 **직접** 표시한다(역산 금지).
 * P3 — 과거 시점 단가 > 양도 단가이면 입력 카드에서 경고한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildRows } from "../../components/calc/results/transfer/FilingFormTableHelpers";
import { CommercialBuildingBlock } from "../../components/calc/transfer/CommercialBuildingBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

afterEach(cleanup);

/** 신고서 행에서 라벨로 합계 셀 값을 꺼낸다. */
function totalOf(rows: ReturnType<typeof buildRows>, label: string) {
  const row = rows.find((r) => r.label === label);
  return row?.values?.total ?? null;
}

/**
 * 상가 §164⑥ 결과의 최소 형태.
 * 엔진은 환산을 **실가처럼 주입**하므로 `usedEstimatedAcquisition:false`·`estimatedBase:undefined`다
 * (`transfer-tax-commercial-step.ts:119~151`) — 이 조합이 이 anchor의 전제다.
 */
function cbResult(over: Partial<TransferTaxResult> = {}): TransferTaxResult {
  return {
    isExempt: false,
    transferGain: 0, // ⬅ 오입력으로 환산취득가 ≥ 양도가액 → 양도차익 0
    taxableGain: 0,
    usedEstimatedAcquisition: false,
    estimatedBase: undefined,
    expenses: 16_200_000,
    swapApplied: false,
    longTermHoldingDeduction: 0,
    basicDeduction: 0,
    taxBase: 0,
    appliedRate: 0,
    progressiveDeduction: 0,
    calculatedTax: 0,
    reductionAmount: 0,
    determinedTax: 0,
    penaltyTax: 0,
    localIncomeTax: 0,
    totalTax: 0,
    steps: [],
    commercialBuildingValuationDetail: {
      estimatedAcquisitionTotal: 540_000_000,
      estimatedDeductionTotal: 16_200_000,
    },
    ...over,
  } as unknown as TransferTaxResult;
}

const FORM = {
  transferDate: "2026-02-16",
  contractTotalPrice: "540000000",
  assets: [],
} as never;

describe("P1 — 신고서가 상가 환산취득가를 직접 표시한다", () => {
  it("🔴 양도차익 0이어도 취득가액은 환산취득가다 (역산으로 양도가액이 되지 않는다)", () => {
    const rows = buildRows(cbResult(), "single", FORM, undefined, 540_000_000);
    // 종전: 540,000,000 − 0 − 0 = 540,000,000(= 양도가액) → 환산 여부 판별 불가
    expect(totalOf(rows, "취득가액")).toBe(540_000_000);
    // 필요경비는 §163⑥ 개산공제로 분해된다(종전엔 "–")
    expect(totalOf(rows, "필요경비")).toBe(16_200_000);
  });

  it("양도차익이 있는 정상 케이스도 환산취득가를 그대로 쓴다", () => {
    const rows = buildRows(
      cbResult({
        transferGain: 275_579_753,
        taxableGain: 275_579_753,
        expenses: 5_009_509,
        commercialBuildingValuationDetail: {
          estimatedAcquisitionTotal: 259_410_738,
          estimatedDeductionTotal: 5_009_509,
        },
      } as Partial<TransferTaxResult>),
      "single",
      FORM,
      undefined,
      540_000_000,
    );
    expect(totalOf(rows, "취득가액")).toBe(259_410_738);
  });

  /**
   * §97②2호 단서 swap은 환산취득가를 **차감하지 않는다** → 취득가액 칸에 환산취득가를 쓰면
   * 「양도가 − 취득가 − 경비 = 양도차익」 자기정합이 깨진다. 종전 역산을 유지한다.
   */
  it("swap 발동 시에는 종전 역산을 유지한다 (자기정합 보존)", () => {
    const rows = buildRows(
      cbResult({ swapApplied: true, transferGain: 400_000_000, expenses: 140_000_000 } as Partial<TransferTaxResult>),
      "single",
      FORM,
      undefined,
      540_000_000,
    );
    // 540,000,000 − 400,000,000 − 140,000,000 = 0 → null(미표시)
    expect(totalOf(rows, "취득가액")).toBeNull();
  });
});

// ── P3: 입력 단계 경고 ────────────────────────────────────────────────

function cbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "commercial_building",
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    acquisitionDate: "2000-12-07",
    cbExclusiveArea: "36",
    cbSharedArea: "33.52",
    cbLandArea: "12.59",
    ...over,
  } as AssetForm;
}

describe("P3 — 과거 단가 > 양도 단가 경고", () => {
  it("🔴 10배 오입력(최초고시 21,780,000 > 양도 5,000,000) → 경고", () => {
    render(
      <CommercialBuildingBlock
        asset={cbAsset({ cbUnitPriceAtFirstOrAcq: "21780000", cbUnitPriceAtTransfer: "5000000" })}
        onChange={() => {}}
        transferDate="2026-02-16"
      />,
    );
    const w = screen.getByTestId("cb-unit-price-inversion-warning");
    expect(w.textContent).toMatch(/자릿수를\s*확인/);
    expect(w.textContent).toMatch(/양도차익이 0/);
  });

  it("정상 입력(2,178,000 < 5,000,000) → 경고 없음", () => {
    render(
      <CommercialBuildingBlock
        asset={cbAsset({ cbUnitPriceAtFirstOrAcq: "2178000", cbUnitPriceAtTransfer: "5000000" })}
        onChange={() => {}}
        transferDate="2026-02-16"
      />,
    );
    expect(screen.queryByTestId("cb-unit-price-inversion-warning")).toBeNull();
  });

  it("한쪽이 비어 있으면 판정하지 않는다 (입력 중 조기 경고 금지)", () => {
    render(
      <CommercialBuildingBlock
        asset={cbAsset({ cbUnitPriceAtFirstOrAcq: "21780000", cbUnitPriceAtTransfer: "" })}
        onChange={() => {}}
        transferDate="2026-02-16"
      />,
    );
    expect(screen.queryByTestId("cb-unit-price-inversion-warning")).toBeNull();
  });

  it("동률은 경고하지 않는다 (환산취득가 = 양도가액 × 1 — 차익 0이지만 오입력 아님)", () => {
    render(
      <CommercialBuildingBlock
        asset={cbAsset({ cbUnitPriceAtFirstOrAcq: "5000000", cbUnitPriceAtTransfer: "5000000" })}
        onChange={() => {}}
        transferDate="2026-02-16"
      />,
    );
    expect(screen.queryByTestId("cb-unit-price-inversion-warning")).toBeNull();
  });
});
