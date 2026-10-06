/**
 * @vitest-environment jsdom
 *
 * D17 — 별도세대에서 받은 상속주택을 동일세대원이 **재상속**하면 상속주택 지위를 이어받는다
 * (서일46014-10689 · 서면5팀-1763 · 재산세과-2961 · 부동산납세과-624 · 서면-2022-법규재산-4747).
 * route 결론은 해석례 평가셋 `E112-era`(비과세 · 판정 보류)·`N-E112-not-reinherited`(과세)가 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | G-1 | 엔진 게이트 | 동일세대 + 재상속이면 통과 · 재상속 표시 없으면 불통과 · 별도세대·동거봉양 예외는 종전 그대로 |
 * | U-1 | 판정 보류 | 재상속으로 단서를 통과한 행이 있을 때만 기준일 미확인을 고지(동거봉양 예외로 통과하면 고지 없음) |
 * | P-1 | ④ | 동일세대일 때만 실린다(동거봉양 예외와 같은 규약) |
 * | R-1 | ⑭ | route 명부 매핑이 엔진 `HouseInfo`로 넘긴다 |
 * | W-1 | ⑤ | 동일세대 ON일 때만 칩이 보이고, 켜면 같은 칸으로 올라간다 · 동일세대·상속 OFF면 지운다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { passesHouseholdGate } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { collectEraUndetermined } from "@/lib/tax-engine/one-house/era-undetermined";
import { buildOtherHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { mapHousesToEngine } from "@/lib/api/transfer-route-multi-house";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const row = (over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "A",
  region: "capital",
  acquisitionDate: "1982-06-15",
  officialPrice: "300000000",
  isInherited: true,
  inheritedDate: "2008-05-15",
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  decedentSameHouseholdAtInheritance: true,
  ...over,
});

describe("G-1 엔진 게이트", () => {
  it("동일세대 + 재상속 → 통과 · 표시 없음 → 불통과 · 별도세대·동거봉양 예외 → 통과(종전)", () => {
    expect(passesHouseholdGate({ decedentSameHouseholdAtInheritance: true, reInheritedFromSeparateHousehold: true })).toBe(true);
    expect(passesHouseholdGate({ decedentSameHouseholdAtInheritance: true })).toBe(false);
    expect(passesHouseholdGate({ decedentSameHouseholdAtInheritance: false })).toBe(true);
    expect(passesHouseholdGate({ decedentSameHouseholdAtInheritance: true, parentalCareMergeInheritedHouse: true })).toBe(true);
  });
});

describe("U-1 판정 보류 — 재상속 기준일", () => {
  const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules as OneHouseSpecialRulesData;
  const ids = (h: Record<string, unknown>) =>
    collectEraUndetermined(
      {
        propertyType: "housing",
        isOneHousehold: true,
        transferDate: new Date("2008-12-15"),
        houses: [{ id: "A", isInherited: true, ...h }],
      } as unknown as OneHouseJudgeInput,
      rules,
      true,
    ).map((u) => u.id);
  const ID = "155-2-reinheritance-reference-date-unverified";
  it("재상속으로 통과한 행이 있을 때만 고지한다", () => {
    expect(ids({ decedentSameHouseholdAtInheritance: true, reInheritedFromSeparateHousehold: true })).toContain(ID);
    expect(ids({ decedentSameHouseholdAtInheritance: true })).not.toContain(ID);
    expect(
      ids({ decedentSameHouseholdAtInheritance: true, parentalCareMergeInheritedHouse: true, reInheritedFromSeparateHousehold: true }),
    ).not.toContain(ID);
  });
});

describe("P-1 ④ · R-1 ⑭", () => {
  it("④ 동일세대일 때만 싣는다", () => {
    const [on] = buildOtherHousesPayload([row({ reInheritedFromSeparateHousehold: true })]) as Record<string, unknown>[];
    expect(on.reInheritedFromSeparateHousehold).toBe(true);
    const [off] = buildOtherHousesPayload([
      row({ decedentSameHouseholdAtInheritance: false, reInheritedFromSeparateHousehold: true }),
    ]) as Record<string, unknown>[];
    expect(off.reInheritedFromSeparateHousehold).toBeUndefined();
  });
  it("⑭ route 매핑이 엔진으로 넘긴다", () => {
    const [h] = buildOtherHousesPayload([row({ reInheritedFromSeparateHousehold: true })]) as never[];
    expect(mapHousesToEngine([h])?.[0]).toMatchObject({ reInheritedFromSeparateHousehold: true });
  });
});

describe("W-1 ⑤ 편집 창", () => {
  const CHIP = "house-row-reinherited-from-separate-household";
  it("동일세대 ON일 때만 칩이 보이고, 켜면 같은 칸으로 올라간다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={row()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId(CHIP).querySelector("[role=switch], button, input")!);
    expect(onUpdate).toHaveBeenCalledWith({ reInheritedFromSeparateHousehold: true });
    cleanup();
    render(<HouseEntryEditor house={row({ decedentSameHouseholdAtInheritance: false })} onUpdate={vi.fn()} />);
    expect(screen.queryByTestId(CHIP)).toBeNull();
  });
  it("동일세대 OFF · 상속 OFF로 바꾸면 지운다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={row({ reInheritedFromSeparateHousehold: true })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("switch", { name: /상속개시 당시 피상속인과 동일세대/ }));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ reInheritedFromSeparateHousehold: undefined }));
    fireEvent.click(screen.getByRole("switch", { name: /피상속인으로부터 상속받은 주택/ }));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ isInherited: false, reInheritedFromSeparateHousehold: undefined }));
  });
});
