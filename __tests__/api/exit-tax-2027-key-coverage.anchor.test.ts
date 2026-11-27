/**
 * 국외전출세 2027.1.1. 개정 — ⑫ Zod · ⑭ 매핑 키 커버리지 가드 (PR-5)
 *
 * 문제: `z.object`는 미지 키를 **조용히 제거**하고, ⑭ 매핑은 필드를 하나씩 옮기는데 대부분 optional이라
 *   TypeScript가 누락을 못 잡는다 → 엔진에 새 필드가 생기고 ⑫·⑭에 안 옮기면 값이 엔진에 도달하지 않는다.
 *
 * 가드:
 *  1. `ENGINE_*_KEYS`는 `satisfies Record<keyof 엔진타입, true>` — 엔진 타입에 키가 생기거나 사라지면 **컴파일이 실패**한다
 *     (`: Record<…>` 주석이 아니라 `satisfies` — 주석은 keyof를 넓혀 가드를 죽인다).
 *  2. 그 키 집합이 ⑫ Zod의 `shape` 키 집합과 **정확히 같은지** 런타임으로 대조한다(양방향).
 *  3. ⑭ 매핑은 모든 키에 값을 넣은 body를 통과시켜 **엔진 input에 전부 도달**하는지 본다.
 *  4. ⑨ enum은 엔진 타입의 유니언과 같은 값 집합이어야 한다(컴파일 + 런타임).
 */
import { describe, it, expect, expectTypeOf } from "vitest";
import type { z } from "zod";
import type {
  ExitTaxBasicDeductionAllocation,
  ExitTaxHolding,
  ExitTaxHoldingActualTransfer,
  ExitTaxInput,
  ForeignWorkerChecks,
} from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import {
  basicDeductionAllocationSchema,
  deferralReasonSchema,
  departureDayValuationModeSchema,
  exitTaxHoldingActualTransferSchema,
  exitTaxHoldingSchema,
  exitTaxInputSchema,
  foreignTaxExclusionReasonSchema,
  foreignWorkerChecksSchema,
  foreignWorkerFamilyKindSchema,
  foreignWorkerStatusSchema,
} from "@/lib/api/stock-transfer-exit-tax-schema";
import {
  buildExitTaxEngineInput,
  mapExitTaxHolding,
} from "@/lib/api/stock-transfer-exit-tax-engine-input";

const ENGINE_HOLDING_KEYS = {
  id: true,
  stockName: true,
  marketType: true,
  shareCount: true,
  acquisitionDate: true,
  perShareAcquisitionPrice: true,
  departureDayValuationMode: true,
  departureDayMarketPrice: true,
  priorYearEndMonthAvg: true,
  unlistedSamplePrice: true,
  unlistedStdPricePerShare: true,
  isListedForeignCorp: true,
  isSmallMediumEnterprise: true,
  countryCode: true,
  foreignCurrencyCode: true,
  departureDayPriceForeign: true,
  departureExchangeRate: true,
  perShareAcquisitionPriceForeign: true,
  acquisitionExchangeRate: true,
  actualTransfer: true,
} satisfies Record<keyof ExitTaxHolding, true>;

const ENGINE_ACTUAL_TRANSFER_KEYS = {
  shareCount: true,
  transferDate: true,
  pricePerShare: true,
  priceForeign: true,
  exchangeRate: true,
  foreignTaxPaid: true,
  foreignTaxPaidForeign: true,
  foreignTaxCurrencyCode: true,
  foreignTaxExchangeRate: true,
  domesticSourceTaxWithheld: true,
} satisfies Record<keyof ExitTaxHoldingActualTransfer, true>;

const ENGINE_INPUT_KEYS = {
  marketType: true,
  yearsResidentLast10: true,
  departureDate: true,
  isMajorShareholder: true,
  holdings: true,
  foreignWorkerStatus: true,
  foreignWorkerChecks: true,
  foreignWorkerFamilyKind: true,
  foreignWorkerStartDate: true,
  basicDeductionAllocation: true,
  deferralRequested: true,
  deferralReason: true,
  actualTransferDate: true,
  actualTransferPricePerShare: true,
  foreignTaxPaid: true,
  foreignTaxPaidForeign: true,
  foreignTaxCurrencyCode: true,
  foreignTaxExchangeRate: true,
  foreignTaxExclusionReason: true,
  domesticSourceTaxWithheld: true,
  hasFiledHoldingsReport: true,
  totalFaceValue: true,
  reenteredWithin5Years: true,
  deferralInterestDays: true,
  deferralInterestDailyRate: true,
} satisfies Record<keyof ExitTaxInput, true>;

