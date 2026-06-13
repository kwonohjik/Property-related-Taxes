/**
 * RTMS 유사매매사례가액 순수 필터 — 전체 anchor 테스트
 *
 * 법령: 상증령 §49①·②·④, 시행규칙 §15③1호
 * 설계: docs/01-plan/features/inheritance-similar-sales-rtms-lookup.plan.md §9~§11
 *
 * anchor 목록:
 *   T-1: 기본 — 후보 1건 (상속, 면적 정확일치)
 *   T-2: 후보 0건 — 기간 외 거래 (상속 전 6개월+1일 초과)
 *   T-3: 후보 다건 — 가장 가까운 날 + 등거리 평균 (P10)
 *   T-4: 면적 ±5% 경계값 (89.09㎡ 통과 / 89.19㎡ 제외)
 *   T-5: 단지명 정규화 (공백 차이 일치)
 *   T-6: 거래금액 만원→원 환산 (parseDealAmountWon)
 *   T-7: 전용면적 미입력 경고 + 면적 필터 skip
 *   T-8: 증여세 평가기간 (후 3개월 제한)
 *   T-9: 해제거래 cdealType="O" 제외 (P8)
 *   T-10: 신고일 절단 (P7) — 상증령 §49④
 *   T-11: umdNm 읍면동 매칭 (P3)
 *   T-12: 등거리(전·후 동일 일수) 전체 평균 (P10)
 *   T-13: 직거래 경고 (P9)
 *   T-14: outOfPeriod 참고 반환
 */

import { describe, it, expect } from "vitest";
import {
  filterSimilarSales,
  parseDealAmountWon,
  normalizeAptName,
  type RtmsTradeRecord,
  type SimilarSalesFilterCriteria,
} from "@/lib/calc/rtms-similar-sales-filter";

// ──────────────────────────────────────────────────
// 헬퍼
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
// T-1: 기본 — 후보 1건 (상속, 면적 정확일치)
// ──────────────────────────────────────────────────

describe("T-1: 기본 — 후보 1건 (상속)", () => {
  it("평가기간 내 단일 거래 → candidates 1건, recommendedValue = 거래가", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-04-10", dealAmountWon: 850_000_000 })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.recommendedValue).toBe(850_000_000);
    expect(result.candidates[0].isRecommended).toBe(true);
    expect(result.stdPriceFilterApplied).toBe(false);
  });

  it("appliedCriteria periodStart = 기준일 -6개월", () => {
    const result = filterSimilarSales(
      [makeRecord()],
      baseCriteria,
    );
    // 2024-06-15 기준 상속 -6개월 = 2024-12-15 → addMonths로 정확히
    expect(result.appliedCriteria.periodStart).toBe("2023-12-15");
    expect(result.appliedCriteria.periodEnd).toBe("2024-12-15");
  });
});

// ──────────────────────────────────────────────────
// T-2: 후보 0건 — 기간 외 거래
// ──────────────────────────────────────────────────

describe("T-2: 후보 0건 — 기간 외 거래", () => {
  it("사망일 2024-06-15, -7개월 거래(2023-11-15) → 0건", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2023-11-15" })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.recommendedValue).toBeNull();
    expect(result.warnings.some((w) => w.includes("유사 매매사례가 없습니다"))).toBe(true);
  });

  it("기간 내 거래와 기간 외 거래 혼재 → 기간 내만 candidates, 기간 외는 outOfPeriod", () => {
    const result = filterSimilarSales(
      [
        makeRecord({ dealDate: "2024-04-10", dealAmountWon: 850_000_000 }), // 기간 내
        makeRecord({ dealDate: "2023-11-15", dealAmountWon: 800_000_000 }), // 기간 외
      ],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.outOfPeriod).toHaveLength(1);
    expect(result.outOfPeriod[0].trade.dealDate).toBe("2023-11-15");
  });
});

