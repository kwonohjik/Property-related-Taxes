/**
 * X2-3 anchor — §155 특례 불성립 사유의 「§154① 보유·거주」 문구는 양도일 시행본 요건을 따른다.
 *
 * 「소득세법 시행령」 §154①: 2010.5.5.본(MST 104937)·2011.7.1.본(MST 109663)은 「보유기간이 3년 이상」(서울·과천·5개 신도시는
 * 거주 2년), 2012.7.26.본(MST 127281)부터 2년. 같은 화면의 요건 검토표는 이미 연혁이었는데 사유 문구만 「보유 2년(취득 당시
 * 조정대상지역이면 거주 2년)」으로 고정돼 모순됐다.
 */
import { describe, it, expect } from "vitest";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { baseRequirementPhrase } from "@/lib/tax-engine/one-house/base-requirement-phrase";

const marriage = (td: string, acq: string, assetExtra: Record<string, unknown> = {}) =>
  mkCase(td, {
    isOneHousehold: true, transferDate: td, contractTotalPrice: "800000000",
    marriageDate: "2010-01-01", isFirstTransferredInMerge: true,
    asset: { assetKind: "housing", acquisitionDate: acq, ...assetExtra },
    houses: [{ id: "c", region: "capital", acquisitionDate: "2005-02-05", mergeOrigin: "counterpart_side" }],
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reasonsOf = (o: any) => ((o.j?.unmetExceptions ?? []).find((u: any) => u.id === "155-5-marriage-merge")?.reasons ?? []).join("|");

describe("X2-3 판정 메뉴 route", () => {
  it("2011-08-01 양도 · 보유 2년 6개월 → 사유가 보유 3년을 말하고 검토표와 같다", async () => {
    const o = await observeRaw(marriage("2011-08-01", "2009-02-02"));
    expect(o.j.isExempt).toBe(false);
    const rs = reasonsOf(o);
    expect(rs).toContain("§154① 보유 3년");
    expect(rs).not.toContain("보유 2년");
    // 2011.6.3. 이후 양도분은 서울 등 거주요건도 없다 — 거주 구절 자체가 없다.
    expect(rs).not.toContain("거주");
  });
  it("2010-08-01 서울 양도 → 사유가 서울·과천·5개 신도시 거주 2년을 말한다 (취득 당시 조정대상지역 기준이 아님)", async () => {
    const o = await observeRaw(marriage("2010-08-01", "2006-01-01", { regionCode: "1168010100" }));
    expect(o.j.isExempt).toBe(false);
    const rs = reasonsOf(o);
    expect(rs).toContain("보유 3년(서울·과천·5개 신도시 주택이면 보유기간 중 거주 2년)");
    expect(rs).not.toContain("취득 당시 조정대상지역");
  });
  it("긍정 짝: 현행 양도(2025-03-01) → 종전 문구 그대로", async () => {
    const o = await observeRaw(
      mkCase("2025-03-02", {
        isOneHousehold: true, transferDate: "2025-03-01", contractTotalPrice: "800000000",
        marriageDate: "2024-01-01", isFirstTransferredInMerge: true,
        asset: { assetKind: "housing", acquisitionDate: "2023-08-01" },
        houses: [{ id: "c", region: "capital", acquisitionDate: "2005-02-05", mergeOrigin: "counterpart_side" }],
      }),
    );
    expect(o.j.isExempt).toBe(false);
    expect(reasonsOf(o)).toContain("§154① 보유 2년(취득 당시 조정대상지역이면 거주 2년) 요건을 충족하지 않습니다.");
  });
});

describe("X2-3 구절 leaf — 양도일 구간", () => {
  const rule = { minHoldingYears: 2, regulatedAreaMinResidenceYears: 2, prePolicyDate: "2017-08-03" };
  it.each([
    ["2005-01-01", "§154① 보유 3년(서울·과천·5개 신도시 주택이면 보유기간 중 거주 2년)"],
    ["2011-06-02", "§154① 보유 3년(서울·과천·5개 신도시 주택이면 보유기간 중 거주 2년)"],
    ["2011-06-03", "§154① 보유 3년"],
    ["2012-06-28", "§154① 보유 3년"],
    ["2012-06-29", "§154① 보유 2년"],
    ["2017-08-02", "§154① 보유 2년"],
    ["2017-08-03", "§154① 보유 2년(취득 당시 조정대상지역이면 거주 2년)"],
    ["2026-10-11", "§154① 보유 2년(취득 당시 조정대상지역이면 거주 2년)"],
  ])("%s → %s", (td, expected) => {
    // 구절 전체 일치 — 「보유 2년」이 「보유 2년(…)」에 부분 포함되는 함정을 피한다.
    expect(baseRequirementPhrase(new Date(td), rule)).toBe(expected);
  });
});
