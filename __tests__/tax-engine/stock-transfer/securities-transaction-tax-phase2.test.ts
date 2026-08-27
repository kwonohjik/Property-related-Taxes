/**
 * 증권거래세 Phase 2 — 연도별 탄력세율 매트릭스 anchor (A-01 ~ A-33, B-01 ~ B-02)
 *
 * Pre-Do anchor 정책 (memory feedback_pre_anchor_verification):
 *   A-28(2025-12-31 코스피 = 영세율+농특세, 무경고)·A-29(2026-01-01 코스피 = 신세율, 무경고)를
 *   Phase 1 코드(현행 단일 세율 + 2026-01-02 경고 경계) 기준으로 먼저 실패 확보 후 구현.
 *
 * 법령 근거 (전부 KoreanLaw applicable_law 행위시법 축자 검증, 2026-06-11):
 *   2021~2022 — 영 31290호(2021.1.1 시행) §5 단서: 코스피 8 / 3호 23. 법 §8① 단서: 비상장 43
 *   2023      — 영 33209호 §5 단서: 코스피 5 / 3호 20
 *   2024      — 〃 단서: 코스피 3 / 3호 18
 *   2025      — §5 본문(단서 만료): 코스피 영(0) / 3호 15
 *   2026.1.1~ — 영 36001호(2025.12.31 공포, 2026.1.1 시행): 코스피 5 / 3호 20
 *   코넥스 10 · 비상장(2023~) 35 · 농특세 §5①5호 15 — 전 구간 불변
 */

import { describe, it, expect } from "vitest";
import { calcSecuritiesTransactionTax } from "../../../lib/tax-engine/stock-transfer/securities-transaction-tax";
import { calculateStockTransferTaxAggregate } from "../../../lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "../../../lib/tax-engine/stock-transfer/types/stock-transfer.types";

const P = 100_000_000; // 공통 양도가액 1억

type Market = { marketType: "kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset"; isKOTCTrading: boolean };
const KOSPI: Market = { marketType: "kospi", isKOTCTrading: false };
const KOSDAQ: Market = { marketType: "kosdaq", isKOTCTrading: false };
const KONEX: Market = { marketType: "konex", isKOTCTrading: false };
const KOTC: Market = { marketType: "unlisted", isKOTCTrading: true };
const UNLISTED: Market = { marketType: "unlisted", isKOTCTrading: false };

function calc(m: Market, dateStr: string | undefined, price = P) {
  return calcSecuritiesTransactionTax(
    { ...m, transferDate: dateStr ? new Date(dateStr) : undefined },
    price,
  );
}

// ============================================================
// A-01 ~ A-05: 2021 구간 (영 31290호 단서 — 8 / 23 / 10 / 23 / 43)
// ============================================================
describe("A-01~05: 2021 구간 5시장 (2021-06-15)", () => {
  it("A-01 코스피: 80,000 + 농특 150,000 = 230,000", () => {
    const r = calc(KOSPI, "2021-06-15");
    expect(r.securitiesTransactionTax).toBe(80_000);
    expect(r.agriculturalTax).toBe(150_000);
    expect(r.totalTax).toBe(230_000);
    expect(r.appliedRateNum).toBe(8);
    expect(r.warning).toBeUndefined();
  });
  it("A-02 코스닥: 230,000 (23/10000)", () => {
    const r = calc(KOSDAQ, "2021-06-15");
    expect(r.securitiesTransactionTax).toBe(230_000);
    expect(r.agriculturalTax).toBe(0);
    expect(r.totalTax).toBe(230_000);
  });
  it("A-03 코넥스: 100,000 (10/10000 불변)", () => {
    const r = calc(KONEX, "2021-06-15");
    expect(r.totalTax).toBe(100_000);
  });
  it("A-04 K-OTC: 230,000 (3호 나목 동률 — V-2 time_travel 구조 동일 확인)", () => {
    const r = calc(KOTC, "2021-06-15");
    expect(r.securitiesTransactionTax).toBe(230_000);
    expect(r.totalTax).toBe(230_000);
  });
  it("A-05 비상장: 430,000 (법 §8① 단서 43/10000)", () => {
    const r = calc(UNLISTED, "2021-06-15");
    expect(r.securitiesTransactionTax).toBe(430_000);
    expect(r.totalTax).toBe(430_000);
    expect(r.appliedRateNum).toBe(43);
  });
});