// ──────────────────────────────────────────────────
// T-3: 후보 다건 — 가장 가까운 날 + 평균 (§49②)
// ──────────────────────────────────────────────────

describe("T-3: 다건 — 가장 가까운 날 1건", () => {
  it("가장 가까운 날 1건이면 그 거래가 = recommendedValue", () => {
    const result = filterSimilarSales(
      [
        makeRecord({ dealDate: "2024-06-10", dealAmountWon: 850_000_000 }), // 5일 전
        makeRecord({ dealDate: "2024-05-01", dealAmountWon: 800_000_000 }), // 45일 전
      ],
      baseCriteria,
    );
    // 가장 가까운 날 = 2024-06-10 (5일)
    expect(result.recommendedValue).toBe(850_000_000);
    expect(result.candidates[0].isRecommended).toBe(true);
    expect(result.candidates[1].isRecommended).toBe(false);
  });
});

describe("T-3b: 동일 날짜 2건 → 평균 (§49② '가액이 둘 이상인 경우 평균액')", () => {
  it("동일 날짜 2건 평균 = Math.floor 적용", () => {
    // 850M + 860M = 1710M / 2 = 855M (정수)
    const result = filterSimilarSales(
      [
        makeRecord({ dealDate: "2024-06-10", dealAmountWon: 850_000_000 }),
        makeRecord({ dealDate: "2024-06-10", dealAmountWon: 860_000_000 }),
        makeRecord({ dealDate: "2024-05-01", dealAmountWon: 800_000_000 }),
      ],
      baseCriteria,
    );
    expect(result.recommendedValue).toBe(
      Math.floor((850_000_000 + 860_000_000) / 2),
    );
    // = 855_000_000
    expect(result.recommendedValue).toBe(855_000_000);
    // 2건이 isRecommended, 1건은 not
    const recommended = result.candidates.filter((c) => c.isRecommended);
    expect(recommended).toHaveLength(2);
  });

  it("평균 홀수로 나눌 때 Math.floor 적용 (원 미만 절사)", () => {
    // 901M + 900M + 899M = 2700M / 3 = 900M (정수이므로 floor 무효)
    // 다른 케이스: 100+101 = 201 / 2 = 100.5 → floor = 100
    const result = filterSimilarSales(
      [
        makeRecord({ dealDate: "2024-06-10", dealAmountWon: 100 }),
        makeRecord({ dealDate: "2024-06-10", dealAmountWon: 101 }),
      ],
      baseCriteria,
    );
    expect(result.recommendedValue).toBe(100); // floor(201/2) = floor(100.5) = 100
  });
});

// ──────────────────────────────────────────────────
// T-4: 면적 ±5% 경계값 (시행규칙 §15③1호나목)
// 84.87㎡ 기준:
//   89.09: |89.09-84.87|/84.87 × 100 = 4.22/84.87 × 100 ≈ 4.97% < 5 → 통과
//   89.19: |89.19-84.87|/84.87 × 100 = 4.32/84.87 × 100 ≈ 5.09% > 5 → 제외
// ──────────────────────────────────────────────────

