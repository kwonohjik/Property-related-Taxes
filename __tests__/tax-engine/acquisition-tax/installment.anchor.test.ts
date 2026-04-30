/**
 * 취득세 연부취득 Anchor 테스트
 *
 * 지방세법 §6 제17호 (연부취득 정의), §10의5 (과세표준), §20⑤ (취득시기)
 *
 * 검증 시나리오:
 * [AT-INST-01] 정상 3회차 연부취득 — 합산 과세표준 3.5억
 * [AT-INST-02] 2년 미만 분할 → 일반 매매 처리
 * [AT-INST-03] 비유상취득(상속) + installments → installments 무시
 * [AT-INST-04] 부담부증여 + installments → 부담부증여 우선
 * [AT-INST-05] 신고기한 스케줄 정확성 (지급일 + 60일)
 * [AT-INST-06] 단일 회차 → 일반 매매 처리
 * [AT-INST-07] 특수관계인 + 시가표준액 70% 미달 → 경고 포함
 * [AT-INST-08] 교환 취득 연부취득 — 유상취득으로 연부취득 인정
 */

import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import { determineTaxBase } from "../../../lib/tax-engine/acquisition-tax-base";
import { determineAcquisitionTiming } from "../../../lib/tax-engine/acquisition-timing";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

// 최소 공통 입력 헬퍼
function makeInput(override: Partial<AcquisitionTaxInput> = {}): AcquisitionTaxInput {
  return {
    propertyType: "housing",
    acquisitionCause: "purchase",
    reportedPrice: 0,
    acquiredBy: "individual",
    houseCountAfter: 1,
    isRegulatedArea: false,
    ...override,
  } as AcquisitionTaxInput;
}

// ============================================================
// [AT-INST-01] 정상 3회차 연부취득 — 합산 과세표준 3.5억
// ============================================================

describe("[AT-INST-01] 정상 3회차 연부취득 — 합산 과세표준", () => {
  it("3회차 합산 3.5억 × 1% = 350만원 (6억 이하 주택)", () => {
    const result = calcAcquisitionTax(makeInput({
      propertyType: "housing",
      acquisitionCause: "purchase",
      standardValue: 300_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 50_000_000,  label: "계약금" },
        { paymentDate: "2025-01-01", amount: 100_000_000, label: "중도금" },
        { paymentDate: "2026-01-01", amount: 200_000_000, label: "잔금" },
      ],
      houseCountAfter: 1,
    }));

    // 과세표준: 50M + 100M + 200M = 350M
    expect(result.taxBase).toBe(350_000_000);
    // 취득세 본세: 350M × 1% = 3,500,000
    expect(result.acquisitionTax).toBe(3_500_000);
    // 연부취득 스케줄: 3개 회차
    expect(result.installmentFilingSchedule).toBeDefined();
    expect(result.installmentFilingSchedule!.length).toBe(3);
    // taxBaseMethod가 installment로 설정됨
    expect(result.taxBaseMethod).toBe("installment");
  });

  it("연부취득 취득일은 마지막 회차 지급일(2026-01-01)", () => {
    const result = calcAcquisitionTax(makeInput({
      installments: [
        { paymentDate: "2024-01-01", amount: 50_000_000,  label: "계약금" },
        { paymentDate: "2025-01-01", amount: 100_000_000, label: "중도금" },
        { paymentDate: "2026-01-01", amount: 200_000_000, label: "잔금" },
      ],
    }));

    expect(result.acquisitionDate).toBe("2026-01-01");
  });
});

// ============================================================
// [AT-INST-02] 2년 미만 분할 → 일반 매매 처리
// ============================================================

