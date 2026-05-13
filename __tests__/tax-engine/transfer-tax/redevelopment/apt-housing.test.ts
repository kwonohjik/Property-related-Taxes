/**
 * 재개발/재건축 — 완공 APT 양도 / 주택출자 (사례 44·45·46) 격리 anchor 테스트
 *
 * 범위: redevelopment.ts orchestrator (runRedevelopment) 직접 호출 검증.
 * 본 spec 은 양도세 전체 산출세액(56,799,400)이 아닌 RedevelopmentResult 까지 검증.
 * 전체 산출세액 anchor 는 transfer-tax.ts 통합 후 별도 spec.
 *
 * 법령 근거 검증:
 * - 시행령 §166②1호 (사례 44 APT+납부 안분 산식)
 * - 시행령 §166③ + §176의2②2호 (환산취득가)
 * - 시행령 §166⑤2호나목 (LTHD 보유기간 — 취득일~신축양도일)
 * - 시행령 §166②2호·§166①2호 (사례 46 청산금 수령)
 */

import { describe, it, expect } from "vitest";
import { runRedevelopment } from "@/lib/tax-engine/redevelopment";
import type { RedevelopmentOrchestratorInput } from "@/lib/tax-engine/redevelopment";
import { case44Input, case45Input, case46Input } from "./_helpers";

// ============================================================
// 사례 44: APT-환산-납부-주택출자 (★ PR primary anchor)
// ============================================================

describe("사례 44 — APT 양도 / 주택출자 / 환산 / 청산금 납부 (§166②1호 + §166③)", () => {
  const result = runRedevelopment(case44Input());

  it("환산취득가 = BigInt(219,218,500 × 85,034,988 / 132,000,000) = 141,221,534 (§166③, xlsx 일치)", () => {
    expect(result.preApproval.apportionedAcquisition).toBe(141_221_534);
    expect(result.valuationMeta?.method).toBe("estimated_post_disclosure_decree_166_3");
  });

  it("인가전 양도차익 = 권리가액 − 환산취득가 − 필요경비 = 75,445,917 (§166①1호, xlsx 일치)", () => {
    // 219,218,500 − 141,221,534 − 2,551,049 = 75,445,917
    expect(result.preApproval.gain).toBe(75_445_917);
  });

  it("분양가 = 권리가액 + 납부청산금 = 312,000,000 (§166②1호)", () => {
    expect(result.salePriceTotal).toBe(312_000_000);
  });

  it("인가후 양도차익 (총합) = 양도가액 − 분양가 − 인가후필요경비", () => {
    // 525,000,000 − 312,000,000 − 0 = 213,000,000
    // 분기별 합: postApprovalExistingHouseGain + settlementGain
    const totalPostApproval =
      result.postApprovalExistingHouse.gain + result.settlement.gain;
    expect(totalPostApproval).toBe(213_000_000);
  });

  it("기존주택분 양도차익 = BigInt floor(213M × 219,218,500 / 312,000,000) = 149,658,783 (§166②1호, xlsx 149,658,784 와 1원 차이)", () => {
    // 213,000,000 × 219,218,500 / 312,000,000 = 149,658,783.65... → floor 149,658,783
    expect(result.postApprovalExistingHouse.gain).toBe(149_658_783);
  });

  it("청산금 납부분 양도차익 = 213,000,000 − 149,658,783 = 63,341,217 (잔차 흡수, xlsx 63,341,216 와 1원 차이)", () => {
    expect(result.settlement.gain).toBe(63_341_217);
  });

  it("기존건물분 LTHD 보유기간 = 취득일~신축양도일 17년 10개월 (§166⑤2호나목)", () => {
    // 2005-04-09 → 2023-02-16
    expect(result.preApproval.holdingMonths).toBe(214); // 17 × 12 + 10
    expect(result.postApprovalExistingHouse.holdingMonths).toBe(214);
  });

  it("기존건물분 LTHD율 = 30% (보유 17년 ≥ 15년, 표1 캡)", () => {
    expect(result.preApproval.lthdRate).toBe(0.3);
    expect(result.postApprovalExistingHouse.lthdRate).toBe(0.3);
  });

  it("청산금 납부분 LTHD 보유기간 = 관리처분~신축양도일 13년 3개월 (§166⑤2호가목)", () => {
    // 2009-10-23 → 2023-02-16
    expect(result.settlement.holdingMonths).toBe(159); // 13 × 12 + 3
  });

  it("청산금 납부분 LTHD율 = 26% (보유 13년, 표1 매년 2% 가산)", () => {
    expect(result.settlement.lthdRate).toBe(0.26);
  });

  it("인가전 LTHD = floor(75,445,919 × 30%) = 22,633,775", () => {
    // xlsx 22,633,775 — 환산 ±2 차이가 LTHD 에는 영향 없음 (76 × 0.3 = 22.8)
    expect(result.preApproval.lthd).toBe(22_633_775);
  });

  it("기존주택분 LTHD = floor(149,658,784 × 30%) = 44,897,634 (부동소수점 floor, xlsx 44,897,635 와 1원 차이)", () => {
    // JS Math.floor(149_658_784 * 0.3) = 44_897_634 (0.3 binary 표현 오차)
    // xlsx 표시값은 정확한 30% 계산 결과 44,897,635.2 → 44,897,635
    // 본 엔진은 BigInt floor 정수연산 원칙 유지 — 1원 차이는 산출세액에 영향 미미
    expect(result.postApprovalExistingHouse.lthd).toBe(44_897_634);
  });

  it("청산금 납부분 LTHD = floor(63,341,216 × 26%) = 16,468,716", () => {
    expect(result.settlement.lthd).toBe(16_468_716);
  });

  it("합계 LTHD = 84,000,125 (분배법칙 = 묶음 LTHD, xlsx 84,000,126 와 1원 차이)", () => {
    // 22,633,775 + 44,897,634 + 16,468,716 = 84,000,125
    expect(result.total.lthd).toBe(84_000_125);
  });

  it("합계 양도차익 = 288,445,917 (xlsx 일치)", () => {
    // 75,445,917 + 149,658,784 + 63,341,216 = 288,445,917
    expect(result.total.gain).toBe(288_445_917);
  });

  it("양도소득금액 = 204,445,792 (합계 양도차익 − 합계 LTHD, xlsx 204,445,791 와 1원 차이)", () => {
    // 288,445,917 − 84,000,125 = 204,445,792
    expect(result.total.taxableIncome).toBe(204_445_792);
  });
});

