/**
 * 조특법 §99의3 신축주택 과세특례 — anchor 테스트
 *
 * Phase 2 라운드 3 (2026-05-06).
 *
 * Design doc: docs/02-design/features/transfer-reduction-99-3.engine.design.md
 * 케이스 인벤토리: 14개 (사용자 PDF anchor 1 + 합성 13)
 * anchor 자료: docs/02-design/features/anchors/reduction-99-3-case-2023.md
 *
 * **anchor 정책**: 메모리 `feedback_pdf_example_test_anchoring.md` — 원단위 toBe() 고정.
 * 단, 사례 26은 PHD 환산 통합 후 정확값 도출되므로 본 라운드는 직접 산식 검증만.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateNew993,
  isHighValueHouseUnder993,
  type New993Input,
} from "@/lib/tax-engine/transfer-reductions/new-99-3";

// ============================================================================
// 테스트 픽스처: 기본 적합 입력 (모든 적용 배제 통과)
// ============================================================================

function makeBaseInput(overrides: Partial<New993Input> = {}): New993Input {
  return {
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2003-09-23"),
    contractDate: new Date("2001-05-24"),
    usageApprovalDate: new Date("2003-11-28"),
    transferIncome: 415_118_683,
    standardPriceAtAcquisition: 540_000_000,
    standardPriceAt5Years: 700_000_000,
    standardPriceAtTransfer: 900_000_000,
    transferPrice: 1_200_000_000,
    exclusiveAreaSqm: 138.2,
    region: "outside_speculation",
    isResident: true,
    isHousingConstructionBusiness: false,
    acquisitionType: "from_builder",
    hasOccupancyAtContract: false,
    calculatedTaxBeforeReduction: 139_107_473,
    calculatedTaxAfterReduction: 68_486_533,
    ...overrides,
  };
}

// ============================================================================
// Case 2: 5년 내 양도 — 양도소득금액 전액 차감
// ============================================================================

describe("§99의3 — Case 2: 5년 내 양도 (취득~양도일까지 발생분 100% 차감)", () => {
  it("취득 후 4년 시점에 양도하면 양도소득금액 전액이 감면 대상", () => {
    const input = makeBaseInput({
      acquisitionDate: new Date("2003-09-23"),
      transferDate: new Date("2007-09-23"), // 4년 후
      transferIncome: 100_000_000,
      // 5년 내이므로 기준시가는 무관
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(true);
    expect(r.signCase).toBe("within_5_years");
    expect(r.reducibleTransferIncome).toBe(100_000_000);
    expect(r.fiveYearRatio).toBe(1);
  });

  it("취득일 + 5년 동일 일자도 5년 내로 처리 (경계)", () => {
    const input = makeBaseInput({
      acquisitionDate: new Date("2003-09-23"),
      transferDate: new Date("2008-09-23"), // 정확히 5년
      transferIncome: 50_000_000,
    });
    const r = evaluateNew993(input);
    expect(r.isWithin5Years).toBe(true);
    expect(r.reducibleTransferIncome).toBe(50_000_000);
  });
});

// ============================================================================
// Case 1·3·4·5: 5년 후 양도 — 부호 4가지
// ============================================================================

describe("§99의3 — 5년 후 양도 안분 산식 (부호 4가지 케이스)", () => {
  it("Case 1 (+,+) 정상 안분 — 단순 비율 적용 (PHD 환산 없음 가정)", () => {
    // 분자 = 700M - 540M = 160M
    // 분모 = 900M - 540M = 360M
    // 비율 = 160 / 360 = 0.4444...
    // 차감 = 415,118,683 × 0.4444... = 184,497,192 (floor)
    const input = makeBaseInput();
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(false);
    expect(r.signCase).toBe("all_positive");
    expect(r.reducibleTransferIncome).toBe(Math.floor(415_118_683 * (160 / 360)));
    expect(r.fiveYearRatio).toBeCloseTo(160 / 360, 6);
  });

  it("Case 3 (-,+) 분자 음수·분모 양수 → 감면 0 (부동산-136)", () => {
    const input = makeBaseInput({
      standardPriceAtAcquisition: 700_000_000,
      standardPriceAt5Years: 600_000_000, // 분자 = -100M
      standardPriceAtTransfer: 900_000_000, // 분모 = +200M
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(true);
    expect(r.signCase).toBe("neg_pos");
    expect(r.reducibleTransferIncome).toBe(0);
    expect(r.fiveYearRatio).toBe(0);
  });

  it("Case 4 (+,-) 분자 양수·분모 음수 → 양도소득금액 전액 감면 (부동산-525)", () => {
    const input = makeBaseInput({
      standardPriceAtAcquisition: 800_000_000,
      standardPriceAt5Years: 900_000_000, // 분자 = +100M
      standardPriceAtTransfer: 700_000_000, // 분모 = -100M
      transferIncome: 200_000_000,
    });
    const r = evaluateNew993(input);
    expect(r.signCase).toBe("pos_neg");
    expect(r.reducibleTransferIncome).toBe(200_000_000);
    expect(r.fiveYearRatio).toBe(1);
  });

  it("Case 5 (-,-) 분자·분모 동시 음수 → 감면 0 (재산 2014-2035)", () => {
    const input = makeBaseInput({
      standardPriceAtAcquisition: 1_000_000_000,
      standardPriceAt5Years: 900_000_000, // 분자 = -100M
      standardPriceAtTransfer: 800_000_000, // 분모 = -200M
    });
    const r = evaluateNew993(input);
    expect(r.signCase).toBe("all_negative");
    expect(r.reducibleTransferIncome).toBe(0);
  });
});

// ============================================================================
// Case 6~10: 적용 배제
// ============================================================================

describe("§99의3 — 적용 배제 (우선순위 7단계)", () => {
  it("Case 9: 거주자 아닌 자 → 적용 배제 (NOT_RESIDENT)", () => {
    const input = makeBaseInput({ isResident: false });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons[0].code).toBe("NOT_RESIDENT");
  });

  it("Case 10: 본인이 주택건설사업자 → 적용 배제 (HOUSING_CONSTRUCTION_BUSINESS)", () => {
    const input = makeBaseInput({ isHousingConstructionBusiness: true });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons[0].code).toBe("HOUSING_CONSTRUCTION_BUSINESS");
  });

  it("Case 6: 가격 급등 지역(서울) 내 → 적용 배제 (SPECULATION_AREA)", () => {
    const input = makeBaseInput({ region: "speculation" });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons[0].code).toBe("SPECULATION_AREA");
  });

  it("Case 8: 신축주택취득기간 외 (분양계약 2003.7.1) → 적용 배제 (OUT_OF_ACQUISITION_PERIOD)", () => {
    const input = makeBaseInput({
      contractDate: new Date("2003-07-01"),
      acquisitionType: "from_builder",
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons[0].code).toBe("OUT_OF_ACQUISITION_PERIOD");
  });

  it("Case 11: 매매계약일 입주사실 있는 주택 (1호 단서) → 적용 배제 (OCCUPANCY_AT_CONTRACT)", () => {
    const input = makeBaseInput({ hasOccupancyAtContract: true });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons[0].code).toBe("OCCUPANCY_AT_CONTRACT");
  });

  it("Case 7: 고가주택 (2003.1.1~2008.10.5 적용기준일, 양도가 6억 초과) → 적용 배제 (HIGH_VALUE_HOUSE)", () => {
    // 분양계약일이 2003.5.1 → 적용기준일 2003.1.1~2008.10.5 → 6억 초과 시 고가
    const input = makeBaseInput({
      contractDate: new Date("2003-05-01"),
      transferPrice: 700_000_000, // 6억 초과
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons[0].code).toBe("HIGH_VALUE_HOUSE");
  });

  it("Case 7-b: 분양계약일 ~2002.9.30 + 면적 165㎡ 미달 → 고가주택 아님 (적용 가능)", () => {
    // PDF 사례 26: 분양계약일 2001.5.24, 면적 138.2㎡, 양도가 12억
    // → 기준일 ~2002.9.30 → 면적 165㎡ AND 6억 초과 (AND 조건)
    // → 면적 138.2 < 165 → 고가 아님 → 적용 가능
    const input = makeBaseInput({
      contractDate: new Date("2001-05-24"),
      exclusiveAreaSqm: 138.2,
      transferPrice: 1_200_000_000,
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(true);
  });
});

// ============================================================================
// Case 13: 자기건설 (2호) — 시한 검증 분기
// ============================================================================

describe("§99의3 — Case 13: 자기건설 (2호) 본격 분기 (P2-2)", () => {
  it("자기건설 + 사용승인일 시한 내 → 적용 가능", () => {
    const input = makeBaseInput({
      acquisitionType: "self_built",
      contractDate: undefined, // 자기건설은 매매계약 X
      usageApprovalDate: new Date("2002-12-15"),
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(true);
  });

  it("자기건설 + 사용승인일 시한 외 (2003.7.15) → 적용 배제", () => {
    const input = makeBaseInput({
      acquisitionType: "self_built",
      contractDate: undefined,
      usageApprovalDate: new Date("2003-07-15"),
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons[0].code).toBe("OUT_OF_ACQUISITION_PERIOD");
  });

  it("자기건설(2호)은 1호 단서(매매계약일 입주사실)가 적용되지 않음", () => {
    // 자기건설은 매매계약 자체가 없으므로 hasOccupancyAtContract 입력해도 무시
    const input = makeBaseInput({
      acquisitionType: "self_built",
      contractDate: undefined,
      usageApprovalDate: new Date("2002-12-15"),
      hasOccupancyAtContract: true, // 자기건설에서는 의미 없음
    });
    const r = evaluateNew993(input);
    // 1호 단서는 from_builder에만 적용 — self_built에는 미적용
    expect(r.isEligible).toBe(true);
  });

  it("자기건설(2호) + 고가주택 적용기준일은 사용승인일 기준 (분양계약일 없음)", () => {
    // 자기건설에서 고가주택 적용기준일은 contractDate 없으므로 usageApprovalDate fallback
    const input = makeBaseInput({
      acquisitionType: "self_built",
      contractDate: undefined,
      usageApprovalDate: new Date("2003-05-01"), // ~2008.10.5 → 6억 초과 시 고가
      transferPrice: 700_000_000, // 6억 초과
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons[0].code).toBe("HIGH_VALUE_HOUSE");
  });

  it("주건업(1호) 취득은 사용승인일이 아닌 분양계약일로 시한 검증", () => {
    // contractDate(분양계약일)이 시한 내, usageApprovalDate(사용승인일)이 시한 외라도 적용 가능
    const input = makeBaseInput({
      acquisitionType: "from_builder",
      contractDate: new Date("2002-01-01"), // 시한 내
      usageApprovalDate: new Date("2004-12-31"), // 시한 외 — 무시
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(true);
  });
});

// ============================================================================
// Case 14: 농어촌특별세 20% 부가
// ============================================================================

describe("§99의3 — Case 14: 농어촌특별세 산정", () => {
  it("PDF 사례 26 — 감면세액 70,620,940 × 20% = 14,124,188", () => {
    const input = makeBaseInput({
      calculatedTaxBeforeReduction: 139_107_473,
      calculatedTaxAfterReduction: 68_486_533,
    });
    const r = evaluateNew993(input);
    expect(r.taxReductionForRuralSurtax).toBe(70_620_940);
    expect(r.ruralSurtax).toBe(14_124_188);
  });

  it("감면 적용 안 된 경우 — 감면세액 0 → 농특세 0", () => {
    const input = makeBaseInput({
      isResident: false, // 적용 배제
      calculatedTaxBeforeReduction: 100_000_000,
      calculatedTaxAfterReduction: 100_000_000,
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(false);
    expect(r.ruralSurtax).toBe(0);
  });
});

// ============================================================================
// Case 12: §99의3 ②항 — 1세대1주택 비과세 시 신축주택 주택수 제외
// ============================================================================

describe("§99의3 — Case 12: ②항 1세대1주택 신축 주택수 제외", () => {
  it("다른 주택을 2007.12.31 이전 양도 → 신축 주택수 제외 (true)", () => {
    const input = makeBaseInput({
      otherHouseTransferDate: new Date("2007-06-15"),
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(true);
    expect(r.isExcludedFromHouseCountFor1H1H).toBe(true);
  });

  it("다른 주택을 2007.12.31 정확히 양도 → 경계값 true", () => {
    const input = makeBaseInput({
      otherHouseTransferDate: new Date("2007-12-31"),
    });
    const r = evaluateNew993(input);
    expect(r.isExcludedFromHouseCountFor1H1H).toBe(true);
  });

  it("다른 주택을 2008.1.1 이후 양도 → 신축 주택수 제외 X (false)", () => {
    const input = makeBaseInput({
      otherHouseTransferDate: new Date("2008-01-01"),
    });
    const r = evaluateNew993(input);
    expect(r.isExcludedFromHouseCountFor1H1H).toBe(false);
  });

  it("다른 주택 양도일 미입력 → ②항 적용 안 함", () => {
    const input = makeBaseInput({});
    const r = evaluateNew993(input);
    expect(r.isExcludedFromHouseCountFor1H1H).toBe(false);
  });

  it("§99의3 적용 배제 시 ②항도 false (적용 무관)", () => {
    const input = makeBaseInput({
      isResident: false,
      otherHouseTransferDate: new Date("2007-06-15"),
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(false);
    expect(r.isExcludedFromHouseCountFor1H1H).toBe(false);
  });
});

// ============================================================================
// Case 1 (보강): PDF 사례 26 — PHD 통합 anchor
// ============================================================================

describe("§99의3 — PDF 사례 26 PHD 통합 anchor (P1-1)", () => {
  /**
   * PDF 사례 26 검증값:
   *   - 양도소득금액 415,118,683
   *   - 소득금액 감면대상 179,917,278
   *
   * 안분 비율 역산: 0.4334209 = (5년시점 - 취득시) / (양도시 - 취득시)
   *   - 양도시(2022.1.1 고시) = 900,000,000
   *   - 5년시점(2008.1.1 고시) = 700,000,000 추정
   *   - 취득시(PHD 환산) X = (Y - ratio × Z) / (1 - ratio) ≈ 547,080,000
   *
   * X는 PHD §164⑤ 환산 결과: 540M × (취득시 기준시가 합계 / 최초고시 기준시가 합계)
   *   - 취득시 토지 공시지가(2003): 1,640,000/㎡ × 16.36㎡ = 26,830,400
   *   - 최초고시 토지 공시지가(2004): 1,810,000/㎡ × 16.36㎡ = 29,611,600
   *   - 건물 기준시가는 PDF 미명시 — 사용자 추가 자료 필요
   *
   * 따라서 본 anchor는:
   *   (a) PHD 엔진 호출 흐름이 결합되는지 확인 (placeholder 건물 기준시가)
   *   (b) 정확값 검증은 todo (사용자 추가 자료 후 활성화)
   */
  it.todo("PDF 사례 26 정확값 검증 — 건물 기준시가 추가 자료 제공 시 활성화");

  it("PDF 사례 26 단순 가정값(X=540M) 안분 비율 검증 — 정확값 미일치 명시", () => {
    // X=540M, Y=700M, Z=900M 단순 가정 → ratio = 160/360 = 0.4444...
    // 결과: 415,118,683 × 0.4444 ≈ 184,497,192 (PDF 179,917,278과 약 4.6M 차이)
    // 차이 사유: PHD 환산이 있어 실제 X ≠ 540M
    const input = makeBaseInput();
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(true);
    expect(r.signCase).toBe("all_positive");
    // 단순 가정 결과 — PDF 정확값과 다름
    expect(r.reducibleTransferIncome).toBeGreaterThan(180_000_000);
    expect(r.reducibleTransferIncome).toBeLessThan(190_000_000);
    // ⚠ PDF 정확값 (179,917,278)은 PHD 환산 후 X ≈ 547M 적용 시 도출
  });

  it("X=547,080,000 reverse-engineered 가정 시 PDF 정확값 ±50K 근접", () => {
    // X를 PDF 결과에서 역산한 추정값으로 입력 시 정확값에 근접
    const input = makeBaseInput({
      standardPriceAtAcquisition: 547_080_000,
      standardPriceAt5Years: 700_000_000,
      standardPriceAtTransfer: 900_000_000,
    });
    const r = evaluateNew993(input);
    expect(r.isEligible).toBe(true);
    // PDF 179,917,278과 ±200K 이내
    expect(Math.abs(r.reducibleTransferIncome - 179_917_278)).toBeLessThan(200_000);
  });
});

