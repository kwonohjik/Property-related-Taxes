/**
 * @vitest-environment jsdom
 *
 * 비상장주식 평가서 제6쪽 「7. 순손익액」 — 2025.07.10 공식 양식(②~㉒ 21항목 전개) anchor (C1 Pre-Do)
 *
 * Plan: docs/00-pm/inheritance-besshi-page6-official-layout.plan.md
 *
 * 목적:
 *   - AN-P6-1 (헤더, RED): "(단위 : 원)"·"(제6쪽)" + 구 "7. 순손익액 (3년치 — 별지 제6쪽)" 부재.
 *   - AN-P6-2 (21행 전개·그룹 라벨, RED): ②~㉒ 개별 + "소득에 가산할 금액"·"소득에서 차감할 금액". 구 "가산 합계"/"차감 합계" 부재.
 *   - AN-P6-3 (공식 라벨, RED): 가/나 소계·다·아/자/차 공식 문구.
 *   - AN-P6-4 (echo→표시 배선, RED): ②·⑧에 값 주입 → PDF에 해당 금액 표시(축약 합계가 아닌 개별 행).
 *   - AN-P6-5 (값 정합·회귀, 사례6): ①/다/마/사/아/차.
 *   - AN-P6-6 (화면 그룹 라벨, RED): 화면 "소득에 가산할 금액"·"소득에서 차감할 금액" + testid 보존.
 *
 * 실행: npx vitest run __tests__/lib/pdf/besshi-page6-official-layout.test.tsx
 */

import { describe, it, expect, afterEach } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { UnlistedStockBesshiPdfDocument } from "@/lib/pdf/UnlistedStockBesshiPdfDocument";
import { Page6NetIncomeBreakdown } from "@/components/calc/inheritance/unlisted-stock-v2/besshi/Page6NetIncomeBreakdown";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(cleanup);

function collectText(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === "function") {
      try {
        return collectText((el.type as (p: unknown) => ReactNode)(el.props));
      } catch {
        return collectText(el.props.children);
      }
    }
    return collectText(el.props.children);
  }
  return "";
}

// 사례 6 (besshi-form-full-replica 동일) — ②~㉒ 미입력(=0)
const case6Input: UnlistedStockValuationInput = {
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

// echo 배선 증명용 — ②+⑦, ⑧+㉒ 동시 주입 → 개별값 ≠ 소계(축약 모드에선 개별값 미표시 → RED)
//   addTotal = 7,654,321 + 2,222,222 = 9,876,543 (≠ ② 7,654,321)
//   subTotal = 8,765,432 + 3,333,333 = 12,098,765 (≠ ⑧ 8,765,432)
const echoInput: UnlistedStockValuationInput = {
  ...case6Input,
  fiscalYears: [
    {
      ...case6Input.fiscalYears[0],
      addRefundInterest: 7_654_321, addOtherByOrdinance: 2_222_222,
      subCorporateTax: 8_765_432, subOtherByOrdinance: 3_333_333,
    },
    case6Input.fiscalYears[1],
    case6Input.fiscalYears[2],
  ],
};

const pdfText = collectText(UnlistedStockBesshiPdfDocument({ input: case6Input }));

describe("[AN-P6-1] PDF 제6쪽 헤더", () => {
  it("(단위 : 원) · (제6쪽)", () => {
    expect(pdfText).toContain("(단위 : 원)");
    expect(pdfText).toContain("(제6쪽)");
  });
  it("구 '7. 순손익액 (3년치 — 별지 제6쪽)' 부재", () => {
    expect(pdfText).not.toContain("7. 순손익액 (3년치 — 별지 제6쪽)");
  });
});

describe("[AN-P6-2] PDF 제6쪽 21행 전개 + 그룹 라벨", () => {
  it("그룹 라벨 소득에 가산할 금액 · 소득에서 차감할 금액", () => {
    expect(pdfText).toContain("소득에 가산할 금액");
    expect(pdfText).toContain("소득에서 차감할 금액");
  });
  it("②~㉒ 개별 항목 라벨 (공통 안전 substring)", () => {
    expect(pdfText).toContain("과오납"); // ②
    expect(pdfText).toContain("기업업무추진비 손금불산입"); // ⑯
    expect(pdfText).toContain("외화환산손실"); // ㉑
  });
  it("구 축약 '가산 합계 (②~⑦)' · '차감 합계 (⑧~㉒)' 부재", () => {
    expect(pdfText).not.toContain("가산 합계 (②~⑦)");
    expect(pdfText).not.toContain("차감 합계 (⑧~㉒)");
  });
});

describe("[AN-P6-3] PDF 제6쪽 공식 라벨", () => {
  it("가/나 소계 + 다 순손익액(가 - 나)", () => {
    expect(pdfText).toContain("소계(① + ② + …⑦)");
    expect(pdfText).toContain("소계(⑧ + …㉒)");
    expect(pdfText).toContain("순손익액(가 - 나)");
  });
  it("아 가중평균액 + 자 기획재정부령이 정하는 율 + 차 공식 문구", () => {
    expect(pdfText).toContain("(㉓ × 3 + ㉔ × 2 + ㉕) / 6");
    expect(pdfText).toContain("기획재정부령이 정하는 율");
    expect(pdfText).toContain("최근 3년간 순손익액의 가중평균액에 의한 1주당 가액");
  });
});

describe("[AN-P6-4] PDF echo→표시 배선 (②·⑧ 주입)", () => {
  const echoText = collectText(UnlistedStockBesshiPdfDocument({ input: echoInput }));
  it("② addRefundInterest = 7,654,321 표시", () => expect(echoText).toContain("7,654,321"));
  it("⑧ subCorporateTax = 8,765,432 표시", () => expect(echoText).toContain("8,765,432"));
});

describe("[AN-P6-5] PDF 제6쪽 값 정합 (사례6)", () => {
  const r = evaluateUnlistedStockV2(case6Input);
  it("① 2023 소득금액 = 76,842,660", () => expect(pdfText).toContain("76,842,660"));
  it("아 1주당 가중평균 = weightedNetIncomePerShare", () =>
    expect(pdfText).toContain(r.weightedNetIncomePerShare.toLocaleString()));
  it("차 1주당 순손익가치 = netIncomePerShare", () =>
    expect(pdfText).toContain(r.netIncomePerShare.toLocaleString()));
});

describe("[AN-P6-6] 화면 Page6 그룹 라벨 + testid 보존", () => {
  const r = evaluateUnlistedStockV2(case6Input);
  it("소득에 가산할 금액 · 소득에서 차감할 금액 그룹 라벨", () => {
    render(<Page6NetIncomeBreakdown result={r} />);
    expect(screen.getByText("소득에 가산할 금액")).toBeInTheDocument();
    expect(screen.getByText("소득에서 차감할 금액")).toBeInTheDocument();
  });
  it("testid p6-① · p6-② · p6-㉒ · p6-차 보존", () => {
    render(<Page6NetIncomeBreakdown result={r} />);
    expect(screen.getByTestId("p6-①")).toBeInTheDocument();
    expect(screen.getByTestId("p6-②")).toBeInTheDocument();
    expect(screen.getByTestId("p6-㉒")).toBeInTheDocument();
    expect(screen.getByTestId("p6-차")).toBeInTheDocument();
  });
});