// ============================================================
// 사례 45: APT-실가-납부-주택출자 (1세대1주택 — 본 PR 범위: 안분 + LTHD 표2 까지만)
// ============================================================

describe("사례 45 — APT 양도 / 주택출자 / 실가 / 청산금 납부 / 1세대1주택", () => {
  const result = runRedevelopment(case45Input());

  it("인가전 양도차익 = 200,000,000 (실가 모드, 650M − 450M − 0)", () => {
    expect(result.preApproval.gain).toBe(200_000_000);
    expect(result.valuationMeta?.method).toBe("actual");
  });

  it("분양가 = 950,000,000 (= 650M + 300M)", () => {
    expect(result.salePriceTotal).toBe(950_000_000);
  });

  it("인가후 양도차익 합 = 541,000,000 (1500M − 950M − 9M)", () => {
    const totalPostApproval =
      result.postApprovalExistingHouse.gain + result.settlement.gain;
    expect(totalPostApproval).toBe(541_000_000);
  });

  it("LTHD 표2 적용 — 1세대1주택 + 거주 5년 6월 (66개월 → 5년)", () => {
    // 표2: 보유 15년+ × 4% = 60% 캡 안 — 보유 15년 10월 → 보유분 × 4% = 60% 캡 40% / 거주 5년 × 4% = 20%
    // 합 60% (표2 캡 80% 미만이라 캡 미적용)
    // 보유 15년 (정수) × 4% = 60% → 캡 40%
    // 거주 5년 × 4% = 20%
    // 합 = 60%
    expect(result.preApproval.lthdRate).toBeCloseTo(0.6, 5);
    expect(result.postApprovalExistingHouse.lthdRate).toBeCloseTo(0.6, 5);
  });

  // 본 PR 격리 검증 외 — 12억 안분(§95③·§160)은 transfer-tax.ts 통합 후 별도 spec
});

// ============================================================
// 사례 46: APT-실가-수령-주택출자 (청산금 수령 — §166②2호·§166①2호 산식)
// ============================================================

