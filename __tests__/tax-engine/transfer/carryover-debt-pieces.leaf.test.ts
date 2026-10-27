/**
 * 단위 — 이월과세 채무 부분(매입분) 조각 규칙 leaf (`carryover-debt-pieces.ts` · `carryover-debt-pieces-scope.ts`).
 * 설계서 §3.1~§3.4. 정수 안분(floor · BigInt 안전) · 증여분 = 곱셈 쪽 / 매입분 = 전체 − 증여분.
 */
import { describe, it, expect } from "vitest";
import { carryoverDebtShareOf, splitCarryoverDebtPieces } from "@/lib/tax-engine/carryover-debt-pieces";
import { carryoverDebtPiecesUnsupportedReason } from "@/lib/tax-engine/carryover-debt-pieces-scope";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";

const D = (s: string) => new Date(s);
const ct = (over: Record<string, unknown> = {}) => ({
  giftRegistryDate: D("2023-06-01"), donorAcquisitionDate: D("2000-06-01"), donorAcquisitionPrice: 100_000_000, useEstimatedAcquisition: false,
  giftTaxAmount: 20_000_000, donorCapitalExpenditure: 30_000_000, giftDateValuation: 1_000_000_000, giftAssumedDebt: 400_000_000, donorRelation: "lineal", ...over,
});
const card = (over: Record<string, unknown> = {}, c: Record<string, unknown> = {}): TransferTaxItemInput =>
  ({
    propertyId: "primary", propertyLabel: "주 자산(주택)", propertyType: "housing", transferPrice: 1_500_000_000, transferDate: D("2026-03-01"),
    acquisitionPrice: 0, acquisitionDate: D("2023-06-01"), expenses: 0, capitalExpenditure: 50_000_000, transferExpense: 10_000_000,
    acquisitionCause: "carryover_gift", householdHousingCount: 2, isOneHousehold: false, residencePeriodMonths: 0, carryoverTaxation: ct(c), ...over,
  }) as unknown as TransferTaxItemInput;

describe("carryoverDebtShareOf", () => {
  it("채무 없음·0·서브객체 없음 → null(조각 없음)", () => {
    expect(carryoverDebtShareOf(undefined)).toBeNull();
    expect(carryoverDebtShareOf(ct({ giftAssumedDebt: undefined }) as never)).toBeNull();
    expect(carryoverDebtShareOf(ct({ giftAssumedDebt: 0 }) as never)).toBeNull();
  });
  it("정상 — keep = 평가액 − 채무", () => {
    expect(carryoverDebtShareOf(ct() as never)).toEqual({ debt: 400_000_000, valuation: 1_000_000_000, keep: 600_000_000 });
    expect(carryoverDebtShareOf(ct({ giftAssumedDebt: 1_000_000_000 }) as never)!.keep).toBe(0);
  });
  it("채무 > 평가액 · 평가액 0 → INVALID_INPUT", () => {
    expect(() => carryoverDebtShareOf(ct({ giftAssumedDebt: 1_000_000_001 }) as never)).toThrow(/채무/);
    expect(() => carryoverDebtShareOf(ct({ giftDateValuation: 0, giftAssumedDebt: 1 }) as never)).toThrow();
  });
});

