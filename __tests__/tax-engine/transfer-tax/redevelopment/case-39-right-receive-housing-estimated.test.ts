/**
 * C39 anchor — 사례 39: 조합원입주권 right+receive + 단독주택 출자 (환산 모드, §166③ PHD 2-point)
 *
 * PDF 출처: 양도코리아 책 사례 39
 * 법령 근거:
 *   - 소득세법 §166③     : PHD 환산취득가 = 권리가액 × 취득당시PHD / 인가당시PHD
 *   - 소득세법 §163⑥     : 개산공제 = floor(취득당시PHD × 3%)
 *   - 소득세법 §166①2호 나목: 인가전 양도차익 = (권리가액 − 환산 − 개산공제) × salePriceTotal / 권리가액
 *   - 소득세법 §166①2호 가목: 인가후 양도차익 = 양도가액 − salePriceTotal − 인가후필요경비
 *   - 소득세법 §166⑤1호  : LTHD 보유기간 = 취득일 ~ 관리처분 인가일
 *   - 소득세법 §95② 별표2 [비고] 1호: 인가후 분 LTHD = 0 (입주권 §94①2호 자산)
 *   - 소득세법 §55 (2023) + 지방세법 §103조의3
 *
 * 입력:
 *   - 양도가액: 320,000,000 (2023-03-02)
 *   - 권리가액(평가액): 300,000,000 (관리처분인가일: 2013-10-23) ★ 사례 38(2016-10-23)과 다름
 *   - 청산금 수령액: 50,000,000
 *   - 취득일: 2008-04-09 (acquisitionPrice 미입력 — 환산 모드)
 *   - 취득당시 개별주택가격(분자): 120,000,000
 *   - 인가당시 부근 개별주택가격(분모): 200,000,000
 *   - 인가전·인가후 필요경비: 0
 *   - 1세대1주택 미충족 (다주택자)
 *   - originalAssetType: "housing" / useEstimatedAcquisition: true
 *
 * 산식 검증:
 *   salePriceTotal = 300M − 50M = 250,000,000
 *
 *   [§166③ 환산취득가]
 *   convertedAcquisition = floor(300M × 120M / 200M) = 180,000,000  ← C39-1
 *
 *   [§163⑥ 개산공제]
 *   estimatedDeduction = floor(120M × 3%) = 3,600,000  ← C39-2
 *
 *   [§166①2호 나목: 인가전 분]
 *   preApprovalGainBase = 300M − 180M − 3.6M = 116,400,000
 *   preApprovalGain = floor(116.4M × 250M / 300M) = floor(29,100,000,000,000 / 300M)
 *                   = floor(97,000,000) = 97,000,000  ← C39-3
 *
 *   [§166①2호 가목: 인가후 분]
 *   postApprovalGain = 320M − 250M − 0 = 70,000,000  ← C39-4
 *
 *   [합계]
 *   total.gain = 97M + 70M = 167,000,000  ← C39-6
 *
 *   [LTHD — 사례 39 ★ 인가일 2013-10-23]
 *   2008-04-09 ~ 2013-10-23 = 5년 6개월 → 만 5년 → 표1: 5 × 2% = 10%  ← C39-7
 *   preApproval.lthd = floor(97M × 10%) = 9,700,000  ← C39-8
 *   total.lthd = 9,700,000  ← C39-10
 *
 *   [양도소득금액]
 *   taxableIncome = 87.3M + 70M = 157,300,000  ← C39-11
 *   (97M × 0.9 = 87.3M, 70M × 1.0 = 70M)
 *
 *   [세액 — 2023년 §55 누진세율]
 *   과세표준 = 157.3M − 2.5M = 154,800,000  ← C39-12
 *   1.5억~3억 구간: 38% − 누진공제 19,940,000
 *   산출세액 = floor(154.8M × 0.38) − 19,940,000 = 58,824,000 − 19,940,000 = 38,884,000  ← C39-13
 *   지방소득세 = floor(38,884,000 × 0.1) = 3,888,400  ← C39-14
 *   합계 = 42,772,400  ← C39-15
 *
 * ★ 사례 38과 비교:
 *   인가일 2013 (39) vs 2016 (38) → LTHD율 10% vs 14%
 *   환산취득가 180M (39) vs 실가 180M (38) — 우연히 동일하나 산식 다름
 *   산출세액 38,884,000 (39) vs 38,390,000 (38) — 인가일 차이로 LTHD율 상이
 *
 * ★ memory `feedback_transfer_year_tax_rate`: 양도일 2023년 §55 누진세율 직접 계산.
 *   외부 PDF 산출값 추종 금지.
 */

