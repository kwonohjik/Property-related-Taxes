/**
 * 상속개시자료 요약 4표 — anchor 회귀.
 *
 * 계획서: docs/00-pm/inheritance-source-data-summary-tables.plan.md §4
 * 디자인: docs/02-design/features/inheritance-source-data-summary.ui.design.md §6
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EstateAllocationTable } from "@/components/calc/results/source-summary/EstateAllocationTable";
import { DebtAllocationTable } from "@/components/calc/results/source-summary/DebtAllocationTable";
import { PriorGiftSummaryTable } from "@/components/calc/results/source-summary/PriorGiftSummaryTable";
import {
  formatIncurredDate,
  resolveValuationLabel,
} from "@/components/calc/results/source-summary/source-summary-helpers";
import type {
  EstateItem,
  Heir,
  DebtItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-prior-gift.types";

afterEach(() => cleanup());

const heirs: Heir[] = [
  { id: "spouse", relation: "spouse", name: "배우자" },
  { id: "son1", relation: "child", name: "장남" },
  { id: "son2", relation: "child", name: "차남" },
  { id: "legatee", relation: "legatee", name: "수유자" },
];

describe("Table A — EstateAllocationTable", () => {
  it("U-1: 예금 첫 행 1,100,000,000 → 배우자", () => {
    const items: EstateItem[] = [
      {
        id: "deposit1",
        category: "financial",
        name: "○○은행",
        marketValue: 1_100_000_000,
        heirAllocations: [{ heirId: "spouse", amount: 1_100_000_000 }],
      },
    ];
    render(<EstateAllocationTable estateItems={items} heirs={heirs} />);
    const cells = screen.getAllByText(/1,100,000,000/);
    expect(cells.length).toBeGreaterThanOrEqual(2); // 평가금액 + 배우자
  });

  it("U-3: 합계 행 = 6,680,000,000 (모범답안 anchor)", () => {
    const items: EstateItem[] = [
      // 예금 2,100M
      {
        id: "d1",
        category: "financial",
        name: "○○은행",
        marketValue: 1_100_000_000,
        heirAllocations: [{ heirId: "spouse", amount: 1_100_000_000 }],
      },
      {
        id: "d2",
        category: "financial",
        name: "○○저축은행",
        marketValue: 1_000_000_000,
        heirAllocations: [
          { heirId: "son1", amount: 500_000_000 },
          { heirId: "legatee", amount: 500_000_000 },
        ],
      },
      // 부동산 3,530M (단순화 1건)
      {
        id: "re1",
        category: "real_estate_apartment",
        name: "강남구 아파트 외",
        marketValue: 3_530_000_000,
        heirAllocations: [
          { heirId: "spouse", amount: 1_650_000_000 },
          { heirId: "son1", amount: 450_000_000 },
          { heirId: "son2", amount: 1_430_000_000 },
        ],
      },
      // 주식 650M
      {
        id: "s1",
        category: "listed_stock",
        name: "H사",
        marketValue: 150_000_000,
        heirAllocations: [{ heirId: "spouse", amount: 150_000_000 }],
      },
      {
        id: "s2",
        category: "unlisted_stock",
        name: "M사",
        marketValue: 500_000_000,
        heirAllocations: [{ heirId: "son2", amount: 500_000_000 }],
      },
      // 기타 400M
      {
        id: "o1",
        category: "other",
        name: "기타자산",
        marketValue: 400_000_000,
        heirAllocations: [{ heirId: "spouse", amount: 400_000_000 }],
      },
    ];
    render(<EstateAllocationTable estateItems={items} heirs={heirs} />);
    // 합계 6,680,000,000
    expect(screen.getByText(/6,680,000,000/)).toBeTruthy();
  });
});

describe("Helpers — valuationMethod fallback", () => {
  it("U-12: undefined + marketValue>0 → 시가", () => {
    const item: EstateItem = {
      id: "x",
      category: "financial",
      name: "test",
      marketValue: 100,
    };
    expect(resolveValuationLabel(item)).toBe("시가");
  });

  it("U-13: standard_price 명시 → 기준시가", () => {
    const item: EstateItem = {
      id: "x",
      category: "real_estate_land",
      name: "test",
      valuationMethod: "standard_price",
      standardPrice: 100,
    };
    expect(resolveValuationLabel(item)).toBe("기준시가");
  });

  it("appraisal 명시 → 감정가액", () => {
    const item: EstateItem = {
      id: "x",
      category: "real_estate_building",
      name: "test",
      valuationMethod: "appraisal",
      appraisedValue: 100,
    };
    expect(resolveValuationLabel(item)).toBe("감정가액");
  });

  it("similar_sales 명시 → 매매사례가액", () => {
    const item: EstateItem = {
      id: "x",
      category: "real_estate_apartment",
      name: "test",
      valuationMethod: "similar_sales",
      marketValue: 100,
    };
    expect(resolveValuationLabel(item)).toBe("매매사례가액");
  });
});

describe("Helpers — formatIncurredDate (U-14)", () => {
  it("'2021-06-20' → '2021.6.20. 발생'", () => {
    expect(formatIncurredDate("2021-06-20")).toBe("2021.6.20. 발생");
  });

  it("'2018-05-10' → '2018.5.10. 발생'", () => {
    expect(formatIncurredDate("2018-05-10")).toBe("2018.5.10. 발생");
  });

  it("undefined → ''", () => {
    expect(formatIncurredDate(undefined)).toBe("");
  });
});

describe("Table C — DebtAllocationTable", () => {
  it("U-8·U-9: 금융채무 + 합계 (모범답안 1,215,000,000)", () => {
    const debts: DebtItem[] = [
      {
        id: "d1",
        category: "financial",
        name: "K은행",
        amount: 400_000_000,
        incurredDate: "2021-06-20",
        creditorAddress: "강남구 역삼동",
        heirAllocations: [{ heirId: "son1", amount: 400_000_000 }],
      },
      {
        id: "d2",
        category: "financial",
        name: "S저축은행",
        amount: 745_000_000,
        incurredDate: "2018-05-10",
        heirAllocations: [
          { heirId: "spouse", amount: 500_000_000 },
          { heirId: "son2", amount: 245_000_000 },
        ],
      },
      {
        id: "d3",
        category: "tax",
        name: "종합소득세 등",
        amount: 55_000_000,
        heirAllocations: [{ heirId: "son2", amount: 55_000_000 }],
      },
      {
        id: "d4",
        category: "funeral",
        name: "S장례식장",
        amount: 10_000_000,
        heirAllocations: [{ heirId: "spouse", amount: 10_000_000 }],
      },
      {
        id: "d5",
        category: "funeral",
        name: "**공원묘지",
        amount: 5_000_000,
        isBongan: true,
        heirAllocations: [{ heirId: "spouse", amount: 5_000_000 }],
      },
    ];
    render(<DebtAllocationTable debtItems={debts} heirs={heirs} />);
    expect(screen.getByText(/1,215,000,000/)).toBeTruthy(); // 합계
    expect(screen.getByText(/1,145,000,000/)).toBeTruthy(); // 금융채무 소계
    expect(screen.getByText(/2021\.6\.20\. 발생/)).toBeTruthy();
  });
});

describe("Table D — PriorGiftSummaryTable", () => {
  it("U-10·U-11: 영리법인 라벨 + 산출세액 소계 592,000,000", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2021-08-10",
        isHeir: false,
        beneficiaryType: "corporate",
        propertyCategory: "other",
        propertyName: "대여금",
        propertyLocation: "M사 채무면제",
        giftAmount: 700_000_000,
        giftTaxPaid: 0,
        giftTaxBase: 700_000_000,
        computedTax: 150_000_000,
      },
      {
        giftDate: "2022-06-10",
        isHeir: false,
        beneficiaryType: "heir",
        doneeRelation: "spouse",
        propertyCategory: "cash",
        propertyName: "현금증여",
        giftAmount: 760_000_000,
        giftTaxPaid: 22_000_000,
        giftTaxBase: 160_000_000,
        computedTax: 22_000_000,
      },
      {
        giftDate: "2018-08-20",
        isHeir: true,
        beneficiaryType: "heir",
        doneeRelation: "lineal_descendant",
        propertyCategory: "real_estate_building",
        propertyName: "상가및부속토지",
        propertyLocation: "강남구 삼성동",
        giftAmount: 1_500_000_000,
        giftTaxPaid: 420_000_000,
        giftTaxBase: 1_450_000_000,
        computedTax: 420_000_000,
      },
    ];
    render(<PriorGiftSummaryTable priorGifts={gifts} />);
    expect(screen.getByText(/영리법인/)).toBeTruthy();
    expect(screen.getByText(/592,000,000/)).toBeTruthy(); // 산출세액 소계
    expect(screen.getByText(/2,960,000,000/)).toBeTruthy(); // 증여재산가액 소계
  });
});
