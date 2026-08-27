/**
 * C40 anchor — 사례 40: APT 양도 + 청산금 불입 + 토지 출자 (실가 모드)
 *
 * Pre-Do 검증 완료 (2026-05-15): 현행 엔진(`runOriginalMember` + `splitGain` §166②1호)이 정확히 처리.
 * 본 anchor 는 회귀 보호용 — 엔진 변경 0.
 *
 * PDF 출처: 예제 교재 사례 40
 * 법령 근거: 소득세법 시행령 §166②1호 (신축APT 양도 + 청산금 불입)
 *
 * 입력:
 *   - 양도가액: 525,000,000 (2023-03-02)
 *   - 권리가액(평가액): 250,000,000 (관리처분인가일: 2014-01-23)
 *   - 청산금 불입액: 136,000,000
 *   - 종전 토지 취득가액(실가): 100,000,000 (2007-02-01)
 *   - 분양가 = 권리가 + 청산금 = 386,000,000
 *   - originalAssetType: "land" (토지 출자)
 *
 * 엔진 3분할 매핑 (§166②1호):
 *   preApproval = 본래 차익 (250M − 100M = 150M)
 *   postApprovalExistingHouse = 안분 종전 (floor((525M − 386M) × 250/386) = 90,025,906)
 *   settlement = 안분 청산금 (postApprovalRaw 139M − preApprovalAllocated 90,025,906 = 48,974,094, floor 잔액 흡수)
 *
 * LTHD:
 *   preApproval/postApprovalExistingHouse: 묶음 단일 30% (만 15년+, 2007-02-01~2023-03-02)
 *   settlement: 18% (만 9년+, 2014-01-23~2023-03-02) — 묶음 해제 작동
 *
 * 합계: gain=289M / lthd=80,823,107 / taxableIncome=208,176,893 (PDF 208,176,892 +1원 floor 흡수)
 * 산출세액: floor(205,676,893 × 38%) − 19,940,000 = 58,217,219
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

function case40RedevInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2014-01-23"),
    rightsValue: 250_000_000,
    settlementDirection: "pay",
    settlementAmount: 136_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "land",
  };
}

function case40Input(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2007-02-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: case40RedevInfo(),
  });
}

describe("C40 — 사례 40: APT+pay+land 실가 (§166②1호)", () => {
  const input = case40Input();
  const result = calculateTransferTax(input, mockRates);
  const detail = result.redevelopmentDetail!;

  // ── 분기 라우팅 ──────────────────────────────────────────────────────────
  it("[C40-0] redevelopmentDetail 부착 + valuationMeta.method = actual", () => {
    expect(detail).toBeDefined();
    expect(detail.valuationMeta?.method).toBe("actual");
  });

  // ── preApproval (본래 차익) ──────────────────────────────────────────────
  it("[C40-1] preApproval.gain = 150,000,000 (본래 차익: 250M − 100M)", () => {
    expect(detail.preApproval.gain).toBe(150_000_000);
  });
  it("[C40-3] preApproval.apportionedTransfer = 250,000,000 (권리가)", () => {
    expect(detail.preApproval.apportionedTransfer).toBe(250_000_000);
  });
  it("[C40-3b] preApproval.apportionedAcquisition = 100,000,000 (종전 실가)", () => {
    expect(detail.preApproval.apportionedAcquisition).toBe(100_000_000);
  });
  it("[C40-7] preApproval.lthdRate = 0.30 (만 15년+)", () => {
    expect(detail.preApproval.lthdRate).toBeCloseTo(0.30, 5);
  });
  it("[C40-8] preApproval.lthd = 45,000,000 (= floor(150M × 30%))", () => {
    expect(detail.preApproval.lthd).toBe(45_000_000);
  });

  // ── postApprovalExistingHouse (안분 종전) ────────────────────────────────
  it("[C40-2] postApprovalExistingHouse.gain = 90,025,906 (= floor(139M × 250/386))", () => {
    expect(detail.postApprovalExistingHouse.gain).toBe(90_025_906);
  });
  it("[C40-3c] postApprovalExistingHouse.apportionedTransfer = 340,025,906", () => {
    expect(detail.postApprovalExistingHouse.apportionedTransfer).toBe(340_025_906);
  });
  it("[C40-3d] postApprovalExistingHouse.apportionedAcquisition = 250,000,000 (분모 안분)", () => {
    expect(detail.postApprovalExistingHouse.apportionedAcquisition).toBe(250_000_000);
  });
  it("[C40-8b] postApprovalExistingHouse.lthdRate = 0.30 (묶음 단일률)", () => {
    expect(detail.postApprovalExistingHouse.lthdRate).toBeCloseTo(0.30, 5);
  });
  it("[C40-8c] postApprovalExistingHouse.lthd = 27,007,771", () => {
    expect(detail.postApprovalExistingHouse.lthd).toBe(27_007_771);
  });

  // ── settlement (안분 청산금, floor 잔액 흡수) ────────────────────────────
  it("[C40-4] settlement.gain = 48,974,094 (floor 잔액 흡수, PDF 48,974,093 +1원)", () => {
    expect(detail.settlement.gain).toBe(48_974_094);
  });
  it("[C40-5] settlement.apportionedTransfer = 184,974,094 (floor 잔액 흡수, PDF 184,974,093 +1원)", () => {
    // 🔴 2026-08-27 정정: 종전 184,974,093은 **양쪽 floor** 값이라 열 합계가
    //    340,025,906 + 184,974,093 = 524,999,999로 양도가액 525,000,000에 1원 모자랐다.
    //    양도차익이 이미 쓰던 잔액 흡수 규약(C40-4)을 양도가액 열에도 적용해 맞춘다.
    expect(detail.settlement.apportionedTransfer).toBe(184_974_094);
  });
  it("[C40-5b] settlement.apportionedAcquisition = 136,000,000 (불입 청산금)", () => {
    expect(detail.settlement.apportionedAcquisition).toBe(136_000_000);
  });
  it("[C40-9 ★ 묶음 해제] settlement.lthdRate = 0.18 (만 9년+, 인가일~양도일)", () => {
    expect(detail.settlement.lthdRate).toBeCloseTo(0.18, 5);
  });
  it("[C40-10] settlement.lthd = 8,815,336 (= floor(48,974,094 × 18%))", () => {
    expect(detail.settlement.lthd).toBe(8_815_336);
  });

  // ── 자기일관성 (분기별 apportionedTransfer − apportionedAcquisition − expenses === gain) ─
  it("[C40-25] preApproval 자기일관성 (250M − 100M − 0 === 150M)", () => {
    const { apportionedTransfer, apportionedAcquisition, expenses = 0, gain } = detail.preApproval;
    expect(apportionedTransfer - apportionedAcquisition - expenses).toBe(gain);
  });
  it("[C40-25b] postApprovalExistingHouse 자기일관성 (340,025,906 − 250M − 0 === 90,025,906)", () => {
    const { apportionedTransfer, apportionedAcquisition, expenses = 0, gain } =
      detail.postApprovalExistingHouse;
    expect(apportionedTransfer - apportionedAcquisition - expenses).toBe(gain);
  });
  /**
   * 🔴 종전 주석은 「settlement는 1원 drift · **신고서 양식 합계에는 영향 없음(합계 양도가 525M
   *    정확)**」이라 적고 이 단언을 **비워 뒀다**. 두 진술이 다 틀렸다 —
   *    실제 합계는 `340,025,906 + 184,974,093 = 524,999,999`로 **1원 모자랐고**,
   *    그래서 settlement 열의 자기일관성도 깨져 있었다.
   *    양도가액 열에 잔액 흡수를 적용하니 **둘 다 동시에 해소**됐다 ⇒ 단언을 되살린다.
   */
  it("[C40-26] settlement 자기일관성 (184,974,094 − 136,000,000 === 48,974,094)", () => {
    const { apportionedTransfer, apportionedAcquisition, expenses = 0, gain } = detail.settlement;
    expect(apportionedTransfer - apportionedAcquisition - expenses).toBe(gain);
  });

  it("[C40-27] 🔑 양도가액 열 합계 = 총 양도가액 525,000,000", () => {
    expect(
      detail.postApprovalExistingHouse.apportionedTransfer + detail.settlement.apportionedTransfer,
    ).toBe(525_000_000);
  });

  // ── 합계 ────────────────────────────────────────────────────────────────
  it("[C40-6] total.gain = 289,000,000 (150M + 90,025,906 + 48,974,094)", () => {
    expect(detail.total.gain).toBe(289_000_000);
  });
  it("[C40-11] total.lthd = 80,823,107 (45M + 27,007,771 + 8,815,336)", () => {
    expect(detail.total.lthd).toBe(80_823_107);
  });
  it("[C40-12 ★] total.taxableIncome = 208,176,893 (PDF 208,176,892 +1원 floor 흡수)", () => {
    expect(detail.total.taxableIncome).toBe(208_176_893);
  });

  // ── 산출세액 (양도일 2023 §55 1.5억~3억 38% / 누진공제 19,940,000) ────────
  it("[C40-13] taxBase = 205,676,893 (208,176,893 − 2,500,000 기본공제)", () => {
    expect(result.taxBase).toBe(205_676_893);
  });
  it("[C40-14 ★] calculatedTax = 58,217,219 (= floor(205,676,893 × 38%) − 19,940,000)", () => {
    expect(result.calculatedTax).toBe(58_217_219);
  });
  it("[C40-15] localIncomeTax = 5,821,721 (= floor(58,217,219 × 10%))", () => {
    expect(result.localIncomeTax).toBe(5_821_721);
  });
  it("[C40-16 ★] totalTax = 64,038,940", () => {
    expect(result.totalTax).toBe(64_038_940);
  });

  // ── 신고서 양식 합계 정합 ────────────────────────────────────────────────
  it("[C40-19] 합계 양도가 = 525,000,000 (입력값)", () => {
    expect(input.transferPrice).toBe(525_000_000);
  });
  it("[C40-20] 합계 필요경비 = 0 (실가 모드)", () => {
    // 실가 모드에서 expenses는 모든 분기 0
    const expensesSum =
      (detail.preApproval.expenses ?? 0) +
      (detail.postApprovalExistingHouse.expenses ?? 0) +
      (detail.settlement.expenses ?? 0);
    expect(expensesSum).toBe(0);
  });
  it("[C40-21] 합계 양도차익 = 289,000,000", () => {
    expect(result.transferGain).toBe(289_000_000);
  });
  it("[C40-22 ★ 역산 정합성] 합계 취득가 (역산) = 236,000,000 (= 525M − 0 − 289M)", () => {
    // 자기일관성: 종전취득가 100M + 청산금 136M = 236M ✅
    expect(input.transferPrice - 0 - result.transferGain).toBe(236_000_000);
  });

  // ── 보유기간 분기 ───────────────────────────────────────────────────────
  it("[C40-18a] preApproval branchAcq = 2007-02-01 / branchTransfer = 2023-03-02", () => {
    expect(detail.preApproval.branchAcqDate?.toISOString().slice(0, 10)).toBe("2007-02-01");
    expect(detail.preApproval.branchTransferDate?.toISOString().slice(0, 10)).toBe("2023-03-02");
  });
  it("[C40-18b] settlement branchAcq = 2014-01-23 (★ 인가일, preApproval과 다름)", () => {
    expect(detail.settlement.branchAcqDate?.toISOString().slice(0, 10)).toBe("2014-01-23");
    expect(detail.settlement.branchTransferDate?.toISOString().slice(0, 10)).toBe("2023-03-02");
  });
});
