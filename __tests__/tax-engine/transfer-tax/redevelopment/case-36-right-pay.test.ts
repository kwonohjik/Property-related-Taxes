/**
 * 사례 36 — 조합원입주권 양도 (subject="right") — CORE-36 + 36-A1 (환산) anchor
 *
 * PDF 출처: 양도코리아 책 사례 36 (조합원입주권_청산금불입_취득실가확인.jpeg)
 *
 * CORE-36 입력:
 *   - 종전부동산 취득가 100,000,000 (2002-04-09)
 *   - 관리처분 인가 2018-10-23 / 권리가액 300,000,000 / 비례율 1.05
 *   - 청산금 불입액(pay) 90,000,000
 *   - 입주권 양도 520,000,000 (2023-03-02)
 *
 * 법령 근거:
 *   - 소득세법 §89①4호 가목 + 시행령 §166①1호 (입주권+pay 단순 합산)
 *   - 소득세법 §95② 단서 (권리 분 LTHD 부존재 → 인가전 분만)
 *   - 소득세법 시행령 §166⑤1호 (인가전 보유기간 = 취득일 ~ 관리처분 인가일)
 *   - 소득세법 §55 + §103조의3 (양도연도 2023 누진세율 + 지방세)
 *
 * 국세청 해석례 확인 (2026-05-14 KoreanLaw MCP 검색):
 *   - "고가주택에 해당하는 조합원입주권 양도차익 산정방법" (2010.11.01)
 *   - "1세대1주택인 고가주택의 입주권을 양도하는 경우 양도차익 산정방법" (2008.01.10)
 *   - 7건 해석례 — 분모 = 실지양도가액(transferPrice) 단일 기준 해석 A 지지
 *     (링크: https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000144597)
 *
 * 36-A1 입력 (환산 모드):
 *   - D = 400,000,000 (managementDisposalHousingPrice)
 *   - P_A = 120,000,000 (acquisitionHousingPrice, §164⑦ 미발동)
 *   - useEstimatedAcquisition = true
 *
 * Pre-Do 우선 실행 — 엔진 변경 없이 CORE-36 anchor 5건 통과 확인 후
 * 나머지 anchor 22건 추가.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

// ──────────────────────────────────────────────────────────────────────────────
// 공용 fixture — 사례 36 RedevelopmentInfo
// ──────────────────────────────────────────────────────────────────────────────

/** CORE-36 기본 RedevelopmentInfo (실가, pay) */
function case36RedevInfo(): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "pay",
    settlementAmount: 90_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
  };
}

