/**
 * anchor — 무조건 사업용 의제 `legalBasis` 인용 (U3-05 · E5-05, 2026-09-02 코드리뷰)
 *
 * 두 가지를 고정한다.
 *
 * 1. **U3-05 — 법령명·법/령/규칙 명시**
 *    종전에는 「시행령 §168조의14 ③ 1호」처럼 법령명 없이 문자열 리터럴을 들고 있었고,
 *    그것이 결과 카드 ⑦ 「적용 법령」 칩에 그대로 나갔다. 사용자는 「소득세법 시행령」인지
 *    「지방세법 시행령」인지 화면만으로 알 수 없다. 커밋 `7f44d95a`가 세운 규칙
 *    (「조문 인용에 법령명·법/령/규칙을 명시」)을 이 경로에도 강제한다.
 *
 * 2. **E5-05 — 종중 의제의 근거는 지목마다 다르다**
 *    종전에는 농·임·목 전부에 「§168조의14 ③ 4호 가목 · §168-8 ③ 6호 등」을 붙였다.
 *    둘 다 **농지 전용 조문**이라 임야·목장 판정의 근거가 될 수 없다. 본문 실측(mst=286211):
 *      · 농지   — §168의8③6호  「종중이 소유한 **농지**(2005년 12월 31일 이전에 취득한 것에 한한다)」
 *      · 임야   — §168의9③8호  「종중이 소유한 **임야**(2005년 12월 31일 이전에 취득한 것에 한한다)」
 *      · 목장용지 — §168의10②2호 「종중이 소유한 **목장용지**(2005년 12월 31일 이전에 취득한 것에 한한다)」
 *
 *    ⚠️ 농지를 §168의14③4호가목이 **아니라** §168의8③6호로 인용하는 이유: 4호가목 본문은
 *       「법 §104의3①1호 **나목**에 해당하는 농지」, 즉 **도시지역 안의** 농지에 한정된다.
 *       이 레거시 분기는 도시지역을 보지 않으므로 요건이 더 좁은 4호가목은 근거가 못 된다.
 */
import { describe, it, expect } from "vitest";
import { checkUnconditionalExemption } from "@/lib/tax-engine/non-business-land/unconditional-exemption";
import { NBL } from "@/lib/tax-engine/legal-codes/transfer-nbl";
import type { NonBusinessLandInput, LandCategoryGroup } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

function base(over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landCategory: "farmland",
    acquisitionDate: new Date("2000-01-01"),
    transferDate: new Date("2008-06-01"),
    landArea: 1000,
    rules: DEFAULT_NON_BUSINESS_LAND_RULES,
    ...over,
  } as NonBusinessLandInput;
}

