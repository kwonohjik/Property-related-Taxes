/**
 * 사례 47 — 신축APT 양도 + 청산금 수령 동시신고 (M1)
 *
 * PDF 사례수정 2 (이미지 24~25) — "재건축(재개발)조합의 최초조합원이 청산금을 지급받은 경우"
 *
 * 모드: settlementDirection="receive" + receiveOnlyMode=false + exemptionEligibleAtApproval=true
 * 적용: §166②2호 + §166①2호 가목 + §95③·§160 + 서면2016-법령해석재산-2705
 *
 * 입력 (사례수정 2):
 *   취득일 2001-01-01 / 양도일 2022-03-01 (21년 보유)
 *   취득가 100M / 양도가 20억 / 인가일 2014-02-01 / 평가액 8억 / 청산금 수령 2억
 *   1세대1주택 + 거주 = 보유 21년 + 인가일 평가액 8억 ≤ 12억 → 비과세 차감 활성
 *
 * anchor 18건 (Pre-Do 검증된 산출세액 37,630,000 포함 — 옵션 B 누진공제 19,940,000):
 *
 * PDF 산식 ① (525M·1,400M·175M·25M)             — anchor #1~4
 * 12억 안분 후 3분기 대칭 (gainAfterAllocation·lthdAfterAllocation) — anchor #5~10
 * settlement 비과세 차감 메타                     — anchor #11~13
 * 마스킹 후 total + taxableIncome·taxBase·calculatedTax — anchor #14~18
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case47RedevelopmentInfo } from "./_helpers";

const mockRates = makeMockRates();

describe("사례 47 통합 anchor — 신축APT 양도 + 청산금 수령 동시신고 (M1)", () => {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 2_000_000_000,
    transferDate: new Date("2022-03-01"),
    acquisitionDate: new Date("2001-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 254, // 21년 2개월 (보유 = 거주)
    redevelopment: case47RedevelopmentInfo(),
  });

  const result = calculateTransferTax(input, mockRates);
  const detail = result.redevelopmentDetail!;

  // ──────────────────────────────────────────────────────────
  // [§3.4 흐름 1] 분기 분리 (splitReceive) — PDF 산식 ①
  // ──────────────────────────────────────────────────────────

  it("[anchor 1] preApproval.gain (안분 전) = 525,000,000 — PDF 인가전 양도차익", () => {
    // 안분 전 = 12억 안분 적용 전 값. 단, allocation이 분기.gain 자체를 변경하므로
    // 안분 전 값은 detail.preApproval.gainBeforeAllocation 또는 gainAfterAllocation 보존값으로 확인
    expect(detail.preApproval.gainBeforeAllocation).toBe(525_000_000);
  });

  it("[anchor 2] postApprovalExistingHouse.gain (안분 전) = 1,400,000,000", () => {
    expect(detail.postApprovalExistingHouse.gainBeforeAllocation).toBe(1_400_000_000);
  });

  it("[anchor 3] settlement.gain (안분 전) = 175,000,000 — PDF 청산금 수령 양도차익", () => {
    expect(detail.settlement.gainBeforeAllocation).toBe(175_000_000);
  });

  it("[anchor 4] settlement.apportionedAcquisition = 25,000,000 (1억 × 2/8)", () => {
    expect(detail.settlement.apportionedAcquisition).toBe(25_000_000);
  });

  // ──────────────────────────────────────────────────────────
  // [§3.4 흐름 2] 12억 안분 후 3분기 대칭 — gainAfterAllocation/lthdAfterAllocation
  // ──────────────────────────────────────────────────────────

  it("[anchor 5] preApproval.gainAfterAllocation = 210,000,000 (525M × 8/20)", () => {
    expect(detail.preApproval.gainAfterAllocation).toBe(210_000_000);
  });

  it("[anchor 6] preApproval.lthdAfterAllocation = 168,000,000 (210M × 80%)", () => {
    expect(detail.preApproval.lthdAfterAllocation).toBe(168_000_000);
  });

  it("[anchor 7] postApprovalExistingHouse.gainAfterAllocation = 560,000,000 (1,400M × 8/20)", () => {
    expect(detail.postApprovalExistingHouse.gainAfterAllocation).toBe(560_000_000);
  });

  it("[anchor 8] postApprovalExistingHouse.lthdAfterAllocation = 448,000,000 (560M × 80%)", () => {
    expect(detail.postApprovalExistingHouse.lthdAfterAllocation).toBe(448_000_000);
  });

  it("[anchor 9] settlement.gainAfterAllocation = 70,000,000 (175M × 8/20)", () => {
    expect(detail.settlement.gainAfterAllocation).toBe(70_000_000);
  });

  it("[anchor 10] settlement.lthdAfterAllocation = 21,000,000 (70M × 30% 표1 강등 — 거주월수 귀속 분리)", () => {
    expect(detail.settlement.lthdAfterAllocation).toBe(21_000_000);
  });

  // ──────────────────────────────────────────────────────────
  // [§3.4 흐름 3] settlement 비과세 차감 메타
  // ──────────────────────────────────────────────────────────

  it("[anchor 11] settlementExemptionApplied = true — PDF 사례수정 2 (2)-1번 비과세 적용", () => {
    expect(detail.settlementExemptionApplied).toBe(true);
  });

  it("[anchor 12] exemptedGain = 70,000,000 (= settlement.gainAfterAllocation)", () => {
    expect(detail.exemptedGain).toBe(70_000_000);
  });

  it("[anchor 13] exemptedLthd = 21,000,000 (= settlement.lthdAfterAllocation)", () => {
    expect(detail.exemptedLthd).toBe(21_000_000);
  });

  // ──────────────────────────────────────────────────────────
  // [§3.4 흐름 4-5] 마스킹 후 total + settlement.gain/lthd 0 검증
  // ──────────────────────────────────────────────────────────

  it("[anchor 14] total.gain (마스킹 후) = 770,000,000 (= 210M + 560M, settlement 0)", () => {
    expect(detail.total.gain).toBe(770_000_000);
  });

  it("[anchor 15] total.lthd (마스킹 후) = 616,000,000 (= 168M + 448M, settlement 0)", () => {
    expect(detail.total.lthd).toBe(616_000_000);
  });

  it("settlement.gain·lthd 마스킹 후 0 — 차감 trace는 gainAfterAllocation 보존", () => {
    expect(detail.settlement.gain).toBe(0);
    expect(detail.settlement.lthd).toBe(0);
  });

  // ──────────────────────────────────────────────────────────
  // [§3.4 흐름 6] 양도소득금액 → 과세표준 → 산출세액 (옵션 B)
  // ──────────────────────────────────────────────────────────

  it("[anchor 16] result.taxableIncome (양도소득금액) = 154,000,000 (= 770M − 616M)", () => {
    expect(detail.total.taxableIncome).toBe(154_000_000);
  });

  it("[anchor 17] result.taxBase (과세표준) = 151,500,000 (= 154M − 기본공제 2.5M)", () => {
    expect(result.taxBase).toBe(151_500_000);
  });

  it("[anchor 18] result.calculatedTax (산출세액) = 37,630,000 (151.5M × 38% − 19,940,000)", () => {
    expect(result.calculatedTax).toBe(37_630_000);
  });

  // ──────────────────────────────────────────────────────────
  // 부가 — taxableGain (12억 안분 후 합계), highValueAllocation 메타
  // ──────────────────────────────────────────────────────────

  it("result.taxableGain = 770,000,000 (12억 안분 + 비과세 차감 반영)", () => {
    expect(result.taxableGain).toBe(770_000_000);
  });

  it("highValueAllocation 부착 — 12억 안분 활성 검증", () => {
    expect(detail.highValueAllocation).toBeDefined();
    expect(detail.highValueAllocation?.nontaxableThreshold).toBe(1_200_000_000);
    expect(detail.highValueAllocation?.taxableRatio).toBeCloseTo(0.4, 5); // 8/20
  });

  it("CalculationStep — 비과세 차감 라벨 emit 확인", () => {
    const step = result.steps.find((s) =>
      s.label === "청산금 수령분 1세대1주택 비과세 차감",
    );
    expect(step).toBeDefined();
    expect(step?.amount).toBe(-(70_000_000 - 21_000_000)); // = -49,000,000
  });
});
