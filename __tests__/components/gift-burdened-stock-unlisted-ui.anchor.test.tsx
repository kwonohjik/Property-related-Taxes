/**
 * anchor: B23 — 증여 부담부 주식 ⑤ 비상장 환산 §165④ 보충적 평가 입력 경로
 *
 * 토글 기본값이 비상장·환산인데 입력 칸이 없었다. ④ 배선만 추가하면 no-op이므로
 * (memory `feedback_api_trigger_without_input_path_is_noop`) 이 파일이
 * 입력 → bgt 저장 → ④ body 전 구간을 고정한다. 입력 위젯은 주식 마법사
 * `EstimatedUnlistedBlock`(simpleOnly)을 재사용한다 — 별도 UI를 만들지 않는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { StockBurdenedDebtSection } from "@/components/calc/gift/StockBurdenedDebtSection";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

afterEach(cleanup);

const ID = "u1";

function makeItem(bgt: Partial<BurdenedGiftStockTransferTaxInput>): EstateItem {
  return {
    id: ID,
    name: "비상장",
    category: "unlisted_stock",
    marketValue: 5_000_000_000,
    assumedDebtForGift: 1_000_000_000,
    unlistedStockData: { totalShares: 100_000, ownedShares: 10_000 },
    burdenedGiftStockTransferTax: {
      marketType: "unlisted",
      acquisitionDate: "2015-03-02",
      acquisitionMode: "estimated",
      ...bgt,
    },
  } as unknown as EstateItem;
}

/** 부모처럼 onUpdate 결과를 다시 prop으로 흘려 보내는 제어 컴포넌트 하네스 */
function renderControlled(bgt: Partial<BurdenedGiftStockTransferTaxInput>) {
  let current = makeItem(bgt);
  const onUpdate = vi.fn((u: EstateItem) => {
    current = u;
    view.rerender(
      <StockBurdenedDebtSection item={current} onUpdate={onUpdate} mode="gift" transferDate="2025-06-02" />,
    );
  });
  const view = render(
    <StockBurdenedDebtSection item={current} onUpdate={onUpdate} mode="gift" transferDate="2025-06-02" />,
  );
  return { get: () => current, onUpdate };
}

const box = (name: string) => screen.getByRole("textbox", { name });

describe("BG-UI-UNL — 비상장 환산 §165④ 입력 (B23)", () => {
  it("BG-UI-UNL-1: 비상장 × 환산이면 양도·취득 순손익·순자산 4칸이 렌더된다 (종전 0칸)", () => {
    renderControlled({});
    expect(screen.queryByTestId(`stock-bg-unlisted-valuation-${ID}`)).not.toBeNull();
    for (const n of [
      "1주당 순손익가치",
      "1주당 순자산가치",
      "1주당 순손익가치 (취득시점)",
      "1주당 순자산가치 (취득시점)",
    ]) {
      expect(box(n)).toBeTruthy();
    }
    // simpleOnly — 행-수준 계산·액면가 토글은 ④ 게이트가 없어 숨긴다
    expect(screen.queryByText("평가액 계산")).toBeNull();
    expect(screen.queryByText(/취득시점 장부분실/)).toBeNull();
  });

  it("BG-UI-UNL-2: 상장 환산·비상장 실지에는 렌더되지 않는다 (조용히 무시되는 칸 금지)", () => {
    renderControlled({ marketType: "kospi" });
    expect(screen.queryByTestId(`stock-bg-unlisted-valuation-${ID}`)).toBeNull();
    cleanup();
    renderControlled({ acquisitionMode: "actual" });
    expect(screen.queryByTestId(`stock-bg-unlisted-valuation-${ID}`)).toBeNull();
  });

  it("BG-UI-UNL-3: 입력값이 숫자로 bgt에 저장되고 ④ body에 실린다 (음수 허용 · 빈칸 = 미입력)", () => {
    const h = renderControlled({});
    fireEvent.change(box("1주당 순손익가치"), { target: { value: "500000" } });
    fireEvent.change(box("1주당 순자산가치"), { target: { value: "400000" } });
    fireEvent.change(box("1주당 순손익가치 (취득시점)"), { target: { value: "-1000" } });
    fireEvent.change(box("1주당 순자산가치 (취득시점)"), { target: { value: "80000" } });
    const bgt = h.get().burdenedGiftStockTransferTax!;
    expect(bgt.transferYearNetIncomePerShare).toBe(500_000);
    expect(bgt.transferYearNetAssetPerShare).toBe(400_000);
    expect(bgt.acquisitionYearNetIncomePerShare).toBe(-1_000);
    expect(bgt.acquisitionYearNetAssetPerShare).toBe(80_000);

    const body = buildGiftStockBurdenedTransferBody(h.get(), { giftDate: "2025-06-02" } as unknown as FormState);
    expect(body).toMatchObject({
      transferYearNetIncomePerShare: 500_000,
      transferYearNetAssetPerShare: 400_000,
      acquisitionYearNetIncomePerShare: -1_000,
      acquisitionYearNetAssetPerShare: 80_000,
    });

    fireEvent.change(box("1주당 순손익가치"), { target: { value: "" } });
    expect(h.get().burdenedGiftStockTransferTax!.transferYearNetIncomePerShare).toBeUndefined();
  });

  it("BG-UI-UNL-4: 저장값이 칸에 복원된다 (이력 불러오기)", () => {
    renderControlled({ transferYearNetAssetPerShare: 400_000 });
    expect((box("1주당 순자산가치") as HTMLInputElement).value).toBe("400,000");
  });

  it("BG-UI-UNL-5: 순자산 단독 사유 선택이 bgt에 저장되고 순손익 칸이 사라진다 (§165④3)", () => {
    const h = renderControlled({});
    fireEvent.click(screen.getByText("다목: 주식가액 80% 이상 (지주회사형)"));
    expect(h.get().burdenedGiftStockTransferTax!.netAssetOnlyReason).toBe("stock_holding_company");
    expect(screen.queryByRole("textbox", { name: "1주당 순손익가치" })).toBeNull();
    fireEvent.click(screen.getByText("해당 없음"));
    expect(h.get().burdenedGiftStockTransferTax!.netAssetOnlyReason).toBeUndefined();
  });

  it("BG-UI-UNL-6: 양도·취득 평가액이 같으면 §81④1호 토글이 뜨고 bgt에 저장된다", () => {
    const h = renderControlled({
      transferYearNetIncomePerShare: 100_000,
      transferYearNetAssetPerShare: 80_000,
      acquisitionYearNetIncomePerShare: 100_000,
      acquisitionYearNetAssetPerShare: 80_000,
    });
    fireEvent.click(screen.getByText("같은 사업연도에 취득·양도 (소칙 §81④ 1호)"));
    expect(h.get().burdenedGiftStockTransferTax!.unlistedSameBizYearToggle).toBe(true);
  });
});
