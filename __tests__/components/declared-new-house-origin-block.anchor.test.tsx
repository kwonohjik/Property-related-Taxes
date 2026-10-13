/**
 * @vitest-environment jsdom
 *
 * §155① 신규 주택 **직접 선언 경로**의 취득 경위 위젯 (결정 #43-3·#43-4) — 규칙·route는
 * `__tests__/tax-engine/transfer/declared-new-house-origin.anchor.test.ts`·`__tests__/api/gift-burdened-new-house-origin-43-4.route.anchor.test.ts`.
 *
 * | # | 주장 |
 * |---|---|
 * | W-1 | 공용 블록(`HouseEntryNewHouseOriginBlock`)을 그대로 쓴다 — 같은 선택지·같은 testid |
 * | W-2 | 경위를 고르면 세 필드 patch로 올라가고, 경위가 바뀌면 의미가 다른 날짜 둘을 빈 값으로 비운다 |
 * | W-3 | 저장값(세 필드)이 그대로 표시된다 — 미답은 선택 없음·날짜 칸 없음 |
 * | W-4 | 미답 안내(취득일 그대로 판정 + 확인 필요)와 ⑧ 이동 앵커(data-field)가 있다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DeclaredNewHouseOriginBlock } from "@/components/calc/transfer/DeclaredNewHouseOriginBlock";

afterEach(cleanup);

describe("W-1·W-2 선택 → 세 필드 patch", () => {
  it("분양권을 고르면 경위가 올라가고 날짜 둘은 빈 값으로 비운다", () => {
    const onChange = vi.fn();
    render(
      <DeclaredNewHouseOriginBlock
        fields={{ newHouseOriginKind: "successor_right", newHouseRightAcquisitionDate: "2008-06-01", newHouseRightApprovalDate: "2007-01-01" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("house-row-origin-presale"));
    expect(onChange).toHaveBeenLastCalledWith({
      newHouseOriginKind: "presale",
      newHouseRightAcquisitionDate: "",
      newHouseRightApprovalDate: "",
    });
  });
  it("모름도 하나의 답이다", () => {
    const onChange = vi.fn();
    render(<DeclaredNewHouseOriginBlock fields={{}} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("house-row-origin-unknown"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ newHouseOriginKind: "unknown" }));
  });
});

describe("W-3 저장값 표시", () => {
  it("미답은 날짜 칸이 없고 권리 유래 경위는 날짜 칸이 열린다", () => {
    render(<DeclaredNewHouseOriginBlock fields={{ newHouseOriginKind: "" }} onChange={vi.fn()} />);
    expect(screen.queryByTestId("house-row-right-acquisition-date")).toBeNull();
    cleanup();
    render(<DeclaredNewHouseOriginBlock fields={{ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2021-09-01" }} onChange={vi.fn()} />);
    expect(screen.queryByTestId("house-row-right-acquisition-date")).not.toBeNull();
    expect(screen.getByText("분양권 취득일")).toBeTruthy();
  });
  it("승계 입주권에만 인가일 칸이 있다", () => {
    render(<DeclaredNewHouseOriginBlock fields={{ newHouseOriginKind: "successor_right" }} onChange={vi.fn()} />);
    expect(screen.queryByTestId("house-row-right-approval-date")).not.toBeNull();
    cleanup();
    render(<DeclaredNewHouseOriginBlock fields={{ newHouseOriginKind: "presale" }} onChange={vi.fn()} />);
    expect(screen.queryByTestId("house-row-right-approval-date")).toBeNull();
  });
});

describe("W-4 안내·앵커", () => {
  it("선언한 취득일과 미답 규칙을 말하고, ⑧ 오류가 이동할 앵커가 있다", () => {
    render(<DeclaredNewHouseOriginBlock fields={{}} newAcquisitionDate="2024-06-15" onChange={vi.fn()} />);
    const note = screen.getByTestId("declared-new-house-origin-note").textContent ?? "";
    expect(note).toContain("2024-06-15");
    expect(note).toContain("확인 필요");
    expect(screen.getByTestId("declared-new-house-origin").getAttribute("data-field")).toBe("newHouseOriginKind");
  });
});
