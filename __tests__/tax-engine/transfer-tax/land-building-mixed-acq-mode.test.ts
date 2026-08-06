/**
 * 토지·건물 취득/양도가액 독립 산정 모드 — 파트별 혼합 취득방식 anchor (Phase A0+A+B)
 *
 * 계획서: docs/02-design/features/transfer-land-building-independent-valuation-mode.plan.md
 * 엔진설계: docs/02-design/features/transfer-land-building-independent-valuation-mode.engine.design.md
 *
 * 소득세법 시행령 §166⑥·§163⑥: 토지·건물 취득가액 산정 방식(실가/환산/감정/매매사례)을
 * 각각 독립적으로 선택할 수 있다(landAcqMode·buildingAcqMode). 본 파일은 케이스 매트릭스
 * C3(#5)·C4(#6)·C8 을 검증한다 — 모두 "구분양도"(saleSplitMode: "actual")로 양도가액 안분
 * 로직(Phase B)과 무관하게 취득가액 축(Phase A)만 독립 검증한다.
 */

import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { baseTransferInput } from "../_helpers/mock-rates";
import type { PreHousingDisclosureInput } from "@/lib/tax-engine/types/transfer-phd.types";

// ============================================================
// C3(#5): 토지 actual + 건물 estimated + 구분양도
//   → 토지=직접 실가(개산공제 0), 건물=환산(양도가×취득시/양도시 기준시가, 개산공제 3%)
// ============================================================

describe("C3(#5): land-building-mixed-actual-est — 토지 실가 + 건물 환산", () => {
  const input = baseTransferInput({
    propertyType: "building",
    acquisitionPrice: 0, // 무관 — landAcqMode="actual"은 landAcquisitionPrice만 사용(splitPair 기반 아님)
    acquisitionDate: new Date("2018-06-01"),       // 건물 취득일
    landAcquisitionDate: new Date("2015-06-01"),   // 토지 취득일
    transferDate: new Date("2024-06-01"),
    transferPrice: 1_000_000_000,
    // 구분양도 — 계약서상 토지·건물 실지 양도가액 직접 기재
    saleSplitMode: "actual",
    landTransferPrice: 600_000_000,
    buildingTransferPrice: 400_000_000,
    // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
    //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
    //    건물분은 아래 「환산 분모」와 같은 값이라 따로 두지 않는다(600:400 = 구분 비율).
    landStandardPriceAtTransfer: 600_000_000,
    // 파트별 취득 방식 — 토지 실가 / 건물 환산 (독립)
    landAcqMode: "actual",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: 300_000_000,             // 토지 실지취득가액 (직접입력)
    // 건물 환산 분자·분모
    standardPricePerSqmAtAcquisition: 1_000_000,   // 취득시 개별공시지가 /㎡
    acquisitionArea: 200,                          // 토지면적 → 토지 취득시 기준시가 200,000,000
    standardPriceAtAcquisition: 500_000_000,       // 취득시 기준시가 합계 → 건물분 300,000,000
    buildingStandardPriceAtTransfer: 400_000_000,  // 양도시 건물 기준시가(환산 분모)
  });

  it("calcSplitGain: 토지 = 직접 실가, 개산공제 0", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.land.acqMode).toBe("actual");
    expect(result!.land.acquisitionPrice).toBe(300_000_000);
    expect(result!.land.appraisalDeduction).toBe(0);
    // 양도차익 = 600,000,000 - 300,000,000 - 0(직접경비) - 0(개산공제)
    expect(result!.land.gain).toBe(300_000_000);
  });

  it("calcSplitGain: 건물 = 환산취득가(양도가×취득시/양도시 기준시가), 개산공제 3%", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.building.acqMode).toBe("estimated");
    // 건물 취득시 기준시가 = 500,000,000 - 200,000,000 = 300,000,000
    // 환산취득가 = 400,000,000 × (300,000,000 / 400,000,000) = 300,000,000
    expect(result!.building.acquisitionPrice).toBe(300_000_000);
    // 개산공제 = floor(300,000,000 × 3%) = 9,000,000
    expect(result!.building.appraisalDeduction).toBe(9_000_000);
    // 양도차익 = 400,000,000 - 300,000,000 - 0(직접경비) - 9,000,000(개산공제)
    expect(result!.building.gain).toBe(91_000_000);
  });
});

// ============================================================
// C4(#6): 토지 estimated + 건물 actual + 구분양도
//   → 토지=환산(개산공제 3%), 건물=직접 실가(개산공제 0)
// ============================================================

