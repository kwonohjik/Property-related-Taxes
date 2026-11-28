/**
 * @vitest-environment jsdom
 *
 * U-10 ⑤ — 사업개시일 기준 §54④2호 파생 ToneCard · 사업개시일 미입력 경고 (CorporateInfoSection).
 * 엔진과 같은 헬퍼·같은 평가기준일 fallback(상속개시일·증여일)을 쓰는지 본다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { CorporateInfoSection } from "@/components/calc/inheritance/unlisted-stock-v2/CorporateInfoSection";
import type { CorporateInfoSectionProps } from "@/components/calc/inheritance/unlisted-stock-v2/CorporateInfoSection";
import { Page1CoverSection } from "@/components/calc/inheritance/unlisted-stock-v2/besshi/Page1CoverSection";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(() => cleanup());

const props = (patch: Partial<CorporateInfoSectionProps>): CorporateInfoSectionProps => ({
  corpName: "㈜신설",
  faceValuePerShare: 5_000,
  totalShares: 10_000,
  ownedShares: 5_000,
  isRealEstateHeavy: false,
  isMaxShareholder: false,
  companySize: "large",
  isContinuousLossLastThreeYears: false,
  capitalChanges: [],
  onCapitalChangesChange: () => {},
  onChange: () => {},
  ...patch,
});

describe("U-10 ⑤ CorporateInfoSection", () => {
  it("3년 미만(개시 2023-03-01 · 평가기준일 fallback 2025-06-30) → 자동 2호 카드 · 만료일 2026-03-01", () => {
    render(
      <CorporateInfoSection
        {...props({ businessStartDate: new Date("2023-03-01"), evaluationDateFallback: "2025-06-30" })}
      />,
    );
    const notice = screen.getByTestId("unlisted-v2-business-period-notice");
    expect(notice.textContent).toContain("2026-03-01");
    expect(notice.textContent).toContain("가·나목");
  });

  it("3년 이상(2026-03-02) → 카드 없음", () => {
    render(
      <CorporateInfoSection
        {...props({ businessStartDate: new Date("2023-03-01"), evaluationDate: new Date("2026-03-02") })}
      />,
    );
    expect(screen.queryByTestId("unlisted-v2-business-period-notice")).toBeNull();
  });

  it("사업개시일 미입력 → 「사업개시일을 입력해야 합니다.」 경고 · 카드 없음", () => {
    render(<CorporateInfoSection {...props({ evaluationDate: new Date("2025-06-30") })} />);
    expect(screen.getByText("사업개시일을 입력해야 합니다.")).toBeTruthy();
    expect(screen.queryByTestId("unlisted-v2-business-period-notice")).toBeNull();
  });
});

describe("U-10 ⑦ 별지 제1쪽 [v] — 자동 2호면 「나」 행 체크", () => {
  it("사용자 사유 6호 + 사업개시 2023-03-01 · 평가기준일 2025-06-30 → 나·바 모두 [v] (종전 바만)", () => {
    const input: UnlistedStockValuationInput = {
      corpName: "㈜신설",
      businessStartDate: new Date("2023-03-01"),
      evaluationDate: new Date("2025-06-30"),
      faceValuePerShare: 5_000,
      totalShares: 10_000,
      ownedShares: 5_000,
      isRealEstateHeavy: false,
      netAssetOnlyReason: "remaining_3y",
      fiscalYears: [
        { fiscalYearLabel: "2024", fiscalYearEndDate: new Date("2024-12-31"), taxableIncome: 500_000_000 },
        { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 300_000_000 },
        { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 0 },
      ],
      capitalChanges: [],
      netAssetValueRaw: {
        bsTotalAssets: 1_000_000_000, assetValuationDelta: 0,
        corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
        prepaidExpenses: 0, preGiftRetainedEarnings: 0,
        bsTotalLiabilities: 0, corporateTaxPayable: 0,
        farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0,
        retirementProvision: 0, otherProvision: 0,
        reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
      },
      isContinuousLossLastThreeYears: false,
      capitalizationRate: 0.10,
      isMaxShareholder: false,
      companySize: "large",
    };
    const result = evaluateUnlistedStockV2(input);
    expect(result.section54_4_2ByBusinessStart?.status).toBe("under_3y");
    render(<Page1CoverSection input={input} result={result} />);
    expect(screen.getByTestId("p1-2-나").textContent).toContain("[v]");
    expect(screen.getByTestId("p1-2-바").textContent).toContain("[v]");
  });
});