describe("splitCarryoverDebtPieces", () => {
  const share = { debt: 400_000_000, valuation: 1_000_000_000, keep: 600_000_000 };
  const { gift, purchased } = splitCarryoverDebtPieces(card(), share);
  it("양도가액·본인 필요경비는 합이 원값(곱셈은 증여분, 매입분은 나머지)", () => {
    expect([gift!.transferPrice, purchased.transferPrice]).toEqual([900_000_000, 600_000_000]);
    expect([gift!.capitalExpenditure, purchased.capitalExpenditure]).toEqual([30_000_000, 20_000_000]);
    expect([gift!.transferExpense, purchased.transferExpense]).toEqual([6_000_000, 4_000_000]);
  });
  it("1/3 — 1원 단위 합 보존 · BigInt 경로(곱 > 2^53)", () => {
    const s = { debt: 333_333_333, valuation: 1_000_000_000, keep: 666_666_667 };
    const p = splitCarryoverDebtPieces(card({ transferPrice: 1_500_000_001 }), s);
    expect(p.gift!.transferPrice + p.purchased.transferPrice).toBe(1_500_000_001);
    expect(p.gift!.transferPrice).toBe(1_000_000_001);
  });
  it("증여분: 이월과세 카드 유지 · 증여자 취득가액만 × (1 − r) · 상당액·증여자 capex 전액 · 채무 키 제거 · 원 id · (증여분) 라벨", () => {
    const g = gift!;
    expect(g.propertyId).toBe("primary");
    expect(g.propertyLabel).toBe("주 자산(주택)(증여분)");
    expect(g.acquisitionCause).toBe("carryover_gift");
    expect(g.carryoverTaxation).toMatchObject({ donorAcquisitionPrice: 60_000_000, giftTaxAmount: 20_000_000, donorCapitalExpenditure: 30_000_000, giftDateValuation: 600_000_000 });
    expect(g.carryoverTaxation!.giftAssumedDebt).toBeUndefined();
    expect(g.totalPropertyTransferPrice).toBe(1_500_000_000);
  });
  it("매입분: B 입력 빌더 기반 — 증여일 취득 · 취득가액 = 채무 · 증여세·증여자 capex 없음 · 꼬리 id", () => {
    const p = purchased;
    expect(p.propertyId).toBe("primary__purchased");
    expect(p.propertyLabel).toBe("주 자산(주택)(매입분)");
    expect(p.acquisitionCause).toBe("purchase");
    expect(p.acquisitionPrice).toBe(400_000_000);
    expect(p.acquisitionDate).toEqual(D("2023-06-01"));
    expect(p.carryoverTaxation).toBeUndefined();
    expect(p.useEstimatedAcquisition).toBe(false);
    expect(p.totalPropertyTransferPrice).toBe(1_500_000_000);
  });
  it("지분 카드는 원래 totalPropertyTransferPrice(물건 전체)를 유지한다", () => {
    const p = splitCarryoverDebtPieces(card({ totalPropertyTransferPrice: 3_000_000_000, ownershipRatio: 0.5 }), share);
    expect(p.gift!.totalPropertyTransferPrice).toBe(3_000_000_000);
    expect(p.purchased.totalPropertyTransferPrice).toBe(3_000_000_000);
    expect(p.purchased.ownershipRatio).toBe(0.5);
  });
  it("r = 1 — 증여분 없음 · 매입분이 원 id · 양도가액·필요경비 전액", () => {
    const p = splitCarryoverDebtPieces(card(), { debt: 1_000_000_000, valuation: 1_000_000_000, keep: 0 });
    expect(p.gift).toBeUndefined();
    expect(p.purchased).toMatchObject({ propertyId: "primary", transferPrice: 1_500_000_000, acquisitionPrice: 1_000_000_000, capitalExpenditure: 50_000_000 });
  });
  it("조각 양도가액이 0원으로 떨어지면 던진다", () => {
    expect(() => splitCarryoverDebtPieces(card({ transferPrice: 1 }), { debt: 1, valuation: 1_000_000_000, keep: 999_999_999 })).toThrow();
  });
});

describe("carryoverDebtPiecesUnsupportedReason — 와이어(⑫)·엔진이 같은 키 목록을 쓴다", () => {
  const ok = { propertyType: "housing", acquisitionCause: "carryover_gift", reductions: [] };
  it("지원: 주택·토지·상업용건물 단순 모드", () => {
    for (const propertyType of ["housing", "land", "building"]) expect(carryoverDebtPiecesUnsupportedReason({ ...ok, propertyType })).toBeNull();
    expect(carryoverDebtPiecesUnsupportedReason({ ...ok, isNonBusinessLand: true, isUnregistered: true })).toBeNull();
  });
  it.each([
    ["분양권", { propertyType: "presale_right" }],
    ["입주권", { propertyType: "right_to_move_in" }],
    ["부담부증여", { transferType: "burdened_gift" }],
    ["부담부증여 정보", { burdenedGiftInfo: {} }],
    ["소유자 분리", { selfOwns: "land_only" }],
    ["별개 취득", { isSeparateAcquisition: true }],
    ["파트 이월과세", { landCarryoverTaxation: {} }],
    ["PHD", { preHousingDisclosure: {} }],
    ["다필지", { parcels: [{}] }],
    ["1990 토지", { pre1990Land: {} }],
    ["감면", { reductions: [{ type: "x" }] }],
    ["donorBuilt", { carryoverTaxation: { donorBuilt: {} } }],
    ["주택부수토지(토지 카드)", { landNature: "appurtenant_to_housing" }],
    ["부수토지 일체과세 컨텍스트", { primaryContextForCompanionRate: {} }],
    ["NBL 정밀", { nonBusinessLandDetails: {} }],
    ["감가상각", { depreciationAmount: 1 }],
    ["용도변경", { nonHousingToHousingConversion: {} }],
  ])("제외 — %s", (_n, extra) => {
    expect(carryoverDebtPiecesUnsupportedReason({ ...ok, ...extra })).toEqual(expect.any(String));
  });
});
