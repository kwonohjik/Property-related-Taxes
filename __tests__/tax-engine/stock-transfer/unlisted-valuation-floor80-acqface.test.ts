/**
 * 비상장 §165④1 80% 하한 — acqFaceValueOnly(사례 49) 경로 결손법인 anchor
 *
 * 버그(dual-truth): acqFace 경로가 `weighted > 0` 가드 탓에 결손법인(순손익가치 음수,
 * 가중평균 ≤ 0)에서 80% 하한(na×0.8)을 미발동 → 양도기준시가 0 반환(환산 실패).
 * MAIN 경로는 `floor80 > weighted`만으로 음수 weighted도 하한 적용 → 두 경로 정렬.
 *
 * 이 anchor가 깨지면 `weighted > 0` 가드가 다시 들어온 것(회귀).
 */
import { describe, it, expect } from "vitest";
import { calcUnlistedValuation } from "@/lib/tax-engine/stock-transfer/stock-valuation-unlisted";

const lossCompany = {
  shareCount: 1000,
  transferDate: new Date("2024-06-01"),
  transferYearNetIncomePerShare: -5000, // 결손 → weighted = (-5000*3 + 2000*2)/5 = -2200
  transferYearNetAssetPerShare: 2000,   // 80% 하한 = 1600
  faceValuePerShare: 500,
} as const;

describe("[비상장 80% 하한] acqFaceValueOnly 결손법인 — MAIN과 동일하게 하한 발동", () => {
  it("결손(weighted ≤ 0)이어도 양도기준시가 = na×0.8(1600), 0 아님", () => {
    const r = calcUnlistedValuation(
      { ...lossCompany, acqFaceValueOnly: true, acqFaceValuePerShare: 500 } as never,
      10_000_000,
    );
    expect(r.method).toBe("acq_face_value_only");
    expect(r.netAssetFloorApplied).toBe(true);
    expect(r.transferStdPriceAfterFloor).toBe(1600); // 2000 × 0.8
    // 환산취득가 = 양도가 × 액면가/양도기준시가 = 10,000,000 × 500/1600
    expect(r.totalAcquisitionPrice).toBe(Math.floor((10_000_000 * 500) / 1600)); // 3,125,000
    expect(r.warnings ?? []).not.toContain("양도기준시가가 0 이하 — 환산취득가 산출 불가");
  });

  it("정상(weighted > na×0.8)에서는 하한 미발동 — 동작 불변", () => {
    const r = calcUnlistedValuation(
      {
        shareCount: 1000,
        transferDate: new Date("2024-06-01"),
        transferYearNetIncomePerShare: 10_000, // weighted = (10000*3 + 2000*2)/5 = 6800 > 1600
        transferYearNetAssetPerShare: 2000,
        faceValuePerShare: 500,
        acqFaceValueOnly: true,
        acqFaceValuePerShare: 500,
      } as never,
      10_000_000,
    );
    expect(r.netAssetFloorApplied).toBe(false);
    expect(r.transferStdPriceAfterFloor).toBe(6800);
  });
});
