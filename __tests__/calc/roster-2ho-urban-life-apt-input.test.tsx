/**
 * @vitest-environment jsdom
 *
 * ⑤ 명부 2호 장기임대 행 「도시형 생활주택인 아파트」 칸 (V-11). ④·엔진 anchor(`roster-2ho-urban-life-apt-deadline.anchor.test.ts`)는
 * 폼 값을 직접 만든다 — 칸이 없으면 그 값은 영원히 undefined라 이 파일이 칸의 존재·범위·공유 칸 보존을 고정한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { SellingHouseLongTermRentalSection } from "@/components/calc/transfer/SellingHouseLongTermRentalSection";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const sw = (label: string) => document.querySelector(`[data-slot="switch"][aria-label="${label}"]`);
const URBAN = "「주택법」에 따른 도시형 생활주택인 아파트입니다.";
const ROW_CHIP = "조특법 감면 임대주택(3호)";

const row = (patch: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "h2",
  region: "capital",
  acquisitionDate: "2015-06-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: true,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  isRegisteredRental: true,
  rentalType: "A",
  rentalRegistrationDate: "2018-01-01",
  businessRegistrationDate: "2018-01-01",
  ...patch,
});

describe("⑤ 명부 2호 행 도시형 생활주택 칸 (V-11)", () => {
  it("U-1 계산기 · 가목 아파트 행이면 칸이 있고, 켜면 true를 보낸다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={row()} onUpdate={onUpdate} taxIncentiveRentalEnabled />);
    const el = sw(URBAN) as HTMLElement;
    expect(el).not.toBeNull();
    el.click();
    expect(onUpdate).toHaveBeenCalledWith({ isUrbanLifeHousingApartment: true });
  });

  it("U-2 켜져 있으면 끌 때 false가 아니라 undefined(「아니오」로 단정하지 않는다 — 3호 칸과 같은 필드)", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={row({ isUrbanLifeHousingApartment: true })} onUpdate={onUpdate} taxIncentiveRentalEnabled />);
    (sw(URBAN) as HTMLElement).click();
    expect(onUpdate).toHaveBeenCalledWith({ isUrbanLifeHousingApartment: undefined });
  });

  it("U-3 범위 밖 — 아파트 아님 · 아목(H) · 판정 메뉴(중과 미호출)에는 칸이 없다", () => {
    const { rerender } = render(<HouseEntryEditor house={row({ isApartment: false })} onUpdate={() => {}} taxIncentiveRentalEnabled />);
    expect(sw(URBAN)).toBeNull();
    rerender(<HouseEntryEditor house={row({ rentalType: "H" })} onUpdate={() => {}} taxIncentiveRentalEnabled />);
    expect(sw(URBAN)).toBeNull();
    rerender(<HouseEntryEditor house={row()} onUpdate={() => {}} />);
    expect(sw(URBAN)).toBeNull();
  });

  it("U-4 양도 주택 2호 섹션 — 3호가 묻지 않으면 칸이 있고, 3호가 묻으면 안내로 대신한다(V-12 · 상세는 `selling-2ho-urban-life-apt.ui.test.tsx`)", () => {
    const ltr = { isLongTermRental: true, isApartment: true, rentalType: "A" as const, isRegisteredRental: true };
    const { rerender } = render(<SellingHouseLongTermRentalSection value={{ longTermRental: ltr }} onChange={() => {}} />);
    expect(sw(URBAN)).not.toBeNull();
    rerender(
      <SellingHouseLongTermRentalSection
        value={{
          longTermRental: ltr,
          taxIncentiveRental: { isTaxIncentiveRental: true, isTaxIncentiveRentalPurchase: true, taxIncentiveRentalRegistrationType: "long_term_general" },
        }}
        onChange={() => {}}
      />,
    );
    expect(sw(URBAN)).toBeNull();
  });

  it("U-5 3호 칩 OFF는 2호가 켜져 있으면 도시형 칸(공유)을 지우지 않는다", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryEditor
        house={row({ isTaxIncentiveRental: true, isUrbanLifeHousingApartment: true })}
        onUpdate={onUpdate}
        taxIncentiveRentalEnabled
      />,
    );
    (sw(ROW_CHIP) as HTMLElement).click();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ isTaxIncentiveRental: false, isUrbanLifeHousingApartment: true }));
  });

  it("U-5 [짝] 2호가 꺼져 있으면 3호 칩 OFF가 도시형 칸을 지운다(종전 규약)", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryEditor
        house={row({ isLongTermRental: false, isTaxIncentiveRental: true, isUrbanLifeHousingApartment: true })}
        onUpdate={onUpdate}
        taxIncentiveRentalEnabled
      />,
    );
    (sw(ROW_CHIP) as HTMLElement).click();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ isTaxIncentiveRental: false, isUrbanLifeHousingApartment: undefined }));
  });
});