describe("C4(#6): land-building-mixed-est-actual — 토지 환산 + 건물 실가", () => {
  const input = baseTransferInput({
    propertyType: "building",
    acquisitionPrice: 0, // 무관 — buildingAcqMode="actual"은 buildingAcquisitionPrice만 사용
    acquisitionDate: new Date("2019-06-01"),       // 건물 취득일
    landAcquisitionDate: new Date("2013-06-01"),   // 토지 취득일
    transferDate: new Date("2024-06-01"),
    transferPrice: 1_000_000_000,
    saleSplitMode: "actual",
    landTransferPrice: 700_000_000,
    buildingTransferPrice: 300_000_000,
    landAcqMode: "estimated",
    buildingAcqMode: "actual",
    buildingAcquisitionPrice: 200_000_000,         // 건물 실지취득가액 (직접입력)
    // 토지 환산 분자·분모
    standardPricePerSqmAtAcquisition: 1_500_000,   // 취득시 개별공시지가 /㎡
    acquisitionArea: 100,                          // 토지면적 → 토지 취득시 기준시가 150,000,000
    standardPriceAtAcquisition: 400_000_000,       // 취득시 기준시가 합계 → 건물분 250,000,000(미사용)
    landStandardPriceAtTransfer: 300_000_000,      // 양도시 토지 기준시가(환산 분모)
    // 양도시 **건물** 기준시가 — Phase 1-D부터 구분 기재 시 양쪽이 필수다(§100③ 판정이 안분값을
    // 요구한다). 건물은 실가라 환산 분모로 쓰이지 않지만 **안분값의 분모로는 등장**한다.
    //
    // 토지 분모(3억)는 환산 산식이 쓰므로 **바꿀 수 없다** ⇒ 건물분으로 비율을 맞춘다.
    //   안분: 토지 10억 × 300/(300+150) = 666,666,666 · 건물 333,333,334
    //   이탈: 토지 |7억−6.667억|/6.667억 = 5.0% · 건물 |3억−3.333억|/3.333억 = 10.0% → **미발동**
    // ⇒ 구분 기재값이 그대로 쓰이므로 이 describe의 기대값은 불변이다.
    buildingStandardPriceAtTransfer: 150_000_000,
  });

  it("calcSplitGain: 토지 = 환산취득가, 개산공제 3%", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.land.acqMode).toBe("estimated");
    // 환산취득가 = 700,000,000 × (150,000,000 / 300,000,000) = 350,000,000
    expect(result!.land.acquisitionPrice).toBe(350_000_000);
    // 개산공제 = floor(150,000,000 × 3%) = 4,500,000
    expect(result!.land.appraisalDeduction).toBe(4_500_000);
    // 양도차익 = 700,000,000 - 350,000,000 - 0 - 4,500,000
    expect(result!.land.gain).toBe(345_500_000);
  });

  it("calcSplitGain: 건물 = 직접 실가, 개산공제 0", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.building.acqMode).toBe("actual");
    expect(result!.building.acquisitionPrice).toBe(200_000_000);
    expect(result!.building.appraisalDeduction).toBe(0);
    // 양도차익 = 300,000,000 - 200,000,000 - 0 - 0
    expect(result!.building.gain).toBe(100_000_000);
  });
});

// ============================================================
// C8: 토지 actual + 건물 estimated + PHD 입력 존재
//   → PHD 게이트 미진입(양 파트 모두 estimated일 때만 진입) — C3와 동일 결과여야 함
// ============================================================

describe("C8: phd-gate-mixed-suppress — PHD 입력 있어도 혼합 모드는 비-PHD 파트별 경로", () => {
  const dummyPHD: PreHousingDisclosureInput = {
    firstDisclosureDate: new Date("2005-04-30"),
    firstDisclosureHousingPrice: 100_000_000,
    landArea: 200,
    landPricePerSqmAtAcquisition: 500_000,
    buildingStdPriceAtAcquisition: 50_000_000,
    landPricePerSqmAtFirstDisclosure: 600_000,
    buildingStdPriceAtFirstDisclosure: 60_000_000,
    transferHousingPrice: 400_000_000,
    landPricePerSqmAtTransfer: 2_000_000,
    buildingStdPriceAtTransfer: 200_000_000,
  };

  const input = baseTransferInput({
    propertyType: "building",
    acquisitionPrice: 0,
    acquisitionDate: new Date("2018-06-01"),
    landAcquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    transferPrice: 1_000_000_000,
    saleSplitMode: "actual",
    landTransferPrice: 600_000_000,
    buildingTransferPrice: 400_000_000,
    // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
    //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
    //    건물분은 아래 「환산 분모」와 같은 값이라 따로 두지 않는다(600:400 = 구분 비율).
    landStandardPriceAtTransfer: 600_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: 300_000_000,
    standardPricePerSqmAtAcquisition: 1_000_000,
    acquisitionArea: 200,
    standardPriceAtAcquisition: 500_000_000,
    buildingStandardPriceAtTransfer: 400_000_000,
    // PHD 입력 존재 — 하지만 landAcqMode="actual" ≠ "estimated" → 게이트 미충족
    preHousingDisclosure: dummyPHD,
  });

  it("calcSplitGain: PHD 경로 미진입 — preHousingDisclosureDetail undefined", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.preHousingDisclosureDetail).toBeUndefined();
    expect(result!.note).not.toContain("개별주택가격 미공시");
  });

  it("calcSplitGain: C3와 동일한 파트별 산출값 (PHD 입력 무시 확인)", () => {
    const result = calcSplitGain(input);
    expect(result).not.toBeNull();
    expect(result!.land.acqMode).toBe("actual");
    expect(result!.land.acquisitionPrice).toBe(300_000_000);
    expect(result!.land.appraisalDeduction).toBe(0);
    expect(result!.building.acqMode).toBe("estimated");
    expect(result!.building.acquisitionPrice).toBe(300_000_000);
    expect(result!.building.appraisalDeduction).toBe(9_000_000);
  });
});
