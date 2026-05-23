/**
 * @vitest-environment jsdom
 *
 * PR-J — 비상장주식 평가서 PDF 다운로드 anchor (5건)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-besshi-pdf-export.plan.md §4
 *
 * J-1: UnlistedStockBesshiPdfDocument 컴포넌트 렌더 — 에러 없음
 * J-2: 다운로드 버튼 disabled (input 미완성)
 * J-3: generateBesshiPdfFilename — `비상장주식평가서_${corpName}_${YYYY-MM-DD}.pdf`
 * J-4: 영업권 자동배제 시 입력 변형 — 컴포넌트 렌더 통과
 * J-5: 다운로드 버튼 활성 (사례 6 완성 입력)
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  UnlistedStockBesshiPdfDocument,
  generateBesshiPdfFilename,
} from "@/lib/pdf/UnlistedStockBesshiPdfDocument";
import { UnlistedStockBesshiPdfDownloadButton } from "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockBesshiPdfDownloadButton";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(() => cleanup());

// next/dynamic는 jsdom에서 동기 로드 못함 — 사실상 disabled state로 떨어짐
// loading prop이 fallback으로 렌더됨

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

// ============================================================
// J-1: UnlistedStockBesshiPdfDocument 컴포넌트 렌더 — 에러 없음
// ============================================================

describe("[J-1] UnlistedStockBesshiPdfDocument 컴포넌트 렌더", () => {
  it("사례 6 입력으로 컴포넌트 생성 시 throw 없음", () => {
    // react-pdf는 React 트리만 반환 — 실제 PDF 바이너리 생성은 PDFDownloadLink 또는
    // renderToBuffer에서 수행. 본 anchor는 컴포넌트 자체가 throw 없이 트리 구성 가능한지만 검증.
    expect(() => {
      const tree = UnlistedStockBesshiPdfDocument({ input: case6Input });
      expect(tree).toBeTruthy();
    }).not.toThrow();
  });

  it("ownedShares=0인 경우에도 throw 없음 — Page1만 렌더", () => {
    const emptyInput: UnlistedStockValuationInput = { ...case6Input, ownedShares: 0 };
    expect(() => {
      UnlistedStockBesshiPdfDocument({ input: emptyInput });
    }).not.toThrow();
  });
});

// ============================================================
// J-2: 다운로드 버튼 disabled (input 미완성)
// ============================================================

describe("[J-2] 다운로드 버튼 disabled", () => {
  it("ownedShares=0 시 disabled 버튼 표시", () => {
    const emptyInput: UnlistedStockValuationInput = { ...case6Input, ownedShares: 0 };
    render(<UnlistedStockBesshiPdfDownloadButton input={emptyInput} />);
    expect(screen.getByTestId("unlisted-stock-pdf-download-button-disabled")).toBeInTheDocument();
  });

  it("corpName 빈 경우 disabled", () => {
    const emptyInput: UnlistedStockValuationInput = { ...case6Input, corpName: "" };
    render(<UnlistedStockBesshiPdfDownloadButton input={emptyInput} />);
    expect(screen.getByTestId("unlisted-stock-pdf-download-button-disabled")).toBeInTheDocument();
  });

  it("totalShares=0 시 disabled", () => {
    const emptyInput: UnlistedStockValuationInput = { ...case6Input, totalShares: 0 };
    render(<UnlistedStockBesshiPdfDownloadButton input={emptyInput} />);
    expect(screen.getByTestId("unlisted-stock-pdf-download-button-disabled")).toBeInTheDocument();
  });
});

// ============================================================
// J-3: generateBesshiPdfFilename
// ============================================================

describe("[J-3] generateBesshiPdfFilename", () => {
  it("사례 6 — 비상장주식평가서_㈜향기_2024-01-20.pdf", () => {
    expect(generateBesshiPdfFilename(case6Input)).toBe("비상장주식평가서_㈜향기_2024-01-20.pdf");
  });

  it("corpName 빈 경우 — 법인미입력 fallback", () => {
    const empty: UnlistedStockValuationInput = { ...case6Input, corpName: "" };
    expect(generateBesshiPdfFilename(empty)).toBe("비상장주식평가서_법인미입력_2024-01-20.pdf");
  });

  it("Windows 금지문자 / \\ : * ? < > | 치환", () => {
    const dirty: UnlistedStockValuationInput = { ...case6Input, corpName: "㈜A/B:C*D" };
    expect(generateBesshiPdfFilename(dirty)).toBe("비상장주식평가서_㈜A_B_C_D_2024-01-20.pdf");
  });
});

// ============================================================
// J-4: 영업권 자동배제 시 컴포넌트 렌더 통과
// ============================================================

describe("[J-4] 영업권 자동배제 시 렌더 통과", () => {
  it("isContinuousLossLastThreeYears=true (§55③ 3호) 시 throw 없음", () => {
    const input: UnlistedStockValuationInput = {
      ...case6Input,
      isContinuousLossLastThreeYears: true,
    };
    expect(() => {
      UnlistedStockBesshiPdfDocument({ input });
    }).not.toThrow();
  });

  it("netAssetOnlyReason='liquidation' (§54④ 1호) 시 throw 없음", () => {
    const input: UnlistedStockValuationInput = { ...case6Input, netAssetOnlyReason: "liquidation" };
    expect(() => {
      UnlistedStockBesshiPdfDocument({ input });
    }).not.toThrow();
  });
});

// ============================================================
// J-5: 다운로드 버튼 활성 (사례 6 완성 입력)
// ============================================================

describe("[J-5] 다운로드 버튼 활성 — 사례 6", () => {
  it("사례 6 입력 시 disabled 버튼 미표시 (next/dynamic loading fallback 표시)", () => {
    render(<UnlistedStockBesshiPdfDownloadButton input={case6Input} />);
    // jsdom + next/dynamic은 ssr:false dynamic import를 동기 로드 못함 —
    // loading fallback("로딩 중...")이 떨어지지만 disabled-by-input 버튼은 미표시.
    expect(screen.queryByTestId("unlisted-stock-pdf-download-button-disabled")).not.toBeInTheDocument();
    // 로딩 중 또는 활성 버튼 중 하나가 있어야 함
    const loadingFallback = screen.queryByText(/로딩 중/);
    const activeButton = screen.queryByTestId("unlisted-stock-pdf-download-button");
    expect(loadingFallback || activeButton).toBeTruthy();
  });
});
