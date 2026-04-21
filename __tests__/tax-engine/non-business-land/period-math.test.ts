/**
 * Phase B-2 유닛 테스트 — period-math.ts
 */
import { describe, it, expect } from "vitest";
import {
  mergeOverlappingPeriods,
  sumDaysInWindow,
  getOverlappingPeriods,
  invertPeriods,
  getOwnershipStart,
} from "@/lib/tax-engine/non-business-land/utils/period-math";

const d = (iso: string) => new Date(iso);

describe("mergeOverlappingPeriods", () => {
  it("겹치는 두 구간을 하나로 병합", () => {
    const merged = mergeOverlappingPeriods([
      { start: d("2020-01-01"), end: d("2020-06-30") },
      { start: d("2020-05-01"), end: d("2020-12-31") },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString().slice(0, 10)).toBe("2020-01-01");
    expect(merged[0].end.toISOString().slice(0, 10)).toBe("2020-12-31");
  });

  it("인접 구간 (end===start) 병합", () => {
    const merged = mergeOverlappingPeriods([
      { start: d("2020-01-01"), end: d("2020-06-01") },
      { start: d("2020-06-01"), end: d("2020-12-01") },
    ]);
    expect(merged).toHaveLength(1);
  });

  it("분리된 구간은 그대로 유지", () => {
    const merged = mergeOverlappingPeriods([
      { start: d("2020-01-01"), end: d("2020-06-01") },
      { start: d("2020-08-01"), end: d("2020-12-01") },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("빈 배열 → 빈 배열", () => {
    expect(mergeOverlappingPeriods([])).toEqual([]);
  });

  it("start>=end 무효 구간 필터", () => {
    const merged = mergeOverlappingPeriods([
      { start: d("2020-06-01"), end: d("2020-06-01") },
      { start: d("2020-07-01"), end: d("2020-06-01") },
    ]);
    expect(merged).toEqual([]);
  });
});

describe("sumDaysInWindow", () => {
  it("창 안의 기간 일수 합산", () => {
    const periods = [
      { start: d("2020-01-01"), end: d("2020-04-01") }, // 91일
      { start: d("2020-07-01"), end: d("2020-10-01") }, // 92일
    ];
    expect(sumDaysInWindow(periods, d("2020-01-01"), d("2020-12-31"))).toBe(91 + 92);
  });

  it("창 밖은 클립", () => {
    const periods = [{ start: d("2019-06-01"), end: d("2020-06-01") }];
    // 창: 2020-01-01 ~ 2020-12-31 → 2020-01-01 ~ 2020-06-01 = ~152일
    const days = sumDaysInWindow(periods, d("2020-01-01"), d("2020-12-31"));
    expect(days).toBeGreaterThan(150);
    expect(days).toBeLessThan(155);
  });
});

describe("getOverlappingPeriods", () => {
  it("재촌 × 자경 교집합 계산", () => {
    const residence = [{ start: d("2019-01-01"), end: d("2023-01-01") }]; // 4년 거주
    const farming = [{ start: d("2021-01-01"), end: d("2025-01-01") }]; // 4년 자경
    const overlap = getOverlappingPeriods(residence, farming);
    expect(overlap).toHaveLength(1);
    expect(overlap[0].start.toISOString().slice(0, 10)).toBe("2021-01-01");
    expect(overlap[0].end.toISOString().slice(0, 10)).toBe("2023-01-01");
  });

  it("교집합 없으면 빈 배열", () => {
    const a = [{ start: d("2019-01-01"), end: d("2020-01-01") }];
    const b = [{ start: d("2021-01-01"), end: d("2022-01-01") }];
    expect(getOverlappingPeriods(a, b)).toEqual([]);
  });

  it("여러 구간 × 여러 구간 교집합 병합", () => {
    const a = [
      { start: d("2019-01-01"), end: d("2020-01-01") },
      { start: d("2021-01-01"), end: d("2022-01-01") },
    ];
    const b = [{ start: d("2019-06-01"), end: d("2021-06-01") }];
    const overlap = getOverlappingPeriods(a, b);
    expect(overlap).toHaveLength(2);
  });
});

describe("invertPeriods", () => {
  it("별장 사용기간의 역기간 = 비사용기간", () => {
    const use = [{ start: d("2020-06-01"), end: d("2020-09-01") }];
    const inverted = invertPeriods(use, d("2020-01-01"), d("2020-12-31"));
    expect(inverted).toHaveLength(2);
    expect(inverted[0].end.toISOString().slice(0, 10)).toBe("2020-06-01");
    expect(inverted[1].start.toISOString().slice(0, 10)).toBe("2020-09-01");
  });

  it("사용기간 없으면 전 기간이 비사용", () => {
    const inverted = invertPeriods([], d("2020-01-01"), d("2020-12-31"));
    expect(inverted).toHaveLength(1);
  });

  it("boundingStart ≥ boundingEnd → 빈 배열", () => {
    expect(invertPeriods([], d("2020-12-31"), d("2020-01-01"))).toEqual([]);
  });
});

describe("getOwnershipStart", () => {
  it("취득일 다음날을 반환 (초일불산입)", () => {
    const acq = d("2020-01-01");
    const start = getOwnershipStart(acq);
    expect(start.toISOString().slice(0, 10)).toBe("2020-01-02");
    // 원본 불변 확인
    expect(acq.toISOString().slice(0, 10)).toBe("2020-01-01");
  });
});
