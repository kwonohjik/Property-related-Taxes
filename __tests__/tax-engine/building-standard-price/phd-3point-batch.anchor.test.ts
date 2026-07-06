/**
 * Pre-Do 특성화 anchor — PHD 3시점 건물기준시가 일괄 계산 접근 확정
 * 계획서: docs/02-design/features/phd-building-stdprice-3point-batch-calculator.plan.md §3.1·§5
 *
 * 확정 목표:
 *  A1. 취득·양도 2시점은 transfer 1콜로 산출(.acquisition/.transfer.standardPrice)
 *  A2. 최초공시(≥2001) plain 값 = 별도 transfer 콜의 acquisitionYear=최초공시연도 acquisition
 *      과 valuation(inheritance) 콜의 valuation 이 동일(경로 등가) → 오케스트레이션 = transfer 2콜
 *  A3. ≤2000 최초공시(공동주택 1993): valuation(plain) throw → 계산 미지원(수동) 정당화.
 *      단, transfer acquisition 경로는 ≤2000에 acqBase 값 반환(throw 아님) → 최초공시엔 부적절
 */
import { describe, it, expect } from "vitest";
import {
  calcBuildingStandardPrice,
  type BuildingStandardPriceInput,
} from "../../../lib/tax-engine/building-standard-price";

const bldg = { structureKey: "rc", usageNo: 1 } as const; // 철근콘크리트조 · 아파트용도

describe("PHD 3시점 일괄 계산 — 접근 특성화 anchor", () => {
  it("A1: 취득 2014 / 양도 2025 — transfer 1콜로 2시점 산출", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "transfer",
      floorArea: 100,
      builtYear: 2010,
      acquisitionYear: 2014,
      transferYear: 2025,
      acquisition: { ...bldg, landPricePerM2: 2_369_000 },
      transfer: { ...bldg, landPricePerM2: 3_486_000 },
    };
    const r = calcBuildingStandardPrice(input);
    // 실측값 캡처(≥2001이므로 plain, acqBase 미적용)
    expect(r.acquisition?.standardPrice).toBeGreaterThan(0);
    expect(r.transfer?.standardPrice).toBeGreaterThan(0);
    expect(r.acquisition?.acqBaseRate).toBeUndefined(); // 2014≥2001 → 산정기준율 미적용
    expect(r.acquisition?.appliedLandPriceYear).toBe(2014);
  });

  it("A2: 최초공시 2005(≥2001) plain — transfer(acqYear=2005) == valuation(2005) 경로 등가", () => {
    // 경로 X: transfer 콜의 acquisition(2005) — transferYear는 sameYear(§164⑧) 회피 위해 다른 연도
    const viaTransfer = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: 100,
      builtYear: 2010,
      acquisitionYear: 2005,
      transferYear: 2025,
      acquisition: { ...bldg, landPricePerM2: 2_369_000 },
      transfer: { ...bldg, landPricePerM2: 3_486_000 },
    });
    // 경로 Y: valuation(inheritance) 단일시점(2005), 조정율 미지정(=1)
    const viaValuation = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 100,
      builtYear: 2010,
      valuationYear: 2005,
      valuation: { ...bldg, landPricePerM2: 2_369_000 },
    });
    expect(viaTransfer.acquisition?.standardPrice).toBeGreaterThan(0);
    expect(viaTransfer.acquisition?.acqBaseRate).toBeUndefined(); // 2005≥2001 plain
    // 두 경로가 같은 plain 값을 내면 최초공시 산출에 transfer.acquisition 경로 재사용 가능
    expect(viaTransfer.acquisition?.standardPrice).toBe(viaValuation.valuation?.standardPrice);
  });

  it("A3: 공동주택 최초고시 1993(≤2000) — valuation(plain) throw / transfer.acquisition은 acqBase 값", () => {
    // valuation 단일시점 ≤2000 → calcPointBreakdown 직접 → 신축가격기준액 미수록 throw
    expect(() =>
      calcBuildingStandardPrice({
        taxType: "inheritance_gift",
        floorArea: 100,
        builtYear: 1990,
        valuationYear: 1993,
        valuation: { ...bldg, landPricePerM2: 1_000_000 },
      }),
    ).toThrow();

    // transfer.acquisition ≤2000 → acqBase(2001×산정기준율) 값 반환(throw 아님) → 최초공시엔 부적절
    const r = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: 100,
      builtYear: 1990,
      acquisitionYear: 1993,
      transferYear: 2025,
      acquisition: { ...bldg, landPricePerM2: 1_000_000 },
      transfer: { ...bldg, landPricePerM2: 3_486_000 },
    });
    expect(r.acquisition?.acqBaseRate).toBeGreaterThan(0); // acqBase 적용됨(= 취득 semantics)
    expect(r.acquisition?.appliedLandPriceYear).toBe(2001);
  });
});
