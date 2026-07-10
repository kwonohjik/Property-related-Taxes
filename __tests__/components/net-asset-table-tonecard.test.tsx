/**
 * @vitest-environment jsdom
 *
 * anchor: NetAssetCalculationTable(순자산가액 별지 2~3쪽, §55·§17의2) 섹션카드 → <ToneCard noDark> 전환(회귀 0).
 *   색상 ToneCard 점진 채택 13호. inheritance/unlisted-stock-v2 계열(dark:0).
 *
 * 제목 <p> 안에 LawArticleModal 2개가 인라인 → title prop을 fragment로 전달(원본 <p> 구조 그대로).
 * 카드 내부 입력·합계 로직은 기존 net-asset-calculation-table.test.tsx(NAC-1~3)가 커버 — 여기선 카드 구조만.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NetAssetCalculationTable } from "@/components/calc/inheritance/unlisted-stock-v2/NetAssetCalculationTable";
import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(cleanup);

const EMPTY: UnlistedNetAssetCalculation = {
  bsTotalAssets: 0, assetValuationDelta: 0, corpTaxReservedAmount: 0,
  paidInCapitalIncrease: 0, otherEarnedRights: 0, prepaidExpenses: 0,
  preGiftRetainedEarnings: 0, bsTotalLiabilities: 0, corporateTaxPayable: 0,
  farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0, retirementProvision: 0,
  otherProvision: 0, reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
};

describe("NetAssetCalculationTable <ToneCard> 전환 (회귀 0)", () => {
  it("violet 카드 + sectionNum 배지 + 제목 fragment(인라인 모달 §55·규§17의2) 보존 + noDark", () => {
    const { container } = render(
      <NetAssetCalculationTable netAssetValueRaw={EMPTY} onChange={() => {}} sectionNum={5} />,
    );
    // ToneCard 루트 = bg-violet-50/40 (goodwill 박스는 bg-violet-100/80 → 구분됨)
    const card = container.querySelector('[class*="bg-violet-50/40"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.className).toContain("border-violet-200");
    expect(card.className).toContain("rounded-lg");
    expect(card.className).not.toContain("dark:");

    // 헤더: 번호배지 + 제목 + 인라인 LawArticleModal 2개 보존
    const header = card.firstElementChild as HTMLElement; // flex items-center gap-2
    const badge = header.querySelector("span.rounded-full") as HTMLElement;
    expect(badge.textContent).toBe("5");
    expect(badge.className).toContain("bg-violet-200");
    expect(header.textContent).toContain("순자산가액 (별지 2~3쪽 + §55·§17의2)");
    expect(header.textContent).toContain("§55");
    expect(header.textContent).toContain("규§17의2");
  });
});
