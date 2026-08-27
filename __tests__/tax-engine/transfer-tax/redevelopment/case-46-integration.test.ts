/**
 * 사례 46 — APT-실가-수령-주택출자 / 1세대1주택자 청산금 수령분 단독 신고
 *
 * 본 spec 은 transfer-tax.ts 의 calculateTransferTax() 진입점을 통해 redevelopment 분기 라우팅
 * → receiveOnlyMode 분기: 인가전·인가후 양도차익 0 강제, settlement 단독 산정
 *   (근거는 §166①2호 가목이 **아니라** 종전 부동산의 **분할양도** — 아래 법령 근거 참조)
 * → exemptionEligibleAtApproval=false: LTHD 표1 강등 (서면2016-법령해석재산-2705)
 *
 * ★ Primary anchor (예제 D 열 원단위):
 *   양도가액(청산금 수령액): 500,000,000  (D12)
 *   안분 취득가액:           133,333,333  (D13 = INT(4억 × 5억 / 15억))
 *   양도차익:                366,666,667  (D15)
 *   LTHD (6년 9월, 표1 12%):  44,000,000  (D17)
 *   양도소득금액:            322,666,667  (C18)
 *   과세표준:                320,166,667  (C25)
 *   산출세액:                102,126,666  (C26)
 *   지방소득세:               10,212,666  (C29)
 *   세액합계:                112,339,332  (C31)
 *
 * 법령 근거:
 *   - 법 §88·§95①·§100 + 국세청 **법규재산2012-358**(2012.11.09) — 청산금은 종전 부동산의
 *     **분할양도**에 해당하여 별개의 양도소득세 과세대상. 평가액은 시행령 §166④1호.
 *   - 기획재정부 재산-439 (2014.06.09) — LTHD 보유기간 = 취득일~양도일
 *   - 서면2016-법령해석재산-2705 (2016.09.12) — 비과세 판정 시점 = 관리처분계획인가일
 *   - 소법 시행령 §154① — 1세대1주택 2년 보유 요건
 *   - NTS 집행기준 — 양도시기 = 소유권이전 고시일 익일
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case46RedevelopmentInfo } from "./_helpers";

const mockRates = makeMockRates();

describe("사례 46 통합 anchor — APT 1세대1주택자 청산금 수령분 단독 신고 (C-3)", () => {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 500_000_000, // 청산금 수령액 = 양도가액 (receiveOnly 미러)
    transferDate: new Date("2023-02-17"), // 소유권이전 고시일 익일
    acquisitionDate: new Date("2016-05-06"),
    acquisitionPrice: 400_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true, // 1세대1주택자
    householdHousingCount: 1,
    residencePeriodMonths: 0, // 거주요건 불요 (2017.8.3 이전 취득)
    redevelopment: case46RedevelopmentInfo(),
  });

  const result = calculateTransferTax(input, mockRates);

  it("redevelopmentDetail 부착 (분기 라우팅 활성)", () => {
    expect(result.redevelopmentDetail).toBeDefined();
  });

  it("receiveOnlyMode 플래그 결과 부착 — DetailedStatementFormulaBuilders 라벨 분기 신호", () => {
    expect(result.redevelopmentDetail?.receiveOnlyMode).toBe(true);
  });

  it("receiveOnly 모드 — 인가전·인가후 양도차익 0 강제", () => {
    expect(result.redevelopmentDetail?.preApproval.gain).toBe(0);
    expect(result.redevelopmentDetail?.postApprovalExistingHouse.gain).toBe(0);
  });

  it("settlement 분기 — 분할양도의 양도가액(청산금)·안분취득가액·양도차익", () => {
    expect(result.redevelopmentDetail?.settlement.apportionedTransfer).toBe(500_000_000);   // D12
    expect(result.redevelopmentDetail?.settlement.apportionedAcquisition).toBe(133_333_333); // D13
    expect(result.redevelopmentDetail?.settlement.gain).toBe(366_666_667);                  // D15
  });

  it("LTHD 표1 강등 — 보유 6년 × 2% = 12%, 거주분 0 (exemptionEligibleAtApproval=false)", () => {
    expect(result.redevelopmentDetail?.settlement.lthdRate).toBeCloseTo(0.12, 5);
    expect(result.redevelopmentDetail?.settlement.lthd).toBe(44_000_000);                   // D17
    expect(result.redevelopmentDetail?.settlement.lthdResidencePart).toBe(0);
  });

  it("보유기간 표시 — 6년 9월 10일 (holdingMonths=81 + holdingDays=10, date-fns DATEDIF)", () => {
    expect(result.redevelopmentDetail?.settlement.holdingMonths).toBe(81); // 6년 × 12 + 9월
    expect(result.redevelopmentDetail?.settlement.holdingDays).toBe(10);   // 2016-05-06 → 2023-02-17 = 6년 9월 10일 (date-fns 산정)
  });

  it("12억 안분 비활성화 (exemptionEligibleAtApproval=false → 전부 과세)", () => {
    expect(result.redevelopmentDetail?.highValueAllocation).toBeUndefined();
  });

  it("xlsx anchor — 양도차익 / 양도소득금액 / 과세표준 / 산출세액", () => {
    expect(result.taxableGain).toBe(366_666_667);            // D15 (과세대상 양도차익)
    expect(result.longTermHoldingDeduction).toBe(44_000_000); // D17 (LTHD)
    // 양도소득금액 = taxableGain − LTHD (별도 필드 없음 — 직접 계산)
    expect(result.taxableGain - result.longTermHoldingDeduction).toBe(322_666_667); // C18
    expect(result.taxBase).toBe(320_166_667);                // C25
    expect(result.calculatedTax).toBe(102_126_666);          // C26
  });

  it("xlsx anchor — 지방소득세 / 세액합계", () => {
    expect(result.localIncomeTax).toBe(10_212_666);  // C29
    expect(result.totalTax).toBe(112_339_332);       // C31
  });

  it("총 양도차익 = settlement 분기만 (preApproval + postApproval = 0)", () => {
    const detail = result.redevelopmentDetail!;
    const totalGain =
      detail.preApproval.gain + detail.postApprovalExistingHouse.gain + detail.settlement.gain;
    expect(totalGain).toBe(366_666_667);
  });
});