describe("[U3-05] 무조건 의제 legalBasis에 법령명이 들어간다", () => {
  /** 각 사유를 실제로 성립시키는 입력 — 「분기에 도달했는가」까지 확인한다. */
  const CASES: Array<{ name: string; input: NonBusinessLandInput; group: LandCategoryGroup }> = [
    {
      name: "③1호 2006.12.31 이전 상속",
      group: "farmland",
      input: base({
        unconditionalExemption: {
          isInheritedBefore2007: true,
          inheritanceDate: new Date("2006-05-01"),
        },
      }),
    },
    {
      name: "③2호 20년 이상 소유",
      group: "farmland",
      input: base({ unconditionalExemption: { ownedOver20YearsBefore2007: true } }),
    },
    {
      name: "③1의2호 직계존속 8년 재촌자경",
      group: "farmland",
      input: base({
        zoneType: "green",
        unconditionalExemption: { isAncestor8YearFarming: true },
      }),
    },
    {
      name: "③3호 가목 고시일 2006.12.31 이전",
      group: "other_land",
      input: base({
        unconditionalExemption: {
          isPublicExpropriation: true,
          publicNoticeDate: new Date("2006-01-01"),
        },
      }),
    },
    {
      name: "③3호 나목 고시일 5년 이전 취득",
      group: "other_land",
      input: base({
        unconditionalExemption: {
          isPublicExpropriation: true,
          publicNoticeDate: new Date("2010-01-01"),
        },
      }),
    },
    {
      name: "③4호 가목 도시지역 농지 종중",
      group: "farmland",
      input: base({
        zoneType: "residential",
        unconditionalExemption: {
          isUrbanFarmlandJongjoongOrInherited: true,
          jongjoongAcquisitionDate: new Date("2004-01-01"),
        },
      }),
    },
    {
      name: "③4호 나목 도시지역 농지 상속 5년 이내",
      group: "farmland",
      input: base({
        zoneType: "residential",
        transferDate: new Date("2008-06-01"),
        unconditionalExemption: {
          isUrbanFarmlandJongjoongOrInherited: true,
          inheritanceDate: new Date("2005-01-01"),
        },
      }),
    },
    {
      name: "③5호 → 시행규칙 §83의5④1호 공장 오염피해 인접토지",
      group: "other_land",
      input: base({ unconditionalExemption: { isFactoryAdjacent: true } }),
    },
    {
      name: "③5호 → 시행규칙 §83의5④2호 이농 농지",
      group: "farmland",
      input: base({
        transferDate: new Date("2009-06-01"),
        unconditionalExemption: { isInong: true, inongDate: new Date("2006-01-01") },
      }),
    },
  ];

  it.each(CASES)("$name — 의제가 성립하고 legalBasis가 법령명으로 시작한다", ({ input, group }) => {
    const r = checkUnconditionalExemption(input, group);
    expect(r.isExempt).toBe(true);
    expect(r.legalBasis).toBeDefined();
    // 「소득세법 시행령」 / 「소득세법 시행규칙」 — 법령명 + 법/령/규칙 구분이 모두 있어야 한다.
    expect(r.legalBasis).toMatch(/^소득세법 (시행령|시행규칙) /);
  });

  it("어느 사유도 「시행령 §…」로만 시작하지 않는다 (법령명 누락 회귀 차단)", () => {
    for (const { input, group } of CASES) {
      const r = checkUnconditionalExemption(input, group);
      expect(r.legalBasis?.startsWith("시행령")).toBe(false);
      expect(r.legalBasis?.startsWith("시행규칙")).toBe(false);
    }
  });
});

describe("[E5-05] 레거시 종중 의제의 legalBasis는 지목마다 다르다", () => {
  const JONGJOONG = {
    isJongjoongOwned: true,
    jongjoongAcquisitionDate: new Date("2004-03-01"),
  };

  it.each([
    ["farmland", NBL.JONGJOONG_FARMLAND],
    ["forest", NBL.JONGJOONG_FOREST],
    ["pasture", NBL.JONGJOONG_PASTURE],
  ] as const)("%s → %s", (group, expected) => {
    const r = checkUnconditionalExemption(
      base({ unconditionalExemption: JONGJOONG }),
      group as LandCategoryGroup,
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("jongjoong_owned");
    expect(r.legalBasis).toBe(expected);
  });

  it("임야·목장에 농지 전용 조문(§168의8③6호·§168의14③4호가목)이 실리지 않는다", () => {
    for (const group of ["forest", "pasture"] as const) {
      const r = checkUnconditionalExemption(base({ unconditionalExemption: JONGJOONG }), group);
      expect(r.legalBasis).not.toContain("§168조의8");
      expect(r.legalBasis).not.toContain("§168조의14");
    }
  });

  it("세 지목의 인용이 서로 다르다 (한 조문으로 접히는 회귀 차단)", () => {
    const seen = (["farmland", "forest", "pasture"] as const).map(
      (g) => checkUnconditionalExemption(base({ unconditionalExemption: JONGJOONG }), g).legalBasis,
    );
    expect(new Set(seen).size).toBe(3);
  });
});
