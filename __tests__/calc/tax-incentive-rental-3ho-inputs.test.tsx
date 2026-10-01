/**
 * @vitest-environment jsdom
 *
 * ⑤ 소령 §167의3①3호 감면대상장기임대주택 입력 칸 — 양도 주택 섹션 · 명부 행 「특례 구분」 칩.
 *
 * ④ 어댑터 anchor(`tax-incentive-rental-3ho-wiring.anchor.test.ts`)는 폼 값을 **직접 만들어** 본다 —
 * 화면에 칸이 없으면 그 값은 영원히 undefined이고 어댑터 anchor는 그대로 초록이다
 * ([[feedback_required_field_needs_an_input_path]]). 이 파일이 칸의 존재와 OFF 리셋 규약을 고정한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SellingHouseTaxIncentiveRentalSection } from "@/components/calc/transfer/SellingHouseTaxIncentiveRentalSection";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup); // RTL 수동 cleanup (feedback_rtl_manual_cleanup_required)

const sw = (label: string) => document.querySelector(`[data-slot="switch"][aria-label="${label}"]`);
const SELLING_TOGGLE = "양도 주택이 조특법 감면 임대주택";
const ROW_CHIP = "조특법 감면 임대주택(3호)";

function makeHouse(overrides: Partial<HouseEntry> = {}): HouseEntry {
  return {
    id: "h1",
    region: "capital",
    acquisitionDate: "2018-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...overrides,
  };
}

describe("⑤ 양도 주택 3호 섹션", () => {
  it("TU-1 미선언이면 토글만 있고 세부 칸은 없다", () => {
    render(<SellingHouseTaxIncentiveRentalSection value={undefined} onChange={() => {}} />);
    expect(sw(SELLING_TOGGLE)).toHaveAttribute("data-unchecked");
    expect(sw("국민주택")).toBeNull();
  });

  it("TU-2 선언하면 임대기간·국민주택·아파트 칸이 뜨고, 아파트면 후단 매입 여부를 묻는다", () => {
    const { rerender } = render(
      <SellingHouseTaxIncentiveRentalSection
        value={{ taxIncentiveRental: { isTaxIncentiveRental: true } }}
        onChange={() => {}}
      />,
    );
    expect(sw(SELLING_TOGGLE)).toHaveAttribute("data-checked");
    expect(screen.getByText("임대기간 (년)")).toBeTruthy();
    expect(sw("국민주택")).not.toBeNull();
    expect(sw("임대주택이 아파트")).not.toBeNull();
    expect(screen.queryByTestId("tax-incentive-rental-apt-gate-selling")).toBeNull();

    rerender(
      <SellingHouseTaxIncentiveRentalSection
        value={{ taxIncentiveRental: { isTaxIncentiveRental: true, isApartment: true } }}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("tax-incentive-rental-apt-gate-selling")).not.toBeNull();
    // 등록 유형은 매입이 확정된 뒤에만 묻는다(엔진 판정 순서)
    expect(screen.queryByText(/등록 유형/)).toBeNull();
  });

  it("TU-3 매입 → 장기일반이면 도시형 생활주택을, 아님이면 ⑪ 연장 기산일을 묻는다", () => {
    render(
      <SellingHouseTaxIncentiveRentalSection
        value={{
          taxIncentiveRental: {
            isTaxIncentiveRental: true,
            isApartment: true,
            isTaxIncentiveRentalPurchase: true,
            taxIncentiveRentalRegistrationType: "long_term_general",
            isUrbanLifeHousingApartment: false,
          },
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/등록 유형/)).toBeTruthy();
    expect(screen.getByText(/도시형 생활주택인 아파트/)).toBeTruthy();
    expect(screen.getByText(/⑪3호 — 이전고시일/)).toBeTruthy();
  });

  it("TU-4 2호가 켜져 있으면 임대기간·아파트 칸을 다시 그리지 않는다 (같은 사실 두 벌 금지)", () => {
    render(
      <SellingHouseTaxIncentiveRentalSection
        value={{
          longTermRental: { isLongTermRental: true, isApartment: true, rentalPeriodYears: "8" },
          taxIncentiveRental: { isTaxIncentiveRental: true },
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("임대기간 (년)")).toBeNull();
    expect(sw("임대주택이 아파트")).toBeNull();
    // 아파트 여부는 2호 칸 값(true)으로 후단을 연다
    expect(screen.queryByTestId("tax-incentive-rental-apt-gate-selling")).not.toBeNull();
  });

  it("TU-5 토글을 끄면 묶음을 통째로 버린다 (남은 값이 ④로 새지 않는다)", () => {
    const onChange = vi.fn();
    render(
      <SellingHouseTaxIncentiveRentalSection
        value={{ isCulturalHeritage: true, taxIncentiveRental: { isTaxIncentiveRental: true, rentalPeriodYears: "6" } }}
        onChange={onChange}
      />,
    );
    (sw(SELLING_TOGGLE) as HTMLElement).click();
    expect(onChange).toHaveBeenCalledWith({ isCulturalHeritage: true, taxIncentiveRental: undefined });
  });
});

describe("⑤ 명부 행 「특례 구분」 3호 칩", () => {
  it("TU-6 기본(판정 메뉴)에서는 칩이 없다 — 계산기만 연다", () => {
    render(<HouseEntryEditor house={makeHouse()} onUpdate={() => {}} />);
    expect(sw(ROW_CHIP)).toBeNull();
  });

  it("TU-7 계산기에서는 칩이 있고, 켜면 임대기간·국민주택 칸이 뜬다", () => {
    const { rerender } = render(
      <HouseEntryEditor house={makeHouse()} onUpdate={() => {}} taxIncentiveRentalEnabled />,
    );
    expect(sw(ROW_CHIP)).toHaveAttribute("data-unchecked");
    expect(sw("국민주택")).toBeNull();
    rerender(
      <HouseEntryEditor house={makeHouse({ isTaxIncentiveRental: true })} onUpdate={() => {}} taxIncentiveRentalEnabled />,
    );
    expect(sw("국민주택")).not.toBeNull();
  });

  it("TU-8 칩 OFF는 3호 전용 사실을 지우되, 2호가 켜져 있으면 공유 칸(임대기간)을 남긴다", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryEditor
        house={makeHouse({ isTaxIncentiveRental: true, isLongTermRental: true, rentalPeriodYears: "6", isTaxIncentiveRentalPurchase: true })}
        onUpdate={onUpdate}
        taxIncentiveRentalEnabled
      />,
    );
    (sw(ROW_CHIP) as HTMLElement).click();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isTaxIncentiveRental: false, isTaxIncentiveRentalPurchase: undefined, rentalPeriodYears: "6" }),
    );
  });

  it("TU-9 2호 OFF도 3호가 켜져 있으면 임대기간을 지우지 않는다 (공유 칸 보존)", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryEditor
        house={makeHouse({ isTaxIncentiveRental: true, isLongTermRental: true, rentalPeriodYears: "6" })}
        onUpdate={onUpdate}
        taxIncentiveRentalEnabled
      />,
    );
    (sw("장기임대 등록주택") as HTMLElement).click();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ isLongTermRental: false, rentalPeriodYears: "6" }));
  });
});
