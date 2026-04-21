/**
 * Phase B-6 유닛 테스트 — unconditional-exemption.ts (§168-14 ③)
 */
import { describe, it, expect } from "vitest";
import { checkUnconditionalExemption } from "@/lib/tax-engine/non-business-land/unconditional-exemption";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

function baseInput(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "farmland",
    landArea: 1000,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2000-01-01"),
    transferDate: d("2008-06-01"),
    businessUsePeriods: [],
    gracePeriods: [],
    ...partial,
  };
}

describe("§168-14 ③1호 — 2006.12.31 이전 상속 + 2009.12.31까지 양도", () => {
  it("조건 충족 → 의제 사업용", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        unconditionalExemption: {
          isInheritedBefore2007: true,
          inheritanceDate: d("2005-06-01"),
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("inheritance_before_2007");
  });

  it("2010년 양도 → 의제 미적용", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        transferDate: d("2010-01-01"),
        unconditionalExemption: {
          isInheritedBefore2007: true,
          inheritanceDate: d("2005-06-01"),
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(false);
  });
});

describe("§168-14 ③1의2호 — 8년 재촌자경 상속·증여", () => {
  it("비도시 농지 + 플래그 true → 의제 사업용", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        zoneType: "agriculture_forest",
        unconditionalExemption: { isAncestor8YearFarming: true },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("ancestor_8year_farming");
  });

  it("양도 당시 도시지역(상업) → 의제 제외 ⚠️ v2 신규", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        zoneType: "commercial",
        unconditionalExemption: { isAncestor8YearFarming: true },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(false);
  });

  it("농지가 아닌 대지(other_land) → 의제 미적용", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        landType: "other_land",
        zoneType: "agriculture_forest",
        unconditionalExemption: { isAncestor8YearFarming: true },
      }),
      "other_land",
    );
    expect(r.isExempt).toBe(false);
  });
});

describe("§168-14 ③3호 — 공익수용", () => {
  it("사업인정고시일 2006.12.31 이전 → 의제", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        acquisitionDate: d("2005-01-01"),
        unconditionalExemption: {
          isPublicExpropriation: true,
          publicNoticeDate: d("2006-06-01"),
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("public_expropriation");
  });

  it("고시일 5년 이전 취득 → 의제", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        acquisitionDate: d("2010-01-01"),
        unconditionalExemption: {
          isPublicExpropriation: true,
          publicNoticeDate: d("2020-06-01"), // 10년 간격
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(true);
  });

  it("고시일 5년 이내 취득 → 의제 미적용", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        acquisitionDate: d("2018-01-01"),
        unconditionalExemption: {
          isPublicExpropriation: true,
          publicNoticeDate: d("2020-06-01"), // 2.5년 간격
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(false);
  });
});

describe("§168-14 ③4호 — 도시지역 內 농지 종중/상속 5년 이내", () => {
  it("플래그 true + 농지 → 의제", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        zoneType: "commercial",
        unconditionalExemption: { isUrbanFarmlandJongjoongOrInherited: true },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("jongjoong_or_inherit_urban_farmland");
  });
});

describe("레거시 플래그", () => {
  it("공장인접 토지 → 의제", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        unconditionalExemption: { isFactoryAdjacent: true },
      }),
      "other_land",
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("factory_adjacent");
  });

  it("종중 2005.12.31 이전 취득 농지 → 의제", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        unconditionalExemption: {
          isJongjoongOwned: true,
          jongjoongAcquisitionDate: d("2003-05-01"),
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("jongjoong_owned");
  });

  it("이농 조건 충족 → 의제 (레거시)", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        transferDate: d("2008-01-01"),
        unconditionalExemption: {
          isInong: true,
          inongDate: d("2004-06-01"),
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("inong");
  });
});

describe("unconditionalExemption 미제공 → 의제 없음", () => {
  it("undefined → none", () => {
    const r = checkUnconditionalExemption(baseInput(), "farmland");
    expect(r.isExempt).toBe(false);
    expect(r.reason).toBe("none");
  });
});
