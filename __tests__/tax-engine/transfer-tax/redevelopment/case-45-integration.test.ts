/**
 * 사례 45 — APT-실가-납부-주택출자 / 1세대1주택 + 12억 초과 + 거주월수 귀속 분리
 *
 * 본 spec 은 transfer-tax.ts 의 calculateTransferTax() 진입점을 통해 redevelopment 분기 라우팅
 * → STEP 3 (12억 안분) 활성 → 분기별 LTHD 거주귀속 분리 (§155⑰ + 사전법령해석재산 2020-386)
 *
 * ★ Primary anchor (양도코리아 xlsx C26·C29·C31 원단위 정합 — PDF p6 표기와 1원 차이는 PDF 단수 오차):
 *   전체 양도차익:    740,999,999  (1,500M − 750M − 9M, 단수 1)
 *   비과세 양도차익:  592,800,000  (= 740,999,999 − floor(740,999,999 × 0.2))
 *   과세대상 양도차익: 148,199,999  (분기별 floor 합 — 40M + 74,031,578 + 34,168,421)
 *   LTHD 합계:        74,569,261  (24M + 44,418,946 + 6,150,315)
 *   양도소득금액:     73,630,738
 *   기본공제:          2,500,000
 *   과세표준:         71,130,738
 *   산출세액:         11,311,377  (xlsx C26)
 *   지방소득세:        1,131,137
 *   세액합계:         12,442,514  (xlsx C31 = 12,442,514.7)
 *
 * 거주월수 귀속 (사전법령해석재산 2020-386 + 시행령 §155⑰):
 *   기존건물분 거주월수 = prior(66) + new(0) = 66 → 5년 → 표2 진입
 *   청산금분 거주월수    = new(0) = 0 → < 24 → 표1 강등
 *   기존건물분 LTHD율 = 60% (보유 15년 40% 캡 + 거주 5년 20%)
 *   청산금분 LTHD율   = 18% (보유 9년 × 2%)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case45RedevelopmentInfo } from "./_helpers";

const mockRates = makeMockRates();

describe("사례 45 통합 anchor — APT 1세대1주택 12억 초과 + 거주월수 귀속 분리 (C-4)", () => {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2007-04-09"),
    acquisitionPrice: 450_000_000,
    expenses: 9_000_000,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 66,
    redevelopment: case45RedevelopmentInfo(),
  });

  const result = calculateTransferTax(input, mockRates);

  it("redevelopmentDetail 부착 (분기 라우팅 활성)", () => {
    expect(result.redevelopmentDetail).toBeDefined();
  });

  it("highValueAllocation 부착 (12억 초과 분기 활성)", () => {
    expect(result.redevelopmentDetail?.highValueAllocation).toBeDefined();
    expect(result.redevelopmentDetail?.highValueAllocation?.nontaxableThreshold).toBe(1_200_000_000);
    expect(result.redevelopmentDetail?.highValueAllocation?.taxableRatio).toBeCloseTo(0.2, 5);
  });

  it("lthdResidenceAttribution 부착 — 기존건물분 통산 / 청산금분 신축만", () => {
    const attr = result.redevelopmentDetail?.lthdResidenceAttribution;
    expect(attr).toBeDefined();
    expect(attr?.existingResidenceMonths).toBe(66); // prior 66 + new 0
    expect(attr?.payResidenceMonths).toBe(0);       // new only
    expect(attr?.existingTable).toBe("table2");     // 1세대1주택 + 거주 5년 ≥ 2년
    expect(attr?.payTable).toBe("table1");          // 신축거주 0 < 2년 → 강등
  });

  it("LTHD 분기별 율 — 기존건물분 60% (표2) / 청산금분 18% (표1)", () => {
    expect(result.redevelopmentDetail?.preApproval.lthdRate).toBeCloseTo(0.6, 5);
    expect(result.redevelopmentDetail?.postApprovalExistingHouse.lthdRate).toBeCloseTo(0.6, 5);
    expect(result.redevelopmentDetail?.settlement.lthdRate).toBeCloseTo(0.18, 5);
  });

  it("분기별 LTHD 금액 — preApproval 24M / postApproval 44,418,946 / settlement 6,150,315", () => {
    expect(result.redevelopmentDetail?.preApproval.lthd).toBe(24_000_000);
    expect(result.redevelopmentDetail?.postApprovalExistingHouse.lthd).toBe(44_418_946);
    expect(result.redevelopmentDetail?.settlement.lthd).toBe(6_150_315);
  });

  it("LTHD 합계 74,569,261", () => {
    expect(result.redevelopmentDetail?.total.lthd).toBe(74_569_261);
  });

  it("12억 안분 — 비과세 양도차익 592,800,000 / 과세대상 양도차익 합계 148,199,999", () => {
    expect(result.redevelopmentDetail?.highValueAllocation?.nontaxableGain).toBe(592_800_000);
    expect(result.redevelopmentDetail?.total.gain).toBe(148_199_999);
  });

  it("기본공제 2,500,000", () => {
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("과세표준 71,130,738", () => {
    expect(result.taxBase).toBe(71_130_738);
  });

  it("산출세액 11,311,377 (xlsx C26 정합)", () => {
    expect(result.calculatedTax).toBe(11_311_377);
  });

  it("지방소득세 1,131,137 (산출세액 × 10%, 원미만 절사)", () => {
    expect(result.localIncomeTax).toBe(1_131_137);
  });

  it("세액합계 12,442,514 (xlsx C31 정합)", () => {
    expect(result.totalTax).toBe(12_442_514);
  });
});
