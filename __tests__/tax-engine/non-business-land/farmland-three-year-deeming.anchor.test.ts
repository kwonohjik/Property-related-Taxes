/**
 * 농지 상속 3년·이농 3년(「소득세법 시행령」 §168의8③2호·3호) — 엔진 단위 (2026-10-20)
 * 계획서: docs/00-pm/nbl-farmland-inherit-inong-3y.plan.md
 *
 * - 3년 구간은 재촌·자경 구간과 **합쳐** 기간기준을 잰다(따로 재면 둘 다 미달인 시료가 합치면 통과한다).
 * - 「이농당시 소유하고 있던 농지」 — 이농일이 취득일보다 앞서면 3호를 적용하지 않는다.
 */
import { describe, it, expect } from "vitest";

import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land";
import { judgeForest } from "@/lib/tax-engine/non-business-land/forest";
import { DEFAULT_NON_BUSINESS_LAND_RULES, type NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";

function raw(o: Record<string, unknown>) {
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest",
    acquisitionArea: "3000",
    transferDate: "2024-06-03",
    ...o,
  };
}
const judge = (o: Record<string, unknown>) => judgeNonBusinessLand(buildNblEngineInput(raw(o) as never)!);
const FARMED = (start: string, end: string) => ({
  nblFarmingSelf: true,
  nblFarmerResidenceDistance: "5",
  nblBusinessUsePeriods: [{ startDate: start, endDate: end, usageType: "farming" }],
});

describe("상속 3년 구간 ∪ 재촌·자경 구간", () => {
  // 상속 2018-06-03(보유 6년) → 3년 구간 2018-06-03~2021-06-03 · 재촌·자경 2022-12-03~2024-06-03(1.5년)
  it("상속 3년만 → 비사업용", () => {
    expect(judge({ acquisitionCause: "inheritance", acquisitionDate: "2018-06-03" }).isNonBusinessLand).toBe(true);
  });
  it("재촌·자경 1.5년만(매매) → 비사업용", () => {
    expect(judge({ acquisitionCause: "purchase", acquisitionDate: "2018-06-03", ...FARMED("2022-12-03", "2024-06-03") }).isNonBusinessLand).toBe(true);
  });
  it("둘을 합치면 직전 5년 중 비사업용 1.5년(2년 초과 아님) → 사업용", () => {
    const r = judge({ acquisitionCause: "inheritance", acquisitionDate: "2018-06-03", ...FARMED("2022-12-03", "2024-06-03") });
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.judgmentSteps.find((s) => s.id === "farmland_deeming")?.status).toBe("PASS");
  });
});

describe("이농 3년 — 이농 당시 소유", () => {
  const base = { acquisitionCause: "purchase", acquisitionDate: "2019-06-01", ...FARMED("2019-06-01", "2021-01-01"), nblExemptInong: true };
  it("이농일 ≥ 취득일 → 이농일부터 3년을 센다(사업용)", () => {
    const r = judge({ ...base, nblExemptInongDate: "2021-01-01" });
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.appliedLawArticles).toContain("소득세법 시행령 §168조의8 ③ 3호");
  });
  it("이농일 < 취득일 → 적용하지 않는다(비사업용)", () => {
    const r = judge({ ...base, nblExemptInongDate: "2019-05-31" });
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.appliedLawArticles).not.toContain("소득세법 시행령 §168조의8 ③ 3호");
  });
  it("이농일이 취득일 이틀 전이면 3년 구간이 보유기간 거의 전부여도 적용하지 않는다(취득 2021-06-03 · 이농 2021-06-01)", () => {
    const r = judge({ acquisitionCause: "purchase", acquisitionDate: "2021-06-03", nblExemptInong: true, nblExemptInongDate: "2021-06-01" });
    expect(r.isNonBusinessLand).toBe(true);
  });
  it("이농 3년이 판정을 바꾸지 않을 만큼 오래전이면 비사업용 그대로(이농 2015 · 취득 2010 · 양도 2024)", () => {
    const r = judge({ acquisitionCause: "purchase", acquisitionDate: "2010-01-01", ...FARMED("2010-01-01", "2015-01-01"), nblExemptInong: true, nblExemptInongDate: "2015-01-01" });
    expect(r.isNonBusinessLand).toBe(true);
  });
});

describe("도시지역 농지 — 3년 구간으로 통과하면 사용의제 경로(⑤2호)로 편입유예를 본다", () => {
  // 상속 2018-06-03(5년 넘게 지나 ③4호 나목 불성립) · 재촌·자경 2022-12-03~ · 주거지역 · 편입 2023-01-01
  // 재촌·자경 경로(⑤1호)라면 편입일 전 1년 연속 재촌·자경이 없어 유예 불가 — ⑤2호(제3항 각 호 농지)는 그 요건이 없다.
  it("주거지역 · 편입 2023-01-01 → 편입유예 안 → 사업용", () => {
    const r = judge({
      acquisitionCause: "inheritance", acquisitionDate: "2018-06-03", nblZoneType: "residential",
      nblUrbanIncorporationDate: "2023-01-01", ...FARMED("2022-12-03", "2024-06-03"),
    });
    expect(r.judgmentSteps.find((s) => s.id === "unconditional_exemption")?.status).not.toBe("PASS");
    expect(r.isNonBusinessLand).toBe(false);
  });
});

describe("임야 상속 3년(§168의9③7호) — 구간 방식", () => {
  const d = (iso: string) => new Date(iso);
  const forest = (o: Partial<NonBusinessLandInput>): NonBusinessLandInput => ({
    landType: "forest", landArea: 5000, zoneType: "agriculture_forest", acquisitionDate: d("2018-06-03"), transferDate: d("2024-06-03"),
    landLocation: { sigunguCode: "11680" }, businessUsePeriods: [], gracePeriods: [], ...o,
  });
  const inherited = { forestDetail: { inheritedForestWithin3Years: true, forestInheritanceDate: d("2018-06-03") } };
  const resident = {
    ownerProfile: {
      residenceHistories: [
        { sidoName: "서울", sigunguName: "강남구", sigunguCode: "11680", startDate: d("2022-12-03"), endDate: d("2024-06-03"), hasResidentRegistration: true },
      ],
    },
  };
  it("상속 3년만 · 재촌 1.5년만 → 각각 비사업용, 합치면 사업용", () => {
    expect(judgeForest(forest(inherited), DEFAULT_NON_BUSINESS_LAND_RULES).isBusiness).toBe(false);
    expect(judgeForest(forest(resident), DEFAULT_NON_BUSINESS_LAND_RULES).isBusiness).toBe(false);
    expect(judgeForest(forest({ ...inherited, ...resident }), DEFAULT_NON_BUSINESS_LAND_RULES).isBusiness).toBe(true);
  });
  it("시업중 임야를 상속 3년 안에 양도하면 도시지역이어도 ①2호 단서를 적용하지 않는다(종전 동작)", () => {
    const r = judgeForest(
      forest({
        acquisitionDate: d("2022-01-01"), zoneType: "residential",
        forestDetail: { hasForestPlan: true, inheritedForestWithin3Years: true, forestInheritanceDate: d("2022-01-01") },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
  });
});
