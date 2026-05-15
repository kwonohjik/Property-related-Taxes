/**
 * C38 anchor — 사례 38: 조합원입주권 right+receive + 단독주택 출자 (실가 모드)
 *
 * ★ §166①2호 법령 원문 정정 후 작성 (2026-05-15):
 *   가목: settlement.gain = 양도가액 − (평가액 − 지급받은 청산금) − 인가후 필요경비
 *   나목: preApprovalGainAdjusted = 인가전양도차익 × (평가액 − 청산금) / 평가액
 *
 * PDF 출처: 양도코리아 책 사례 38
 * 법령 근거: 소득세법 시행령 §166①2호 가목·나목, §166⑤1호, §95②
 *
 * 입력:
 *   - 양도가액: 320,000,000 (2023-03-02)
 *   - 권리가액(평가액): 300,000,000 (관리처분인가일: 2016-10-23)
 *   - 청산금 수령액: 50,000,000
 *   - 취득가액(실가): 180,000,000 (2009-04-09)
 *   - 인가전·인가후 필요경비: 0
 *   - 1세대1주택 미충족 (다주택자)
 *   - originalAssetType: "housing" (단독주택 출자)
 *
 * 산식:
 *   salePriceTotal = 300M − 50M = 250,000,000
 *
 *   [§166①2호 나목: 인가전 분 — 취득~인가일]
 *   preApprovalGain_raw = 300M − 180M = 120,000,000
 *   preApprovalGainAdjusted = floor(120M × 250M / 300M) = 100,000,000
 *   LTHD 보유기간: 2009-04-09 ~ 2016-10-23 = 7년 6개월 → 만 7년 → 표1 14%
 *   preApproval.lthd = floor(100M × 0.14) = 14,000,000
 *
 *   [§166①2호 가목: 인가후 분 (settlement 노드)]
 *   settlement.gain = 320M − (300M − 50M) − 0 = 320M − 250M = 70,000,000  ← PDF 일치
 *   settlement.lthd = 0 (§95② 단서 — 입주권 §94①2호 자산, LTHD 미적용)
 *
 *   [합계]
 *   total.gain = 100M + 70M = 170,000,000
 *   total.lthd = 14M + 0 = 14,000,000
 *   taxableIncome = 170M − 14M = 156,000,000
 *   과세표준 = 156M − 2.5M = 153,500,000
 *   2023년 §55: 1.5억~3억 → 38% − 누진공제 19,940,000
 *   산출세액 = floor(153.5M × 0.38) − 19,940,000 = 58,330,000 − 19,940,000 = 38,390,000
 *   지방소득세 = floor(38,390,000 × 0.1) = 3,839,000
 *   합계 납부세액 = 42,229,000
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

function case38RedevInfo(): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2016-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "receive",
    settlementAmount: 50_000_000,
    settlementSaleDate: new Date("2023-03-02"),
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
  };
}

function case38Input(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 320_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2009-04-09"),
    acquisitionPrice: 180_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: case38RedevInfo(),
  });
}

describe("C38 — 조합원입주권 right+receive 단독주택 실가 출자 (§166①2호 가목·나목)", () => {
  const result = case38Input();
  const calcResult = calculateTransferTax(result, mockRates);
  const detail = calcResult.redevelopmentDetail!;

  // ── 인가전 분 (나목) ────────────────────────────────────────────────────

  it("[C38-1] preApproval.gain = 100,000,000 (나목: 120M × 250/300)", () => {
    // preApprovalGain_raw = 300M − 180M = 120M
    // 나목 축소: floor(120M × 250M / 300M) = 100,000,000
    expect(detail.preApproval.gain).toBe(100_000_000);
  });

  it("[C38-2] postApprovalExistingHouse.gain = 0 (§95② 입주권 right 분기 — LTHD 미적용 노드)", () => {
    expect(detail.postApprovalExistingHouse.gain).toBe(0);
  });

  // ── 인가후 분 (가목) ────────────────────────────────────────────────────

  it("[C38-3] settlement.gain = 70,000,000 (가목: 320M − 250M — PDF 일치)", () => {
    // §166①2호 가목: 양도가액 − (평가액 − 지급받은 청산금) − 인가후 필요경비
    // = 320M − (300M − 50M) − 0 = 320M − 250M = 70,000,000
    expect(detail.settlement.gain).toBe(70_000_000);
  });

  it("[C38-4] total.gain = 170,000,000 (100M + 70M)", () => {
    expect(detail.total.gain).toBe(170_000_000);
  });

  // ── LTHD ───────────────────────────────────────────────────────────────

  it("[C38-5] preApproval.lthdRate = 0.14 (표1, 2009-04-09 ~ 2016-10-23 = 만 7년 × 2%)", () => {
    // 7년 6개월 → 만 7년 → 표1: 7 × 2% = 14%
    expect(detail.preApproval.lthdRate).toBe(0.14);
  });

  it("[C38-6] preApproval.lthd = 14,000,000 (100M × 14%)", () => {
    expect(detail.preApproval.lthd).toBe(14_000_000);
  });

  it("[C38-7] total.lthd = 14,000,000 (인가전 분만 — §95② 단서)", () => {
    expect(detail.total.lthd).toBe(14_000_000);
  });

  // ── 양도소득금액·세액 ─────────────────────────────────────────────────

  it("[C38-8] total.taxableIncome = 156,000,000 (86M + 70M — PDF anchor)", () => {
    // (100M − 14M) + (70M − 0) = 86M + 70M = 156,000,000
    expect(detail.total.taxableIncome).toBe(156_000_000);
  });

  it("[C38-9] calculatedTax = 38,390,000 (2023년 §55 누진세율 직접 계산)", () => {
    // 과세표준 = 156M − 2.5M = 153,500,000
    // 1.5억~3억 구간: 38% − 19,940,000
    // floor(153,500,000 × 0.38) − 19,940,000 = 58,330,000 − 19,940,000 = 38,390,000
    // (외부 PDF 산출값 추종 금지 — memory `transfer_year_tax_rate`, 직접 계산 일치)
    expect(calcResult.calculatedTax).toBe(38_390_000);
  });

  it("[C38-10] localIncomeTax = 3,839,000 (38,390,000 × 10%)", () => {
    expect(calcResult.localIncomeTax).toBe(3_839_000);
  });

  it("[C38-11] totalTax = 42,229,000", () => {
    expect(calcResult.totalTax).toBe(42_229_000);
  });

  // ── 안분 취득가액 (UI 표시용) ─────────────────────────────────────────

  it("[C38-21] preApproval.apportionedTransfer = 250,000,000 (평가액 − 청산금 = salePriceTotal)", () => {
    // 인가전 의제양도가액 = 평가액 − 청산금 = 300M − 50M = 250M
    expect(detail.preApproval.apportionedTransfer).toBe(250_000_000);
  });

  it("[C38-22] preApproval.apportionedAcquisition = 150,000,000 (취득가 × 250/300)", () => {
    // 나목 안분 취득가액 = floor(180M × 250M / 300M) = floor(45,000M/300M) = 150,000,000
    expect(detail.preApproval.apportionedAcquisition).toBe(150_000_000);
  });

  it("[C38-acq] settlement.apportionedAcquisition = 250,000,000 (= salePriceTotal — 가목 취득가)", () => {
    // 가목 구조: settlement.apportionedAcquisition = 평가액 − 청산금 (신고서 양식 취득가)
    expect(detail.settlement.apportionedAcquisition).toBe(250_000_000);
  });

  it("[C38-transfer] settlement.apportionedTransfer = 320,000,000 (= 실제 양도가액)", () => {
    // 가목: 양도가액 전체가 인가후 분 양도가액
    expect(detail.settlement.apportionedTransfer).toBe(320_000_000);
  });
});
