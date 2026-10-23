/**
 * 축 B §100③ 물건 전체 판정 합치기 — `propertySaleSplitJudgment` 계약 (`gb-fractional-result-blocks.plan.md` D-2).
 *
 * 실입력은 지분이 같은 계약서를 지분율로 줄인 값이라 이탈 방향이 늘 같다 — 그때는 「모든 지분 판정이 같다」와
 * 「합산 판정과 같다」가 구별되지 않는다. 가드의 비교 대상이 **합산 판정**이라는 계약은 합성 값으로만 고정된다.
 */
import { describe, it, expect } from "vitest";
import { propertySaleSplitJudgment } from "@/app/api/calc/transfer/general-building-fractional";
import type { SaleSplitJudgmentDetail } from "@/lib/tax-engine/types/transfer-split-gain.types";

const share = (declaredLand: number, deemedUnclear: boolean): SaleSplitJudgmentDetail => ({
  deemedUnclear,
  declared: { land: declaredLand, building: 200 - declaredLand },
  apportioned: { land: 100, building: 100 },
  applied: deemedUnclear ? { land: 100, building: 100 } : { land: declaredLand, building: 200 - declaredLand },
  basisKind: "std_price",
  landDeviationBp: 0,
  buildingDeviationBp: 0,
  landOver: deemedUnclear,
  buildingOver: deemedUnclear,
  era: "body_and_proviso",
});

describe("propertySaleSplitJudgment", () => {
  it("지분 판정이 모두 불분명이어도 합산 판정이 다르면 싣지 않는다 — 비교 대상은 합산 판정", () => {
    // 지분 1 +40% · 지분 2 −40% → 합산 이탈 0% (불분명 아님)
    expect(propertySaleSplitJudgment([share(140, true), share(60, true)], undefined)).toBeUndefined();
  });

  it("판정이 같으면 금액은 지분 합, 이탈률은 판정 함수 값", () => {
    const j = propertySaleSplitJudgment([share(110, false), share(110, false)], undefined)!;
    expect(j.declared).toEqual({ land: 220, building: 180 });
    expect(j.apportioned).toEqual({ land: 200, building: 200 });
    expect(j.applied).toEqual({ land: 220, building: 180 });
    expect([j.landDeviationBp, j.buildingDeviationBp, j.deemedUnclear]).toEqual([1000, 1000, false]);
  });

  it("판정이 없는 지분이 있으면 싣지 않는다", () => {
    expect(propertySaleSplitJudgment([share(110, false), undefined], undefined)).toBeUndefined();
    expect(propertySaleSplitJudgment([], undefined)).toBeUndefined();
  });
});
