/**
 * @vitest-environment jsdom
 *
 * US-06 ⑤ — 명부 행 ⑥ 상속 행 · §98의3·§98의5·§98의7 선언에서만 「분양권 상속 후 잔금 취득」을 묻는다(⑧·⑬과 같은 술어).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryCountExclusionSection } from "@/components/calc/transfer/HouseEntryCountExclusionSection";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const row = (article: string, isInherited: boolean): HouseEntry =>
  ({
    id: "h2",
    region: "non_capital",
    acquisitionDate: "2014-03-19",
    officialPrice: "300000000",
    isInherited,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    countExclusion: {
      kind: "special",
      special: { article, houseAcquisitionDate: "", houseContractDate: "2009-02-12", isNationalHousing: false, requirementsConfirmed: true },
    },
  }) as unknown as HouseEntry;

const Q = "house-row-count-exclusion-inherited-presale";

describe("행 ⑥ 분양권 상속 질문", () => {
  it("U-1: 상속 행 §98의3에서만 보인다 — 「예」를 고르면 선언에 답이 저장된다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryCountExclusionSection house={row("unsold_98_3", true)} onUpdate={onUpdate} />);
    expect(screen.getByTestId(Q)).toBeTruthy();
    fireEvent.click(screen.getByTestId(`${Q}-yes`));
    expect(onUpdate).toHaveBeenCalledWith({
      countExclusion: { kind: "special", special: expect.objectContaining({ article: "unsold_98_3", inheritedPresaleCompletedByHeir: "yes" }) },
    });
  });

  it("U-3: 증여 토글 — 상속이 아닌 행 §98의3에서 보이고, 켜면 선언에 acquiredByGift가 저장된다 · 상속 행·범위 밖 조문에는 없다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryCountExclusionSection house={row("unsold_98_3", false)} onUpdate={onUpdate} />);
    const box = screen.getByTestId("house-row-count-exclusion-acquired-by-gift");
    fireEvent.click(box.querySelector('[role="switch"]') as Element);
    expect(onUpdate).toHaveBeenCalledWith({
      countExclusion: { kind: "special", special: expect.objectContaining({ article: "unsold_98_3", acquiredByGift: true }) },
    });
    cleanup();
    render(<HouseEntryCountExclusionSection house={row("unsold_98_3", true)} onUpdate={() => {}} />);
    expect(screen.queryByTestId("house-row-count-exclusion-acquired-by-gift")).toBeNull();
    cleanup();
    render(<HouseEntryCountExclusionSection house={row("unsold_98_8", false)} onUpdate={() => {}} />);
    expect(screen.queryByTestId("house-row-count-exclusion-acquired-by-gift")).toBeNull();
  });

  it("U-2: 상속이 아닌 행 · 묻지 않는 조문(§98의2·§99)에서는 보이지 않는다", () => {
    render(<HouseEntryCountExclusionSection house={row("unsold_98_3", false)} onUpdate={() => {}} />);
    expect(screen.queryByTestId(Q)).toBeNull();
    cleanup();
    for (const a of ["unsold_98_2", "new_99"]) {
      render(<HouseEntryCountExclusionSection house={row(a, true)} onUpdate={() => {}} />);
      expect(screen.queryByTestId(Q)).toBeNull();
      cleanup();
    }
  });
});
