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

describe("U-10 F ⑤ — 사용자 사유와 2호가 겹칠 때 문구·영업권 라벨 (엔진과 같은 기준)", () => {
  const start = new Date("2023-03-01");
  const notice = (patch: Partial<CorporateInfoSectionProps>) => {
    render(<CorporateInfoSection {...props({ businessStartDate: start, ...patch })} />);
    return screen.getByTestId("unlisted-v2-business-period-notice").textContent ?? "";
  };

  it("6호 → 「단서 판정 없이」 문구 아님 · 둘 다 무조건 · 영업권 라벨 §55③2호", () => {
    const t = notice({ netAssetOnlyReason: "remaining_3y", evaluationDate: new Date("2025-06-30") });
    expect(t).toContain("선택한 순자산가치 사유(6호)와 2호가 함께 해당 — 둘 다 무조건 순자산가치");
    expect(t).not.toContain("단서 판정 없이");
    expect(t).toContain("영업권 합산 안 함(상증령 §55 ③ 2호)");
  });

  it("5호 + 평가기준일 2026-02-27(단서 시행) → 2호 우선 · 단서 판정 없이", () => {
    const t = notice({ netAssetOnlyReason: "stock_holding_80", evaluationDate: new Date("2026-02-27") });
    expect(t).toContain("2호 우선(5호 단서 판정 없이 순자산가치)");
    expect(t).toContain("영업권 합산 안 함(상증령 §55 ③ 2호)");
    expect(t).toContain("가·나목");
  });

  it("3호 + 평가기준일 2025-06-30(단서 신설 전) → 단서 없음 문구 · 영업권 라벨 §55③1호 · 2호 가·나목 고지 없음", () => {
    const t = notice({ netAssetOnlyReason: "real_estate_80", evaluationDate: new Date("2025-06-30") });
    expect(t).toContain("평가기준일이 2026.2.27. 전이라 3호 단서가 없어 어느 쪽이든 순자산가치");
    expect(t).not.toContain("단서 판정 없이");
    expect(t).toContain("영업권 합산 안 함(상증령 §55 ③ 1호)");
    expect(t).not.toContain("가·나목");
  });

  it("1호(청산) → 영업권 라벨 §55③1호 (엔진 excludedByLaw liquidation과 같다)", () => {
    const t = notice({ netAssetOnlyReason: "liquidation", evaluationDate: new Date("2025-06-30") });
    expect(t).toContain("영업권 합산 안 함(상증령 §55 ③ 1호)");
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
