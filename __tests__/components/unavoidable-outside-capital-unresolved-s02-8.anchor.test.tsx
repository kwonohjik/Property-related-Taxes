/**
 * #31(S02-8) §155⑧ 수도권 밖 부득이 주택 — 해소일 ↔ 「사유가 양도일 현재 해소되지 않음」 택일 위젯 (⑤)
 *
 * 종전 안내문은 「아직 해소되지 않았다면 비워 두세요 — 기한이 기산되지 않습니다」였다. 같은 빈 칸에 「해소일을 모른다」가 겹쳐 모르는 세대가
 * 3년 기한 없이 특례를 받았다. 이제 「해소되지 않음」은 명시 선택이고 빈 칸은 「모름」(⑧·⑫가 막는다)이다.
 * 이 위젯의 칩 제목은 ④ 3호 칩(「양도일 현재 사유가 해소되지 않음」)과 **부분 문자열로도 겹치지 않게** 다르다(같은 모달의 셀렉터 유일성).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryUnavoidableOutsideCapitalBlock } from "@/components/calc/transfer/HouseEntryUnavoidableOutsideCapitalBlock";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const house = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "h1",
    region: "non_capital",
    acquisitionDate: "2019-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    oneHouseUnavoidableOutsideCapital: true,
    unavoidableOutsideCapitalReason: "work",
    ...over,
  }) as HouseEntry;

describe("§155⑧ 행 위젯 — 해소일 / 「해소되지 않음」 택일", () => {
  it("W1 기본: 해소일 칸과 택일 안내가 있고 「비워 두세요」 문구는 없다", () => {
    render(<HouseEntryUnavoidableOutsideCapitalBlock house={house()} onUpdate={() => {}} />);
    expect(screen.getByText("§155⑧ 사유 해소일")).toBeTruthy();
    expect(screen.getByText("사유가 양도일 현재 해소되지 않음")).toBeTruthy();
    expect(screen.queryByText(/비워 두세요/)).toBeNull();
    expect(screen.getByText(/둘 중 하나|중 하나가 필요합니다/)).toBeTruthy();
  });

  it("W2 「해소되지 않음」을 고르면 해소일 칸이 사라진다(남은 날짜는 ④가 싣지 않는다)", () => {
    render(<HouseEntryUnavoidableOutsideCapitalBlock house={house({ unavoidableOutsideCapitalUnresolved: true })} onUpdate={() => {}} />);
    expect(screen.queryByText("§155⑧ 사유 해소일")).toBeNull();
  });

  it("W3 칩을 켜면 미해소 선택 + 해소일 비움, 끄면 선택만 해제한다", () => {
    const onUpdate = vi.fn();
    const { rerender } = render(<HouseEntryUnavoidableOutsideCapitalBlock house={house({ unavoidableOutsideCapitalResolvedDate: "2025-01-01" })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-uoc-unresolved-h1").querySelector('[role="switch"]') ?? screen.getByTestId("house-uoc-unresolved-h1"));
    expect(onUpdate).toHaveBeenLastCalledWith({ unavoidableOutsideCapitalUnresolved: true, unavoidableOutsideCapitalResolvedDate: undefined });
    rerender(<HouseEntryUnavoidableOutsideCapitalBlock house={house({ unavoidableOutsideCapitalUnresolved: true })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-uoc-unresolved-h1").querySelector('[role="switch"]') ?? screen.getByTestId("house-uoc-unresolved-h1"));
    expect(onUpdate).toHaveBeenLastCalledWith({ unavoidableOutsideCapitalUnresolved: undefined });
  });

  it("W4 §155⑧ 토글을 끄면 미해소 선택도 함께 지운다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryUnavoidableOutsideCapitalBlock house={house({ unavoidableOutsideCapitalUnresolved: true })} onUpdate={onUpdate} />);
    const root = screen.getByTestId("house-row-unavoidable-outside-capital");
    fireEvent.click(root.querySelector('[role="switch"]') as Element);
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        oneHouseUnavoidableOutsideCapital: undefined,
        unavoidableOutsideCapitalResolvedDate: undefined,
        unavoidableOutsideCapitalUnresolved: undefined,
      }),
    );
  });
});