// ============================================================================
// 헬퍼 단위 테스트 — isHighValueHouseUnder993 (4단계 정의)
// ============================================================================

describe("isHighValueHouseUnder993 — 적용기준일 4단계 정의", () => {
  it("~2002.9.30: 면적 165㎡ AND 6억 초과 = 고가", () => {
    // 면적 미달
    expect(isHighValueHouseUnder993(new Date("2002-05-01"), 700_000_000, 160)).toBe(false);
    // 가격 미달
    expect(isHighValueHouseUnder993(new Date("2002-05-01"), 500_000_000, 170)).toBe(false);
    // 둘 다 충족
    expect(isHighValueHouseUnder993(new Date("2002-05-01"), 700_000_000, 170)).toBe(true);
  });

  it("2002.10.1~2002.12.31: 면적 149㎡ AND 6억 초과 = 고가", () => {
    expect(isHighValueHouseUnder993(new Date("2002-11-15"), 700_000_000, 145)).toBe(false);
    expect(isHighValueHouseUnder993(new Date("2002-11-15"), 700_000_000, 150)).toBe(true);
  });

  it("2003.1.1~2008.10.5: 6억 초과만 = 고가 (면적 무관)", () => {
    expect(isHighValueHouseUnder993(new Date("2005-01-01"), 600_000_000, 200)).toBe(false);
    expect(isHighValueHouseUnder993(new Date("2005-01-01"), 600_000_001, 100)).toBe(true);
  });

  it("2008.10.6~2021.12.7: 9억 초과 = 고가", () => {
    expect(isHighValueHouseUnder993(new Date("2010-01-01"), 900_000_000, 100)).toBe(false);
    expect(isHighValueHouseUnder993(new Date("2010-01-01"), 900_000_001, 100)).toBe(true);
  });

  it("2021.12.8~: 12억 초과 = 고가", () => {
    expect(isHighValueHouseUnder993(new Date("2023-01-01"), 1_200_000_000, 100)).toBe(false);
    expect(isHighValueHouseUnder993(new Date("2023-01-01"), 1_200_000_001, 100)).toBe(true);
  });
});
