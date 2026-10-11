/**
 * @vitest-environment jsdom
 *
 * 양도 주택 취득 경위 위젯 (결정 #43 하위 2 가) — 판정·검증 leaf는 `__tests__/calc/selling-house-origin-rebuild-155-1.anchor.test.ts`.
 *
 * | # | 주장 |
 * |---|---|
 * | W-1 | 기본은 「일반 취득」이고 날짜 칸이 없다 |
 * | W-2 | 재건축 갈래를 고르면 같은 칸으로 올라가고 날짜 칸이 열린다 · 「일반 취득」으로 돌리면 날짜를 비운다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SellingHouseOriginBlock } from "@/components/calc/transfer/SellingHouseOriginBlock";

afterEach(cleanup);

describe("SellingHouseOriginBlock", () => {
  it("W-1 갈래가 없으면 일반 취득이고 날짜 칸이 없다", () => {
    render(<SellingHouseOriginBlock asset={{}} onUpdate={vi.fn()} />);
    expect(screen.queryByTestId("selling-house-existing-acquisition-date")).toBeNull();
  });
  it("W-2 재건축을 고르면 갈래가 올라가고 날짜가 비워진다", () => {
    const onUpdate = vi.fn();
    render(<SellingHouseOriginBlock asset={{}} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("selling-house-origin-self_rebuild"));
    expect(onUpdate).toHaveBeenLastCalledWith({ sellingHouseRebuildKind: "self_rebuild", sellingHouseExistingAcquisitionDate: undefined });
  });
  it("W-2 갈래가 있으면 날짜 칸이 열리고, 일반 취득으로 돌리면 갈래와 날짜를 함께 비운다", () => {
    const onUpdate = vi.fn();
    render(
      <SellingHouseOriginBlock
        asset={{ sellingHouseRebuildKind: "original_member_house", sellingHouseExistingAcquisitionDate: "2012-05-01" }}
        onUpdate={onUpdate}
      />,
    );
    expect(screen.queryByTestId("selling-house-existing-acquisition-date")).not.toBeNull();
    fireEvent.click(screen.getByTestId("selling-house-origin-general"));
    expect(onUpdate).toHaveBeenLastCalledWith({ sellingHouseRebuildKind: undefined, sellingHouseExistingAcquisitionDate: undefined });
  });
});
