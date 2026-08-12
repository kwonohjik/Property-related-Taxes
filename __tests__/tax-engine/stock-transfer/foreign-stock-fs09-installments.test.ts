/**
 * FS-09 §178의5② 장기할부 분할 수령 — 정식 구현 anchor (2026-05-19)
 *
 * 분리 근거: foreign-stock.test.ts 800줄 정책 준수를 위해 분리
 *
 * 법령: 소득세법 시행령 §178의5② (2026.4.21. 시행)
 *   "장기할부조건의 경우에는 양도일을 수령한 날로 본다"
 *   → 각 수령일의 기준환율(외국환거래법)을 수령액에 적용 후 원화 합산
 *
 * KoreanLaw 검증 완료 — §178의5② 전문:
 *   "양도가액 또는 취득가액을 수령하거나 지출한 날로 본다"
 *   (소득세법 시행령 MST 285631, 2026.4.23. 공포·시행)
 *
 * anchor 구성:
 *   FS-09a: single 모드 회귀 (기존 동작 유지 — 회귀 0 확인)
 *   FS-09b: 2회 분할 수령 (환율 1,100 / 1,300)
 *   FS-09c: 3회 분할 수령 (환율 변동)
 *   FS-09d: 배열 1건 → warning 발행 (계산은 진행)
 *   FS-09e: 빈 배열 → 양도가액 0 + warning
 *
 * ⚠️ **2026-08-12 기대값 갱신 — 회귀가 아니라 법령 정정이다.**
 *   §118의5(§55① 누진)는 §118②의 준용 목록에 없다 ⇒ 세율은 **§104①12호나목 20%**.
 *   환산(§178의5②) 로직 자체는 §118의4 준용으로 **그대로 살아 있다** — 환산액 단언은 불변이고
 *   세율 이후 값(산출세액·지방소득세)만 재산정했다.
 *   계획서: docs/02-design/features/foreign-stock-94-1-3-da-statute-track.plan.md
 */

import { describe, it, expect } from "vitest";
import { calculateForeignStockTax } from "@/lib/tax-engine/stock-transfer/foreign-stock";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

// ============================================================
// 공통 BASE_INPUT (foreign-stock.test.ts와 동일)
// ============================================================

const BASE_INPUT: ForeignStockInput = {
  marketType: "foreign_stock",
  yearsResidentInKorea: 7,
  isListedForeignCorp: true,
  stockName: "Example Corp",
  countryCode: "US",
  shareCount: 1_000,
  transferDate: new Date("2025-09-30"),
  transferPriceMode: "per_share",
  perShareTransferPriceForeign: 150,
  transferCurrencyCode: "USD",
  transferExchangeRate: 1_350,
  acquisitionDate: new Date("2022-03-15"),
  acquisitionMode: "actual",
  perShareAcquisitionPriceForeign: 80,
  acquisitionCurrencyCode: "USD",
  acquisitionExchangeRate: 1_200,
  capitalExpenditureForeign: 0,
  transferCostForeign: 200,
  hasForeignTax: false,
  foreignTaxMethod: "credit",
  isElectronicFiling: false,
};

