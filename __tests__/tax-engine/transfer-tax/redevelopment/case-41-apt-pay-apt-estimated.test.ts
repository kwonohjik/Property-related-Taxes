/**
 * C41 anchor — 사례 41: APT 양도 + 청산금 불입 + 공동주택 출자 (환산 모드)
 *
 * Pre-Do 검증 완료 (2026-05-15): 사례 44 환산 인프라(acquisitionHousingPrice/managementDisposalHousingPrice
 * 단일 D 패턴)가 PDF 2-point 산식과 동일 — 신규 헬퍼 불필요. 엔진 변경 0.
 *
 * PDF 출처: 양도코리아 책 사례 41
 * 법령 근거: §166②1호 (apt+pay 안분) + §164⑤ PHD 환산 (사례 44 패턴 재사용) + §163⑥ 개산공제 자동
 *
 * 입력:
 *   - 양도가액: 525,000,000 (2023-03-02)
 *   - 권리가액: 250,000,000 (관리처분인가일: 2016-10-23)
 *   - 청산금 불입액: 136,000,000
 *   - 종전 공동주택 취득일: 2012-04-09
 *   - 공동주택공시가격 — 2011-01-01 (취득당시 직전, 분자): 120,000,000
 *   - 공동주택공시가격 — 2016-01-01 (인가일 직전, 분모): 150,000,000
 *
 * 산식:
 *   환산취득가 = floor(250M × 120M / 150M) = 200,000,000
 *   개산공제 (§163⑥ 자동) = floor(120M × 3%) = 3,600,000
 *
 * 엔진 3분할 매핑:
 *   preApproval = 본래 차익 (250M − 200M − 3.6M = 46,400,000)
 *   postApprovalExistingHouse = 안분 종전 (90,025,906, 사례 40과 동일)
 *   settlement = 안분 청산금 (48,974,094, floor 잔액 흡수)
 *
 * LTHD:
 *   preApproval/postApprovalExistingHouse: 묶음 단일 20% (만 10년+, 2012-04-09~2023-03-02)
 *   settlement: 12% (만 6년+, 2016-10-23~2023-03-02)
 *
 * 합계: gain=185,400,000 / lthd=33,162,072 / taxableIncome=152,237,928 (PDF 152,237,927 +1원)
 * 산출세액: floor(149,737,928 × 35%) − 15,440,000 = 36,968,274 (★ 88M~1.5억 누진공제 15,440,000)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

function case41RedevInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2016-10-23"),
    rightsValue: 250_000_000,
    settlementDirection: "pay",
    settlementAmount: 136_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    // 사례 44 인프라 재사용 — PDF 2-point housingStdPriceAt{Acq,Approval}을 단일 D 패턴에 매핑
    acquisitionHousingPrice: 120_000_000, // 분자 (취득당시)
    managementDisposalHousingPrice: 150_000_000, // 분모 (인가일 직전)
    acquisitionRounding: "floor",
  };
}

function case41Input(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2012-04-09"),
    acquisitionPrice: 0, // 환산 모드
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: case41RedevInfo(),
  });
}

describe("C41 — 사례 41: APT+pay+housing 환산 (§166②1호 + §164⑤ 사례 44 인프라 재사용)", () => {
  const input = case41Input();
  const result = calculateTransferTax(input, mockRates);
  const detail = result.redevelopmentDetail!;

  // ── 분기 라우팅 + 환산 ───────────────────────────────────────────────────
  it("[C41-0] redevelopmentDetail 부착 + valuationMeta.method = estimated_post_disclosure_decree_166_3", () => {
    expect(detail).toBeDefined();
    expect(detail.valuationMeta?.method).toBe("estimated_post_disclosure_decree_166_3");
  });

  // ── 환산취득가 + 개산공제 ────────────────────────────────────────────────
  it("[C41-1 ★] 환산취득가 (preApproval.apportionedAcquisition) = 200,000,000", () => {
    expect(detail.preApproval.apportionedAcquisition).toBe(200_000_000);
  });
  it("[C41-2] estimatedLumpDeduction = 3,600,000 (= floor(120M × 3%))", () => {
    expect(detail.estimatedLumpDeduction).toBe(3_600_000);
  });

  // ── preApproval (본래 차익, 개산공제 자동 차감) ──────────────────────────
  it("[C41-3] preApproval.gain = 46,400,000 (= 250M − 200M − 3.6M)", () => {
    expect(detail.preApproval.gain).toBe(46_400_000);
  });
  it("[C41-5] preApproval.apportionedTransfer = 250,000,000 (권리가)", () => {
    expect(detail.preApproval.apportionedTransfer).toBe(250_000_000);
  });
  it("[C41-8] preApproval.lthdRate = 0.20 (만 10년+, 2012-04-09~2023-03-02)", () => {
    expect(detail.preApproval.lthdRate).toBeCloseTo(0.20, 5);
  });
  it("[C41-9] preApproval.lthd = 9,280,000 (= floor(46.4M × 20%))", () => {
    expect(detail.preApproval.lthd).toBe(9_280_000);
  });

  // ── postApprovalExistingHouse (안분 종전) ────────────────────────────────
  it("[C41-4] postApprovalExistingHouse.gain = 90,025,906 (사례 40과 동일)", () => {
    expect(detail.postApprovalExistingHouse.gain).toBe(90_025_906);
  });
  it("[C41-5b] postApprovalExistingHouse.apportionedTransfer = 340,025,906", () => {
    expect(detail.postApprovalExistingHouse.apportionedTransfer).toBe(340_025_906);
  });
  it("[C41-5c] postApprovalExistingHouse.apportionedAcquisition = 250,000,000", () => {
    expect(detail.postApprovalExistingHouse.apportionedAcquisition).toBe(250_000_000);
  });
  it("[C41-9b] postApprovalExistingHouse.lthdRate = 0.20 (묶음 단일률)", () => {
    expect(detail.postApprovalExistingHouse.lthdRate).toBeCloseTo(0.20, 5);
  });
  it("[C41-9c] postApprovalExistingHouse.lthd = 18,005,181 (= floor(90,025,906 × 20%))", () => {
    expect(detail.postApprovalExistingHouse.lthd).toBe(18_005_181);
  });

  // ── settlement (안분 청산금, floor 잔액 흡수) ────────────────────────────
  it("[C41-6] settlement.gain = 48,974,094 (floor 잔액 흡수, PDF +1원)", () => {
    expect(detail.settlement.gain).toBe(48_974_094);
  });
  it("[C41-10 ★ 묶음 해제] settlement.lthdRate = 0.12 (만 6년+, 인가일~양도일)", () => {
    expect(detail.settlement.lthdRate).toBeCloseTo(0.12, 5);
  });
  it("[C41-11] settlement.lthd = 5,876,891 (= floor(48,974,094 × 12%))", () => {
    expect(detail.settlement.lthd).toBe(5_876_891);
  });

  // ── 자기일관성 ───────────────────────────────────────────────────────────
  it("[C41-27] preApproval 자기일관성 (250M − 200M − 3.6M(개산공제) === 46.4M)", () => {
    const { apportionedTransfer, apportionedAcquisition, expenses = 0, gain } = detail.preApproval;
    // expenses에 개산공제 반영 (memory feedback_estimated_deduction_separation)
    expect(apportionedTransfer - apportionedAcquisition - expenses).toBe(gain);
  });
  it("[C41-27b] postApprovalExistingHouse 자기일관성 (340,025,906 − 250M − 0 === 90,025,906)", () => {
    const { apportionedTransfer, apportionedAcquisition, expenses = 0, gain } =
      detail.postApprovalExistingHouse;
    expect(apportionedTransfer - apportionedAcquisition - expenses).toBe(gain);
  });

  // ── 합계 ────────────────────────────────────────────────────────────────
  it("[C41-7] total.gain = 185,400,000 (46.4M + 90,025,906 + 48,974,094)", () => {
    expect(detail.total.gain).toBe(185_400_000);
  });
  it("[C41-12] total.lthd = 33,162,072 (9.28M + 18,005,181 + 5,876,891)", () => {
    expect(detail.total.lthd).toBe(33_162_072);
  });
  it("[C41-13 ★] total.taxableIncome = 152,237,928 (PDF 152,237,927 +1원)", () => {
    expect(detail.total.taxableIncome).toBe(152_237_928);
  });

  // ── 산출세액 (양도일 2023 §55 88M~1.5억 35% / ★ 누진공제 15,440,000) ──────
  it("[C41-14] taxBase = 149,737,928 (152,237,928 − 2,500,000)", () => {
    expect(result.taxBase).toBe(149_737_928);
  });
  it("[C41-15 ★] calculatedTax = 36,968,274 (= floor(149,737,928 × 35%) − 15,440,000)", () => {
    // 88M~1.5억 구간 누진공제 = 15,440,000 (계획서 v1 오기 정정: 15,360,000)
    expect(result.calculatedTax).toBe(36_968_274);
  });
  it("[C41-16] localIncomeTax = 3,696,827 (= floor(36,968,274 × 10%))", () => {
    expect(result.localIncomeTax).toBe(3_696_827);
  });
  it("[C41-17 ★] totalTax = 40,665,101", () => {
    expect(result.totalTax).toBe(40_665_101);
  });

  // ── 신고서 양식 합계 정합 ────────────────────────────────────────────────
  it("[C41-20] 합계 양도가 = 525,000,000", () => {
    expect(input.transferPrice).toBe(525_000_000);
  });
  it("[C41-21] 합계 필요경비 = 3,600,000 (환산모드 개산공제, expenses 분리 표시)", () => {
    const expensesSum =
      (detail.preApproval.expenses ?? 0) +
      (detail.postApprovalExistingHouse.expenses ?? 0) +
      (detail.settlement.expenses ?? 0);
    expect(expensesSum).toBe(3_600_000);
  });
  it("[C41-22] 합계 양도차익 = 185,400,000", () => {
    expect(result.transferGain).toBe(185_400_000);
  });
  it("[C41-23 ★ 역산 정합성] 합계 취득가 (역산) = 336,000,000 (= 525M − 3.6M − 185.4M)", () => {
    // 자기일관성: 환산취득가 200M + 청산금 136M = 336M ✅
    expect(input.transferPrice - 3_600_000 - result.transferGain).toBe(336_000_000);
  });

  // ── 보유기간 분기 ───────────────────────────────────────────────────────
  it("[C41-19a] preApproval branchAcq = 2012-04-09 / branchTransfer = 2023-03-02", () => {
    expect(detail.preApproval.branchAcqDate?.toISOString().slice(0, 10)).toBe("2012-04-09");
    expect(detail.preApproval.branchTransferDate?.toISOString().slice(0, 10)).toBe("2023-03-02");
  });
  it("[C41-19b] settlement branchAcq = 2016-10-23 (★ 인가일)", () => {
    expect(detail.settlement.branchAcqDate?.toISOString().slice(0, 10)).toBe("2016-10-23");
    expect(detail.settlement.branchTransferDate?.toISOString().slice(0, 10)).toBe("2023-03-02");
  });
});
