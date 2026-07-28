/**
 * P3a·P3b — split(토지/건물 구분 계산) · PHD · 겸용 경로의 개산공제 **성분별 독립 적용**.
 *
 * 계획서: docs/02-design/features/transfer-fractional-lump-sum-deduction.plan.md (rev.2) §9 P3a·P3b
 *
 * ## 잔액 흡수를 하지 않는다 — 설계 rev.1의 E2는 폐기됐다
 *
 * rev.1 설계는 「§163⑥2호가목의 base는 §99①1호 **라목 결합 가액**이므로 법정 개산공제는
 * `floor(라목총액 × 3/100)` 하나이고, 토지·건물 분리는 내부 표현일 뿐」이라고 보아
 * 마지막 성분이 잔액을 흡수하게 설계했다. **그 전제가 틀렸다.**
 *
 * - **소득세법 §100②**: 토지와 건물 등을 함께 취득·양도한 경우 "이를 **각각 구분하여 기장**"한다.
 * - **소득령 §163⑥**: 1호(토지)·2호가목(건물·주택)을 **별개 호**로 열거해 각각 자기 base × 3/100.
 * - 결합 총액 기준 단일 법정액을 강제하는 문언은 **없다**.
 *
 * ⚠️ 근거 조문 주의: **§166⑥이 아니다**. §166⑥ 원문은 "법 제100조제2항의 규정을 적용함에 있어서
 *    토지와 건물 등의 가액의 **구분이 불분명한 때에는** 「부가가치세법 시행령」 제64조제1항에 따라
 *    안분계산"으로, **안분 방법만** 규정한다(2026-07-28 리뷰 게이트에서 인용 정정).
 *
 * 실제로 잔액 흡수를 구현했더니 **Excel 정본 anchor와 1원 어긋나 14건이 깨졌다**
 * (`pre-housing-disclosure.test.ts` D-7-2 「건물 개산공제 = floor(취득시 건물 성분 × 3%)」,
 * 건물분 4,454,759 vs 흡수시 4,454,760 — 2026-07-28). 실무 정본이 성분별 독립 floor다.
 *
 * → 이 파일은 **재시도 방지 회귀 가드**다. 성분 합이 `floor(총액 × 3%)`와 다를 수 있음을
 *   명시적으로 허용하고, 각 성분이 자기 base로 산출되는지만 단언한다.
 *
 * floor 순서: A 확정 — `floor(floor(std × 지분) × rate)` (계획서 §12).
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import { baseTransferInput } from "../_helpers/mock-rates";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
  PHD_LAND_HOUSING_AT_ACQ,
  PHD_BLDG_HOUSING_AT_ACQ,
} from "./_helpers/pre-housing-disclosure-fixture";

/** 확정 산식(A) */
const ded = (std: number, rate: number, ratio = 1) =>
  Math.floor(Math.floor(std * ratio) * rate);

/**
 * 주택(라목 결합 공시). 토지분 = 1,000,001 × 200 = 200,000,200 ·
 * 결합 총액 500,000,001 → 역산 건물분 300,000,199. 홀수를 섞어 floor 편차를 노출시킨다.
 */
const LAND_STD = 1_000_001 * 200;
const TOTAL_STD = 500_000_001;
const BLDG_STD = TOTAL_STD - LAND_STD;
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
// S1 — split: 성분별 독립 적용
// ════════════════════════════════════════════════════════════
describe("S1: split 토지/건물 → 각 성분이 자기 기준시가 지분분으로", () => {
  it("지분 50%", () => {
    const r = calcSplitGain(house({ ownershipRatio: 0.5 }))!;
    expect(r.land.appraisalDeduction).toBe(ded(LAND_STD, 0.03, 0.5));
    expect(r.building.appraisalDeduction).toBe(ded(BLDG_STD, 0.03, 0.5));
  });

  it("지분 1/3 — 나누어떨어지지 않는 비율에서도 성분별로 독립", () => {
    const r = calcSplitGain(house({ ownershipRatio: 1 / 3 }))!;
    expect(r.land.appraisalDeduction).toBe(ded(LAND_STD, 0.03, 1 / 3));
    expect(r.building.appraisalDeduction).toBe(ded(BLDG_STD, 0.03, 1 / 3));
  });

  it("🚫 잔액 흡수 금지 회귀 가드 — 합계는 성분별 산출의 단순 합이다", () => {
    const r = calcSplitGain(house({ ownershipRatio: 0.5 }))!;
    const sum = r.land.appraisalDeduction + r.building.appraisalDeduction;
    expect(sum).toBe(ded(LAND_STD, 0.03, 0.5) + ded(BLDG_STD, 0.03, 0.5));
    // ⚠️ 「sum === floor(floor(결합총액 × 지분) × 3%)」로 되돌리지 말 것.
    //    두 값은 우연히 같을 수도(이 fixture) 1~2원 다를 수도 있다 — 결합총액 기준
    //    단일 법정액은 §100②·§163⑥ 문언에 없고, 강제하면 PHD Excel 정본(D-7-2)과 충돌한다.
  });
});

