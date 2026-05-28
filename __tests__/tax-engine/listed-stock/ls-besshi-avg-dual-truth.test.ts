/**
 * LS-AVG-DUAL-TRUTH — 갑지 ⑨ · 을지 종가평균 단일 진실 소스 정합 anchor.
 *
 * Plan: docs/00-pm/listed-stock-besshi-avg-dual-truth-fix.plan.md
 *
 * 증상 (이미지 14, 삼성전자 평가기준일 2022-07-06):
 *   - 갑지 ⑨ = 61,526원 (listedStockAvgPrice, twoMonthSurroundingAvg D 1회 산식 — 오답)
 *   - 을지 종가평균 = 61,465원 (splitTwoMonthSurroundingByMonthGroup D 양쪽 2회 — 정답)
 *   - 미리보기 "전후 2개월 종가 단순평균" = 61,526원 (오답)
 *
 * 본 PR 후: listedStockDailyGroupsInput.closingAverage 가 단일 진실 소스 (SSOT),
 *           갑지 ⑨ · listedStockAvgPrice 모두 closingAverage 값을 따름.
 *
 * § 산식 anchor 핵심: listedStockAvgPrice ≠ closingAverage 인 입력에서
 *   evaluateListedStock 의 closingAvg 출력이 closingAverage 를 우선 채택하는지 검증.
 */

import { describe, it, expect } from "vitest";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type {
  ListedStockMonthGroups,
  ListedStockDailyRow,
} from "@/lib/tax-engine/types/listed-stock-valuation.types";

/** anchor 단순화 — closingAverage·tradingDays·closingSum 만 의미 있는 fake groups. */
function makeFakeGroups(closingAverage: number, tradingDays = 84): ListedStockMonthGroups {
  const blankRow = (no: number, iso: string): ListedStockDailyRow => ({
    no,
    date: iso,
    monthDay: iso.slice(5),
    closing: null,
    label: "",
  });
  // beforeM1/M2·afterM1/M2 각 31행 (양식 정합, anchor는 closingAverage만 검증)
  const grp = (offset: number): ListedStockDailyRow[] =>
    Array.from({ length: 31 }, (_, k) => blankRow(k + 1, `2022-07-${String(6 + offset + k).padStart(2, "0")}`));
  return {
    beforeM1: grp(0),
    beforeM2: grp(0),
    afterM1: grp(0),
    afterM2: grp(0),
    beforeSubtotal: 0,
    afterSubtotal: 0,
    tradingDays,
    closingSum: closingAverage * tradingDays,
    closingAverage,
  };
}

const BASE_ITEM: EstateItem = {
  id: "ls-avg-dual-truth-base",
  category: "listed_stock",
  name: "삼성전자 (이미지 14)",
  listedStockShares: 100,
  listedStockCode: "005930",
  isMaxShareholder: false,
  companySize: "small",
  stockClass: "common",
  companyName: "삼성전자",
};

