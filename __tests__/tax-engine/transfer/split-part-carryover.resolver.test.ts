/**
 * P1 파트 이월과세 해결자(`calcSplitCarryoverScenarios`) 단위 — 본 엔진을 **주입**(stub)해 분기 구조를 잠근다 (2026-10-19)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §3·§4
 * route 단 수치 anchor는 `__tests__/api/transfer.route.split-part-carryover.*.test.ts`. 여기서는 결정세액을 stub이 정하므로
 *   · ②3호 순차 고정점의 **순서(토지 → 건물)**와 동률 A
 *   · 부적격이면 본 엔진을 부르지 않고 두 파트 B 고정
 *   · 메모이즈(같은 assignment를 두 번 계산하지 않는다)
 *   · §97의2②2호(P5) — 전부 적용(AA)이면 1세대1주택 해당 · 전부 미적용(BB)이면 아님 → 모든 적격 파트 미적용, ②3호 비교 생략
 *   · 입구 leaf 검사(직접 호출 엔진도 ⑫와 같은 거부)
 * 를 확인한다.
 */
import { describe, it, expect } from "vitest";
import { calcSplitCarryoverScenarios } from "@/lib/tax-engine/transfer-tax-split-carryover";
import { PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE } from "@/lib/tax-engine/transfer-split-part-cause";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);
const GIFT = D("2023-03-01");
const LAND_DONOR = D("1995-03-01");
const BUILDING_DONOR = D("2015-06-01");
const rates = makeMockRates();

const ct = (donor: Date, price: number) => ({
  giftRegistryDate: GIFT, donorAcquisitionDate: donor, donorAcquisitionPrice: price, useEstimatedAcquisition: false,
  giftTaxAmount: 0, giftDateValuation: 100_000_000, donorRelation: "lineal" as const, exclusionDeclared: {},
});

/** C — 둘 다 이월과세 (엔진 모양). 실가·별개 취득 아님(수증자 쪽 두 취득일 같음). */
function inputC(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 1_200_000_000, transferDate: D("2025-06-30"), acquisitionPrice: 0, acquisitionDate: GIFT, isOneHousehold: false, householdHousingCount: 2,
    landAcquisitionDate: GIFT, landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
    landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000,
    landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 100_000_000, acquisitionCause: "carryover_gift", landAcquisitionCause: "carryover_gift", isSeparateAcquisition: false,
    carryoverGiftEvent: { giftRegistryDate: GIFT, giftTaxCalculated: 0, giftTaxBase: 200_000_000 },
    landCarryoverTaxation: ct(LAND_DONOR, 50_000_000),
    buildingCarryoverTaxation: ct(BUILDING_DONOR, 50_000_000),
    ...over,
  });
}

/** 시나리오 입력에서 파트별 A/B를 읽어 결정세액을 stub으로 돌려준다 — A = 파트 취득일이 증여자 날짜. */
const sideOf = (i: TransferTaxInput) => ({
  land: i.landAcquisitionDate!.getTime() === LAND_DONOR.getTime() ? "A" : "B",
  building: i.acquisitionDate.getTime() === BUILDING_DONOR.getTime() ? "A" : "B",
});
function stub(
  table: Record<string, number>,
  calls: string[] = [],
  exempt: (k: string) => boolean = () => false,
  flag: "isExempt" | "isPartialExempt" | "isExemptCore" = "isExempt",
) {
  return (i: TransferTaxInput) => {
    const s = sideOf(i);
    const key = `${s.land}${s.building}`;
    calls.push(key);
    return { determinedTax: table[key], ...(exempt(key) ? { [flag]: true } : {}) };
  };
}

