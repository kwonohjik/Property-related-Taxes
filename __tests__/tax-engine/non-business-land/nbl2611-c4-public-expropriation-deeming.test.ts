/**
 * 단위 — 영 §168의14③3호 공익수용 무조건 의제 판정 leaf (NBL2611-C4). 연혁 N(2년/5년)과 가목(2006.12.31.) 경계를 고정한다.
 * 같은 leaf를 NBL 엔진(`checkUnconditionalExemption`) · 주택 초과분 · 건물 부속토지 초과분이 쓴다 — 이 표가 세 입구의 공통 정답이다.
 */
import { describe, it, expect } from "vitest";
import { judgePublicExpropriationDeemed } from "@/lib/tax-engine/non-business-land/public-expropriation-deeming";
import { NBL } from "@/lib/tax-engine/legal-codes/transfer-nbl";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const j = (notice: string, acq: string, transfer = "2024-06-01") =>
  judgePublicExpropriationDeemed({ noticeDate: D(notice), acquisitionDate: D(acq), transferDate: D(transfer) });

describe("가목 — 사업인정고시일 2006.12.31. 이전 (취득일 무관)", () => {
  it("2006-12-31 고시 → 성립(당일 포함), 2007-01-01 고시 → 나목으로", () => {
    expect(j("2006-12-31", "2006-06-01", "2009-06-01")).toMatchObject({ deemed: true, basis: "notice_before_2007", legalBasis: NBL.UNCONDITIONAL_PUBLIC_NOTICE_2006 });
    expect(j("2007-01-01", "2006-12-01", "2009-06-01").basis).not.toBe("notice_before_2007");
  });
});

describe("나목 — 취득일이 고시일부터 N년 이전 (경계일 포함)", () => {
  it("고시 2021-05-03(2년 구간): 취득 2019-05-03 성립 / 2019-05-04 불성립", () => {
    expect(j("2021-05-03", "2019-05-03")).toMatchObject({ deemed: true, lookbackYears: 2, era: "two_year", legalBasis: NBL.UNCONDITIONAL_PUBLIC_ACQ_2Y });
    expect(j("2021-05-03", "2019-05-04")).toMatchObject({ deemed: false, lookbackYears: 2 });
  });
  it("고시 2021-05-04(5년 구간): 취득 2016-05-04 성립 / 2016-05-05 불성립", () => {
    expect(j("2021-05-04", "2016-05-04")).toMatchObject({ deemed: true, lookbackYears: 5, era: "five_year_2021", legalBasis: NBL.UNCONDITIONAL_PUBLIC_ACQ_5Y });
    expect(j("2021-05-04", "2016-05-05").deemed).toBe(false);
  });
  it("양도 2014.2.21. 전이면 고시일과 무관하게 5년(구 문언)", () => {
    expect(j("2012-03-01", "2007-03-01", "2013-06-01")).toMatchObject({ deemed: true, lookbackYears: 5, era: "five_year_pre_2014" });
    expect(j("2012-03-01", "2007-03-02", "2013-06-01").deemed).toBe(false);
  });
  it("윤년 경계 — 고시 2020-02-29의 2년 전은 2018-02-28(응당일 없음)", () => {
    expect(j("2020-02-29", "2018-02-28").deemed).toBe(true);
    expect(j("2020-02-29", "2018-03-01").deemed).toBe(false);
  });
  it("취득일이 비어(Invalid Date) 있으면 성립하지 않는다 — 문구도 깨지지 않는다", () => {
    const r = judgePublicExpropriationDeemed({ noticeDate: D("2021-03-01"), acquisitionDate: new Date(NaN), transferDate: D("2024-06-01") });
    expect(r.deemed).toBe(false);
    expect(r.detail).toContain("미입력");
  });
});
