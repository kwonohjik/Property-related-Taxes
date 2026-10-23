/**
 * 축 B §100③ 물건 전체 판정 — `propertySaleSplitJudgment` 계약 (`gb-fractional-result-blocks.plan.md` D-2).
 *
 * 지분마다 계약서(100%) 금액으로 판정하므로(`sale-split-100-3-share-scale-judgment.plan.md`) 전 지분의 판정 표가 같다.
 * 물건 전체 판정은 그 표에서 지분 적용 가액 행만 뺀 것이다. 계약서 판정이 아닌 지분이 있거나 결론이 갈리면 싣지 않는다.
 */
import { describe, it, expect } from "vitest";
import { propertySaleSplitJudgment } from "@/app/api/calc/transfer/general-building-fractional";
import type { SaleSplitJudgmentDetail } from "@/lib/tax-engine/types/transfer-split-gain.types";

const contract = (deemedUnclear: boolean, shareLand?: number): SaleSplitJudgmentDetail => ({
  deemedUnclear,
  declared: { land: 1_300, building: 300 },
  apportioned: { land: 1_200, building: 400 },
  applied: deemedUnclear ? { land: 1_200, building: 400 } : { land: 1_300, building: 300 },
  basisKind: "std_price",
  landDeviationBp: 833,
  buildingDeviationBp: 2500,
  landOver: false,
  buildingOver: false,
  era: "body_and_proviso",
  ...(shareLand !== undefined ? { share: { ownershipRatio: 0.5, applied: { land: shareLand, building: 800 - shareLand } } } : {}),
});

describe("propertySaleSplitJudgment", () => {
  it("전 지분이 계약서 판정이면 그 표에서 지분 적용 가액 행만 뺀다", () => {
    const j = propertySaleSplitJudgment([contract(false, 650), contract(false, 650)])!;
    expect(j.declared).toEqual({ land: 1_300, building: 300 });
    expect(j.applied).toEqual({ land: 1_300, building: 300 });
    expect(j.share).toBeUndefined();
  });

  it("결론이 갈리면 싣지 않는다", () => {
    expect(propertySaleSplitJudgment([contract(false, 650), contract(true, 600)])).toBeUndefined();
  });

  it("계약서 판정이 아닌 지분(`share` 없음)·판정 없는 지분이 있으면 싣지 않는다", () => {
    expect(propertySaleSplitJudgment([contract(false, 650), contract(false)])).toBeUndefined();
    expect(propertySaleSplitJudgment([contract(false, 650), undefined])).toBeUndefined();
    expect(propertySaleSplitJudgment([])).toBeUndefined();
  });
});
