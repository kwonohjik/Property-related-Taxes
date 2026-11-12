/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 다주택 중과배제 임대기간 입력 `RentalPeriodDatesFields`(「임대기간 (년)」 칸 대체).
 *
 * | # | 주장 |
 * |---|---|
 * | UI-1 | 2호 안내에 마·바목 8년(2020.8.18. 전 등록 신청)·10년 구분과 등록일 기산(소령 §167의3③)이 있다 |
 * | UI-2 | 3호는 상속 칸이 없고 등록일 기산 문구가 없다 |
 * | UI-3 | 2호 상속 토글 ON → 피상속인 개월 칸 입력이 `decedentRentalMonths`로 간다 |
 * | UI-4 | 양도 주택 2호 섹션에서 「임대기간 (년)」 칸이 사라졌다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RentalPeriodDatesFields } from "@/components/calc/transfer/RentalPeriodDatesFields";
import { SellingHouseLongTermRentalSection } from "@/components/calc/transfer/SellingHouseLongTermRentalSection";

afterEach(cleanup);

describe("RentalPeriodDatesFields", () => {
  it("UI-1 ★ 2호 안내 — 목별 의무기간·등록일 기산", () => {
    render(<RentalPeriodDatesFields value={{}} onPatch={vi.fn()} variant="long_term" testIdPrefix="t" />);
    const hint = screen.getByTestId("t-period-hint").textContent ?? "";
    expect(hint).toContain("마·바목 10년(2020.8.18. 전 등록 신청분은 8년)");
    expect(hint).toContain("소령 §167의3③");
    expect(hint).toContain("3개월을 넘는 공실");
  });

  it("UI-2 3호 — 상속 칸 없음 · 등록일 기산 문구 없음", () => {
    render(<RentalPeriodDatesFields value={{}} onPatch={vi.fn()} variant="tax_incentive" testIdPrefix="t" />);
    expect(screen.queryByTestId("t-inherited")).toBeNull();
    expect(screen.getByTestId("t-period-hint").textContent).not.toContain("§167의3③");
  });

  it("UI-3 ★ 상속 토글 ON → 피상속인 개월 입력", () => {
    const onPatch = vi.fn();
    render(
      <RentalPeriodDatesFields
        value={{ isInheritedRental: true }}
        onPatch={onPatch}
        variant="long_term"
        testIdPrefix="t"
      />,
    );
    const input = screen.getByPlaceholderText("피상속인 임대 개월");
    fireEvent.change(input, { target: { value: "24" } });
    expect(onPatch).toHaveBeenCalledWith({ decedentRentalMonths: "24" });
  });

  it("UI-4 양도 주택 2호 섹션 — 「임대기간 (년)」 칸 없음 · 임대개시일 칸 있음", () => {
    render(
      <SellingHouseLongTermRentalSection
        value={{ longTermRental: { isLongTermRental: true } }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("임대기간 (년)")).toBeNull();
    expect(screen.getByTestId("selling-rental-period").textContent).toContain("임대개시일");
  });
});
