/**
 * anchor: 부동산 ↔ 기타자산 §102② 크로스 통산 — 기타자산의 차손을 받은 §77 감면 토지도 「소득세법 시행령」 §167의2②로
 * B를 줄인다. 크로스 레이어는 감면을 직접 계산하지 않고 엔진을 다시 부르므로(외부 행 → `lossOffsetFromOther`)
 * 부동산 주택 차손을 받은 것과 같은 감면이어야 한다.
 * 계획서 `docs/02-design/features/transfer-90-1-reducible-income-after-loss-offset.plan.md` §4.4 C-2.
 */
import { describe, it, expect } from "vitest";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { buildCrossInjection } from "@/lib/calc/cross-102-2-apply";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const T = "2023-03-20";
/** §77 현금 10% 토지 — 양도소득금액 333,000,000. */
const L = () =>
  baseTransferInput({
    propertyType: "land", transferPrice: 650_000_000, acquisitionPrice: 200_000_000, acquisitionDate: D("2010-03-20"), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: false, expenses: 0, annualBasicDeductionUsed: 0,
    reductions: [{ type: "public_expropriation", cashCompensation: 650_000_000, bondCompensation: 0, businessApprovalDate: D("2022-06-01") }],
  } as Partial<TransferTaxInput>);
const H = () =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_900_000_000, acquisitionPrice: 2_000_000_000, acquisitionDate: D("2017-02-20"), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 2, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
/** 기타자산(특정주식 — 누진) — 크로스 레이어가 읽는 필드만. */
const other = (transferIncome: number) =>
  ({ basicDeductionGroup: "real_estate_and_other_asset", taxCategory: "other_asset_block_shareholder", isShortTermHolding: false, transferIncome, isExempt: false }) as unknown as StockTransferResult;

const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const run = (items: TransferTaxInput[], external?: { id: string; income: number; rateKey: string; exempt: boolean }[]) =>
  calculateTransferTaxAggregate(
    { taxYear: 2023, properties: items.map((x, i) => asItem(x, `A${i}`)), annualBasicDeductionUsed: 0, ...(external ? { crossLossOffsetExternal: external } : {}) },
    rates,
  );

describe("크로스 통산 — 기타자산 차손을 받은 감면 토지", () => {
  it("기타자산 −100,000,000: 감면 6,765,000 · B 233,000,000 = 부동산 주택 차손 −100,000,000과 같다 (종전 9,699,924)", () => {
    const injection = buildCrossInjection(run([L()]), other(-100_000_000));
    if (!injection.ok) throw new Error(injection.reason);
    const pass2 = run([L()], injection.injection.realEstateExternalRows);
    expect(pass2.reductionAmount).toBe(6_765_000);
    expect(pass2.reductionBreakdown[0].eligibleIncomeBeforeRate).toBe(233_000_000);
    expect(pass2.reductionAmount).toBe(run([L(), H()]).reductionAmount);
    // 불변식: 부동산 흡수 + 기타자산 흡수 = 차손 총액
    const absorbed = pass2.properties.reduce((s, p) => s + (p.income - p.incomeAfterOffset), 0);
    expect(absorbed - injection.injection.otherAssetIncome).toBe(100_000_000);
  });
});
