/**
 * NBL2611-V3-PR01 · V3-PR05 · V8-VL01 — 비사업용 토지 판정 숫자의 **기준일 축별 연혁 leaf** anchor (묶음 A4 · R03).
 *
 * 법령 근거(KoreanLaw 시행본·부칙 원문 실독 2026-11-19)는 `lib/tax-engine/data/nbl-historical-values-era.ts` 머리 표.
 * 경계일: 양도 2014.2.20./21. · 고시 2021.5.3./4. · 양도 2025.3.20./21. · 양도 2015.2.2./3.
 * 수정 전(현행 단일값)은 각 셀 주석의 «전».
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { checkUnconditionalExemption } from "@/lib/tax-engine/non-business-land/unconditional-exemption";
import { resolveGraceIntervals } from "@/lib/tax-engine/non-business-land/grace-reason-period";
import { judgeVillaLand } from "@/lib/tax-engine/non-business-land/villa-land";
import { demolitionGraceYears, publicNoticeLookback, villaRuralValueLimit } from "@/lib/tax-engine/data/nbl-historical-values-era";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { NBL } from "@/lib/tax-engine/legal-codes/transfer-nbl";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("leaf — publicNoticeLookback(양도일, 고시일)", () => {
  it.each([
    ["2014-02-20", "2013-01-01", 5, "five_year_pre_2014"], // 양도 2014.2.20. = 구 문언 5년
    ["2014-02-21", "2013-01-01", 2, "two_year"], //          양도 2014.2.21. = 개정 2년(시행 후 최초 양도분, 당일 포함)
    ["2024-06-01", "2021-05-03", 2, "two_year"], //          고시 2021.5.3. = 종전 2년 (부칙 제31659호 제4조)
    ["2024-06-01", "2021-05-04", 5, "five_year_2021"], //    고시 2021.5.4. = 5년
    ["2013-06-01", "2021-05-04", 5, "five_year_pre_2014"], // 양도가 2014.2.21. 전이면 고시일과 무관하게 5년(고시일이 양도일 뒤인 비정상 입력이라도 양도일 축 우선)
  ])("양도 %s · 고시 %s → %i년 (%s)", (transfer, notice, years, era) => {
    const r = publicNoticeLookback(d(transfer), d(notice));
    expect(r.years).toBe(years);
    expect(r.era).toBe(era);
  });
  it("법령 근거는 시행본마다 다르다 — 2년·구 5년은 목 구분이 없다", () => {
    expect(publicNoticeLookback(d("2024-06-01"), d("2019-01-01")).legalBasis).toBe(NBL.UNCONDITIONAL_PUBLIC_ACQ_2Y);
    expect(publicNoticeLookback(d("2013-06-01"), d("2010-01-01")).legalBasis).toBe(NBL.UNCONDITIONAL_PUBLIC_ACQ_5Y_PRE_2014);
    expect(publicNoticeLookback(d("2024-06-01"), d("2022-01-01")).legalBasis).toBe(NBL.UNCONDITIONAL_PUBLIC_ACQ_5Y);
    expect(NBL.UNCONDITIONAL_PUBLIC_ACQ_2Y).not.toContain("나목");
    expect(NBL.UNCONDITIONAL_PUBLIC_ACQ_5Y_PRE_2014).not.toContain("나목");
  });
});

describe("leaf — demolitionGraceYears · villaRuralValueLimit", () => {
  it.each([["2025-03-20", 2], ["2025-03-21", 5]] as const)("규칙 §83의5①9호 양도 %s → %i년", (t, y) => {
    expect(demolitionGraceYears(d(t))).toBe(y);
  });
  it.each([["2015-02-02", 100_000_000], ["2015-02-03", 200_000_000]] as const)("영 §168의13 2호 양도 %s → %i원", (t, v) => {
    expect(villaRuralValueLimit(d(t))).toBe(v);
  });
});

function expropriation(over: { transfer: string; notice: string; acquired: string }): NonBusinessLandInput {
  return {
    landType: "farmland", landArea: 3000, zoneType: "agriculture_forest",
    acquisitionDate: d(over.acquired), transferDate: d(over.transfer),
    businessUsePeriods: [], gracePeriods: [],
    unconditionalExemption: { isPublicExpropriation: true, publicNoticeDate: d(over.notice) },
  };
}

describe("V3-PR01 엔진 — 공익수용 의제가 양도일·고시일 연혁 leaf를 읽는다", () => {
  it("메인 재현: 고시 2019-01-01 · 취득 2015-06-01 · 양도 2024-06-01 → 사업용 의제(2년 이전) — 전: 비사업용(5년 단일 기준, 취득이 고시 3.6년 전)", () => {
    const r = checkUnconditionalExemption(expropriation({ transfer: "2024-06-01", notice: "2019-01-01", acquired: "2015-06-01" }), "farmland");
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("public_expropriation");
    expect(r.legalBasis).toBe(NBL.UNCONDITIONAL_PUBLIC_ACQ_2Y);
  });
  it("2년 경계: 취득이 고시일 정확히 2년 전이면 의제 · 하루 늦으면 불성립", () => {
    expect(checkUnconditionalExemption(expropriation({ transfer: "2024-06-01", notice: "2019-01-01", acquired: "2017-01-01" }), "farmland").isExempt).toBe(true);
    expect(checkUnconditionalExemption(expropriation({ transfer: "2024-06-01", notice: "2019-01-01", acquired: "2017-01-02" }), "farmland").isExempt).toBe(false);
  });
  it("고시 2021-05-03(종전 2년) vs 2021-05-04(5년) — 취득이 고시일 3년 전", () => {
    expect(checkUnconditionalExemption(expropriation({ transfer: "2024-06-01", notice: "2021-05-03", acquired: "2018-05-03" }), "farmland").isExempt).toBe(true);
    expect(checkUnconditionalExemption(expropriation({ transfer: "2024-06-01", notice: "2021-05-04", acquired: "2018-05-04" }), "farmland").isExempt).toBe(false);
    // 5년 구간은 종전과 같다 — 취득이 고시일 5년 전이면 의제
    const r5 = checkUnconditionalExemption(expropriation({ transfer: "2024-06-01", notice: "2021-05-04", acquired: "2016-05-04" }), "farmland");
    expect(r5.isExempt).toBe(true);
    expect(r5.legalBasis).toBe(NBL.UNCONDITIONAL_PUBLIC_ACQ_5Y);
  });
  it("양도 2014-02-20(구 5년) vs 2014-02-21(2년) — 고시 2013-01-01 · 취득 2009-01-01(고시 4년 전)", () => {
    const old = checkUnconditionalExemption(expropriation({ transfer: "2014-02-20", notice: "2013-01-01", acquired: "2009-01-01" }), "farmland");
    expect(old.isExempt).toBe(false); // 4년 전 < 5년 — 구 문언 불성립
    const next = checkUnconditionalExemption(expropriation({ transfer: "2014-02-21", notice: "2013-01-01", acquired: "2009-01-01" }), "farmland");
    expect(next.isExempt).toBe(true); // 2년 이전 — 개정 성립
    // 구 5년 구간에서 취득이 5년 전이면 의제 · 근거는 구 시행본
    const oldOk = checkUnconditionalExemption(expropriation({ transfer: "2014-02-20", notice: "2013-01-01", acquired: "2008-01-01" }), "farmland");
    expect(oldOk.isExempt).toBe(true);
    expect(oldOk.legalBasis).toBe(NBL.UNCONDITIONAL_PUBLIC_ACQ_5Y_PRE_2014);
  });
});

describe("V3-PR05 — 규칙 §83의5①9호 멸실 유예(양도일 2025.3.21. 전 2년)", () => {
  const ctx = (transfer: string) => ({ transferDate: d(transfer), acquisitionDate: d("2010-01-01"), isRealEstateDealerMatter: false });
  it("양도 2025-03-20: 멸실일 2022-01-10 + 2년 = 2024-01-10 · 전: 5년(2027-01-10)", () => {
    const [iv] = resolveGraceIntervals("demolition", d("2022-01-10"), undefined, undefined, ctx("2025-03-20"));
    expect(iv.end.toISOString().slice(0, 10)).toBe("2024-01-10");
  });
  it("양도 2025-03-21: 5년", () => {
    const [iv] = resolveGraceIntervals("demolition", d("2022-01-10"), undefined, undefined, ctx("2025-03-21"));
    expect(iv.end.toISOString().slice(0, 10)).toBe("2027-01-10");
  });
});

describe("V8-VL01 — 별장 농어촌주택 기준시가 한도(양도일 2015.2.3. 전 1억)", () => {
  const villa = (transfer: string, value: number): NonBusinessLandInput => ({
    landType: "villa_land", landArea: 500, zoneType: "agriculture_forest",
    acquisitionDate: d("2005-01-01"), transferDate: d(transfer),
    villa: {
      villaUsePeriods: [{ startDate: d("2005-01-02"), endDate: d(transfer), usageType: "별장" }],
      isEupMyeon: true, isRuralHousing: true, buildingFloorArea: 140, attachedLandArea: 600, combinedStdValue: value, isInRestrictedArea: false,
    },
    businessUsePeriods: [], gracePeriods: [],
  });
  it("기준시가 1.5억: 양도 2015-02-02 → 비사업용(1억 초과) · 2015-02-03 → 사업용(2억 이하) — 전: 둘 다 사업용", () => {
    expect(judgeVillaLand(villa("2015-02-02", 150_000_000), DEFAULT_NON_BUSINESS_LAND_RULES).isBusiness).toBe(false);
    expect(judgeVillaLand(villa("2015-02-03", 150_000_000), DEFAULT_NON_BUSINESS_LAND_RULES).isBusiness).toBe(true);
  });
  it("기준시가 1억 정확히: 양도 2015-02-02 → 사업용(1억 이하) · 경계 위 1원 → 비사업용", () => {
    expect(judgeVillaLand(villa("2015-02-02", 100_000_000), DEFAULT_NON_BUSINESS_LAND_RULES).isBusiness).toBe(true);
    expect(judgeVillaLand(villa("2015-02-02", 100_000_001), DEFAULT_NON_BUSINESS_LAND_RULES).isBusiness).toBe(false);
  });
});

describe("재발 방지 스캔 — 연혁 숫자 리터럴이 엔진 파일에 다시 박히지 않는다", () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  it("공익수용 의제: addYears(고시일, -5) 단일 기준 리터럴 없음 — leaf(publicNoticeLookback)만 읽는다", () => {
    const src = read("lib/tax-engine/non-business-land/unconditional-exemption.ts");
    expect(src).not.toMatch(/addYears\([^)]*,\s*-5\)/);
    expect(src).toContain("publicNoticeLookback(");
  });
  it("9호 멸실 유예: 연수를 demolitionGraceYears(양도일)로 정한다", () => {
    expect(read("lib/tax-engine/non-business-land/grace-reason-period.ts")).toContain("demolitionGraceYears(");
  });
  it("별장 농어촌주택 기준시가 한도: 200_000_000 리터럴 없음 — villaRuralValueLimit(양도일)", () => {
    const src = read("lib/tax-engine/non-business-land/villa-land.ts");
    expect(src).not.toMatch(/200_000_000/);
    expect(src).toContain("villaRuralValueLimit(");
  });
});
