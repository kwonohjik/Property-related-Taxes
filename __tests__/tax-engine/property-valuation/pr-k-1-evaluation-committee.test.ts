/**
 * PR-K-1 — §54⑥ 평가심의위원회 신청 옵션 (70~130% 4방법) anchor 13건
 *
 * 법령: 상증령 §54⑥ + §49의2 + 상증법 §67·§68 (KoreanLaw MCP 2026-05-24)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md
 */

import { describe, it, expect } from "vitest";
import {
  applyEvaluationCommittee,
  validatePerShareRange,
  METHOD_LABEL,
  type EvaluationCommitteeInput,
  type EvaluationCommitteeMethod,
} from "@/lib/tax-engine/property-valuation/evaluation-committee-section-54-6";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ============================================================
// K-1-1 ~ K-1-2: METHOD_LABEL · enum 강제
// ============================================================

describe("[PR-K-1] METHOD_LABEL Record + enum 강제", () => {
  it("K-1-1: METHOD_LABEL 4종 한글 라벨 + 모든 enum 키 포함", () => {
    expect(METHOD_LABEL.clm).toBe("유사상장사례비교법");
    expect(METHOD_LABEL.dcf).toBe("현금흐름할인법(DCF)");
    expect(METHOD_LABEL.ddm).toBe("배당할인법(DDM)");
    expect(METHOD_LABEL.other).toBe("기타 평가법");
    const keys: EvaluationCommitteeMethod[] = ["clm", "dcf", "ddm", "other"];
    keys.forEach((k) => expect(METHOD_LABEL[k]).toBeTruthy());
  });

  it("K-1-2: enum 외 값 차단 (Record<EvaluationCommitteeMethod, string> 타입 강제)", () => {
    // @ts-expect-error — "invalid" 는 EvaluationCommitteeMethod 가 아니므로 컴파일 차단
    const _x: string = METHOD_LABEL["invalid"];
    void _x;
    expect(Object.keys(METHOD_LABEL).sort()).toEqual(["clm", "dcf", "ddm", "other"]);
  });
});

// ============================================================
// K-1-3 ~ K-1-7: validatePerShareRange / applyEvaluationCommittee 단위
// ============================================================

describe("[PR-K-1] 70~130% 범위 검증", () => {
  it("K-1-3: 70% 정확히 통과 (supp=10,000, taxpayer=7,000)", () => {
    const r = applyEvaluationCommittee(
      { method: "clm", taxpayerPerShareValuation: 7_000 },
      10_000,
    );
    expect(r.isWithinRange).toBe(true);
    expect(r.lower).toBe(7_000);
    expect(r.upper).toBe(13_000);
    expect(r.warnings).toEqual([]);
  });

  it("K-1-4: 130% 정확히 통과 (taxpayer=13,000)", () => {
    const r = applyEvaluationCommittee(
      { method: "dcf", taxpayerPerShareValuation: 13_000 },
      10_000,
    );
    expect(r.isWithinRange).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("K-1-5: 70% 미만 차단 (taxpayer=6,999 → out_of_range_below)", () => {
    const r = applyEvaluationCommittee(
      { method: "ddm", taxpayerPerShareValuation: 6_999 },
      10_000,
    );
    expect(r.isWithinRange).toBe(false);
    expect(r.warnings.find((w) => w.reason === "out_of_range_below")).toBeDefined();
  });

  it("K-1-6: 130% 초과 차단 (taxpayer=13,001 → out_of_range_above)", () => {
    const r = applyEvaluationCommittee(
      { method: "clm", taxpayerPerShareValuation: 13_001 },
      10_000,
    );
    expect(r.isWithinRange).toBe(false);
    expect(r.warnings.find((w) => w.reason === "out_of_range_above")).toBeDefined();
  });

  it("K-1-7: deviationPct 계산 (-5.00·+13.00·0.00)", () => {
    expect(
      applyEvaluationCommittee({ method: "clm", taxpayerPerShareValuation: 9_500 }, 10_000)
        .deviationPct,
    ).toBeCloseTo(-0.05);
    expect(
      applyEvaluationCommittee({ method: "dcf", taxpayerPerShareValuation: 11_300 }, 10_000)
        .deviationPct,
    ).toBeCloseTo(0.13);
    expect(
      applyEvaluationCommittee({ method: "ddm", taxpayerPerShareValuation: 10_000 }, 10_000)
        .deviationPct,
    ).toBeCloseTo(0);
  });

  it("K-1-8: supplementary=0 → zero_supplementary warnings", () => {
    const r = applyEvaluationCommittee(
      { method: "clm", taxpayerPerShareValuation: 5_000 },
      0,
    );
    expect(r.isWithinRange).toBe(false);
    expect(r.lower).toBe(0);
    expect(r.upper).toBe(0);
    expect(r.warnings.find((w) => w.reason === "zero_supplementary")).toBeDefined();
  });

  it("K-1-13: method=\"other\" + methodNotes 누락 → other_method_missing_notes", () => {
    const inputNoNotes: EvaluationCommitteeInput = {
      method: "other",
      taxpayerPerShareValuation: 10_000,
    };
    const r = applyEvaluationCommittee(inputNoNotes, 10_000);
    expect(r.warnings.find((w) => w.reason === "other_method_missing_notes")).toBeDefined();

    // methodNotes 빈 문자열도 차단
    const r2 = applyEvaluationCommittee(
      { method: "other", taxpayerPerShareValuation: 10_000, methodNotes: "  " },
      10_000,
    );
    expect(r2.warnings.find((w) => w.reason === "other_method_missing_notes")).toBeDefined();

    // methodNotes 입력 → 경고 없음
    const r3 = applyEvaluationCommittee(
      { method: "other", taxpayerPerShareValuation: 10_000, methodNotes: "감정평가법인 평가" },
      10_000,
    );
    expect(r3.warnings.find((w) => w.reason === "other_method_missing_notes")).toBeUndefined();
  });

  it("validatePerShareRange 헬퍼 직접 검증", () => {
    expect(validatePerShareRange(10_000, 7_000).isWithinRange).toBe(true); // 70% 정확
    expect(validatePerShareRange(10_000, 13_000).isWithinRange).toBe(true); // 130% 정확
    expect(validatePerShareRange(10_000, 6_999).isWithinRange).toBe(false);
    expect(validatePerShareRange(10_000, 13_001).isWithinRange).toBe(false);
    expect(validatePerShareRange(0, 5_000).isWithinRange).toBe(false);
  });
});

// ============================================================
// K-1-9 ~ K-1-12: 오케스트레이터 통합 (사례 6)
// ============================================================

const case6Base: UnlistedStockValuationInput = {
  corpName: "㈜향기",
  businessStartDate: new Date("2000-01-01"),
  evaluationDate: new Date("2024-01-20"),
  faceValuePerShare: 5_000,
  totalShares: 50_000,
  ownedShares: 26_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 76_842_660 },
    { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 62_416_500 },
    { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: -5_311_910 },
  ],
  capitalChanges: [],
  netAssetValueRaw: {
    bsTotalAssets: 2_476_889_520, assetValuationDelta: 91_548_350,
    corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
    prepaidExpenses: 65_400_500, preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 1_833_780_000, corporateTaxPayable: 32_627_890,
    farmingSurtax: 0, localIncomeTax: 3_262_780, dividendPayable: 0,
    retirementProvision: 445_785_000, otherProvision: 0,
    reserveExcluded: 0, allowanceExcluded: 301_770_000, deferredTaxAdjustment: 0,
  },
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.10,
  isMaxShareholder: true,
  companySize: "large",
};