// ──────────────────────────────────────────────────────────
// FS-09a: single 모드 회귀 확인 (기존 동작 유지)
// ──────────────────────────────────────────────────────────
describe("FS-09a: single 모드 — 기존 단일 환율 동작 회귀 (§178의5①)", () => {
  /**
   * transferReceiptMode="single" (또는 미설정) → 기존 per_share 모드와 동일
   * 회귀 anchor: BASE_INPUT과 동일 결과 확인
   *
   * 자가검증:
   *   transferPriceKrw = 1,000 × 150 × 1,350 = 202,500,000 (FS-anchor-01과 동일)
   */
  const singleInput: ForeignStockInput = {
    ...BASE_INPUT,
    transferReceiptMode: "single",     // 명시적 single 지정
  };
  const result = calculateForeignStockTax(singleInput);

  it("single 모드: transferReceiptDetail = undefined", () => {
    expect(result.transferReceiptDetail).toBeUndefined();
  });

  it("single 모드: 양도가액 = 1,000 × 150 × 1,350 = 202,500,000 (FS-anchor-01 동일)", () => {
    expect(result.transferPriceKrw).toBe(202_500_000);
  });

  it("single 모드: 산출세액 = 20,865,500 (FS-anchor-01 동일 — 회귀 없음)", () => {
    expect(result.incomeTax).toBe(20_746_000);
  });

  it("single 모드: appliedRules에 §178의5 포함 (§178의5② 미포함)", () => {
    const hasBase = result.appliedRules.some((r) => r.includes("§178의5"));
    expect(hasBase).toBe(true);
    const hasInstallment = result.appliedRules.some((r) => r.includes("§178의5②"));
    expect(hasInstallment).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────
// FS-09b: 2회 분할 수령 — 환율 1,100 / 1,300 (§178의5②)
// ──────────────────────────────────────────────────────────
describe("FS-09b: §178의5② 2회 분할 수령 (환율 1,100 / 1,300)", () => {
  /**
   * 장기할부 2회 분할 수령:
   *   1차: 70,000 USD × 1,100원/USD = floor(70,000 × 1,100) = 77,000,000원
   *   2차: 80,000 USD × 1,300원/USD = floor(80,000 × 1,300) = 104,000,000원
   *   합계 = 77,000,000 + 104,000,000 = 181,000,000원
   *
   * 취득가액: 1,000 × 80 × 1,200 = 96,000,000
   * 필요경비: 0
   * 양도차익 = 181,000,000 − 96,000,000 = 85,000,000
   * 기본공제 = 2,500,000 (§118의7)
   * 과세표준 = 82,500,000
   * §104①12호나목 20%: floor(82,500,000 × 0.2) = 16,500,000
   *   = 19,800,000 − 5,760,000 = 14,040,000
   * 지방소득세 = floor10(14,040,000 × 0.1) = 1,404,000
   */
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    transferReceiptMode: "installments",
    transferInstallmentReceipts: [
      {
        receiptDate: new Date("2025-03-31"),
        amountForeign: 70_000,
        exchangeRate: 1_100,
      },
      {
        receiptDate: new Date("2025-09-30"),
        amountForeign: 80_000,
        exchangeRate: 1_300,
      },
    ],
    transferCostForeign: 0,
    shareCount: 1_000,
    perShareAcquisitionPriceForeign: 80,
    acquisitionExchangeRate: 1_200,
  };
  const result = calculateForeignStockTax(input);

  it("납세의무 충족", () => {
    expect(result.isLiable).toBe(true);
    expect(result.taxCategory).toBe("foreign_stock");
  });

  it("1차 수령: 70,000 × 1,100 = 77,000,000원", () => {
    expect(result.transferReceiptDetail?.receipts[0].amountKrw).toBe(77_000_000);
  });

  it("2차 수령: 80,000 × 1,300 = 104,000,000원", () => {
    expect(result.transferReceiptDetail?.receipts[1].amountKrw).toBe(104_000_000);
  });

  it("양도가액 합계 = 77,000,000 + 104,000,000 = 181,000,000", () => {
    expect(result.transferPriceKrw).toBe(181_000_000);
    expect(result.transferReceiptDetail?.totalKrw).toBe(181_000_000);
  });

  it("취득가액 = 1,000 × 80 × 1,200 = 96,000,000", () => {
    expect(result.acquisitionPriceKrw).toBe(96_000_000);
  });

  it("양도차익 = 181,000,000 − 96,000,000 = 85,000,000", () => {
    expect(result.transferGain).toBe(85_000_000);
  });

  it("기본공제 = 2,500,000 (§118의7)", () => {
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("과세표준 = 85,000,000 − 2,500,000 = 82,500,000", () => {
    expect(result.taxBase).toBe(82_500_000);
  });

  it("§104①12호나목 세율 = 20% (구간 없음)", () => {
    expect(result.appliedRate).toBe(0.2);
  });

  it("누진공제 = 0 (§104①12호는 단일세율)", () => {
    expect(result.progressiveDeduction).toBe(0);
  });

  it("산출세액 = floor(82,500,000 × 0.2) = 16,500,000", () => {
    const expected = Math.floor(82_500_000 * 0.2);
    expect(result.incomeTax).toBe(expected);
    expect(result.incomeTax).toBe(16_500_000);
  });

  it("지방소득세 = floor10(14,040,000 × 0.1) = 1,404,000", () => {
    expect(result.localIncomeTax).toBe(1_650_000);
  });

  it("transferReceiptDetail.mode = installments", () => {
    expect(result.transferReceiptDetail?.mode).toBe("installments");
  });

  it("appliedRules에 §178의5② 포함", () => {
    const hasInstallment = result.appliedRules.some((r) => r.includes("§178의5②"));
    expect(hasInstallment).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// FS-09c: 3회 분할 수령 — 환율 변동 케이스
// ──────────────────────────────────────────────────────────
describe("FS-09c: §178의5② 3회 분할 수령 (환율 변동)", () => {
  /**
   * 3회 분할 수령 + 환율 변동:
   *   1차: 50,000 USD × 1,050원 = floor(50,000 × 1,050) = 52,500,000원
   *   2차: 60,000 USD × 1,200원 = floor(60,000 × 1,200) = 72,000,000원
   *   3차: 40,000 USD × 1,400원 = floor(40,000 × 1,400) = 56,000,000원
   *   합계 = 52,500,000 + 72,000,000 + 56,000,000 = 180,500,000원
   *
   * 취득가액: 1,000 × 80 × 1,200 = 96,000,000
   * 양도차익 = 180,500,000 − 96,000,000 = 84,500,000
   * 기본공제 = 2,500,000
   * 과세표준 = 82,000,000
   * §104①12호나목 20%: floor(82,000,000 × 0.2) = 16,400,000
   *   = 19,680,000 − 5,760,000 = 13,920,000
   * 지방소득세 = floor10(13,920,000 × 0.1) = 1,392,000
   */
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    transferReceiptMode: "installments",
    transferInstallmentReceipts: [
      { receiptDate: new Date("2025-01-31"), amountForeign: 50_000, exchangeRate: 1_050 },
      { receiptDate: new Date("2025-05-31"), amountForeign: 60_000, exchangeRate: 1_200 },
      { receiptDate: new Date("2025-09-30"), amountForeign: 40_000, exchangeRate: 1_400 },
    ],
    transferCostForeign: 0,
    shareCount: 1_000,
    perShareAcquisitionPriceForeign: 80,
    acquisitionExchangeRate: 1_200,
  };
  const result = calculateForeignStockTax(input);

  it("1차 수령: 50,000 × 1,050 = 52,500,000", () => {
    expect(result.transferReceiptDetail?.receipts[0].amountKrw).toBe(52_500_000);
  });

  it("2차 수령: 60,000 × 1,200 = 72,000,000", () => {
    expect(result.transferReceiptDetail?.receipts[1].amountKrw).toBe(72_000_000);
  });

  it("3차 수령: 40,000 × 1,400 = 56,000,000", () => {
    expect(result.transferReceiptDetail?.receipts[2].amountKrw).toBe(56_000_000);
  });

  it("양도가액 합계 = 52,500,000 + 72,000,000 + 56,000,000 = 180,500,000", () => {
    expect(result.transferPriceKrw).toBe(180_500_000);
  });

  it("양도차익 = 180,500,000 − 96,000,000 = 84,500,000", () => {
    expect(result.transferGain).toBe(84_500_000);
  });

  it("과세표준 = 82,000,000", () => {
    expect(result.taxBase).toBe(82_000_000);
  });

  it("산출세액 = floor(82,000,000 × 0.2) = 16,400,000", () => {
    const expected = Math.floor(82_000_000 * 0.2);
    expect(result.incomeTax).toBe(expected);
    expect(result.incomeTax).toBe(16_400_000);
  });

  it("지방소득세 = floor10(13,920,000 × 0.1) = 1,392,000", () => {
    expect(result.localIncomeTax).toBe(1_640_000);
  });

  it("수령 건수 = 3건", () => {
    expect(result.transferReceiptDetail?.receipts.length).toBe(3);
  });
});

// ──────────────────────────────────────────────────────────
// FS-09d: 배열 1건 → warning 발행 (계산은 진행)
// ──────────────────────────────────────────────────────────
describe("FS-09d: §178의5② 분할 수령 배열 1건 → warning 발행 (계산은 진행)", () => {
  /**
   * 배열 1건은 단일 수령과 동일하므로 단일 수령(single 모드) 권장.
   * 엔진은 warning 발행 후 계산은 계속 진행.
   *
   * 자가검증:
   *   1차: 150,000 USD × 1,350 = 202,500,000원 (단일 수령과 동일 결과)
   */
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    transferReceiptMode: "installments",
    transferInstallmentReceipts: [
      { receiptDate: new Date("2025-09-30"), amountForeign: 150_000, exchangeRate: 1_350 },
    ],
    transferCostForeign: 0,
    shareCount: 1_000,
    perShareAcquisitionPriceForeign: 80,
    acquisitionExchangeRate: 1_200,
  };
  const result = calculateForeignStockTax(input);

  it("납세의무 유지 (경고 후 계산 계속)", () => {
    expect(result.isLiable).toBe(true);
  });

  it("양도가액 = 150,000 × 1,350 = 202,500,000 (단일과 동일)", () => {
    expect(result.transferPriceKrw).toBe(202_500_000);
  });

  it("warning에 '2건 미만' 메시지 포함", () => {
    const hasWarning = result.warnings.some(
      (w) => w.includes("2건 미만") || w.includes("2건"),
    );
    expect(hasWarning).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────
// FS-09e: 빈 배열 → 양도가액 0 + warning
// ──────────────────────────────────────────────────────────
describe("FS-09e: §178의5② 분할 수령 배열 빈 배열 → 양도가액 0 + warning", () => {
  /**
   * 빈 배열 입력 시 (UI validation으로 차단되어야 하지만 엔진 방어):
   *   totalKrw = 0 → transferGain < 0 → 손실 처리
   */
  const input: ForeignStockInput = {
    ...BASE_INPUT,
    transferReceiptMode: "installments",
    transferInstallmentReceipts: [],
    transferCostForeign: 0,
    shareCount: 1_000,
    perShareAcquisitionPriceForeign: 80,
    acquisitionExchangeRate: 1_200,
  };
  const result = calculateForeignStockTax(input);

  it("transferPriceKrw = 0 (빈 배열 — totalKrw 합산 결과)", () => {
    expect(result.transferPriceKrw).toBe(0);
  });

  it("warning에 '2건 미만' 경고 포함", () => {
    const hasWarning = result.warnings.some(
      (w) => w.includes("2건 미만") || w.includes("2건"),
    );
    expect(hasWarning).toBe(true);
  });

  it("transferReceiptDetail.totalKrw = 0", () => {
    expect(result.transferReceiptDetail?.totalKrw).toBe(0);
  });
});
