/**
 * anchor: 증여 부담부 주식 ⑤ 비상장 환산 — 2:3 대상 법인 토글(`ReversalCorpToggle`)이 입력 경로다.
 *
 * ④ 배선만 열면 no-op이므로(memory `feedback_api_trigger_without_input_path_is_noop`) 입력 → bgt 저장 → ④ body를 고정한다.
 * 계산 쪽 anchor는 `__tests__/calc/gift-burdened-stock-reversal.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { StockBurdenedDebtSection } from "@/components/calc/gift/StockBurdenedDebtSection";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

afterEach(cleanup);

function makeItem(bgt: Partial<BurdenedGiftStockTransferTaxInput>): EstateItem {
  return {
    id: "u1",
    name: "비상장",
    category: "unlisted_stock",
    marketValue: 5_000_000_000,
    assumedDebtForGift: 1_000_000_000,
    unlistedStockData: { totalShares: 100_000, ownedShares: 10_000 },
    burdenedGiftStockTransferTax: { marketType: "unlisted", acquisitionDate: "2015-03-02", acquisitionMode: "estimated", ...bgt },
  } as unknown as EstateItem;
}

function renderControlled(bgt: Partial<BurdenedGiftStockTransferTaxInput>) {
  let current = makeItem(bgt);
  const onUpdate = vi.fn((u: EstateItem) => {
    current = u;
    view.rerender(<StockBurdenedDebtSection item={current} onUpdate={onUpdate} mode="gift" transferDate="2025-06-02" />);
  });
  const view = render(<StockBurdenedDebtSection item={current} onUpdate={onUpdate} mode="gift" transferDate="2025-06-02" />);
  return { get: () => current.burdenedGiftStockTransferTax as BurdenedGiftStockTransferTaxInput, item: () => current };
}

const sw = () => within(screen.getByTestId("reversal-corp-toggle")).getByRole("switch");

describe("BG-UI-REV — 증여 부담부 2:3 토글", () => {
  it("BG-UI-REV-1: 비상장 × 환산이면 토글이 있고 꺼져 있다 (종전: 숨김)", () => {
    renderControlled({});
    expect(screen.queryByTestId("reversal-corp-toggle")).not.toBeNull();
    expect(sw()).toHaveAttribute("aria-checked", "false");
  });
  it("BG-UI-REV-2: 켜면 bgt에 저장되고 ④ body가 true를 싣는다 — 끄면 키가 사라진다", () => {
    const h = renderControlled({});
    fireEvent.click(sw());
    expect(h.get().isHeavyRealEstateForValuation).toBe(true);
    expect(sw()).toHaveAttribute("aria-checked", "true");
    const body = buildGiftStockBurdenedTransferBody(h.item(), { giftDate: "2025-06-02" } as unknown as FormState);
    expect(body.isHeavyRealEstateForValuation).toBe(true);
    fireEvent.click(sw());
    expect(h.get().isHeavyRealEstateForValuation).toBeUndefined();
    expect(screen.getByTestId("reversal-corp-toggle")).toBeTruthy();
    expect(sw()).toHaveAttribute("aria-checked", "false");
  });
  it("BG-UI-REV-3: 저장된 true는 다시 그려도 켜져 있다 (미리보기 가중치와 같은 값)", () => {
    renderControlled({ isHeavyRealEstateForValuation: true });
    expect(sw()).toHaveAttribute("aria-checked", "true");
  });
  it("BG-UI-REV-4: 양측 순자산 단독 사유면 토글이 숨는다 (가중평균 자체가 없다)", () => {
    renderControlled({ netAssetOnlyReason: "liquidation_or_owner_death", acquisitionNetAssetOnlyReason: "liquidation_or_owner_death" });
    expect(screen.queryByTestId("reversal-corp-toggle")).toBeNull();
  });
});
