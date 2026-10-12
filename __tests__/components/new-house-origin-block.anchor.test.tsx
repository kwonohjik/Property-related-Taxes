/**
 * @vitest-environment jsdom
 *
 * §155① 신규 주택 취득 경위 위젯 (결정 #43 · G6-4) — 엔진·route는 `__tests__/tax-engine/transfer/new-house-origin.anchor.test.ts`.
 *
 * | # | 주장 |
 * |---|---|
 * | W-1 | 경위를 고르면 같은 칸으로 올라가고, 경위가 바뀌면 의미가 다른 날짜를 비운다 |
 * | W-2 | 권리 유래 경위에만 날짜 칸이 열리고 칸 이름이 경위마다 다르다 · 일반·모름에는 없다 |
 * | W-3 | 입주권 승계에만 인가일(선택) 칸이 있다 · 2006.1.1. 전 승계는 비워도 대상 아님 안내 |
 * | W-4 | 분양권 취득일 안내 — 동일세대 상속 = 피상속인 취득일 · 그 밖의 상속 = 상속개시일 · 증여 = 증여일 |
 * | E-1 | 편집 모달은 `newHouseOriginEnabled`일 때만 이 블록을 그린다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryNewHouseOriginBlock } from "@/components/calc/transfer/HouseEntryNewHouseOriginBlock";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

afterEach(cleanup);

const row = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "b",
    region: "capital",
    acquisitionDate: "2025-09-15",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

describe("W-1 경위 선택", () => {
  it("고르면 같은 칸으로 올라가고 경위가 바뀌면 날짜를 비운다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryNewHouseOriginBlock house={row({ acquisitionOrigin: "presale", rightAcquisitionDate: "2021-09-01" })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-row-origin-successor_right"));
    expect(onUpdate).toHaveBeenLastCalledWith({
      acquisitionOrigin: "successor_right",
      rightAcquisitionDate: undefined,
      rightApprovalDate: undefined,
    });
  });
  it("모름도 하나의 답이다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryNewHouseOriginBlock house={row()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-row-origin-unknown"));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ acquisitionOrigin: "unknown" }));
  });
});

describe("W-2 날짜 칸", () => {
  it("권리 유래 경위마다 칸 이름이 다르다", () => {
    const labels: Record<string, string> = {
      presale: "분양권 취득일",
      successor_right: "조합원입주권 승계취득일",
      original_member_non_house: "관리처분계획 인가일",
      original_member_house: "기존주택 취득일",
      self_rebuild: "헐기 전 주택 취득일",
    };
    for (const [origin, label] of Object.entries(labels)) {
      render(<HouseEntryNewHouseOriginBlock house={row({ acquisitionOrigin: origin as never })} onUpdate={vi.fn()} />);
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByTestId("house-row-right-acquisition-date")).toBeTruthy();
      cleanup();
    }
  });
  it("일반·모름·미답에는 날짜 칸이 없다", () => {
    for (const origin of ["general", "unknown", undefined] as const) {
      render(<HouseEntryNewHouseOriginBlock house={row({ acquisitionOrigin: origin })} onUpdate={vi.fn()} />);
      expect(screen.queryByTestId("house-row-right-acquisition-date")).toBeNull();
      cleanup();
    }
  });
});

describe("W-3 인가일", () => {
  it("입주권 승계에만 인가일(선택) 칸이 있다", () => {
    render(<HouseEntryNewHouseOriginBlock house={row({ acquisitionOrigin: "successor_right" })} onUpdate={vi.fn()} />);
    expect(screen.queryByTestId("house-row-right-approval-date")).not.toBeNull();
    cleanup();
    render(<HouseEntryNewHouseOriginBlock house={row({ acquisitionOrigin: "presale" })} onUpdate={vi.fn()} />);
    expect(screen.queryByTestId("house-row-right-approval-date")).toBeNull();
  });
  it("인가일 안내 — 2006.1.1. 전 승계취득이면 비워도 대상이 아니고, 인가일은 승계취득일보다 늦을 수 없다", () => {
    render(<HouseEntryNewHouseOriginBlock house={row({ acquisitionOrigin: "successor_right" })} onUpdate={vi.fn()} />);
    const hint = screen.getByTestId("house-row-right-approval-date-hint").textContent ?? "";
    expect(hint).toContain("승계취득일보다 늦을 수 없습니다");
    expect(hint).toContain("승계취득일이 2006.1.1. 전이면");
    expect(hint).toContain("인가일을 비워도 같습니다");
    expect(hint).not.toContain("비우면 대상으로 봅니다");
  });
});

describe("W-4 분양권 취득일 안내 (결정 #43 조건 — 권리 종류별 기준일)", () => {
  it("동일세대 상속은 피상속인 취득일, 그 밖의 상속은 상속개시일, 증여는 증여일을 안내한다", () => {
    render(<HouseEntryNewHouseOriginBlock house={row({ acquisitionOrigin: "presale" })} onUpdate={vi.fn()} />);
    const hint = screen.getByText(/청약으로 받은 분양권은 당첨일/).textContent ?? "";
    expect(hint).toContain("피상속인과 같은 세대였으면 피상속인이 분양권을 취득한 날");
    expect(hint).toContain("그 밖의 상속은 상속개시일");
    expect(hint).toContain("증여받은 분양권은 증여일");
  });
});

describe("E-1 편집 모달 배선", () => {
  it("newHouseOriginEnabled일 때만 그린다", () => {
    render(<HouseEntryEditor house={row()} onUpdate={vi.fn()} newHouseOriginEnabled />);
    expect(screen.queryByTestId("house-row-origin")).not.toBeNull();
    cleanup();
    render(<HouseEntryEditor house={row()} onUpdate={vi.fn()} />);
    expect(screen.queryByTestId("house-row-origin")).toBeNull();
  });
});
