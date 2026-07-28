/**
 * P0 pre-Do anchor — 토지·건물 취득가액 축 재설계 설계 전제 실측.
 *
 * 계획서: docs/02-design/features/transfer-separate-acq-date-per-part-completion.plan.md §12 P0
 * 정책: feedback_pre_anchor_verification — Do 진입 전 핵심 anchor로 설계를 환류한다.
 *       "현행 엔진 일치 예상" 가정 금지. 실패 메시지로 설계 수정 시기를 결정한다.
 *
 * 본 파일은 **현행 엔진의 실제 동작을 확정**하는 것이 목적이다. 설계가 전제한 내용
 * (축 B 항등성 · 축 A 잔액 도출 결함 · salesCase 총액 안분)이 실제로 성립하는지 검증한다.
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { baseTransferInput } from "../_helpers/mock-rates";

/** 주택 · 토지 2015 취득 / 건물 2018 취득 · 라목 결합 취득시 기준시가 5억 (토지분 2억) */
const housingBase = (over: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "housing",
    acquisitionDate: new Date("2018-06-01"),
    landAcquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    transferPrice: 1_000_000_000,
    acquisitionPrice: 400_000_000, // 축 A 총액 (설계상 "존재하지 않는" 값)
    saleSplitMode: "actual",
    landTransferPrice: 600_000_000,
    buildingTransferPrice: 400_000_000,
    // 축 B — 라목 결합 총액 5억, 토지분 = 100만/㎡ × 200㎡ = 2억, 건물분 = 역산 3억
    standardPricePerSqmAtAcquisition: 1_000_000,
    acquisitionArea: 200,
    standardPriceAtAcquisition: 500_000_000,
    landStandardPriceAtTransfer: 600_000_000,
    buildingStandardPriceAtTransfer: 400_000_000,
    ...over,
  });

// ════════════════════════════════════════════════════════════
// P0-A. 축 B 항등성 — 개산공제 합계 = 라목 총액 × 3% (§163⑥2호가목)
//   설계 전제(계획서 §2-D·§5.3): housing 역산이 법정 개산공제를 지킨다.
//   이것이 깨지면 "housing 축 B 현행 유지" 결정의 근거가 무너진다.
// ════════════════════════════════════════════════════════════
describe("P0-A: housing 축 B 항등성 (라목 결합 기준시가)", () => {
  it("양 파트 환산 → 개산공제 합계 = 취득시 기준시가 총액 × 3%", () => {
    const r = calcSplitGain(
      housingBase({ landAcqMode: "estimated", buildingAcqMode: "estimated" }),
    );
    expect(r).not.toBeNull();
    const sum = r!.land.appraisalDeduction + r!.building.appraisalDeduction;
    // 라목 총액 500,000,000 × 3% = 15,000,000
    expect(sum, "역산이 라목 총액을 항등 보존해야 §163⑥2호가목 법정액과 일치한다").toBe(15_000_000);
    // 파트별 base도 합이 총액이어야 한다
    expect((r!.land.stdPriceAtAcq ?? 0) + (r!.building.stdPriceAtAcq ?? 0)).toBe(500_000_000);
  });
});

// ════════════════════════════════════════════════════════════
// P0-B. 축 A 결함 실증 — 한쪽만 입력 시 반대쪽이 "총액 − 입력값"으로 채워지는가
//   설계(engine.design E2): 별개 취득이면 총액이 없으므로 잔액 도출은 근거 없음 → null 승격.
//   현행이 실제로 잔액을 만드는지 확인한다.
// ════════════════════════════════════════════════════════════
// [P2a 착지 후] 아래 케이스는 **`isSeparateAcquisition` 미설정**(= 동시 취득) 경로다.
//   별개 취득에서는 잔액 도출·안분이 폐지되고 차단된다 —
//   `split-acq-per-part-completion.test.ts` 참조. 여기서는 게이트 off 회귀 가드로 존치한다.
describe("P0-B: 축 A 잔액 도출 (동시 취득 경로 — 게이트 off)", () => {
  it("토지만 입력 → 건물 = 총액 − 토지 (설계상 폐기 대상)", () => {
    const r = calcSplitGain(
      housingBase({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 300_000_000,
        // buildingAcquisitionPrice 미입력
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.land.acquisitionPrice).toBe(300_000_000);
    expect(
      r!.building.acquisitionPrice,
      "현행은 총액 4억 − 토지 3억 = 1억을 건물 취득가액으로 만든다 (계약서에 없는 값)",
    ).toBe(100_000_000);
  });

  it("둘 다 미입력 → 취득시 기준시가 비율 안분 (설계상 폐기 대상)", () => {
    const r = calcSplitGain(
      housingBase({ landAcqMode: "actual", buildingAcqMode: "actual" }),
    );
    expect(r).not.toBeNull();
    // landRatio = 2억/5억 = 0.4 → 토지 1.6억 / 건물 2.4억
    expect(r!.land.acquisitionPrice).toBe(160_000_000);
    expect(r!.building.acquisitionPrice).toBe(240_000_000);
  });

  it("둘 다 입력 → 파트값 그대로 (설계 후에도 불변 — 회귀 가드)", () => {
    const r = calcSplitGain(
      housingBase({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 250_000_000,
      }),
    );
    expect(r!.land.acquisitionPrice).toBe(300_000_000);
    expect(r!.building.acquisitionPrice).toBe(250_000_000);
    // 합(5.5억)이 총액(4억)과 달라도 엔진은 clamp하지 않는다 — validate 담당
  });
});

// ════════════════════════════════════════════════════════════
// P0-C. salesCase 총액 안분 실증 (engine.design E3 폐지 대상)
// ════════════════════════════════════════════════════════════
// [P2a 착지 후] 동일 — 별개 취득에서는 폐지(§176의2③1호), 동시 취득에서만 유효.
describe("P0-C: salesCase 파트 미입력 → 총액 안분 (동시 취득 경로 — 게이트 off)", () => {
  it("파트 매매사례가 미입력 → similarSalesValue를 취득시 기준시가 비율로 안분", () => {
    const r = calcSplitGain(
      housingBase({
        landAcqMode: "salesCase",
        buildingAcqMode: "salesCase",
        similarSalesValue: 500_000_000,
      }),
    );
    expect(r).not.toBeNull();
    // landRatio 0.4 → 토지 2억 / 건물 3억
    expect(r!.land.acquisitionPrice).toBe(200_000_000);
    expect(r!.building.acquisitionPrice).toBe(300_000_000);
  });
});

// ════════════════════════════════════════════════════════════
// P0-D. 게이트 — 취득시 기준시가 3요소 미입력 시 분리 전체 비활성
//   PR #837(P1)은 UI·API 입력 경로를 열었을 뿐, 엔진 게이트는 그대로다.
//   validate V0이 필요한 이유를 실증한다.
// ════════════════════════════════════════════════════════════
describe("P0-D: 3요소 미입력 → calcSplitGain null (validate V0 필요 근거)", () => {
  it("총액만 없어도 null", () => {
    const r = calcSplitGain(
      housingBase({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 100_000_000,
        standardPriceAtAcquisition: undefined,
      }),
    );
    expect(r, "파트 금액이 둘 다 확정돼 있어도 비율 3요소가 없으면 분리 전체가 죽는다").toBeNull();
  });

  it("면적만 없어도 null", () => {
    const r = calcSplitGain(
      housingBase({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 100_000_000,
        acquisitionArea: undefined,
      }),
    );
    expect(r).toBeNull();
  });
});