// ============================================================
// A-06 ~ A-10: 2023 구간 (5 / 20 / 10 / 20 / 35)
// ============================================================
describe("A-06~10: 2023 구간 5시장 (2023-06-15)", () => {
  it("A-06 코스피: 50,000 + 150,000 = 200,000", () => {
    const r = calc(KOSPI, "2023-06-15");
    expect(r.securitiesTransactionTax).toBe(50_000);
    expect(r.agriculturalTax).toBe(150_000);
    expect(r.totalTax).toBe(200_000);
  });
  it("A-07 코스닥: 200,000", () => {
    expect(calc(KOSDAQ, "2023-06-15").totalTax).toBe(200_000);
  });
  it("A-08 코넥스: 100,000", () => {
    expect(calc(KONEX, "2023-06-15").totalTax).toBe(100_000);
  });
  it("A-09 K-OTC: 200,000", () => {
    expect(calc(KOTC, "2023-06-15").totalTax).toBe(200_000);
  });
  it("A-10 비상장: 350,000 (한시 종료 — 본칙 35)", () => {
    expect(calc(UNLISTED, "2023-06-15").totalTax).toBe(350_000);
  });
});

// ============================================================
// A-11 ~ A-15: 2024 구간 (3 / 18 / 10 / 18 / 35)
// ============================================================
describe("A-11~15: 2024 구간 5시장 (2024-06-15)", () => {
  it("A-11 코스피: 30,000 + 150,000 = 180,000", () => {
    const r = calc(KOSPI, "2024-06-15");
    expect(r.securitiesTransactionTax).toBe(30_000);
    expect(r.agriculturalTax).toBe(150_000);
    expect(r.totalTax).toBe(180_000);
    expect(r.appliedRateNum).toBe(3);
  });
  it("A-12 코스닥: 180,000 (18/10000)", () => {
    expect(calc(KOSDAQ, "2024-06-15").totalTax).toBe(180_000);
  });
  it("A-13 코넥스: 100,000", () => {
    expect(calc(KONEX, "2024-06-15").totalTax).toBe(100_000);
  });
  it("A-14 K-OTC: 180,000", () => {
    expect(calc(KOTC, "2024-06-15").totalTax).toBe(180_000);
  });
  it("A-15 비상장: 350,000", () => {
    expect(calc(UNLISTED, "2024-06-15").totalTax).toBe(350_000);
  });
});

// ============================================================
// A-16 ~ A-20: 2025 구간 (0(영) / 15 / 10 / 15 / 35)
// 코스피 영세율 — 농특세법 §4 7호 단서(영세율 유가증권시장 = 농특세 과세)
// ============================================================
describe("A-16~20: 2025 구간 5시장 (2025-06-15)", () => {
  it("A-16 코스피: 영세율 0 + 농특세 150,000 = 150,000 (농특세만)", () => {
    const r = calc(KOSPI, "2025-06-15");
    expect(r.securitiesTransactionTax).toBe(0);
    expect(r.agriculturalTax).toBe(150_000);
    expect(r.totalTax).toBe(150_000);
    expect(r.appliedRateNum).toBe(0);
    expect(r.appliedAgriRateNum).toBe(15);
    expect(r.warning).toBeUndefined();
  });
  it("A-17 코스닥: 150,000 (15/10000)", () => {
    expect(calc(KOSDAQ, "2025-06-15").totalTax).toBe(150_000);
  });
  it("A-18 코넥스: 100,000", () => {
    expect(calc(KONEX, "2025-06-15").totalTax).toBe(100_000);
  });
  it("A-19 K-OTC: 150,000", () => {
    expect(calc(KOTC, "2025-06-15").totalTax).toBe(150_000);
  });
  it("A-20 비상장: 350,000", () => {
    expect(calc(UNLISTED, "2025-06-15").totalTax).toBe(350_000);
  });
});

