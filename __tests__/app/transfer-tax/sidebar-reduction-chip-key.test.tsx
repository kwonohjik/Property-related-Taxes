/**
 * NH-62 — 사이드바 「공제·감면 사항」 칩의 React key 중복.
 *
 * `reductionTypes`는 저장된 감면 + 주택 명부 행 감면(`primaryReductionsWithRows`)을 이어 붙여
 * 같은 조문이 두 번 들어올 수 있다. 종전 `key={t}`는 그때 key가 겹쳐, 감면을 빼도
 * 이전 칩이 화면에 남았다(stale 칩). 렌더 결과가 매번 `reductionTypes`와 같아야 한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TransferSidebarSummary } from "@/app/calc/transfer-tax/TransferSidebarSummary";
import type { TransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { ReductionType } from "@/lib/stores/calc-wizard-store";
import { REDUCTION_SHORT_LABELS } from "@/components/calc/transfer/reduction-short-labels";

afterEach(cleanup);

function summaryOf(types: ReductionType[]): TransferPerAssetSummary {
  return {
    rows: [
      {
        assetId: "a1",
        index: 1,
        assetLabel: "주택",
        assetKind: "housing",
        salePrice: 0,
        acqPrice: 0,
        acqLabel: "취득가액",
        expense: 0,
        reductionTypes: types,
        salePending: false,
        acqPending: false,
        expensePending: false,
        saleIsApportioned: false,
        ownershipRatio: 1,
      },
    ],
    totalSalePrice: 0,
  };
}

function chips(container: HTMLElement): string[] {
  return [...container.querySelectorAll("li")].map((li) => li.textContent ?? "");
}

const R: ReductionType = "new_99_4_rural";
const H: ReductionType = "new_99_4_hometown";
const N: ReductionType = "new_99";

describe("NH-62 사이드바 감면 칩 — 같은 조문이 두 번 와도 렌더가 입력과 같다", () => {
  const cases: Array<[ReductionType[], ReductionType[]]> = [
    [[R, H, R], [H, R]],
    [[R, R, H], [H]],
    [[R, N, R], [N, R, H]],
    [[R, R], [R]],
  ];
  it.each(cases)("%j → %j", (before, after) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, rerender } = render(<TransferSidebarSummary summary={summaryOf(before)} />);
    expect(chips(container)).toEqual(before.map((t) => REDUCTION_SHORT_LABELS[t]));
    rerender(<TransferSidebarSummary summary={summaryOf(after)} />);
    expect(chips(container)).toEqual(after.map((t) => REDUCTION_SHORT_LABELS[t]));
    // 중복 key 경고(Encountered two children with the same key)가 없어야 한다
    const dupKeyWarnings = spy.mock.calls.filter((c) => String(c[0]).includes("same key"));
    spy.mockRestore();
    expect(dupKeyWarnings).toEqual([]);
  });
});