import { describe, it, expect } from "vitest";
import {
  calculateTransferTax,
  type TransferTaxInput,
} from "@/lib/tax-engine/transfer-tax";
import {
  calcRedevHousingContribReceiveEstimated,
} from "@/lib/tax-engine/redevelopment-housing-contribution";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

// ──────────────────────────────────────────────────────────────────────────────
// fixture
// ──────────────────────────────────────────────────────────────────────────────

function case39RedevInfo(): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"), // ★ 사례 38(2016-10-23)과 다름 → LTHD 10%
    rightsValue: 300_000_000,
    settlementDirection: "receive",
    settlementAmount: 50_000_000,
    settlementSaleDate: new Date("2023-03-02"),
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    housingStdPriceAtAcq: 120_000_000,   // §166③ 분자 — 취득당시 개별주택가격
    housingStdPriceAtApproval: 200_000_000, // §166③ 분모 — 인가당시 부근 개별주택가격
    acquisitionRounding: "floor",
  };
}

function case39Input(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 320_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2008-04-09"),
    acquisitionPrice: undefined, // 환산 모드 — 취득가액 미입력
    expenses: 0,
    useEstimatedAcquisition: true, // ★ 환산 분기 트리거
    isOneHousehold: false,
    householdHousingCount: 2,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: case39RedevInfo(),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Part 1: 순수 엔진 함수 단위 테스트 (Pre-Do anchor 5건 포함)
// ──────────────────────────────────────────────────────────────────────────────

describe("C39 Pure — calcRedevHousingContribReceiveEstimated 단위 검증", () => {
  const result = calcRedevHousingContribReceiveEstimated({
    acquisitionDate: new Date("2008-04-09"),
    approvalDate: new Date("2013-10-23"),
    rightsValue: 300_000_000,
    transferPrice: 320_000_000,
    settlementReceived: 50_000_000,
    housingStdPriceAtAcq: 120_000_000,
    housingStdPriceAtApproval: 200_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
  });

  // ── Pre-Do anchor ─────────────────────────────────────────────────────────

  it("[C39-1] convertedAcquisition = 180,000,000 (§166③: floor(300M × 120M / 200M))", () => {
    // floor(300,000,000 × 120,000,000 / 200,000,000) = floor(180,000,000) = 180,000,000
    expect(result.convertedAcquisition).toBe(180_000_000);
  });

  it("[C39-2] estimatedDeduction = 3,600,000 (§163⑥: floor(120M × 3%))", () => {
    expect(result.estimatedDeduction).toBe(3_600_000);
  });

  it("[C39-3] preApprovalGain = 97,000,000 (§166①2호 나목)", () => {
    // preApprovalGainBase = 300M − 180M − 3.6M = 116,400,000
    // namoK = floor(116.4M × 250M / 300M) = floor(97,000,000) = 97,000,000
    expect(result.preApprovalGain).toBe(97_000_000);
  });

  it("[C39-7-pure] lthdRate = 0.10 (표1, 2008-04-09 ~ 2013-10-23 = 만 5년 × 2%)", () => {
    // 5년 6개월 → 만 5년 → 표1: 5 × 2% = 10%
    expect(result.lthdRate).toBe(0.10);
  });

  it("[C39-pure-salePriceTotal] salePriceTotal = 250,000,000 (권리가액 − 수령청산금)", () => {
    expect(result.salePriceTotal).toBe(250_000_000);
  });

  // ── 추가 단위 검증 ─────────────────────────────────────────────────────────

  it("[C39-4-pure] postApprovalGain = 70,000,000 (§166①2호 가목: 320M − 250M)", () => {
    expect(result.postApprovalGain).toBe(70_000_000);
  });

  it("[C39-8-pure] preApprovalLTHD = 9,700,000 (97M × 10%)", () => {
    expect(result.preApprovalLTHD).toBe(9_700_000);
  });

  it("[C39-9-pure] postApprovalLTHD = 0 (§95② 별표2 [비고] 1호)", () => {
    expect(result.postApprovalLTHD).toBe(0);
  });

  it("[C39-pure-holdingYears] lthdHoldingYears = 5 (만 5년 절사)", () => {
    expect(result.lthdHoldingYears).toBe(5);
  });

  it("[C39-24-pure] preApprovalApportionedAcquisition = 150,000,000 (floor(180M × 250M / 300M))", () => {
    // 신고서 양식 인가전 분 취득가액 = floor(환산취득가 × salePriceTotal / 권리가액)
    // = floor(180M × 250M / 300M) = floor(150,000,000) = 150,000,000
    expect(result.preApprovalApportionedAcquisition).toBe(150_000_000);
  });

  it("[C39-23-pure] preApprovalApportionedTransfer = 250,000,000 (= salePriceTotal)", () => {
    expect(result.preApprovalApportionedTransfer).toBe(250_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Part 2: 통합 계산 (calculateTransferTax 경유)
// ──────────────────────────────────────────────────────────────────────────────

describe("C39 — 조합원입주권 right+receive 단독주택 환산취득가 (§166③ + §166①2호)", () => {
  const result = case39Input();
  const calcResult = calculateTransferTax(result, mockRates);
  const detail = calcResult.redevelopmentDetail!;

  // ── 인가전 분 (나목) ────────────────────────────────────────────────────

  it("[C39-3] preApproval.gain = 97,000,000 (나목: 116.4M × 250/300)", () => {
    expect(detail.preApproval.gain).toBe(97_000_000);
  });

  it("[C39-5] postApprovalExistingHouse.gain = 0 (§95② 입주권 right 분기)", () => {
    expect(detail.postApprovalExistingHouse.gain).toBe(0);
  });

  // ── 인가후 분 (가목) ────────────────────────────────────────────────────

  it("[C39-4] settlement.gain = 70,000,000 (가목: 320M − 250M)", () => {
    expect(detail.settlement.gain).toBe(70_000_000);
  });

  // ── 합계 ────────────────────────────────────────────────────────────────

  it("[C39-6] total.gain = 167,000,000 (97M + 70M)", () => {
    expect(detail.total.gain).toBe(167_000_000);
  });

  // ── LTHD ── ★ 사례 38(인가일 2016, 14%)과 다른 10% ───────────────────

  it("[C39-7] preApproval.lthdRate = 0.10 (표1, 2008-04-09 ~ 2013-10-23 = 만 5년)", () => {
    // ★ 인가일 2013-10-23 — 사례 38(2016-10-23, 만 7년 14%)과 다름
    expect(detail.preApproval.lthdRate).toBe(0.10);
  });

  it("[C39-8] preApproval.lthd = 9,700,000 (97M × 10%)", () => {
    expect(detail.preApproval.lthd).toBe(9_700_000);
  });

  it("[C39-9] settlement.lthd = 0 (§95² 입주권 LTHD 미적용)", () => {
    expect(detail.settlement.lthd).toBe(0);
  });

  it("[C39-10] total.lthd = 9,700,000 (preApproval만)", () => {
    expect(detail.total.lthd).toBe(9_700_000);
  });

  // ── 양도소득금액·과세표준·세액 ──────────────────────────────────────────

  it("[C39-11] total.taxableIncome = 157,300,000 (87.3M + 70M)", () => {
    // (97M − 9.7M) + (70M − 0) = 87.3M + 70M = 157,300,000
    expect(detail.total.taxableIncome).toBe(157_300_000);
  });

  it("[C39-12] taxBase = 154,800,000 (157.3M − 기본공제 250만)", () => {
    // §103 기본공제 2,500,000
    expect(calcResult.taxBase).toBe(154_800_000);
  });

  it("[C39-13] calculatedTax = 38,884,000 (2023년 §55 누진세율 직접 계산)", () => {
    // 과세표준 154,800,000 — 1.5억~3억 구간: 38% − 19,940,000
    // floor(154,800,000 × 0.38) − 19,940,000 = 58,824,000 − 19,940,000 = 38,884,000
    // (외부 PDF 산출값 추종 금지 — memory `transfer_year_tax_rate`)
    expect(calcResult.calculatedTax).toBe(38_884_000);
  });

  it("[C39-14] localIncomeTax = 3,888,400 (38,884,000 × 10%)", () => {
    expect(calcResult.localIncomeTax).toBe(3_888_400);
  });

  it("[C39-15] totalTax = 42,772,400", () => {
    expect(calcResult.totalTax).toBe(42_772_400);
  });

  // ── echo 필드 검증 ──────────────────────────────────────────────────────

  it("[C39-echo-1] housingContribDetail.convertedAcquisition = 180,000,000", () => {
    expect(calcResult.redevelopmentDetail?.housingContribDetail?.convertedAcquisition).toBe(
      180_000_000,
    );
  });

  it("[C39-echo-2] housingContribDetail.estimatedDeduction = 3,600,000", () => {
    expect(calcResult.redevelopmentDetail?.housingContribDetail?.estimatedDeduction).toBe(
      3_600_000,
    );
  });

  it("[C39-echo-3] housingContribDetail.preApprovalLTHD = 9,700,000", () => {
    expect(calcResult.redevelopmentDetail?.housingContribDetail?.preApprovalLTHD).toBe(
      9_700_000,
    );
  });

  it("[C39-echo-4] housingContribDetail.postApprovalLTHD = 0", () => {
    expect(calcResult.redevelopmentDetail?.housingContribDetail?.postApprovalLTHD).toBe(0);
  });

  // ── 안분값 (신고서 양식 표시용) ─────────────────────────────────────────

  it("[C39-23] preApproval.apportionedTransfer = 250,000,000 (= salePriceTotal)", () => {
    expect(detail.preApproval.apportionedTransfer).toBe(250_000_000);
  });

  it("[C39-24] preApproval.apportionedAcquisition = 150,000,000 (floor(180M × 250/300))", () => {
    // 신고서 양식 인가전 분 취득가액 안분 = floor(환산취득가 × salePriceTotal / 권리가액)
    expect(detail.preApproval.apportionedAcquisition).toBe(150_000_000);
  });

  it("[C39-settlement-transfer] settlement.apportionedTransfer = 320,000,000 (= 실제 양도가)", () => {
    expect(detail.settlement.apportionedTransfer).toBe(320_000_000);
  });

  it("[C39-settlement-acq] settlement.apportionedAcquisition = 250,000,000 (= salePriceTotal)", () => {
    expect(detail.settlement.apportionedAcquisition).toBe(250_000_000);
  });

  // ── 신고서 양식 합계 역산 검증 (memory `feedback_redev_filing_form_acquisition_inverse`) ──

  it("[C39-20] 신고서 합계 취득가 역산 = 150,000,000 (= 320M − 3.0M − 167M)", () => {
    // 합계 취득가액 = 합계 양도가 − 합계 필요경비 − 합계 양도차익 (역산 공식)
    // = 320,000,000 − 3,000,000 − 167,000,000 = 150,000,000
    //
    // ★ 2026-08-13 정정: 종전 149,400,000은 안분 전 개산공제 3,600,000을 쓴 값이었다.
    //   C39-18과 함께 정정 — 근거는 C39-18 주석 참조.
    const transferTotal = detail.settlement.apportionedTransfer; // 320M (실제 양도가)
    const expensesTotal = detail.preApproval.expenses ?? 0;       // 3,000,000 (안분 후 개산공제)
    const gainTotal = detail.total.gain;                           // 167,000,000
    const inversedAcquisition = transferTotal - expensesTotal - gainTotal;
    expect(inversedAcquisition).toBe(150_000_000);
  });

  // ── 신고서 양식 필요경비 (memory `feedback_estimated_deduction_separation`) ──

  it("[C39-18] preApproval.expenses = 3,000,000 (개산공제 3,600,000 × 250/300 안분)", () => {
    // §163⑥ 개산공제는 필요경비 항목으로 분리 표시 — 취득가액에 합산 금지 (종전 규약 유지).
    //
    // ★ 2026-08-13 정정 (사용자 제보): 종전 3,600,000(안분 전 원액)은 **신고서 인가전 분 열을
    //   자기모순**으로 만들었다 — 같은 열의 양도가액 250,000,000(=권리가액 300M의 안분)과
    //   취득가액 150,000,000(=환산취득가 180M의 안분)은 이미 §166①2호 나목 비율이 적용된
    //   값인데 필요경비만 원액이면 250M − 150M − 3.6M = 96.4M ≠ 양도차익 97M이 된다.
    //
    //   나목 산식은 (권리가액 − 환산취득가 − 개산공제) 전체에 salePriceTotal/권리가액 을 곱하므로
    //   (`redevelopment-housing-contribution.ts:189~197`) **실효 차감액은 이미 안분값 3,000,000**
    //   이다. 즉 세액은 종전에도 옳았고 표시만 어긋나 있었다.
    //
    //   §163⑥ 산출값(안분 전) 3,600,000은 C39-2·C39-echo-2가 계속 고정한다 — 소실 없음.
    expect(detail.preApproval.expenses).toBe(3_000_000);
  });

  // ── 분기 확인 — 환산 분기가 올바르게 진입했는지 확인 ──

  it("[C39-valuationMeta] valuationMeta 존재 및 estimated 방식 확인", () => {
    const meta = calcResult.redevelopmentDetail?.valuationMeta;
    expect(meta).toBeDefined();
    expect(meta?.method).toBe("estimated_post_disclosure_decree_166_3");
    expect(meta?.numerator).toBe(120_000_000);    // 취득당시 PHD
    expect(meta?.denominator).toBe(200_000_000);  // 인가당시 PHD
  });

  // ── 회귀 확인 — 사례 39 신규 분기가 사례 38(실가) 결과에 영향 없음 ──

  it("[C39-reg-38] 사례 38 분기 독립성 — 실가 경로 그대로 (useEstimated=false → runOriginalMember)", () => {
    // 사례 38은 useEstimatedAcquisition=false → housing 환산 분기 미발동 → runOriginalMember 경유
    const case38Input = baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: 320_000_000,
      transferDate: new Date("2023-03-02"),
      acquisitionDate: new Date("2009-04-09"),
      acquisitionPrice: 180_000_000,
      expenses: 0,
      useEstimatedAcquisition: false, // ★ 실가 모드
      isOneHousehold: false,
      householdHousingCount: 2,
      householdRightCount: 1,
      residencePeriodMonths: 0,
      redevelopment: {
        subject: "right",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2016-10-23"), // ★ 사례 38 인가일
        rightsValue: 300_000_000,
        settlementDirection: "receive",
        settlementAmount: 50_000_000,
        settlementSaleDate: new Date("2023-03-02"),
        preApprovalExpenses: 0,
        postApprovalExpenses: 0,
        originalAssetType: "housing",
        acquisitionRounding: "floor",
      },
    });
    const case38Result = calculateTransferTax(case38Input, mockRates);
    // 사례 38 핵심 anchor — 사례 39 추가로 회귀하면 안 됨
    expect(case38Result.calculatedTax).toBe(38_390_000);
    expect(case38Result.redevelopmentDetail?.preApproval.lthdRate).toBe(0.14);
    expect(case38Result.redevelopmentDetail?.total.gain).toBe(170_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// C39 변형: 인가후 필요경비(양도비) 5,000,000 입력 시 settlement.expenses 반영 회귀 보호
// 버그 수정 2026-05-15: runHousingContribReceiveEstimated settlementDetail.expenses 이미 정상 —
// 동일 입력값으로 통합 경로(calculateTransferTax) 경유 시에도 settlement.expenses 정합 확인
// ──────────────────────────────────────────────────────────────────────────────

describe("C39-var — right+receive + 환산 + 양도비 5,000,000 (인가후 필요경비 반영 회귀 보호)", () => {
  const redevWithExpenses: RedevelopmentInfo = {
    ...case39RedevInfo(),
    postApprovalExpenses: 5_000_000,
  };
  const inputWithExpenses: TransferTaxInput = baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 320_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2008-04-09"),
    acquisitionPrice: undefined,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: redevWithExpenses,
  });
  const calcResult = calculateTransferTax(inputWithExpenses, mockRates);
  const detail = calcResult.redevelopmentDetail!;

  it("[C39-25] settlement.expenses = 5,000,000 (환산 경로 인가후 필요경비 반영)", () => {
    expect(detail.settlement.expenses).toBe(5_000_000);
  });

  it("[C39-26] settlement.gain = 65,000,000 (320M − 250M − 5M)", () => {
    // §166①2호 가목: 양도가액 − salePriceTotal − 인가후 필요경비
    expect(detail.settlement.gain).toBe(65_000_000);
  });

  it("[C39-27] total.taxableIncome = 152,300,000 (87.3M + 65M)", () => {
    // preApproval: 97M − 9.7M = 87.3M, settlement: 65M − 0 = 65M
    // total.gain = 97M + 65M = 162M, total.lthd = 9.7M
    // taxableIncome = 162M − 9.7M = 152,300,000
    expect(detail.total.taxableIncome).toBe(152_300_000);
  });

  it("[C39-28] calculatedTax = 36,990,000 (mock §55 세율 — 8,800만~1.5억 구간 35%)", () => {
    // 과세표준 = 152.3M − 2.5M = 149,800,000
    // mock 세율표: min=88,000,001 ~ max=150,000,000 → 35% − 누진공제 15,440,000
    // floor(149,800,000 × 0.35) − 15,440,000 = 52,430,000 − 15,440,000 = 36,990,000
    // (주의: 실세율 1.5억~3억 구간은 38%이나 mock 세율표 경계값은 150,000,001부터 38% 진입)
    expect(calcResult.calculatedTax).toBe(36_990_000);
  });
});
