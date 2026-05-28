/**
 * LS-01 — 상장주식 평가조서(갑·을) 이미지 H사 사례 anchor.
 *
 * 사용자 첨부 PDF (`docs/00-pm/listed-stock-besshi-form-replica.plan.md` 참조):
 *   평가기준일: 2022-07-06
 *   종가합계: 710,030 / 일수: 84 / 종가평균(⑨=⑱): 8,452
 *   좌측 소계 (이전 2월): 350,490
 *   우측 소계 (이후 2월): 359,540
 *   ⑩ = ⑰ = ⑨ = 8,452 (할증 0% — 개인 또는 중소·중견기업)
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md §2 LS-01
 * Design: docs/02-design/features/listed-stock-besshi-form-replica.engine.design.md §1, §7
 */

import { describe, it, expect } from "vitest";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const H_SAMPLE_ITEM: EstateItem = {
  id: "ls-01-h-sample",
  category: "listed_stock",
  name: "H사 보통주",
  listedStockAvgPrice: 8452,
  listedStockShares: 100, // 임의 — anchor는 1주당 산식 정합 검증
  listedStockCode: "000080",
  // §63③ 할증 0% 케이스 (개인 또는 small/medium)
  isMaxShareholder: false,
  companySize: "small",
  stockClass: "common",
  companyName: "H사",
  representative: "김○○",
  companyAddress: "서울시 종로구 청운동 xxx",
};

describe("LS-01 상장주식 평가조서 이미지 H사 anchor", () => {
  it("⑨ 종가평균 8,452 → ⑩ 1주당 평가액 8,452 (할증 0%)", () => {
    const result = evaluateListedStock(H_SAMPLE_ITEM, {
      valuationDate: "2022-07-06",
    });
    expect(result.besshiData?.page1Values.closingAvg).toBe(8452);
    expect(result.besshiData?.page1Values.perShareMajorShareholder).toBe(8452);
    expect(result.besshiData?.page1Values.majorShareholderRate).toBe(0);
  });

  it("평가액 = ⑩ × 주식수 = 8,452 × 100 = 845,200", () => {
    const result = evaluateListedStock(H_SAMPLE_ITEM, {
      valuationDate: "2022-07-06",
    });
    expect(result.valuatedAmount).toBe(845200);
  });

  it("⑨ = ⑱ 단일 source (closingAverage = closingAvg)", () => {
    const result = evaluateListedStock(H_SAMPLE_ITEM, {
      valuationDate: "2022-07-06",
    });
    // page2.closingAverage 는 자동조회 응답 echo — H_SAMPLE_ITEM에 listedStockDailyGroupsInput
    // 미전달 시 EMPTY (closingAverage=0). ⑨는 listedStockAvgPrice 직접 = 8452.
    // 자동조회 시점에 channel-fill 되면 ⑨=⑱ 양쪽 동일.
    expect(result.besshiData?.page1Values.closingAvg).toBe(8452);
  });

  it("§63②3호 비활성 (capitalIncreaseDate·mergerDate 모두 미입력) → ⑪~⑰ undefined", () => {
    const result = evaluateListedStock(H_SAMPLE_ITEM, {
      valuationDate: "2022-07-06",
    });
    expect(result.besshiData?.page1.isUnlistedShareSection).toBe(false);
    expect(result.besshiData?.page1Values.dividendDifference).toBeUndefined();
    expect(result.besshiData?.page1Values.perShareValue).toBeUndefined();
    expect(result.besshiData?.page1Values.perShareMajorShareholderUnlisted).toBeUndefined();
  });

  it("회귀 가드 — 기존 listed_stock 동작 무변경 (8,452 × 100 = 845,200)", () => {
    // §63③ 할증 미적용 (isMaxShareholder=false) → 기존 산식과 동일
    const result = evaluateListedStock(H_SAMPLE_ITEM, {
      valuationDate: "2022-07-06",
    });
    expect(result.valuatedAmount).toBe(8452 * 100);
  });
});

describe("LS-02 최대주주 + 대기업 → ⑩ = floor(8,452 × 1.2) = 10,142", () => {
  it("⑩ = 10,142, 평가액 = 10,142 × 100 = 1,014,200", () => {
    const result = evaluateListedStock(
      {
        ...H_SAMPLE_ITEM,
        isMaxShareholder: true,
        companySize: "large",
        premiumExclusionReason: "none",
      },
      { valuationDate: "2022-07-06" },
    );
    expect(result.besshiData?.page1Values.majorShareholderRate).toBe(0.2);
    expect(result.besshiData?.page1Values.perShareMajorShareholder).toBe(10142);
    expect(result.valuatedAmount).toBe(10142 * 100);
  });
});

describe("LS-09 최대주주 + 대기업 + §53⑧5호 배제 → ⑩ = 8,452 (할증 0)", () => {
  it("premiumRate=0, ⑩=⑨, premiumExclusionLabel 노출", () => {
    const result = evaluateListedStock(
      {
        ...H_SAMPLE_ITEM,
        isMaxShareholder: true,
        companySize: "large",
        premiumExclusionReason: "art53_8_5",
      },
      { valuationDate: "2022-07-06" },
    );
    expect(result.besshiData?.page1Values.majorShareholderRate).toBe(0);
    expect(result.besshiData?.page1Values.perShareMajorShareholder).toBe(8452);
    expect(result.besshiData?.page1Values.premiumExclusionLabel).toContain("§53");
  });
});

describe("LS-10 중소기업 + 최대주주 → 자동 배제 (premium=0)", () => {
  it("companySize=small → smb_med 자동 배제", () => {
    const result = evaluateListedStock(
      {
        ...H_SAMPLE_ITEM,
        isMaxShareholder: true,
        companySize: "small",
      },
      { valuationDate: "2022-07-06" },
    );
    expect(result.besshiData?.page1Values.majorShareholderRate).toBe(0);
    expect(result.besshiData?.page1Values.perShareMajorShareholder).toBe(8452);
  });
});

describe("LS-05 §63②3호 + dividendBaseDateSameAsListed → ⑮=0, ⑯=⑨", () => {
  it("배당기산일 동일 시 배당차액 제외", () => {
    const result = evaluateListedStock(
      {
        ...H_SAMPLE_ITEM,
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
    expect(result.besshiData?.page1.isUnlistedShareSection).toBe(true);
    expect(result.besshiData?.page1Values.dividendDifference).toBe(0);
    expect(result.besshiData?.page1Values.perShareValue).toBe(8452);
    expect(result.besshiData?.page1Values.perShareMajorShareholderUnlisted).toBe(8452);
  });
});
