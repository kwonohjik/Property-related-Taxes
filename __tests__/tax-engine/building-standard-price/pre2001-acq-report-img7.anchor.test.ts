import { describe, it, expect } from "vitest";
import { calcAcqBaseBreakdown } from "../../../lib/tax-engine/building-standard-price-helpers";
import { calcBuildingStandardPrice } from "../../../lib/tax-engine/building-standard-price";

/**
 * A1 [pre-do anchor] — 2001년 이전 취득 3시점 계산서(이미지7) 재현.
 * 계획서: docs/02-design/features/building-std-report-pre2001-acquisition-3point.plan.md
 *
 * 이미지7 취득당시: 철근콘크리트조(rc)·단독주택·면적327.6·신축1997·취득1997·취득공시지가1,200,000.
 *   2001 기저: 신축가격기준액400,000·구조1.0·용도1.0·위치1.05·잔가0.92 → 386,000/㎡ × 327.6 = 126,453,600.
 *   × 0.971(산정기준율 그룹I·신축1997·취득1997) = 122,786,445.
 */
describe("A1 이미지7 취득당시(2001 이전) acqBase 재현", () => {
  const acqPoint = { structureKey: "rc", usageNo: 1, landPricePerM2: 1_200_000 };

  // 현재 GREEN — 엔진 acqBase 산출은 기존 기능(위치지수 1.05가 취득공시지가에서 산출됨을 확정).
  it("calcAcqBaseBreakdown: 이미지7 값 전부 재현", () => {
    const bd = calcAcqBaseBreakdown(1997, acqPoint, 327.6, 1997);
    expect(bd.acqBaseRate).toBe(0.971);
    expect(bd.pricePerM2).toBe(386_000);
    expect(bd.standardPrice).toBe(122_786_445);
    expect(bd.basePrice).toBe(400_000);
    expect(bd.structureIndex).toBe(100); // 1.0
    expect(bd.usageIndex).toBe(100); // 1.0
    expect(bd.locationIndex).toBe(105); // 1.05 — 취득공시지가 1,200,000 소스 확정
    expect(bd.residualRate).toBe(0.92);
  });

  // ⚠️ [P1 목표 — 현재 RED] G1: 단독(비복합) 취득<2001 경로가 acqBaseConversion을 노출해야
  //    어댑터(nts-report-adapter.ts:292)가 ※산정기준율 표를 렌더한다. Do P1에서 GREEN 전환.
  it("[P1] calcBuildingStandardPrice(transfer) 단독이 acqBaseConversion 노출", () => {
    const full = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: 327.6,
      builtYear: 1997,
      acquisitionYear: 1997,
      transferYear: 2001,
      acquisition: acqPoint,
      transfer: acqPoint,
    });
    expect(full.acquisition?.standardPrice).toBe(122_786_445);
    expect(full.acqBaseConversion?.total2001).toBe(126_453_600);
    expect(full.acqBaseConversion?.acqBaseRate).toBe(0.971);
    expect(full.acqBaseConversion?.convertedTotal).toBe(122_786_445);
  });
});
