/**
 * F-34 Pre-Do anchor — §164⑧ 환산 결과의 양도 breakdown 이 취득 echo 를 통째로 물려받는다.
 *
 * 결함 위치: `lib/tax-engine/building-standard-price.ts`
 *   const transfer: BuildingStdPriceBreakdown = { ...acquisition, standardPrice: transferStd };
 *
 * §164⑧ 의 양도당시 기준시가는 **취득당시 기준시가에서 산식으로 파생**된 값이라
 * 자기 고유의 ㎡당 금액이 없다. 그런데 전체 spread 로 `pricePerM2`·`acqBaseRate`·
 * `appliedLandPriceYear` 가 취득 시점 값인 채 양도 breakdown 이 되고, 결과 카드와
 * 국세청 계산서가 그것을 그대로 렌더해 **양도 행이 산술적으로 성립하지 않는다.**
 *
 * 실측(2026-08-26 · 양도 · rc · 용도1 · 200㎡ · 신축2005 · 취득=양도 2015 · 공시지가 3,000,000 ·
 *      전기 2,500,000 · 보유 6월 · 조정 12월):
 *   취득 행: ㎡당 674,000 × 200㎡ = 134,800,000   (좌변 134,800,000 ✓)
 *   양도 행: ㎡당 674,000 × 200㎡ = **135,900,000** (좌변 134,800,000 ✗ 자기모순)
 *   양도 breakdown 이 `appliedLandPriceYear: 2015`·위치지수 설명까지 취득 것을 그대로 갖는다.
 *
 * 리뷰 실측에 따르면 취득 ≤2000 교차에서는 **취득 전용 산정기준율**까지 양도 행에 붙는다
 * (좌변 75,128,400 ≠ 우변 77,564,200).
 *
 * 법령: 「소득세법 시행령」 제164조 제8항 · 「소득세법 시행규칙」 제80조 제1항 제1호.
 *   양도당시 기준시가가 파생값이라는 것은 산식 구조상 성립하고 조문 해석에 의존하지 않는다.
 *
 * ⚠️ §1 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 *   `standardPrice` 값 자체는 바뀌지 않는다(§2 가드).
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

const SAME_YEAR: BuildingStandardPriceInput = {
  taxType: "transfer",
  floorArea: 200,
  builtYear: 2005,
  acquisitionYear: 2015,
  transferYear: 2015,
  holdingMonths: 6,
  adjustMonths: 12,
  acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 3_000_000 },
  transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 3_000_000 },
  prevLandPricePerM2: 2_500_000,
};

describe("F-34 §164⑧ 양도 breakdown — §1 취득 전용 echo 를 물려받지 않는다 (수정 전 실패)", () => {
  it("파생값임을 표시하는 플래그가 있다", () => {
    const r = calcBuildingStandardPrice(SAME_YEAR);
    expect(r.transfer?.sameAdjustmentPeriodDerived).toBe(true);
    // 취득 행은 파생값이 아니다
    expect(r.acquisition?.sameAdjustmentPeriodDerived).toBeUndefined();
  });

  it("취득 시점 전용 필드를 갖지 않는다 — 위치지수 적용 공시지가 기준연도", () => {
    expect(calcBuildingStandardPrice(SAME_YEAR).transfer?.appliedLandPriceYear).toBeUndefined();
  });

  it("취득 전용 산정기준율을 갖지 않는다", () => {
    expect(calcBuildingStandardPrice(SAME_YEAR).transfer?.acqBaseRate).toBeUndefined();
  });

  it("자기모순 방지 — ㎡당 × 연면적 이 양도 기준시가와 다르면 ㎡당 을 내보내지 않는다", () => {
    const t = calcBuildingStandardPrice(SAME_YEAR).transfer!;
    if (t.pricePerM2 !== undefined) {
      // ㎡당을 내보낸다면 반드시 항등식이 성립해야 한다
      expect(Math.floor(t.pricePerM2 * (t.floorArea ?? 0))).toBe(t.standardPrice);
    }
    expect(t.standardPrice).toBe(135_900_000);
  });
});

describe("F-34 — §2 역방향 가드 (수정 후에도 불변)", () => {
  it("금액은 변하지 않는다 — 취득 134,800,000 / 양도 135,900,000", () => {
    const r = calcBuildingStandardPrice(SAME_YEAR);
    expect(r.acquisition?.standardPrice).toBe(134_800_000);
    expect(r.transfer?.standardPrice).toBe(135_900_000);
    expect(r.sameYearAdjusted).toBe(true);
  });

  it("취득 행은 종전 echo 를 그대로 갖는다 — ㎡당 × 연면적 항등식 성립", () => {
    const a = calcBuildingStandardPrice(SAME_YEAR).acquisition!;
    expect(a.pricePerM2).toBe(674_000);
    expect(a.appliedLandPriceYear).toBe(2015);
    expect(Math.floor(a.pricePerM2! * (a.floorArea ?? 0))).toBe(a.standardPrice);
  });

  it("§164⑧ 이 아닌 2시점은 양도 행도 고유 echo 를 갖는다", () => {
    const r = calcBuildingStandardPrice({
      ...SAME_YEAR,
      transferYear: 2020,
      holdingMonths: undefined,
      prevLandPricePerM2: undefined,
    });
    expect(r.sameYearAdjusted ?? false).toBe(false);
    expect(r.transfer?.sameAdjustmentPeriodDerived).toBeUndefined();
    expect(r.transfer?.appliedLandPriceYear).toBe(2020);
  });
});
