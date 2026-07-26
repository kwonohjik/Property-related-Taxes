/**
 * @vitest-environment jsdom
 *
 * RentalUnitCard — stale/invalid rentalCategory 크래시 회귀 anchor
 *
 * 배경: setRegDate가 `avail[next.rentalCategory].available`를 옵셔널 체이닝 없이 접근해,
 * 세션스토리지에 남은 구 스키마 unit의 rentalCategory가 유효 5값(long_general·short_6y·
 * existing_business·unsold_08_09·pre_2018)이 아니면 등록일 입력 순간
 * "Cannot read properties of undefined (reading 'available')"로 크래시 →
 * DateInput onChange 도중 throw → 연도 4자리 입력해도 커서 이동 불가.
 *
 * 수정: `avail[next.rentalCategory]?.available` — 크래시 방지 + long_general로 self-heal.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

describe("RentalUnitCard invalid rentalCategory 크래시 회귀", () => {
  it("유효하지 않은 rentalCategory에서 등록일 입력 시 크래시 없이 long_general로 self-heal", () => {
    const onChange = vi.fn();
    const base = makeDefaultRentalUnit();
    // 구 스키마/미이전 데이터: 5값 밖의 값(undefined 아님이라 migrate backfill도 놓침)
    const unit = { ...base, rentalCategory: "" as typeof base.rentalCategory };

    render(
      <RentalUnitCard
        unit={unit}
        index={0}
        onChange={onChange}
        onRemove={() => {}}
        canRemove={false}
      />,
    );

    // 세무서 사업자등록일 연도 4자리 입력 → setRegDate 경유 (예외 발생 시 이 호출에서 throw)
    const bizReg = screen.getByTestId("rental-biz-reg-date-0");
    const year = within(bizReg).getByLabelText("연도") as HTMLInputElement;
    expect(() =>
      fireEvent.change(year, { target: { value: "2009" } }),
    ).not.toThrow();

    // onChange가 호출되고, 무효 카테고리는 long_general로 치유됨
    expect(onChange).toHaveBeenCalled();
    const lastArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastArg.rentalCategory).toBe("long_general");
  });
});
