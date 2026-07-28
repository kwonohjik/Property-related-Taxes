/**
 * P4 — 표시 축: 개산공제 산식 base echo + 사이드바 절사 순서 통일.
 *
 * 계획서: docs/02-design/features/transfer-fractional-lump-sum-deduction.plan.md (rev.2) §9 P4
 * UI 설계: 같은 이름 .ui.design.md §1(echo 안 A)·§3(D3)·§4(⑥ floor 순서)
 *
 * ## 왜 echo가 필요한가
 *
 * 결과 화면과 상세명세서는 「취득시 기준시가 {값} × 3% = {개산공제}」 형태로 **base 숫자를
 * 노출**한다. 지분 자산에서 기준시가는 물건 전체(100%) 값이고 개산공제는 지분분이므로,
 * base를 그대로 쓰면 **표시된 산식이 표시된 값을 만들어내지 못한다**
 * (`feedback_engine_result_display_drift`).
 *
 * UI가 지분율로 재계산하면 dual-truth이므로 **엔진이 실제로 쓴 base를 echo**한다
 * (`lumpDeductionBase` = `computeLumpSumDeductionBase(std, ratio)`).
 *
 * ## 절사 순서 통일 (⑥)
 *
 * 사이드바 미리보기는 이미 지분율을 적용했으나 순서가 **반대**였다
 * (`floor(floor(std × rate) × ratio)` — 율 먼저). 엔진 정본은 순서 A(지분 먼저)다.
 * 두 값이 0.96%에서 1원 어긋나 **미리보기 ≠ 결과**가 됐다. 엔진 헬퍼 위임으로 해소.
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import {
  computeEstimatedDeduction,
  computeLumpSumDeductionBase,
} from "@/lib/tax-engine/tax-utils";
import { buildGeneralBuildingAssetCards, type GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";
import { baseTransferInput } from "../_helpers/mock-rates";

const LAND_STD = 1_000_001 * 200; // 200,000,200
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
// E1 — split 카드: base echo가 표시 산식을 성립시킨다
// ════════════════════════════════════════════════════════════
describe("E1: SplitPartResult.lumpDeductionBase", () => {
  it("지분 50% — echo된 base × 3% = 표시된 개산공제 (산식 자기충족)", () => {
    const r = calcSplitGain(house({ ownershipRatio: 0.5 }))!;
    for (const part of [r.land, r.building]) {
      expect(part.lumpDeductionBase).toBeDefined();
      expect(
        Math.floor(part.lumpDeductionBase! * 0.03),
        "표시 산식 「base × 3%」가 표시된 개산공제를 그대로 만들어야 한다",
      ).toBe(part.appraisalDeduction);
    }
  });

  it("echo base ≠ 100% 기준시가 — 100% 값을 표시하면 산식이 어긋난다", () => {
    const r = calcSplitGain(house({ ownershipRatio: 0.5 }))!;
    expect(r.land.stdPriceAtAcq).toBe(LAND_STD);
    expect(r.land.lumpDeductionBase).toBe(computeLumpSumDeductionBase(LAND_STD, 0.5));
    expect(Math.floor(r.land.stdPriceAtAcq! * 0.03)).not.toBe(r.land.appraisalDeduction);
  });

  it("단독소유 — echo base = 기준시가 (표시 무변경 회귀 가드)", () => {
    const r = calcSplitGain(house())!;
    expect(r.land.lumpDeductionBase).toBe(LAND_STD);
    expect(r.building.lumpDeductionBase).toBe(BLDG_STD);
  });

  it("실가 파트는 base echo도 undefined (개산공제 미적용)", () => {
    const r = calcSplitGain(house({ landAcqMode: "actual", ownershipRatio: 0.5 }))!;
    expect(r.land.lumpDeductionBase).toBeUndefined();
    expect(r.building.lumpDeductionBase).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════
// E2 — 일반건물: landBase·buildingBase echo
// ════════════════════════════════════════════════════════════
describe("E2: GeneralBuildingEstimatedDeduction base echo", () => {
  const ACQ_LAND_PER_SQM = 500_001;
  const LAND_AREA = 200;
  const ACQ_BLDG_STD = 180_000_001;
  const gb = (over: Record<string, unknown> = {}) => ({
    landArea: LAND_AREA,
    buildingArea: 300,
    buildingFootprintArea: 120,
    totalTransferPrice: 1_200_000_000,
    transferDate: new Date("2024-05-01"),
    acquisitionDate: new Date("2010-03-01"),
    transferLandPricePerSqm: 3_000_000,
    transferBuildingStdPrice: 400_000_000,
    acquisitionLandPricePerSqm: ACQ_LAND_PER_SQM,
    acquisitionBuildingStdPrice: ACQ_BLDG_STD,
    zoneType: "commercial",
    ...over,
  }) as unknown as GeneralBuildingInput;

  it("지분 50% — base × 3% = 개산공제", () => {
    const r = buildGeneralBuildingAssetCards(gb({ ownershipRatio: 0.5 }));
    expect(Math.floor(r.estimatedDeduction.landBase! * 0.03)).toBe(r.estimatedDeduction.land);
    expect(Math.floor(r.estimatedDeduction.buildingBase! * 0.03)).toBe(
      r.estimatedDeduction.building,
    );
  });

  it("단독소유 — base = 취득시 기준시가", () => {
    const r = buildGeneralBuildingAssetCards(gb());
    expect(r.estimatedDeduction.landBase).toBe(ACQ_LAND_PER_SQM * LAND_AREA);
    expect(r.estimatedDeduction.buildingBase).toBe(ACQ_BLDG_STD);
  });
});

// ════════════════════════════════════════════════════════════
// E3 — ⑥ 사이드바 절사 순서 = 엔진 순서 A
//   사이드바는 `computeEstimatedDeduction`에 위임한다. 종전 순서(율 먼저)와
//   결과가 갈리는 입력을 고정해 재역전을 막는다.
// ════════════════════════════════════════════════════════════
describe("E3: 절사 순서 A — 사이드바·엔진 단일 규약", () => {
  // ⚠️ **판별력 있는 fixture여야 한다.** 두 순서가 같은 값을 내는 입력(예: 333,333,333 × 1/3)으로
  //    이 anchor를 세우면 규약이 되돌아가도 잡지 못한다 — 실제로 이 시리즈에서 라운드 넘버
  //    anchor를 근거로 잘못된 규약을 확정한 전례가 있다(engine.design.md §3 E2 rev.2).
  //    아래 조합은 순서 A = 999,999 / 종전 순서 = 1,000,000으로 **1원 갈린다**(실측).
  const STD = 100_000_000;
  const RATIO = 1 / 3;

  it("순서 A(지분 먼저)와 종전 순서(율 먼저)가 실제로 다른 입력이다 — 판별력 가드", () => {
    const orderA = Math.floor(Math.floor(STD * RATIO) * 0.03);
    const orderLegacy = Math.floor(Math.floor(STD * 0.03) * RATIO);
    expect(orderA).toBe(999_999);
    expect(orderLegacy).toBe(1_000_000);
    expect(orderA).not.toBe(orderLegacy);
  });

  it("엔진 헬퍼가 순서 A를 따른다 — 사이드바가 이 함수에 위임하므로 두 값이 일치한다", () => {
    expect(computeEstimatedDeduction(STD, 0.03, RATIO)).toBe(
      Math.floor(Math.floor(STD * RATIO) * 0.03),
    );
  });

  it("base echo와 개산공제가 같은 중간값을 공유한다", () => {
    const base = computeLumpSumDeductionBase(STD, RATIO);
    expect(computeEstimatedDeduction(STD, 0.03, RATIO)).toBe(Math.floor(base * 0.03));
  });
});
