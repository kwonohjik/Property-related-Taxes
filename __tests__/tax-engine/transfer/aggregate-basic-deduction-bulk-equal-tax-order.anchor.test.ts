/**
 * anchor: 일괄양도 기본공제 — **세액이 같을 때**의 배분 순서(한계세율 ↓ → 자산 번호 ↑).
 *
 * 계획서: docs/02-design/features/transfer-basic-deduction-bulk-equal-tax-order.plan.md (B-1~B-5·B-7)
 *
 * 일괄양도는 모든 자산의 양도일이 같아 기본공제가 「납세자에게 유리한 순서」(재일46014-1685 · PR #2220)로 정해진다.
 * 어느 자산에 공제해도 세액이 같으면 유불리가 없으므로 결정적 표시 규약만 남는다 — 종전 `propertyId` 사전순은
 * 일괄양도의 id(`primary` · `asset-<생성 시각>`) 때문에 주 자산이 늘 뒤로 밀리고 함께 양도 자산끼리는 생성 시각
 * 순이었다. 사용자 결정(2026-10-16): 일괄양도는 **한계세율(자산 단독 적용세율) 높은 자산 → 자산 번호(입력 순서)**.
 *
 * 기대값은 master `40829042b` probe 실측(모의 세율표 — 계획서 §4). 총 부담·결정세액은 두 규칙에서 같다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate, type TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const T = "2026-06-01";
/** 함께 양도 자산 id — 실제 형식(`asset-<Date.now()>-<n>`, `calc-wizard-asset-factory.ts`) */
const EARLY = "asset-1792147700000-2";
const LATE = "asset-1792147799999-1";

function item(id: string, o: Partial<TransferTaxItemInput>): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: D(T),
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}
/** 사업용 토지(2015-01-01 취득 · 장기보유특별공제 22%) */
const land = (id: string, transferPrice: number) =>
  item(id, { transferPrice, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01"), isNonBusinessLand: false });

const run = (props: TransferTaxItemInput[], bulk = true) =>
  calculateTransferTaxAggregate(
    {
      taxYear: props[0].transferDate.getFullYear(),
      annualBasicDeductionUsed: 0,
      properties: props,
      ...(bulk ? { sameDayEqualTaxOrder: "marginalRateThenAssetNumber" as const } : {}),
    },
    rates,
  );
const allocOf = (r: ReturnType<typeof run>) =>
  Object.fromEntries(r.properties.map((p) => [p.propertyId, p.allocatedBasicDeduction]));
const rateOf = (r: ReturnType<typeof run>) => Object.fromEntries(r.properties.map((p) => [p.propertyId, p.appliedRate]));

describe("일괄양도 — 세액이 같으면 한계세율 높은 자산 → 자산 번호 순", () => {
  it("B-1 세율이 자산 번호보다 앞선다 — 자산2(0.35)가 주 자산(0.24)보다 먼저 · 총 48,749,800", () => {
    const r = run([land("primary", 400_000_000), land(LATE, 420_000_000)]);
    expect(rateOf(r)).toEqual({ primary: 0.24, [LATE]: 0.35 });
    expect(allocOf(r)).toEqual({ primary: 0, [LATE]: 2_500_000 });
    expect([r.totalTax, r.determinedTax]).toEqual([48_749_800, 44_318_000]);
  });

  it("B-2 주 자산 세율이 높으면 주 자산이 받는다(종전: id 사전순으로 자산2) · 총 193,545,000", () => {
    const r = run([land("primary", 900_000_000), land(LATE, 350_000_000)]);
    expect(rateOf(r)).toEqual({ primary: 0.4, [LATE]: 0.15 });
    expect(allocOf(r)).toEqual({ primary: 2_500_000, [LATE]: 0 });
    expect([r.totalTax, r.determinedTax]).toEqual([193_545_000, 175_950_000]);
    // 순서를 뒤집어도 세율이 정한다
    const flipped = run([land("primary", 350_000_000), land(LATE, 900_000_000)]);
    expect(allocOf(flipped)).toEqual({ primary: 0, [LATE]: 2_500_000 });
    expect(flipped.totalTax).toBe(193_545_000);
  });

  it("B-3 세율이 같으면 자산 번호 — 주 자산(자산 1)이 받는다 · 총 42,229,000", () => {
    const r = run([land("primary", 400_000_000), land(LATE, 400_000_000)]);
    expect(rateOf(r)).toEqual({ primary: 0.24, [LATE]: 0.24 });
    expect(allocOf(r)).toEqual({ primary: 2_500_000, [LATE]: 0 });
    expect([r.totalTax, r.determinedTax]).toEqual([42_229_000, 38_390_000]);
  });

  it("B-4 함께 양도 자산끼리는 생성 시각이 아니라 자산 번호 — 나중에 만든 자산2가 자산3보다 먼저", () => {
    const r = run([land("primary", 320_000_000), land(LATE, 400_000_000), land(EARLY, 400_000_000)]);
    expect(rateOf(r)).toEqual({ primary: 0.15, [LATE]: 0.24, [EARLY]: 0.24 });
    expect(allocOf(r)).toEqual({ primary: 0, [LATE]: 2_500_000, [EARLY]: 0 });
    expect(r.totalTax).toBe(48_749_800);
  });

  it("B-5 세액이 다르면 유리 판정이 이긴다 — #2220 A-1 L·n에 일괄 규칙을 걸어도 n · 총 918,126,000", () => {
    const T23 = "2023-03-20";
    const L = item("primary", { transferDate: D(T23), transferPrice: 1_300_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2022-03-20"), isNonBusinessLand: true, nonBusinessLandAreaRatio: 0.8 } as Partial<TransferTaxItemInput>);
    const n = item(LATE, { transferDate: D(T23), transferPrice: 1_200_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2017-02-20"), isNonBusinessLand: true });
    const r = run([L, n]);
    expect(allocOf(r)).toEqual({ primary: 0, [LATE]: 2_500_000 });
    expect(r.totalTax).toBe(918_126_000);
  });
});

describe("B-7 기본값(다건 합산)은 종전 그대로 — propertyId 사전순", () => {
  it("세율 같은 두 자산: `asset-…` < `primary`라 자산2가 받는다(총세액 동일)", () => {
    const r = run([land("primary", 400_000_000), land(LATE, 400_000_000)], false);
    expect(allocOf(r)).toEqual({ primary: 0, [LATE]: 2_500_000 });
    expect(r.totalTax).toBe(42_229_000);
  });
  it("주 자산 세율이 높아도 propertyId 순 — 자산2", () => {
    const r = run([land("primary", 900_000_000), land(LATE, 350_000_000)], false);
    expect(allocOf(r)).toEqual({ primary: 0, [LATE]: 2_500_000 });
    expect(r.totalTax).toBe(193_545_000);
  });
});
