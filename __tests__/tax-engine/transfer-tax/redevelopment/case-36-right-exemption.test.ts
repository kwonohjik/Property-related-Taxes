/**
 * 사례 36-A4 + 36-A5 — 1세대1입주권 비과세 (§89①4호 가목) + 12억 초과 안분
 *
 * 36-A4-i: subject=right + pay + 실가 + 비과세 (transferPrice ≤ 12억 → 전액 비과세)
 * 36-A4-ii: subject=right + receive + 실가 + 비과세
 * 36-A5-i: subject=right + pay + 실가 + 12억 초과 안분 (transferPrice=15억)
 * 36-A5-ii: subject=right + receive + 실가 + 12억 초과 안분
 * 36-A5-iii: subject=right + pay + 환산 + 12억 초과 안분
 *
 * 비과세 트리거 (AND):
 *   1. subject === "right"
 *   2. exemptionEligibleAtApproval === true (인가일 기준 자기선언)
 *   3. isOneHousehold === true
 *   4. householdHousingCount === 0 (다른 주택 없음)
 *   5. householdRightCount === 1 (1입주권만)
 *
 * 12억 이하: 전액 비과세 → calculatedTax = 0, localIncomeTax = 0
 * 12억 초과: §89①4호 가목 단서 + §95③ 안분 → taxableRatio = (15억−12억)/15억 = 0.2
 *
 * 법령 근거:
 *   - 소득세법 §89①4호 가목 본문: 1세대1입주권 비과세
 *   - 소득세법 §89①4호 가목 단서: 12억 초과 안분
 *   - 소득세법 §95③ + 시행령 §160: 안분 산식
 *   - 시행령 §154: 1세대 범위
 *
 * 국세청 해석례 — 분모=transferPrice 단일 해석 A 채택 근거 (Pre-Do B-1 의무 첨부):
 *   KoreanLaw MCP search_decisions(domain="nts") 2026-05-14 조회 결과.
 *   국세청 법령해석은 법제처 OPEN API 본문 미지원 — 외부 taxlaw.nts.go.kr 링크로 본문 확인 권고.
 *
 *   [64158]  고가주택에 해당하는 조합원입주권 양도차익 산정방법
 *            국세청, 2010.11.01
 *            https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000144597
 *
 *   [299260] 1세대 1주택 비과세 요건을 갖춘 고가입주권의 양도차익 산정방법 등
 *            국세청, 2006.12.08
 *            https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000031304
 *
 *   [152604] 1세대1주택인 고가주택의 입주권을 양도하는 경우 양도차익 산정방법
 *            국세청, 2008.01.10
 *            https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000045919
 *
 *   ※ 본 3건은 "고가입주권 양도차익 산정"의 분모로 양도가액(transferPrice) 단일 적용을
 *      해석 A로 일관 지지. 청산금은 분모에 별도 산입되지 않음.
 *   ※ 대안 인용 출처: 양도소득세 집행기준 §89-154-x / 사례 45 D-0-2 인용 재활용.
 *
 * 회귀 가드:
 *   - subject="apt" + exemptionEligibleAtApproval=true → 사례 47 경로 (applySettlementExemption)
 *     applyOneRightExemption은 subject="right" 가드로 미진입 → 사례 44~48 회귀 0
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

// ──────────────────────────────────────────────────────────────────────────────
// 공용 fixture
// ──────────────────────────────────────────────────────────────────────────────

/** 비과세 조건 충족 RedevelopmentInfo (pay 기본) */
function redevInfoExemptPay(): RedevelopmentInfo {
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
    // 비과세 자기선언 (§89①4호 가목 트리거 조건 2)
    exemptionEligibleAtApproval: true,
  };
}

