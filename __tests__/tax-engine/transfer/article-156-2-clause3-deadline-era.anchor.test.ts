/**
 * anchor — §156의2③ 「조합원입주권을 취득한 날부터 N년 이내」 · ④ 「N년이 지나」 · 완성 후 기한의 양도일 연혁 (M7).
 * route 결론은 평가셋 G016-era(2006 양도 — 권리 취득 후 1년 경과로 ③ 불성립)가 고정한다.
 *
 * | # | 주장 |
 * |---|---|
 * | Y-1 | N — 2008-11-27 양도 1년 · 2008-11-28 양도 2년 · 2012-06-29 양도 3년 |
 * | Y-2 | ③ 「종전주택 취득 후 1년 이상 지난 후 권리 취득」은 2012-06-29 이후 양도분만 |
 * | Y-3 | 완성 후 기한 — 1년 · 2년 · 3년(2023-01-12) |
 * | Y-4 | §89② 판정 — 2007 양도: 권리 취득 후 1년 이내 성립 · 넘으면 불성립 / 2010 양도: 종전주택 취득 직후 권리 취득도 2년 이내면 성립 |
 */
import { describe, it, expect } from "vitest";
import {
  clause3RequiresOneYearGap,
  resolve1562Clause3Years,
  resolve1562DeadlineYears,
} from "@/lib/tax-engine/data/article-156-2-completion-era";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);

describe("Y-1 · Y-2 · Y-3 연혁", () => {
  it("③④ N년", () => {
    expect(resolve1562Clause3Years(D("2008-11-27"))).toBe(1);
    expect(resolve1562Clause3Years(D("2008-11-28"))).toBe(2);
    expect(resolve1562Clause3Years(D("2012-06-28"))).toBe(2);
    expect(resolve1562Clause3Years(D("2012-06-29"))).toBe(3);
  });
  it("③ 1년 요건", () => {
    expect(clause3RequiresOneYearGap(D("2012-06-28"))).toBe(false);
    expect(clause3RequiresOneYearGap(D("2012-06-29"))).toBe(true);
  });
  it("완성 후 기한", () => {
    expect(resolve1562DeadlineYears(D("2008-11-27"))).toBe(1);
    expect(resolve1562DeadlineYears(D("2008-11-28"))).toBe(2);
    expect(resolve1562DeadlineYears(D("2023-01-11"))).toBe(2);
    expect(resolve1562DeadlineYears(D("2023-01-12"))).toBe(3);
  });
});

describe("Y-4 §89② ③ 판정", () => {
  const right = (acq: string) =>
    ({ id: "R", type: "redevelopment_right", acquisitionDate: D(acq), region: "capital", managementDisposalApprovalDate: D("2006-06-29") }) as PresaleRight;
  const judge = (houseAcq: string, rightAcq: string, transfer: string) =>
    resolveArticle89Clause2(
      {
        propertyType: "housing",
        isOneHousehold: true,
        acquisitionDate: D(houseAcq),
        transferDate: D(transfer),
        householdHousingCount: 1,
        presaleRights: [right(rightAcq)],
        rightThreeYearException: { kind: "none" },
      } as never,
      undefined,
    ).status;
  it("2007 양도 — 권리 취득 후 1년 이내 성립 · 넘으면 불성립", () => {
    expect(judge("2001-08-21", "2006-07-10", "2007-07-10")).toBe("exception_met");
    expect(judge("2001-08-21", "2006-07-10", "2007-07-11")).not.toBe("exception_met");
  });
  it("2010 양도 — 1년 요건 없음 · 2년 이내 성립", () => {
    expect(judge("2009-03-01", "2009-03-10", "2011-03-10")).toBe("exception_met");
    expect(judge("2009-03-01", "2009-03-10", "2011-03-11")).not.toBe("exception_met");
  });
  it("2013 양도 — 종전주택 취득 1년 안에 권리를 취득했으면 불성립", () => {
    expect(judge("2012-03-01", "2012-03-10", "2013-03-10")).not.toBe("exception_met");
    expect(judge("2011-03-01", "2012-03-10", "2013-03-10")).toBe("exception_met");
  });
});