describe("[AT-INST-02] 2년 미만 분할 → 일반 매매 처리", () => {
  it("5개월 간격 2회차 → 연부취득 아님, 합산액이 reportedPrice로 처리", () => {
    const result = determineTaxBase(makeInput({
      acquisitionCause: "purchase",
      reportedPrice: 0,
      standardValue: 250_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 100_000_000 },
        { paymentDate: "2024-06-01", amount: 150_000_000 }, // 5개월 후
      ],
    }));

    // 연부취득이 아님 → installment 아닌 actual_price 또는 standard_value
    expect(result.method).not.toBe("installment");
    // 2년 미만 경고 포함
    expect(result.warnings.some(w => w.includes("2년 미만"))).toBe(true);
    // 합산액 250M을 reportedPrice로 보정해 과세표준 결정
    expect(result.taxBase).toBe(250_000_000);
  });

  it("11개월 간격 2회차 → 경고 + 합산액 기준 과세표준", () => {
    const result = determineTaxBase(makeInput({
      acquisitionCause: "purchase",
      reportedPrice: 0,
      standardValue: 500_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 200_000_000 },
        { paymentDate: "2024-12-01", amount: 300_000_000 }, // 11개월 후
      ],
    }));

    expect(result.method).not.toBe("installment");
    expect(result.warnings.some(w => w.includes("2년 미만"))).toBe(true);
  });
});

// ============================================================
// [AT-INST-03] 비유상취득(상속) + installments → installments 무시
// ============================================================

describe("[AT-INST-03] 비유상취득 + installments → 무시", () => {
  it("상속 + installments → installments 무시, 시가표준액 사용", () => {
    const result = determineTaxBase(makeInput({
      acquisitionCause: "inheritance",
      reportedPrice: 0,
      standardValue: 400_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 100_000_000 },
        { paymentDate: "2026-01-01", amount: 300_000_000 },
      ],
    }));

    // 상속은 비유상취득 → installments 무시
    expect(result.method).not.toBe("installment");
    // 시가표준액 사용
    expect(result.taxBase).toBe(400_000_000);
    // 비유상취득 경고 포함
    expect(result.warnings.some(w => w.includes("연부취득 대상이 아닙니다"))).toBe(true);
  });

  it("증여 + installments → installments 무시, 시가표준액 사용", () => {
    const result = determineTaxBase(makeInput({
      acquisitionCause: "gift",
      reportedPrice: 0,
      standardValue: 300_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 100_000_000 },
        { paymentDate: "2026-06-01", amount: 200_000_000 },
      ],
    }));

    expect(result.method).not.toBe("installment");
    expect(result.taxBase).toBe(300_000_000);
    expect(result.warnings.some(w => w.includes("연부취득 대상이 아닙니다"))).toBe(true);
  });

  it("신축(원시취득) + installments → installments 무시, 공사비 기준 처리", () => {
    const result = determineTaxBase(makeInput({
      acquisitionCause: "new_construction",
      reportedPrice: 0,
      constructionCost: 500_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 200_000_000 },
        { paymentDate: "2026-01-01", amount: 300_000_000 },
      ],
    }));

    expect(result.method).toBe("construction_cost");
    expect(result.taxBase).toBe(500_000_000);
    expect(result.warnings.some(w => w.includes("연부취득 대상이 아닙니다"))).toBe(true);
  });
});

// ============================================================
// [AT-INST-04] 부담부증여 + installments → 부담부증여 우선
// ============================================================

describe("[AT-INST-04] 부담부증여 + installments → 부담부증여 우선", () => {
  it("채무 4억 + 시가 10억 → split_onerous (installments 무시)", () => {
    const result = determineTaxBase(makeInput({
      acquisitionCause: "burdened_gift",
      reportedPrice: 0,
      encumbrance: 400_000_000,
      standardValue: 1_000_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 200_000_000 },
        { paymentDate: "2026-01-01", amount: 800_000_000 },
      ],
    }));

    // 부담부증여가 연부취득보다 우선
    expect(result.method).toBe("split_onerous");
    expect(result.breakdown?.onerousTaxBase).toBe(400_000_000);   // 채무액
    expect(result.breakdown?.gratuitousTaxBase).toBe(600_000_000); // 나머지
  });

  it("채무 0원 burdened_gift + installments → 일반 증여로 처리", () => {
    // encumbrance=0이면 부담부증여 분기 미진입 → installments가 있어도
    // burdened_gift는 비유상취득 아님 (ONEROUS_CAUSES에 없음) →
    // 비유상취득 방어 로직에서 installments 무시 → 시가표준액 사용
    const result = determineTaxBase(makeInput({
      acquisitionCause: "burdened_gift",
      reportedPrice: 0,
      encumbrance: 0,
      standardValue: 500_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 200_000_000 },
        { paymentDate: "2026-01-01", amount: 300_000_000 },
      ],
    }));

    // encumbrance=0 → 부담부증여 분기 미진입
    // burdened_gift는 ONEROUS_CAUSES에 없음 → installments 무시 경고
    expect(result.method).not.toBe("installment");
  });
});

