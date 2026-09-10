/**
 * MTX — 상장 환산취득가 **4갈래 회귀표** (S2 안전망)
 *
 * 계획서 `docs/00-pm/stock-listed-conversion-unification.plan.md` **S2**.
 *
 * ## 왜 «표»여야 하는가
 *
 * S3에서 UI를 재구성한다(분모 공통 블록 + 분자 산정 방식 라디오 1개). 그때
 * **「바뀐 것이 UI인가 계산인가」를 가를 수단**이 없으면 조용한 회귀를 못 잡는다.
 * 이 파일이 그 기준선이다 — 값은 전부 **실행 결과로 채웠다**(추정 없음).
 *
 * ## 구조 — 분모 1개 + 분자 4갈래
 *
 *   환산취득가 = 양도가 × ( 취득 당시 기준시가 ÷ 양도 당시 기준시가 )
 *                           └─ 4갈래 ─┘         └─ 공통(예외 1건) ─┘
 *
 * 네 행이 **같은 base**(양도가·주식수·분모)를 쓰므로 분자 산정만 달라진다.
 * R1과 R2는 분자를 5,600으로 맞춰 두었다 — 「경로가 달라도 분자가 같으면 세액이 같다」를
 * 보이기 위해서다. 그래서 **`method`를 함께 못박아** 두 행이 뒤바뀌는 것도 잡는다.
 *
 * ## ⚠️ `finalPerShareValue`는 경로마다 «의미»가 다르다
 *
 *   R1 일반    → 25,061 = **환산 후** 1주당 취득가 (`stock-acquisition-basis.ts` Bug-A 정정분)
 *   R2·R3·R4  → 5,600·5,824·5,600 = 1주당 **취득기준시가**
 *
 * 현재 소비처는 경로별로 게이팅돼 있어 오표시가 없다
 * (`StockTransferTaxResultViewHelpers.tsx:83`이 `method === "post_listing_conversion"`으로 건다).
 * 그러나 S3에서 경로를 하나로 합칠 때 **이 의미 분기를 모르고 통일하면 화면이 조용히 틀려진다.**
 * 그래서 두 필드를 **함께** 고정한다.
 *
 * ## 불가 조합 2건은 «값»이 아니라 «차단»을 고정한다
 *
 *   A. 취득 후 상장 × 양도일 거래정지 — ⑧ `stock-transfer-tax-validate-step2.ts:359` · ⑫ `:419`
 *   B. 취득 후 상장 × 취득일 거래정지 — ⑧ `:367` · ⑫ `:429`
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";

const SHARE_COUNT = 1_000;
/** 🔑 주식수로 나누어떨어지지 않게 — 분모 fallback 함정(PLD-0)과 같은 이유 */
const TRANSFER_TOTAL = 44_753_000;
const TRANSFER_STD = 10_000;

function base(over: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: false, // 장외 — 과세 경로로 고정(비과세면 세액이 0이라 표가 무의미)
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2018-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: SHARE_COUNT,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: TRANSFER_TOTAL,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: TRANSFER_STD,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    tradingHaltAtAcquisition: false,
    bookLost: false,
    expenseMode: "estimated",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...over,
  };
}

/** R1 — 분자를 «입력»으로 받는 일반 경로 (모법 §99①3) */
const r1General = () => base({ acquisitionDatePriceAvg1Month: 5_600 });

/** R2 — 취득일 거래정지: 분자만 §165④ 보충 평가 (6,000×3 + 5,000×2)/5 = 5,600 */
const r2HaltAcquisition = () =>
  base({
    tradingHaltAtAcquisition: true,
    acquisitionYearNetIncomePerShare: 6_000,
    acquisitionYearNetAssetPerShare: 5_000,
  });

/** R3 — 취득 후 상장 §165⑤: 분자를 8,001 × (취득연도 ÷ 상장연도)로 «산출» */
const r3PostListing = () =>
  base({
    acquiredBeforeListing: true,
    listingDate: new Date("2019-08-21"),
    listingDatePriceAvg1Month: 8_001,
    listingYearNetIncomePerShare: 61_570,
    listingYearNetAssetPerShare: 5_352,
    acquisitionYearNetIncomePerShare: 44_520,
    acquisitionYearNetAssetPerShare: 4_348,
  });

