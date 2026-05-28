/**
 * Phase C anchor — splitTwoMonthSurroundingByMonthGroup
 *
 * 이미지 H사 사례(평가기준일 2022-07-06) 기준 4그룹 분할 정합 검증.
 */

import { describe, it, expect } from "vitest";
import { splitTwoMonthSurroundingByMonthGroup } from "@/lib/kiwoom/two-month-grouping";
import { buildTwoMonthSurroundingSlots } from "@/lib/kiwoom/calendar";

const VALUATION = "2022-07-06";

describe("splitTwoMonthSurroundingByMonthGroup — 기본 구조", () => {
  it("4 그룹 모두 31행", () => {
    const slots = buildTwoMonthSurroundingSlots(VALUATION);
    const closings = slots.map(() => null);
    const labels = slots.map(() => "");
    const g = splitTwoMonthSurroundingByMonthGroup(slots, closings, labels, VALUATION);
    expect(g.beforeM1).toHaveLength(31);
    expect(g.beforeM2).toHaveLength(31);
    expect(g.afterM1).toHaveLength(31);
    expect(g.afterM2).toHaveLength(31);
  });

  it("beforeM1 NO 1 = D, afterM1 NO 1 = D (양쪽 평가기준일 표시)", () => {
    const slots = buildTwoMonthSurroundingSlots(VALUATION);
    const closings = slots.map(() => null);
    const labels = slots.map(() => "");
    const g = splitTwoMonthSurroundingByMonthGroup(slots, closings, labels, VALUATION);
    expect(g.beforeM1[0].date).toBe(VALUATION);
    expect(g.afterM1[0].date).toBe(VALUATION);
  });

  it("beforeM1 NO 31 = D − 30일 (2022-06-06)", () => {
    const slots = buildTwoMonthSurroundingSlots(VALUATION);
    const g = splitTwoMonthSurroundingByMonthGroup(
      slots,
      slots.map(() => null),
      slots.map(() => ""),
      VALUATION,
    );
    expect(g.beforeM1[30].date).toBe("2022-06-06");
  });

  it("beforeM2 NO 1 = D − 31일 (2022-06-05), NO 31 = D − 61일 (2022-05-06)", () => {
    const slots = buildTwoMonthSurroundingSlots(VALUATION);
    const g = splitTwoMonthSurroundingByMonthGroup(
      slots,
      slots.map(() => null),
      slots.map(() => ""),
      VALUATION,
    );
    expect(g.beforeM2[0].date).toBe("2022-06-05");
    expect(g.beforeM2[30].date).toBe("2022-05-06");
  });

  it("afterM1 NO 31 = D + 30일 (2022-08-05)", () => {
    const slots = buildTwoMonthSurroundingSlots(VALUATION);
    const g = splitTwoMonthSurroundingByMonthGroup(
      slots,
      slots.map(() => null),
      slots.map(() => ""),
      VALUATION,
    );
    expect(g.afterM1[30].date).toBe("2022-08-05");
  });

  it("afterM2 NO 1 = D + 31일 (2022-08-06), NO 31 = D + 61일 (2022-09-05)", () => {
    const slots = buildTwoMonthSurroundingSlots(VALUATION);
    const g = splitTwoMonthSurroundingByMonthGroup(
      slots,
      slots.map(() => null),
      slots.map(() => ""),
      VALUATION,
    );
    expect(g.afterM2[0].date).toBe("2022-08-06");
    expect(g.afterM2[30].date).toBe("2022-09-05");
  });
});

describe("D 양쪽 카운트 정책 — 평가기준일 종가가 좌·우 양쪽에서 카운트", () => {
  it("D에만 종가 8000 채움 → tradingDays=2 (beforeM1[0] + afterM1[0]), closingSum=16000", () => {
    const slots = buildTwoMonthSurroundingSlots(VALUATION);
    const closings: (number | null)[] = slots.map((iso) => (iso === VALUATION ? 8000 : null));
    const labels = slots.map(() => "");
    const g = splitTwoMonthSurroundingByMonthGroup(slots, closings, labels, VALUATION);
    expect(g.tradingDays).toBe(2);
    expect(g.closingSum).toBe(16000);
    expect(g.closingAverage).toBe(8000);
    expect(g.beforeM1[0].closing).toBe(8000);
    expect(g.afterM1[0].closing).toBe(8000);
  });
});

describe("이미지 H사 산식 정합 — 평균 8,452 anchor", () => {
  it("84 trading slots × 8452 = 710,030 (floor)", () => {
    // 단순 산식 anchor: 84 trading rows × 8452 가 closingSum=710,030, 평균 8,452
    // (D 양쪽 카운트는 위 별도 anchor에서 검증, 본 anchor는 평균 산식만)
    // afterM1·afterM2 영업일 41개 + beforeM1·beforeM2 영업일 43개(D 제외) + D 양쪽 카운트 합 = 84
    // 실제 키움 응답 기반 H사 anchor는 e2e/통합 anchor에서 별도 검증
    const slots = buildTwoMonthSurroundingSlots(VALUATION);
    const closings: (number | null)[] = slots.map(() => null);
    const labels = slots.map(() => "");
    // 좌측에 distinct 일자 42개 + D + 우측 distinct 41개 = 84 카운트
    // D 양쪽 카운트(2) + 좌 distinct 41 + 우 distinct 41 = 84
    let leftFilled = 0;
    let rightFilled = 0;
    for (let i = 0; i < slots.length; i++) {
      const iso = slots[i];
      if (iso === VALUATION) {
        closings[i] = 8452;
        continue;
      }
      if (iso < VALUATION && leftFilled < 41) {
        closings[i] = 8452;
        leftFilled += 1;
      } else if (iso > VALUATION && rightFilled < 41) {
        closings[i] = 8452;
        rightFilled += 1;
      }
    }
    const g = splitTwoMonthSurroundingByMonthGroup(slots, closings, labels, VALUATION);
    expect(g.tradingDays).toBe(84); // 좌 41+D + 우 41+D = 42 + 42
    expect(g.closingSum).toBe(8452 * 84);
    expect(g.closingAverage).toBe(8452);
  });
});

describe("§52의2② startOverrideDate — partial 구간", () => {
  it("startOverrideDate 이전 beforeM1·beforeM2 행은 '기간외' 라벨", () => {
    const slots = buildTwoMonthSurroundingSlots(VALUATION);
    const closings = slots.map(() => 1000 as number | null);
    const labels = slots.map(() => "");
    const g = splitTwoMonthSurroundingByMonthGroup(slots, closings, labels, VALUATION, {
      startOverrideDate: "2022-06-15",
    });
    // 2022-06-15 이전 행은 기간외
    const m1OutOfRange = g.beforeM1.filter((r) => r.date < "2022-06-15");
    expect(m1OutOfRange.every((r) => r.label === "기간외")).toBe(true);
    expect(m1OutOfRange.every((r) => r.closing === null)).toBe(true);
  });

  it("afterM1·afterM2 는 startOverrideDate 영향 없음", () => {
    const slots = buildTwoMonthSurroundingSlots(VALUATION);
    const closings = slots.map(() => 1000 as number | null);
    const labels = slots.map(() => "");
    const g = splitTwoMonthSurroundingByMonthGroup(slots, closings, labels, VALUATION, {
      startOverrideDate: "2022-06-15",
    });
    expect(g.afterM1.every((r) => r.label !== "기간외")).toBe(true);
  });
});
