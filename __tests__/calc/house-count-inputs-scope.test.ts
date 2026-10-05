/**
 * anchor — `houseCountInputsVisible`·`houseRosterRendered`의 무조건절(F1 확장, PR-B 2026-10-05).
 *
 * 재개발APT에서 「1/2/3+」 스칼라 버튼을 없애면(Step4.tsx `isOneHouseExemptionAsset` 분기),
 * 이 두 술어가 `"housing"` 하나만 무조건 열면 **명부를 열 화면 자체가 없어진다**
 * (닭-달걀 — `house-count-inputs-scope.ts` 주석 참조). housing과 같이 넓혔는지 직접 고정한다.
 */
import { describe, it, expect } from "vitest";
import { houseCountInputsVisible, houseRosterRendered } from "@/lib/calc/house-count-inputs-scope";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    houses: [],
    specialHouseExclusions: [],
    presaleRights: [],
    householdHousingCount: "1",
    ...over,
  } as unknown as TransferFormData;
}

describe("houseCountInputsVisible — F1 무조건절", () => {
  it("[HCIV-1] housing · 0행 · 스칼라 1 → 열린다", () => {
    expect(houseCountInputsVisible(form(), "housing")).toBe(true);
  });

  it("[HCIV-2] 🔴 PR-B — redevelopment_apt · 0행 · 스칼라 1 → housing과 같이 열린다", () => {
    expect(houseCountInputsVisible(form(), "redevelopment_apt")).toBe(true);
  });

  it("[HCIV-3] 입주권(F1 범위 밖) · 0행 · 스칼라 1 → 닫혀 있다(회귀 가드)", () => {
    expect(houseCountInputsVisible(form(), "right_to_move_in")).toBe(false);
  });
});

describe("houseRosterRendered — F1 무조건절", () => {
  it("[HRR-1] housing · 0행 · 스칼라 1 → 열린다", () => {
    expect(houseRosterRendered(form(), "housing")).toBe(true);
  });

  it("[HRR-2] 🔴 PR-B — redevelopment_apt · 0행 · 스칼라 1 → housing과 같이 열린다", () => {
    expect(houseRosterRendered(form(), "redevelopment_apt")).toBe(true);
  });

  it("[HRR-3] 입주권(F1 범위 밖) · 0행 · 스칼라 1 → 닫혀 있다(회귀 가드)", () => {
    expect(houseRosterRendered(form(), "right_to_move_in")).toBe(false);
  });
});