describe("T-4: 면적 ±5% 경계값 (§15③1호나목)", () => {
  it("89.09㎡ → ≈4.97% < 5% → 통과", () => {
    const result = filterSimilarSales(
      [makeRecord({ exclusiveAreaM2: 89.09 })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("89.19㎡ → ≈5.09% > 5% → 제외", () => {
    const result = filterSimilarSales(
      [makeRecord({ exclusiveAreaM2: 89.19 })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("하한 경계: 80.63㎡ (≈4.99%) → 통과", () => {
    // 84.87 × 0.95 = 80.6265, |80.63 - 84.87| / 84.87 × 100 = 4.24/84.87 × 100 ≈ 4.996%
    const result = filterSimilarSales(
      [makeRecord({ exclusiveAreaM2: 80.63 })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("하한 초과: 80.50㎡ (≈5.14%) → 제외", () => {
    const result = filterSimilarSales(
      [makeRecord({ exclusiveAreaM2: 80.50 })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("areaDiffRatePct가 결과에 포함됨", () => {
    const result = filterSimilarSales(
      [makeRecord({ exclusiveAreaM2: 89.09 })],
      baseCriteria,
    );
    const pct = result.candidates[0].areaDiffRatePct;
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(5);
  });
});

// ──────────────────────────────────────────────────
// T-5: 단지명 정규화
// ──────────────────────────────────────────────────

describe("T-5: 단지명 정규화 (§15③1호가목)", () => {
  it("공백 차이('래미안 아파트' vs '래미안아파트') → 일치", () => {
    const result = filterSimilarSales(
      [makeRecord({ aptName: "래미안 아파트" })],
      { ...baseCriteria, targetAptName: "래미안아파트" },
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("소문자 차이 → 일치 (소문자 정규화)", () => {
    const result = filterSimilarSales(
      [makeRecord({ aptName: "래미안APT" })],
      { ...baseCriteria, targetAptName: "래미안apt" },
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("단지명 불일치 → 제외", () => {
    const result = filterSimilarSales(
      [makeRecord({ aptName: "힐스테이트아파트" })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("normalizeAptName: 괄호·하이픈·점 제거", () => {
    expect(normalizeAptName("래미안(2차)-아파트.")).toBe("래미안2차아파트");
  });
});

// ──────────────────────────────────────────────────
// T-6: 거래금액 만원→원 환산 (parseDealAmountWon)
// ──────────────────────────────────────────────────

describe("T-6: 거래금액 만원→원 환산", () => {
  it('"85,000" → 850_000_000', () => {
    expect(parseDealAmountWon("85,000")).toBe(850_000_000);
  });

  it('"100000" (쉼표 없음) → 1_000_000_000', () => {
    expect(parseDealAmountWon("100000")).toBe(1_000_000_000);
  });

  it('"0" → 0 (필터 제외 대상)', () => {
    expect(parseDealAmountWon("0")).toBe(0);
  });

  it('"-1,000" (음수) → 0', () => {
    expect(parseDealAmountWon("-1,000")).toBe(0);
  });

  it('"abc" (비숫자) → 0', () => {
    expect(parseDealAmountWon("abc")).toBe(0);
  });
});

// ──────────────────────────────────────────────────
// T-7: 전용면적 미입력 → 경고 + 면적 필터 skip
// ──────────────────────────────────────────────────

describe("T-7: 전용면적 미입력", () => {
  it("targetExclusiveAreaM2=undefined → 경고 포함 + 거래 포함", () => {
    const result = filterSimilarSales(
      [makeRecord({ exclusiveAreaM2: 200 })], // 크게 다른 면적이어도
      { ...baseCriteria, targetExclusiveAreaM2: undefined },
    );
    // 면적 필터 skip → 포함
    expect(result.candidates).toHaveLength(1);
    expect(
      result.warnings.some((w) => w.includes("면적 ±5% 필터 미적용")),
    ).toBe(true);
  });

  it("areaMin=0, areaMax=Infinity (면적 미입력 시)", () => {
    const result = filterSimilarSales(
      [makeRecord()],
      { ...baseCriteria, targetExclusiveAreaM2: undefined },
    );
    expect(result.appliedCriteria.areaMin).toBe(0);
    expect(result.appliedCriteria.areaMax).toBe(Infinity);
  });
});

// ──────────────────────────────────────────────────
// T-8: 증여세 평가기간 (후 3개월)
// ──────────────────────────────────────────────────

describe("T-8: 증여세 평가기간 (전 6개월~후 3개월)", () => {
  const giftCriteria: SimilarSalesFilterCriteria = {
    ...baseCriteria,
    taxType: "gift",
    valuationDate: new Date("2024-06-15"),
  };

  it("후 3개월(2024-09-15) 이내 거래 → 포함", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-08-10" })],
      giftCriteria,
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("후 4개월(2024-10-20) 거래 → 제외 (증여 후 3개월 초과)", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-10-20" })],
      giftCriteria,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("상속 후 4개월(2024-10-20) 거래 → 포함 (상속은 후 6개월)", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-10-20" })],
      { ...baseCriteria, taxType: "inheritance" },
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("periodEnd = 증여 기준일 + 3개월", () => {
    const result = filterSimilarSales(
      [makeRecord()],
      giftCriteria,
    );
    expect(result.appliedCriteria.periodEnd).toBe("2024-09-15");
  });
});

// ──────────────────────────────────────────────────
// T-9: 해제거래 cdealType="O" 제외 (P8)
// ──────────────────────────────────────────────────

describe('T-9: 해제거래 cdealType="O" 제외 (상증령 §49①1호가목 준용)', () => {
  it('cdealType="O" → 제외', () => {
    const result = filterSimilarSales(
      [makeRecord({ cdealType: "O" })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it('cdealType=undefined (정상 거래) → 포함', () => {
    const result = filterSimilarSales(
      [makeRecord({ cdealType: undefined })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
  });

  it('cdealType="" (빈 문자열, 정상 거래) → 포함', () => {
    const result = filterSimilarSales(
      [makeRecord({ cdealType: "" })],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("해제거래 제외 후 나머지 정상 거래는 포함", () => {
    const result = filterSimilarSales(
      [
        makeRecord({ cdealType: "O", dealAmountWon: 900_000_000 }),
        makeRecord({ cdealType: undefined, dealAmountWon: 850_000_000 }),
      ],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.recommendedValue).toBe(850_000_000);
  });
});

// ──────────────────────────────────────────────────
// T-10: 신고일 절단 (P7) — 상증령 §49④
// ──────────────────────────────────────────────────

describe("T-10: 신고일 절단 (상증령 §49④)", () => {
  it("신고일(2024-09-01) 이전 거래(2024-08-15) → 포함", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-08-15" })],
      { ...baseCriteria, reportDate: new Date("2024-09-01") },
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("신고일(2024-09-01) 이후 거래(2024-10-01) → 제외", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-10-01" })],
      { ...baseCriteria, reportDate: new Date("2024-09-01") },
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("신고일이 평가기간 상한(2024-12-15)보다 늦으면 → 기간 상한 유지", () => {
    // 신고일(2025-03-15) > 기간 상한(2024-12-15) → 상한은 기간 상한 유지
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-11-20" })],
      { ...baseCriteria, reportDate: new Date("2025-03-15") },
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.appliedCriteria.periodEnd).toBe("2024-12-15");
  });

  it("reportDate 미입력 → 전체 기간(상속 후 6개월)까지 포함", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealDate: "2024-11-20" })],
      { ...baseCriteria, reportDate: undefined },
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("신고일 절단으로 periodEnd가 단축됨", () => {
    const result = filterSimilarSales(
      [makeRecord()],
      { ...baseCriteria, reportDate: new Date("2024-09-01") },
    );
    expect(result.appliedCriteria.periodEnd).toBe("2024-09-01");
  });
});

// ──────────────────────────────────────────────────
// T-11: umdNm 읍면동 매칭 (P3)
// ──────────────────────────────────────────────────

describe("T-11: umdNm 읍면동 매칭 (P3)", () => {
  it("umdNm 일치 → 포함", () => {
    const result = filterSimilarSales(
      [makeRecord({ umdNm: "사직동" })],
      { ...baseCriteria, targetUmdNm: "사직동" },
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("umdNm 불일치 → 제외 (같은 단지명이어도)", () => {
    const result = filterSimilarSales(
      [makeRecord({ umdNm: "효자동" })], // 다른 동
      { ...baseCriteria, targetAptName: "래미안아파트", targetUmdNm: "사직동" },
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("targetUmdNm 미입력 → umdNm 필터 skip (적용 안 함)", () => {
    const result = filterSimilarSales(
      [makeRecord({ umdNm: "효자동" })],
      { ...baseCriteria, targetUmdNm: undefined },
    );
    expect(result.candidates).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────
// T-12: 등거리(전·후 동일 일수) 전체 평균 (P10)
// 평가기준일 2024-06-15
//   전 5일: 2024-06-10 → daysFromValuationDate = 5
//   후 5일: 2024-06-20 → daysFromValuationDate = 5
//   → 등거리 → 두 거래 모두 추천군 → 평균
// ──────────────────────────────────────────────────

describe("T-12: 등거리(전·후 동일 일수) 전체 평균 (P10 — §49②)", () => {
  it("기준일 전 5일 + 후 5일 거래 → 등거리 평균", () => {
    const result = filterSimilarSales(
      [
        makeRecord({ dealDate: "2024-06-10", dealAmountWon: 840_000_000 }), // 전 5일
        makeRecord({ dealDate: "2024-06-20", dealAmountWon: 860_000_000 }), // 후 5일
      ],
      baseCriteria,
    );
    // 두 거래 모두 daysFromValuationDate = 5 → 등거리 → 평균
    const expected = Math.floor((840_000_000 + 860_000_000) / 2);
    expect(result.recommendedValue).toBe(expected); // 850_000_000
    const recommended = result.candidates.filter((c) => c.isRecommended);
    expect(recommended).toHaveLength(2);
  });

  it("등거리가 아닌 경우 가장 가까운 날 1건만 추천", () => {
    const result = filterSimilarSales(
      [
        makeRecord({ dealDate: "2024-06-10", dealAmountWon: 840_000_000 }), // 전 5일
        makeRecord({ dealDate: "2024-06-08", dealAmountWon: 820_000_000 }), // 전 7일
      ],
      baseCriteria,
    );
    // 5일 < 7일 → 5일 거래만 추천
    expect(result.recommendedValue).toBe(840_000_000);
    const recommended = result.candidates.filter((c) => c.isRecommended);
    expect(recommended).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────
// T-13: 직거래 경고 (P9 — dealingType 보존)
// ──────────────────────────────────────────────────

describe("T-13: 직거래 경고 (P9)", () => {
  it("직거래 포함 시 경고 메시지 추가", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealingType: "직거래" })],
      baseCriteria,
    );
    expect(
      result.warnings.some((w) => w.includes("직거래")),
    ).toBe(true);
  });

  it("중개거래만 있으면 직거래 경고 없음", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealingType: "중개거래" })],
      baseCriteria,
    );
    expect(
      result.warnings.some((w) => w.includes("직거래") && w.includes("건 포함")),
    ).toBe(false);
  });

  it("dealingType이 candidates trade에 보존됨", () => {
    const result = filterSimilarSales(
      [makeRecord({ dealingType: "직거래" })],
      baseCriteria,
    );
    expect(result.candidates[0].trade.dealingType).toBe("직거래");
  });
});

// ──────────────────────────────────────────────────
// T-14: outOfPeriod 참고 반환
// ──────────────────────────────────────────────────

describe("T-14: outOfPeriod 참고 반환", () => {
  it("기간 외 거래는 outOfPeriod에 포함 (단지명·면적 통과 필요)", () => {
    const result = filterSimilarSales(
      [
        makeRecord({ dealDate: "2024-04-10" }),  // 기간 내
        makeRecord({ dealDate: "2023-09-01" }),  // 기간 외 (전 9개월)
      ],
      baseCriteria,
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.outOfPeriod).toHaveLength(1);
    expect(result.outOfPeriod[0].isWithinPeriod).toBe(false);
  });

  it("단지명 불일치 기간 외 거래 → outOfPeriod에도 미포함 (단지 필터 선적용)", () => {
    const result = filterSimilarSales(
      [makeRecord({ aptName: "다른단지", dealDate: "2023-09-01" })],
      baseCriteria,
    );
    expect(result.outOfPeriod).toHaveLength(0);
  });
});
