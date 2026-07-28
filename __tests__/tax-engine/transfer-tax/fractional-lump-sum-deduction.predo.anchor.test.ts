/**
 * P0 pre-Do anchor — 지분 모드 필요경비 개산공제(소득령 §163⑥) 지분율 미적용 결함.
 *
 * 계획서: docs/02-design/features/transfer-fractional-lump-sum-deduction.plan.md (rev.2) §9 P0
 * 엔진 설계: 같은 이름 .engine.design.md §3
 * 정책: feedback_pre_anchor_verification — Do 진입 전 **실패하는** anchor로 설계를 환류한다.
 *
 * ⚠️ **`it.fails`로 표기된 4건은 현재 의도적으로 실패한다.** 그것이 목적이다 —
 *    결함이 실재함을 실행 가능한 형태로 고정한다. 이 저장소는 "회귀 허용치 0"이라
 *    빨간 테스트를 남길 수 없으므로 `it.fails`를 쓴다.
 *
 *    **구현(P2·P3)이 착지하면 이 4건이 통과하기 시작해 `it.fails`가 오히려 실패한다** —
 *    그때 `it.fails` → `it`로 바꾸는 것이 완료 신호다. 강제 알림 장치이지 영구 표기가 아니다.
 *
 *    F6(단독소유 무변경)과 환산취득가 회귀 가드는 지금도 green이며 그대로 `it`다.
 *
 * **진행 상황**: P2(헬퍼·배관) 착지로 F1·F4가 green 전환 완료 → `it`.
 *              F8b(split 항등성)는 P3a(잔액 흡수)에서 전환된다 — 아직 `it.fails`.
 *
 * 법령 근거:
 *   - 소득세법 §97②2호 가목 — 필요경비 = "환산취득가액과 … 대통령령으로 정하는 금액의 **합계액**".
 *     한 합계식의 두 항이 서로 다른 스케일일 수 없다.
 *   - 소득령 §163⑥1호·2호가목 — "취득당시의 (개별공시지가|다목·라목 가액) × 3/100".
 *     양도자산이 공유지분이면 그 지분에 상당하는 기준시가가 base다.
 *   - 조세심판원 국심1989부0035 — 공유 대지(청구인 지분 1/3)를 전체 가액으로 과세한 처분에 대해
 *     "양도 및 취득가액은 처분청이 채택한 가액의 3분의1로 경정"(구법·쟁점 상이 — 보강 근거).
 *
 * floor 순서: **A 확정**(계획서 §12) — `floor(floor(std × 지분) × rate)`.
 */
import { describe, it, expect } from "vitest";
import { calcTransferGain } from "@/lib/tax-engine/transfer-tax-helpers";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { baseTransferInput } from "../_helpers/mock-rates";

/** 확정 산식(A) — 지분 기준시가를 먼저 확정한 뒤 율 적용 */
const expectedDeduction = (std: number, rate: number, ratio: number) =>
  Math.floor(Math.floor(std * ratio) * rate);

// ════════════════════════════════════════════════════════════
// F1 — 환산 모드 지분 50%: 개산공제가 지분 기준시가 × 3%여야 한다
// ════════════════════════════════════════════════════════════
describe("F1: 환산 + 지분 50% → 개산공제 지분 적용", () => {
  const mk = (over: Record<string, unknown> = {}) =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 500_000_000, // 물건 전체 10억 × 50% (API가 이미 스케일)
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 500_000_000, // 물건 전체 기준시가 — raw 100% 유지가 정본
      standardPriceAtTransfer: 800_000_000,
      acquisitionPrice: 0,
      ownershipRatio: 0.5,
      ...over,
    });

  it("✅ P2 착지 — 개산공제 = floor(floor(5억 × 0.5) × 3%) = 7,500,000", () => {
    const r = calcTransferGain(mk());
    expect(
      r.estimatedDeduction,
      "기준시가가 물건 전체 값이므로 지분율을 적용하지 않으면 개산공제가 2배가 된다",
    ).toBe(expectedDeduction(500_000_000, 0.03, 0.5));
  });

  it("환산취득가액은 이미 정확하다 (transferPrice 선형 — 회귀 가드)", () => {
    const r = calcTransferGain(mk());
    // 5억 × (5억 ÷ 8억) = 312,500,000
    expect(r.estimatedBase).toBe(312_500_000);
  });

  it("✅ P2 착지 — §97②2호 가목 합계액의 두 항이 같은 스케일이어야 한다", () => {
    const r = calcTransferGain(mk());
    const whole = calcTransferGain(
      mk({ transferPrice: 1_000_000_000, ownershipRatio: undefined }),
    );
    // 가목 = 환산취득가 + 개산공제. 지분 50%면 물건 전체의 절반 근방이어야 한다.
    const half = r.estimatedBase + r.estimatedDeduction;
    const full = whole.estimatedBase + whole.estimatedDeduction;
    expect(
      Math.abs(half * 2 - full),
      "한 항만 스케일되면 가목 합계가 절반에서 크게 벗어난다",
    ).toBeLessThanOrEqual(2);
  });
});

