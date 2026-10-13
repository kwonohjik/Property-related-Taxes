/**
 * @vitest-environment jsdom
 *
 * §155⑧ 행 한 채 — ⑤ 경고 배선 (PR #2155 후속 · 검토 보정).
 * `HousesListSection`(otherUocRowNumberOf) → `HouseEntryEditor` → `HouseEntryOneHouseFactsSection`
 * → `HouseEntryUnavoidableOutsideCapitalBlock`까지 prop이 끊기지 않는지 실제 편집 모달로 묶는다.
 * prop이 optional이라 중간 전달이 빠져도 tsc가 잡지 못한다 — Block 단위 테스트(`__tests__/components/uoc-duplicate-row-warning.anchor.test.tsx`)만으로는 안 지켜진다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { hrow as row } from "./_owned-at-transfer-pr1a-helpers";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const uoc = { oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work" } as const;

function form(houses: ReturnType<typeof row>[]): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-09-18";
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionDate: "2018-01-05" });
  f.householdHousingCount = String(houses.length + 1);
  f.houses = houses;
  return f;
}

describe("§155⑧ ⑤ 경고 — HousesListSection → 편집 모달 배선", () => {
  it("W1 ⑧ 행 두 개 · 둘째 행 편집 → 「주택 1에도」 경고", () => {
    const houses = [
      row({ id: "ha", region: "non_capital", acquisitionDate: "2019-01-01", ...uoc }),
      row({ id: "hb", acquisitionDate: "2015-01-01", isInherited: true, ...uoc }),
    ];
    render(<HousesListSection form={form(houses)} onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText("주택 2 편집"));
    const w = screen.getByTestId("house-row-uoc-duplicate-warning");
    expect(w.textContent).toContain("주택 1에도 이 표시가 있습니다");
  });
  it("W2 첫 행 편집 → 「주택 2에도」(편집 중인 행은 제외하고 센다)", () => {
    const houses = [
      row({ id: "ha", region: "non_capital", acquisitionDate: "2019-01-01", ...uoc }),
      row({ id: "hb", acquisitionDate: "2015-01-01", isInherited: true, ...uoc }),
    ];
    render(<HousesListSection form={form(houses)} onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText("주택 1 편집"));
    expect(screen.getByTestId("house-row-uoc-duplicate-warning").textContent).toContain("주택 2에도 이 표시가 있습니다");
  });
  it("W3 부정 짝 — ⑧ 행 하나뿐이면 그 행을 열어도 경고 없음", () => {
    const houses = [
      row({ id: "ha", region: "non_capital", acquisitionDate: "2019-01-01", ...uoc }),
      row({ id: "hb", acquisitionDate: "2015-01-01", isInherited: true }),
    ];
    render(<HousesListSection form={form(houses)} onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText("주택 1 편집"));
    expect(screen.getByTestId("house-row-unavoidable-outside-capital")).toBeTruthy();
    expect(screen.queryByTestId("house-row-uoc-duplicate-warning")).toBeNull();
  });
  it("W4 PR #2163 후속 — 상대 행이 양도일 뒤 취득이면 겹침이 아니다(⑧과 같은 `housesOwnedAtTransfer` 범위 · 양도일이 배선된다)", () => {
    const houses = [
      row({ id: "ha", region: "non_capital", acquisitionDate: "2019-01-01", ...uoc }),
      row({ id: "hl", region: "non_capital", acquisitionDate: "2026-10-01", ...uoc }),
    ];
    render(<HousesListSection form={form(houses)} onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText("주택 1 편집"));
    expect(screen.getByTestId("house-row-unavoidable-outside-capital")).toBeTruthy();
    expect(screen.queryByTestId("house-row-uoc-duplicate-warning")).toBeNull();
  });
});
