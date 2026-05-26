/**
 * @vitest-environment jsdom
 *
 * 비상장주식 평가서 제5쪽 「6. 영업권」 — 2025.07.10 공식 양식 정합 anchor (C1 Pre-Do)
 *
 * Plan: docs/00-pm/inheritance-besshi-page5-official-layout.plan.md
 *
 * 목적:
 *   - AN-P5-1 (헤더, RED): "(단위 : 원)"·"(제5쪽)" + 구 "6. 영업권 (별지 제5쪽)" 부재.
 *   - AN-P5-2 (3열 col3, RED): 가 산식·자 ref·라 10%·바 5년 → col3. 라벨 inline 산식 제거(÷6·③×1·구 ref 부재).
 *   - AN-P5-3 (공식 라벨, RED): ①②③·사·아 공식 문구.
 *   - AN-P5-4 (값 정합·회귀, 사례6): 가=58,341,511 / 다=489,351,700 / 마=48,935,170.
 *   - AN-P5-5 (화면 testid + 금액 셀 위치, RED): p5-가 행 금액 셀(cells[len-2])=58,341,511, testid·footer 보존.
 *
 * 실행: npx vitest run __tests__/lib/pdf/besshi-page5-official-layout.test.tsx
 */

import { describe, it, expect, afterEach } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { UnlistedStockBesshiPdfDocument } from "@/lib/pdf/UnlistedStockBesshiPdfDocument";
import { Page5GoodwillTable } from "@/components/calc/inheritance/unlisted-stock-v2/besshi/Page5GoodwillTable";
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

// 사례 6 (besshi-form-full-replica 동일) — 가=58,341,511 / 다=489,351,700 / 마=48,935,170 / 자=0
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

const pdfText = collectText(UnlistedStockBesshiPdfDocument({ input: case6Input }));

describe("[AN-P5-1] PDF 제5쪽 헤더 (단위·페이지)", () => {
  it("(단위 : 원) · (제5쪽)", () => {
    expect(pdfText).toContain("(단위 : 원)");
    expect(pdfText).toContain("(제5쪽)");
  });
  it("구 '6. 영업권 (별지 제5쪽)' 부재", () => {
    expect(pdfText).not.toContain("6. 영업권 (별지 제5쪽)");
  });
});

describe("[AN-P5-2] PDF 제5쪽 3열 col3 (산식·상수·ref)", () => {
  it("가 col3 산식 = (① × 3 + ② × 2 + ③) / 6", () => {
    expect(pdfText).toContain("(① × 3 + ② × 2 + ③) / 6");
  });
  it("자 col3 = 제2쪽 4. 순자산가액 「라」 기재", () => {
    expect(pdfText).toContain("제2쪽 4. 순자산가액 「라」 기재");
  });
  it("라 col3 10% · 바 col3 5년", () => {
    expect(pdfText).toContain("10%");
    expect(pdfText).toContain("5년");
  });
  it("라벨 inline 산식/구 ref 제거 (÷6·③×1·구 자 ref)", () => {
    expect(pdfText).not.toContain("÷ 6");
    expect(pdfText).not.toContain("③ ×1");
    expect(pdfText).not.toContain("→ 제2쪽 4.라 기재");
  });
});

describe("[AN-P5-3] PDF 제5쪽 공식 라벨", () => {
  it("① 평가기준일 이전 1년이 되는 사업연도 순손익액", () => {
    expect(pdfText).toContain("평가기준일 이전 1년이 되는 사업연도 순손익액");
  });
  it("아 공식 장문", () => {
    expect(pdfText).toContain("매입한 무체재산권가액 중 평가기준일까지");
  });
  it("사 n은 평가기준일부터의 경과연수", () => {
    expect(pdfText).toContain("n은 평가기준일부터의 경과연수");
  });
});

describe("[AN-P5-4] PDF 제5쪽 값 정합 (사례6 회귀)", () => {
  it("가 = 58,341,511", () => expect(pdfText).toContain("58,341,511"));
  it("다 = 489,351,700", () => expect(pdfText).toContain("489,351,700"));
  it("마 = 48,935,170", () => expect(pdfText).toContain("48,935,170"));
});

describe("[AN-P5-5] 화면 Page5GoodwillTable 금액 셀 위치 + testid", () => {
  const r = evaluateUnlistedStockV2(case6Input);

  it("p5-가 금액 셀(cells[len-2]) = 58,341,511 (3열 전환 → 금액=col2)", () => {
    render(
      <Page5GoodwillTable goodwill={r.goodwillCalculation} fiscalYearBreakdowns={r.fiscalYearBreakdowns} />,
    );
    const row = screen.getByTestId("p5-가");
    const cells = row.querySelectorAll("td");
    const amtCell = cells[cells.length - 2]; // col2 금액 (col3=산식이 last)
    const num = parseInt((amtCell?.textContent || "").replace(/[^0-9]/g, ""), 10);
    expect(num).toBe(58_341_511);
  });

  it("testid p5-가/p5-자 + 연도 보존(2023)", () => {
    render(
      <Page5GoodwillTable goodwill={r.goodwillCalculation} fiscalYearBreakdowns={r.fiscalYearBreakdowns} />,
    );
    expect(screen.getByTestId("p5-가")).toBeInTheDocument();
    expect(screen.getByTestId("p5-자")).toBeInTheDocument();
    // ① 행에 연도 annotation 보존
    expect(screen.getByTestId("p5-가-①")).toHaveTextContent("2023");
  });
});
