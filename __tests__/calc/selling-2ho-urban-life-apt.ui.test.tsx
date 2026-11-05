/**
 * @vitest-environment jsdom
 *
 * V-12 ⑤ — 양도 주택 2호 선언의 「도시형 생활주택인 아파트」 칸 · 3호 칸과의 공유 · 3호 라디오 「모름」 제외.
 * 값 격자는 anchor `selling-2ho-urban-life-apt-deadline.anchor.test.ts`가 고정한다 — 여기서는 칸이 보이는 조건만 본다.
 *
 * | # | 주장 |
 * |---|---|
 * | U-1 | 3호 미선언 · 가목 아파트 → 2호 칸에 토글, 켜면 2호 선언에 true |
 * | U-2 | 3호가 묻는 범위 → 2호 칸은 토글 대신 안내 · 3호 답이 「예」면 2호 ⑪ 연장 칸도 숨는다 |
 * | U-3 | 3호 라디오는 「도시형 생활주택」·「도시형 생활주택 아님」 두 개뿐 |
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SellingHouseLongTermRentalSection } from "@/components/calc/transfer/SellingHouseLongTermRentalSection";
import { TaxIncentiveRentalFields } from "@/components/calc/transfer/TaxIncentiveRentalFields";
import type { RentalDeclaration, TaxIncentiveRentalFacts } from "@/lib/stores/calc-wizard-asset-nbl";

afterEach(cleanup);

const URBAN = /^「주택법」에 따른 도시형 생활주택인 아파트입니다\./;
const ltr: RentalDeclaration = {
  isLongTermRental: true,
  isApartment: true,
  isRegisteredRental: true,
  rentalType: "A",
  rentalRegistrationDate: "2018-01-01",
  businessRegistrationDate: "2018-01-01",
  rentalPeriodYears: "8",
};
const tirAsking: TaxIncentiveRentalFacts = {
  isTaxIncentiveRental: true,
  isTaxIncentiveRentalPurchase: true,
  taxIncentiveRentalRegistrationType: "long_term_general",
};

describe("V-12 양도 주택 2호 칸", () => {
  it("U-1 3호 미선언 → 토글 · 켜면 2호 선언에 true", () => {
    const onChange = vi.fn();
    render(<SellingHouseLongTermRentalSection value={{ longTermRental: ltr }} onChange={onChange} />);
    expect(screen.queryByTestId("rental-urban-life-shared-selling")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: URBAN }));
    expect(onChange).toHaveBeenLastCalledWith({ longTermRental: { ...ltr, isUrbanLifeHousingApartment: true } });
  });

  it("U-2 3호가 묻는 범위 → 안내만 · 3호 「예」면 ⑪ 연장 칸도 숨김", () => {
    const { rerender } = render(
      <SellingHouseLongTermRentalSection value={{ longTermRental: ltr, taxIncentiveRental: tirAsking }} onChange={() => {}} />,
    );
    expect(screen.queryAllByRole("switch", { name: URBAN })).toHaveLength(0);
    expect(screen.getByTestId("rental-urban-life-shared-selling").textContent).toContain("조특법 감면 임대주택");
    expect(screen.queryByTestId("apt-deadline-ext-rental-selling")).not.toBeNull(); // 도시형 아님(미답) → ⑪ 연장 칸이 있다

    rerender(
      <SellingHouseLongTermRentalSection
        value={{ longTermRental: ltr, taxIncentiveRental: { ...tirAsking, isUrbanLifeHousingApartment: true } }}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("apt-deadline-ext-rental-selling")).toBeNull();
  });
});

describe("V-12 3호 라디오", () => {
  it("U-3 「모름」 없이 두 개", () => {
    render(<TaxIncentiveRentalFields value={tirAsking} onPatch={() => {}} idPrefix="t" isApartment />);
    const opts = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="tir-urban-t"]')).map((i) => i.value);
    expect(opts).toEqual(["yes", "no"]);
  });
});
