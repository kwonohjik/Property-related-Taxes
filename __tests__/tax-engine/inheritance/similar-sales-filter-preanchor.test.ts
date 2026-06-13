/**
 * Pre-Do anchor — RTMS 유사매매사례가액 필터 핵심 산식 검증
 *
 * 목적: filterSimilarSales() 구현 전 면적 ±5% 경계·해제거래 제외·신고일 절단의
 *       설계 가정을 먼저 검증. 실패 시 설계 환류.
 *
 * anchor 선정 근거:
 *   PA-1: 면적 ±5% 경계 (84.87㎡ 기준, 89.09 통과 / 89.19 제외) — 필터 핵심 산식
 *   PA-2: 해제거래 cdealType="O" 제외 (P8) — 법적 필수 요건
 *   PA-3: 신고일 절단 (P7) — 상증령 §49④ 괄호
 *
 * 파일 위치: __tests__/tax-engine/inheritance/similar-sales-filter-preanchor.test.ts
 * 본 파일은 Pre-Do 전용. 전체 anchor는 similar-sales-filter.test.ts로 확장.
 */

import { describe, it, expect } from "vitest";
import {
  filterSimilarSales,
  type RtmsTradeRecord,
  type SimilarSalesFilterCriteria,
} from "@/lib/calc/rtms-similar-sales-filter";

// ──────────────────────────────────────────────────
// 기본 거래 레코드 팩토리
// ──────────────────────────────────────────────────

function makeRecord(over: Partial<RtmsTradeRecord> = {}): RtmsTradeRecord {
  return {
    aptName: "래미안아파트",
    aptNameNormalized: "래미안아파트",
    dealDate: "2024-04-10",
    exclusiveAreaM2: 84.87,
    dealAmountWon: 850_000_000,
    floor: 10,
    buildYear: 2003,
    jibun: "241",
    umdNm: "사직동",
    lawdCd: "11110",
    cdealType: undefined,
    cdealDay: undefined,
    dealingType: undefined,
    ...over,
  };
}

const baseCriteria: SimilarSalesFilterCriteria = {
  targetAptName: "래미안아파트",
  targetUmdNm: "사직동",
  targetExclusiveAreaM2: 84.87,
  valuationDate: new Date("2024-06-15"),
  taxType: "inheritance",
  reportDate: undefined,
};

// ──────────────────────────────────────────────────
// PA-1: 면적 ±5% 경계
// 대상 84.87㎡, 5% = 4.2435
//   89.09: |89.09 - 84.87| / 84.87 × 100 = 4.22/84.87 × 100 = 4.9727...% < 5% → 통과
//   89.19: |89.19 - 84.87| / 84.87 × 100 = 4.32/84.87 × 100 = 5.0900...% > 5% → 제외
// ──────────────────────────────────────────────────

describe("PA-1: 면적 ±5% 경계 (84.87㎡ 기준)", () => {
  it("89.09㎡ → 4.97% < 5% → 통과", () => {
    const result = filterSimilarSales(
      [makeRecord({ exclusiveAreaM2: 89.09 })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].trade.exclusiveAreaM2).toBe(89.09);
  });

  it("89.19㎡ → 5.09% > 5% → 제외", () => {
    const result = filterSimilarSales(
      [makeRecord({ exclusiveAreaM2: 89.19 })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("정확히 5.00%인 경우 → 통과 (≤ 5%)", () => {
    // 84.87 × 1.05 = 89.1135. 정확히 5% → 통과
    const exactFivePct = 84.87 * 1.05; // 89.1135
    const result = filterSimilarSales(
      [makeRecord({ exclusiveAreaM2: exactFivePct })],
      baseCriteria,
    );
    // |89.1135 - 84.87| / 84.87 × 100 = 4.2435/84.87 × 100 = 5.0% ≤ 5 → 통과
    expect(result.candidates).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────
// PA-2: 해제거래 cdealType="O" 제외 (P8)
// ──────────────────────────────────────────────────

describe('PA-2: 해제거래 cdealType="O" 제외 (상증령 §49①1호가목 준용)', () => {
  it('cdealType="O" 해제거래 → 제외', () => {
    const result = filterSimilarSales(
      [makeRecord({ cdealType: "O" })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("cdealType 없음 (정상 거래) → 포함", () => {
    const result = filterSimilarSales(
      [makeRecord({ cdealType: undefined })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
  });

  it('cdealType="" (빈 문자열, 정상거래) → 포함', () => {
    const result = filterSimilarSales(
      [makeRecord({ cdealType: "" })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────
// PA-3: 신고일 절단 (P7) — 상증령 §49④ 괄호
// 기준일 2024-06-15, 상속(후 6개월 = 2024-12-15)
// reportDate=2024-09-01 → 후 상한이 2024-09-01로 절단
// ──────────────────────────────────────────────────

describe("PA-3: 신고일 절단 — 상증령 §49④", () => {
  it("신고일(2024-09-01) 이후 거래(2024-10-01) → 제외", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-10-01" })],
      { ...baseCriteria, reportDate: new Date("2024-09-01") },
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("신고일(2024-09-01) 이전 거래(2024-08-15) → 포함", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-08-15" })],
      { ...baseCriteria, reportDate: new Date("2024-09-01") },
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("reportDate 미입력 시 전체 기간(상속 후 6개월 = 2024-12-15)까지 포함", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-11-20" })],
      { ...baseCriteria, reportDate: undefined },
    );
    expect(result.candidates).toHaveLength(1);
  });
});