/** 비과세 조건 충족 기본 TransferTaxInput 팩토리 */
function exemptBaseInput(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 520_000_000, // ≤ 12억 → 전액 비과세
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,      // 조건 4
    householdHousingCount: 0,  // 다른 주택 없음 (조건 4)
    householdRightCount: 1,    // 1입주권 (조건 5)
    residencePeriodMonths: 0,
    redevelopment: redevInfoExemptPay(),
    ...overrides,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 36-A4-i — pay + 실가 + 비과세 (12억 이하)
// ──────────────────────────────────────────────────────────────────────────────

describe("36-A4-i — 1세대1입주권 비과세 (pay + 실가 + 5.2억)", () => {
  const input = exemptBaseInput();
  const result = calculateTransferTax(input, mockRates);

  it("[36-A4-i-01] oneRightExemptionApplied = true (§89①4호 가목 전액 비과세)", () => {
    expect(result.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
  });

  it("[36-A4-i-02] total.gain = 0 (3분기 모두 마스킹)", () => {
    expect(result.redevelopmentDetail?.total.gain).toBe(0);
  });

  it("[36-A4-i-03] total.lthd = 0", () => {
    expect(result.redevelopmentDetail?.total.lthd).toBe(0);
  });

  it("[36-A4-i-04] ★ calculatedTax = 0 (전액 비과세)", () => {
    expect(result.calculatedTax).toBe(0);
  });

  it("[36-A4-i-05] ★ localIncomeTax = 0", () => {
    expect(result.localIncomeTax).toBe(0);
  });

  it("[36-A4-i-06] gainAfterAllocation 보존 — 인가전 분 = 200,000,000 (trace)", () => {
    // 마스킹 전 원본 양도차익이 gainAfterAllocation에 보존되어야 함 (UI trace용)
    expect(result.redevelopmentDetail?.preApproval.gainAfterAllocation).toBe(200_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 36-A4-i 회귀 가드 — 토글 OFF 시 CORE-36 일반과세와 동일
// ──────────────────────────────────────────────────────────────────────────────

describe("36-A4-i 회귀 — exemptionEligibleAtApproval=false → 일반과세 (CORE-36 일치)", () => {
  const inputNoExempt = exemptBaseInput({
    isOneHousehold: false,   // 비과세 미진입
    householdHousingCount: 2,
    householdRightCount: 1,
    redevelopment: {
      ...redevInfoExemptPay(),
      exemptionEligibleAtApproval: false,
    },
  });
  const result = calculateTransferTax(inputNoExempt, mockRates);

  it("[36-A4-i-REGR] oneRightExemptionApplied 미설정 (일반과세)", () => {
    expect(result.redevelopmentDetail?.oneRightExemptionApplied).toBeUndefined();
  });

  it("[36-A4-i-REGR] 산출세액 = 81,710,000 (CORE-36 일치)", () => {
    expect(result.calculatedTax).toBe(81_710_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 36-A4-ii — receive + 실가 + 비과세 (12억 이하)
// ──────────────────────────────────────────────────────────────────────────────

describe("36-A4-ii — 1세대1입주권 비과세 (receive + 실가 + 5.2억)", () => {
  const redevReceive: RedevelopmentInfo = {
    ...redevInfoExemptPay(),
    settlementDirection: "receive",
    settlementSaleDate: new Date("2023-03-02"),
  };
  const input = exemptBaseInput({ redevelopment: redevReceive });
  const result = calculateTransferTax(input, mockRates);

  it("[36-A4-ii-01] oneRightExemptionApplied = true (receive 분기도 비과세)", () => {
    expect(result.redevelopmentDetail?.oneRightExemptionApplied).toBe(true);
  });

  it("[36-A4-ii-02] ★ calculatedTax = 0", () => {
    expect(result.calculatedTax).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 36-A5-i — pay + 실가 + 12억 초과 안분 (transferPrice=15억)
// ──────────────────────────────────────────────────────────────────────────────

describe("36-A5-i — §89①4호 가목 단서 12억 초과 안분 (pay + 실가 + 15억)", () => {
  /**
   * 가정값 (CORE-36 기반 + transferPrice=15억 + 비과세 토글 ON):
   *   taxableRatio = (1,500M − 1,200M) / 1,500M = 0.2
   *   인가전 과세분 = floor(200M × 0.2) = 40,000,000
   *   청산금납부분 과세분 = floor(1,110M × 0.2) = 222,000,000
   *   인가전 LTHD(안분 후) = floor(40M × 30%) = 12,000,000
   *   청산금납부분 LTHD = 0 (§94①2호)
   *   양도소득금액 = (40M − 12M) + (222M − 0) = 250,000,000
   *   과세표준 = 250M − 2.5M = 247,500,000
   *   산출세액 = floor(247.5M × 38%) − 19,940,000 = 74,110,000
   *   지방세 = floor(74,110,000 × 10%) = 7,411,000
   */
  const input = exemptBaseInput({ transferPrice: 1_500_000_000 });
  const result = calculateTransferTax(input, mockRates);

  it("[36-A5-i-01] oneRightHighValueApplied = true (12억 초과 안분)", () => {
    expect(result.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
  });

  it("[36-A5-i-02] 인가전 과세분 = 40,000,000 (200M × 0.2)", () => {
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(40_000_000);
  });

  it("[36-A5-i-03] 청산금납부분 과세분 = 222,000,000 (1,110M × 0.2)", () => {
    // 청산금납부분 gain = 1,500M − (300M + 90M) − 0 = 1,110M
    // 안분 = floor(1,110M × 0.2) = 222,000,000
    expect(result.redevelopmentDetail?.settlement.gain).toBe(222_000_000);
  });

  it("[36-A5-i-04] 인가전 LTHD (안분 후) = 12,000,000 (40M × 30%)", () => {
    expect(result.redevelopmentDetail?.preApproval.lthd).toBe(12_000_000);
  });

  it("[36-A5-i-05] 양도소득금액 = 250,000,000", () => {
    expect(result.redevelopmentDetail?.total.taxableIncome).toBe(250_000_000);
  });

  it("[36-A5-i-06] ★ 산출세액 = 74,110,000 (247.5M × 38% − 19,940,000 — §55 2023)", () => {
    // 247,500,000 × 38% = 94,050,000 − 19,940,000 = 74,110,000
    expect(result.calculatedTax).toBe(74_110_000);
  });

  it("[36-A5-i-07] ★ 지방소득세 = 7,411,000", () => {
    expect(result.localIncomeTax).toBe(7_411_000);
  });

  it("[36-A5-i-08] ★ 총납부세액 = 81,521,000", () => {
    expect(result.totalTax).toBe(81_521_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 36-A5-ii — receive + 실가 + 12억 초과 안분 (transferPrice=15억)
// ──────────────────────────────────────────────────────────────────────────────

describe("36-A5-ii — §89①4호 가목 단서 12억 초과 안분 (receive + 실가 + 15억)", () => {
  /**
   * 가정값 (CORE-36 receive 기반 + transferPrice=15억):
   *   preApprovalGain(원본) = 200M / salePriceTotal = 210M
   *   인가전 축소 = floor(200M × 210M / 300M) = 140,000,000
   *   청산금 분 gain = 60,000,000
   *
   *   taxableRatio = 0.2
   *   인가전 과세분 = floor(140M × 0.2) = 28,000,000
   *   청산금 분 과세분 = floor(60M × 0.2) = 12,000,000
   *   인가전 LTHD = floor(28M × 30%) = 8,400,000
   *   청산금 분 LTHD = 0
   *   양도소득금액 = (28M − 8.4M) + (12M − 0) = 31,600,000
   *   과세표준 = 31.6M − 2.5M = 29,100,000 (15% 구간)
   *   산출세액 = floor(29.1M × 15%) − 1,260,000 = 3,105,000
   */
  const redevReceive: RedevelopmentInfo = {
    ...redevInfoExemptPay(),
    settlementDirection: "receive",
    settlementSaleDate: new Date("2023-03-02"),
  };
  const input = exemptBaseInput({
    transferPrice: 1_500_000_000,
    redevelopment: redevReceive,
  });
  const result = calculateTransferTax(input, mockRates);

  it("[36-A5-ii-01] oneRightHighValueApplied = true", () => {
    expect(result.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
  });

  it("[36-A5-ii-02] 인가전 과세분 = 28,000,000 (140M × 0.2)", () => {
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(28_000_000);
  });

  it("[36-A5-ii-03] 청산금 분 과세분 = 12,000,000 (60M × 0.2)", () => {
    expect(result.redevelopmentDetail?.settlement.gain).toBe(12_000_000);
  });

  it("[36-A5-ii-04] ★ 산출세액 = 3,105,000 (29.1M × 15% − 1,260,000 — §55 2023)", () => {
    // 과세표준 29,100,000 → 14M~50M 구간 15% 적용
    // floor(29,100,000 × 0.15) − 1,260,000 = 4,365,000 − 1,260,000 = 3,105,000
    expect(result.calculatedTax).toBe(3_105_000);
  });

  it("[36-A5-ii-05] ★ 지방소득세 = 310,500", () => {
    // 3,105,000 × 10% = 310,500
    expect(result.localIncomeTax).toBe(310_500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 36-A5-iii — pay + 환산 + 12억 초과 안분 (transferPrice=15억)
// ──────────────────────────────────────────────────────────────────────────────

describe("36-A5-iii — §89①4호 가목 단서 12억 초과 안분 (pay + 환산 + 15억)", () => {
  /**
   * 가정값 (36-A1 환산 기반 + transferPrice=15억 + 비과세 토글 ON):
   *   환산취득가 = 90M / 개산공제 = 3.6M
   *   preApprovalGain(환산) = 300M − 90M − 3.6M = 206,400,000
   *   청산금납부분 gain = 15억 − (300M + 90M) − 0 = 1,110,000,000
   *
   *   taxableRatio = 0.2
   *   인가전 과세분(환산) = floor(206,400,000 × 0.2) = 41,280,000
   *   청산금납부분 과세분 = floor(1,110M × 0.2) = 222,000,000
   *   인가전 LTHD(환산+안분) = floor(41,280,000 × 30%) = 12,384,000
   *   양도소득금액 = (41,280,000 − 12,384,000) + 222,000,000 = 250,896,000
   *   과세표준 = 250,896,000 − 2,500,000 = 248,396,000 (38% 구간)
   *   산출세액 = floor(248,396,000 × 38%) − 19,940,000 = 74,450,480
   *   지방세 = floor(74,450,480 × 10%) = 7,445,048
   */
  const redevEstimated: RedevelopmentInfo = {
    ...redevInfoExemptPay(),
    acquisitionHousingPrice: 120_000_000,
    managementDisposalHousingPrice: 400_000_000,
  };
  const input = exemptBaseInput({
    transferPrice: 1_500_000_000,
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    redevelopment: redevEstimated,
  });
  const result = calculateTransferTax(input, mockRates);

  it("[36-A5-iii-01] oneRightHighValueApplied = true", () => {
    expect(result.redevelopmentDetail?.oneRightHighValueApplied).toBe(true);
  });

  it("[36-A5-iii-02] 인가전 과세분(환산) = 41,280,000 (floor(206.4M × 0.2))", () => {
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(41_280_000);
  });

  it("[36-A5-iii-03] ★ 산출세액 = 74,450,480 (248.396M × 38% − 19,940,000 — §55 2023)", () => {
    // floor(248,396,000 × 0.38) = 94,390,480 − 19,940,000 = 74,450,480
    expect(result.calculatedTax).toBe(74_450_480);
  });

  it("[36-A5-iii-04] ★ 지방소득세 = 7,445,048", () => {
    expect(result.localIncomeTax).toBe(7_445_048);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 회귀 가드 — subject="apt" + exemptionEligibleAtApproval=true → applyOneRightExemption 미진입
// ──────────────────────────────────────────────────────────────────────────────

describe("회귀 — subject='apt' + exemptionEligibleAtApproval=true → 사례 44~47 경로 격리", () => {
  /**
   * subject="apt" 케이스에서 applyOneRightExemption이 subject 가드로 미진입 확인.
   * 사례 44 anchor 값 재사용.
   */
  const aptRedev = {
    subject: "apt" as const,
    approvalLawBasis: "urban_renovation_art_74" as const,
    approvalDate: new Date("2009-10-23"),
    rightsValue: 219_218_500,
    settlementDirection: "pay" as const,
    settlementAmount: 92_781_500,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing" as const,
    acquisitionRounding: "floor" as const,
    acquisitionHousingPrice: 85_034_988,
    managementDisposalHousingPrice: 132_000_000,
    // subject="apt"에서 exemptionEligibleAtApproval=true를 설정해도
    // applyOneRightExemption은 subject가드로 미진입
    exemptionEligibleAtApproval: true,
  };

  const input = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: true,
    householdHousingCount: 0,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: aptRedev,
  });

  const result = calculateTransferTax(input, mockRates);

  it("[REGR-APT] oneRightExemptionApplied 미설정 (subject='apt' — applyOneRightExemption 미진입)", () => {
    expect(result.redevelopmentDetail?.oneRightExemptionApplied).toBeUndefined();
  });

  it("[REGR-APT] 산출세액 > 0 (일반과세 경로 정상 작동)", () => {
    // 사례 44 수치는 householdHousingCount=0이라 isOneHouseSingle=false → 12억 안분 미발동
    // apt 경로 정상 작동 확인 (0이 아님)
    expect(result.calculatedTax).toBeGreaterThan(0);
  });
});