const ENGINE_WORKER_CHECK_KEYS = {
  isOfficerOrEmployee: true,
  isNotDailyWorker: true,
  domesticWorkRatioAtLeast80: true,
  departedWithin6MonthsOfWorkEnd: true,
} satisfies Record<keyof ForeignWorkerChecks, true>;

const ENGINE_ALLOCATION_KEYS = {
  clause1: true,
  clause2a: true,
  clause2b: true,
} satisfies Record<keyof ExitTaxBasicDeductionAllocation, true>;

const sorted = (o: object) => Object.keys(o).sort();

describe("⑫ Zod 키 집합 = 엔진 타입 키 집합 (양방향)", () => {
  it("종목 — exitTaxHoldingSchema", () => {
    expect(sorted(exitTaxHoldingSchema.shape)).toEqual(sorted(ENGINE_HOLDING_KEYS));
  });
  it("최상위 — exitTaxInputSchema", () => {
    expect(sorted(exitTaxInputSchema.shape)).toEqual(sorted(ENGINE_INPUT_KEYS));
  });
  it("중첩 — 종목별 실제 양도 actualTransfer (PR-7a)", () => {
    expect(sorted(exitTaxHoldingActualTransferSchema.shape)).toEqual(sorted(ENGINE_ACTUAL_TRANSFER_KEYS));
  });
  it("중첩 — foreignWorkerChecks · basicDeductionAllocation (상위 가드는 중첩 안을 못 본다)", () => {
    expect(sorted(foreignWorkerChecksSchema.shape)).toEqual(sorted(ENGINE_WORKER_CHECK_KEYS));
    expect(sorted(basicDeductionAllocationSchema.shape)).toEqual(sorted(ENGINE_ALLOCATION_KEYS));
  });
});

describe("⑨ Zod enum 값 = 엔진 타입 유니언", () => {
  it("컴파일 — 값 집합이 서로 같다", () => {
    expectTypeOf<z.infer<typeof departureDayValuationModeSchema>>().toEqualTypeOf<
      ExitTaxHolding["departureDayValuationMode"]
    >();
    expectTypeOf<z.infer<typeof exitTaxHoldingSchema>["marketType"]>().toEqualTypeOf<ExitTaxHolding["marketType"]>();
    expectTypeOf<z.infer<typeof foreignWorkerStatusSchema>>().toEqualTypeOf<
      NonNullable<ExitTaxInput["foreignWorkerStatus"]>
    >();
    expectTypeOf<z.infer<typeof foreignWorkerFamilyKindSchema>>().toEqualTypeOf<
      NonNullable<ExitTaxInput["foreignWorkerFamilyKind"]>
    >();
    expectTypeOf<z.infer<typeof deferralReasonSchema>>().toEqualTypeOf<ExitTaxInput["deferralReason"]>();
    expectTypeOf<z.infer<typeof foreignTaxExclusionReasonSchema>>().toEqualTypeOf<
      ExitTaxInput["foreignTaxExclusionReason"]
    >();
  });
  it("런타임 — 새 값이 enum에 있다", () => {
    expect(departureDayValuationModeSchema.options).toEqual(
      expect.arrayContaining(["foreign_market_price", "foreign_decree_178_3"]),
    );
    expect(exitTaxHoldingSchema.shape.marketType.options).toContain("foreign_stock");
    expect(foreignWorkerStatusSchema.options).toEqual(["none", "foreign_worker", "foreign_worker_family"]);
    expect(foreignWorkerFamilyKindSchema.options).toEqual(["spouse", "child_20_or_under"]);
  });
});

