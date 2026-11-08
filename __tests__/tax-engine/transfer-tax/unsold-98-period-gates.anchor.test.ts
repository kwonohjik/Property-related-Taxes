/**
 * §98 시리즈 경계·시행일 게이트 anchor (리뷰 US-05·US-57·US-17·US-18·US-20·US-22·US-75)
 * 부칙 근거: 법률 제10285호 제2조 · 제9272호 제21조 · 제9512호 제6·7조 · 제9671호 제15조 (KoreanLaw 부칙 원문 실독).
 * 「시행 후 최초로 양도(계약)하는 분」 = 시행일 당일 포함.
 */
import { describe, it, expect } from "vitest";
import { evaluateUnsold982 } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p4";
import { evaluateUnsold983 } from "@/lib/tax-engine/transfer-reductions/unsold-98-3";
import { evaluateUnsold985, UNSOLD_98_5_CONTRACT_FROM } from "@/lib/tax-engine/transfer-reductions/unsold-98-5";
import { evaluateUnsold986 } from "@/lib/tax-engine/transfer-reductions/unsold-98-6";
import { evaluateUnsold987 } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid";
import { checkReductionPeriod } from "@/lib/tax-engine/transfer-reductions/period-check";
import {
  resolveSpecialHouseExclusions,
  meetsSpecialHouseReductionRequirements,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";

const D = (s: string) => new Date(s);
const codes = (r: { ineligibleReasons: { code: string }[] }) => r.ineligibleReasons.map((x) => x.code);

const excluded = (article: string, transfer: string, extra: Record<string, unknown>) =>
  resolveSpecialHouseExclusions([{ article, requirementsConfirmed: true, ...extra } as never], D(transfer)).excludedCount;

describe("US-05·US-57 §98의5 계약 시작일 2010.5.14.", () => {
  it("상수", () => expect(UNSOLD_98_5_CONTRACT_FROM.toISOString().slice(0, 10)).toBe("2010-05-14"));
  const eval985 = (c: string) =>
    evaluateUnsold985({
      transferDate: D("2016-01-01"), acquisitionDate: D("2011-06-15"), contractDate: D(c), priceReductionRatePct: 15,
      isNonCapitalUnsoldAtCutoff: true, isFirstContract: true, isNotOccupiedAtContract: true, isNotRecontract: true,
      transferIncome: 100_000_000,
    });
  it.each([["2010-05-13", false], ["2010-05-14", true], ["2011-04-30", true], ["2011-05-01", false]])("감면 계약 %s → %s", (c, ok) => {
    expect(eval985(c).isEligible).toBe(ok);
  });
  it.each([["2010-05-13", false], ["2010-05-14", true], ["2011-04-30", true]])("UI 사전판정 계약 %s → %s", (c, ok) => {
    expect(checkReductionPeriod("unsold_98_5", { transferDate: D("2016-01-01"), contractDate: D(c) }).inPeriod).toBe(ok);
  });
  it("주택 수 제외 — 계약일 5.13 불성립 / 5.14 성립 / 취득일만 창 안이면 불성립(계약일 필수)", () => {
    expect(excluded("unsold_98_5", "2024-06-01", { houseContractDate: D("2010-05-13") })).toBe(0);
    expect(excluded("unsold_98_5", "2024-06-01", { houseContractDate: D("2010-05-14") })).toBe(1);
    expect(excluded("unsold_98_5", "2024-06-01", { houseAcquisitionDate: D("2010-06-01") })).toBe(0);
    expect(excluded("unsold_98_5", "2024-06-01", { houseContractDate: D("2011-04-30") })).toBe(1);
  });
  it("영 §167의3①5호 판정(meetsSpecialHouseReductionRequirements)도 5.13 계약은 불성립", () => {
    const e = (c: string) => ({ article: "unsold_98_5", requirementsConfirmed: true, houseContractDate: D(c) }) as never;
    expect(meetsSpecialHouseReductionRequirements(e("2010-05-13"), D("2024-06-01"))).toBe(false);
    expect(meetsSpecialHouseReductionRequirements(e("2010-05-14"), D("2024-06-01"))).toBe(true);
  });
});

describe("US-17 §98의2 매매계약일 하한 2008.11.3.", () => {
  const e982 = (c: string | undefined) =>
    evaluateUnsold982({ transferDate: D("2024-06-03"), acquisitionDate: D("2009-03-02"), contractDate: c ? D(c) : undefined, isNonCapitalUnsold: true, isFirstOrFcfsContract: true });
  it.each([["2008-06-02", false], ["2008-11-02", false], ["2008-11-03", true], [undefined, true]])("계약 %s → %s", (c, ok) => {
    expect(e982(c as string | undefined).isEligible).toBe(ok);
  });
  it("UI 사전판정", () => {
    expect(checkReductionPeriod("unsold_98_2", { transferDate: D("2024-06-03"), acquisitionDate: D("2009-03-02"), contractDate: D("2008-11-02") }).inPeriod).toBe(false);
    expect(checkReductionPeriod("unsold_98_2", { transferDate: D("2024-06-03"), acquisitionDate: D("2009-03-02"), contractDate: D("2008-11-03") }).inPeriod).toBe(true);
  });
  it("주택 수 제외 — 계약 2008-06-02 불성립", () => {
    expect(excluded("unsold_98_2", "2024-06-01", { houseAcquisitionDate: D("2009-03-02"), houseContractDate: D("2008-06-02") })).toBe(0);
    expect(excluded("unsold_98_2", "2024-06-01", { houseAcquisitionDate: D("2009-03-02"), houseContractDate: D("2008-11-03") })).toBe(1);
  });
});

describe("US-18 §98의2 시행일 2009.1.1.", () => {
  const e = (t: string) => evaluateUnsold982({ transferDate: D(t), acquisitionDate: D("2008-11-15"), isNonCapitalUnsold: true, isFirstOrFcfsContract: true });
  it.each([["2008-12-20", false], ["2008-12-31", false], ["2009-01-01", true], ["2009-01-02", true]])("양도 %s → %s", (t, ok) => {
    expect(e(t).isEligible).toBe(ok);
    if (!ok) expect(codes(e(t))).toContain("TRANSFER_BEFORE_EFFECTIVE");
  });
  it("UI 사전판정", () => {
    expect(checkReductionPeriod("unsold_98_2", { transferDate: D("2008-12-31"), acquisitionDate: D("2008-11-15") }).inPeriod).toBe(false);
    expect(checkReductionPeriod("unsold_98_2", { transferDate: D("2009-01-01"), acquisitionDate: D("2008-11-15") }).inPeriod).toBe(true);
  });
});

describe("US-20 §98의3 시행일 (거주자 2009.3.25. / 비거주자 2009.5.21.)", () => {
  const base = (o: Record<string, unknown>) =>
    evaluateUnsold983({
      transferDate: D("2009-03-25"), acquisitionDate: D("2009-02-20"), contractDate: D("2009-02-15"),
      isOutsideSeoulNotDesignated: true, isUnsoldConfirmed: true, isFirstContract: true, transferIncome: 30_000_000, ...o,
    } as never);
  it.each([["2009-03-20", false], ["2009-03-24", false], ["2009-03-25", true]])("거주자 양도 %s → 게이트 사유 %s", (t, ok) => {
    const r = base({ transferDate: D(t) });
    expect(codes(r).includes("TRANSFER_BEFORE_EFFECTIVE")).toBe(!ok);
  });
  it.each([["2009-05-20", false], ["2009-05-21", true]])("비거주자 양도 %s → %s", (t, ok) => {
    const r = base({ transferDate: D(t), residencyType: "nonresident_no_pe", contractDate: D("2009-03-17"), acquisitionDate: D("2009-03-20") });
    expect(codes(r).includes("TRANSFER_BEFORE_EFFECTIVE")).toBe(!ok);
  });
  it("자기건설 ②도 같은 게이트", () => {
    const r = base({ transferDate: D("2009-03-20"), houseType: "self_built", contractDate: undefined, constructionStartDate: D("2009-02-12"), usageApprovalDate: D("2009-03-10") });
    expect(codes(r)).toContain("TRANSFER_BEFORE_EFFECTIVE");
  });
  it("UI 사전판정·주택 수 제외(§98의3③)", () => {
    expect(checkReductionPeriod("unsold_98_3", { transferDate: D("2009-03-24"), contractDate: D("2009-02-15") }).inPeriod).toBe(false);
    expect(checkReductionPeriod("unsold_98_3", { transferDate: D("2009-03-25"), contractDate: D("2009-02-15") }).inPeriod).toBe(true);
    expect(excluded("unsold_98_3", "2009-03-24", { houseAcquisitionDate: D("2009-02-20") })).toBe(0);
    expect(excluded("unsold_98_3", "2009-03-25", { houseAcquisitionDate: D("2009-02-20") })).toBe(1);
  });
});

describe("US-22 §98의6 2011.3.29. 현재 준공후미분양", () => {
  const e = (a: string) => evaluateUnsold986({ transferDate: D("2013-06-01"), acquisitionDate: D(a), transferIncome: 100_000_000 } as never);
  it("취득 3.28 사유 포함 / 3.29 제외", () => {
    expect(codes(e("2011-03-28"))).toContain("ACQUISITION_BEFORE_COMPLETED_UNSOLD_CUTOFF");
    expect(codes(e("2011-03-29"))).not.toContain("ACQUISITION_BEFORE_COMPLETED_UNSOLD_CUTOFF");
  });
  it("UI 사전판정·주택 수 제외 (계약일 우선, 없으면 취득일, 일자 미입력 통과)", () => {
    expect(checkReductionPeriod("unsold_98_6", { transferDate: D("2013-06-01"), acquisitionDate: D("2011-03-28") }).inPeriod).toBe(false);
    expect(checkReductionPeriod("unsold_98_6", { transferDate: D("2013-06-01"), acquisitionDate: D("2011-03-29") }).inPeriod).toBe(true);
    expect(excluded("unsold_98_6", "2013-06-01", { houseAcquisitionDate: D("2010-01-10") })).toBe(0);
    expect(excluded("unsold_98_6", "2013-06-01", { houseAcquisitionDate: D("2011-03-29") })).toBe(1);
    expect(excluded("unsold_98_6", "2013-06-01", { houseContractDate: D("2011-03-28"), houseAcquisitionDate: D("2011-06-01") })).toBe(0);
  });
});

describe("US-75 §98의7 시행일 2012.10.2. (+ 주택 수 제외 §98의2④·§98의3③·§98의7②)", () => {
  it("UI 사전판정·주택 수 제외", () => {
    expect(checkReductionPeriod("unsold_98_7", { transferDate: D("2012-10-01"), contractDate: D("2012-09-25") }).inPeriod).toBe(false);
    expect(checkReductionPeriod("unsold_98_7", { transferDate: D("2012-10-02"), contractDate: D("2012-09-25") }).inPeriod).toBe(true);
    expect(excluded("unsold_98_7", "2012-10-01", { houseAcquisitionDate: D("2012-09-25") })).toBe(0);
    expect(excluded("unsold_98_7", "2012-10-02", { houseAcquisitionDate: D("2012-09-25") })).toBe(1);
  });
  it("§98의2④ 2009-03-24 불성립 / 03-25 성립", () => {
    expect(excluded("unsold_98_2", "2009-03-24", { houseAcquisitionDate: D("2008-12-15") })).toBe(0);
    expect(excluded("unsold_98_2", "2009-03-25", { houseAcquisitionDate: D("2008-12-15") })).toBe(1);
  });
  it("본 감면 §98의7 — 양도 2012-10-01 사유 / 10-02 통과", () => {
    const mk = (t: string) => evaluateUnsold987({ transferDate: D(t), acquisitionDate: D("2012-09-25"), contractDate: D("2012-09-24"), acquisitionPrice: 500_000_000, transferIncome: 100_000_000 } as never);
    expect(codes(mk("2012-10-01"))).toContain("TRANSFER_BEFORE_EFFECTIVE");
    expect(codes(mk("2012-10-02"))).not.toContain("TRANSFER_BEFORE_EFFECTIVE");
  });
});
