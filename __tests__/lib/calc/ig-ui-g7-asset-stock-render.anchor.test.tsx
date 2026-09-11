/**
 * @vitest-environment jsdom
 *
 * G7 «렌더» anchor.
 *
 * G6에서 확정된 규칙 — **게이트 축은 소스로 재지 않는다**. 조건만 바꾸는 뮤테이션은
 * 본문 표현식을 남기므로 소스 문자열 anchor를 그대로 통과한다(IG-054 실측).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { CategoryChangeDialog } from "@/components/calc/inheritance/estate-card/CategoryChangeDialog";
import { FbAdditionalBusinessesSection } from "@/components/calc/inheritance/family-business/FbAdditionalBusinessesSection";
import { ValuationDeltaTable } from "@/components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(cleanup);
const noop = () => {};

// ════════════════════════════════════════════════
// IG-040 — 가상자산이 «변경» 다이얼로그에 존재한다
// ════════════════════════════════════════════════
describe("IG-040 — 카테고리 변경으로 가상자산에 도달할 수 있다", () => {
  const item = (category: string) =>
    ({ id: "e-1", category, name: "자산" }) as unknown as EstateItem;

  it("B-1 (양성): 상속 모드에 가상화폐 라디오가 있다", () => {
    render(
      <CategoryChangeDialog open item={item("cash")} mode="inheritance" onConfirm={noop} onCancel={noop} />,
    );
    expect(screen.getByTestId("category-change-radio-crypto_asset-e-1")).toBeTruthy();
  });

  it("B-2 (양성): 증여 모드에도 있다", () => {
    render(
      <CategoryChangeDialog open item={item("cash")} mode="gift" onConfirm={noop} onCancel={noop} />,
    );
    expect(screen.getByTestId("category-change-radio-crypto_asset-e-1")).toBeTruthy();
  });

  it("B-3: crypto_asset 항목을 열면 «(현재)» 라디오가 잡힌다 (미선택 상태 아님)", () => {
    render(
      <CategoryChangeDialog open item={item("crypto_asset")} mode="inheritance" onConfirm={noop} onCancel={noop} />,
    );
    expect(screen.getByText(/가상화폐 \(가상자산\) \(현재\)/)).toBeTruthy();
  });

  it("B-4 (대조군): 다이얼로그 전용 라벨 override는 살아 있다", () => {
    render(
      <CategoryChangeDialog open item={item("cash")} mode="inheritance" onConfirm={noop} onCancel={noop} />,
    );
    expect(screen.getByText(/전세보증금 반환채권 \(상속세 전용\)/)).toBeTruthy();
  });
});

// ════════════════════════════════════════════════
// IG-123 — 자격 미충족이면 복수가업 미리보기가 «금액»을 말하지 않는다
// ════════════════════════════════════════════════
describe("IG-123 — 미리보기가 실제 공제(0)와 어긋나지 않는다", () => {
  const list = [{ operatingYears: 20, businessValue: 10_000_000_000 }];

  it("B-5 (양성): 자격 미충족 → 금액 미리보기 대신 사유 안내", () => {
    render(
      <FbAdditionalBusinessesSection
        value={list}
        onChange={noop}
        mainOperatingYears={30}
        mainValue={20_000_000_000}
        deathDate="2024-01-01"
        eligible={false}
      />,
    );
    expect(screen.getByTestId("fb-multi-preview-ineligible")).toBeTruthy();
    expect(screen.queryByText(/순차공제 미리보기/)).toBeNull();
  });

  it("B-6 (음성·대조군): 자격 충족이면 미리보기가 그대로 나온다", () => {
    render(
      <FbAdditionalBusinessesSection
        value={list}
        onChange={noop}
        mainOperatingYears={30}
        mainValue={20_000_000_000}
        deathDate="2024-01-01"
        eligible
      />,
    );
    expect(screen.getByText(/순차공제 미리보기/)).toBeTruthy();
    expect(screen.queryByTestId("fb-multi-preview-ineligible")).toBeNull();
  });
});

// ════════════════════════════════════════════════
// IG-061 — 행 모드 OFF가 확인을 거치고 평가차액을 이월한다
// ════════════════════════════════════════════════
describe("IG-061 — 계정과목 입력이 확인 없이 사라지지 않는다", () => {
  const rows = [
    { rowId: "a1", category: "asset", accountName: "토지", bookAmount: 100_000_000, evaluationAmount: 500_000_000 },
    { rowId: "l1", category: "liability", accountName: "차입금", bookAmount: 50_000_000, evaluationAmount: 80_000_000 },
  ] as never;

  function renderTable(onRowsChange = vi.fn(), onFallbackChange = vi.fn()) {
    render(
      <ValuationDeltaTable
        evaluationDeltaRows={rows}
        onRowsChange={onRowsChange}
        onFallbackChange={onFallbackChange}
        fallbackAssetValuationDelta={0}
      />,
    );
    return { onRowsChange, onFallbackChange };
  }

  it("B-7 (양성): OFF를 눌러도 즉시 파기되지 않고 확인 Dialog가 뜬다", () => {
    const { onRowsChange } = renderTable();
    fireEvent.click(screen.getAllByRole("switch")[0]);
    expect(onRowsChange).not.toHaveBeenCalled();
    expect(screen.getByText("행 단위 입력을 폐기할까요?")).toBeTruthy();
  });

  it("B-8b (음성·대조군): ON이 자동 생성한 «빈 행»만 있으면 확인 없이 즉시 끈다", () => {
    const onRowsChange = vi.fn();
    render(
      <ValuationDeltaTable
        evaluationDeltaRows={[
          { rowId: "a1", category: "asset", accountName: "", bookAmount: 0, evaluationAmount: 0 },
          { rowId: "l1", category: "liability", accountName: "", bookAmount: 0, evaluationAmount: 0 },
        ] as never}
        onRowsChange={onRowsChange}
        onFallbackChange={noop}
        fallbackAssetValuationDelta={0}
      />,
    );
    fireEvent.click(screen.getAllByRole("switch")[0]);
    // 잃을 것이 없으므로 «확인 없이» 즉시 정리한다.
    // (행을 남기면 `inputMode = preference || hasRows`라 모드가 꺼지지 않는다.)
    expect(screen.queryByText("행 단위 입력을 폐기할까요?")).toBeNull();
    expect(onRowsChange).toHaveBeenCalledWith([]);
  });

  it("B-8: 확인하면 파기되고 «계산된 평가차액»이 총액으로 이월된다", () => {
    const { onRowsChange, onFallbackChange } = renderTable();
    fireEvent.click(screen.getAllByRole("switch")[0]);
    fireEvent.click(screen.getByText("삭제하고 총액 모드로"));
    expect(onRowsChange).toHaveBeenCalledWith([]);
    // 자산차액 400,000,000 − 부채차액 30,000,000 = 370,000,000
    expect(onFallbackChange).toHaveBeenCalledWith(370_000_000);
  });
});
