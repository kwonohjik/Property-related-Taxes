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

  /** 1/2 계산의 공실·상속 처리는 해석례 미확보 — 해당할 때만 확인 필요 고지(사용자 결정 2026-11-12 · 세액 불변). */
  const renderWith = (patch: Record<string, unknown>) =>
    render(<RentalTerminationBlock unit={{ ...base, ...patch }} index={0} set={vi.fn()} onChange={vi.fn()} />);

  it("NT-1 ★ 3개월을 넘는 공백이 있으면 공실 확인 필요 고지", () => {
    renderWith({ rentalPeriods: [{ start: "2018-01-01", end: "2019-01-01" }, { start: "2019-06-01", end: "2022-03-01" }] });
    expect(screen.getByTestId("rental-half-duty-gap-notice-0").textContent).toContain("확인 필요");
  });

  it("NT-2 공백이 3개월 이내면 고지하지 않는다", () => {
    renderWith({ rentalPeriods: [{ start: "2018-01-01", end: "2019-01-01" }, { start: "2019-03-01", end: "2022-03-01" }] });
    expect(screen.queryByTestId("rental-half-duty-gap-notice-0")).toBeNull();
    expect(screen.queryByTestId("rental-half-duty-inherited-notice-0")).toBeNull();
  });

  it("NT-3 ★ 상속 승계(옛 isInheritedRental 기록 포함)면 5310 유추 확인 필요 고지", () => {
    renderWith({ rentalPeriods: [{ start: "2018-01-01", end: "2022-03-01" }], isInheritedRental: true, decedentRentalMonths: "12" });
    const t = screen.getByTestId("rental-half-duty-inherited-notice-0").textContent ?? "";
    expect(t).toContain("서면-2020-법규재산-5310");
    expect(t).toContain("확인 필요");
  });

  it("NT-4 증여 승계는 4972 통산 + 1/2 직접 해석 없음(확인 필요), 포괄양수는 5310 정면", () => {
    renderWith({ rentalPeriods: [{ start: "2018-01-01", end: "2022-03-01" }], rentalSuccession: "household_gift", decedentRentalMonths: "12" });
    const gift = screen.getByTestId("rental-half-duty-inherited-notice-0").textContent ?? "";
    expect(gift).toContain("증여자 임대기간");
    expect(gift).toContain("서면-2022-법규재산-4972");
    expect(gift).toContain("확인 필요");
    cleanup();
    renderWith({ rentalPeriods: [{ start: "2018-01-01", end: "2022-03-01" }], rentalSuccession: "assumption", decedentRentalMonths: "12" });
    const assumed = screen.getByTestId("rental-half-duty-inherited-notice-0").textContent ?? "";
    expect(assumed).toContain("서면-2020-법규재산-5310");
    expect(assumed).not.toContain("확인 필요");
  });
});

/** HD-5 — 말소일 뒤 임대분은 1/2에서 뺀다(사용자 결정 2026-11-12 · 정면 해석례 없음 → 잘린 구간이 있을 때만 확인 필요). */
describe("HD-5 말소 블록 — 말소일까지 셈", () => {
  const renderAt = (patch: Record<string, unknown>) =>
    render(
      <RentalTerminationBlock
        unit={{ ...base, rentalRegistrationDate: "2019-01-01", rentalRegisteredDate: "2019-01-01", ...patch }}
        index={0}
        set={vi.fn()}
        onChange={vi.fn()}
      />,
    );

  it("★ 구간이 말소일 뒤로 이어지면 말소일까지 개월(17)과 확인 필요 고지", () => {
    renderAt({ rentalPeriods: [{ start: "2019-01-01", end: "2022-01-01" }], registrationCancellationDate: "2020-06-01" });
    expect(screen.getByTestId("rental-half-duty-months-0").textContent).toContain("17개월");
    expect(screen.getByTestId("rental-half-duty-after-cancel-notice-0").textContent).toContain("확인 필요");
  });

  it("짝 — 구간이 말소일에서 끝나면 고지하지 않는다", () => {
    renderAt({ rentalPeriods: [{ start: "2019-01-01", end: "2020-06-01" }], registrationCancellationDate: "2020-06-01" });
    expect(screen.queryByTestId("rental-half-duty-after-cancel-notice-0")).toBeNull();
  });
});
