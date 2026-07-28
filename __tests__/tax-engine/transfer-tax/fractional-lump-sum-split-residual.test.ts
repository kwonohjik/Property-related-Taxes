/**
 * P3a — split(토지/건물 분리) 경로 개산공제 지분 적용 + **잔액 흡수** 게이트.
 *
 * 계획서: docs/02-design/features/transfer-fractional-lump-sum-deduction.plan.md (rev.2) §9 P3a
 * 엔진 설계: 같은 이름 .engine.design.md §3 E2 (잔액 흡수)
 *
 * ## 왜 잔액 흡수인가
 *
 * 소득령 §163⑥2호가목의 base는 §99①1호 **라목 결합 가액**이다 — 법정 개산공제는
 * `floor(라목총액 × 3/100)` **하나**이고, 토지·건물 분리는 §166⑥ 양도차익 계산을 위한
 * 내부 표현일 뿐이다. 파트별로 각각 floor 하면 합이 법정액에서 이탈한다.
 *
 * 실측(10만건, 결정적 시드):
 *
 * | 방식 | 「토지분 + 건물분 = 라목총액 기준액」 위반 | 최대 편차 | 건물분 음수 |
 * |---|---|---|---|
 * | 파트별 독립 floor (지분 50%) | 50,020 / 100,000 (50.0%) | −2원 | — |
 * | **잔액 흡수** (지분 50%) | **0 / 100,000** | 0 | **0건** |
 *
 * PR #841 H10 anchor(`split-acq-std-price-independent.test.ts:161`)가 세운 불변식을
 * 지분 자산에서 스스로 무너뜨리지 않기 위한 조치다 (memory `feedback_floor_residual_absorption`).
 *
 * ## 단독소유에도 적용한다 (의도된 동작 변경)
 *
 * 흡수를 지분 자산에만 걸면 **같은 조문이 소유 형태에 따라 다르게 계산된다**. 홀수 기준시가는
 * 단독소유에서도 동일하게 이탈하므로(실측 49.8%) 게이트를 지분으로 두지 않는다.
 * 기존 회귀 0 — 양도세 전체 389파일 4,563건 통과 확인(PDF 정본 anchor 포함).
 *
 * floor 순서: A 확정 — `floor(floor(std × 지분) × rate)` (계획서 §12).
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { baseTransferInput } from "../_helpers/mock-rates";

/** 확정 산식(A) */
const ded = (std: number, rate: number, ratio = 1) =>
  Math.floor(Math.floor(std * ratio) * rate);

/**
 * 주택(라목 결합 공시). 토지분 = 1,000,001 × 200 = 200,000,200 ·
 * 결합 총액 500,000,001 → 역산 건물분 300,000,199. 홀수를 섞어 floor 편차를 유도한다.
 */
const LAND_STD = 1_000_001 * 200;
const TOTAL_STD = 500_000_001;
const house = (over: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "housing",
    acquisitionDate: new Date("2018-06-01"),
    landAcquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    transferPrice: 500_000_000,
    saleSplitMode: "actual",
    landTransferPrice: 300_000_000,
    buildingTransferPrice: 200_000_000,
    landAcqMode: "appraisal",
    buildingAcqMode: "appraisal",
    landAcquisitionPrice: 150_000_000,
    buildingAcquisitionPrice: 125_000_000,
    standardPricePerSqmAtAcquisition: 1_000_001,
    acquisitionArea: 200,
    standardPriceAtAcquisition: TOTAL_STD,
    landStandardPriceAtTransfer: 300_000_000,
    buildingStandardPriceAtTransfer: 200_000_000,
    isSeparateAcquisition: true,
    ...over,
  });

