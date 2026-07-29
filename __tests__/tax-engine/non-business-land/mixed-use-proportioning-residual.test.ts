import { describe, it, expect } from "vitest";
import {
  computeMixedUseProportioning,
  computeAreaProportioning,
} from "@/lib/tax-engine/non-business-land/utils/area-proportioning";
import { round2 } from "@/lib/tax-engine/area-utils";

/**
 * anchor — §168의11⑥ 복합용도 부속토지 안분에 면적 안분 규칙 적용.
 * ① 사업용분 round2 확정 ② 비사업용분 잔액 흡수.
 * 세액 반영분(nonBusinessRatio)은 4자리 반올림이라 수치 영향 없음 — 회귀 방어.
 */
describe("computeMixedUseProportioning — round2 + 잔액 흡수", () => {
  it("D1: 사업용분 2자리 확정 (float 잔여 제거)", () => {
    // 168.3 × (327.61 / 610.66) = 90.29044476468086
    const ap = computeMixedUseProportioning(168.3, 327.61, 610.66);
    expect(ap.businessArea).toBe(90.29);
    expect(ap.nonBusinessArea).toBe(78.01);
  });

  it("D2: 합 = 전체면적 불변식 (float 아티팩트 없음)", () => {
    // 수정 전: 333.33 / 666.6700000000001
    const ap = computeMixedUseProportioning(1000, 333.33, 1000);
    expect(ap.businessArea).toBe(333.33);
    expect(ap.nonBusinessArea).toBe(666.67);
    expect(round2(ap.businessArea + ap.nonBusinessArea)).toBe(ap.totalArea);
  });

  it("D3: nonBusinessRatio 불변 — 세액 무영향 (실측 회귀)", () => {
    // round2 도입 전후로 4자리 비율이 동일함을 고정. 이 비율만 engine.ts:275 경유로 세액에 도달.
    expect(computeMixedUseProportioning(168.3, 327.61, 610.66).nonBusinessRatio).toBe(0.4635);
    expect(computeMixedUseProportioning(1000, 333.33, 1000).nonBusinessRatio).toBe(0.6667);
    expect(computeMixedUseProportioning(500, 1, 3).nonBusinessRatio).toBe(0.6667);
  });

  it("D4: 특정용도분 0 → 전량 비사업용", () => {
    const ap = computeMixedUseProportioning(500, 0, 1000);
    expect(ap.businessArea).toBe(0);
    expect(ap.nonBusinessArea).toBe(500);
    expect(ap.nonBusinessRatio).toBe(1);
  });

  it("D5: 전부 특정용도분 → 전량 사업용", () => {
    const ap = computeMixedUseProportioning(500, 1000, 1000);
    expect(ap.businessArea).toBe(500);
    expect(ap.nonBusinessArea).toBe(0);
    expect(ap.nonBusinessRatio).toBe(0);
  });

  it("D6: 건축물 면적 0 → 안분 불가, 전량 비사업용", () => {
    const ap = computeMixedUseProportioning(500, 100, 0);
    expect(ap.businessArea).toBe(0);
    expect(ap.nonBusinessArea).toBe(500);
  });
});

describe("computeAreaProportioning — 기준면적 초과분 (안분 아님·불변)", () => {
  it("D7: min/max 로 산출 — 입력 면적 그대로, 반올림 미개입", () => {
    // 기준면적 초과분은 비율 곱이 아니라 min/max → round2 대상 아님.
    const ap = computeAreaProportioning(1000.555, 300.333);
    expect(ap.businessArea).toBe(300.333);
    expect(ap.nonBusinessArea).toBe(700.222);
  });
});