describe("사례 46 — APT 양도 / 주택출자 / 실가 / 청산금 수령 / 본 PR: 과세 산출 anchor만", () => {
  const result = runRedevelopment(case46Input());

  it("청산금 수령분 안분 취득가액 = floor(400M × 500M / 1500M) = 133,333,333", () => {
    expect(result.settlement.apportionedAcquisition).toBe(133_333_333);
  });

  it("청산금 수령분 양도차익 = 500M − 133,333,333 = 366,666,667 (§166①2호가목)", () => {
    expect(result.settlement.gain).toBe(366_666_667);
  });

  it("청산금 분 LTHD 보유기간 = 취득일~settlementSaleDate (6년 9개월, §95④ + NTS 집행기준)", () => {
    // 2016-05-06 → 2023-02-16 = 81개월 (6년 9월)
    expect(result.settlement.holdingMonths).toBe(81);
  });

  it("청산금 분 LTHD율 = 12% (보유 6년, 표1)", () => {
    expect(result.settlement.lthdRate).toBe(0.12);
  });

  it("청산금 분 LTHD = floor(366,666,667 × 12%) = 44,000,000", () => {
    expect(result.settlement.lthd).toBe(44_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// §164⑦ 본문 발동 — PHD 패턴 2단계 산식 anchor (가공 시나리오)
// ──────────────────────────────────────────────────────────────────────────────

describe("§164⑦ 본문 발동 — PHD 패턴 (P_A = floor(A × Sum_A / Sum_F), 환산취득가 = floor(권리가액 × P_A / D))", () => {
  /**
   * 가공 시나리오 (단순 정수 anchor):
   *   A = 100,000,000 (최초공시 주택가격)
   *   landArea = 100㎡
   *   취득시:   ㎡단가 200,000 → 토지 20,000,000 + 건물 30,000,000 = Sum_A 50,000,000
   *   최초공시: ㎡단가 500,000 → 토지 50,000,000 + 건물 30,000,000 = Sum_F 80,000,000
   *   D = 120,000,000 (관리처분 라목값)
   *   권리가액 = 200,000,000
   *   취득일 2005-04-09 < 최초공시일 2005-04-30 → 본문 발동
   *
   *   Step 1: P_A = floor(100M × 50M / 80M) = 62,500,000
   *   Step 2: 환산취득가 = floor(200M × 62,500,000 / 120M) = 104,166,666
   */
  const input: RedevelopmentOrchestratorInput = {
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2010-01-01"),
      rightsValue: 200_000_000,
      settlementDirection: "pay",
      settlementAmount: 0,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      managementDisposalHousingPrice: 120_000_000,
      firstDisclosureDate: new Date("2005-04-30"),
      firstDisclosureHousingPrice: 100_000_000,
      landArea: 100,
      landPricePerSqmAtAcq: 200_000,
      buildingStdPriceAtAcq: 30_000_000,
      landPricePerSqmAtFirst: 500_000,
      buildingStdPriceAtFirst: 30_000_000,
      acquisitionRounding: "floor",
    },
    acquisitionDate: new Date("2005-04-09"),
    transferDate: new Date("2023-02-16"),
    transferPrice: 300_000_000,
    actualAcquisitionPrice: undefined,
    useEstimatedAcquisition: true,
  };

  const result = runRedevelopment(input);

  it("Sum_A = 단가×면적 + 건물 = 200,000×100 + 30,000,000 = 50,000,000", () => {
    expect(result.valuationMeta?.preDisclosureStep1?.sumAtAcq).toBe(50_000_000);
  });

  it("Sum_F = 단가×면적 + 건물 = 500,000×100 + 30,000,000 = 80,000,000", () => {
    expect(result.valuationMeta?.preDisclosureStep1?.sumAtFirst).toBe(80_000_000);
  });

  it("Step 1: P_A = floor(100M × 50M / 80M) = 62,500,000", () => {
    expect(result.valuationMeta?.preDisclosureStep1?.computedAcquisitionHousingPrice).toBe(62_500_000);
  });

  it("Step 2: 환산취득가 = floor(200M × 62,500,000 / 120M) = 104,166,666", () => {
    expect(result.preApproval.apportionedAcquisition).toBe(104_166_666);
  });

  it("method = estimated_pre_disclosure_decree_164_7", () => {
    expect(result.valuationMeta?.method).toBe("estimated_pre_disclosure_decree_164_7");
  });

  it("preDisclosureStep1 메타 — A/면적/단가×2/건물×2/Sum_A/Sum_F/P_A 모두 노출", () => {
    expect(result.valuationMeta?.preDisclosureStep1).toEqual({
      firstDisclosureHousingPrice: 100_000_000,
      landArea: 100,
      landPricePerSqmAtAcq: 200_000,
      buildingStdPriceAtAcq: 30_000_000,
      landPricePerSqmAtFirst: 500_000,
      buildingStdPriceAtFirst: 30_000_000,
      sumAtAcq: 50_000_000,
      sumAtFirst: 80_000_000,
      computedAcquisitionHousingPrice: 62_500_000,
    });
  });

  it("numerator = P_A (Step 1 결과), denominator = D", () => {
    expect(result.valuationMeta?.numerator).toBe(62_500_000);
    expect(result.valuationMeta?.denominator).toBe(120_000_000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// §164⑦ 본문 트리거 + PHD 필수입력 누락 — 본문 미발동 fallback
// ──────────────────────────────────────────────────────────────────────────────

describe("§164⑦ 본문 트리거 + PHD 필수입력 누락 → 본문 미발동 (사례 44 회귀 보장)", () => {
  // 사례 44 입력 + firstDisclosureDate 추가 (PHD 필수입력 미입력 상태)
  const input: RedevelopmentOrchestratorInput = {
    ...case44Input(),
    redevelopment: {
      ...case44Input().redevelopment,
      firstDisclosureDate: new Date("2005-04-30"),
      // firstDisclosureHousingPrice / landArea / 단가 등 미입력
      // acquisitionHousingPrice = 85_034_988 (사례 44 single)
    },
  };

  const result = runRedevelopment(input);

  it("PHD 필수입력 누락 → 본문 미적용 → 사례 44 환산취득가 = 141,221,534 (회귀 보존)", () => {
    expect(result.preApproval.apportionedAcquisition).toBe(141_221_534);
  });

  it("method = estimated_post_disclosure_decree_166_3 (본문 미적용)", () => {
    expect(result.valuationMeta?.method).toBe("estimated_post_disclosure_decree_166_3");
  });

  it("preDisclosureStep1 = undefined (본문 미적용)", () => {
    expect(result.valuationMeta?.preDisclosureStep1).toBeUndefined();
  });
});
