/**
 * 다른 세대 부수토지 카드의 단기세율 leaf — 계획서 `docs/02-design/features/bundled-other-household-appurtenant-short-rate.plan.md` (AN-1 · AN-2).
 */
import { describe, expect, it } from "vitest";
import { landOnlyOtherHouseholdAppurtenantCardRateNotice } from "@/lib/tax-engine/land-only-appurtenant-card-notice";
import { LAND_ONLY_OTHER_HOUSEHOLD_RATE_NOTICE } from "@/lib/tax-engine/land-only-owner-household";
import { toHouseVerdict } from "@/lib/tax-engine/transfer-tax-one-house-unit";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer-result.types";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("AN-1 toHouseVerdict — houseLandOnlyOtherHousehold", () => {
  const result = { isExempt: false, isPartialExempt: true } as TransferTaxResult;
  const house = (own: Record<string, unknown>) => ({ propertyType: "housing", acquisitionDate: d(2014, 1, 1), ...own }) as unknown as TransferTaxItemInput;

  it("토지만 본인 · 다른 세대만 true", () => {
    expect(toHouseVerdict(house({ selfOwns: "land_only", buildingOwnerSameHousehold: false }), result).houseLandOnlyOtherHousehold).toBe(true);
  });
  it("같은 세대 · 소유자 같음 · 건물만 본인 · 세대 미응답은 false", () => {
    for (const own of [
      { selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false },
      { selfOwns: "both" },
      { selfOwns: "building_only", buildingOwnerSameHousehold: false },
      { selfOwns: "land_only" },
      {},
    ]) expect(toHouseVerdict(house(own), result).houseLandOnlyOtherHousehold, JSON.stringify(own)).toBe(false);
  });
});

describe("AN-2 landOnlyOtherHouseholdAppurtenantCardRateNotice — 카드 자기 취득일 기준 2년 미만일 때만", () => {
  const card = (acq: Date, transfer: Date, over: Partial<TransferTaxInput> = {}) =>
    ({
      oneHouseUnitRole: "appurtenant_land",
      acquisitionDate: acq,
      transferDate: transfer,
      appurtenantHouseVerdict: { isExempt: false, isPartialExempt: true, houseAcquisitionDate: d(2014, 1, 1), carryoverOneHouseExcluded: false, houseLandOnlyOtherHousehold: true },
      ...over,
    }) as unknown as TransferTaxInput;

  it("2년 미만이면 주 카드와 같은 문안", () => {
    expect(landOnlyOtherHouseholdAppurtenantCardRateNotice(card(d(2025, 6, 1), d(2026, 2, 16)))).toBe(LAND_ONLY_OTHER_HOUSEHOLD_RATE_NOTICE);
  });
  it("초일산입 경계 — 2024-02-17 → 2026-02-16은 정확히 2년이라 고지 없음 / 2024-02-18은 1년 364일이라 고지", () => {
    expect(landOnlyOtherHouseholdAppurtenantCardRateNotice(card(d(2024, 2, 17), d(2026, 2, 16)))).toBeUndefined();
    expect(landOnlyOtherHouseholdAppurtenantCardRateNotice(card(d(2024, 2, 18), d(2026, 2, 16)))).toBe(LAND_ONLY_OTHER_HOUSEHOLD_RATE_NOTICE);
  });
  it("다른 세대가 아니거나 verdict 없음 · 부수토지 카드 아님은 고지 없음", () => {
    const v = { isExempt: false, isPartialExempt: true, houseAcquisitionDate: d(2014, 1, 1), carryoverOneHouseExcluded: false };
    expect(landOnlyOtherHouseholdAppurtenantCardRateNotice(card(d(2025, 6, 1), d(2026, 2, 16), { appurtenantHouseVerdict: { ...v, houseLandOnlyOtherHousehold: false } }))).toBeUndefined();
    expect(landOnlyOtherHouseholdAppurtenantCardRateNotice(card(d(2025, 6, 1), d(2026, 2, 16), { appurtenantHouseVerdict: undefined }))).toBeUndefined();
    expect(landOnlyOtherHouseholdAppurtenantCardRateNotice(card(d(2025, 6, 1), d(2026, 2, 16), { oneHouseUnitRole: "house" }))).toBeUndefined();
  });
});
