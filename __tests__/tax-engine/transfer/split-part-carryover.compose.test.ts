/**
 * P1 ⑭ 합성기(`composeSplitCarryover`) — 와이어(사건 1벌 + 파트 N벌) → 엔진 input. + V-5 지분 스케일 floor 실측 (2026-10-19)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §1.4·§5 · 계획서 §11 I-3
 */
import { describe, it, expect } from "vitest";
import { composeSplitCarryover } from "@/lib/tax-engine/transfer-split-carryover-compose";
import { apportionGiftTax } from "@/lib/tax-engine/carryover-gift-tax-apportion";

const EVENT = { giftRegistryDate: "2023-03-01", giftTaxCalculated: 30_000_000, giftTaxBase: 900_000_000, donorRelation: "lineal" as const };
const LAND = { donorAcquisitionDate: "1995-03-01", donorAcquisitionPrice: 50_000_000, donorCapitalExpenditure: 7_000_000 };
const BUILDING = { donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 50_000_000 };

describe("composeSplitCarryover", () => {
  it("Date 변환은 여기서만 — 사건·파트 날짜가 Date로 나간다(문자열이 엔진에 닿으면 Date < string 침묵 false)", () => {
    const out = composeSplitCarryover({
      carryoverGiftEvent: EVENT, landCarryoverPart: LAND, buildingCarryoverPart: BUILDING, landAcquisitionPrice: 240_000_000, buildingAcquisitionPrice: 660_000_000,
    });
    expect(out.carryoverGiftEvent!.giftRegistryDate).toBeInstanceOf(Date);
    expect(out.landCarryoverTaxation!.giftRegistryDate).toBeInstanceOf(Date);
    expect(out.landCarryoverTaxation!.donorAcquisitionDate).toBeInstanceOf(Date);
    expect(out.buildingCarryoverTaxation!.donorAcquisitionDate).toBeInstanceOf(Date);
    expect(out.landCarryoverTaxation!.donorAcquisitionDate.toISOString().slice(0, 10)).toBe("1995-03-01");
  });

  it("영 §163의2② 안분 — 산출세액 × 파트 평가액 ÷ 과세가액 (floor, 한도 前). 합이 1원 모자랄 수 있다(잔액 흡수 안 함)", () => {
    const out = composeSplitCarryover({
      carryoverGiftEvent: EVENT, landCarryoverPart: LAND, buildingCarryoverPart: BUILDING, landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 500_000_000,
    });
    expect(out.landCarryoverTaxation!.giftTaxAmount).toBe(13_333_333);
    expect(out.buildingCarryoverTaxation!.giftTaxAmount).toBe(16_666_666);
    expect(out.landCarryoverTaxation!.giftDateValuation).toBe(400_000_000); // 안분 분자 = B 취득가액 (이중 진실 없음)
  });

  it("사건의 관계·사망·배제 선언은 두 파트에 같은 값으로 복사되고, 파트 환산은 없다(I-4)", () => {
    const exclusionDeclared = { expropriationWithin2Years: true };
    const out = composeSplitCarryover({
      carryoverGiftEvent: { ...EVENT, donorDeceased: false, exclusionDeclared }, landCarryoverPart: LAND, buildingCarryoverPart: BUILDING,
      landAcquisitionPrice: 1, buildingAcquisitionPrice: 1,
    });
    for (const ct of [out.landCarryoverTaxation!, out.buildingCarryoverTaxation!]) {
      expect(ct.donorRelation).toBe("lineal");
      expect(ct.donorDeceased).toBe(false);
      expect(ct.exclusionDeclared).toEqual(exclusionDeclared);
      expect(ct.useEstimatedAcquisition).toBe(false);
    }
    expect(out.landCarryoverTaxation!.donorCapitalExpenditure).toBe(7_000_000);
    expect(out.buildingCarryoverTaxation!.donorCapitalExpenditure).toBeUndefined();
  });

  it("파트가 없으면 그 키를 내지 않는다(키 부재 = 그 파트 일반) · 사건이 없으면 아무것도 내지 않는다", () => {
    const a = composeSplitCarryover({ carryoverGiftEvent: EVENT, landCarryoverPart: LAND, landAcquisitionPrice: 240_000_000 });
    expect(Object.keys(a).sort()).toEqual(["carryoverGiftEvent", "landCarryoverTaxation"]);
    const b = composeSplitCarryover({ carryoverGiftEvent: EVENT, buildingCarryoverPart: BUILDING, buildingAcquisitionPrice: 660_000_000 });
    expect(Object.keys(b).sort()).toEqual(["buildingCarryoverTaxation", "carryoverGiftEvent"]);
    expect(composeSplitCarryover({ landCarryoverPart: LAND, landAcquisitionPrice: 1 })).toEqual({});
    expect(composeSplitCarryover({})).toEqual({});
    expect(composeSplitCarryover({ carryoverGiftEvent: EVENT })).toEqual({});
  });

  it("잘못된 날짜 문자열은 명확한 오류로 막는다(침묵 Invalid Date 금지)", () => {
    expect(() =>
      composeSplitCarryover({ carryoverGiftEvent: { ...EVENT, giftRegistryDate: "not-a-date" }, landCarryoverPart: LAND, landAcquisitionPrice: 1 }),
    ).toThrow();
  });
});

