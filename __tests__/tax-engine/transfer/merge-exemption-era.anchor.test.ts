/**
 * anchor — OH-29 = OH-37 · 합가 처분기한 연혁 (「소득세법 시행령」 §155④⑤ · §156의2⑧⑨)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.2.
 *
 * | 조문 | 양도일 < | 기한 | 이후 | 근거 |
 * |---|---|---|---|---|
 * | §155④ · §156의2⑧ (동거봉양) | 2018-02-13 | 5년 | 10년 | 대통령령 제28637호 부칙 제2조② |
 * | §155⑤ · §156의2⑨ (혼인) | 2024-11-12 | 5년 | 10년 | 대통령령 제34990호 부칙 제2조 |
 *
 * 연혁 본문 실측(법제처 DRF eflaw): 2018-02-12 시행본(MST 202082) ④·⑤·⑧·⑨ 모두 5년,
 * 2018-02-13 시행본(MST 202148) ④·⑧ 10년·⑤·⑨ 5년, 2024-11-12 시행본(MST 266275) ⑤·⑨ 10년.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveMergeExemptionYears } from "@/lib/tax-engine/data/merge-exemption-era";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const d = (s: string) => new Date(s);

/** 2주택 합가 · 양도주택 2010-01-01 취득(합가 전) · 8억 · 비조정 · 먼저 양도 선언 */
function merge(transfer: string, over: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    householdHousingCount: 2,
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: d("2010-01-01"),
    transferDate: d(transfer),
    isFirstTransferredInMerge: true,
    ...over,
  });
}
const exempt = (i: TransferTaxInput) => calculateTransferTax(i, mockRates).isExempt;

describe("leaf — resolveMergeExemptionYears", () => {
  it("동거봉양 2018-02-12 → 5년 / 2018-02-13 → 10년", () => {
    expect(resolveMergeExemptionYears("parental_care", d("2018-02-12"))).toBe(5);
    expect(resolveMergeExemptionYears("parental_care", d("2018-02-13"))).toBe(10);
  });
  it("혼인 2024-11-11 → 5년 / 2024-11-12 → 10년", () => {
    expect(resolveMergeExemptionYears("marriage", d("2024-11-11"))).toBe(5);
    expect(resolveMergeExemptionYears("marriage", d("2024-11-12"))).toBe(10);
  });
  it("축이 다르다 — 2020년 양도: 동거봉양 10년 · 혼인 5년", () => {
    expect(resolveMergeExemptionYears("parental_care", d("2020-06-01"))).toBe(10);
    expect(resolveMergeExemptionYears("marriage", d("2020-06-01"))).toBe(5);
  });
});

describe("§155⑤ 혼인 합가 — 양도일 연혁", () => {
  it("★ 리뷰 M1: 혼인 2015-01-01 · 양도 2023-06-01(8년 5개월) → 5년 도과 → 과세", () => {
    expect(exempt(merge("2023-06-01", { marriageMerge: { marriageDate: d("2015-01-01") } }))).toBe(false);
  });
  it("혼인 2018-01-01: 양도 2024-11-11 과세(5년) / 2024-11-12 비과세(10년)", () => {
    const m = { marriageMerge: { marriageDate: d("2018-01-01") } };
    expect(exempt(merge("2024-11-11", m))).toBe(false);
    expect(exempt(merge("2024-11-12", m))).toBe(true);
  });
  it("혼인 5년 이내 양도는 개정 전에도 비과세 (긍정 짝)", () => {
    expect(exempt(merge("2019-12-31", { marriageMerge: { marriageDate: d("2015-01-01") } }))).toBe(true);
  });
});

describe("§155④ 동거봉양 합가 — 양도일 연혁", () => {
  it("★ 리뷰 M2: 합가 2012-01-01 · 양도 2017-12-01(5년 11개월) → 과세", () => {
    expect(exempt(merge("2017-12-01", { parentalCareMerge: { mergeDate: d("2012-01-01") } }))).toBe(false);
  });
  it("합가 2012-06-01: 양도 2018-02-12 과세(5년) / 2018-02-13 비과세(10년)", () => {
    const m = { parentalCareMerge: { mergeDate: d("2012-06-01") } };
    expect(exempt(merge("2018-02-12", m))).toBe(false);
    expect(exempt(merge("2018-02-13", m))).toBe(true);
  });
});

describe("pending 합가 축 — 기한도 같은 연혁을 쓴다", () => {
  const RULES = mockRates.get("transfer:special:one_house_exemption")!
    .specialRules as unknown as OneHouseSpecialRulesData;
  it("혼인 2015-01-01 · 양도 2023-06-01 → 기한 2020-01-01(5년 만료일)", () => {
    const j = judgeOneHouseExemptionFromInput(
      merge("2023-06-01", { marriageMerge: { marriageDate: d("2015-01-01") } }) as OneHouseJudgeInput,
      RULES,
    );
    const p = j.pending.find((x) => x.id === "155-5-marriage-merge");
    expect(p?.deadline.toISOString().slice(0, 10)).toBe("2020-01-01");
  });
});

describe("§156의2⑧⑨ — 입주권 합가 축", () => {
  /** 1주택 + 1입주권(2019-01-01) · 3년 초과 · 「해당 없음」 명시 → ⑧⑨ 외에 남는 예외 없음 */
  const base = (transfer: string, over: Partial<TransferTaxInput>) =>
    merge(transfer, {
      householdHousingCount: 1,
      presaleRights: [
        { id: "r1", type: "redevelopment_right", acquisitionDate: d("2019-01-01"), region: "capital" },
      ],
      rightThreeYearException: { kind: "none" },
      mergedHouseholdFirstHouse: { kind: "house_only" },
      ...over,
    });
  const status = (i: TransferTaxInput) => resolveArticle89Clause2(i, undefined).status;

  it("⑨ 혼인 2018-01-01: 양도 2024-11-11 배제(5년) / 2024-11-12 예외 충족(10년)", () => {
    const m = { marriageMerge: { marriageDate: d("2018-01-01") } };
    expect(status(base("2024-11-11", m))).toBe("excluded");
    expect(status(base("2024-11-12", m))).toBe("exception_met");
  });
  it("⑧ 동거봉양 2012-06-01: 양도 2018-02-12 배제(5년) / 2018-02-13 예외 충족(10년)", () => {
    const m = { parentalCareMerge: { mergeDate: d("2012-06-01") } };
    const pre = base("2018-02-12", {
      ...m,
      presaleRights: [
        { id: "r1", type: "redevelopment_right", acquisitionDate: d("2013-01-01"), region: "capital" },
      ],
    });
    const post = { ...pre, transferDate: d("2018-02-13") };
    expect(status(pre)).toBe("excluded");
    expect(status(post)).toBe("exception_met");
  });
});
