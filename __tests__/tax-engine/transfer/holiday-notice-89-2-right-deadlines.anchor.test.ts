/**
 * anchor — #32(S07-9) 공휴일 표 한계 고지에 §89② 권리의 **충족 갈래** 기한 말일이 빠지지 않는다
 *
 * 독립 검증 지적: 고지 후보가 `article89Clause2.deadline`(배제 갈래에서만 채워짐) 한 값뿐이라
 *  (a) §156의2③·§156의3② 권리 취득일부터 3년 안에 양도해 예외가 **충족**된 갈래와
 *  (b) §156의2④·§156의3③ 신축주택 완성 후 N년 갈래
 * 에서 말일이 양도일 곁에 있어도 고지가 사라졌다(종전 게이트는 권리가 있으면 항상 냈다 → 회귀).
 * 말일이 양도일 곁에 있으면 공휴일 한 날이 결론을 가르므로 고지한다. 곁에 없으면 내지 않는다(긍정/부정 짝).
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { declaredDeadlineEnds } from "@/lib/tax-engine/one-house/holiday-notice-deadlines";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ID = "civil-161-holiday-table-uncovered";

const input = (rightAcquisition: string, transfer: string, over: Partial<TransferTaxInput> = {}): OneHouseJudgeInput =>
  baseTransferInput({
    householdHousingCount: 1,
    acquisitionDate: D("2015-06-01"),
    transferDate: D(transfer),
    residencePeriodMonths: 60,
    presaleRights: [
      {
        id: "r1",
        type: "redevelopment_right",
        acquisitionDate: D(rightAcquisition),
        region: "capital",
        memberOrigin: "successor",
        managementDisposalApprovalDate: D("2019-01-01"),
      } as never,
    ],
    ...over,
  }) as OneHouseJudgeInput;
const judge = (i: OneHouseJudgeInput) => checkExemption(i, rules, D("2021-01-01"));
const has = (i: OneHouseJudgeInput) => judge(i).undetermined.some((u) => u.id === ID);
const ends = (i: OneHouseJudgeInput) =>
  declaredDeadlineEnds(i, rules, resolveArticle89Clause2(i, D("2021-01-01"))).map((e) => iso(e.end));

describe("(a) §156의2③ 권리 취득 후 3년 안 양도(충족 갈래) — 3년 말일이 양도일 곁이면 고지", () => {
  it("A1 ★ 권리 2025-06-05 · 양도 2028-06-02(말일 2028-06-05 사흘 앞) → 충족 + 말일이 후보 + 고지", () => {
    const i = input("2025-06-05", "2028-06-02");
    expect(judge(i).isExempt).toBe(true);
    expect(resolveArticle89Clause2(i, D("2021-01-01")).status).toBe("exception_met");
    expect(ends(i)).toEqual(["2028-06-05"]);
    expect(has(i)).toBe(true);
  });

  it("A2 부정 짝 — 같은 권리로 양도가 석 달 앞(2028-03-01)이면 말일이 곁에 없다 → 고지 없음, 결론 동일", () => {
    const i = input("2025-06-05", "2028-03-01");
    expect(judge(i).isExempt).toBe(true);
    expect(has(i)).toBe(false);
  });
});

describe("(b) §156의2④ 신축주택 완성 후 N년 갈래 — 완성 후 N년 말일이 양도일 곁이면 고지", () => {
  const newHouse = (moved: boolean, resided: boolean): Partial<TransferTaxInput> => ({
    rightThreeYearException: {
      kind: "new_house",
      completionDate: D("2025-06-05"),
      movedInWithin3Years: moved,
      residedOneYearOrMore: resided,
    },
  });

  it("B1 ★ 권리 2020-06-01 · 완성 2025-06-05 · 양도 2028-06-03(완성 후 3년 말일 2028-06-05 이틀 앞) → 충족 + 고지", () => {
    const i = input("2020-06-01", "2028-06-03", newHouse(true, true));
    expect(resolveArticle89Clause2(i, D("2021-01-01")).status).toBe("exception_met");
    expect(judge(i).isExempt).toBe(true);
    expect(ends(i)).toEqual(["2028-06-05"]);
    expect(has(i)).toBe(true);
  });

  it("B2 부정 짝 — 양도가 완성 후 3년 말일보다 석 달 앞(2028-03-01)이면 곁에 없다 → 고지 없음", () => {
    const i = input("2020-06-01", "2028-03-01", newHouse(true, true));
    expect(judge(i).isExempt).toBe(true);
    expect(has(i)).toBe(false);
  });

  it("B3 완성 후 3년을 막 넘겨 불충족(양도 2028-06-08) → 공휴일이 더 있었다면 갈리므로 고지", () => {
    const i = input("2020-06-01", "2028-06-08", newHouse(true, true));
    expect(resolveArticle89Clause2(i, D("2021-01-01")).status).toBe("excluded");
    expect(has(i)).toBe(true);
  });

  it("B4 부정 짝 — 이사·거주 선언을 못 채우면 완성 후 N년 말일(2028-06-05)은 결론을 바꾸지 못한다 → 후보 아님·고지 없음", () => {
    const i = input("2020-06-01", "2028-06-03", newHouse(false, true));
    expect(ends(i)).toEqual(["2023-06-01"]); // 권리 취득 3년 말일만(양도일보다 한참 앞)
    expect(has(i)).toBe(false);
  });
});
