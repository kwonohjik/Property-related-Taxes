/**
 * 배부표 §69 신고세액공제 연도율 anchor (G-2 증여의 상속판 — 3% 하드코딩 회귀)
 *
 * inheritance-allocation.ts가 per-heir §69를 3% 고정(Math.round(x*0.03))하면
 * reconcileSummaryWithAllocation이 요약의 연도율 filingCredit를 덮어써(allocBase===summaryBase 가드 통과 시)
 * 2019년 이전 상속을 과다과세했다. resolveFilingCreditRate(deathDate) 연도율로 정정:
 *   2016이전 10% · 2017 7% · 2018 5% · 2019~ 3%. (bigIntRoundDiv 정수 round-half-up — Math.round 제거)
 *
 * 수치: comprehensive-case-pdf fixture, filingCreditBase=1,116,660,990 (연도 무관).
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { EXAMPLE_INPUT } from "./fixtures/comprehensive-case-pdf.fixture";

describe("배부표 §69 신고세액공제 연도율 (G-2 상속판 회귀)", () => {
  const CASES = [
    { deathDate: "2016-06-01", pct: 10, filingCredit: 111_666_099, finalTax: 1_004_994_891 },
    { deathDate: "2017-06-01", pct: 7, filingCredit: 78_166_270, finalTax: 1_038_494_720 },
    { deathDate: "2018-06-01", pct: 5, filingCredit: 55_833_050, finalTax: 1_060_827_940 },
    { deathDate: "2019-06-01", pct: 3, filingCredit: 33_499_829, finalTax: 1_083_161_161 },
  ] as const;

  for (const c of CASES) {
    it(`${c.deathDate} → §69 ${c.pct}% (filingCredit ${c.filingCredit.toLocaleString()}·finalTax ${c.finalTax.toLocaleString()})`, () => {
      const r = calcInheritanceTax({ ...EXAMPLE_INPUT, deathDate: c.deathDate });
      // reconcile이 채택한 배부표 §69 합
      expect(r.creditDetail?.filingCredit).toBe(c.filingCredit);
      expect(r.finalTax).toBe(c.finalTax);
    });
  }

  it("2019년 이전(2016) 결정세액 < 2019 — 3% 고정 시 과다과세분(78,166,270) 제거", () => {
    const r2016 = calcInheritanceTax({ ...EXAMPLE_INPUT, deathDate: "2016-06-01" });
    const r2019 = calcInheritanceTax({ ...EXAMPLE_INPUT, deathDate: "2019-06-01" });
    // 10%(2016) − 3%(2019) = 7%p 추가 공제 = filingCreditBase 1,116,660,990 × 7% ≈ 78,166,270
    expect(r2019.finalTax - r2016.finalTax).toBe(78_166_270);
  });

  it("2019+ 결정세액은 기존과 동일 (회귀 0 — 3%율 유지, bigIntRoundDiv==옛 Math.round)", () => {
    const r = calcInheritanceTax({ ...EXAMPLE_INPUT, deathDate: "2019-06-01" });
    expect(r.creditDetail?.filingCredit).toBe(33_499_829);
  });
});
