/**
 * Pre-Do anchor — **크로스 통산이 읽을 두 값의 echo** (PR-2)
 *
 * 크로스 통산 레이어는 두 엔진에서 자산별 **① 통산 «전» 양도소득금액**과
 * **② §102② 세율축 키**를 받아야 한다(계획서 §4.3 축 1-a·1-b).
 *
 * V-1 실측(2026-09-17):
 *   · 부동산 — `income`(통산 전) / `incomeAfterOffset`(통산 후) **이미 둘 다 있다**
 *   · 주식   — `transferIncome`을 **통산 후 값으로 갈아끼운다**(`stock-transfer-aggregate.ts`)
 *   · rateKey — **양쪽 다 미노출**
 *
 * ⛔ **부동산의 `rateGroup`을 이 자리에 쓰지 말 것.** 그것은 §104⑤ 버킷 축이고
 *   §102②은 **세율** 축이다 — 두 축은 직교한다(`loss-offset-rate-key.ts` 헤더).
 *   혼동하면 PR #1643이 고친 「거짓 분리·거짓 병합」이 그대로 재발한다.
 *
 * 계획서: `docs/00-pm/cross-engine-102-2-loss-offset.plan.md` §4.3 · §11 PR-2
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "./_helpers/mock-rates";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { passingBlockShareholderGate } from "./stock-transfer/_block-shareholder-fixture";

function stockInput(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi", isMajorShareholder: true, selfShareRatio: 0.03, selfMarketCap: 0,
    isLargestShareholderGroup: false, combinedShareRatio: 0, combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false, isHeavyRealEstateForRate: false, isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false, isMidsizeEnterprise: false, isListedSmallShareholder: false,
    isVentureCompany: false, isKOTCTrading: false,
    acquisitionDate: new Date("2022-01-01"), transferDate: new Date("2024-06-01"),
    shareCount: 100, totalIssuedShares: 1_000_000, acquisitionCause: "purchase",
    transferPriceMode: "actual", perShareTransferPrice: 50_000,
    acquisitionMode: "actual", perShareAcquisitionPrice: 40_000,
    acquiredBeforeListing: false, tradingHaltAtTransfer: false, bookLost: false,
    expenseMode: "actual", actualExpenses: 0,
    filingType: "preliminary", filingDate: new Date("2024-08-31"), isElectronicFiling: false,
    filingViolation: "none", isFraudulent: false, isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  };
}

function makeItem(id: string, label: string, o: Partial<TransferTaxItemInput>): TransferTaxItemInput {
  return { ...(baseTransferInput() as unknown as TransferTaxItemInput), propertyId: id, propertyLabel: label, ...o };
}
const rates = makeMockRates();
const LAND = {
  propertyType: "land" as const,
  acquisitionDate: new Date("2018-06-01"),
  transferDate: new Date("2024-06-01"),
  isOneHousehold: false,
  householdHousingCount: 0,
};
const run = (props: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate(
    { taxYear: 2024, annualBasicDeductionUsed: 0, properties: props } as AggregateTransferInput,
    rates,
  );

describe("§102② 크로스 — 부동산 echo (축 1-b)", () => {
  // ── 🔴 E-1 ──────────────────────────────────────────────────────────
  it("E-1 🔴: 자산별 §102② 세율축 키가 결과에 실린다", () => {
    const r = run([
      makeItem("A", "토지 A", { ...LAND, transferPrice: 1_000_000_000, acquisitionPrice: 500_000_000 }),
    ]);
    const A = r.properties.find((p) => p.propertyId === "A")!;
    expect(A.lossOffsetRateKey).toBeDefined();
    // §104①1호(§55① 기본누진)를 탔으므로 누진 «표» 키여야 한다 — 세율 «값»이 아니다.
    expect(A.lossOffsetRateKey).toBe("prog:104-1-1");
  });

  it("E-1b 🔴: 그 키는 `rateGroup`과 **다른 축**이다 (§104⑤ ≠ §102②)", () => {
    const r = run([
      makeItem("A", "토지 A", { ...LAND, transferPrice: 1_000_000_000, acquisitionPrice: 500_000_000 }),
    ]);
    const A = r.properties.find((p) => p.propertyId === "A")!;
    expect(A.lossOffsetRateKey).not.toBe(A.rateGroup);
  });

  // ── 🟢 E-2 (회귀 고정 — V-1이 확인한 「이미 옳은 것」) ───────────────
  it("E-2 🟢: 부동산은 통산 전(`income`)·후(`incomeAfterOffset`)를 이미 둘 다 준다", () => {
    const r = run([
      makeItem("A", "토지 A (차익)", { ...LAND, transferPrice: 1_000_000_000, acquisitionPrice: 500_000_000 }),
      makeItem("B", "토지 B (차손)", { ...LAND, transferPrice: 200_000_000, acquisitionPrice: 400_000_000 }),
    ]);
    const A = r.properties.find((p) => p.propertyId === "A")!;
    const B = r.properties.find((p) => p.propertyId === "B")!;
    expect(B.income).toBeLessThan(0);                 // 통산 «전»은 음수 그대로
    expect(B.incomeAfterOffset).toBe(0);              // 통산 «후»는 0
    expect(A.income).toBeGreaterThan(A.incomeAfterOffset); // 차손을 흡수한 만큼 줄었다
    expect(A.income - A.incomeAfterOffset).toBe(A.lossOffsetFromSameGroup);
  });

  it("E-3 🟢: 같은 세율군이면 두 자산의 키가 같다 (§167의2①1호 성립 조건)", () => {
    const r = run([
      makeItem("A", "토지 A", { ...LAND, transferPrice: 1_000_000_000, acquisitionPrice: 500_000_000 }),
      makeItem("B", "토지 B", { ...LAND, transferPrice: 200_000_000, acquisitionPrice: 400_000_000 }),
    ]);
    const [A, B] = ["A", "B"].map((id) => r.properties.find((p) => p.propertyId === id)!);
    expect(A.lossOffsetRateKey).toBe(B.lossOffsetRateKey);
  });
});

// ============================================================
// 주식·기타자산 echo (축 1-a·1-b)
// ============================================================

describe("§102② 크로스 — 주식·기타자산 echo", () => {
  /** 기타자산(§94①4호) 2종목 — 하나는 차익, 하나는 차손 */
  function otherAssetPair() {
    const base = stockInput();
    return [
      { ...base, ...passingBlockShareholderGate(new Date("2024-06-01")),
        marketType: "other_asset" as const, perShareTransferPrice: 200_000, perShareAcquisitionPrice: 80_000 },
      { ...base, ...passingBlockShareholderGate(new Date("2024-09-01")),
        marketType: "other_asset" as const, transferDate: new Date("2024-09-01"),
        perShareTransferPrice: 50_000, perShareAcquisitionPrice: 150_000 },
    ];
  }

  it("S-1 🔴: 통산 «전» 양도소득금액이 결과에 남는다", () => {
    const agg = calculateStockTransferTaxAggregate(otherAssetPair(), "aggregate");
    const gain = agg.items[0];
    // `transferIncome`은 통산 «후»로 덮인다 — 그래서 별도 필드가 필요했다.
    expect(gain.transferIncomeBeforeOffset).toBeDefined();
    expect(gain.transferIncomeBeforeOffset).toBeGreaterThan(gain.transferIncome);
    // 차이는 그 종목이 흡수한 차손과 같다.
    expect(gain.transferIncomeBeforeOffset! - gain.transferIncome).toBe(
      (gain.lossOffsetFromSameGroup ?? 0) + (gain.lossOffsetFromOtherGroup ?? 0),
    );
  });

  it("S-2 🔴: 자산별 §102② 세율축 키가 실린다", () => {
    const agg = calculateStockTransferTaxAggregate(otherAssetPair(), "aggregate");
    for (const it of agg.items) {
      expect(it.lossOffsetRateKey).toBeDefined();
    }
    // 기타자산 §55① 누진 — 주식 그룹 키("20" 등)가 아니다.
    expect(agg.items[0].lossOffsetRateKey).toBe("other_asset_progressive");
  });

  it("S-3 🟢: 차손 종목도 통산 전 값을 음수 그대로 준다", () => {
    const agg = calculateStockTransferTaxAggregate(otherAssetPair(), "aggregate");
    const loss = agg.items[1];
    expect(loss.transferIncomeBeforeOffset).toBeLessThan(0);
  });

  it("S-4 🟢: 단건 경로에는 실리지 않는다 (합산 전용 echo)", () => {
    const single = calculateStockTransferTax(stockInput());
    expect((single as { transferIncomeBeforeOffset?: number }).transferIncomeBeforeOffset).toBeUndefined();
  });
});
