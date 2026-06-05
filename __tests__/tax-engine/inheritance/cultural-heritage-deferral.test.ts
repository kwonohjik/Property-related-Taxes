import { describe, it, expect } from "vitest";
import { calcCulturalHeritageDeferral } from "@/lib/tax-engine/inheritance-cultural-heritage-deferral";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

// 상속세 §74 지정문화유산 등 징수유예 — 비례 방식(상증령 §76①, 조심 940708)
// 징수유예세액 = 산출세액 × (해당 재산가액 ÷ [grossEstate + priorGift])

function estate(
  id: string,
  marketValue: number,
  culturalHeritageType?: EstateItem["culturalHeritageType"],
): EstateItem {
  return { id, category: "real_estate_land", name: id, marketValue, culturalHeritageType };
}

describe("§74 지정문화유산 등 징수유예 — calcCulturalHeritageDeferral", () => {
  // CHD-03 (Pre-Do): 3호 부분 5억/20억 → floor(4.4억 × 5억/20억) = 1.1억
  it("CHD-03: 3호 국가지정문화유산 부분비율 §76①", () => {
    const r = calcCulturalHeritageDeferral({
      estateItems: [estate("e1", 1_500_000_000), estate("e2", 500_000_000, "designated")],
      valuatedAmountById: new Map([["e1", 1_500_000_000], ["e2", 500_000_000]]),
      computedTax: 440_000_000,
      grossEstateValue: 2_000_000_000,
      priorGiftAggregated: 0,
    });
    expect(r.deferredTax).toBe(110_000_000);
    expect(r.detail?.qualifyingAssetValue).toBe(500_000_000);
    expect(r.detail?.totalEstateWithPriorGifts).toBe(2_000_000_000);
    expect(r.detail?.hasCollateralExemption).toBe(true); // 3호 담보면제
    expect(r.detail?.items[0].collateralExemptible).toBe(true);
  });

  // CHD-04: 4호 + §13 사전증여 5억/25억 → floor(4.4억 × 5억/25억) = 0.88억 (BigInt 경로)
  it("CHD-04: §13 사전증여 분모 포함 (BigInt 경로)", () => {
    const r = calcCulturalHeritageDeferral({
      estateItems: [estate("e1", 1_500_000_000), estate("e2", 500_000_000, "natural_monument")],
      valuatedAmountById: new Map([["e1", 1_500_000_000], ["e2", 500_000_000]]),
      computedTax: 440_000_000,
      grossEstateValue: 2_000_000_000,
      priorGiftAggregated: 500_000_000,
    });
    expect(r.deferredTax).toBe(88_000_000);
  });

  // CHD-01: 문화유산 없음 → 0
  it("CHD-01: 문화유산 없음 → 0, detail null", () => {
    const r = calcCulturalHeritageDeferral({
      estateItems: [estate("e1", 1_000_000_000)],
      valuatedAmountById: new Map([["e1", 1_000_000_000]]),
      computedTax: 200_000_000,
      grossEstateValue: 1_000_000_000,
      priorGiftAggregated: 0,
    });
    expect(r.deferredTax).toBe(0);
    expect(r.detail).toBeNull();
  });

  // CHD-02: 1호 단일 100% → computedTax 전액 (calculateProration 비율 1.0 상한)
  it("CHD-02: 1호 단일 100% → computedTax 전액", () => {
    const r = calcCulturalHeritageDeferral({
      estateItems: [estate("e1", 1_000_000_000, "heritage_data")],
      valuatedAmountById: new Map([["e1", 1_000_000_000]]),
      computedTax: 200_000_000,
      grossEstateValue: 1_000_000_000,
      priorGiftAggregated: 0,
    });
    expect(r.deferredTax).toBe(200_000_000);
  });

  // CHD-06: 복수(1호 3억 + 3호 2억) 합산 분자 5억 / 20억
  it("CHD-06: 복수(1호+3호) 합산 분자", () => {
    const r = calcCulturalHeritageDeferral({
      estateItems: [
        estate("e1", 300_000_000, "heritage_data"),
        estate("e2", 200_000_000, "designated"),
        estate("e3", 1_500_000_000),
      ],
      valuatedAmountById: new Map([
        ["e1", 300_000_000],
        ["e2", 200_000_000],
        ["e3", 1_500_000_000],
      ]),
      computedTax: 440_000_000,
      grossEstateValue: 2_000_000_000,
      priorGiftAggregated: 0,
    });
    expect(r.deferredTax).toBe(110_000_000); // (3억+2억)/20억
    expect(r.detail?.items.length).toBe(2);
  });

  // CHD-07/08: 담보면제 echo — 1호 false, 3호 true
  it("CHD-08: 1호 담보 필요 → collateralExemptible false", () => {
    const r = calcCulturalHeritageDeferral({
      estateItems: [estate("e1", 500_000_000, "heritage_data"), estate("e2", 1_500_000_000)],
      valuatedAmountById: new Map([["e1", 500_000_000], ["e2", 1_500_000_000]]),
      computedTax: 440_000_000,
      grossEstateValue: 2_000_000_000,
      priorGiftAggregated: 0,
    });
    expect(r.detail?.items[0].collateralExemptible).toBe(false);
    expect(r.detail?.hasCollateralExemption).toBe(false);
  });

  // CHD-09: 분자 0 (평가액 0) → 0
  it("CHD-09: 분자 0 → 0", () => {
    const r = calcCulturalHeritageDeferral({
      estateItems: [estate("e1", 0, "designated")],
      valuatedAmountById: new Map([["e1", 0]]),
      computedTax: 200_000_000,
      grossEstateValue: 1_000_000_000,
      priorGiftAggregated: 0,
    });
    expect(r.deferredTax).toBe(0);
  });

  // CHD-10: computedTax 0 (과표 0) → 0
  it("CHD-10: computedTax 0 → 0", () => {
    const r = calcCulturalHeritageDeferral({
      estateItems: [estate("e1", 500_000_000, "designated")],
      valuatedAmountById: new Map([["e1", 500_000_000]]),
      computedTax: 0,
      grossEstateValue: 1_000_000_000,
      priorGiftAggregated: 0,
    });
    expect(r.deferredTax).toBe(0);
  });

  // CHD-05: 2호 박물관자료 — 산식 정상(3호와 동일), heritageType echo
  it("CHD-05: 2호 박물관자료 → 정상 산출 + 담보 필요", () => {
    const r = calcCulturalHeritageDeferral({
      estateItems: [estate("e1", 500_000_000, "museum"), estate("e2", 1_500_000_000)],
      valuatedAmountById: new Map([["e1", 500_000_000], ["e2", 1_500_000_000]]),
      computedTax: 440_000_000,
      grossEstateValue: 2_000_000_000,
      priorGiftAggregated: 0,
    });
    expect(r.deferredTax).toBe(110_000_000);
    expect(r.detail?.items[0].heritageType).toBe("museum");
    expect(r.detail?.items[0].collateralExemptible).toBe(false);
  });
});
