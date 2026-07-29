/**
 * @vitest-environment jsdom
 *
 * §155② 단서·순위 게이트 — HouseEntryEditor 상속 섹션 토글 가시성·리셋 (2-A2 잔여 UI).
 * - isInherited ON 시에만 동일세대·순위 토글 노출.
 * - 동일세대 ON 시에만 동거봉양 예외 chip 노출.
 * - isInherited OFF 전환 시 3필드 undefined 리셋. 동일세대 OFF 시 동거봉양 리셋.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup); // RTL 수동 cleanup (feedback_rtl_manual_cleanup_required)

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

const SAME_HOUSEHOLD = /상속개시 당시 피상속인과 동일세대/;
const PARENTAL_CARE = /동거봉양 합가 \+ 합가 전 피상속인 보유 주택/;
const RANKING = /피상속인 2주택 이상 — 순위상 상속주택 아님/;
const INHERITED = /피상속인으로부터 상속받은 주택/; // isInherited 토글 distinctive 부분

describe("§155② 단서·순위 토글 가시성·리셋", () => {
  it("isInherited OFF → 동일세대·순위 토글 미노출", () => {
    render(<HouseEntryEditor house={makeHouse({ isInherited: false })} onUpdate={() => {}} />);
    expect(screen.queryByText(SAME_HOUSEHOLD)).toBeNull();
    expect(screen.queryByText(RANKING)).toBeNull();
  });

  it("isInherited ON → 동일세대·순위 토글 노출", () => {
    render(<HouseEntryEditor house={makeHouse({ isInherited: true })} onUpdate={() => {}} />);
    expect(screen.queryAllByText(SAME_HOUSEHOLD).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(RANKING).length).toBeGreaterThan(0);
  });

  it("동일세대 OFF → 동거봉양 예외 chip 미노출", () => {
    render(
      <HouseEntryEditor
        house={makeHouse({ isInherited: true, decedentSameHouseholdAtInheritance: false })}
        onUpdate={() => {}}
      />,
    );
    expect(screen.queryByText(PARENTAL_CARE)).toBeNull();
  });

  it("동일세대 ON → 동거봉양 예외 chip 노출", () => {
    render(
      <HouseEntryEditor
        house={makeHouse({ isInherited: true, decedentSameHouseholdAtInheritance: true })}
        onUpdate={() => {}}
      />,
    );
    expect(screen.queryAllByText(PARENTAL_CARE).length).toBeGreaterThan(0);
  });

  it("isInherited OFF 전환 → 3필드 undefined 리셋", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryEditor
        house={makeHouse({
          isInherited: true,
          decedentSameHouseholdAtInheritance: true,
          parentalCareMergeInheritedHouse: true,
          isRankingDisqualifiedInheritedHouse: true,
        })}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: INHERITED }));
    const patch = onUpdate.mock.calls[0][0];
    expect(patch.isInherited).toBe(false);
    expect(patch.decedentSameHouseholdAtInheritance).toBeUndefined();
    expect(patch.parentalCareMergeInheritedHouse).toBeUndefined();
    expect(patch.isRankingDisqualifiedInheritedHouse).toBeUndefined();
  });

  it("동일세대 OFF 전환 → 동거봉양 예외 undefined 리셋", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryEditor
        house={makeHouse({
          isInherited: true,
          decedentSameHouseholdAtInheritance: true,
          parentalCareMergeInheritedHouse: true,
        })}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: SAME_HOUSEHOLD }));
    const patch = onUpdate.mock.calls[0][0];
    expect(patch.decedentSameHouseholdAtInheritance).toBe(false);
    expect(patch.parentalCareMergeInheritedHouse).toBeUndefined();
  });
});
