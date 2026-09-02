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

// B5 회귀 — §168의14③3호나목 취득일 소급 (상속=피상속인 취득일 / 이월과세=증여자 취득일)
describe("[B5] §168-14 ③3호나목 취득일 소급", () => {
  it("상속: 양수인 취득일(상속개시일)은 5년 이내이나 피상속인 취득일이 5년 이전 → 의제 적용", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        acquisitionDate: d("2018-01-01"), // 상속개시일 — 고시일 2.5년 전(단독으론 미적용)
        unconditionalExemption: {
          isPublicExpropriation: true,
          publicNoticeDate: d("2020-06-01"),
          expropriationAcquisitionDate: d("2010-01-01"), // 피상속인 취득일 — 고시일 10년 전
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("public_expropriation");
    expect(r.detail).toContain("2010-01-01"); // 소급 취득일 표시
  });

  it("소급 취득일 미제공 시 양수인 취득일 fallback → 5년 이내면 미적용 (회귀 baseline)", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        acquisitionDate: d("2018-01-01"),
        unconditionalExemption: {
          isPublicExpropriation: true,
          publicNoticeDate: d("2020-06-01"),
          // expropriationAcquisitionDate 미제공 → input.acquisitionDate(2018) 사용
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(false);
  });

  it("피상속인 취득일도 5년 이내이면 미적용", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        acquisitionDate: d("2019-01-01"),
        unconditionalExemption: {
          isPublicExpropriation: true,
          publicNoticeDate: d("2020-06-01"),
          expropriationAcquisitionDate: d("2017-01-01"), // 고시일 3.5년 전 — 여전히 5년 이내
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(false);
  });
});

/**
 * §168-14 ③4호 — 「법 제104조의3제1항제1호 **나목**에 해당하는 농지」 중
 *   가목 종중 소유(2005.12.31. 이전 취득) / 나목 상속개시일부터 5년 이내 양도
 *
 * 🔴 종전에는 플래그 boolean 하나만 보고 의제를 확정했다 (E5-01·V4-b, 2026-09-02 코드리뷰).
 *    본문(도시지역)·가목(취득일)·나목(5년) **세 요건 모두** 미검사였고, 형제 분기(이농·레거시 종중)는
 *    같은 파일에서 날짜를 검증하고 있었으므로 이 분기만 예외였다.
 */
describe("§168-14 ③4호 — 도시지역 內 농지 종중/상속 5년 이내", () => {
  it("가목: 도시지역 + 종중 2005.12.31 이전 취득 → 의제", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        zoneType: "commercial",
        unconditionalExemption: {
          isUrbanFarmlandJongjoongOrInherited: true,
          jongjoongAcquisitionDate: d("2004-06-01"),
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("jongjoong_or_inherit_urban_farmland");
  });

  it("나목: 도시지역 + 상속개시일부터 5년 이내 양도 → 의제", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        zoneType: "commercial",
        transferDate: d("2024-01-01"),
        unconditionalExemption: {
          isUrbanFarmlandJongjoongOrInherited: true,
          inheritanceDate: d("2020-06-01"),
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(true);
  });

  it("🔴 날짜 요건 미달(종중 2006년 취득) → 의제 안 함", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        zoneType: "commercial",
        unconditionalExemption: {
          isUrbanFarmlandJongjoongOrInherited: true,
          jongjoongAcquisitionDate: d("2006-06-01"),
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(false);
  });

  it("🔴 상속 5년 경과 → 의제 안 함", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        zoneType: "commercial",
        transferDate: d("2024-01-01"),
        unconditionalExemption: {
          isUrbanFarmlandJongjoongOrInherited: true,
          inheritanceDate: d("2018-06-01"),
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(false);
  });

  it("🔴 본문 요건: 도시지역 밖 농지는 대상이 아니다 (법 §104의3①1호 나목 한정)", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        zoneType: "agriculture_forest",
        unconditionalExemption: {
          isUrbanFarmlandJongjoongOrInherited: true,
          jongjoongAcquisitionDate: d("2004-06-01"),
        },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(false);
  });

  it("🔴 날짜 미입력 → 의제 안 함 (자동 fallback 금지)", () => {
    const r = checkUnconditionalExemption(
      baseInput({
        zoneType: "commercial",
        unconditionalExemption: { isUrbanFarmlandJongjoongOrInherited: true },
      }),
      "farmland",
    );
    expect(r.isExempt).toBe(false);
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
