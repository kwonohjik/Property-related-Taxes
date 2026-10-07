/**
 * anchor — §156의2⑤ 대체주택 특례의 **대체주택 취득 당시 세대 구성** (M5) · §89② 예외와 같은 술어 (M6).
 *
 * route 결론은 평가셋 G119(다른 주택) · G124(1+1 재건축 입주권 2개) · G148(§99의4 농어촌주택) · N-G125(거주
 * 6개월 — 선언만으로 §89② 예외가 나던 결함)가 고정한다. 이 파일은 세는 규칙을 고정한다.
 *
 * | # | 주장 |
 * |---|---|
 * | C-1 | 대체주택 취득일 전에 취득한 명부 주택 + 조합원입주권을 센다 — 양도 주택·그 뒤 취득분·분양권은 세지 않는다 |
 * | C-2 | 상속주택은 세지 않는다(§156의2⑦) |
 * | C-3 | 2개 이상이면 요건 불충족 · 1개(사업 대상)·0개(명부 없음)는 다른 요건으로 판정 |
 * | C-4 | §89② 예외는 요건을 갖췄을 때만 — 선언만으로는 예외가 아니다 |
 */
import { describe, it, expect } from "vitest";
import { meetsReplacementHouse, replacementHouseHeldUnits } from "@/lib/tax-engine/one-house/replacement-house";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import type { HouseInfo, PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);

const house = (id: string, acq: string, isInherited = false) =>
  ({ id, acquisitionDate: D(acq), officialPrice: 0, region: "capital", isInherited, isLongTermRental: false }) as HouseInfo;
const right = (id: string, acq: string, type: PresaleRight["type"] = "redevelopment_right") =>
  ({ id, type, acquisitionDate: D(acq), region: "capital", managementDisposalApprovalDate: D("2015-02-04") }) as PresaleRight;

const REPL = {
  businessApprovalDate: D("2014-06-15"),
  completionDate: D("2019-07-23"),
  replacementResidenceMonths: 24,
  willResideNewHouse: true,
};

const input = (houses: HouseInfo[], presaleRights: PresaleRight[] = [], replacementResidenceMonths = 24) => ({
  propertyType: "housing" as const,
  isOneHousehold: true,
  acquisitionDate: D("2015-07-24"),
  transferDate: D("2018-10-29"),
  houses,
  presaleRights,
  sellingHouseId: "B",
  replacementHouse: { ...REPL, replacementResidenceMonths },
});

describe("C-1 · C-2 세는 대상", () => {
  it("양도 주택 · 대체주택 취득 뒤 취득분 · 분양권은 세지 않는다", () => {
    expect(
      replacementHouseHeldUnits(
        input([house("B", "2015-07-24"), house("A", "2010-03-15"), house("late", "2016-01-10")], [right("p", "2014-01-01", "presale_right")]),
      ),
    ).toBe(1);
  });
  it("조합원입주권은 센다 · 상속주택은 세지 않는다", () => {
    expect(replacementHouseHeldUnits(input([], [right("A1", "1995-05-15"), right("A2", "1995-05-15")]))).toBe(2);
    expect(replacementHouseHeldUnits(input([house("A", "2010-03-15"), house("inh", "2012-01-01", true)]))).toBe(1);
  });
});

describe("C-3 2개 이상이면 불충족", () => {
  it("다른 주택 · 두 번째 입주권 → 불충족 / 사업 대상 1개 · 명부 없음 → 성립", () => {
    expect(meetsReplacementHouse(input([house("A", "2010-03-15"), house("C", "2012-05-15")]))).toBe(false);
    expect(meetsReplacementHouse(input([], [right("A1", "1995-05-15"), right("A2", "1995-05-15")]))).toBe(false);
    expect(meetsReplacementHouse(input([], [right("A1", "1995-05-15")]))).toBe(true);
    expect(meetsReplacementHouse(input([house("A", "2010-03-15"), house("inh", "2012-01-01", true)]))).toBe(true);
    expect(meetsReplacementHouse(input([]))).toBe(true);
  });
});

describe("C-4 §89② 예외", () => {
  it("요건을 갖추면 exception_met · 거주 1년 미만이면 예외 아님", () => {
    const met = resolveArticle89Clause2(input([], [right("A1", "1995-05-15")]) as never, undefined);
    expect(met.status).toBe("exception_met");
    const unmet = resolveArticle89Clause2(input([], [right("A1", "1995-05-15")], 6) as never, undefined);
    expect(unmet.status).not.toBe("exception_met");
  });
});