/**
 * V-5 — 지분(`ownershipRatio<1`) 스케일. I-3: **사건 금액(산출세액·과세가액)은 스케일하지 않고**, 파트 금액(증여자 취득가·자본적지출)과
 * 파트 평가액(안분 분자)만 ④가 `applyRatio`(floor)로 스케일한다. 그래서 엔진이 받는 안분액은
 *   apportion(event, floor(r·v)) = floor(산출세액 × floor(r·v) ÷ 과세가액)
 * 이고 100% 환산 대비 기대값은 r × floor(산출세액 × v ÷ 과세가액)다. 두 floor가 어긋나는 크기를 격자로 실측한다.
 */
describe("V-5 지분 스케일 floor 어긋남 실측", () => {
  const taxes = [29_999_999, 12_345_679, 1_000_001, 100_000_000];
  const bases = [900_000_000, 777_777_777, 300_000_000];
  const vals = [240_000_000, 333_333_331, 299_999_999, 400_000_000];
  const ratios = [0.5, 0.6, 0.25, 0.7, 0.33, 0.01];

  it("격자 전수(240셀): |스케일 안분 − 100% 안분×지분율| < 1원 — 실측 최대 0.99원(정수 비교로는 floor(r·안분)과 최대 1원 차이) → 스케일 규약 유지, ownershipRatio<1 차단(S9) 불요", () => {
    let max = 0;
    let n = 0;
    for (const tax of taxes)
      for (const base of bases)
        for (const v of vals) {
          if (v > base) continue; // 평가액 ≤ 과세가액 (⑫가 요구)
          for (const r of ratios) {
            const full = apportionGiftTax({ giftTaxCalculated: tax, giftTaxBase: base }, v);
            const scaled = apportionGiftTax({ giftTaxCalculated: tax, giftTaxBase: base }, Math.floor(v * r));
            const diff = Math.abs(scaled - r * full);
            max = Math.max(max, diff);
            n++;
            // 사건 미스케일이라 안분 분모·분자 floor가 한 번뿐이다 — 어긋남은 한 floor(< 1원). 넘으면 ownershipRatio<1을 막아야 한다.
            expect(diff, `tax=${tax} base=${base} v=${v} r=${r}`).toBeLessThan(1);
          }
        }
    expect(n).toBe(240);
    expect(max).toBeLessThan(1); // 실측 0.99
  });

  it("지분율 0.5·0.6의 정확한 값은 100% 환산과 정수로 일치하거나 1원 차이 — 사건 미스케일 규약(I-3)이 산출세액까지 절반이 되게 한다", () => {
    const tax = 29_999_999, base = 900_000_000, v = 400_000_000;
    const full = apportionGiftTax({ giftTaxCalculated: tax, giftTaxBase: base }, v); // 13,333,332
    expect(full).toBe(13_333_332);
    expect(apportionGiftTax({ giftTaxCalculated: tax, giftTaxBase: base }, v * 0.5)).toBe(6_666_666); // 정확히 절반
    expect(apportionGiftTax({ giftTaxCalculated: tax, giftTaxBase: base }, v * 0.6)).toBe(7_999_999); // 0.6 × 13,333,332 = 7,999,999.2 → 0.2원 차이
  });
});