// ============================================================
// A-21 ~ A-25: 현행 구간 (영 36001호, 2026.1.1 시행 — 5 / 20 / 10 / 20 / 35)
// Phase 1 STX-01~05와 동치
// ============================================================
describe("A-21~25: 현행 구간 5시장 (2026-06-15)", () => {
  it("A-21 코스피: 50,000 + 150,000 = 200,000", () => {
    const r = calc(KOSPI, "2026-06-15");
    expect(r.securitiesTransactionTax).toBe(50_000);
    expect(r.agriculturalTax).toBe(150_000);
    expect(r.totalTax).toBe(200_000);
  });
  it("A-22 코스닥: 200,000", () => {
    expect(calc(KOSDAQ, "2026-06-15").totalTax).toBe(200_000);
  });
  it("A-23 코넥스: 100,000", () => {
    expect(calc(KONEX, "2026-06-15").totalTax).toBe(100_000);
  });
  it("A-24 K-OTC: 200,000", () => {
    expect(calc(KOTC, "2026-06-15").totalTax).toBe(200_000);
  });
  it("A-25 비상장: 350,000", () => {
    expect(calc(UNLISTED, "2026-06-15").totalTax).toBe(350_000);
  });
});

// ============================================================
// A-26 ~ A-29: 구간 경계
// ============================================================
describe("A-26~29: 구간 경계", () => {
  it("A-26 2022-12-31 코스닥: 230,000 (2021 구간 말일)", () => {
    expect(calc(KOSDAQ, "2022-12-31").totalTax).toBe(230_000);
  });
  it("A-27 2023-01-01 코스닥: 200,000 (2023 구간 첫날)", () => {
    expect(calc(KOSDAQ, "2023-01-01").totalTax).toBe(200_000);
  });
  // ── Pre-Do 실패 확보 대상 (Phase 1: 현행 세율 50,000 + 경고) ──
  it("A-28 2025-12-31 코스피: 영세율 0 + 농특 150,000, 경고 없음 (Phase 1 STX-09 대체)", () => {
    const r = calc(KOSPI, "2025-12-31");
    expect(r.securitiesTransactionTax).toBe(0);
    expect(r.agriculturalTax).toBe(150_000);
    expect(r.totalTax).toBe(150_000);
    expect(r.warning).toBeUndefined();
  });
  // ── Pre-Do 실패 확보 대상 (Phase 1: 2026-01-02 경계라 경고 발생) ──
  it("A-29 2026-01-01 코스피: 신세율 50,000 + 150,000, 경고 없음 (영 36001호 시행 첫날)", () => {
    const r = calc(KOSPI, "2026-01-01");
    expect(r.securitiesTransactionTax).toBe(50_000);
    expect(r.agriculturalTax).toBe(150_000);
    expect(r.totalTax).toBe(200_000);
    expect(r.warning).toBeUndefined();
  });
});

// ============================================================
// A-30 ~ A-33: cutoff·미제공·기타자산
// ============================================================
describe("A-30~33: cutoff·미제공·기타자산", () => {
  /**
   * 2026-08-27 재산정 — 매트릭스 커버가 **2020-04-01 까지 확대**됐다.
   * 2020-12-31 은 이제 fallback 이 아니라 **당시 세율**(영 §5 1호 가목 1천분의 1)이 적용된다.
   * 사용자 제공 국세법령정보시스템 화면 2건(법 §8① 2020.4.1 시행본 · 시행령 §5)으로 확정.
   */
  it("A-30 2020-12-31 코스피: 당시 세율 10/10000 적용 + 경고 없음", () => {
    const r = calc(KOSPI, "2020-12-31");
    expect(r.securitiesTransactionTax).toBe(100_000);   // 1억 × 1천분의 1
    expect(r.agriculturalTax).toBe(150_000);            // 농특세 15/10000 — 전 구간 불변
    expect(r.warning).toBeUndefined();
  });
  it("A-30b 2020-04-01 경계(포함): 당시 세율 적용", () => {
    expect(calc(KOSPI, "2020-04-01").securitiesTransactionTax).toBe(100_000);
  });
  it("A-30c 2020-03-31: **커버 밖** — 현행 세율 fallback + 미지원 경고", () => {
    const r = calc(KOSPI, "2020-03-31");
    expect(r.securitiesTransactionTax).toBe(50_000);
    expect(r.warning).toBeDefined();
    expect(r.warning).toContain("미지원");
  });
  it("A-30d 2020년 비상장: 법 §8① 1만분의 45", () => {
    // 1억 × 45/10000 = 450,000 (코스피 외 시장은 농특세 없음)
    const r = calc(UNLISTED, "2020-07-01");
    expect(r.securitiesTransactionTax).toBe(450_000);
    expect(r.agriculturalTax).toBe(0);
  });
  it("A-30e 2020년 코스닥·K-OTC: 영 §5 2호 1천분의 2.5", () => {
    expect(calc(KOSDAQ, "2020-07-01").securitiesTransactionTax).toBe(250_000);
    expect(calc(KOTC, "2020-07-01").securitiesTransactionTax).toBe(250_000);
  });
  it("A-30f 2020년 코넥스: 영 §5 1호 나목 1천분의 1", () => {
    expect(calc(KONEX, "2020-07-01").securitiesTransactionTax).toBe(100_000);
  });
  it("A-31 양도일 미제공: 현행 세율 + 경고 없음 (inline 미리보기 호환)", () => {
    const r = calc(KOSPI, undefined);
    expect(r.securitiesTransactionTax).toBe(50_000);
    expect(r.warning).toBeUndefined();
  });
  it("A-32 2021-01-15 코스닥: 230,000 (영 31290호 부칙 적용례 — 2021.1.1 양도분부터)", () => {
    expect(calc(KOSDAQ, "2021-01-15").totalTax).toBe(230_000);
  });
  it("A-33 기타자산 (2023-06-15): 0 + 시장 구분 경고 (구간 무관 — Phase 1 STX-06 유지)", () => {
    const r = calc({ marketType: "other_asset", isKOTCTrading: false }, "2023-06-15");
    expect(r.totalTax).toBe(0);
    expect(r.warning).toBeDefined();
    expect(r.warning).toContain("시장 구분 확인 필요");
  });
});

