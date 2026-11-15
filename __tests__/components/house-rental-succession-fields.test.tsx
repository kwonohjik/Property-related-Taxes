/**
 * @vitest-environment jsdom
 *
 * Q-8 — 명부 행·양도 주택 2호 임대사업 승계 입력(⑤). 엔진·④⑧⑫ 근거: `__tests__/api/transfer.route.surcharge-rental-succession-q8.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RentalPeriodDatesFields } from "@/components/calc/transfer/RentalPeriodDatesFields";
import { HouseEntryRentalTypeSection } from "@/components/calc/transfer/HouseEntryRentalTypeSection";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

afterEach(cleanup);

describe("Q-8 ⑤ 승계 입력", () => {
  it("U-1 2호 → 승계 네 갈래 · 3호 → 없음", () => {
    render(<RentalPeriodDatesFields value={{}} onPatch={vi.fn()} variant="long_term" testIdPrefix="t" />);
    for (const k of ["none", "inheritance", "household-gift", "assumption"]) expect(screen.getByTestId(`t-succession-${k}`)).toBeTruthy();
    cleanup();
    render(<RentalPeriodDatesFields value={{}} onPatch={vi.fn()} variant="tax_incentive" testIdPrefix="t" />);
    expect(screen.queryByTestId("t-succession")).toBeNull();
  });
  it("U-2 ★ 「동일세대원 증여」 → 한 번의 onPatch로 종류·옛 상속 플래그·개월·전 사업자 날짜 정리", () => {
    const onPatch = vi.fn();
    render(
      <RentalPeriodDatesFields
        value={{ isInheritedRental: true, decedentRentalMonths: "39", predecessorBusinessRegistrationDate: "2016-03-01" }}
        onPatch={onPatch}
        variant="long_term"
        testIdPrefix="t"
      />,
    );
    fireEvent.click(screen.getByTestId("t-succession-household-gift"));
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch.mock.calls[0][0]).toEqual({
      rentalSuccession: "household_gift",
      isInheritedRental: undefined,
      decedentRentalMonths: undefined,
      predecessorBusinessRegistrationDate: undefined,
      predecessorRentalRegistrationDate: undefined,
      predecessorRentalRegisteredDate: undefined,
    });
  });
  it("U-3 증여 → 증여자 등록 3칸(필수 표시 없음 = 선택 아님) · 포괄양수 → 등록 칸 없음 · 상속 → 「(선택)」", () => {
    render(<RentalPeriodDatesFields value={{ rentalSuccession: "household_gift" }} onPatch={vi.fn()} variant="long_term" testIdPrefix="t" />);
    expect(screen.getByTestId("t-predecessor-registration").textContent).toContain("증여자의 등록일");
    expect(screen.getByText("증여자 사업자 등록일")).toBeTruthy();
    cleanup();
    render(<RentalPeriodDatesFields value={{ rentalSuccession: "assumption" }} onPatch={vi.fn()} variant="long_term" testIdPrefix="t" />);
    expect(screen.queryByTestId("t-predecessor-registration")).toBeNull();
    expect(screen.getByPlaceholderText("전 임대사업자 임대 개월")).toBeTruthy();
    cleanup();
    render(<RentalPeriodDatesFields value={{ isInheritedRental: true }} onPatch={vi.fn()} variant="long_term" testIdPrefix="t" />);
    expect(screen.getByTestId("t-predecessor-registration").textContent).toContain("피상속인 등록일을 모르면 비워 두세요");
  });
  it("U-4 사목 1/2 칸 → 포괄양수 기산 안내(5310 · 0225)", () => {
    const house = { id: "h2", isLongTermRental: true, rentalType: "G" } as unknown as HouseEntry;
    render(<HouseEntryRentalTypeSection house={house} idPrefix="h2" onUpdate={vi.fn()} />);
    const t = screen.getByTestId("half-duty-assumption-note-h2").textContent ?? "";
    expect(t).toContain("서면-2020-법규재산-5310");
    expect(t).toContain("기준-2021-법무재산-0225");
  });
});