/** CORE-36 통합 입력 (transfer-tax.ts 진입) */
function core36Input(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 520_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: case36RedevInfo(),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// CORE-36 — PDF 원본 anchor (7건) — Pre-Do 우선 실행
// ──────────────────────────────────────────────────────────────────────────────

describe("CORE-36 — 입주권 양도(pay) 실가 일반과세 (PDF 양도코리아 사례 36)", () => {
  const input = core36Input();
  const result = calculateTransferTax(input, mockRates);

  it("redevelopmentDetail 부착 (subject=right 분기 라우팅 활성)", () => {
    expect(result.redevelopmentDetail).toBeDefined();
  });

  it("[CORE-36-01] 인가전 분 양도차익 = 200,000,000 (권리가액 300M − 취득가 100M)", () => {
    // 근거: redevelopment-split.ts computeRightPay → preApprovalGain = rightsValue − oldAcq
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(200_000_000);
  });

  it("[CORE-36-02] 청산금납부분(인가후) 양도차익 = 130,000,000 (520M − (300M+90M) − 0)", () => {
    // 근거: §166①1호 — 양도가 − (권리가액+납부청산금) − 필요경비
    expect(result.redevelopmentDetail?.settlement.gain).toBe(130_000_000);
  });

  it("[CORE-36-03] 인가후 기존주택분 양도차익 = 0 (§166⑤1호 — 입주권 양도 시 부존재)", () => {
    expect(result.redevelopmentDetail?.postApprovalExistingHouse.gain).toBe(0);
  });

  it("[CORE-36-04] 인가전 분 LTHD = 60,000,000 (200M × 30% — 보유 16년+ 표1 30% 캡)", () => {
    // 보유기간: 2002-04-09 취득 ~ 2018-10-23 인가일 = 16년 6개월 → 표1 16년×2%=32% → 30% 캡
    // 근거: 시행령 §166⑤1호 보유기간 기산 + §95② 단서 표1 적용
    expect(result.redevelopmentDetail?.preApproval.lthd).toBe(60_000_000);
  });

  it("[CORE-36-05] 청산금분 LTHD = 0 (§94①2호 — 권리 분, §95② 대상자산 범위 외)", () => {
    // 근거: §94①2호 조합원입주권 = "부동산을 취득할 수 있는 권리" → §95② 표1·2 대상 외
    expect(result.redevelopmentDetail?.settlement.lthd).toBe(0);
  });

  it("[CORE-36-06] 양도소득금액 합계 = 270,000,000 ((200M−60M) + (130M−0))", () => {
    expect(result.redevelopmentDetail?.total.taxableIncome).toBe(270_000_000);
  });

  it("[CORE-36-07] 기본공제 = 2,500,000", () => {
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("[CORE-36-08] 과세표준 = 267,500,000 (270M − 2.5M)", () => {
    expect(result.taxBase).toBe(267_500_000);
  });

  it("[CORE-36-09] ★ 산출세액 = 81,710,000 (267.5M × 38% − 19,940,000 — 2023 §55)", () => {
    // 267,500,000 × 38% = 101,650,000 − 19,940,000 = 81,710,000
    // 근거: 소득세법 §55 2023년 기준 누진세율표 (외부 PDF 산출값 추종 금지)
    expect(result.calculatedTax).toBe(81_710_000);
  });

  it("[CORE-36-10] ★ 지방소득세 = 8,171,000 (81,710,000 × 10% — §103조의3)", () => {
    // 81,710,000 × 10% = 8,171,000 (원 미만 절사)
    expect(result.localIncomeTax).toBe(8_171_000);
  });

  it("[CORE-36-11] ★ 총납부세액 = 89,881,000", () => {
    expect(result.totalTax).toBe(89_881_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 36-A1 — 환산 모드 (subject="right" + useEstimatedAcquisition)
// ──────────────────────────────────────────────────────────────────────────────

describe("36-A1 — 입주권 양도(pay) 환산취득가 (§166③ + §163⑥ 개산공제)", () => {
  /**
   * 가정값:
   *   - D (managementDisposalHousingPrice) = 400,000,000
   *   - P_A (acquisitionHousingPrice) = 120,000,000 (§164⑦ 미발동 — 취득일 ≥ 최초공시일 가정)
   *   - preApprovalExpenses = 0
   *
   * 산식:
   *   환산취득가 = floor(300,000,000 × 120,000,000 / 400,000,000) = 90,000,000
   *   개산공제 = floor(120,000,000 × 0.03) = 3,600,000  (§163⑥)
   *   인가전 양도차익 = 300,000,000 − 90,000,000 − 3,600,000 − 0 = 206,400,000
   */
  const redevInfoEstimated: RedevelopmentInfo = {
    ...case36RedevInfo(),
    acquisitionHousingPrice: 120_000_000,   // P_A
    managementDisposalHousingPrice: 400_000_000, // D
    acquisitionRounding: "floor",
  };

  const inputEstimated: TransferTaxInput = baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 520_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 0, // 환산 모드 — 미사용
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: redevInfoEstimated,
  });

  const result = calculateTransferTax(inputEstimated, mockRates);

  it("[36-A1-01] 환산취득가 = 90,000,000 (floor(300M × 120M / 400M) — §166③)", () => {
    // 300,000,000 × 120,000,000 / 400,000,000 = 90,000,000 (정확히 나눠떨어짐)
    expect(result.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(90_000_000);
  });

  it("[36-A1-02] 인가전 양도차익 = 206,400,000 (300M − 90M − 3.6M − 0 — §163⑥ 개산공제 자동)", () => {
    // 개산공제 = floor(120M × 3%) = 3,600,000
    // 인가전 차익 = 300M − 90M − 3.6M = 206,400,000
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(206_400_000);
  });

  it("[36-A1-03] 환산취득가 method = 'estimated_post_disclosure_decree_166_3'", () => {
    expect(result.redevelopmentDetail?.valuationMeta?.method).toBe(
      "estimated_post_disclosure_decree_166_3",
    );
  });
});
