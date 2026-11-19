/**
 * NBL2611-C1 (V10-BX08) — GB 토지 카드 조립 leaf `planGbLandCards`·`foldGbLandCards`.
 * 기대값은 손계산: 전체 200㎡ · 사업용 인정 60㎡ → 사업용 3/10, 초과분은 잔액 흡수.
 */
import { describe, it, expect } from "vitest";
import { planGbLandCards, foldGbLandCards, GB_LAND_CARD_LABEL } from "@/lib/tax-engine/general-building-land-cards";
import type { CarryoverTaxationInput } from "@/lib/tax-engine/types/transfer-carryover.types";

const plan = (over: Partial<Parameters<typeof planGbLandCards>[0]> = {}) =>
  planGbLandCards({ isWithinLimit: false, nonBusinessRatio: 0.7, businessArea: 60, landArea: 200, ...over });

describe("planGbLandCards — 카드 구성", () => {
  it("한도 이내 → land 1장 · 금액은 그대로", () => {
    const p = plan({ isWithinLimit: true, nonBusinessRatio: 0 });
    expect(p.kind).toBe("within");
    expect(p.slices.map((s) => [s.propertyId, s.propertyLabel, s.isNonBusinessLand])).toEqual([["land", GB_LAND_CARD_LABEL.within, false]]);
    expect(p.slices[0].portion(1001)).toBe(1001);
  });

  it("초과 비율 0 이하는 한도 이내로 본다(비정상 입력 방어)", () => {
    expect(plan({ isWithinLimit: false, nonBusinessRatio: 0 }).kind).toBe("within");
  });

  it("전체 비사업용(비율 1 — 무허가 단서) → land_nbl 1장 「토지-비사업용(1001)」 · 0원 사업용 카드 없음", () => {
    const p = plan({ nonBusinessRatio: 1, businessArea: 0 });
    expect(p.kind).toBe("whole_nbl");
    expect(p.slices.map((s) => [s.propertyId, s.propertyLabel, s.isNonBusinessLand])).toEqual([["land_nbl", "토지-비사업용(1001)", true]]);
    expect(p.slices[0].portion(777)).toBe(777);
  });

  it("부분 초과 → 사업용 + 초과분 2장 · 사업용 = floor(금액 × 60/200) · 초과분은 잔액 흡수(합 보존)", () => {
    const p = plan();
    expect(p.kind).toBe("split");
    expect(p.slices.map((s) => [s.propertyId, s.propertyLabel, s.isNonBusinessLand])).toEqual([
      ["land_business", "토지-사업용(1001)", false],
      ["land_nbl", "토지-비사업용초과분(1002)", true],
    ]);
    const [biz, nbl] = p.slices;
    expect(biz.portion(1001)).toBe(300); // floor(1001 × 0.3)
    expect(nbl.portion(1001)).toBe(701);
    expect(biz.portion(1001) + nbl.portion(1001)).toBe(1001);
  });

  it("이월과세 입력은 split만 가른다(합 보존) · within·whole은 통째", () => {
    const ct: CarryoverTaxationInput = {
      giftRegistryDate: new Date("2020-03-17"), donorAcquisitionDate: new Date("1995-06-15"), donorAcquisitionPrice: 50_000_000,
      useEstimatedAcquisition: false, giftTaxAmount: 50_000_000, giftDateValuation: 200_000_000,
    } as CarryoverTaxationInput;
    const [biz, nbl] = plan().slices;
    expect(biz.portionCarryover(ct)?.giftDateValuation).toBe(60_000_000);
    expect(nbl.portionCarryover(ct)?.giftDateValuation).toBe(140_000_000);
    expect(plan({ nonBusinessRatio: 1, businessArea: 0 }).slices[0].portionCarryover(ct)).toBe(ct);
    expect(plan({ isWithinLimit: true, nonBusinessRatio: 0 }).slices[0].portionCarryover(ct)).toBe(ct);
    expect(biz.portionCarryover(undefined)).toBeUndefined();
  });
});

describe("foldGbLandCards — 토지 두 장을 한 행으로", () => {
  type Row = { propertyId: string; propertyLabel: string; income: number; appliedRate: number };
  const r = (propertyId: string, income: number, appliedRate = 0): Row => ({ propertyId, propertyLabel: propertyId, income, appliedRate });
  const KEYS = ["income"] as const;

  it("사업용+초과분 → 사업용 행에 수치를 더하고 초과분 행을 뺀다 · 비율은 더하지 않는다 · 순서 보존 · 입력 불변", () => {
    const rows = [r("land_business", 100, 0.35), r("land_nbl", 40, 0.48), r("building1", 10), r("building2", 5)];
    const out = foldGbLandCards(rows, KEYS);
    expect(out.map((x) => [x.propertyId, x.income, x.appliedRate])).toEqual([["land_business", 140, 0.35], ["building1", 10, 0], ["building2", 5, 0]]);
    expect(rows[0].income).toBe(100);
  });

  it("단독 land_nbl(전체 비사업용)·단독 land는 그대로", () => {
    const rows = [r("land_nbl", 40), r("building1", 10), r("building2", 5)];
    expect(foldGbLandCards(rows, KEYS)).toEqual(rows);
  });

  it("지분 접미사가 다르면 짝짓지 않는다(지분 0의 사업용 + 지분 1의 초과분 혼합 금지)", () => {
    const rows = [r("land_business#0", 100), r("land_nbl#1", 40), r("land_nbl#0", 7)];
    const out = foldGbLandCards(rows, KEYS);
    expect(out.map((x) => [x.propertyId, x.income])).toEqual([["land_business#0", 107], ["land_nbl#1", 40]]);
  });
});
