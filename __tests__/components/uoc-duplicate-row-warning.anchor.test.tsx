/**
 * §155⑧ 행 한 채 — ⑤ 위젯 경고 (PR #2155 후속). 다른 행에 이미 ⑧ 표시가 있으면 켠 행에서 그 행 번호와 함께 「한 채만」을 알린다.
 * 막는 것은 ⑧·⑫다(`duplicateUnavoidableOutsideCapitalRows`) — 이 카드는 그 오류를 만난 사용자가 어느 행을 끌지 고르게 한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HouseEntryUnavoidableOutsideCapitalBlock } from "@/components/calc/transfer/HouseEntryUnavoidableOutsideCapitalBlock";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const house = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "h2",
    region: "non_capital",
    acquisitionDate: "2019-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    oneHouseUnavoidableOutsideCapital: true,
    unavoidableOutsideCapitalReason: "work",
    ...over,
  }) as HouseEntry;

describe("§155⑧ ⑤ — 다른 행 ⑧ 표시 경고", () => {
  it("U1 켠 행 + 다른 행 번호 → 경고에 그 행 번호", () => {
    render(<HouseEntryUnavoidableOutsideCapitalBlock house={house()} onUpdate={() => {}} otherUocRowNumber={1} />);
    const w = screen.getByTestId("house-row-uoc-duplicate-warning");
    expect(w.textContent).toContain("주택 1에도 이 표시가 있습니다");
    expect(w.textContent).toContain("한 채만");
  });
  it("U2 부정 짝 — 다른 행 없음 · 꺼진 행이면 경고 없음", () => {
    render(<HouseEntryUnavoidableOutsideCapitalBlock house={house()} onUpdate={() => {}} />);
    expect(screen.queryByTestId("house-row-uoc-duplicate-warning")).toBeNull();
    cleanup();
    render(
      <HouseEntryUnavoidableOutsideCapitalBlock
        house={house({ oneHouseUnavoidableOutsideCapital: undefined })}
        onUpdate={() => {}}
        otherUocRowNumber={1}
      />,
    );
    expect(screen.queryByTestId("house-row-uoc-duplicate-warning")).toBeNull();
  });
});
