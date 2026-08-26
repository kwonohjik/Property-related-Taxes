/**
 * C42 anchor — 사례 42: APT 양도 + 청산금 수령 + 토지 출자 (실가 모드)
 *
 * PDF 출처: 사례 42 — 재개발 아파트(청산금 수령): 토지출자, 취득실거래가 확인되는 경우
 * 법령 근거: 시행령 §166②2호 (§166①2호 가목·나목 준용) — 청산금 수령
 *
 * 입력:
 *   - 양도가액: 525,000,000 (2023-03-02 잔금)
 *   - 권리가액(평가액): 500,000,000 (관리처분인가일: 2009-10-23)
 *   - 청산금 수령액: 114,000,000
 *   - 분양가 = 권리가 − 청산금 = 386,000,000
 *   - 종전 토지 취득가액(실가): 200,000,000 (2002-04-09)
 *   - originalAssetType: "land" (토지 출자)
 *
 * PDF 산식 (§166②2호 = §166①2호 준용, settlement 별도 분기 없음):
 *   ① 종전부동산양도차익 = (5억 − 2억) × {(5억 − 1.14억) / 5억} = 300M × 0.772 = 231,600,000
 *   ② 청산금수령분(=인가후 분) = 5.25억 − (5억 − 1.14억) = 525M − 386M = 139,000,000
 *   ③ 장기보유공제 = (231.6M + 139M) × 30% (15년+) = 111,180,000
 *   ④ 양도소득금액 = 370,600,000 − 111,180,000 = 259,420,000
 *
 * 엔진 3분할 매핑:
 *   preApproval                  = 인가전 분 = 231,600,000 (PDF ①)
 *   postApprovalExistingHouse    = 인가후 분 = 139,000,000 (PDF ②)
 *   settlement                   = 0       (★ 사례 42 정정 — land 분기는 별도 분기 없음)
 *
 * LTHD (§166⑤2호나목):
 *   preApproval/postApprovalExistingHouse: 묶음 동일 30% (취득일~양도일 약 20년 10월)
 *   settlement: 0 (gain=0이라 LTHD도 0)
 *
 * 합계: gain=370,600,000 / lthd=111,180,000 / taxableIncome=259,420,000 (PDF 일치)
 *
 * Pre-Do 검증 (2026-05-17): runOriginalMember + computeAptReceive 의 `originalAssetType="land"`
 * 분기 settlement 산식 정정 (project_case_42_apt_receive_land).
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

function case42RedevInfo(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2009-10-23"),
    rightsValue: 500_000_000,
    settlementDirection: "receive",
    settlementAmount: 114_000_000,
    settlementSaleDate: new Date("2023-03-02"), // 청산금 수령 시 §95④ 필수
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "land",
  };
}

function case42Input(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 200_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: case42RedevInfo(),
  });
}

describe("C42 — 사례 42: APT+receive+land 실가 (§166②2호·§166①2호)", () => {
  const input = case42Input();
  const result = calculateTransferTax(input, mockRates);
  const detail = result.redevelopmentDetail!;

  // ── 분기 라우팅 ──────────────────────────────────────────────────────────
  it("[C42-0] redevelopmentDetail 부착 + valuationMeta.method = actual", () => {
    expect(detail).toBeDefined();
    expect(detail.valuationMeta?.method).toBe("actual");
  });

  // ── preApproval (PDF ① 종전부동산양도차익) ──────────────────────────────
  it("[C42-1] preApproval.gain = 231,600,000 (= 300M × 386/500)", () => {
    expect(detail.preApproval.gain).toBe(231_600_000);
  });
  it("[C42-2] preApproval.apportionedTransfer = 386,000,000 (분양가 = 권리가 − 청산금)", () => {
    expect(detail.preApproval.apportionedTransfer).toBe(386_000_000);
  });
  it("[C42-3] preApproval.apportionedAcquisition = 154,400,000 (= 200M × 386/500)", () => {
    expect(detail.preApproval.apportionedAcquisition).toBe(154_400_000);
  });

  // ── postApprovalExistingHouse (PDF ② 청산금수령분 = 인가후 분) ──────────
  it("[C42-4] postApprovalExistingHouse.gain = 139,000,000 (= 525M − 386M)", () => {
    expect(detail.postApprovalExistingHouse.gain).toBe(139_000_000);
  });
  it("[C42-5] postApprovalExistingHouse.apportionedTransfer = 525,000,000", () => {
    expect(detail.postApprovalExistingHouse.apportionedTransfer).toBe(525_000_000);
  });
  it("[C42-6] postApprovalExistingHouse.apportionedAcquisition = 386,000,000 (분양가)", () => {
    expect(detail.postApprovalExistingHouse.apportionedAcquisition).toBe(386_000_000);
  });

  // ── settlement (★ 사례 42 정정 — land 분기는 별도 분기 없음) ────────────
  it("[C42-7] settlement.gain = 0 (★ §166②2호 표준 해석 — 청산금 별도 양도사건 없음)", () => {
    expect(detail.settlement.gain).toBe(0);
  });
  it("[C42-8] settlement.apportionedTransfer = 0 (land 분기 settlement 자체 없음)", () => {
    expect(detail.settlement.apportionedTransfer).toBe(0);
  });
  it("[C42-9] settlement.apportionedAcquisition = 0", () => {
    expect(detail.settlement.apportionedAcquisition).toBe(0);
  });
  it("[C42-10] settlement.lthd = 0 (gain=0 → LTHD=0)", () => {
    expect(detail.settlement.lthd).toBe(0);
  });

  // ── 합계 (PDF 일치) ──────────────────────────────────────────────────────
  it("[C42-11] total.gain = 370,600,000 (PDF 합산 양도차익)", () => {
    expect(detail.total.gain).toBe(370_600_000);
  });
  it("[C42-12] preApproval.lthdRate = 0.30 (§166⑤2호나목 묶음 동일률, 15년+ 표1 30%)", () => {
    expect(detail.preApproval.lthdRate).toBeCloseTo(0.30, 5);
  });
  it("[C42-13] postApprovalExistingHouse.lthdRate = 0.30 (묶음 동일률)", () => {
    expect(detail.postApprovalExistingHouse.lthdRate).toBeCloseTo(0.30, 5);
  });
  it("[C42-14] preApproval.lthd = 69,480,000 (= 231.6M × 30%)", () => {
    expect(detail.preApproval.lthd).toBe(69_480_000);
  });
  it("[C42-15] postApprovalExistingHouse.lthd = 41,700,000 (= 139M × 30%)", () => {
    expect(detail.postApprovalExistingHouse.lthd).toBe(41_700_000);
  });
  it("[C42-16] total.lthd = 111,180,000 (PDF ③ 장기보유공제)", () => {
    expect(detail.total.lthd).toBe(111_180_000);
  });
  it("[C42-17] total.taxableIncome = 259,420,000 (PDF ④ 양도소득금액)", () => {
    expect(detail.total.taxableIncome).toBe(259_420_000);
  });

  // ── 자기일관성 ───────────────────────────────────────────────────────────
  it("[C42-18] total.gain = preApproval + postApprovalExistingHouse + settlement", () => {
    expect(detail.total.gain).toBe(
      detail.preApproval.gain +
        detail.postApprovalExistingHouse.gain +
        detail.settlement.gain,
    );
  });
});