/** R4 — 양도일 거래정지: **분모까지** 보충 평가로 대체된다 (4갈래 중 유일) */
const r4HaltTransfer = () =>
  base({
    tradingHaltAtTransfer: true,
    transferYearNetIncomePerShare: 12_000,
    transferYearNetAssetPerShare: 9_000,
    acquisitionYearNetIncomePerShare: 6_000,
    acquisitionYearNetAssetPerShare: 5_000,
  });

describe("MTX — 상장 환산 4갈래 회귀표 (S3 수용 기준)", () => {
  it("MTX-R1 일반 (취득일 1개월 종가평균)", () => {
    const r = calculateStockTransferTax(r1General());
    expect(r.transferPrice).toBe(44_753_000);
    expect(r.acquisitionPrice).toBe(25_061_680);
    expect(r.estimatedBase).toBe(5_600_000);
    expect(r.expenses).toBe(56_000);
    expect(r.calculatedTax).toBe(3_427_060);
    expect(r.valuationDetail?.method).toBe("monthly_avg_listed");
    // ⚠️ 이 경로만 «환산 후» 1주당 취득가다 (위 파일 주석 참조)
    expect(r.valuationDetail?.finalPerShareValue).toBe(25_061);
  });

  it("MTX-R2 취득일 거래정지 → 보충 평가 (분모는 종가평균 유지)", () => {
    const r = calculateStockTransferTax(r2HaltAcquisition());
    expect(r.acquisitionPrice).toBe(25_061_680);
    expect(r.estimatedBase).toBe(5_600_000);
    expect(r.expenses).toBe(56_000);
    expect(r.calculatedTax).toBe(3_427_060);
    // 🔑 세액은 R1과 같다(분자가 같으니까) — 갈리는 것은 method다
    expect(r.valuationDetail?.method).toBe("halt_acquisition_conversion");
    expect(r.valuationDetail?.finalPerShareValue).toBe(5_600);
    expect(r.warnings).toContain("소득세법 시행령 §165③");
  });

  it("MTX-R3 취득 후 상장 §165⑤ (분모는 종가평균 유지)", () => {
    const r = calculateStockTransferTax(r3PostListing());
    expect(r.acquisitionPrice).toBe(26_064_147);
    expect(r.estimatedBase).toBe(5_824_000);
    expect(r.expenses).toBe(58_240);
    expect(r.calculatedTax).toBe(3_226_120);
    expect(r.valuationDetail?.method).toBe("post_listing_conversion");
    expect(r.valuationDetail?.finalPerShareValue).toBe(5_824);
    expect(r.postListingDetail?.finalPerShareValue).toBe(5_824);
  });

  it("MTX-R4 양도일 거래정지 — **분모까지** 보충 평가 (유일한 예외)", () => {
    const r = calculateStockTransferTax(r4HaltTransfer());
    expect(r.acquisitionPrice).toBe(23_205_259);
    expect(r.estimatedBase).toBe(5_600_000);
    expect(r.expenses).toBe(56_000);
    expect(r.calculatedTax).toBe(3_798_340);
    expect(r.valuationDetail?.method).toBe("weighted_avg");
    expect(r.valuationDetail?.finalPerShareValue).toBe(5_600);
  });

  /**
   * R1·R2가 같은 세액을 내는 것은 **분자를 같게 맞췄기 때문**이다.
   * 이 대조군이 없으면 「네 행이 원래 다 같은 값 아닌가」로 오독된다.
   */
  it("MTX-R0 (대조군): 분자가 다르면 세액이 갈린다", () => {
    const taxes = [r1General(), r3PostListing(), r4HaltTransfer()].map(
      (i) => calculateStockTransferTax(i).calculatedTax,
    );
    expect(new Set(taxes).size).toBe(3);
  });
});

// ============================================================
// 불가 조합 — 값이 아니라 «차단»을 고정한다
// ============================================================

/**
 * ⑧ validate용 폼 — 상장 + 환산 + 취득 후 상장 ON.
 *
 * ⚠️ `createInitialStockFormData()`의 `unlistedDetailMode` 기본값은 **"full"**(재무제표로 계산)이라
 *    그대로 두면 결산서 9필드를 요구해 «다른 사유»로 9건이 뜬다. 이 표가 보려는 것은 조합 차단이므로
 *    간이 모드로 고정한다 — 대조군 `MTX-X0`이 그 전제를 지킨다.
 */
