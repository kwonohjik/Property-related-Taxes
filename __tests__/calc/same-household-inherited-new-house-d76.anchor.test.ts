/**
 * D-76 anchor (Q-27 안 A) — 동일세대에서 상속받은 명부 주택은 §155① 「신규 주택 취득」이 아니다.
 *
 * 사전-2023-법규재산-0464(법규과-2159, 2023.8.23.) 요지: 「2주택 보유세대의 1주택이 동일세대 내에서 상속이 이루어진 경우, 새로운 주택의
 * 취득에 해당하지 않으므로 상속개시일을 신규주택 취득일로 보아 일시적 2주택 특례를 적용할 수 없는 것임」(사실관계는 조합원입주권 상태 상속).
 * 종전에는 명부 도출이 상속 행의 상속개시일을 신규 주택 취득일로 써서, 상속개시일부터 3년 안 양도가 확인 필요 없이 비과세였다.
 *
 * | # | 주장 |
 * |---|---|
 * | A | 동일세대 상속 행 · 3년 안 양도 → §155① 불성립(0464 인용) · 과세 |
 * | B | 피상속인 세대 「모름」 → 불성립 + 확인 필요 |
 * | C | 별도세대 상속 → §155②로 주택 수에서 빠져 비과세(불변) |
 * | D | 동일세대 · 동거봉양 합가 전 보유 예외 → §155② 비과세(불변) |
 * | E | 동일세대 · 3년 경과 → 과세(불변) |
 */
import { describe, it, expect } from "vitest";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";

type Row = Record<string, unknown>;
function menu(m: Row, transferDate = "2017-06-01"): RulingCase {
  return {
    id: "d76", docNo: "-", docDate: "-", basis: "current", today: "2017-06-02", summary: "d76", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate,
      contractTotalPrice: "500000000",
      asset: { assetKind: "housing", acquisitionDate: "2012-11-21" },
      houses: [
        {
          id: "m", region: "non_capital", acquisitionDate: "2015-03-01", acquisitionOrigin: "general",
          isInherited: true, inheritedDate: "2015-03-01", isCoInherited: false, ...m,
        },
      ],
    } as unknown as RulingCase["form"],
  };
}
const SAME = { decedentSameHouseholdAtInheritance: true, decedentHouseholdSeparate: false };
const SEPARATE = { decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true };
const reasons = (o: Awaited<ReturnType<typeof observeCase>>) => Object.values(o.unmetReasons).flat().join("\n");

describe("D-76 동일세대 상속 명부 행은 §155① 신규 주택이 아니다(사전-2023-법규재산-0464)", () => {
  it("A 동일세대 상속 · 상속개시일부터 3년 안 양도 → 과세 · 0464 사유", async () => {
    const o = await observeCase(menu(SAME));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.appliedExceptions).not.toContain("155-1-temporary-two-house");
    expect(reasons(o)).toContain("사전-2023-법규재산-0464");
  });

  it("B 피상속인 세대 「모름」 → 과세 + 확인 필요", async () => {
    const o = await observeCase(menu({ decedentSameHouseholdAtInheritance: undefined, decedentHouseholdSeparate: undefined, decedentHouseholdUnknown: true }));
    expect(o.isExempt).toBe(false);
    expect(reasons(o)).toContain("확인 필요");
  });

  it("C 별도세대 상속 → 비과세(§155② — 불변)", async () => {
    const o = await observeCase(menu(SEPARATE));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
  });

  it("D 동일세대 · 동거봉양 합가 전 보유 예외 → 비과세(불변)", async () => {
    const o = await observeCase(menu({ ...SAME, parentalCareMergeInheritedHouse: true }));
    expect(o.isExempt).toBe(true);
  });

  it("E 동일세대 · 상속개시일부터 3년 경과(2018-06-01) → 과세(불변)", async () => {
    const o = await observeCase(menu(SAME, "2018-06-01"));
    expect(o.isExempt).toBe(false);
  });
});
