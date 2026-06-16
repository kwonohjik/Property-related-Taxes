/**
 * 갭 2 — 이농 DEAD 필드 복구 (§168의14③5호 → 시행규칙 §83의5④2호)
 *
 * Pre-Do(TDD): 엔진(unconditional-exemption.ts:130-144)은 isInong/inongDate를 이미 소비하나,
 *   buildUnconditionalExemption의 `has` 게이트·매핑에 nblExemptInong이 없어(+ Zod 미정의)
 *   입력 채널 전무 → 무조건 사업용 의제가 작동하지 않음(wired-but-disconnected).
 *
 * 본 anchor: (1) form-mapper 단위 — nblExemptInong → unconditionalExemption.isInong/inongDate,
 *   (2) 풀 엔진 — 농지·이농일≤2006.12.31·양도≤2009.12.31 → isNonBusinessLand=false,
 *   (3) 대조 — 양도 2009.12.31 초과 → 의제 미적용(true). 현행은 (1)(2) FAIL.
 *
 * 근거: 소득세법 시행규칙 §83의5④2호 — 2006.12.31 이전 이농자가 이농 당시 소유 농지를 2009.12.31까지 양도.
 */
import { describe, it, expect } from "vitest";

import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land";

function inongRaw(overrides: Record<string, unknown> = {}) {
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest",
    acquisitionArea: "1000",
    acquisitionDate: "2000-01-01",
    transferDate: "2009-06-01",
    nblExemptInong: true,
    nblExemptInongDate: "2005-06-01",
    ...overrides,
  };
}

describe("[NBL-INONG] 갭2 이농 의제 (§83의5④2호)", () => {
  it("form-mapper: nblExemptInong → unconditionalExemption.isInong/inongDate 매핑", () => {
    const input = buildNblEngineInput(inongRaw() as never);
    expect(input).toBeDefined();
    // (현행 FAIL) buildUnconditionalExemption has 게이트·매핑에 이농 부재 → undefined
    expect(input!.unconditionalExemption?.isInong).toBe(true);
    expect(input!.unconditionalExemption?.inongDate).toBeInstanceOf(Date);
  });

  it("풀 엔진: 농지·이농일≤2006.12.31·양도≤2009.12.31 → 무조건 사업용(isNonBusinessLand=false)", () => {
    const input = buildNblEngineInput(inongRaw() as never);
    const r = judgeNonBusinessLand(input!);
    // (현행 FAIL) 입력 채널 부재 → 의제 미진입 → 비사업용 true
    expect(r.isNonBusinessLand).toBe(false);
  });

  it("대조: 양도 2010-06-01 (2009.12.31 초과) → 의제 미적용·비사업용(true)", () => {
    const input = buildNblEngineInput(inongRaw({ transferDate: "2010-06-01" }) as never);
    const r = judgeNonBusinessLand(input!);
    expect(r.isNonBusinessLand).toBe(true);
  });

  it("경계: 이농일 2006-12-31·양도 2009-12-31 정확 (cutoff 당일 포함, ≤) → 의제 적용(false)", () => {
    const input = buildNblEngineInput(
      inongRaw({ nblExemptInongDate: "2006-12-31", transferDate: "2009-12-31" }) as never,
    );
    const r = judgeNonBusinessLand(input!);
    expect(r.isNonBusinessLand).toBe(false);
  });

  it("경계: 양도 2010-01-01 (2009.12.31 하루 초과) → 의제 미적용(true)", () => {
    const input = buildNblEngineInput(
      inongRaw({ nblExemptInongDate: "2006-12-31", transferDate: "2010-01-01" }) as never,
    );
    const r = judgeNonBusinessLand(input!);
    expect(r.isNonBusinessLand).toBe(true);
  });

  it("경계: 이농일 2007-01-01 (2006.12.31 하루 초과) → 의제 미적용(true)", () => {
    const input = buildNblEngineInput(
      inongRaw({ nblExemptInongDate: "2007-01-01", transferDate: "2009-06-01" }) as never,
    );
    const r = judgeNonBusinessLand(input!);
    expect(r.isNonBusinessLand).toBe(true);
  });
});
