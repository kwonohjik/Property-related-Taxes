/**
 * 무조건 사업용 의제 UI 상태 어댑터 (components/.../unconditional-exemption-status.ts)
 *
 * 검증 목표: UI 배너·지목별 비활성·토글 뱃지를 구동하는 evaluateUnconditionalExemption 이
 * 엔진의 "실제" 날짜/지목 판정과 일치하는가 (토글 ON 여부만 보던 과대표현 수정).
 *
 * 공익수용(§168-14③3호): 가목 고시일≤2006.12.31 / 나목 취득일≤고시일−5년.
 */
import { describe, it, expect } from "vitest";

import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { evaluateUnconditionalExemption } from "@/components/calc/transfer/nbl/unconditional-exemption-status";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

function asset(overrides: Partial<AssetForm>): AssetForm {
  return { ...makeDefaultAsset(1), ...overrides };
}

const TRANSFER = "2024-05-01";

describe("[NBL-UI] evaluateUnconditionalExemption — 엔진 실제 판정 기준", () => {
  it("토글 미선택 → anyToggleOn=false, isExempt=false, perToggle 비어있음", () => {
    const r = evaluateUnconditionalExemption(asset({}), TRANSFER);
    expect(r.anyToggleOn).toBe(false);
    expect(r.isExempt).toBe(false);
    expect(Object.keys(r.perToggle)).toHaveLength(0);
  });

  it("공익수용 가목: 고시일 2005-01-01 → isExempt=true, 뱃지 qualifies=true", () => {
    const r = evaluateUnconditionalExemption(
      asset({
        nblLandType: "other_land",
        nblZoneType: "commercial",
        acquisitionDate: "2010-01-01",
        nblExemptPublicExpropriation: true,
        nblExemptPublicNoticeDate: "2005-01-01",
      }),
      TRANSFER,
    );
    expect(r.isExempt).toBe(true);
    expect(r.perToggle.publicExpropriation?.qualifies).toBe(true);
    expect(r.matched?.legalBasis).toContain("3호 가목");
  });

  it("공익수용 나목: 고시일 2017-04-23 + 취득일 2010-01-01 (5년 이전) → isExempt=true", () => {
    const r = evaluateUnconditionalExemption(
      asset({
        nblLandType: "other_land",
        nblZoneType: "commercial",
        acquisitionDate: "2010-01-01",
        nblExemptPublicExpropriation: true,
        nblExemptPublicNoticeDate: "2017-04-23",
      }),
      TRANSFER,
    );
    expect(r.isExempt).toBe(true);
    expect(r.perToggle.publicExpropriation?.qualifies).toBe(true);
    expect(r.matched?.legalBasis).toContain("3호 나목");
  });

  it("공익수용 미충족: 고시일 2017-04-23 + 취득일 2015-01-01 (5년 이내) → isExempt=false, 지목별 진행", () => {
    const r = evaluateUnconditionalExemption(
      asset({
        nblLandType: "other_land",
        nblZoneType: "commercial",
        acquisitionDate: "2015-01-01",
        nblExemptPublicExpropriation: true,
        nblExemptPublicNoticeDate: "2017-04-23",
      }),
      TRANSFER,
    );
    expect(r.anyToggleOn).toBe(true);
    expect(r.isExempt).toBe(false); // ← 이전 과대표현: 토글 ON만으로 true 였던 부분
    expect(r.perToggle.publicExpropriation?.qualifies).toBe(false);
    expect(r.perToggle.publicExpropriation?.requirementHint).toContain("5년 이전");
  });

  it("경계: 고시일 2017-04-23 + 취득일 정확히 2012-04-23 (=고시일−5년) → 의제 성립(true)", () => {
    const r = evaluateUnconditionalExemption(
      asset({
        nblLandType: "other_land",
        nblZoneType: "commercial",
        acquisitionDate: "2012-04-23",
        nblExemptPublicExpropriation: true,
        nblExemptPublicNoticeDate: "2017-04-23",
      }),
      TRANSFER,
    );
    expect(r.isExempt).toBe(true);
  });

  it("경계: 취득일 2012-04-24 (고시일−5년 하루 초과) → 미성립(false)", () => {
    const r = evaluateUnconditionalExemption(
      asset({
        nblLandType: "other_land",
        nblZoneType: "commercial",
        acquisitionDate: "2012-04-24",
        nblExemptPublicExpropriation: true,
        nblExemptPublicNoticeDate: "2017-04-23",
      }),
      TRANSFER,
    );
    expect(r.isExempt).toBe(false);
  });

  it("지목 미선택 + 상속 토글 ON (상속일 2005·양도 2009) → categoryGroup unknown → isExempt=false", () => {
    // 농지의존 사유는 지목 선택 전까지 확정 불가 → 지목별 판정을 잠그지 않는다(원래 버그의 핵심).
    const r = evaluateUnconditionalExemption(
      asset({
        nblLandType: "", // 지목 미선택
        nblExemptInheritBefore2007: true,
        nblExemptInheritDate: "2005-06-01",
      }),
      "2009-06-01",
    );
    expect(r.anyToggleOn).toBe(true);
    expect(r.isExempt).toBe(false);
    expect(r.perToggle.inheritBefore2007?.qualifies).toBe(false);
  });

  it("상속 ③1호 충족: 농지·상속일 2005·양도 2009 → isExempt=true", () => {
    const r = evaluateUnconditionalExemption(
      asset({
        nblLandType: "farmland",
        nblZoneType: "agriculture_forest",
        nblExemptInheritBefore2007: true,
        nblExemptInheritDate: "2005-06-01",
      }),
      "2009-06-01",
    );
    expect(r.isExempt).toBe(true);
    expect(r.perToggle.inheritBefore2007?.qualifies).toBe(true);
  });

  it("공장 인접(날짜 무관): 토글 ON → 항상 qualifies=true", () => {
    const r = evaluateUnconditionalExemption(
      asset({
        nblLandType: "other_land",
        nblZoneType: "commercial",
        nblExemptFactoryAdjacent: true,
      }),
      TRANSFER,
    );
    expect(r.isExempt).toBe(true);
    expect(r.perToggle.factoryAdjacent?.qualifies).toBe(true);
  });
});