// ════════════════════════════════════════════════════════════
// S2 — split: 한쪽 실가 → 그쪽은 0
// ════════════════════════════════════════════════════════════
describe("S2: 한쪽 실가 → 추계 파트만 개산공제", () => {
  it("토지 실가 + 건물 환산", () => {
    const r = calcSplitGain(
      house({ landAcqMode: "actual", buildingAcqMode: "appraisal", ownershipRatio: 0.5 }),
    )!;
    expect(r.land.appraisalDeduction).toBe(0);
    expect(r.building.appraisalDeduction).toBe(ded(BLDG_STD, 0.03, 0.5));
  });

  it("건물 실가 + 토지 환산", () => {
    const r = calcSplitGain(
      house({ landAcqMode: "appraisal", buildingAcqMode: "actual", ownershipRatio: 0.5 }),
    )!;
    expect(r.land.appraisalDeduction).toBe(ded(LAND_STD, 0.03, 0.5));
    expect(r.building.appraisalDeduction).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// S3 — PHD(§164⑤): 취득시 안분 성분별 독립 (P3b)
// ════════════════════════════════════════════════════════════
describe("S3: PHD 토지/건물 성분 → 성분별 독립 적용", () => {
  it("지분 50% — 각 성분이 자기 안분 기준시가로", () => {
    const r = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, {
      ...PHD_INPUT,
      ownershipRatio: 0.5,
    });
    expect(r.landLumpDeduction).toBe(ded(PHD_LAND_HOUSING_AT_ACQ, 0.03, 0.5));
    expect(r.buildingLumpDeduction).toBe(ded(PHD_BLDG_HOUSING_AT_ACQ, 0.03, 0.5));
  });

  it("단독소유 — Excel 정본값 불변 (D-7-2와 동일 규약)", () => {
    const r = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(r.landLumpDeduction).toBe(ded(PHD_LAND_HOUSING_AT_ACQ, 0.03));
    expect(r.buildingLumpDeduction).toBe(ded(PHD_BLDG_HOUSING_AT_ACQ, 0.03));
  });
});

// ════════════════════════════════════════════════════════════
// S4 — 단독소유 회귀 가드 (전 경로 절사 규약 불변)
// ════════════════════════════════════════════════════════════
describe("S4: ownershipRatio=1 = 미전달 (회귀 가드)", () => {
  it("split — 두 경로 결과가 동일하다", () => {
    const none = calcSplitGain(house())!;
    const one = calcSplitGain(house({ ownershipRatio: 1 }))!;
    expect(one.land.appraisalDeduction).toBe(none.land.appraisalDeduction);
    expect(one.building.appraisalDeduction).toBe(none.building.appraisalDeduction);
    expect(one.land.gain).toBe(none.land.gain);
    expect(one.building.gain).toBe(none.building.gain);
  });

  it("PHD — 두 경로 결과가 동일하다", () => {
    const none = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    const one = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, {
      ...PHD_INPUT,
      ownershipRatio: 1,
    });
    expect(one.landLumpDeduction).toBe(none.landLumpDeduction);
    expect(one.buildingLumpDeduction).toBe(none.buildingLumpDeduction);
  });
});
