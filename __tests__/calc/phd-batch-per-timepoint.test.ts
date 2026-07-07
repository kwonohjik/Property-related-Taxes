import { describe, it, expect } from "vitest";
import { computePhdThreePointStdPrice, type PhdBatchInput } from "@/lib/calc/phd-building-std-batch";

/**
 * Pre-Do gold anchor — 3시점 시점별 구조·용도 (용도지수 체계 매핑).
 * 계획서: docs/02-design/features/phd-batch-per-timepoint-structure-usage.plan.md
 *
 * 홈택스 실측(시멘트블록조·단독주택·신축1966·취득1999·최초공시2005·양도2026·면적115):
 *  - 취득당시(1999) = 5,520,000 × 1.095 = 6,044,400  (2001 체계 단독=#1, 지수 1.0)
 *  - 최초공시(2005) = 3,220,000                        (2005 체계 단독=#2)
 *  - 양도당시(2026) = 10,235,000                       (현행 체계 단독=#2)
 *
 * 핵심: 취득(2001)은 현행 #2가 아닌 2001 체계 #1을 써야 홈택스와 일치.
 */
describe("PHD 3시점 시점별 구조·용도 — 홈택스 gold anchor", () => {
  it("단독주택 3시점: 취득 6,044,400 / 최초공시 3,220,000 / 양도 10,235,000", () => {
    const input: PhdBatchInput = {
      building: {
        builtYear: 1966,
        parts: [
          {
            floorArea: 115,
            category: "housing",
            acquisition: { structureKey: "cement_block", usageNo: 1 }, // 2001 체계 단독+아파트
            firstDisclosure: { structureKey: "cement_block", usageNo: 2 }, // 2005 체계 단독
            transfer: { structureKey: "cement_block", usageNo: 2 }, // 현행 단독
          },
        ],
      },
      acquisition: { year: 1999, landPricePerM2: 930_000 },
      firstDisclosure: { year: 2005, landPricePerM2: 1_470_000 },
      transfer: { year: 2026, landPricePerM2: 2_548_000 },
    };
    const r = computePhdThreePointStdPrice(input);
    expect(r.acquisition?.housing).toBe(6_044_400);
    expect(r.firstDisclosure?.housing).toBe(3_220_000);
    expect(r.transfer?.housing).toBe(10_235_000);
    expect(r.unsupported).toEqual([]);
  });

  it("회귀: 시점별 구조 상이(취득 시멘트블록 / 양도 시멘트벽돌·와이어패널) 독립 산출", () => {
    // 홈택스가 취득·양도 구조를 별도로 받는 것과 동형. 구조키가 달라도 각 시점 독립 계산.
    const input: PhdBatchInput = {
      building: {
        builtYear: 1966,
        parts: [
          {
            floorArea: 115,
            category: "housing",
            acquisition: { structureKey: "cement_block", usageNo: 1 },
            transfer: { structureKey: "cement_brick", usageNo: 2 },
          },
        ],
      },
      acquisition: { year: 1999, landPricePerM2: 930_000 },
      transfer: { year: 2026, landPricePerM2: 2_548_000 },
    };
    const r = computePhdThreePointStdPrice(input);
    expect(r.acquisition?.housing).toBe(6_044_400);
    expect(r.transfer?.housing).toBeGreaterThan(0);
  });
});