function haltComboForm(over: Record<string, unknown> = {}) {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi" as const,
    acquisitionMode: "estimated" as const,
    shareCount: "1000",
    totalIssuedShares: "10000000",
    transferActualInputMode: "total" as const,
    transferTotalPrice: String(TRANSFER_TOTAL),
    transferDatePriceAvg1Month: String(TRANSFER_STD),
    transferStdInputMode: "direct" as const,
    acquisitionDate: "2018-01-01",
    transferDate: "2024-06-01",
    acquiredBeforeListing: true,
    listingDate: "2019-08-21",
    listingDatePriceAvg1Month: "8001",
    unlistedDetailMode: "simple" as const,
    listingStdInputMode: "direct" as const,
    simpleValueInputMode: "direct" as const,
    listingYearNetIncomePerShare: "61570",
    listingYearNetAssetPerShare: "5352",
    acquisitionYearNetIncomePerShare: "44520",
    acquisitionYearNetAssetPerShare: "4348",
    ...over,
  };
}

function zodBody(over: Record<string, unknown> = {}) {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: false,
    priorYearEndDate: "2023-12-31",
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: "2018-01-01",
    transferDate: "2024-06-01",
    shareCount: SHARE_COUNT,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: TRANSFER_TOTAL,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: TRANSFER_STD,
    // 🔑 명시한다 — 빠뜨리면 스키마가 «필수 누락»으로 거부해 조합 차단과 구별이 안 된다
    tradingHaltAtTransfer: false,
    tradingHaltAtAcquisition: false,
    acquiredBeforeListing: true,
    listingDate: "2019-08-21",
    listingDatePriceAvg1Month: 8_001,
    listingYearNetIncomePerShare: 61_570,
    listingYearNetAssetPerShare: 5_352,
    acquisitionYearNetIncomePerShare: 44_520,
    acquisitionYearNetAssetPerShare: 4_348,
    bookLost: false,
    expenseMode: "estimated",
    filingType: "preliminary",
    filingDate: "2024-08-31",
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...over,
  };
}

describe("MTX-X — 불가 조합은 ⑧·⑫가 «둘 다» 막는다", () => {
  it("MTX-X0 (대조군): 조합 없이는 ⑧·⑫를 통과한다", () => {
    const errors = validateStep2Domestic(haltComboForm() as never).filter(
      (e) => e.severity === "error",
    );
    expect(errors).toHaveLength(0);
    expect(addStockRefines(stockTransferInputSchema).safeParse(zodBody()).success).toBe(true);
  });

  it("MTX-XA: 취득 후 상장 × **양도일** 거래정지 — ⑧이 막는다", () => {
    const errors = validateStep2Domestic(
      haltComboForm({ tradingHaltAtTransfer: true }) as never,
    );
    expect(errors.some((e) => e.field === "tradingHaltAtTransfer" && e.severity === "error")).toBe(
      true,
    );
  });

  it("MTX-XA': 취득 후 상장 × **양도일** 거래정지 — ⑫도 막는다", () => {
    const parsed = addStockRefines(stockTransferInputSchema).safeParse(
      zodBody({ tradingHaltAtTransfer: true }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((i) => i.path.join("."))).toContain("tradingHaltAtTransfer");
    }
  });

  it("MTX-XB: 취득 후 상장 × **취득일** 거래정지 — ⑧이 막는다", () => {
    const errors = validateStep2Domestic(
      haltComboForm({ tradingHaltAtAcquisition: true }) as never,
    );
    expect(
      errors.some((e) => e.field === "tradingHaltAtAcquisition" && e.severity === "error"),
    ).toBe(true);
  });

  it("MTX-XB': 취득 후 상장 × **취득일** 거래정지 — ⑫도 막는다", () => {
    const parsed = addStockRefines(stockTransferInputSchema).safeParse(
      zodBody({ tradingHaltAtAcquisition: true }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((i) => i.path.join("."))).toContain(
        "tradingHaltAtAcquisition",
      );
    }
  });
});
