/**
 * ⑤ 함께양도 묶음의 지분 자산 — 자동가 카드는 축 B·단건만, 그 밖은 물건 전체(100%) 칸 + 지분율 안내 (2026-10-10)
 * route 앵커: `__tests__/api/transfer.route.companion-partial-share-bundle.anchor.test.ts`
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompanionSaleModeBlock } from "@/components/calc/transfer/CompanionSaleModeBlock";

afterEach(cleanup);
const noop = () => {};
const base = {
  assetKind: "land" as const, actualSalePrice: "800000000", onActualSalePriceChange: noop,
  standardPriceAtTransfer: "500000000", onStandardPriceAtTransferChange: noop, transferDate: "2026-02-16",
  ownershipNumerator: "50", ownershipDenominator: "100", contractTotalPrice: "1000000000",
};
const AUTO = "자동 계산 (총 양도가액 × 지분율)";

describe("CompanionSaleModeBlock — 지분 자산", () => {
  it("함께양도(축 B 아님) · actual → 자동가 카드 없음 · 물건 전체(100%) 칸 + 지분율 50% 안내", () => {
    render(<CompanionSaleModeBlock {...base} bundledSaleMode="actual" />);
    expect(screen.queryByText(AUTO)).toBeNull();
    expect(screen.getByTestId("companion-actual-sale-price")).toBeTruthy();
    expect(screen.getByText("계약서상 양도가액 — 물건 전체(100%) 기준 (원)")).toBeTruthy();
    expect(screen.getByText(/지분율 50%를 곱한 금액이 이 자산의 양도가액입니다/)).toBeTruthy();
  });
  it("함께양도(축 B 아님) · apportioned → 기준시가 칸 + 지분율 안내", () => {
    const { container } = render(<CompanionSaleModeBlock {...base} bundledSaleMode="apportioned" />);
    expect(screen.queryByText(AUTO)).toBeNull();
    expect(container.querySelector('[data-field="standardPriceAtTransfer"]')).not.toBeNull();
    expect(screen.getByText(/지분율 50%를 곱한 값이 이 자산의 안분 비율 분모입니다/)).toBeTruthy();
  });
  it("부정형 짝 — 축 B(isFractionalSplit)·단건(singleMode)은 종전 자동가 카드 / 100% 자산은 종전 문구", () => {
    render(<CompanionSaleModeBlock {...base} bundledSaleMode="actual" isFractionalSplit />);
    expect(screen.getByText(AUTO)).toBeTruthy();
    cleanup();
    render(<CompanionSaleModeBlock {...base} bundledSaleMode="actual" singleMode />);
    expect(screen.getByText(AUTO)).toBeTruthy();
    cleanup();
    render(<CompanionSaleModeBlock {...base} bundledSaleMode="actual" ownershipNumerator="100" />);
    expect(screen.getByText("계약서상 양도가액 (원)")).toBeTruthy();
    expect(screen.getByText("이 자산의 매매계약서 명시 가액 (§166⑥ 본문)")).toBeTruthy();
  });
});