// ============================================================
// [AT-INST-05] 신고기한 스케줄 정확성 (지급일 + 60일)
// ============================================================

describe("[AT-INST-05] 연부취득 신고기한 스케줄 — 지급일 + 60일", () => {
  it("계약금 2024-01-01 → 신고기한 2024-03-01 (60일 후)", () => {
    const timingResult = determineAcquisitionTiming({
      acquisitionCause: "purchase",
      installments: [
        { paymentDate: "2024-01-01", amount: 50_000_000,  label: "계약금" },
        { paymentDate: "2025-01-01", amount: 100_000_000, label: "중도금" },
        { paymentDate: "2026-01-01", amount: 200_000_000, label: "잔금" },
      ],
    });

    expect(timingResult.filingSchedule).toBeDefined();
    expect(timingResult.filingSchedule!.length).toBe(3);

    // 계약금 신고기한: 2024-01-01 + 60일 = 2024-03-01
    expect(timingResult.filingSchedule![0].paymentDate).toBe("2024-01-01");
    expect(timingResult.filingSchedule![0].deadline).toBe("2024-03-01");
    expect(timingResult.filingSchedule![0].label).toBe("계약금");

    // 중도금 신고기한: 2025-01-01 + 60일 = 2025-03-02
    expect(timingResult.filingSchedule![1].paymentDate).toBe("2025-01-01");
    expect(timingResult.filingSchedule![1].deadline).toBe("2025-03-02");

    // 잔금 신고기한: 2026-01-01 + 60일 = 2026-03-02
    expect(timingResult.filingSchedule![2].paymentDate).toBe("2026-01-01");
    expect(timingResult.filingSchedule![2].deadline).toBe("2026-03-02");
  });

  it("취득일은 마지막 회차 지급일, filingDeadline은 마지막 회차 신고기한", () => {
    const timingResult = determineAcquisitionTiming({
      acquisitionCause: "purchase",
      installments: [
        { paymentDate: "2024-06-01", amount: 100_000_000, label: "계약금" },
        { paymentDate: "2026-06-01", amount: 200_000_000, label: "잔금" },
      ],
    });

    expect(timingResult.acquisitionDate).toBe("2026-06-01");
    // 잔금 신고기한: 2026-06-01 + 60일 = 2026-07-31
    expect(timingResult.filingDeadline).toBe("2026-07-31");
    expect(timingResult.legalBasis).toContain("§20조 제5항");
  });

  it("label 미입력 시 '1회차', '2회차' 등 자동 라벨 부여", () => {
    const timingResult = determineAcquisitionTiming({
      acquisitionCause: "purchase",
      installments: [
        { paymentDate: "2024-01-01", amount: 100_000_000 },
        { paymentDate: "2025-01-01", amount: 100_000_000 },
        { paymentDate: "2026-01-01", amount: 100_000_000 },
      ],
    });

    expect(timingResult.filingSchedule![0].label).toBe("1회차");
    expect(timingResult.filingSchedule![1].label).toBe("2회차");
    expect(timingResult.filingSchedule![2].label).toBe("3회차");
  });

  it("calcAcquisitionTax 결과의 installmentFilingSchedule이 3개 회차 포함", () => {
    const result = calcAcquisitionTax(makeInput({
      installments: [
        { paymentDate: "2024-01-01", amount: 50_000_000,  label: "계약금" },
        { paymentDate: "2025-01-01", amount: 100_000_000, label: "중도금" },
        { paymentDate: "2026-01-01", amount: 200_000_000, label: "잔금" },
      ],
    }));

    expect(result.installmentFilingSchedule).toBeDefined();
    expect(result.installmentFilingSchedule!.length).toBe(3);
    expect(result.installmentFilingSchedule![0].label).toBe("계약금");
    expect(result.installmentFilingSchedule![0].paymentDate).toBe("2024-01-01");
    expect(result.installmentFilingSchedule![0].deadline).toBe("2024-03-01");
  });
});

