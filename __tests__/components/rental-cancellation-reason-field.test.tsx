/**
 * @vitest-environment jsdom
 *
 * ⑤ 「말소 사유」 칸 — 다주택 중과 영 §167의3①2호 단서(자동말소면 임대기간요건 간주 충족 · #20 C 후속, 사용자 결정 2026-10-13).
 *
 * route anchor(`transfer.route.rental-155-20-unmet-restore-x1-1-g8-1.anchor.test.ts` M-*)는 폼 값을 직접 넣는다 — 화면에 칸이 없으면
 * 그 값은 늘 비어 있고 anchor는 그대로 초록이다. 이 파일이 세 입력 경로(카드 · 명부 행 · 양도 주택 장기임대 칸)의 존재와 노출 범위를 고정한다.
 *
 * | # | 주장 |
 * |---|---|
 * | CR-1 | 카드 — 말소 토글 ON이면 칸이 있고 「자동말소」가 저장된다. 토글 OFF면 칸이 없다 |
 * | CR-2 | 카드 — 토글을 끄면 말소 사유도 함께 비운다(같은 onChange 한 번) |
 * | CR-3 | 명부 행 — 「임대사업자 말소일」을 입력했을 때만 칸이 있고, 장기임대를 끄면 사유도 비운다 |
 * | CR-4 | 양도 주택 장기임대 칸 — 말소일을 입력했을 때만 칸이 있고 선택이 저장된다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { SellingHouseLongTermRentalSection } from "@/components/calc/transfer/SellingHouseLongTermRentalSection";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup); // RTL 수동 cleanup (feedback_rtl_manual_cleanup_required)

const TOGGLE = "자진말소 또는 자동말소로 임대사업자 등록이 말소된 임대주택입니다.";

/** 가목(2018.3.1. 등록 매입 장기일반) — ㉓ 말소 토글이 보이는 목 */
const unit = (rentalAutoTermination: boolean) => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2018-03-01",
  rentalRegistrationDate: "2018-03-01",
  rentalAutoTermination,
  terminationReason: "auto" as const,
});
const renderCard = (on: boolean) => {
  const onChange = vi.fn();
  render(
    <RentalUnitCard unit={unit(on)} index={0} onChange={onChange} onRemove={() => {}} canRemove={false} transferDate="2026-09-18" />,
  );
  return onChange;
};

describe("말소 사유 칸 — 카드", () => {
  it("CR-1 ★ 말소 토글 ON이면 칸이 있고 「자동말소」가 저장된다 · OFF면 칸이 없다", () => {
    const onChange = renderCard(true);
    fireEvent.click(screen.getByTestId("rental-termination-reason-voluntary-0"));
    expect(onChange.mock.calls.at(-1)![0].terminationReason).toBe("voluntary");
    cleanup();
    renderCard(false);
    expect(screen.getByText(TOGGLE)).toBeTruthy();
    expect(screen.queryByTestId("rental-termination-reason-0")).toBeNull();
  });

  it("CR-2 토글을 끄면 말소 사유도 비운다", () => {
    const onChange = renderCard(true);
    fireEvent.click(screen.getByText(TOGGLE));
    const next = onChange.mock.calls.at(-1)![0];
    expect(next.rentalAutoTermination).toBe(false);
    expect(next.terminationReason).toBe("");
  });
});

const row = (over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "h1",
  region: "capital",
  acquisitionDate: "2016-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: true,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});

describe("말소 사유 칸 — 명부", () => {
  it("CR-3 ★ 명부 행 — 말소일을 입력했을 때만 칸이 있고 선택이 저장된다 · 장기임대를 끄면 사유도 비운다", () => {
    render(<HouseEntryEditor house={row()} onUpdate={() => {}} />);
    expect(screen.queryByTestId("house-rental-cancel-reason-h1")).toBeNull();
    cleanup();
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={row({ rentalCancelledDate: "2022-03-01", rentalCancellationReason: "auto" })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-rental-cancel-reason-h1-voluntary"));
    expect(onUpdate).toHaveBeenLastCalledWith({ rentalCancellationReason: "voluntary" });
    fireEvent.click(screen.getByText("장기임대 등록주택"));
    expect(onUpdate.mock.calls.at(-1)![0]).toMatchObject({ isLongTermRental: false, rentalCancellationReason: undefined });
  });

  it("CR-4 양도 주택 장기임대 칸 — 말소일을 입력했을 때만 칸이 있고 선택이 저장된다", () => {
    render(<SellingHouseLongTermRentalSection value={{ longTermRental: { isLongTermRental: true } }} onChange={() => {}} />);
    expect(screen.queryByTestId("selling-rental-cancel-reason")).toBeNull();
    cleanup();
    const onChange = vi.fn();
    render(
      <SellingHouseLongTermRentalSection
        value={{ longTermRental: { isLongTermRental: true, rentalCancelledDate: "2022-03-01" } }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("selling-rental-cancel-reason-auto"));
    expect(onChange.mock.calls.at(-1)![0].longTermRental.rentalCancellationReason).toBe("auto");
  });
});
