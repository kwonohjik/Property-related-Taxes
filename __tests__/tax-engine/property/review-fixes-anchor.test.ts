/**
 * 재산세 코드리뷰 수정 anchor (feat/prop-review)
 *
 * rank 3 — 공정시장가액비율 0.70을 applyRate(부동소수 곱) 적용 시 1원 과소산정 →
 *          applyFairMarketRatio(정수 분수연산)로 정확 정수화 (지방세법 §110, 절사 규정 없음).
 * rank 2 — 별도합산 용도지역별 적용배율(시행령 §101②): 관리지역(도시지역 외의 용도지역) = 7배.
 *          기존 코드는 관리지역을 5배로 오적용 → 기준면적 과소 → 종합합산 이관 과다(과대과세).
 */

import { describe, it, expect } from "vitest";
import { calcTaxBase } from "../../../lib/tax-engine/property-tax";
import { applyFairMarketRatio } from "../../../lib/tax-engine/tax-utils";
import {
  calculateBaseArea,
  isSeparateAggregateLand,
} from "../../../lib/tax-engine/separate-aggregate-land";
import type {
  ZoningDistrict,
  SeparateAggregateLandItem,
} from "../../../lib/tax-engine/separate-aggregate-land";

describe("rank3: 공정시장가액비율 정수 정밀도 (0.70 double 오차 회피)", () => {
  it("토지 공시 7억 → 과세표준 정확히 490,000,000 (구 applyRate는 489,999,999)", () => {
    expect(calcTaxBase(700_000_000, "land").taxBase).toBe(490_000_000);
  });

  it("건축물 공시 7억 → 과세표준 490,000,000", () => {
    expect(calcTaxBase(700_000_000, "building").taxBase).toBe(490_000_000);
  });

  it("주택 공시 7억(60%) 회귀 불변 → 420,000,000", () => {
    expect(calcTaxBase(700_000_000, "housing").taxBase).toBe(420_000_000);
  });

  it("1세대1주택 2024 공시 15억(6억 초과 45%) 회귀 불변 → 675,000,000", () => {
    expect(
      calcTaxBase(1_500_000_000, "housing", undefined, {
        isOneHousehold: true,
        taxYear: 2024,
      }).taxBase,
    ).toBe(675_000_000);
  });

  it("applyFairMarketRatio 0.70 정수 exactness — 정수결과 입력들", () => {
    expect(applyFairMarketRatio(700_000_000, 0.7)).toBe(490_000_000);
    expect(applyFairMarketRatio(350_000_000, 0.7)).toBe(245_000_000);
    expect(applyFairMarketRatio(88_000_000, 0.7)).toBe(61_600_000);
  });

  it("applyFairMarketRatio 0.60/0.45 회귀 불변", () => {
    expect(applyFairMarketRatio(700_000_000, 0.6)).toBe(420_000_000);
    expect(applyFairMarketRatio(1_500_000_000, 0.45)).toBe(675_000_000);
  });
});

describe("rank2: 별도합산 용도지역별 적용배율 (시행령 §101②)", () => {
  const mk = (zoningDistrict: ZoningDistrict): SeparateAggregateLandItem => ({
    id: "L1",
    jurisdictionCode: "11110",
    landArea: 700,
    officialLandPrice: 1_000_000,
    buildingFloorArea: 100,
    zoningDistrict,
  });

  it("관리지역 = 7배 (도시지역 외의 용도지역) — 구 5배 오류 수정", () => {
    const r = calculateBaseArea(mk("management"));
    expect(r.multiplier).toBe(7);
    expect(r.baseArea).toBe(700);
  });

  it("관리지역 700㎡ 전부 별도합산 인정 (구 5배: 500 인정 + 200 종합합산 이관)", () => {
    const chk = isSeparateAggregateLand(mk("management"));
    expect(chk.recognizedArea).toBe(700);
    expect(chk.excessArea).toBe(0);
  });

  it("녹지·농림·자연환경보전 = 7배 회귀 불변", () => {
    expect(calculateBaseArea(mk("green")).multiplier).toBe(7);
    expect(calculateBaseArea(mk("agricultural")).multiplier).toBe(7);
    expect(calculateBaseArea(mk("nature_preserve")).multiplier).toBe(7);
  });

  it("상업 = 3배 · 공업 = 4배 회귀 불변", () => {
    expect(calculateBaseArea(mk("commercial")).multiplier).toBe(3);
    expect(calculateBaseArea(mk("industrial")).multiplier).toBe(4);
  });
});