// ============================================================
// B-01 ~ B-02: 다자산 합산 echo (totalSecuritiesTransactionTax)
// ============================================================

function fullInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2025-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2024-01-01"),
    transferDate: new Date("2026-06-15"),
    shareCount: 1_000,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 100_000, // 양도가 100,000,000
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 80_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2026-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  };
}

describe("B-01: 다자산 합산 echo — 코스피 1억 + 코스닥 1억 (aggregate, 2026-06-15)", () => {
  it("증권거래세분 250,000 / 농특세 150,000 / 합계 400,000", () => {
    const result = calculateStockTransferTaxAggregate(
      [fullInput(), fullInput({ marketType: "kosdaq" })],
      "aggregate",
    );
    // 코스피 50,000 + 코스닥 200,000 = 250,000 (이미 floor된 값의 단순합)
    expect(result.totalSecuritiesTransactionTax.securitiesTransactionTax).toBe(250_000);
    expect(result.totalSecuritiesTransactionTax.agriculturalTax).toBe(150_000);
    expect(result.totalSecuritiesTransactionTax.totalTax).toBe(400_000);
    // 종목별 echo도 보존
    expect(result.items[0].securitiesTransactionTax?.totalTax).toBe(200_000);
    expect(result.items[1].securitiesTransactionTax?.totalTax).toBe(200_000);
  });
});

describe("B-02: 다자산 합산 echo — K-OTC 중소 비과세 1천만 + 코스피 1억 (each_item)", () => {
  it("비과세 종목 echo 포함: 70,000 / 150,000 / 220,000", () => {
    const kotcExempt = fullInput({
      marketType: "unlisted",
      isKOTCTrading: true,
      isSmallMediumEnterprise: true,
      isListedSmallShareholder: true, // §94①3 나목 단서 — 소액주주 요건 (분류 조건 실측)
      isMajorShareholder: false,
      selfShareRatio: 0.001,
      perShareTransferPrice: 10_000, // 양도가 10,000,000
      perShareAcquisitionPrice: 8_000,
    });
    const result = calculateStockTransferTaxAggregate(
      [kotcExempt, fullInput()],
      "each_item",
    );
    // K-OTC 비과세(양도세 0)여도 증권거래세 echo는 발생: 10,000,000 × 20/10000 = 20,000
    expect(result.items[0].isExempt).toBe(true);
    expect(result.items[0].securitiesTransactionTax?.totalTax).toBe(20_000);
    // 합산: 20,000 + (50,000 + 150,000)
    expect(result.totalSecuritiesTransactionTax.securitiesTransactionTax).toBe(70_000);
    expect(result.totalSecuritiesTransactionTax.agriculturalTax).toBe(150_000);
    expect(result.totalSecuritiesTransactionTax.totalTax).toBe(220_000);
  });
});
