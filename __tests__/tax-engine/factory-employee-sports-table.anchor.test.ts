/**
 * anchor — 「지방세법 시행규칙」 [별표 6] **3호바 표**와 비고 2-나·다·라
 *
 * PR #1427은 10% 상한만 강제하고 **표는 사용자가 직접 계산**하게 했다(입력 hint에
 * 「표의 기준면적에 해당하는 면적을 입력하세요」). 표를 잘못 읽으면 그대로 통과했다.
 * 여기서 표와 비고를 고정한다.
 *
 * ## 표 (verbatim · 개정 2025.10.31.)
 *
 * | 구분 | ~100명 | ~500명 | ~2,000명 | ~10,000명 | 10,000명 초과 |
 * |---|---|---|---|---|---|
 * | 실외 운동장 | 1,000 | 1,000 + (100명 초과 × 9) | 4,600 + (500명 초과 × 3) | 9,100 + (2,000명 초과 × 1) | 17,100 |
 * | 실외 코트 | 970 | 970 | 1,940 | 2,910 | 2,910 |
 * | 실내체육시설 | 150 | 300 | 450 | 900 | 900 |
 *
 * ## 비고
 *
 * · 2-나 — 「종업원이 50명 이하인 **법인**」은 코트면적만 기준면적으로 한다
 * · 2-다 — 실내체육시설 건축물바닥면적이 기준면적 이하이면 그 바닥면적이 기준면적
 * · 2-라 — 실내체육시설이 있으면 그 기준면적에 「지방세법 시행령」 §101② 배율을 곱해 **합산**
 *
 * 🔴 **2-나의 「법인」은 「소득세법 시행규칙」 별표5 비고2의 「자」와 다르다.** 별표5는 개인·법인을
 *    가리지 않지만 별표6은 법인만 명시한다 — 개인사업자에 적용하면 기준면적이 줄어(코트만)
 *    **법 근거 없이 불리**해진다.
 */
import { describe, it, expect } from "vitest";
import { employeeSportsStandardArea } from "@/lib/tax-engine/data/employee-sports-standard-area";
import {
  computeEmployeeSportsFacilityStandard,
  COURT_ONLY_EMPLOYEE_THRESHOLD,
} from "@/lib/tax-engine/factory-employee-sports-standard";

describe("[별표6 3호바] 표 — 종업원수 구간별 기준면적", () => {
  it.each([
    [50, 1000],
    [100, 1000],
    [101, 1009], // 1,000 + 1×9
    [500, 4600], // 1,000 + 400×9 — 다음 구간 기점과 일치
    [501, 4603], // 4,600 + 1×3
    [2000, 9100], // 4,600 + 1,500×3 — 다음 구간 기점과 일치
    [2001, 9101],
    [10000, 17100], // 9,100 + 8,000×1 — 초과 구간 고정값과 일치
    [10001, 17100],
  ])("운동장 — 종업원 %i명 → %i㎡", (n, expected) => {
    expect(employeeSportsStandardArea("field", n)).toBe(expected);
  });

  it.each([
    [100, 970],
    [500, 970],
    [501, 1940],
    [2000, 1940],
    [2001, 2910],
    [20000, 2910],
  ])("코트 — 종업원 %i명 → %i㎡", (n, expected) => {
    expect(employeeSportsStandardArea("court", n)).toBe(expected);
  });

  it.each([
    [100, 150],
    [101, 300],
    [500, 300],
    [501, 450],
    [2000, 450],
    [2001, 900],
    [20000, 900],
  ])("실내 — 종업원 %i명 → %i㎡", (n, expected) => {
    expect(employeeSportsStandardArea("indoor", n)).toBe(expected);
  });

  it("구간 경계에서 연속한다 (표 해석이 옳다는 검산)", () => {
    expect(employeeSportsStandardArea("field", 500)).toBe(1000 + 400 * 9);
    expect(employeeSportsStandardArea("field", 2000)).toBe(4600 + 1500 * 3);
    expect(employeeSportsStandardArea("field", 10000)).toBe(9100 + 8000 * 1);
  });
});

describe("[별표6 3호바] 인정면적 — 행별로 min을 잡는다", () => {
  it("실제 면적이 표보다 작으면 실제 면적이 인정된다", () => {
    const r = computeEmployeeSportsFacilityStandard({
      employeeCount: 100,
      playgroundArea: 400,
      tennisCourtArea: 300,
    });
    expect(r.playgroundApplied).toBe(400);
    expect(r.courtApplied).toBe(300);
    expect(r.recognizedArea).toBe(700);
  });

  it("실제 면적이 표를 넘으면 표값으로 깎인다", () => {
    const r = computeEmployeeSportsFacilityStandard({
      employeeCount: 100,
      playgroundArea: 5000,
      tennisCourtArea: 5000,
    });
    expect(r.playgroundApplied).toBe(1000);
    expect(r.courtApplied).toBe(970);
    expect(r.recognizedArea).toBe(1970);
  });

  /**
   * 🔑 합계끼리 비교하면 한 행의 초과분이 다른 행의 여유분을 먹는다.
   * 운동장 2,000(표 1,000) · 코트 0(표 970) → 행별 1,000 / 합계끼리 min(2,000, 1,970) = 1,970.
   */
  it("한 행의 초과분이 다른 행의 여유분을 먹지 않는다", () => {
    const r = computeEmployeeSportsFacilityStandard({
      employeeCount: 100,
      playgroundArea: 2000,
      tennisCourtArea: 0,
    });
    expect(r.recognizedArea).toBe(1000);
    expect(r.recognizedArea).not.toBe(1970);
  });
});

