/**
 * A-2 — 분할 매수 모드 + 자본조정(무상증자·형식감자)
 *
 * 계획: docs/00-pm/stock-transfer-split-capital-adjustments-a2.plan.md
 * 설계: docs/02-design/features/stock-transfer-split-capital-adjustments-a2.{engine,ui}.design.md
 * 법령: 소득세법 §17②(의제배당, MST 285523) · 집행기준 97-163-12(무상주, 법령 아님)
 *
 * 무상증자(자본준비금·비의제배당): 총취득원가 불변·주식수 증가·보유기간 원주 통산.
 * 분할 모드는 발생일 이전 보유 lot만 희석 → 매칭·차익에 반영(단일 모드 display-only와 다름).
 *
 *   CA-ENGINE-1: lot 1건 무상증자 100% → 200@5,000·차익 600,000
 *   CA-ENGINE-2: 2 lot 중 발생일 이전 lot만 희석
 *   CA-ENGINE-3: 형식감자 50% → 주식수 감소·총원가 불변
 *   CA-ENGINE-4: 의제배당(이익잉여금) → skip·주식수 불변
 *   CA-ENGINE-9: 발생일 ≤ 취득일 → 미적용
 *   CA-PRECISION-1: floor 잔차 300원 고정
 *   CA-VALIDATE-1: split+capital 유효 → 차단 없음
 *   CA-ZOD-1: split+capital body → 스키마 통과
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type {
  StockTransferInput,
  AcquisitionLot,
  TransferLot,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import {
  stockTransferInputSchema,
  addStockRefines,
} from "@/lib/api/stock-transfer-tax-schema";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { SYNTH_SINGLE_TRANSFER_ID } from "@/lib/stores/calc-wizard-stock-types";

type CapitalAdjustment = NonNullable<StockTransferInput["capitalAdjustments"]>[number];

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.6,
    selfMarketCap: 2_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2024-12-31"),
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    isListedSmallShareholder: false,
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2025-07-01"),
    shareCount: 200,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 8_000,
    acquisitionMode: "actual",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "estimated",
    filingType: "preliminary",
    filingDate: new Date("2025-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  };
}

function synthTransfer(shareCount: number, perShare: number): TransferLot {
  return { id: SYNTH_SINGLE_TRANSFER_ID, transferDate: new Date("2025-07-01"), shareCount, perShareTransferPrice: perShare };
}

describe("A-2: 분할 + 자본조정", () => {
  it("CA-ENGINE-1: lot 1건 무상증자 100% → 200@5,000·차익 600,000", () => {
    const lots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2020-01-01"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
    ];
    const adj: CapitalAdjustment[] = [
      { type: "bonus_capital_reserve", eventDate: new Date("2022-01-01"), ratio: 1.0 },
    ];
    const r = calculateStockTransferTax(
      baseInput({ shareCount: 200, acquisitionLots: lots, transferLots: [synthTransfer(200, 8_000)], costAllocationMethod: "specific",
        specificMatchings: [{ transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: 200 }], capitalAdjustments: adj }),
    );
    expect(r.acquisitionPrice).toBe(1_000_000);  // 200 × 5,000 (총원가 불변)
    expect(r.transferPrice).toBe(1_600_000);     // 200 × 8,000
    expect(r.transferIncome + r.expenses).toBe(600_000); // 차익(개산공제 전) = 1,600,000 − 1,000,000
    expect(r.lotCapitalAdjustmentsDetail).toBeDefined();
  });

  it("CA-ENGINE-2: 2 lot 중 발생일 이전 lot만 희석", () => {
    const lots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2020-01-01"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2023-01-01"), shareCount: 100, perShareAcquisitionPrice: 20_000, acquisitionCause: "purchase" },
    ];
    const adj: CapitalAdjustment[] = [
      { type: "bonus_capital_reserve", eventDate: new Date("2022-01-01"), ratio: 1.0 },  // a(2020)만 해당, b(2023) 이후
    ];
    const r = calculateStockTransferTax(
      baseInput({ shareCount: 200, acquisitionLots: lots, transferLots: [synthTransfer(200, 8_000)], costAllocationMethod: "specific",
        specificMatchings: [{ transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: 200 }], capitalAdjustments: adj }),
    );
    // a만 200@5,000 (전량 매도). b 미매칭.
    expect(r.acquisitionPrice).toBe(1_000_000);
    const detail = r.lotCapitalAdjustmentsDetail!;
    expect(detail.find((d) => d.lotId === "a")?.afterShares).toBe(200);
    expect(detail.find((d) => d.lotId === "b")?.afterShares).toBe(100); // 불변
  });

  it("CA-ENGINE-3: 형식감자 50% → 주식수 감소·총원가 불변", () => {
    const lots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2020-01-01"), shareCount: 200, perShareAcquisitionPrice: 5_000, acquisitionCause: "purchase" },
    ];
    const adj: CapitalAdjustment[] = [
      { type: "reduction_proportional", eventDate: new Date("2022-01-01"), ratio: 0.5 },
    ];
    const r = calculateStockTransferTax(
      baseInput({ shareCount: 100, acquisitionLots: lots, transferLots: [synthTransfer(100, 12_000)], costAllocationMethod: "specific",
        specificMatchings: [{ transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: 100 }], capitalAdjustments: adj }),
    );
    // 200@5,000(100만) → 형식감자 50% → 100@10,000(100만 불변). 전량 100 매도.
    expect(r.acquisitionPrice).toBe(1_000_000);
    expect(r.lotCapitalAdjustmentsDetail!.find((d) => d.lotId === "a")?.adjustedPerShareCost).toBe(10_000);
  });

  it("CA-ENGINE-4: 의제배당(이익잉여금) → skip·주식수 불변", () => {
    const lots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2020-01-01"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
    ];
    const adj: CapitalAdjustment[] = [
      { type: "bonus_retained_earnings", eventDate: new Date("2022-01-01"), ratio: 1.0 },
    ];
    const r = calculateStockTransferTax(
      baseInput({ shareCount: 100, acquisitionLots: lots, transferLots: [synthTransfer(100, 8_000)], costAllocationMethod: "specific",
        specificMatchings: [{ transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: 100 }], capitalAdjustments: adj }),
    );
    expect(r.acquisitionPrice).toBe(1_000_000); // 100@10,000 불변 (skip)
    expect(r.lotCapitalAdjustmentsDetail!.find((d) => d.lotId === "a")?.afterShares).toBe(100);
  });

  it("CA-ENGINE-9: 발생일 ≤ 취득일 → 미적용", () => {
    const lots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2022-06-01"), shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
    ];
    const adj: CapitalAdjustment[] = [
      { type: "bonus_capital_reserve", eventDate: new Date("2022-01-01"), ratio: 1.0 }, // 취득(2022-06) 이전
    ];
    const r = calculateStockTransferTax(
      baseInput({ shareCount: 100, acquisitionLots: lots, transferLots: [synthTransfer(100, 8_000)], costAllocationMethod: "specific",
        specificMatchings: [{ transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: 100 }], capitalAdjustments: adj }),
    );
    expect(r.acquisitionPrice).toBe(1_000_000); // 미적용
    expect(r.lotCapitalAdjustmentsDetail!.find((d) => d.lotId === "a")?.afterShares).toBe(100);
  });

  it("CA-PRECISION-1: floor 잔차 300원 (300@10,000·증자50%→450·floor 6,666)", () => {
    const lots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2020-01-01"), shareCount: 300, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
    ];
    const adj: CapitalAdjustment[] = [
      { type: "bonus_capital_reserve", eventDate: new Date("2022-01-01"), ratio: 0.5 },
    ];
    const r = calculateStockTransferTax(
      baseInput({ shareCount: 450, acquisitionLots: lots, transferLots: [synthTransfer(450, 12_000)], costAllocationMethod: "specific",
        specificMatchings: [{ transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: 450 }], capitalAdjustments: adj }),
    );
    const d = r.lotCapitalAdjustmentsDetail!.find((x) => x.lotId === "a")!;
    expect(d.afterShares).toBe(450);
    expect(d.adjustedPerShareCost).toBe(6_666);
    // 재구성 450 × 6,666 = 2,999,700 (원 총원가 3,000,000 − 잔차 300)
    expect(r.acquisitionPrice).toBe(2_999_700);
  });

  it("CA-VALIDATE-1: split+capital 유효 → 차단 없음", () => {
    const form = {
      ...createInitialStockFormData(),
      marketType: "unlisted" as const,
      acquisitionMode: "actual" as const,
      acquisitionActualInputMode: "lots" as const,
      lotsMode: "single" as const,
      costAllocationMethod: "fifo" as const,
      shareCount: "200",
      transferActualInputMode: "per_share" as const,
      perShareTransferPrice: "8000",
      transferDate: "2025-07-01",
      acquisitionDate: "2020-01-01",
      acquisitionLots: [
        { id: "a", acquisitionDate: "2020-01-01", shareCount: "100", perShareAcquisitionPrice: "10000", acquisitionCause: "purchase" as const },
        { id: "b", acquisitionDate: "2021-01-01", shareCount: "100", perShareAcquisitionPrice: "12000", acquisitionCause: "purchase" as const },
      ],
      capitalAdjustments: [
        { type: "bonus_capital_reserve" as const, eventDate: "2022-01-01", ratio: "1.0", notes: "" },
      ],
    };
    const errors = validateStep2Domestic(form).filter((e) => e.severity === "error" && e.field === "capitalAdjustments");
    expect(errors).toHaveLength(0);
  });

  it("CA-ZOD-1: split+capital body → 스키마 통과", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const parsed = schema.safeParse({
      ...baseInput(),
      acquisitionActualInputMode: "lots",
      acquisitionLots: [
        { id: "a", acquisitionDate: "2020-01-01", shareCount: 100, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      ],
      transferLots: [{ id: SYNTH_SINGLE_TRANSFER_ID, transferDate: "2025-07-01", shareCount: 200, perShareTransferPrice: 8_000 }],
      costAllocationMethod: "fifo",
      capitalAdjustments: [{ type: "bonus_capital_reserve", eventDate: "2022-01-01", ratio: 1.0 }],
    });
    expect(parsed.success).toBe(true);
  });
});
