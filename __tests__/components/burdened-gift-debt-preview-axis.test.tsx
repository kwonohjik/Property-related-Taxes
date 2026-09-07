/**
 * @vitest-environment jsdom
 *
 * anchor: 부담부증여 「인수 채무액 (= 양도가액)」 미리보기가 **축마다 다른 계산 단위**를 반영한다
 * (2026-09-07 대장 재대조 #11 — 마지막 보류 항목).
 *
 * ④ `buildBurdenedGiftInfo`는 축 B(지분 분할)에서 채무를 **× 지분율**로 안분한다.
 * 컴패니언 함께 부담부증여는 **자산가액 비율 재배분**이라 지분율 스케일이 틀린 축이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 채무 총액 1,000,000,000 · 지분 60% → 축 B 양도가액 600,000,000 */
function bgAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    transferType: "burdened_gift",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-06-01",
    bgValuationMode: "sangjeungbeop_standard",
    bgLendingDepositTotal: "700,000,000",
    bgMortgageDebtAmount: "300,000,000",
    ownershipNumerator: "60",
    ownershipDenominator: "100",
    ...over,
  } as AssetForm;
}

const renderBlock = (props: Record<string, unknown> = {}, over: Partial<AssetForm> = {}) =>
  render(
    <BurdenedGiftBlock
      asset={bgAsset(over)}
      onChange={() => {}}
      transferDate="2025-05-01"
      {...props}
    />,
  );

describe("#11 — 인수 채무액 미리보기가 축을 반영한다", () => {
  it("🔑 A-1: 지분 분할이면 **내 지분분**을 양도가액으로 보여준다", () => {
    renderBlock({ isFractionalSplit: true });
    expect(screen.getByText(/600,000,000원/)).toBeTruthy();
    expect(screen.getByText(/내 지분분 = 양도가액/)).toBeTruthy();
    // 총액도 함께 보여 사용자가 어디서 온 값인지 알 수 있어야 한다.
    expect(screen.getByText(/입력 총액 1,000,000,000 × 지분 60.00%/)).toBeTruthy();
  });

  it("🔑 A-2: 컴패니언 함께 부담부증여는 지분율로 스케일하지 않는다 — 다른 배분 규약이다", () => {
    renderBlock({ isCompanionBundle: true });
    expect(screen.getAllByText(/1,000,000,000원/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/내 지분분 = 양도가액/)).toBeNull();
    expect(screen.queryByText(/입력 총액/)).toBeNull();
    expect(screen.getByText(/자산가액 비율/)).toBeTruthy();
  });

  it("A-3: 단독(축 A)은 종전 그대로 총액 = 양도가액", () => {
    renderBlock({}, { ownershipNumerator: "100", ownershipDenominator: "100" });
    expect(screen.getAllByText(/1,000,000,000원/).length).toBeGreaterThan(0);
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && (el?.textContent ?? "").includes("(= 양도가액)")),
    ).toBeTruthy();
  });
});
