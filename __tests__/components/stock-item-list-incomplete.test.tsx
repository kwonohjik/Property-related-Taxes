/**
 * @vitest-environment jsdom
 *
 * ⑤ 확정 종목 「입력 미완료」 배지 — 목록에서 **어느 종목인지** 보인다
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase E · A-3)
 *
 * 계산 차단 메시지가 순번을 알려줘도, 목록에서 그 종목을 바로 짚을 수 없으면 사용자는
 * 5건을 하나씩 열어 봐야 한다. 배지와 차단은 **같은 판정**(`validateFilingItems`)을 쓴다.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StockItemListCard } from "@/components/calc/stock-transfer/StockItemListCard";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function item(name: string): StockTransferFormData {
  return { ...createInitialStockFormData(), securityName: name, marketType: "kospi" };
}

const noop = () => {};

describe("IL-1 미완료 배지", () => {
  it("IL-1-1: incompleteIndexes 에 든 종목에만 배지가 붙는다", () => {
    render(
      <StockItemListCard
        savedItems={[item("완전"), item("미완")]}
        onAddCurrent={noop}
        onEdit={noop}
        onRemove={noop}
        canAddCurrent
        incompleteIndexes={[1]}
      />,
    );
    expect(screen.getAllByText("입력 미완료")).toHaveLength(1);
  });

  it("IL-1-2: 기본값(미지정)이면 배지가 없다 — 종전 화면과 같다", () => {
    render(
      <StockItemListCard
        savedItems={[item("가"), item("나")]}
        onAddCurrent={noop}
        onEdit={noop}
        onRemove={noop}
        canAddCurrent
      />,
    );
    expect(screen.queryByText("입력 미완료")).toBeNull();
  });
});
