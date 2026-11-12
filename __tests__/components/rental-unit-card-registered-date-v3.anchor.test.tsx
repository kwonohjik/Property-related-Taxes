/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — V-3 「지자체 임대사업자 등록일」 칸: 신청일 입력 때 같은 날로 채움 · 임대 구분 활성은 등록일 기준.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const renderCard = (over: Record<string, unknown>, onChange = vi.fn()) => {
  render(
    <RentalUnitCard
      unit={{ ...makeDefaultRentalUnit(), ...over }}
      index={0}
      onChange={onChange}
      onRemove={() => {}}
      canRemove={false}
    />,
  );
  return onChange;
};

function typeDate(testId: string, y: string, m: string, d: string) {
  const box = within(screen.getByTestId(testId));
  fireEvent.change(box.getByLabelText("연도"), { target: { value: y } });
  fireEvent.change(box.getByLabelText("월"), { target: { value: m } });
  fireEvent.change(box.getByLabelText("일"), { target: { value: d } });
}

describe("지자체 임대사업자 등록일 칸", () => {
  it("RC-1 ★ 등록일이 비어 있으면 신청일을 넣을 때 같은 날로 채운다", () => {
    const onChange = renderCard({});
    expect(screen.getByTestId("rental-registered-date-0")).toBeTruthy();
    typeDate("rental-reg-date-0", "2018", "03", "30");
    const last = onChange.mock.calls.at(-1)![0];
    expect(last.rentalRegistrationDate).toBe("2018-03-30");
    expect(last.rentalRegisteredDate).toBe("2018-03-30");
  });

  it("RC-2 신청일과 다르게 고친 등록일은 신청일을 바꿔도 그대로", () => {
    const onChange = renderCard({ rentalRegistrationDate: "2018-03-30", rentalRegisteredDate: "2018-04-04" });
    typeDate("rental-reg-date-0", "2018", "03", "29");
    expect(onChange.mock.calls.at(-1)![0].rentalRegisteredDate).toBe("2018-04-04");
  });

  it("RC-3 ★ 나목 활성은 등록일 기준 — 신청 2003-10-28·등록 2003-10-30이면 기존사업자 안내(비활성 사유)", () => {
    renderCard({ businessRegistrationDate: "2003-10-28", rentalRegistrationDate: "2003-10-28", rentalRegisteredDate: "2003-10-30" });
    expect(screen.getByText(/기존사업자\(나목\)는 지자체 임대사업자 등록이 2003\.10\.29 이전/)).toBeTruthy();
  });

  it("RC-3 짝 — 등록일도 2003-10-28이면 그 안내가 없다", () => {
    renderCard({ businessRegistrationDate: "2003-10-28", rentalRegistrationDate: "2003-10-28", rentalRegisteredDate: "2003-10-28" });
    expect(screen.queryByText(/기존사업자\(나목\)는 지자체 임대사업자 등록이 2003\.10\.29 이전/)).toBeNull();
  });
});
