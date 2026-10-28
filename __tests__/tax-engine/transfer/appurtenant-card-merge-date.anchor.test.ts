/**
 * 부수토지 카드의 세대합가일 반영 leaf — 계획서 `docs/02-design/features/bundled-merge-date-appurtenant-card.plan.md` (AN-1 · AN-2).
 */
import { describe, expect, it } from "vitest";
import { appurtenantCardHouseHoldingMonths } from "@/lib/tax-engine/land-only-owner-household";
import { appurtenantCardCoveredByExpropriationProviso, appurtenantCardHeldTooShort } from "@/lib/tax-engine/transfer-tax-appurtenant-land";
import { toHouseVerdict } from "@/lib/tax-engine/transfer-tax-one-house-unit";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer-result.types";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const verdict = (houseMergeDate?: Date, houseAcquisitionDate = d(2014, 1, 1)) =>
  ({ isExempt: false, isPartialExempt: true, houseAcquisitionDate, carryoverOneHouseExcluded: false, houseMergeDate });

describe("AN-1 toHouseVerdict — houseMergeDate", () => {
  const result = { isExempt: false, isPartialExempt: true } as TransferTaxResult;
  const house = (own: Record<string, unknown>) => ({ propertyType: "housing", acquisitionDate: d(2014, 1, 1), ...own }) as unknown as TransferTaxItemInput;
  const merge = d(2020, 1, 1);

  it("토지만 본인 · 같은 세대 · 합가함(날짜 있음)이면 그 날", () => {
    expect(toHouseVerdict(house({ selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: merge }), result).houseMergeDate).toEqual(merge);
  });
  it("처음부터 같은 세대 · 합가일 미입력 · 다른 세대 · 소유자 같음 · 건물만 본인은 undefined", () => {
    for (const own of [
      { selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false },
      { selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: true },
      { selfOwns: "land_only", buildingOwnerSameHousehold: false, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: merge },
      { selfOwns: "both", buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: merge },
      { selfOwns: "building_only", buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: merge },
    ]) expect(toHouseVerdict(house(own), result).houseMergeDate, JSON.stringify(own)).toBeUndefined();
  });
});

describe("AN-2 appurtenantCardHeldTooShort — 합가일이 부수토지 보유 시작을 늦춘다", () => {
  const card = (acq: Date, v: ReturnType<typeof verdict> | undefined, transfer: Date) =>
    ({ acquisitionDate: acq, transferDate: transfer, appurtenantHouseVerdict: v });
  const landSameDay = d(2014, 1, 1);

  it("합가일 없음: 토지가 주택보다 먼저·같은 날이면 걸리지 않는다(종전)", () => {
    expect(appurtenantCardHeldTooShort(card(landSameDay, verdict(), d(2026, 2, 16)))).toBe(false);
    expect(appurtenantCardHeldTooShort(card(d(2013, 1, 1), verdict(), d(2026, 2, 16)))).toBe(false);
  });
  it("합가일이 짝 주택 취득일보다 이르거나 같으면 값이 달라지지 않는다", () => {
    expect(appurtenantCardHeldTooShort(card(landSameDay, verdict(d(2012, 1, 1)), d(2026, 2, 16)))).toBe(false);
    expect(appurtenantCardHeldTooShort(card(landSameDay, verdict(d(2014, 1, 1)), d(2026, 2, 16)))).toBe(false);
  });
  it("합가 후 보유가 2년 미만이면 true · 2년 이상이면 false(양도일 2026-02-16)", () => {
    expect(appurtenantCardHeldTooShort(card(landSameDay, verdict(d(2025, 1, 1)), d(2026, 2, 16)))).toBe(true);
    // 보유기간은 취득일 초일산입 — 2024-02-17 → 2026-02-16이 정확히 2년이다(경계 이틀 뒤부터 2년 미만)
    expect(appurtenantCardHeldTooShort(card(landSameDay, verdict(d(2024, 2, 17)), d(2026, 2, 16)))).toBe(false);
    expect(appurtenantCardHeldTooShort(card(landSameDay, verdict(d(2024, 2, 18)), d(2026, 2, 16)))).toBe(true);
  });
  it("양도일 2012-06-29 전은 3년 요건(주택 본체와 같은 연혁 leaf)이 합가일에도 적용된다", () => {
    const house = d(2005, 1, 1);
    expect(appurtenantCardHeldTooShort(card(house, verdict(d(2010, 1, 1), house), d(2012, 6, 1)))).toBe(true); // 합가 후 2년 5개월 < 3년
    expect(appurtenantCardHeldTooShort(card(house, verdict(d(2008, 1, 1), house), d(2012, 6, 1)))).toBe(false); // 4년 5개월
    expect(appurtenantCardHeldTooShort(card(house, verdict(d(2010, 1, 1), house), d(2012, 7, 1)))).toBe(false); // 2012-06-29 이후 양도는 2년 요건(2년 6개월)
  });
  it("verdict가 없는 직접 호출은 걸리지 않는다", () => {
    expect(appurtenantCardHeldTooShort(card(d(2025, 6, 1), undefined, d(2026, 2, 16)))).toBe(false);
  });
});

describe("AN-2 appurtenantCardHouseHoldingMonths — 표2 보유연수·세율 기산이 쓰는 개월", () => {
  const T = d(2026, 2, 16);
  it("합가일이 주택 취득일보다 늦으면 합가일부터의 개월(2020-01-01 → 6년 1개월 = 73개월)", () => {
    expect(appurtenantCardHouseHoldingMonths(verdict(d(2020, 1, 1)), T, 999)).toBe(73);
    expect(appurtenantCardHouseHoldingMonths(verdict(d(2025, 1, 1)), T, 999)).toBe(13);
  });
  it("합가 없음 · 합가일이 주택 취득일 이전·같은 날 · verdict 없음은 기본 개월 그대로", () => {
    expect(appurtenantCardHouseHoldingMonths(verdict(), T, 145)).toBe(145);
    expect(appurtenantCardHouseHoldingMonths(verdict(d(2012, 1, 1)), T, 145)).toBe(145);
    expect(appurtenantCardHouseHoldingMonths(verdict(d(2014, 1, 1)), T, 145)).toBe(145);
    expect(appurtenantCardHouseHoldingMonths(undefined, T, 145)).toBe(145);
  });
});

describe("AN-2 수용 단서 판정도 같은 헬퍼 — 합가 후 2년 미만이어야 보유요건 면제 대상이 된다", () => {
  const T = d(2026, 2, 16);
  const card = (v: ReturnType<typeof verdict> & { expropriationLandCutoff?: Date | null }) =>
    ({ oneHouseUnitRole: "appurtenant_land" as const, acquisitionDate: d(2014, 1, 1), transferDate: T, appurtenantHouseVerdict: v });
  const cutoff = d(2020, 1, 1); // 사업인정 고시일 — 이보다 먼저 취득한 토지만 단서가 덮는다

  it("합가 2025(보유요건 미달) + 단서 · 토지 2014 취득 → 덮는다 / 합가 없음(보유요건 충족) → 덮을 이유 없음", () => {
    expect(appurtenantCardCoveredByExpropriationProviso(card({ ...verdict(d(2025, 1, 1)), expropriationLandCutoff: cutoff }))).toBe(true);
    expect(appurtenantCardCoveredByExpropriationProviso(card({ ...verdict(), expropriationLandCutoff: cutoff }))).toBe(false);
    expect(appurtenantCardCoveredByExpropriationProviso(card({ ...verdict(d(2025, 1, 1)), expropriationLandCutoff: undefined }))).toBe(false);
  });
});