describe("⑭ 매핑 — 모든 키가 엔진 input에 도달한다", () => {
  const FULL_HOLDING: Record<keyof ExitTaxHolding, unknown> = {
    id: "f1",
    stockName: "F1",
    marketType: "foreign_stock",
    shareCount: 1,
    acquisitionDate: "2018-01-01",
    perShareAcquisitionPrice: 2,
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: 3,
    priorYearEndMonthAvg: 4,
    unlistedSamplePrice: 5,
    unlistedStdPricePerShare: 6,
    isListedForeignCorp: false,
    isSmallMediumEnterprise: false,
    countryCode: "US",
    foreignCurrencyCode: "USD",
    departureDayPriceForeign: 7,
    departureExchangeRate: 8,
    perShareAcquisitionPriceForeign: 9,
    acquisitionExchangeRate: 10,
    actualTransfer: {
      shareCount: 1,
      transferDate: "2027-03-01",
      pricePerShare: 1,
      priceForeign: 2,
      exchangeRate: 3,
      foreignTaxPaid: 4,
      foreignTaxPaidForeign: 5,
      foreignTaxCurrencyCode: "USD",
      foreignTaxExchangeRate: 6,
      domesticSourceTaxWithheld: 7,
    },
  };
  const FULL_INPUT: Record<keyof ExitTaxInput, unknown> = {
    marketType: "exit_tax",
    yearsResidentLast10: 10,
    departureDate: "2027-01-01",
    isMajorShareholder: true,
    holdings: [FULL_HOLDING],
    foreignWorkerStatus: "foreign_worker_family",
    foreignWorkerChecks: { isOfficerOrEmployee: true, isNotDailyWorker: true, domesticWorkRatioAtLeast80: true, departedWithin6MonthsOfWorkEnd: true },
    foreignWorkerFamilyKind: "spouse",
    foreignWorkerStartDate: "2019-06-01",
    basicDeductionAllocation: { clause1: 1, clause2a: 2, clause2b: 3 },
    deferralRequested: true,
    deferralReason: "study_abroad",
    actualTransferDate: "2027-03-01",
    actualTransferPricePerShare: 11,
    foreignTaxPaid: 12,
    foreignTaxPaidForeign: 13,
    foreignTaxCurrencyCode: "USD",
    foreignTaxExchangeRate: 14,
    foreignTaxExclusionReason: "step_up",
    domesticSourceTaxWithheld: 15,
    hasFiledHoldingsReport: false,
    totalFaceValue: 16,
    reenteredWithin5Years: true,
    deferralInterestDays: 17,
    deferralInterestDailyRate: 0.000022,
  };

  it("종목 — 모든 키에 값이 실린다 (날짜는 Date로)", () => {
    const mapped = mapExitTaxHolding(FULL_HOLDING) as Record<string, unknown>;
    for (const key of Object.keys(ENGINE_HOLDING_KEYS)) {
      expect(mapped[key], `holdings[].${key} 가 엔진 input에 도달하지 않음`).not.toBeUndefined();
    }
    expect(mapped.acquisitionDate).toBeInstanceOf(Date);
  });

  it("종목 안 actualTransfer — 모든 키가 도달하고 transferDate는 Date로 (⑭ PR-7a)", () => {
    const mapped = mapExitTaxHolding(FULL_HOLDING) as { actualTransfer?: Record<string, unknown> };
    expect(mapped.actualTransfer).toBeDefined();
    for (const key of Object.keys(ENGINE_ACTUAL_TRANSFER_KEYS)) {
      expect(mapped.actualTransfer?.[key], `holdings[].actualTransfer.${key} 가 엔진 input에 도달하지 않음`).not.toBeUndefined();
    }
    expect(mapped.actualTransfer?.transferDate).toBeInstanceOf(Date);
  });

  it("최상위 — 모든 키에 값이 실린다 (날짜 3개는 Date로)", () => {
    const mapped = buildExitTaxEngineInput(FULL_INPUT) as Record<string, unknown>;
    for (const key of Object.keys(ENGINE_INPUT_KEYS)) {
      expect(mapped[key], `${key} 가 엔진 input에 도달하지 않음`).not.toBeUndefined();
    }
    expect(mapped.departureDate).toBeInstanceOf(Date);
    expect(mapped.actualTransferDate).toBeInstanceOf(Date);
    expect(mapped.foreignWorkerStartDate).toBeInstanceOf(Date);
    expect((mapped.holdings as Array<{ acquisitionDate: unknown }>)[0].acquisitionDate).toBeInstanceOf(Date);
  });
});
