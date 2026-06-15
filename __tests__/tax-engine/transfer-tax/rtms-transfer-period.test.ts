/**
 * RTMS 양도세 transfer 평가기간 — 취득일 전후 각 3개월 (§176의2③1호) (Part C / 공유 레이어)
 *
 * Plan: docs/01-plan/features/rtms-similar-sales-expansion.plan.md §5
 * 법령(KoreanLaw 2026-06-15): 소득세법 시행령 §176의2③1호 — 취득일 전후 각 3개월 이내 매매사례.
 *   상속(전후 6개월)·증여(전6~후3)와 달리 transfer 는 전후 각 3개월 + 신고일 절단(§49④) 미적용.
 */
import { describe, it, expect } from "vitest";

import {
  filterSimilarSales,
  type RtmsTradeRecord,
  type SimilarSalesFilterCriteria,
} from "@/lib/calc/rtms-similar-sales-filter";

function rec(over: Partial<RtmsTradeRecord> = {}): RtmsTradeRecord {
  return {
    aptName: "래미안아파트",
    aptNameNormalized: "래미안아파트",
    dealDate: "2024-06-10",
    exclusiveAreaM2: 84.87,
    dealAmountWon: 850_000_000,
    floor: 10,
    buildYear: 2003,
    jibun: "241",
    umdNm: "사직동",
    lawdCd: "11110",
    ...over,
  };
}

const transferCriteria: SimilarSalesFilterCriteria = {
  targetAptName: "래미안아파트",
  targetUmdNm: "사직동",
  targetExclusiveAreaM2: 84.87,
  valuationDate: new Date("2024-06-15"), // 취득일
  taxType: "transfer",
};

describe("[TR] 양도세 transfer 평가기간 — 취득일 전후 각 3개월 (§176의2③1호)", () => {
  it("TR-1: 취득일 전후 3개월 내 거래만 후보, ±3개월 초과는 제외", () => {
    const records = [
      rec({ dealDate: "2024-06-10" }), // 내 → 후보
      rec({ dealDate: "2024-03-20" }), // 전 3개월 내 → 후보
      rec({ dealDate: "2024-09-10" }), // 후 3개월 내 → 후보
      rec({ dealDate: "2024-02-28" }), // 전 3개월 초과 → 제외
      rec({ dealDate: "2024-10-01" }), // 후 3개월 초과 → 제외
    ];
    const r = filterSimilarSales(records, transferCriteria);
    const dates = r.candidates.map((c) => c.trade.dealDate).sort();
    expect(dates).toEqual(["2024-03-20", "2024-06-10", "2024-09-10"]);
    expect(r.appliedCriteria.periodStart).toBe("2024-03-15");
    expect(r.appliedCriteria.periodEnd).toBe("2024-09-15");
  });

  it("TR-2: transfer 는 신고일(reportDate) 절단 미적용 (§176의2③에 절단 규정 없음)", () => {
    const records = [rec({ dealDate: "2024-08-10" })]; // 신고일 이후지만 평가기간 내
    const r = filterSimilarSales(records, {
      ...transferCriteria,
      reportDate: new Date("2024-07-01"),
    });
    expect(r.candidates.length).toBe(1); // 절단 무시 → 후보 유지
    expect(r.appliedCriteria.periodEnd).toBe("2024-09-15"); // 신고일로 당겨지지 않음
  });
});