describe("[별표6 3호바 비고 2-나] 50명 이하 「법인」만 코트면적만", () => {
  it("경계는 50명이다", () => {
    expect(COURT_ONLY_EMPLOYEE_THRESHOLD).toBe(50);
  });

  const base = { playgroundArea: 5000, tennisCourtArea: 5000, employeeCount: 50 };

  it("50명 이하 법인 → 코트만 (운동장·실내 미인정)", () => {
    const r = computeEmployeeSportsFacilityStandard({ ...base, entityType: "corporation" });
    expect(r.courtOnly).toBe(true);
    expect(r.playgroundApplied).toBe(0);
    expect(r.recognizedArea).toBe(970);
  });

  it("50명 이하 **개인**은 제한을 받지 않는다 (별표6은 「법인」만 명시)", () => {
    const r = computeEmployeeSportsFacilityStandard({ ...base, entityType: "individual" });
    expect(r.courtOnly).toBe(false);
    expect(r.recognizedArea).toBe(1000 + 970);
  });

  it("51명 법인은 제한을 받지 않는다 (경계 초과)", () => {
    const r = computeEmployeeSportsFacilityStandard({
      ...base,
      employeeCount: 51,
      entityType: "corporation",
    });
    expect(r.courtOnly).toBe(false);
    expect(r.recognizedArea).toBe(1000 + 970);
  });

  it("사업주체 미입력이면 제한하지 않는다 — ⑧이 먼저 차단한다 (불리 방향 추정 금지)", () => {
    const r = computeEmployeeSportsFacilityStandard(base);
    expect(r.courtOnly).toBe(false);
  });
});

describe("[별표6 3호바 비고 2-다·라] 실내체육시설 — 바닥면적 하한 후 §101② 배율", () => {
  it("바닥면적이 표 이하면 바닥면적이 기준면적이 된다 (2-다)", () => {
    const r = computeEmployeeSportsFacilityStandard({
      employeeCount: 100,
      indoorFloorArea: 120, // 표 150 이하
      indoorZoneMultiplier: 4,
    });
    expect(r.indoorStandardBase).toBe(120);
    expect(r.indoorApplied).toBe(480); // 120 × 4
  });

  it("바닥면적이 표를 넘으면 표값이 기준면적이 된다", () => {
    const r = computeEmployeeSportsFacilityStandard({
      employeeCount: 100,
      indoorFloorArea: 500,
      indoorZoneMultiplier: 7,
    });
    expect(r.indoorStandardBase).toBe(150);
    expect(r.indoorApplied).toBe(1050); // 150 × 7
  });

  it("실내분은 실외분에 **합산**된다 (2-라 「합한 면적」)", () => {
    const r = computeEmployeeSportsFacilityStandard({
      employeeCount: 100,
      playgroundArea: 900,
      tennisCourtArea: 500,
      indoorFloorArea: 100,
      indoorZoneMultiplier: 4,
    });
    expect(r.recognizedArea).toBe(900 + 500 + 100 * 4);
  });

  it("배율을 알 수 없으면 실내분을 산입하지 않고 그 사실을 알린다 (추정 배율 금지)", () => {
    const r = computeEmployeeSportsFacilityStandard({
      employeeCount: 100,
      playgroundArea: 900,
      indoorFloorArea: 100,
      // indoorZoneMultiplier 없음 — 세분 전 주거지역 등
    });
    expect(r.indoorZoneMultiplierMissing).toBe(true);
    expect(r.indoorApplied).toBe(0);
    expect(r.recognizedArea).toBe(900);
    expect(r.breakdown.some((b) => b.includes("적용배율"))).toBe(true);
  });
});

describe("[별표6 3호바] 표를 적용할 수 없으면 0 (추정 금지)", () => {
  it("종업원수 미입력 → 0 (⑧이 먼저 차단한다)", () => {
    const r = computeEmployeeSportsFacilityStandard({ playgroundArea: 5000 });
    expect(r.recognizedArea).toBe(0);
  });

  it("시설 면적이 모두 0이면 0", () => {
    expect(computeEmployeeSportsFacilityStandard({ employeeCount: 500 }).recognizedArea).toBe(0);
  });

  it("입력 자체가 없으면 0", () => {
    expect(computeEmployeeSportsFacilityStandard(undefined).recognizedArea).toBe(0);
  });
});