describe("LS-AVG-DUAL-TRUTH 갑지 ⑨ · 을지 SSOT 정합 (이미지 14)", () => {
  it("AC-1 자동조회 모드: closingAverage(을지) 가 listedStockAvgPrice(오답) 보다 우선", () => {
    // 이미지 14 정합: 을지 결과 61,465 / 잘못된 average 61,526
    const groups = makeFakeGroups(61_465, 84);
    const item: EstateItem = {
      ...BASE_ITEM,
      listedStockAvgPrice: 61_526, // 잘못된 D 1회 산식 결과
      listedStockDailyGroupsInput: groups, // D 양쪽 카운트 정답 (을지)
    };
    const result = evaluateListedStock(item, { valuationDate: "2022-07-06" });
    expect(result.besshiData?.page1Values.closingAvg).toBe(61_465);
    expect(result.besshiData?.page2.closingAverage).toBe(61_465);
  });

  it("AC-2 §63③ 할증 20% (대기업·최대주주): ⑩ = floor(61,465 × 1.2) = 73,758", () => {
    const groups = makeFakeGroups(61_465, 84);
    const result = evaluateListedStock(
      {
        ...BASE_ITEM,
        listedStockAvgPrice: 61_526,
        listedStockDailyGroupsInput: groups,
        isMaxShareholder: true,
        companySize: "large",
        premiumExclusionReason: "none",
      },
      { valuationDate: "2022-07-06" },
    );
    expect(result.besshiData?.page1Values.majorShareholderRate).toBe(0.2);
    expect(result.besshiData?.page1Values.perShareMajorShareholder).toBe(73_758);
  });

  it("AC-4 breakdown ⑨ amount = 61,465 (SSOT 정합)", () => {
    const groups = makeFakeGroups(61_465, 84);
    const result = evaluateListedStock(
      {
        ...BASE_ITEM,
        listedStockAvgPrice: 61_526,
        listedStockDailyGroupsInput: groups,
      },
      { valuationDate: "2022-07-06" },
    );
    const step9 = result.breakdown.find((b) => b.label.startsWith("⑨"));
    expect(step9?.amount).toBe(61_465);
  });

  it("AC-5 수동 입력 모드 (groups.tradingDays === 0): listedStockAvgPrice fallback", () => {
    // 자동조회 미사용 — 사용자가 평균만 직접 입력
    const result = evaluateListedStock(
      {
        ...BASE_ITEM,
        listedStockAvgPrice: 70_000, // 직접 입력
        // listedStockDailyGroupsInput 미전달
      },
      { valuationDate: "2022-07-06" },
    );
    expect(result.besshiData?.page1Values.closingAvg).toBe(70_000);
    expect(result.besshiData?.page1Values.perShareMajorShareholder).toBe(70_000);
  });

  it("AC-5b 0-trap 방지: EMPTY_LISTED_STOCK_MONTH_GROUPS (closingAverage=0) 입력 시에도 fallback", () => {
    // 만약 ?? 패턴이면 closingAverage=0 ?? avgPrice = 0 → 갑지 ⑨ = 0 (버그)
    // tradingDays > 0 가드면 closingAverage 무시하고 avgPrice 사용 → 70,000 정답
    const emptyGroups = makeFakeGroups(0, 0);
    const result = evaluateListedStock(
      {
        ...BASE_ITEM,
        listedStockAvgPrice: 70_000,
        listedStockDailyGroupsInput: emptyGroups,
      },
      { valuationDate: "2022-07-06" },
    );
    expect(result.besshiData?.page1Values.closingAvg).toBe(70_000);
  });

  it("AC-7 §63②3호 분기: closingAvg → applyCapitalIncreaseShareValuation 정합", () => {
    const groups = makeFakeGroups(61_465, 84);
    const result = evaluateListedStock(
      {
        ...BASE_ITEM,
        listedStockAvgPrice: 61_526,
        listedStockDailyGroupsInput: groups,
        isCapitalIncreaseUnlistedShare: true,
        capitalIncreaseDate: "2022-06-15",
        faceValuePerShare: 5000,
        priorDividendRate: 0.05,
        dividendBaseDate: "2022-01-01",
        dividendBaseDateSameAsListed: true,
        listedStockDividendDifference: 0,
      },
      { valuationDate: "2022-07-06" },
    );
    // 배당기산일 동일 → ⑮=0, ⑯=⑨=61,465, ⑰=⑯×100%=61,465
    expect(result.besshiData?.page1Values.closingAvg).toBe(61_465);
    expect(result.besshiData?.page1Values.perShareValue).toBe(61_465);
    expect(result.besshiData?.page1Values.perShareMajorShareholderUnlisted).toBe(61_465);
    const step9 = result.breakdown.find((b) => b.label.startsWith("⑨"));
    expect(step9?.amount).toBe(61_465);
  });
});
