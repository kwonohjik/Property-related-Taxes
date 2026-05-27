/**
 * @vitest-environment jsdom
 *
 * 비상장주식 V2 정식평가 — 섹션 번호 순차(1~9) 검증 anchor
 *
 * Plan: docs/00-pm/inheritance-unlisted-v2-section-numbering.plan.md
 *
 * 화면 렌더 순서대로 원형 번호 badge가 1,2,3,4,5,6,7,8,9로 매겨지는지 검증.
 * (이전: 1,2,3,4,5,7,10,(없음),6 으로 어긋나 있었음)
 *
 * 번호 부여 섹션 9개:
 *   1 평가대상 비상장법인 / 2 최대주주 할증평가 §63③ (CorporateInfoSection 내부)
 *   3 사업연도별 순손익액 / 4 평가차액 / 5 순자산가액 / 6 영업권
 *   7 §22② 금융재산공제 배제 / 8 §54⑥ 평가심의위원회 / 9 1주당 가액 결과
 * 번호 제외: 자본금 변동(§1 임베드)·§54⑥ 하위 결과·안내 카드·별지 PDF 출력
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useState } from "react";
import { UnlistedStockV2Card } from "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(() => cleanup());

// §6 영업권·§9 결과는 totalShares>0 && ownedShares>0일 때만 렌더 → 유효 입력 사용
const validInput: UnlistedStockValuationInput = {
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

/** 섹션 번호 badge = rounded-full + select-none span 중 텍스트가 한 자리 숫자인 것 (cellNum ①②·라벨 제외) */
function collectSectionBadges(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("span"))
    .filter((el) => {
      const cls = el.className ?? "";
      return cls.includes("rounded-full") && cls.includes("select-none");
    })
    .map((el) => (el.textContent ?? "").trim())
    .filter((t) => /^[1-9]$/.test(t));
}

describe("[SN] 비상장주식 V2 섹션 번호 순차", () => {
  it("SN-1: 화면 렌더 순서대로 badge가 1~9 순차로 매겨진다", () => {
    const { container } = render(<Harness initial={validInput} />);
    const badges = collectSectionBadges(container);
    expect(badges).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("SN-2: 중복·누락 없이 정확히 9개", () => {
    const { container } = render(<Harness initial={validInput} />);
    const badges = collectSectionBadges(container);
    expect(badges).toHaveLength(9);
    expect(new Set(badges).size).toBe(9);
  });

  it("SN-3: §54⑥ 평가심의위원회(8)는 OFF 상태에서도 badge 표시 (항상 렌더)", () => {
    const { container } = render(<Harness initial={validInput} />);
    // evaluationCommittee 미입력(OFF) → 그래도 §8 badge 존재
    const badges = collectSectionBadges(container);
    expect(badges).toContain("8");
  });
});
