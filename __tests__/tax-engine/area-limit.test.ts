/**
 * area-limit.ts — 면적 한도 비교·초과 면적 단일 헬퍼 (NBL2611-V9-I · R11)
 *
 * 부동소수 곱 `100.1 × 3 = 300.29999999999995`이 «한도와 정확히 같은 토지»를 뒤집는 부류를 정수(마이크로㎡)로 막는다.
 */
import { describe, it, expect } from "vitest";
import {
  areaRatio4,
  areaTimes,
  fromAreaMicro,
  isAreaAtMost,
  isAreaOver,
  judgeAreaLimit,
  minArea,
  snapArea,
  subtractAreas,
  sumAreas,
  toAreaMicro,
} from "@/lib/tax-engine/area-limit";
import { round2 } from "@/lib/tax-engine/area-utils";

describe("정수 변환", () => {
  it("toAreaMicro · fromAreaMicro 왕복은 소수 2자리 면적을 그대로 돌려준다", () => {
    expect(toAreaMicro(300.3)).toBe(300_300_000);
    expect(fromAreaMicro(300_300_000)).toBe(300.3);
    for (let c = 1; c <= 50_000; c += 7) {
      const m2 = c / 100;
      expect(fromAreaMicro(toAreaMicro(m2))).toBe(m2);
    }
  });

  it("비정상 값은 0 — 호출부가 입력 검증을 마친 값만 넘긴다", () => {
    expect(toAreaMicro(Number.NaN)).toBe(0);
    expect(toAreaMicro(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("areaTimes — 면적 × 배율 정확 곱", () => {
  it("🔴 부동소수가 한도 아래로 어긋나는 시료: 100.1 × 3 = 300.3 (float 300.29999999999995)", () => {
    expect(100.1 * 3).not.toBe(300.3);
    expect(areaTimes(100.1, 3)).toBe(300.3);
  });

  it("소수 배율: 500.4 × 1.2 = 600.48 · 750 × 1.2 = 900 · 20.13 × 5 = 100.65", () => {
    expect(areaTimes(500.4, 1.2)).toBe(600.48);
    expect(areaTimes(750, 1.2)).toBe(900);
    expect(areaTimes(20.13, 5)).toBe(100.65);
  });

  it("2자리 면적 × 정수 배율 전수 — 참값(정수 센티㎡ × 배율 ÷ 100)과 항상 같다", () => {
    for (const m of [3, 4, 5, 7, 10]) {
      for (let c = 1; c <= 20_000; c++) {
        expect(areaTimes(c / 100, m)).toBe((c * m) / 100);
      }
    }
  });
});

describe("sumAreas · subtractAreas · minArea — 순서·잡음 무관", () => {
  it("더하는 순서와 무관하다 (float는 100.3 / 100.29999999999998 / 100.30000000000001)", () => {
    const parts = [33.3, 33.3, 33.4, 0.1, 0.2];
    expect(sumAreas(...parts)).toBe(100.3);
    expect(sumAreas(...[...parts].reverse())).toBe(100.3);
    expect(sumAreas(0.1, 0.2)).toBe(0.3); // float 0.30000000000000004
  });

  it("subtractAreas — 100.5 − 99.9 = 0.6 (float 0.5999999999999943)", () => {
    expect(100.5 - 99.9).not.toBe(0.6);
    expect(subtractAreas(100.5, 99.9)).toBe(0.6);
  });

  it("minArea — 잡음 없는 값으로 돌려준다", () => {
    expect(minArea(300.3, 100.1 * 3)).toBe(300.3);
    expect(minArea(200, 300.3)).toBe(200);
  });

  it("snapArea — 이진 잡음만 지운다(값은 안 바뀐다)", () => {
    expect(snapArea(300.29999999999995)).toBe(300.3);
    expect(snapArea(123.456789)).toBe(123.456789);
  });
});

describe("judgeAreaLimit — 한도 비교·초과 면적", () => {
  it("한도와 정확히 같으면 이내 · 초과 0 · 비율 0", () => {
    const j = judgeAreaLimit(300.3, areaTimes(100.1, 3));
    expect(j).toEqual({ within: true, excess: 0, withinArea: 300.3, ratio: 0 });
  });

  it("한도 + 0.01㎡ → 초과 정확히 0.01㎡ (잡음 0.010000000000047748이 아니다)", () => {
    const j = judgeAreaLimit(300.31, areaTimes(100.1, 3));
    expect(j.within).toBe(false);
    expect(j.excess).toBe(0.01);
    expect(j.withinArea).toBe(300.3);
    expect(j.ratio).toBeCloseTo(0.01 / 300.31, 12);
  });

  it("토지 0㎡ · 한도 0㎡(무허가 단서 allowed=0)", () => {
    expect(judgeAreaLimit(0, 100)).toEqual({ within: true, excess: 0, withinArea: 0, ratio: 0 });
    expect(judgeAreaLimit(500, 0)).toEqual({ within: false, excess: 500, withinArea: 0, ratio: 1 });
  });

  it("전수 — 한도(2자리 면적 × 정수 배율)와 같은 토지는 항상 이내, +0.01㎡는 항상 초과", () => {
    for (const m of [3, 5, 7, 10]) {
      for (let c = 100; c <= 6_000; c++) {
        const limit = areaTimes(c / 100, m);
        expect(judgeAreaLimit(limit, limit).within).toBe(true);
        const over = judgeAreaLimit(round2(limit + 0.01), limit);
        expect(over.within).toBe(false);
        expect(over.excess).toBe(0.01);
      }
    }
  });

  it("isAreaAtMost · isAreaOver는 서로 부정이다", () => {
    expect(isAreaAtMost(300.3, 100.1 * 3)).toBe(true);
    expect(isAreaOver(300.3, 100.1 * 3)).toBe(false);
    expect(isAreaOver(300.31, 300.3)).toBe(true);
  });
});

describe("areaRatio4 — 비사업용 면적 비율 4자리 half-up(정수)", () => {
  it("🔴 57 / 800 = 0.07125 → 0.0713 (종전 Math.round(x*10000)/10000은 float 잡음으로 0.0712)", () => {
    expect(Math.round((57 / 800) * 10000) / 10000).toBe(0.0712);
    expect(areaRatio4(57, 800)).toBe(0.0713);
  });

  it("일반값: 1/3 → 0.3333 · 2/3 → 0.6667 · 전량 → 1 · 0 → 0", () => {
    expect(areaRatio4(1, 3)).toBe(0.3333);
    expect(areaRatio4(2, 3)).toBe(0.6667);
    expect(areaRatio4(500, 500)).toBe(1);
    expect(areaRatio4(0, 500)).toBe(0);
  });

  it("전체 면적 0 이하 → 0 · 음수 초과는 0으로 본다", () => {
    expect(areaRatio4(10, 0)).toBe(0);
    expect(areaRatio4(-5, 100)).toBe(0);
  });

  it("0.005% 미만 초과는 0 — Q-7(반올림 0이면 사업용)의 경계: 0.00004999… → 0 · 0.00005 → 0.0001", () => {
    expect(areaRatio4(0.1, 200_000.1)).toBe(0); // 5e-7
    expect(areaRatio4(1, 20_000)).toBe(0.0001); // 정확히 0.00005 → half-up
    expect(areaRatio4(0.99, 20_000)).toBe(0);
  });
});
