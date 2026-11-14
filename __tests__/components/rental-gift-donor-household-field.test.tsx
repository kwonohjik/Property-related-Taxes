/**
 * @vitest-environment jsdom
 *
 * ⑤ S-4 「이 주택을 증여로 받았나요?」 — 명부 행·양도 주택 장기임대 칸. 말소된 등록(말소일 또는 사목)이 있을 때만 보인다.
 * route anchor(`transfer.route.rental-gift-separate-household.anchor.test.ts`)는 폼 값을 직접 넣는다 — 이 파일이 칸의 존재·범위를 고정한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { SellingHouseLongTermRentalSection } from "@/components/calc/transfer/SellingHouseLongTermRentalSection";
import { rentalGiftDonorPayload } from "@/lib/calc/rental-gift-donor-scope";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const row = (over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "h1",
  region: "capital",
  acquisitionDate: "2022-02-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: true,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});

describe("S-4 증여 질문 칸", () => {
  it("GD-1 ★ 명부 행 — 말소일이 있을 때만 · 「별도세대에게서」 저장 · 장기임대를 끄면 비운다", () => {
    render(<HouseEntryEditor house={row()} onUpdate={() => {}} />);
    expect(screen.queryByTestId("house-rental-gift-donor-h1")).toBeNull();
    cleanup();
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={row({ rentalCancelledDate: "2021-01-02", rentalGiftDonorHousehold: "same" })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-rental-gift-donor-h1-separate"));
    expect(onUpdate).toHaveBeenLastCalledWith({ rentalGiftDonorHousehold: "separate" });
    fireEvent.click(screen.getByText("장기임대 등록주택"));
    expect(onUpdate.mock.calls.at(-1)![0]).toMatchObject({ isLongTermRental: false, rentalGiftDonorHousehold: undefined });
  });
  it("GD-2 명부 행 — 사목(G)이면 말소일 칸이 비어도 보인다", () => {
    render(<HouseEntryEditor house={row({ rentalType: "G" })} onUpdate={() => {}} />);
    expect(screen.getByTestId("house-rental-gift-donor-h1")).toBeTruthy();
  });
  it("GD-3 양도 주택 — 말소일이 있을 때만 · 선택 저장", () => {
    render(<SellingHouseLongTermRentalSection value={{ longTermRental: { isLongTermRental: true } }} onChange={() => {}} />);
    expect(screen.queryByTestId("selling-rental-gift-donor")).toBeNull();
    cleanup();
    const onChange = vi.fn();
    render(
      <SellingHouseLongTermRentalSection
        value={{ longTermRental: { isLongTermRental: true, rentalCancelledDate: "2021-01-02" } }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("selling-rental-gift-donor-separate"));
    expect(onChange.mock.calls.at(-1)![0].longTermRental.rentalGiftDonorHousehold).toBe("separate");
  });
  it("GD-4 ④ — 범위 밖(말소 없음)·「아니오」는 싣지 않는다", () => {
    expect(rentalGiftDonorPayload({ isLongTermRental: true, rentalGiftDonorHousehold: "separate" })).toEqual({});
    expect(rentalGiftDonorPayload({ isLongTermRental: true, rentalCancelledDate: "2021-01-02", rentalGiftDonorHousehold: "none" })).toEqual({});
    expect(rentalGiftDonorPayload({ isLongTermRental: true, rentalCancelledDate: "2021-01-02", rentalGiftDonorHousehold: "same" })).toEqual({
      rentalGiftDonorHousehold: "same",
    });
  });
});
