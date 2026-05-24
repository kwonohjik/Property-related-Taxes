/**
 * @vitest-environment jsdom
 *
 * PR-K-6 통합 RTL anchor — UnlistedStockV2Card 섹션 5-C·5-D 연쇄 (10건)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md PR-K-6
 *
 * K-6-1: UnlistedStockV2Card 섹션 5-C "§54⑥ 평가심의위원회 신청 옵션" 토글 노출
 * K-6-2: 토글 ON → ResultCard + FilingGuide 연쇄 노출
 * K-6-3: 토글 OFF → 모든 sub-카드 숨김
 * K-6-4 ~ K-6-9: 회귀 보호 (사례 6 산출값 보존)
 * K-6-10: 14지점 자동 매핑 자가검증
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useState } from "react";
import { UnlistedStockV2Card } from "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(() => cleanup());

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

function Harness({ initial }: { initial: UnlistedStockValuationInput }) {
  const [input, setInput] = useState(initial);
  return <UnlistedStockV2Card input={input} onChange={setInput} />;
}

describe("[PR-K-6] UnlistedStockV2Card 통합", () => {
  it("K-6-1: 섹션 5-C \"§54⑥ 평가심의위원회 신청 옵션\" 토글 노출", () => {
    render(<Harness initial={case6Base} />);
    expect(screen.getByText(/§54⑥ 평가심의위원회 신청 옵션/)).toBeTruthy();
  });

  it("K-6-3: 토글 OFF → 입력 폼·결과 카드·안내 카드 모두 숨김", () => {
    render(<Harness initial={case6Base} />);
    expect(screen.queryByTestId("evaluation-committee-form")).toBeNull();
    expect(screen.queryByTestId("evaluation-committee-result-card")).toBeNull();
    expect(screen.queryByTestId("evaluation-committee-filing-guide-card")).toBeNull();
  });

  it("K-6-2: 토글 ON (입력 주입) → 입력 폼 + 결과 카드 + 안내 카드 연쇄 노출", () => {
    const input: UnlistedStockValuationInput = {
      ...case6Base,
      evaluationCommittee: {
        method: "dcf",
        taxpayerPerShareValuation: 11_000,
        evaluatorOrganization: "삼일회계법인",
      },
    };
    render(<Harness initial={input} />);
    expect(screen.getByTestId("evaluation-committee-form")).toBeTruthy();
    expect(screen.getByTestId("evaluation-committee-result-card")).toBeTruthy();
    expect(screen.getByTestId("evaluation-committee-filing-guide-card")).toBeTruthy();
  });

  it("K-6-4: 사례 6 회귀 — totalValuation=340,392,000 보존 (evaluationCommittee 미입력)", () => {
    const r = evaluateUnlistedStockV2(case6Base);
    expect(r.totalValuation).toBe(340_392_000);
    expect(r.evaluationCommitteeApplied).toBeUndefined();
  });

  it("K-6-5: 사례 6 회귀 — totalValuation 보존 (evaluationCommittee 입력 시도 본 결과 무변경)", () => {
    const r = evaluateUnlistedStockV2({
      ...case6Base,
      evaluationCommittee: {
        method: "clm",
        taxpayerPerShareValuation: 10_000,
      },
    });
    expect(r.totalValuation).toBe(340_392_000);
    expect(r.evaluationCommitteeApplied).toBeDefined();
    expect(r.evaluationCommitteeApplied?.method).toBe("clm");
  });

  it("K-6-6: 70~130% 범위 안 → isWithinRange=true (사례 6 supplementary 기준)", () => {
    const base = evaluateUnlistedStockV2(case6Base);
    const supp = base.finalPerShareValue;
    const taxpayer = Math.floor(supp * 0.9);
    const r = evaluateUnlistedStockV2({
      ...case6Base,
      evaluationCommittee: { method: "ddm", taxpayerPerShareValuation: taxpayer },
    });
    expect(r.evaluationCommitteeApplied?.isWithinRange).toBe(true);
  });

  it("K-6-7: 70% 미만 → isWithinRange=false + out_of_range_below 경고", () => {
    const base = evaluateUnlistedStockV2(case6Base);
    const supp = base.finalPerShareValue;
    const taxpayer = Math.floor(supp * 0.5); // 50% < 70%
    const r = evaluateUnlistedStockV2({
      ...case6Base,
      evaluationCommittee: { method: "clm", taxpayerPerShareValuation: taxpayer },
    });
    expect(r.evaluationCommitteeApplied?.isWithinRange).toBe(false);
    expect(
      r.evaluationCommitteeApplied?.warnings.find((w) => w.reason === "out_of_range_below"),
    ).toBeDefined();
  });

  it("K-6-8: method=\"other\" + methodNotes 입력 시 정상 통과", () => {
    const r = evaluateUnlistedStockV2({
      ...case6Base,
      evaluationCommittee: {
        method: "other",
        taxpayerPerShareValuation: 9_000,
        methodNotes: "DCF 변형 (성장률 가정)",
      },
    });
    expect(r.evaluationCommitteeApplied?.method).toBe("other");
    expect(
      r.evaluationCommitteeApplied?.warnings.find(
        (w) => w.reason === "other_method_missing_notes",
      ),
    ).toBeUndefined();
  });

  it("K-6-9: appliedRules에 §54⑥ + §49의2 인용 (evaluationCommittee 입력 시)", () => {
    const r = evaluateUnlistedStockV2({
      ...case6Base,
      evaluationCommittee: { method: "dcf", taxpayerPerShareValuation: 9_000 },
    });
    expect(
      r.appliedRules.some((rule) => rule.includes("§54⑥") && rule.includes("§49의2")),
    ).toBe(true);
  });

  it("K-6-10: 14지점 자동 매핑 — evaluationCommittee 키 5단 파이프라인 통과", () => {
    // 본 anchor는 5단 파이프라인(폼→변환→fetch body→Zod→route→엔진) 중
    // 엔진 진입점이 evaluationCommittee 키를 정상 수신하여 result 노출까지 도달하는지 검증.
    const input: UnlistedStockValuationInput = {
      ...case6Base,
      evaluationCommittee: {
        method: "clm",
        taxpayerPerShareValuation: 10_500,
        evaluatorOrganization: "한국기업평가",
      },
    };
    const r = evaluateUnlistedStockV2(input);
    // ⑫⑬⑭ 매핑 검증 — evaluationCommittee 입력 → result 노출 → 모든 필드 보존
    expect(r.evaluationCommitteeApplied).toBeDefined();
    expect(r.evaluationCommitteeApplied?.method).toBe("clm");
    expect(r.evaluationCommitteeApplied?.supplementary).toBe(r.finalPerShareValue);
    expect(r.evaluationCommitteeApplied?.appliedLegalBasis).toContain("§54⑥");
    expect(r.evaluationCommitteeApplied?.appliedLegalBasis).toContain("§49의2");
  });
});
