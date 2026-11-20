/**
 * D-59 — 6.55 재판정(명부 장기임대 행을 빼고 다시 판정)이 뺀 행에 **연결된** 조특 제외 선언까지 걷어내는가.
 * 종전에는 행만 빼고 그 행의 §99의2·§99의4 선언을 남겨 같은 주택을 두 번 뺐다(⑳ 「요건 충족」인데 「3채 중 0채」 → 과세).
 */
import { describe, it, expect } from "vitest";
import { withoutRosterRows } from "@/lib/tax-engine/one-house/without-roster-rows";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const input = {
  householdHousingCount: 3,
  houses: [
    { id: "selling", isLongTermRental: false },
    { id: "r1", isLongTermRental: true },
    { id: "r2", isLongTermRental: true },
  ],
  sellingHouseId: "selling",
  specialHouseExclusions: [{ article: "art_99_2", houseId: "r1" }, { article: "art_99_3", houseId: "x" }],
  reductions: [{ type: "new_house_99_4", houseId: "r1" }, { type: "self_farming" }],
} as unknown as TransferTaxInput;

describe("withoutRosterRows (D-59)", () => {
  it("뺀 행과 그 행에 연결된 선언을 함께 걷어내고, 행 id가 없거나 다른 행의 선언은 남긴다", () => {
    const r = withoutRosterRows(input, ["r1", "r2"], true);
    expect(r.houses?.map((h) => h.id)).toEqual(["selling"]);
    expect(r.householdHousingCount).toBe(1);
    expect(r.specialHouseExclusions).toEqual([{ article: "art_99_3", houseId: "x" }]);
    expect(r.reductions).toEqual([{ type: "self_farming" }]);
  });

  it("선언 배열이 없으면 키를 만들지 않는다", () => {
    const bare = { householdHousingCount: 2, houses: [{ id: "selling" }, { id: "r1", isLongTermRental: true }], sellingHouseId: "selling" } as unknown as TransferTaxInput;
    const r = withoutRosterRows(bare, ["r1"], true);
    expect("specialHouseExclusions" in r).toBe(false);
    expect("reductions" in r).toBe(false);
  });
});
