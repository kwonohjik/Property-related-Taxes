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
 * 🔴 2026-08-27 — **예제 자료의 답을 조문·국세청 해석으로 뒤집었다 (세액 변경)**
 *
 * 예제 자료는 청산금 상당분(68,400,000)을 **양도차익에서 누락**했다. 그 자료는 애초에
 * **자기 자료끼리 답이 달라**(설계문서 `transfer-tax-redevelopment.engine.design.md:31` 행 #7
 * 「xlsx 교재 답 상이 → anchor 보류」) 판정 근거가 될 수 없었고, 같은 문서 `:509`가 해소 경로를
 * **「국세청 해석례」** 로 이미 지목해 뒀다. 그 해석례를 확보해 종결한다.
 *
 * | 해석 | 연도 | 요지 |
 * |---|---|---|
 * | **재일46014-2870** | 1997.12.08 | 재건축조합에게 **토지 등**을 양도하고 청산금을 교부받는 경우 **양도에 해당**되어 과세대상 |
 * | **재일46014-2104** | 1999.12.13 | **토지·건물**의 대가로 권리와 청산금을 교부받은 경우, 청산금 상당 종전 **토지·건물은 유상이전** |
 * | **법규재산2012-358** | 2012.11.09 | 청산금은 종전 주택의 **분할양도** |
 *
 * 조문도 같다 — **§166①은 「건물 또는 토지만을 제공한 경우를 포함한다」** 를 명시하고,
 * 청산금 상당분을 배제하는 §166①2호 **나목의 안분은 자산 종류를 가리지 않는다**.
 *
 * 산식 (§166②2호 = §166①2호 + 분할양도):
 *   ① 나목(인가전 분)   = (5억 − 2억) × {(5억 − 1.14억) / 5억} = 300M × 0.772 = 231,600,000
 *   ② 가목(인가후 분)   = 5.25억 − (5억 − 1.14억) = 525M − 386M            = 139,000,000
 *   ③ 청산금분(분할양도) = 1.14억 − 2억 × (1.14억/5억) = 114M − 45.6M       =  68,400,000
 *   ─────────────────────────────────────────────────────
 *   합계 양도차익 = 439,000,000  ( = 양도가 5.25억 + 청산금 1.14억 − 취득가 2억, 경제적 실질과 일치)
 *
 * 🔑 **항등식**: 나목 + 청산금분 = 231,600,000 + 68,400,000 = **300,000,000 = 평가액 − 취득가액**.
 *    종전에는 나목만 남아 이 항등식이 깨져 있었다(예제 자료의 누락이 그대로 고정돼 있었다).
 *
 * LTHD (§166⑤2호나목 · 취득일~양도일 약 20년 10월 → 표1 30%):
 *   나목 69,480,000 + 가목 41,700,000 + 청산금분 20,520,000 = **131,700,000**
 *   양도소득금액 = 439,000,000 − 131,700,000 = **307,300,000**
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

  // ── settlement = 청산금 분할양도 (재일46014-2870·2104 · 법규재산2012-358) ──
  it("[C42-7] settlement.gain = 68,400,000 (1.14억 − 45.6억분의 안분취득가)", () => {
    expect(detail.settlement.gain).toBe(68_400_000);
  });
  it("[C42-8] settlement.apportionedTransfer = 114,000,000 (청산금 수령액 = 분할양도의 양도가액)", () => {
    expect(detail.settlement.apportionedTransfer).toBe(114_000_000);
  });
  it("[C42-9] settlement.apportionedAcquisition = 45,600,000 (2억 × 1.14억 ÷ 5억)", () => {
    expect(detail.settlement.apportionedAcquisition).toBe(45_600_000);
  });
  it("[C42-10] settlement.lthd = 20,520,000 (68.4M × 30%)", () => {
    expect(detail.settlement.lthd).toBe(20_520_000);
  });
  it("[C42-7b] 🔑 항등식 — 나목 + 청산금분 = 평가액 − 취득가액", () => {
    expect(detail.preApproval.gain + detail.settlement.gain).toBe(500_000_000 - 200_000_000);
  });

  // ── 합계 (PDF 일치) ──────────────────────────────────────────────────────
  it("[C42-11] total.gain = 439,000,000 (= 양도가 + 청산금 − 취득가, 경제적 실질과 일치)", () => {
    expect(detail.total.gain).toBe(439_000_000);
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
  it("[C42-16] total.lthd = 131,700,000 (69,480,000 + 41,700,000 + 20,520,000)", () => {
    expect(detail.total.lthd).toBe(131_700_000);
  });
  it("[C42-17] total.taxableIncome = 307,300,000 (439,000,000 − 131,700,000)", () => {
    expect(detail.total.taxableIncome).toBe(307_300_000);
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
