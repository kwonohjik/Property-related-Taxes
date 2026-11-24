/**
 * NBL-STATE-HISTORY-E3-④ R-1 parity 격자 — 술어 `vacantLotHousePeriodsRead`(④ 전송 · ⑤ 노출 · ⑧ 요구가 부르는 단일 소스)가 «엔진이 실제로 행을 읽는가»와 같은지 대조한다(E3-② 교훈).
 *
 * 격자: 호 {13호 · 다목 11호 · 호 없음} × 꼬리 {나지 · 건물} × 이력 {미선택 · unchanged · unknown · changed} × 양도일 의제 {없음 · 경매} × 면적 {600 · 900} = 96점.
 * 각 점에서 «판정을 바꾸는 행 하나»(소유 첫날부터 양도일까지 세대 주택 소유 — 읽히면 13호 구간이 0이 된다)를 넣고 **판정(비사업용 여부·사업용 일수·면적 안분)·echo**가 달라지는지 본다.
 *   술어 참 ⟺ 행 투입 시 결과가 변함 — 어긋나면 ④⑤⑧(UI)과 엔진이 갈린다(막다른 길 · 침묵 무시).
 * 참인데 변하지 않는 점은 «읽지만 영향 없음»(허용 목록에 사유와 함께 명시) · 거짓인데 변하는 점은 0건이어야 한다.
 */
import { describe, it, expect } from "vitest";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { vacantLotHousePeriodsRead } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { stateHistoryDeemedBlocks } from "@/lib/tax-engine/non-business-land/house-prior-scope";

type Ho = "vacant_lot_1household" | "fish_farm_licensed" | "none";
type Mode = "" | "unchanged" | "unknown" | "changed";
interface Point { ho: Ho; tail: "bare" | "building"; mode: Mode; deemed: boolean; area: string }

const HOS: Ho[] = ["vacant_lot_1household", "fish_farm_licensed", "none"];
const MODES: Mode[] = ["", "unchanged", "unknown", "changed"];

function rawOf(p: Point, withRow: boolean): Record<string, unknown> {
  const building = p.tail === "building";
  const events = p.mode !== "changed" ? [] : building ? [{ kind: "building_built", date: "2020-06-01" }] : [{ kind: "building_removed", date: "2023-06-01", propertyTaxTypeBefore: "comprehensive" }];
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    acquisitionArea: p.area,
    acquisitionDate: "2014-01-01",
    transferDate: "2024-01-01",
    nblOtherRelatedBusinessType: p.ho,
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherHasBuilding: building,
    nblOtherStateHistoryMode: p.mode,
    nblOtherStateEvents: events,
    ...(p.deemed ? { nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-12-01" } : {}),
    ...(withRow ? { nblOtherHouseholdHousePeriods: [{ startDate: "2014-01-02" }] } : {}),
  };
}

const judge = (raw: Record<string, unknown>) => judgeNonBusinessLand(buildNblEngineInput(raw as never)!, DEFAULT_NON_BUSINESS_LAND_RULES);
const sig = (raw: Record<string, unknown>) => {
  const j = judge(raw);
  return JSON.stringify({ nb: j.isNonBusinessLand, eff: j.effectiveBusinessDays, ratio: j.areaProportioning?.nonBusinessRatio ?? null, steps: j.judgmentSteps.map((s) => `${s.id}:${s.status}`), echo: j.periodEvaluation?.vacantLot !== undefined });
};

const GRID: Point[] = HOS.flatMap((ho) =>
  (["bare", "building"] as const).flatMap((tail) => MODES.flatMap((mode) => [false, true].flatMap((deemed) => ["600", "900"].map((area) => ({ ho, tail, mode, deemed, area } as Point))))),
);

/** 술어가 참이지만 «행 하나»로는 판정이 변하지 않는 점 — 읽지만 영향이 없다(사유). */
const READ_BUT_NO_EFFECT: ReadonlyArray<{ match: (p: Point) => boolean; reason: string }> = [];

describe("E3e-2 R-1 술어 ⟺ 엔진이 행을 읽는다 (96점 격자)", () => {
  const readsOf = (p: Point) =>
    vacantLotHousePeriodsRead({ relatedBusinessType: p.ho, tailHasBuilding: p.tail === "building", historyChanged: p.mode === "changed", historyDeemedBlocked: p.deemed, landArea: Number(p.area) });

  it("격자 규모 96 · 술어 참 17점(13호 꼬리 나지 16 + 꼬리 건물 × changed × 의제 없음 × 600㎡ 1) — 비어 있는 검증이 아니다", () => {
    expect(GRID.length).toBe(96);
    const reading = GRID.filter(readsOf);
    expect(reading.length).toBe(17);
    expect(reading.every((p) => p.ho === "vacant_lot_1household")).toBe(true);
    // 참인 17점 전부 행 하나가 결과를 실제로 바꾼다 — 면제 목록이 비어 있다
    expect(reading.filter((p) => sig(rawOf(p, false)) === sig(rawOf(p, true))).length).toBe(0);
  });

  it.each(GRID.map((p) => [`${p.ho} · 꼬리 ${p.tail} · 이력 "${p.mode}" · 의제 ${p.deemed ? "경매" : "없음"} · ${p.area}㎡`, p] as const))("%s", (_n, p) => {
    const predicate = vacantLotHousePeriodsRead({
      relatedBusinessType: p.ho,
      tailHasBuilding: p.tail === "building",
      historyChanged: p.mode === "changed",
      historyDeemedBlocked: stateHistoryDeemedBlocks({ landType: "other_land", deemedReason: p.deemed ? "auction" : "none" }),
      landArea: Number(p.area),
    });
    const changed = sig(rawOf(p, false)) !== sig(rawOf(p, true));
    if (predicate) {
      const excused = READ_BUT_NO_EFFECT.find((e) => e.match(p));
      if (!changed) expect(excused, `술어 참인데 행이 판정을 바꾸지 않는다 — 허용 목록에 사유가 있어야 한다`).toBeDefined();
    } else {
      expect(changed, `술어 거짓인데 행이 판정을 바꾼다 — ④⑤⑧이 안 요구하는데 엔진은 읽는다(침묵 무시 반대 방향)`).toBe(false);
    }
  });
});
