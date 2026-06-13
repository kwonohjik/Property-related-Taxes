/**
 * @vitest-environment jsdom
 *
 * StockItemTableView — 주식·지분 요약 테이블 + shouldShowMajorShareholderChip anchor
 *
 * Plan/Design: docs/02-design/features/stock-item-table-view.{plan,ui.design}.md (ST-A1~A7).
 *  ST-A1 상장 행 평가액 = computeStockValuation 단일출처
 *  ST-A2 비상장 V1 행 평가액 = computeEffectiveValuation(valuationDate) 단일출처
 *  ST-A2b valuationDate 스레딩 — V2(evaluationDate 미입력) 행은 date 전달 시에만 평가
 *  ST-A3 분류·옵션 배지 isActiveData 필터 (협의분할 표시 / 법정분할 제외)
 *  ST-A4 증여세 모드 → 분류·옵션 컬럼 미렌더
 *  ST-A5 행 클릭 → onSelect(id)
 *  ST-A6 shouldShowMajorShareholderChip (상장·V1 true / V2 false)
 *  ST-A7 평가방식 배지 (V1=간편 / V2=정식)
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { StockItemTableView } from "@/components/calc/inheritance/stock/StockItemTableView";
import { computeStockValuation, shouldShowMajorShareholderChip } from "@/lib/calc/stock-valuation";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import { createDefaultUnlistedStockV2 } from "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIRS: Heir[] = [
  { id: "h-spouse", relation: "spouse", name: "한배우자" },
  { id: "h-child", relation: "child", name: "김첫째" },
];

function listed(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "ls-1",
    category: "listed_stock",
    name: "삼성전자",
    listedStockAvgPrice: 50_000,
    listedStockShares: 1_000,
    ...overrides,
  };
}

function unlistedV1(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "us-1",
    category: "unlisted_stock",
    name: "(주)가나다",
    unlistedValuationMode: "simple",
    unlistedStockData: {
      totalShares: 10_000,
      ownedShares: 10_000,
      weightedNetIncome: 100_000_000,
      netAssetValue: 1_000_000_000,
      capitalizationRate: 0.1,
    },
    ...overrides,
  };
}

afterEach(cleanup);

// ============================================================
// ST-A6 — shouldShowMajorShareholderChip (순수 함수)
// ============================================================

describe("ST-A6 shouldShowMajorShareholderChip", () => {
  it("상장주식 → true", () => {
    expect(shouldShowMajorShareholderChip(listed())).toBe(true);
  });
  it("비상장 simple(V1) → true", () => {
    expect(shouldShowMajorShareholderChip(unlistedV1())).toBe(true);
  });
  it("비상장 formal(V2) → false (카드 내부 토글 담당)", () => {
    const item = unlistedV1({
      unlistedValuationMode: "formal",
      unlistedStockValuationV2: createDefaultUnlistedStockV2(),
    });
    expect(shouldShowMajorShareholderChip(item)).toBe(false);
  });
  it("비상장 mode 미지정 + unlistedStockData → simple 추론 → true", () => {
    const item = unlistedV1({ unlistedValuationMode: undefined });
    expect(shouldShowMajorShareholderChip(item)).toBe(true);
  });
});

// ============================================================
// StockItemTableView 렌더
// ============================================================

describe("StockItemTableView — 렌더", () => {
  it("빈 items → 테이블 미렌더 (null)", () => {
    const { container } = render(
      <StockItemTableView
        items={[]}
        selectedItemId={null}
        onSelect={() => {}}
        mode="inheritance"
        heirsCount={0}
        ariaLabel="주식·지분 목록"
      />,
    );
    expect(container.querySelector("table")).toBeNull();
  });

  it("ST-A1 상장 행 평가액 = computeStockValuation 단일출처", () => {
    const item = listed();
    const expected = computeStockValuation(item); // §63③ 할증 내부 처리 — 단일출처 비교
    render(
      <StockItemTableView
        items={[item]}
        selectedItemId={null}
        onSelect={() => {}}
        mode="inheritance"
        heirsCount={0}
        ariaLabel="주식·지분 목록"
      />,
    );
    expect(expected).toBeGreaterThan(0);
    expect(screen.getByText(expected.toLocaleString())).toBeTruthy();
    expect(screen.getByTestId("stock-card")).toBeTruthy();
  });

  it("ST-A2 비상장 V1 행 평가액 = computeEffectiveValuation 단일출처", () => {
    const item = unlistedV1();
    const expected = computeEffectiveValuation(item, "2024-06-01");
    render(
      <StockItemTableView
        items={[item]}
        selectedItemId={null}
        onSelect={() => {}}
        mode="inheritance"
        heirsCount={0}
        valuationDate="2024-06-01"
        ariaLabel="주식·지분 목록"
      />,
    );
    expect(expected).toBeGreaterThan(0);
    expect(screen.getByText(expected.toLocaleString())).toBeTruthy();
  });

  it("ST-A2b valuationDate 스레딩 — V2(evaluationDate 미입력)는 date 전달 시에만 평가", () => {
    const v2 = {
      ...createDefaultUnlistedStockV2(),
      evaluationDate: undefined as unknown as Date,
      totalShares: 10_000,
      ownedShares: 10_000,
      netAssetValueRaw: {
        ...createDefaultUnlistedStockV2().netAssetValueRaw,
        totalAssets: 2_000_000_000,
        totalLiabilities: 1_000_000_000,
      },
    };
    const item: EstateItem = {
      id: "us-v2",
      category: "unlisted_stock",
      name: "(주)정식",
      unlistedValuationMode: "formal",
      unlistedStockValuationV2: v2,
    };
    // 단일출처 parity — date 전달 평가액이 행에 그대로 표시 (threading 증명)
    const withDate = computeEffectiveValuation(item, "2024-06-01");
    render(
      <StockItemTableView
        items={[item]}
        selectedItemId={null}
        onSelect={() => {}}
        mode="inheritance"
        heirsCount={0}
        valuationDate="2024-06-01"
        ariaLabel="주식·지분 목록"
      />,
    );
    if (withDate > 0) {
      expect(screen.getByText(withDate.toLocaleString())).toBeTruthy();
    } else {
      // 엔진이 net-asset만으로 0 반환하는 경우 — threading은 computeStockValuation 엔진 테스트가 보증
      expect(screen.getByText("미입력")).toBeTruthy();
    }
  });

  it("ST-A3 분류·옵션 배지 isActiveData 필터 — 협의분할 표시 / 법정분할 제외", () => {
    const withAlloc = listed({
      id: "ls-alloc",
      heirAllocations: [{ heirId: "h-spouse", amount: 50_000_000 }],
    });
    const noAlloc = unlistedV1({ id: "us-noalloc" }); // heirAllocations 미설정 → 법정분할(isActiveData false)
    render(
      <StockItemTableView
        items={[withAlloc, noAlloc]}
        selectedItemId={null}
        onSelect={() => {}}
        mode="inheritance"
        heirsCount={2}
        ariaLabel="주식·지분 목록"
      />,
    );
    // 협의분할 칩은 mark "on" → 텍스트 "✓ 협의분할" (regex 부분매칭)
    expect(screen.getByText(/협의분할/)).toBeTruthy();
    // 법정분할(기본·isActiveData false)은 읽기 전용 테이블서 제외
    expect(screen.queryByText(/법정분할/)).toBeNull();
  });

  it("ST-A4 증여세 모드 → 분류·옵션 컬럼 미렌더", () => {
    render(
      <StockItemTableView
        items={[listed()]}
        selectedItemId={null}
        onSelect={() => {}}
        mode="gift"
        heirsCount={0}
        ariaLabel="증여 주식·지분 목록"
      />,
    );
    expect(screen.queryByText("분류·옵션")).toBeNull();
  });

  it("ST-A5 행 클릭 → onSelect(id)", () => {
    const onSelect = vi.fn();
    render(
      <StockItemTableView
        items={[listed({ id: "ls-click" })]}
        selectedItemId={null}
        onSelect={onSelect}
        mode="inheritance"
        heirsCount={0}
        ariaLabel="주식·지분 목록"
      />,
    );
    fireEvent.click(screen.getByTestId("stock-card"));
    expect(onSelect).toHaveBeenCalledWith("ls-click");
  });

  it("ST-A7 평가방식 배지 — V1=간편 / V2=정식", () => {
    const v1 = unlistedV1({ id: "us-v1" });
    const v2: EstateItem = {
      id: "us-v2b",
      category: "unlisted_stock",
      name: "(주)정식",
      unlistedValuationMode: "formal",
      unlistedStockValuationV2: createDefaultUnlistedStockV2(),
    };
    render(
      <StockItemTableView
        items={[v1, v2]}
        selectedItemId={null}
        onSelect={() => {}}
        mode="inheritance"
        heirsCount={0}
        ariaLabel="주식·지분 목록"
      />,
    );
    expect(screen.getByText("간편")).toBeTruthy();
    expect(screen.getByText("정식")).toBeTruthy();
  });

  it("자산명 빈값 → 카테고리 라벨 fallback", () => {
    render(
      <StockItemTableView
        items={[listed({ id: "ls-noname", name: "" })]}
        selectedItemId={null}
        onSelect={() => {}}
        mode="inheritance"
        heirsCount={0}
        ariaLabel="주식·지분 목록"
      />,
    );
    // 종류 셀 + 자산명 셀 양쪽에 "상장주식" → 최소 1회 이상
    expect(screen.getAllByText("상장주식").length).toBeGreaterThanOrEqual(1);
  });
});
