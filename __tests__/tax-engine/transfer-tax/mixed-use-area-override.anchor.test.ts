/**
 * anchor — 겸용주택 면적 override 2필드 (① 카드 단일 소스화).
 *
 * 설계: docs/02-design/features/mixed-use-area-single-source-editable.engine.design.md §1·§3
 * 예시 전제: T(totalLandArea)=200㎡ · F(buildingFootprintArea)=100㎡ · ratio=0.5
 *
 * 신규 2필드:
 *   commercialLandAreaOverride?  — 상가 부수토지 직접 지정
 *   residentialFootprintOverride? — 주택 정착면적 직접 지정 (상가는 항상 잔액)
 *
 * ⚠️ three-state: 인자가 `number | undefined`라 `??`가 정본. 단 호출부(UI·API)가
 *    `parseDecimal`을 거치면 빈값이 0이 되므로 **문자열 수준 분기 후** 조건부 주입해야 한다.
 */
import { describe, it, expect } from "vitest";
import { computeDerivedAreas } from "@/lib/tax-engine/mixed-use-derived-areas";
import { residualArea, round2 } from "@/lib/tax-engine/area-utils";

const BASE = {
  residentialFloorArea: 100,
  nonResidentialFloorArea: 100,
  buildingFootprintArea: 100,
  totalLandArea: 200,
};

describe("[AREA-REG-01] 회귀 0 — override 미설정 시 현행과 동일", () => {
  it("L1·F1: 전부 미설정 → 자동 비율 + 잔액", () => {
    const r = computeDerivedAreas(BASE);
    expect(r.residentialLandArea).toBe(100);
    expect(r.commercialLandArea).toBe(100);
    expect(r.residentialFootprintArea).toBe(50);
    expect(r.residentialRatio).toBe(0.5);
  });

  it("기존 override(주택 부수토지)만 설정 → 상가 잔액 (현행 동작 불변)", () => {
    const r = computeDerivedAreas({ ...BASE, residentialLandAreaOverride: 90.29 });
    expect(r.residentialLandArea).toBe(90.29);
    expect(r.commercialLandArea).toBe(residualArea(200, 90.29)); // 109.71
  });

  it("기존 override = 0 (three-state 적법) → 상가 전체", () => {
    const r = computeDerivedAreas({ ...BASE, residentialLandAreaOverride: 0 });
    expect(r.residentialLandArea).toBe(0);
    expect(r.commercialLandArea).toBe(200);
  });

  it("연면적 0 → early return (override 무시 — 현행 보존)", () => {
    const r = computeDerivedAreas({
      ...BASE,
      residentialFloorArea: 0,
      nonResidentialFloorArea: 0,
      commercialLandAreaOverride: 50,
      residentialFootprintOverride: 30,
    });
    expect(r.residentialLandArea).toBe(0);
    expect(r.commercialLandArea).toBe(200);
    expect(r.residentialFootprintArea).toBe(0);
  });
});

describe("[AREA-L] 부수토지 — 4분기 (§2-B 규칙표)", () => {
  it("L2: 주택만 설정 → 상가 = 잔액", () => {
    const r = computeDerivedAreas({ ...BASE, residentialLandAreaOverride: 90.29 });
    expect(r.commercialLandArea).toBe(109.71);
  });

  it("L3: 상가만 설정 → 주택 = 잔액", () => {
    const r = computeDerivedAreas({ ...BASE, commercialLandAreaOverride: 78.01 });
    expect(r.commercialLandArea).toBe(78.01);
    expect(r.residentialLandArea).toBe(residualArea(200, 78.01)); // 121.99
  });

  it("L4: 둘 다 설정 + 합 일치 → 각 값 그대로", () => {
    const r = computeDerivedAreas({
      ...BASE,
      residentialLandAreaOverride: 90.29,
      commercialLandAreaOverride: 109.71,
    });
    expect(r.residentialLandArea).toBe(90.29);
    expect(r.commercialLandArea).toBe(109.71);
  });

  it("★L5: 둘 다 설정 + 합 불일치 → 잔액 미적용(각 값 보존) → validate가 차단", () => {
    // 잔액을 적용하면 오류가 침묵 교정돼 V2 검증 자체가 죽는다.
    const r = computeDerivedAreas({
      ...BASE,
      residentialLandAreaOverride: 90.29,
      commercialLandAreaOverride: 78.01,
    });
    expect(r.residentialLandArea).toBe(90.29);
    expect(r.commercialLandArea).toBe(78.01);
    expect(round2(r.residentialLandArea + r.commercialLandArea)).toBe(168.3); // ≠ 200
  });

  it("L7: 상가 override = 0 (three-state) → 주택 전체", () => {
    const r = computeDerivedAreas({ ...BASE, commercialLandAreaOverride: 0 });
    expect(r.commercialLandArea).toBe(0);
    expect(r.residentialLandArea).toBe(200);
  });
});

describe("[AREA-F] 정착면적 — 주택 override (상가는 항상 잔액)", () => {
  it("F2: 주택 정착 직접 지정 → 그대로", () => {
    const r = computeDerivedAreas({ ...BASE, residentialFootprintOverride: 53.65 });
    expect(r.residentialFootprintArea).toBe(53.65);
  });

  it("F4: 0 (three-state 적법) → 0 보존", () => {
    const r = computeDerivedAreas({ ...BASE, residentialFootprintOverride: 0 });
    expect(r.residentialFootprintArea).toBe(0);
  });

  it("F3: 상가 정착 46.35 입력 → 주택 override = residualArea(F, 46.35) = 53.65 (UI 역산)", () => {
    // §2-C2 "가" — UI가 역산해 주택 override로 저장한다. 엔진은 주택만 받는다.
    const uiComputed = residualArea(100, 46.35);
    expect(uiComputed).toBe(53.65);
    const r = computeDerivedAreas({ ...BASE, residentialFootprintOverride: uiComputed });
    expect(r.residentialFootprintArea).toBe(53.65);
    // 상가 정착(표시) = 잔액 → 입력값 복원
    expect(residualArea(100, r.residentialFootprintArea)).toBe(46.35);
  });
});
