/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) V-5 — 말소 블록의 「1/2 판정에 쓰는 임대기간」 표시는 ④가 엔진에 싣는 값(`deriveHalfDutyRentalMonths`)과 같다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalTerminationBlock } from "@/components/calc/transfer/RentalTerminationBlock";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

const base = {
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2020-01-01",
  rentalRegistrationDate: "2018-01-01",
  rentalAutoTermination: true,
  rentalInputMode: "interval" as const,
};

describe("V-5 말소 블록 1/2 판정 개월", () => {
  it("★ 구간이 있으면 지자체 등록일 기산 개월(50)과 근거를 보여 준다", () => {
    render(
      <RentalTerminationBlock
        unit={{ ...base, rentalPeriods: [{ start: "2018-01-01", end: "2022-03-01" }] }}
        index={0}
        set={vi.fn()}
        onChange={vi.fn()}
      />,
    );
    const t = screen.getByTestId("rental-half-duty-months-0").textContent ?? "";
    expect(t).toContain("50개월");
    expect(t).toContain("민특령 §34①2호");
  });

  it("구간이 없으면 표시하지 않는다", () => {
    render(<RentalTerminationBlock unit={{ ...base, rentalPeriods: [] }} index={0} set={vi.fn()} onChange={vi.fn()} />);
    expect(screen.queryByTestId("rental-half-duty-months-0")).toBeNull();
  });
});