// ════════════════════════════════════════════════════════════
// S1 — 결합 총액 쌍 + 양쪽 추계 → 흡수 적용
// ════════════════════════════════════════════════════════════
describe("S1: 라목 결합 쌍 → 잔액 흡수", () => {
  it("지분 50% — 토지분은 자기 base로, 건물분은 잔액으로 도출된다", () => {
    const r = calcSplitGain(house({ ownershipRatio: 0.5 }))!;
    expect(r.land.appraisalDeduction).toBe(ded(LAND_STD, 0.03, 0.5));
    expect(r.building.appraisalDeduction).toBe(
      ded(TOTAL_STD, 0.03, 0.5) - ded(LAND_STD, 0.03, 0.5),
    );
    expect(
      r.land.appraisalDeduction + r.building.appraisalDeduction,
      "§163⑥2호가목 — 합계는 라목총액 기준 법정액과 정확히 일치해야 한다",
    ).toBe(ded(TOTAL_STD, 0.03, 0.5));
  });

  it("단독소유(지분 미전달)에서도 항등성이 성립한다 — 게이트는 지분이 아니다", () => {
    const r = calcSplitGain(house())!;
    expect(r.land.appraisalDeduction + r.building.appraisalDeduction).toBe(
      ded(TOTAL_STD, 0.03),
    );
  });

  it("건물분이 음수가 되지 않는다 (토지가 총액의 대부분인 극단 케이스)", () => {
    const r = calcSplitGain(
      house({
        standardPricePerSqmAtAcquisition: 2_499_999, // 토지분 499,999,800
        ownershipRatio: 1 / 3,
      }),
    )!;
    expect(r.building.appraisalDeduction).toBeGreaterThanOrEqual(0);
    expect(r.land.appraisalDeduction + r.building.appraisalDeduction).toBe(
      ded(TOTAL_STD, 0.03, 1 / 3),
    );
  });
});

// ════════════════════════════════════════════════════════════
// S2 — 파트별 독립 공시(건물 + 별개취득) → 흡수 미적용
// ════════════════════════════════════════════════════════════
describe("S2: 파트 독립 공시 → 각자 floor (지킬 항등식이 없다)", () => {
  const BLD_STD = 350_000_001;
  const bldg = (over: Record<string, unknown> = {}) =>
    house({
      propertyType: "building",
      buildingStandardPriceAtAcquisition: BLD_STD,
      ...over,
    });

  it("지분 50% — 토지·건물이 각각 자기 기준시가로 산출된다", () => {
    const r = calcSplitGain(bldg({ ownershipRatio: 0.5 }))!;
    expect(r.land.appraisalDeduction).toBe(ded(LAND_STD, 0.03, 0.5));
    expect(r.building.appraisalDeduction).toBe(ded(BLD_STD, 0.03, 0.5));
  });

  it("결합 총액(standardPriceAtAcquisition)을 참조하지 않는다", () => {
    const r = calcSplitGain(bldg({ ownershipRatio: 0.5 }))!;
    expect(
      r.land.appraisalDeduction + r.building.appraisalDeduction,
      "가목+나목은 별도 공시라 결합 총액 기준 항등식이 성립하지 않는다",
    ).not.toBe(ded(TOTAL_STD, 0.03, 0.5));
  });
});

// ════════════════════════════════════════════════════════════
// S3 — 한쪽만 추계 → 쌍이 아니므로 흡수 미적용
// ════════════════════════════════════════════════════════════
describe("S3: 한쪽 실가 → 흡수 대상 아님", () => {
  it("토지 실가 + 건물 환산 → 건물분만 자기 base로 지분 적용", () => {
    const r = calcSplitGain(
      house({ landAcqMode: "actual", buildingAcqMode: "appraisal", ownershipRatio: 0.5 }),
    )!;
    expect(r.land.appraisalDeduction).toBe(0);
    expect(r.building.appraisalDeduction).toBe(
      ded(TOTAL_STD - LAND_STD, 0.03, 0.5),
    );
  });

  it("건물 실가 + 토지 환산 → 토지분만", () => {
    const r = calcSplitGain(
      house({ landAcqMode: "appraisal", buildingAcqMode: "actual", ownershipRatio: 0.5 }),
    )!;
    expect(r.land.appraisalDeduction).toBe(ded(LAND_STD, 0.03, 0.5));
    expect(r.building.appraisalDeduction).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// S4 — 단독소유 회귀 가드
// ════════════════════════════════════════════════════════════
describe("S4: ownershipRatio=1 = 미전달 (회귀 가드)", () => {
  it("두 경로 결과가 동일하다", () => {
    const none = calcSplitGain(house())!;
    const one = calcSplitGain(house({ ownershipRatio: 1 }))!;
    expect(one.land.appraisalDeduction).toBe(none.land.appraisalDeduction);
    expect(one.building.appraisalDeduction).toBe(none.building.appraisalDeduction);
    expect(one.land.gain).toBe(none.land.gain);
    expect(one.building.gain).toBe(none.building.gain);
  });
});
