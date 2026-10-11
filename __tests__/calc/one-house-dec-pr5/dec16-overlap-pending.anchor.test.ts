/**
 * #16 (G8-3) 판정 메뉴 — 상속주택 제외(§155②) 뒤 §155⑥·⑦·⑧ 특례로 비과세가 서면 「2중첩 해석 미확보 — 확인 필요」를 판정 보류로 단다.
 * 결론(비과세)은 바뀌지 않는다. 대조: 상속 제외가 없는 ⑥·⑧ 단독, 비과세가 서지 않은 세대는 고지하지 않는다.
 */
import { describe, it, expect } from "vitest";
import { observeCase, type RulingCase } from "../one-house-rulings/harness";
import { INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID } from "@/lib/tax-engine/one-house/overlap-notice";

const base = { region: "non_capital" as const };
const INH = { ...base, id: "C", acquisitionDate: "2000-01-01", isInherited: true, inheritedDate: "2021-06-01", isCoInherited: false, decedentSameHouseholdAtInheritance: false };
const HERITAGE = { ...base, id: "H", acquisitionDate: "1998-01-01", oneHouseCulturalHeritage: true };
const RURAL = { ...base, id: "R", acquisitionDate: "1998-01-01", oneHouseRuralHouse: true, ruralHouseKind: "farm_exit", ruralOwnerResidenceYears: 6, ruralOutsideCapitalEupMyeon: true, ruralReturnedToFarmExitHouse: false };
// 해소일을 명시한다(양도 2023-02-28 기준 3년 이내) — 해소일 공란을 «유리»로 읽는 S02-8 처리에 이 시료가 기대지 않게 한다(#31이 공란을 불성립·입력 차단으로 바꾼다).
const UNAVOIDABLE = { ...base, id: "U", acquisitionDate: "1998-01-01", oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalResolvedDate: "2022-06-01" };

const mk = (houses: Record<string, unknown>[]): RulingCase =>
  ({
    id: "dec16", docNo: "", docDate: "", basis: "current", today: "2023-03-10", summary: "", bucket: "match",
    form: {
      isOneHousehold: true, transferDate: "2023-02-28", contractTotalPrice: "800000000",
      asset: { assetKind: "housing", acquisitionDate: "2001-09-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" },
      houses,
    },
  }) as unknown as RulingCase;

describe("#16 판정 메뉴 — ② 상속 제외 + ⑥·⑦·⑧ 2중첩 고지", () => {
  it.each([
    ["⑥ 국가유산주택", HERITAGE],
    ["⑦ 이농주택", RURAL],
    ["⑧ 부득이한 사유 주택", UNAVOIDABLE],
  ])("%s + 상속 → 비과세 유지 + 2중첩 확인 필요 고지", async (_l, row) => {
    const o = await observeCase(mk([row, INH]));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.undetermined).toContain(INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID);
  });

  it.each([
    ["⑥ 단독", HERITAGE],
    ["⑦ 단독", RURAL],
    ["⑧ 단독", UNAVOIDABLE],
  ])("대조 — %s(상속 제외 없음)은 고지하지 않는다", async (_l, row) => {
    const o = await observeCase(mk([row]));
    expect(o.isExempt).toBe(true);
    expect(o.undetermined).not.toContain(INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID);
  });

  it("대조 — 상속 제외만(⑥·⑦·⑧ 없음)인 비과세는 고지하지 않는다", async () => {
    const o = await observeCase(mk([INH]));
    expect(o.isExempt).toBe(true);
    expect(o.undetermined).not.toContain(INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID);
  });
});