describe("②3호 순차 고정점 — 토지 → 건물, 동률 A", () => {
  // 설계서 §4.2 단기 구간 사례(SPCO-T9)의 결정세액 표 — 안정 구성이 {BA, AB} 둘이다
  const T9 = { AA: 292_500_000, AB: 341_250_000, BA: 320_250_000, BB: 208_250_000 };

  it("토지 먼저: 안정 구성이 둘일 때 BA(토지 배제·건물 적용)로 간다 — 건물 먼저였다면 AB", () => {
    const out = calcSplitCarryoverScenarios(inputC(), rates, stub(T9));
    expect(out!.detail.land!.judgment).toBe("excluded");
    expect(out!.detail.land!.exclusionReason).toBe("tax_comparison");
    expect(out!.detail.building!.judgment).toBe("applied");
    // 채택 입력: 토지는 증여일/평가액(B), 건물은 증여자 값(A)
    expect(out!.adoptedInput.landAcquisitionDate!.getTime()).toBe(GIFT.getTime());
    expect(out!.adoptedInput.acquisitionDate.getTime()).toBe(BUILDING_DONOR.getTime());
    expect(out!.adoptedInput.buildingAcquisitionPrice).toBe(50_000_000);
    expect(out!.adoptedInput.landAcquisitionPrice).toBe(100_000_000);
    expect(out!.detail.land!.comparison).toEqual({ determinedTaxWithCarryover: T9.AA, determinedTaxWithout: T9.BA });
  });

  it("동률은 적용 유지(A) — ②3호는 「적은 경우」에만 배제한다", () => {
    const out = calcSplitCarryoverScenarios(inputC(), rates, stub({ AA: 100, AB: 100, BA: 100, BB: 100 }));
    expect(out!.detail.land!.judgment).toBe("applied");
    expect(out!.detail.building!.judgment).toBe("applied");
  });

  it("별개 취득 재파생 — 엔진은 재판정하지 않으므로 시나리오마다 치환 날짜로 다시 만든다(둘 다 증여일이면 false, 하나라도 증여자 날짜면 true)", () => {
    const aa = calcSplitCarryoverScenarios(inputC(), rates, stub({ AA: 9, AB: 1, BA: 1, BB: 1 }));
    expect(aa!.detail.land!.judgment).toBe("applied");
    expect(aa!.adoptedInput.isSeparateAcquisition).toBe(true); // 증여자 토지 1995 ≠ 증여자 건물 2015
    const bb = calcSplitCarryoverScenarios(inputC(), rates, stub({ AA: 1, AB: 1, BA: 2, BB: 3 }));
    expect(bb!.detail.land!.judgment).toBe("excluded");
    expect(bb!.detail.building!.judgment).toBe("excluded");
    expect(bb!.adoptedInput.isSeparateAcquisition).toBe(false); // 둘 다 증여일 — 비-별개(파트 평가액 명시값 사용)
    expect(bb!.adoptedInput.landAcquisitionPrice).toBe(100_000_000);
    expect(bb!.adoptedInput.buildingAcquisitionPrice).toBe(100_000_000);
  });

  it("증여자 취득일이 같은 날인 두 파트(AA): 비-별개로 재파생되고 파트 취득가액 명시값·증여자 날짜가 그대로 들어간다 (리뷰 anchor 부재 (2))", () => {
    const same = D("2010-01-01");
    const input = inputC({
      landCarryoverTaxation: ct(same, 50_000_000),
      buildingCarryoverTaxation: ct(same, 60_000_000),
    });
    const seen: { sep: boolean | undefined; landDate: number; bldgDate: number; landPrice?: number; bldgPrice?: number }[] = [];
    const out = calcSplitCarryoverScenarios(input, rates, (i) => {
      seen.push({ sep: i.isSeparateAcquisition, landDate: i.landAcquisitionDate!.getTime(), bldgDate: i.acquisitionDate.getTime(), landPrice: i.landAcquisitionPrice, bldgPrice: i.buildingAcquisitionPrice });
      return { determinedTax: 100 }; // 전부 동률 → AA 유지
    });
    expect(out!.detail.land!.judgment).toBe("applied");
    expect(out!.detail.building!.judgment).toBe("applied");
    expect(out!.adoptedInput).toMatchObject({ isSeparateAcquisition: false, landAcquisitionPrice: 50_000_000, buildingAcquisitionPrice: 60_000_000 });
    expect(out!.adoptedInput.landAcquisitionDate!.getTime()).toBe(same.getTime());
    expect(out!.adoptedInput.acquisitionDate.getTime()).toBe(same.getTime());
    // 한쪽만 A인 시나리오는 증여일(2023-03-01)과 증여자일이 달라 별개로 읽힌다 — 재파생이 시나리오마다 다르다
    expect(seen.some((s) => s.sep === true)).toBe(true);
    expect(seen.some((s) => s.sep === false)).toBe(true);
  });

  it("메모이즈 — 같은 assignment를 두 번 계산하지 않는다(파트 2개 상한 4조합)", () => {
    const calls: string[] = [];
    calcSplitCarryoverScenarios(inputC(), rates, stub(T9, calls));
    expect(new Set(calls).size).toBe(calls.length);
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  it("파트가 하나(A)면 그 파트만 비교한다 — 호출 2회(적용·미적용)", () => {
    const calls: string[] = [];
    const input = inputC({ buildingCarryoverTaxation: undefined, acquisitionCause: "purchase", acquisitionDate: D("2021-03-01") });
    const out = calcSplitCarryoverScenarios(input, rates, (i) => {
      calls.push(i.landAcquisitionDate!.getTime() === LAND_DONOR.getTime() ? "A" : "B");
      return { determinedTax: i.landAcquisitionDate!.getTime() === LAND_DONOR.getTime() ? 10 : 20 };
    });
    expect(calls.sort()).toEqual(["A", "B"]);
    expect(out!.detail.land!.judgment).toBe("excluded"); // A(10) < B(20)
    expect(out!.detail.building).toBeUndefined();
  });
});

describe("적격 판정(①·③) — 부적격이면 본 엔진을 부르지 않고 두 파트 B 고정", () => {
  it("기간 초과: 증여 2013-03-01 → 양도 2025-06-30", () => {
    const calls: string[] = [];
    const old = D("2013-03-01");
    const input = inputC({
      acquisitionDate: old, landAcquisitionDate: old,
      carryoverGiftEvent: { giftRegistryDate: old, giftTaxCalculated: 0, giftTaxBase: 200_000_000 },
      landCarryoverTaxation: { ...ct(LAND_DONOR, 50_000_000), giftRegistryDate: old },
      buildingCarryoverTaxation: { ...ct(BUILDING_DONOR, 50_000_000), giftRegistryDate: old },
    });
    const out = calcSplitCarryoverScenarios(input, rates, stub({ AA: 1, AB: 1, BA: 1, BB: 1 }, calls));
    expect(calls).toEqual([]);
    expect(out!.detail.land).toMatchObject({ judgment: "excluded", exclusionReason: "period_exceeded", giftTaxLimitCap: 0, giftTaxAddedToExpense: 0 });
    expect(out!.detail.building).toMatchObject({ judgment: "excluded", exclusionReason: "period_exceeded" });
    expect(out!.detail.event.applicablePeriodYears).toBe(5);
    // B 고정 입력 — 증여자 값으로 치환되지 않는다
    expect(out!.adoptedInput.landAcquisitionDate!.getTime()).toBe(old.getTime());
    // B 고정 파트는 일반 증여(`gift`)로 계산한다(영 §163⑨ 단서 술어가 일반 증여와 같이 돈다 · 통산은 carryover_gift 전용이라 없다). 둘 다 B면 토지 원인은 없다(D3 회피).
    expect(out!.adoptedInput.acquisitionCause).toBe("gift");
    expect(out!.adoptedInput.landAcquisitionCause).toBeUndefined();
  });
});

describe("§97의2②2호 (P5) — 주택 일체 상태 변화: 전부 적용(AA)이면 해당 · 전부 미적용(BB)이면 아님", () => {
  const T = { AA: 0, AB: 300, BA: 200, BB: 100 };

  it.each(["isExempt", "isPartialExempt", "isExemptCore"] as const)("AA만 %s → 모든 적격 파트 미적용 · 사유 one_house_exemption · ②3호 비교 없음(AA·BB만 계산)", (flag) => {
    const calls: string[] = [];
    const out = calcSplitCarryoverScenarios(inputC(), rates, stub(T, calls, (k) => k === "AA", flag));
    for (const e of [out!.detail.land!, out!.detail.building!]) {
      expect(e.judgment).toBe("excluded");
      expect(e.exclusionReason).toBe("one_house_exemption");
      expect(e.comparison).toBeUndefined();
    }
    expect(out!.detail.event.oneHouseExclusion).toBe(true);
    expect(out!.detail.event.orderDependent).toBeUndefined();
    expect(calls.sort()).toEqual(["AA", "BB"]);
    expect(out!.adoptedInput.acquisitionDate.getTime()).toBe(GIFT.getTime());
    expect(out!.adoptedInput.landAcquisitionDate!.getTime()).toBe(GIFT.getTime());
  });

  it("BB도 해당하면(이미 1세대1주택 — 0374) 미발동 → ②3호 순차 고정점", () => {
    const out = calcSplitCarryoverScenarios(inputC(), rates, stub(T, [], (k) => k === "AA" || k === "BB"));
    expect(out!.detail.event.oneHouseExclusion).toBeUndefined();
    expect(out!.detail.land!.exclusionReason).toBe("tax_comparison"); // AA 0 < BA 200 — 적용이 더 싸서 ②3호가 배제한다(사유가 ②2호가 아니다)
  });

  it("혼합 구성(BA)만 해당하면 상태 변화가 아니다 — AA·BB 비교만 본다", () => {
    const out = calcSplitCarryoverScenarios(inputC(), rates, stub(T, [], (k) => k === "BA"));
    expect(out!.detail.event.oneHouseExclusion).toBeUndefined();
  });

  it("배우자 예외 — 통째(두 파트) + 배우자 + 증여일 현재 1세대1주택이면 ②2호 취소 → ②3호 · echo", () => {
    const spouseCt = { ...ct(BUILDING_DONOR, 50_000_000), donorRelation: "spouse" as const, spouseGiftOneHouseAtGiftDate: true };
    const out = calcSplitCarryoverScenarios(inputC({ buildingCarryoverTaxation: spouseCt }), rates, stub(T, [], (k) => k === "AA"));
    expect(out!.detail.event.oneHouseExclusion).toBeUndefined();
    expect(out!.detail.event.spouseOneHouseExceptionApplied).toBe(true);
    expect(out!.detail.land!.exclusionReason).toBe("tax_comparison");
  });

  it("세대 기준일 — 건물 파트가 있으면 시나리오마다 giftHouseholdBasis(A = 증여자 보유 통산)", () => {
    const seen: (boolean | undefined)[] = [];
    calcSplitCarryoverScenarios(inputC(), rates, (i) => {
      seen.push(i.giftHouseholdBasis?.holdingAlreadyAtDonor);
      expect(i.giftHouseholdBasis?.giftDate.getTime()).toBe(GIFT.getTime());
      return { determinedTax: 1 };
    });
    expect(seen).toContain(true);
    expect(seen).toContain(undefined);
  });
});

describe("입구 — leaf 검사 (직접 호출 엔진도 ⑫와 같은 거부)", () => {
  it("파트 서브객체가 없으면 null(skip)", () => {
    expect(calcSplitCarryoverScenarios(inputC({ landCarryoverTaxation: undefined, buildingCarryoverTaxation: undefined }), rates, stub({}))).toBeNull();
  });
  it("자산 단위 carryoverTaxation과 병용하면 INVALID_INPUT · field carryoverTaxation (R-1)", () => {
    try {
      calcSplitCarryoverScenarios(inputC({ carryoverTaxation: ct(LAND_DONOR, 1) }), rates, stub({}));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TaxCalculationError);
      expect((e as TaxCalculationError).message).toBe(PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE);
      expect((e as TaxCalculationError).details).toMatchObject({ field: "carryoverTaxation" });
    }
  });
  it("증여 사건이 없으면(파트만) 던진다 — 사건 없는 파트는 조용히 일반으로 흘리지 않는다", () => {
    expect(() => calcSplitCarryoverScenarios(inputC({ carryoverGiftEvent: undefined }), rates, stub({}))).toThrow();
  });
  it("취득일 ≠ 증여 등기접수일이면 던진다(S5)", () => {
    expect(() => calcSplitCarryoverScenarios(inputC({ landAcquisitionDate: D("2023-04-01") }), rates, stub({}))).toThrow();
  });
});

describe("STEP 0.476 위치 — 자산 단위 STEP 0.475보다 앞 (R-1을 raw `carryoverTaxation`으로 본다)", () => {
  it("엔진 직접 호출: 자산 단위 + 파트 병용은 0.475 재귀 입력(carryoverTaxation 비움)에 가려지지 않고 S3로 던진다", () => {
    const input = inputC({ carryoverTaxation: ct(LAND_DONOR, 50_000_000) });
    try {
      calculateTransferTax(input, rates);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TaxCalculationError);
      expect((e as TaxCalculationError).message).toBe(PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE);
    }
  });
});