describe("[PR-K-1] orchestrator 통합", () => {
  it("K-1-9: 사례 6 supplementary=finalPerShareValue + evaluationCommitteeApplied 노출", () => {
    const baseR = evaluateUnlistedStockV2(case6Base);
    const supp = baseR.finalPerShareValue;
    expect(supp).toBeGreaterThan(0);

    const taxpayer = Math.floor(supp * 0.85); // 70~130% 범위 내
    const input: UnlistedStockValuationInput = {
      ...case6Base,
      evaluationCommittee: {
        method: "dcf",
        taxpayerPerShareValuation: taxpayer,
        evaluatorOrganization: "삼일회계법인",
      },
    };
    const r = evaluateUnlistedStockV2(input);
    expect(r.evaluationCommitteeApplied).toBeDefined();
    expect(r.evaluationCommitteeApplied?.isWithinRange).toBe(true);
    expect(r.evaluationCommitteeApplied?.supplementary).toBe(supp);
    expect(r.evaluationCommitteeApplied?.method).toBe("dcf");
  });

  it("K-1-10: 본 결과 무변경 — totalValuation=340,392,000", () => {
    const baseR = evaluateUnlistedStockV2(case6Base);
    expect(baseR.totalValuation).toBe(340_392_000);

    const supp = baseR.finalPerShareValue;
    const input: UnlistedStockValuationInput = {
      ...case6Base,
      evaluationCommittee: {
        method: "clm",
        taxpayerPerShareValuation: Math.floor(supp * 0.9),
      },
    };
    const r = evaluateUnlistedStockV2(input);
    expect(r.totalValuation).toBe(340_392_000); // 본 결과 무변경
    expect(r.finalPerShareValue).toBe(supp);
    expect(r.finalPerShareForReporting).toBe(baseR.finalPerShareForReporting);
  });

  it("K-1-11: appliedRules 인용 (\"§54⑥ + §49의2\")", () => {
    const baseR = evaluateUnlistedStockV2(case6Base);
    const supp = baseR.finalPerShareValue;
    const r = evaluateUnlistedStockV2({
      ...case6Base,
      evaluationCommittee: { method: "ddm", taxpayerPerShareValuation: Math.floor(supp * 1.1) },
    });
    expect(
      r.appliedRules.some((rule) => rule.includes("§54⑥") && rule.includes("§49의2")),
    ).toBe(true);
  });

  it("K-1-12: 빈 입력 회귀 (undefined → result.evaluationCommitteeApplied=undefined)", () => {
    const r = evaluateUnlistedStockV2(case6Base);
    expect(r.evaluationCommitteeApplied).toBeUndefined();
    expect(r.appliedRules.every((rule) => !rule.includes("§54⑥"))).toBe(true);
  });
});
