/**
 * Phase C-3 유닛 테스트 — pasture.ts (PDF p.1702)
 */
import { describe, it, expect } from "vitest";
import { judgePasture } from "@/lib/tax-engine/non-business-land/pasture";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { getLivestockStandardArea } from "@/lib/tax-engine/non-business-land/data/livestock-standards";

const d = (iso: string) => new Date(iso);

function base(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "pasture",
    landArea: 5000,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    pasture: {
      isLivestockOperator: true,
      livestockType: "한우",
      livestockCount: 50,
      standardArea: 10000,
    },
    businessUsePeriods: [],
    gracePeriods: [],
    ...partial,
  };
}

describe("C-3 목장용지 PDF p.1702 흐름도", () => {
  it("축산업 10년 + 기준면적 이내 + 도시지역 밖 → 사업용", () => {
    const r = judgePasture(base(), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("도시지역 밖");
  });

  it("축산업 미영위 + 거주사업관련 없음 → 비사업용", () => {
    const r = judgePasture(
      base({
        pasture: {
          isLivestockOperator: false,
          standardArea: 10000,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
  });

  it("상속 3년 이내 목장용지 → 사업용 (사용의제)", () => {
    const r = judgePasture(
      base({
        pasture: {
          isLivestockOperator: false,
          standardArea: 10000,
          inheritanceDate: d("2023-06-01"),
        },
        transferDate: d("2024-06-01"),
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("거주·사업관련");
  });

  it("기준면적 초과 → 초과분 비사업용 (면적 안분)", () => {
    const r = judgePasture(
      base({
        landArea: 15000,
        pasture: {
          isLivestockOperator: true,
          livestockType: "한우",
          livestockCount: 50,
          standardArea: 10000,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(5000);
  });

  it("도시지역(일반주거) 편입 후 3년 경과 → 비사업용", () => {
    const r = judgePasture(
      base({
        zoneType: "general_residential",
        urbanIncorporationDate: d("2019-01-01"),
        transferDate: d("2024-01-01"), // 5년 경과
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.reason).toContain("편입유예 외");
  });
});

describe("갭 3c — 목장 자동산출 warning 인용 정정 (별표 1의3)", () => {
  // AT-PASTURE-CITE-1 (Pre-Do): standardArea 미입력 → 자동산출 분기 강제 진입.
  // 영문 축종키('hanwoo')를 써야 lookup>0 으로 warning 발생(한글 '한우'는 lookup 0).
  it("AT-PASTURE-CITE-1: 자동산출 warning은 「소득세법 시행령 별표 1의3」을 인용하고 「축산법」을 인용하지 않는다", () => {
    const r = judgePasture(
      base({
        landArea: 10000, // hanwoo_breeding 7,512.5㎡/두 × 1두 = 7,512.5 < 10000 → 기준면적 초과 분기
        pasture: {
          isLivestockOperator: true,
          livestockType: "hanwoo_breeding",
          livestockCount: 1,
          // standardArea 미지정 → getLivestockStandardArea 자동 산출 진입
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    const autoWarning = r.warnings?.find((w) => w.includes("자동 산출"));
    expect(autoWarning).toBeDefined();
    expect(autoWarning).toContain("소득세법 시행령 별표 1의3");
    expect(autoWarning).not.toContain("축산법");
  });

  // AT-PASTURE-CITE-2: 별표1의3 정본 반영. 상세 anchor는 livestock-standards.test.ts.
  // 🔴 기준면적은 **보유한 시설만** 더한다 — 표의 4개 열은 항목별 인정 한도다.
  //    같은 축종·두수라도 보유 조합에 따라 값이 갈리므로 고정 상수로 단언할 수 없다.
  it("AT-PASTURE-CITE-2: 별표1의3 정본 반영 — 보유 조합별로 값이 갈린다", () => {
    const ALL = { hasFacility: true, hasGrassland: true, hasFodder: true };
    // 한우 사육 1두: 축사 7.5 + 부대시설 5 + 초지 5,000 + 사료포 2,500
    expect(getLivestockStandardArea("hanwoo_breeding", 1, ALL)).toBe(7512.5);
    expect(getLivestockStandardArea("dairy", 1, ALL)).toBe(7518);
    // 초지 없이 사료포만 쓰는 농가는 초지 몫을 받지 못한다
    expect(getLivestockStandardArea("hanwoo_breeding", 1, { ...ALL, hasGrassland: false })).toBe(2512.5);
  });
});

/**
 * E2-06 (2026-09-02 코드리뷰) — **프로덕션에서 실제로 도는 경로**로 안전망을 옮긴다.
 *
 * 위 「C-3 흐름도」 케이스 4건은 전부 `pasture.standardArea` **직접입력**을 쓴다. 그런데
 * 그 필드를 채우는 입력 경로가 없다 — UI에 위젯이 없고 `buildPasture`도 매핑하지 않아
 * 프로덕션에서는 항상 `undefined`다. 즉 주요 회귀 케이스가 **도달 불가능한 분기**만 고정하고
 * 있었고, 실제 경로(축종 × 두수 × 보유시설 자동산출)의 안전망은 warning 인용 1건뿐이었다.
 *
 * ⚠️ 축종키는 **영문**이어야 한다(`hanwoo_breeding`). 한글 「한우」는 별표 1의3 lookup에서
 *    0을 반환해 자동산출이 성립하지 않는다 — 그 함정이 과거에 다른 테스트를 무의미하게 만든 적이 있다.
 */
describe("[E2-06] 자동산출 경로(축종×두수×보유시설) — UI가 실제로 태우는 분기", () => {
  const ALL_FACILITIES = { hasFacility: true, hasGrassland: true, hasFodder: true };

  /** standardArea를 **주지 않고** 자동산출만으로 판정시킨다. */
  function autoBase(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
    return base({
      pasture: {
        isLivestockOperator: true,
        livestockType: "hanwoo_breeding",
        livestockCount: 1,
        ...ALL_FACILITIES,
      },
      ...partial,
    });
  }

  it("기준면적 이내 → 사업용 (한우 사육 1두 전 시설 = 7,512.5㎡ ≥ 토지 5,000㎡)", () => {
    const r = judgePasture(autoBase({ landArea: 5000 }), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(getLivestockStandardArea("hanwoo_breeding", 1, ALL_FACILITIES)).toBe(7512.5);
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning).toBeUndefined();
  });

  it("기준면적 초과 → 초과분만 비사업용으로 안분 (10,000 − 7,512.5 = 2,487.5㎡)", () => {
    const r = judgePasture(autoBase({ landArea: 10000 }), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(2487.5);
    // E2-07 회귀 — businessUseRatio는 **사업용** 비율이지 비사업용 비율이 아니다.
    // (nonBusinessRatio는 엔진에서 소수 넷째자리로 반올림되므로 그 값과의 관계로 단언한다)
    const nonBizRatio = r.areaProportioning!.nonBusinessRatio;
    expect(nonBizRatio).toBeGreaterThan(0.24);
    expect(r.businessUseRatio).toBe(1 - nonBizRatio);
  });

  it("보유시설을 빼면 한도가 줄어 같은 토지가 비사업용으로 기운다 (초지 미보유 = 2,512.5㎡)", () => {
    const r = judgePasture(
      autoBase({
        landArea: 5000,
        pasture: {
          isLivestockOperator: true,
          livestockType: "hanwoo_breeding",
          livestockCount: 1,
          ...ALL_FACILITIES,
          hasGrassland: false,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(getLivestockStandardArea("hanwoo_breeding", 1, { ...ALL_FACILITIES, hasGrassland: false }))
      .toBe(2512.5);
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(2487.5);
  });

  it("두수가 늘면 한도가 선형으로 늘어난다 (3두 = 22,537.5㎡ → 10,000㎡ 토지 전량 사업용)", () => {
    const r = judgePasture(
      autoBase({
        landArea: 10000,
        pasture: {
          isLivestockOperator: true,
          livestockType: "hanwoo_breeding",
          livestockCount: 3,
          ...ALL_FACILITIES,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(getLivestockStandardArea("hanwoo_breeding", 3, ALL_FACILITIES)).toBe(22537.5);
    expect(r.isBusiness).toBe(true);
  });

  // E2-08 — 두수가 기준면적에 선형으로 곱해지므로 **어떤 산정방법으로 뽑은 두수인지**가 한도를 가른다.
  // 별표 1의3 제2호는 3가지 중 납세자가 선택하도록 정하는데 엔진은 입력값을 그대로 쓴다.
  // 그 전제를 warning이 드러내야 사용자가 대조할 수 있다.
  it("[E2-08] 자동산출 warning이 별표 1의3 제2호 산정방법 전제를 드러낸다", () => {
    const r = judgePasture(autoBase({ landArea: 10000 }), DEFAULT_NON_BUSINESS_LAND_RULES);
    const w = r.warnings?.find((x) => x.includes("자동 산출"));
    expect(w).toBeDefined();
    expect(w).toContain("별표 1의3 제2호");
    expect(w).toContain("입력값을 그대로 사용");
  });
});