// ════════════════════════════════════════════════════════════
// F4 — §97②2호 단서 swap 판정이 지분과 무관하게 동일해야 한다
//   가목만 부풀면 경계에서 판정이 뒤집힌다 (계획서 §1.2)
// ════════════════════════════════════════════════════════════
describe("F4: swap 판정이 물건 전체와 지분 50%에서 일치", () => {
  const mk = (over: Record<string, unknown>) =>
    baseTransferInput({
      propertyType: "housing",
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 500_000_000,
      standardPriceAtTransfer: 800_000_000,
      acquisitionPrice: 0,
      ...over,
    });

  it("✅ P2 착지 — 동일 거래의 절반 지분에서 필요경비 모드가 뒤집히면 안 된다", () => {
    const whole = calcTransferGain(
      mk({
        transferPrice: 1_000_000_000,
        capitalExpenditure: 600_000_000,
        transferExpense: 50_000_000,
      }),
    );
    const half = calcTransferGain(
      mk({
        transferPrice: 500_000_000,
        capitalExpenditure: 300_000_000,
        transferExpense: 25_000_000,
        ownershipRatio: 0.5,
      }),
    );
    expect(whole.necessaryExpenseMode).toBe("swap_to_direct");
    expect(
      half.necessaryExpenseMode,
      "가목(환산+개산공제)만 부풀어 나목과의 대소가 뒤집힌다 — 필요경비 6.5억 → 1,500만원",
    ).toBe(whole.necessaryExpenseMode);
  });
});

// ════════════════════════════════════════════════════════════
// F6 — 단독소유(100%) 무변경 회귀 가드 (지금도 green)
// ════════════════════════════════════════════════════════════
describe("F6: 단독소유 → 무변경 (회귀 가드)", () => {
  const mk = (over: Record<string, unknown> = {}) =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_000_000_000,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 500_000_000,
      standardPriceAtTransfer: 800_000_000,
      acquisitionPrice: 0,
      ...over,
    });

  it("ownershipRatio 미전달 = 1 전달 = 종전 결과", () => {
    const none = calcTransferGain(mk());
    const one = calcTransferGain(mk({ ownershipRatio: 1 }));
    expect(none.estimatedDeduction).toBe(15_000_000);
    expect(one.estimatedDeduction).toBe(none.estimatedDeduction);
    expect(one.gain).toBe(none.gain);
  });
});

// ════════════════════════════════════════════════════════════
// F8b — split 항등성: 토지분 + 건물분 = 라목총액 기준 개산공제
//   §163⑥2호가목. PR #841 H10 anchor가 세운 불변식을 지분 자산에서도 지킨다.
//   → 잔액 흡수 없이 파트별로 각각 지분을 적용하면 50.8% 확률로 깨진다(설계 §3 E2).
// ════════════════════════════════════════════════════════════
describe("F8b: split 지분 50% → §163⑥2호가목 항등성 보존", () => {
  const mk = (over: Record<string, unknown> = {}) =>
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
      // 라목 결합 총액 5억 (토지분 2억 / 건물분 역산 3억) — 홀수를 섞어 floor 편차를 유도
      standardPricePerSqmAtAcquisition: 1_000_001,
      acquisitionArea: 200,
      standardPriceAtAcquisition: 500_000_001,
      landStandardPriceAtTransfer: 300_000_000,
      buildingStandardPriceAtTransfer: 200_000_000,
      isSeparateAcquisition: true,
      ownershipRatio: 0.5,
      ...over,
    });

  it.fails("🔴 토지분 + 건물분 = floor(floor(라목총액 × 0.5) × 3%)", () => {
    const r = calcSplitGain(mk());
    expect(r).not.toBeNull();
    const sum = r!.land.appraisalDeduction + r!.building.appraisalDeduction;
    expect(
      sum,
      "파트별로 각각 지분을 적용하면 floor가 2회씩 걸려 합이 법정액에서 −1~−2원 이탈한다 (잔액 흡수 필요)",
    ).toBe(expectedDeduction(500_000_001, 0.03, 0.5));
  });
});

// ════════════════════════════════════════════════════════════
// F2·F3 — 감정가액·매매사례가액 모드도 동일 (P2 착지분)
//   §163⑥은 추계 방식을 가리지 않는다 — 개산공제는 세 모드 공통이다.
// ════════════════════════════════════════════════════════════
describe("F2·F3: 감정·매매사례 모드 지분 50%", () => {
  const mk = (over: Record<string, unknown>) =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 500_000_000,
      useEstimatedAcquisition: false,
      standardPriceAtAcquisition: 500_000_000,
      acquisitionPrice: 0,
      ownershipRatio: 0.5,
      ...over,
    });

  it("F2: 감정가액 → 개산공제 = floor(floor(5억 × 0.5) × 3%)", () => {
    const r = calcTransferGain(
      mk({ acquisitionMethod: "appraisal", appraisalValue: 200_000_000 }),
    );
    expect(r.estimatedDeduction).toBe(expectedDeduction(500_000_000, 0.03, 0.5));
  });

  it("F3: 매매사례가액 → 동일", () => {
    const r = calcTransferGain(
      mk({ acquisitionMethod: "salesCase", similarSalesValue: 225_000_000 }),
    );
    expect(r.estimatedDeduction).toBe(expectedDeduction(500_000_000, 0.03, 0.5));
  });
});

// ════════════════════════════════════════════════════════════
// F7 — 미등기양도자산(§104③) 0.3% 율에도 지분이 적용된다
// ════════════════════════════════════════════════════════════
describe("F7: 미등기 0.3% + 지분 50%", () => {
  it("개산공제 = floor(floor(5억 × 0.5) × 0.3%)", () => {
    const r = calcTransferGain(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 500_000_000,
        useEstimatedAcquisition: true,
        standardPriceAtAcquisition: 500_000_000,
        standardPriceAtTransfer: 800_000_000,
        acquisitionPrice: 0,
        isUnregistered: true,
        ownershipRatio: 0.5,
      }),
    );
    expect(r.estimatedDeduction).toBe(expectedDeduction(500_000_000, 0.003, 0.5));
  });
});