// ============================================================
// [AT-INST-06] 단일 회차 → 일반 매매 처리
// ============================================================

describe("[AT-INST-06] 단일 회차 → 일반 매매 처리", () => {
  it("1회차 입력 → 경고 + 일반 매매 과세표준 처리", () => {
    const result = determineTaxBase(makeInput({
      acquisitionCause: "purchase",
      reportedPrice: 0,
      standardValue: 280_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 300_000_000, label: "일시불" },
      ],
    }));

    expect(result.method).not.toBe("installment");
    expect(result.warnings.some(w => w.includes("1개"))).toBe(true);
    // 합산액 300M이 reportedPrice로 → 시가표준액 280M보다 높아 actual_price
    expect(result.taxBase).toBe(300_000_000);
  });
});

// ============================================================
// [AT-INST-07] 특수관계인 + 시가표준액 70% 미달 → 경고
// ============================================================

describe("[AT-INST-07] 특수관계인 연부취득 — 시가표준액 70% 미달 경고", () => {
  it("합산 2억, 시가표준액 5억 (40% — 70% 미달) → 경고 포함", () => {
    const result = determineTaxBase(makeInput({
      acquisitionCause: "purchase",
      reportedPrice: 0,
      isRelatedParty: true,
      standardValue: 500_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 100_000_000 },
        { paymentDate: "2026-01-01", amount: 100_000_000 },
      ],
    }));

    expect(result.method).toBe("installment");
    expect(result.taxBase).toBe(200_000_000);
    // 70% 미달 경고
    expect(result.warnings.some(w => w.includes("70%"))).toBe(true);
    expect(result.warnings.some(w => w.includes("특수관계인"))).toBe(true);
    expect(result.warnings.some(w => w.includes("경정"))).toBe(true);
  });

  it("합산 4억, 시가표준액 5억 (80% — 70% 이상) → 경고 없음", () => {
    const result = determineTaxBase(makeInput({
      acquisitionCause: "purchase",
      reportedPrice: 0,
      isRelatedParty: true,
      standardValue: 500_000_000,
      installments: [
        { paymentDate: "2024-01-01", amount: 200_000_000 },
        { paymentDate: "2026-01-01", amount: 200_000_000 },
      ],
    }));

    expect(result.method).toBe("installment");
    // 70% 미달 경고 없음
    expect(result.warnings.some(w => w.includes("경정"))).toBe(false);
  });
});

// ============================================================
// [AT-INST-08] 교환 취득 연부취득 — 유상취득 인정
// ============================================================

describe("[AT-INST-08] 교환 취득 연부취득", () => {
  it("교환(exchange) + installments → 유상취득으로 연부취득 인정", () => {
    const result = determineTaxBase(makeInput({
      acquisitionCause: "exchange",
      reportedPrice: 0,
      installments: [
        { paymentDate: "2024-01-01", amount: 100_000_000 },
        { paymentDate: "2025-07-01", amount: 200_000_000 }, // 1년 6개월 후
        { paymentDate: "2026-07-01", amount: 300_000_000 }, // 2년 6개월 후
      ],
    }));

    // 교환도 유상취득 → 연부취득 인정
    expect(result.method).toBe("installment");
    expect(result.taxBase).toBe(600_000_000);
  });

  it("현물출자(in_kind_investment) + installments → 연부취득 인정", () => {
    const result = determineTaxBase(makeInput({
      propertyType: "land",
      acquisitionCause: "in_kind_investment",
      reportedPrice: 0,
      installments: [
        { paymentDate: "2024-01-01", amount: 300_000_000 },
        { paymentDate: "2026-06-01", amount: 700_000_000 },
      ],
    }));

    expect(result.method).toBe("installment");
    expect(result.taxBase).toBe(1_000_000_000);
  });
});
