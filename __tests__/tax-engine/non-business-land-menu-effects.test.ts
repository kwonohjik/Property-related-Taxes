/**
 * A-6 — `buildNblInputEffects`(판정 메뉴 «입력했는데 쓰이지 않은 칸» echo)가 엔진의 실제 동작과 갈라지지 않는다.
 *
 * 계획서: docs/01-plan/features/nbl-judgment-menu.engine.plan.md §4.3 · §6 A-6 · M-6.
 * 술어는 `consumes*`(엔진 `land-category.ts` 단일 소스) — 이 anchor가 전 지목 × 선언 유무 × 무조건 의제 유무에서 엔진 실측(경고 문장 · `judgment.deemedTransfer` echo)과 대조한다.
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { LandType, NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { buildNblInputEffects } from "@/lib/tax-engine/non-business-land-menu-effects";
import type { NblInputEffect } from "@/lib/tax-engine/non-business-land-menu-effects";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
/** 엔진 `engine.ts` NBL2611-V2-C1 경고의 고정 부분 */
const GRACE_IGNORED_WARNING = /유예기간\(.+\) 입력이 .+ 판정에는 반영되지 않았습니다/;

const ALL_LAND_TYPES: LandType[] = [
  "farmland", "paddy", "field", "orchard", "forest", "pasture", "vacant_lot", "building_site", "housing_site", "villa_land", "other_land", "miscellaneous", "other",
];

type Raw = Record<string, unknown>;
const baseRaw = (over: Raw = {}): Raw => ({
  nblUseDetailedJudgment: true,
  nblLandType: "farmland",
  nblZoneType: "agriculture_forest",
  acquisitionArea: "1000",
  acquisitionDate: "2015-01-01",
  transferDate: "2024-06-01",
  nblHousingFootprint: "100",
  nblIsMetropolitanArea: "no",
  nblOtherPropertyTaxType: "comprehensive",
  nblOtherStateHistoryMode: "unchanged",
  nblVillaNoUseConfirmed: true,
  ...over,
});
const GRACE = [{ reasonCode: "use_prohibited", anchorDate: "2022-01-01", endDate: "2022-12-31" }];
const DECLARED: Raw = {
  nblGracePeriods: GRACE,
  nblDeemedTransferReason: "auction",
  nblDeemedTransferDate: "2024-03-01",
  nblUrbanIncorporationDate: "2022-06-01",
};
/** 2006.12.31. 이전 상속 + 2009.12.31.까지 양도 → 무조건 사업용 의제(영 §168의14③1호 — 농·임·목) */
const UNCOND: Raw = {
  acquisitionCause: "inheritance", acquisitionDate: "2005-05-01", decedentAcquisitionDate: "1980-01-01", transferDate: "2009-06-01",
  nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "2007-01-01", endDate: "2007-12-31" }],
  nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2009-03-01", nblUrbanIncorporationDate: "2008-06-01",
};

function judge(raw: Raw, landType?: LandType) {
  const mapped = buildNblEngineInput(raw as never)!;
  // 건물(비주택) 부수토지는 바닥면적이 없으면 엔진이 입력 오류로 던진다 — 효과 비교와 무관한 필수값만 채운다.
  const input: NonBusinessLandInput = landType ? { ...mapped, landType, ...(landType === "building_site" ? { buildingFootprint: 100 } : {}) } : mapped;
  const judgment = judgeNonBusinessLand(input, R);
  return { input, judgment, effects: buildNblInputEffects(input, judgment) };
}

describe("A-6 — 전 지목 × 선언 유무 × 무조건 의제 유무", () => {
  const cases: { name: string; raw: Raw; uncond: boolean; declared: boolean }[] = [
    { name: "미선언", raw: baseRaw(), uncond: false, declared: false },
    { name: "선언 3종", raw: baseRaw(DECLARED), uncond: false, declared: true },
    { name: "선언 3종 + 무조건 의제", raw: baseRaw(UNCOND), uncond: true, declared: true },
  ];

  it.each(ALL_LAND_TYPES.flatMap((t) => cases.map((c) => [t, c.name, c] as const)))("%s · %s", (landType, _n, c) => {
    const { judgment, effects } = judge(c.raw, landType);
    const uncondApplied = !!judgment.unconditionalExemption?.isApplied;
    // ③1호는 농·임·목만 — 그 지목에서는 사례 정의대로 성립해야 하고, 다른 지목에서는 성립하지 않아도 된다(그때는 선언 3종 사례와 같다).
    const agri = ["farmland", "paddy", "field", "orchard", "forest", "pasture"].includes(landType);
    if (c.uncond && agri) expect(uncondApplied, "무조건 의제 성립 여부가 사례 정의와 같다").toBe(true);
    if (!c.uncond) expect(uncondApplied).toBe(false);

    // 유예: `ignored_by_category` ⇔ 엔진이 「반영되지 않았습니다」를 고지한다
    const graceWarned = judgment.warnings.some((w) => GRACE_IGNORED_WARNING.test(w));
    expect(effects.gracePeriods === "ignored_by_category", `gracePeriods=${effects.gracePeriods} · 경고=${graceWarned}`).toBe(graceWarned);

    // 양도일 의제: `applied` ⇔ 엔진이 `deemedTransfer`를 싣는다
    expect(effects.deemedTransfer === "applied", `deemedTransfer=${effects.deemedTransfer}`).toBe(!!judgment.deemedTransfer);

    // 무조건 의제가 성립하면 선언한 칸은 전부 overridden · 선언하지 않았으면 전부 not_declared
    const all: NblInputEffect[] = [effects.gracePeriods, effects.deemedTransfer, effects.urbanIncorporation];
    if (!c.declared) expect(all).toEqual(["not_declared", "not_declared", "not_declared"]);
    if (uncondApplied && c.declared) expect(all).toEqual(["overridden_by_unconditional", "overridden_by_unconditional", "overridden_by_unconditional"]);
  });

  it("지목별 기대값 표 (소비표 `INPUT_CONSUMPTION` 실측) — 선언 3종·무조건 의제 아님", () => {
    const expected: Partial<Record<LandType, [NblInputEffect, NblInputEffect, NblInputEffect]>> = {
      farmland: ["applied", "applied", "applied"],
      forest: ["applied", "applied", "applied"],
      pasture: ["applied", "applied", "applied"],
      villa_land: ["applied", "applied", "ignored_by_category"],
      other_land: ["applied", "applied", "ignored_by_category"],
      housing_site: ["applied", "ignored_by_category", "ignored_by_category"],
      building_site: ["ignored_by_category", "ignored_by_category", "ignored_by_category"],
    };
    for (const [landType, want] of Object.entries(expected) as [LandType, [NblInputEffect, NblInputEffect, NblInputEffect]][]) {
      const { effects } = judge(baseRaw(DECLARED), landType);
      expect([effects.gracePeriods, effects.deemedTransfer, effects.urbanIncorporation], landType).toEqual(want);
    }
  });

  it("양도일 의제 사유만 있고 날짜가 없으면 엔진이 쓰지 않는다 — 선언하지 않은 것으로 읽는다(⑧이 날짜 누락을 막는다)", () => {
    const { effects, judgment } = judge(baseRaw({ nblDeemedTransferReason: "auction", nblDeemedTransferDate: "" }));
    expect(judgment.deemedTransfer).toBeUndefined();
    expect(effects.deemedTransfer).toBe("not_declared");
  });
});
