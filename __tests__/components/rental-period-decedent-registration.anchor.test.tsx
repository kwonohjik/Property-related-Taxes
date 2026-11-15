/**
 * @vitest-environment jsdom
 *
 * Q-8 ⑤ — 다주택 중과배제 2호 승계 입력(양도 주택 2호 선언·명부 행 공용 `RentalPeriodDatesFields` · 사목 `HouseEntryRentalTypeSection`).
 *
 * | # | 주장 |
 * |---|---|
 * | DR-1 ★ | 상속 ON → 피상속인 등록 사실 3칸 + 1959 안내(가·다목 2018.3.31.만 피상속인 기준) |
 * | DR-2 | 상속 OFF → 피상속인 등록 칸 없음 |
 * | DR-3 | 상속 토글을 끄면 피상속인 개월·등록 3칸을 한 번의 patch로 비운다 |
 * | DR-4 ★ | 동일세대 증여 승계 고지 — 2호에만 · 「확인 필요」 + 1591 |
 * | DR-5 ★ | 사목 1/2 칩 아래 포괄양수 합산·기산 안내(0225·5310) — 사목에서만 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RentalPeriodDatesFields } from "@/components/calc/transfer/RentalPeriodDatesFields";
import { HouseEntryRentalTypeSection } from "@/components/calc/transfer/HouseEntryRentalTypeSection";

afterEach(cleanup);

describe("Q-8 ⑤ 승계 입력", () => {
  it("DR-1 ★ 상속 ON → 피상속인 등록 사실 3칸 + 1959 안내", () => {
    render(<RentalPeriodDatesFields value={{ isInheritedRental: true }} onPatch={vi.fn()} variant="long_term" testIdPrefix="t" />);
    const block = screen.getByTestId("t-decedent-registration");
    expect(block.textContent).toContain("세무서 사업자등록일");
    expect(block.textContent).toContain("지자체 등록 신청일");
    expect(block.textContent).toContain("지자체 등록일");
    const hint = screen.getByTestId("t-decedent-registration-hint").textContent ?? "";
    expect(hint).toContain("서면-2020-법규재산-1959");
    expect(hint).toContain("2018년 3월 31일까지 사업자등록등");
    expect(hint).toContain("그 밖의 요건은 상속인 등록으로");
  });

  it("DR-2 상속 OFF → 피상속인 등록 칸 없음", () => {
    render(<RentalPeriodDatesFields value={{}} onPatch={vi.fn()} variant="long_term" testIdPrefix="t" />);
    expect(screen.queryByTestId("t-decedent-registration")).toBeNull();
  });

  it("DR-3 상속 토글 OFF → 개월·등록 3칸을 한 번에 비운다", () => {
    const onPatch = vi.fn();
    render(
      <RentalPeriodDatesFields
        value={{
          isInheritedRental: true,
          decedentRentalMonths: "39",
          decedentBusinessRegistrationDate: "2016-03-10",
          decedentRentalRegistrationDate: "2016-03-10",
          decedentRentalRegisteredDate: "2016-03-15",
        }}
        onPatch={onPatch}
        variant="long_term"
        testIdPrefix="t"
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: /상속받아 계속 임대하는 주택/ }));
    // toHaveBeenCalledWith은 undefined 키와 빠진 키를 같게 본다 — 키 존재를 직접 확인한다
    const patch = onPatch.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(
      [
        "decedentBusinessRegistrationDate",
        "decedentRentalMonths",
        "decedentRentalRegisteredDate",
        "decedentRentalRegistrationDate",
        "isInheritedRental",
      ].sort(),
    );
    expect(Object.values(patch).every((v) => v === undefined)).toBe(true);
  });

  it("DR-4 ★ 동일세대 증여 승계 고지 — 2호에만", () => {
    render(<RentalPeriodDatesFields value={{}} onPatch={vi.fn()} variant="long_term" testIdPrefix="t" />);
    const note = screen.getByTestId("t-household-gift-note").textContent ?? "";
    expect(note).toContain("확인 필요");
    expect(note).toContain("기획재정부 재산세제과-1591");
    cleanup();
    render(<RentalPeriodDatesFields value={{}} onPatch={vi.fn()} variant="tax_incentive" testIdPrefix="t" />);
    expect(screen.queryByTestId("t-household-gift-note")).toBeNull();
  });

  it("DR-5 ★ 사목 1/2 칩 아래 포괄양수 안내 — 사목에서만", () => {
    const base = { isLongTermRental: true, isRegisteredRental: true, businessRegistrationDate: "2017-03-01", rentalRegistrationDate: "2017-03-01" };
    render(<HouseEntryRentalTypeSection house={{ ...base, rentalType: "G", saMokBaseArticle: "가" }} idPrefix="t" onUpdate={vi.fn()} />);
    const note = screen.getByTestId("half-duty-assumption-note-t").textContent ?? "";
    expect(note).toContain("기준-2021-법무재산-0225");
    expect(note).toContain("서면-2020-법규재산-5310");
    expect(note).toContain("전 임대사업자 등록일부터");
    cleanup();
    render(<HouseEntryRentalTypeSection house={{ ...base, rentalType: "A" }} idPrefix="t" onUpdate={vi.fn()} />);
    expect(screen.queryByTestId("half-duty-assumption-note-t")).toBeNull();
  });
});
