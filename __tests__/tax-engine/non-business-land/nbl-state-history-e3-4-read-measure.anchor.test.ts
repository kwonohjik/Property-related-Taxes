/**
 * NBL-STATE-HISTORY-E3-④ M-1 — `otherLandReadsHouseholdHousePeriods`(엔진 core 실측) ⟺ «세대 주택 소유 기간 행이 판정에 닿는다».
 *
 * ① 기본 축(호 × 꼬리 × 이력 × 의제 × 면적 96점): 실측 = 순수 술어 `vacantLotHousePeriodsRead` (재산세 분류·근거 등이 기본 — 나목·부분 면적이 개입하지 않는다).
 * ② 확장 축(재산세 구분·근거 · 건물 바닥면적 배율 · 건물가액 2% · 수입금액비율 업종): 실측 ⊂ 순수 술어(필요조건)이고, 실측 ⟺ 「행 없음 vs 행 하나」 판정이 다르다.
 *    순수 술어는 참인데 행이 판정에 안 닿는 점(M-1)이 격자에 실제로 있다 — 읽는 점과 안 읽는 점이 모두 존재해야 한다.
 */
import { describe, it, expect } from "vitest";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES as R } from "@/lib/tax-engine/non-business-land/types";
import { vacantLotHousePeriodsRead } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { otherLandReadsHouseholdHousePeriods } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-read";
import { stateHistoryDeemedBlocks } from "@/lib/tax-engine/non-business-land/house-prior-scope";

type Loose = Record<string, unknown>;
const HO13 = "vacant_lot_1household";
const MODES = ["", "unchanged", "unknown", "changed"] as const;

function rawOf(o: { ho: string; building: boolean; mode: string; deemed: boolean; area: string; extra?: Loose }, withRow: boolean): Loose {
  const events = o.mode !== "changed" ? [] : o.building ? [{ kind: "building_built", date: "2020-06-01" }] : [{ kind: "building_removed", date: "2023-06-01", propertyTaxTypeBefore: "comprehensive" }];
  return {
    nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
    acquisitionArea: o.area, acquisitionDate: "2014-01-01", transferDate: "2024-01-01",
    nblOtherRelatedBusinessType: o.ho, nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: o.building,
    nblOtherStateHistoryMode: o.mode, nblOtherStateEvents: events,
    ...(o.deemed ? { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-12-01" } : {}),
    ...(o.extra ?? {}),
    ...(withRow ? { nblOtherHouseholdHousePeriods: [{ startDate: "2014-01-02" }] } : {}),
  };
}
const inputOf = (raw: Loose) => buildNblEngineInput(raw as never)!;
const sig = (raw: Loose) => {
  const j = judgeNonBusinessLand(inputOf(raw), R);
  return JSON.stringify({ nb: j.isNonBusinessLand, eff: j.effectiveBusinessDays, ratio: j.areaProportioning?.nonBusinessRatio ?? null, steps: j.judgmentSteps.map((s) => `${s.id}:${s.status}`) });
};

describe("① 기본 축 96점 — 실측 = 순수 술어", () => {
  const pts = ["vacant_lot_1household", "fish_farm_licensed", "none"].flatMap((ho) =>
    [false, true].flatMap((building) => MODES.flatMap((mode) => [false, true].flatMap((deemed) => ["600", "900"].map((area) => ({ ho, building, mode, deemed, area }))))),
  );
  it.each(pts.map((p) => [`${p.ho} · 건물 ${p.building} · 이력 "${p.mode}" · 의제 ${p.deemed} · ${p.area}㎡`, p] as const))("%s", (_n, p) => {
    const pure = vacantLotHousePeriodsRead({
      relatedBusinessType: p.ho, tailHasBuilding: p.building, historyChanged: p.mode === "changed",
      historyDeemedBlocked: stateHistoryDeemedBlocks({ landType: "other_land", deemedReason: p.deemed ? "auction" : "none" }), landArea: Number(p.area),
    });
    expect(otherLandReadsHouseholdHousePeriods(inputOf(rawOf(p, false)), R)).toBe(pure);
  });
});

describe("② 확장 축 — 실측 ⊂ 순수 술어 · 실측 ⟺ 행이 판정에 닿는다", () => {
  const AX: ReadonlyArray<readonly [string, boolean, Loose]> = [
    ["나지 · 별도합산 + 공지상태 근거", false, { nblOtherPropertyTaxType: "separate", nblOtherPropertyTaxBasis: "vacant_state" }],
    ["나지 · 분리과세 + 분리과세대상 근거", false, { nblOtherPropertyTaxType: "special_sum", nblOtherPropertyTaxBasis: "separate_taxation" }],
    ["나지 · 비과세 + 법정 비과세 근거", false, { nblOtherPropertyTaxType: "exempt", nblOtherPropertyTaxBasis: "statutory_exempt" }],
    ["나지 · 근거 없는 별도합산 선언(종합합산으로 접힘)", false, { nblOtherPropertyTaxType: "separate" }],
    ["건물 · 별도합산 바닥 250(이내)", true, { nblOtherPropertyTaxType: "separate", nblOtherBuildingFloorArea: "250" }],
    ["건물 · 별도합산 바닥 50(배율 초과 — 부분 면적)", true, { nblOtherPropertyTaxType: "separate", nblOtherBuildingFloorArea: "50" }],
    ["건물 · 종합합산 바닥 100 + 건물가액 2% 미달(부분 면적)", true, { nblOtherPropertyTaxType: "comprehensive", nblOtherBuildingFloorArea: "100", nblOtherBuildingValue: "1000000", nblOtherLandValue: "1000000000" }],
    ["나지 · 수입금액비율 업종", false, { nblRevenueBusinessType: "parking_operation", nblRevenueCurrentRevenue: "10000000", nblRevenueCurrentLandValue: "100000000" }],
    ["건물 · 바닥 250 + 수입금액비율 업종", true, { nblOtherPropertyTaxType: "separate", nblOtherBuildingFloorArea: "250", nblRevenueBusinessType: "parking_operation", nblRevenueCurrentRevenue: "10000000", nblRevenueCurrentLandValue: "100000000" }],
  ];
  const pts = AX.flatMap(([n, building, extra]) => (["unchanged", "changed"] as const).map((mode) => [`${n} · ${mode}`, { ho: HO13, building, mode, deemed: false, area: "600", extra }] as const));
  const measured = pts.map(([, p]) => otherLandReadsHouseholdHousePeriods(inputOf(rawOf(p, false)), R));

  it("읽는 점과 안 읽는 점이 모두 있다 · 순수 술어는 참인데 안 읽는 점(M-1)이 있다", () => {
    expect(measured.some(Boolean)).toBe(true);
    expect(measured.some((m, i) => !m && vacantLotHousePeriodsRead({ relatedBusinessType: HO13, tailHasBuilding: pts[i][1].building, historyChanged: pts[i][1].mode === "changed", historyDeemedBlocked: false, landArea: 600 }))).toBe(true);
  });
  it.each(pts.map((p, i) => [p[0], p[1], measured[i]] as const))("%s", (_n, p, m) => {
    const pure = vacantLotHousePeriodsRead({ relatedBusinessType: HO13, tailHasBuilding: p.building, historyChanged: p.mode === "changed", historyDeemedBlocked: false, landArea: 600 });
    if (m) expect(pure, "실측 ⊂ 순수 술어").toBe(true);
    expect(sig(rawOf(p, true)) !== sig(rawOf(p, false)), "행 투입 시 판정이 바뀐다").toBe(m);
  });
});
