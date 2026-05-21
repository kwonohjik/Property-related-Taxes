/**
 * 영농상속공제 사후관리 추징 (F-7) — anchor 테스트
 *
 * 법령: 상증법 §18의3④⑥⑦ + 시행령 §16⑥⑦⑧ (KoreanLaw MCP 검증 2026-05-21)
 * 계획서: docs/00-pm/inheritance-farming-followup.plan.md §2-5 (FP-1~10)
 */

import { describe, expect, it } from "vitest";

import { calcFarmingPostMgmt } from "@/lib/tax-engine/deductions/farming-post-mgmt";
import type { FarmingPostMgmtInput } from "@/lib/tax-engine/types/inheritance-farming.types";

const BASE: FarmingPostMgmtInput = {
  violation: "asset_disposed",
  violationDate: "2027-03-15",
  filingDeadline: "2025-09-30",  // 상속개시 2025-03-31 + 6개월
  determinedTax: 500_000_000,
  interestRate: 0.029,  // 연 2.9%
};

describe("calcFarmingPostMgmt — 영농상속공제 사후관리 §18의3④⑥", () => {
  it("FP-1: 5년 내 자산 처분 — 추징 100% + 이자", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, BASE);
    expect(r.recaptureRequired).toBe(true);
    expect(r.recaptureAmount).toBe(2_000_000_000);
    expect(r.interestAmount).toBeGreaterThan(0);
    expect(r.totalRecapture).toBe(r.recaptureAmount + r.interestAmount);
  });

  it("FP-2: 5년 내 영농 중단 — 추징 100%", () => {
    const r = calcFarmingPostMgmt(1_500_000_000, {
      ...BASE,
      violation: "farming_ceased",
    });
    expect(r.recaptureRequired).toBe(true);
    expect(r.recaptureAmount).toBe(1_500_000_000);
  });

  it("FP-3: 정당사유 heir_death → 면제", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, {
      ...BASE,
      justifiedReason: "heir_death",
    });
    expect(r.recaptureRequired).toBe(false);
    expect(r.exemptedBy).toBe("heir_death");
    expect(r.recaptureAmount).toBe(0);
    expect(r.interestAmount).toBe(0);
    expect(r.totalRecapture).toBe(0);
  });

  it("FP-4: 정당사유 expropriation (수용) → 면제", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, {
      ...BASE,
      justifiedReason: "expropriation",
    });
    expect(r.recaptureRequired).toBe(false);
    expect(r.exemptedBy).toBe("expropriation");
  });

  it("FP-5: 정당사유 land_exchange (농지 교환·분합) → 면제", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, {
      ...BASE,
      justifiedReason: "land_exchange",
    });
    expect(r.recaptureRequired).toBe(false);
    expect(r.exemptedBy).toBe("land_exchange");
  });

  it("FP-6: 법인주식 처분 + maintainsMajorShareholder=true → 면제", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, {
      ...BASE,
      justifiedReason: "corporate_stock_disposal",
      maintainsMajorShareholder: true,
    });
    expect(r.recaptureRequired).toBe(false);
    expect(r.exemptedBy).toBe("corporate_stock_disposal");
  });

  it("FP-7: 법인주식 처분 + maintainsMajorShareholder=false → 추징", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, {
      ...BASE,
      justifiedReason: "corporate_stock_disposal",
      maintainsMajorShareholder: false,
    });
    expect(r.recaptureRequired).toBe(true);
    expect(r.exemptedBy).toBeUndefined();
    expect(r.recaptureAmount).toBe(2_000_000_000);
  });

  it("FP-8: filingDeadline 이전 violation → interestDays=0 (이상 입력)", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, {
      ...BASE,
      violationDate: "2025-09-29",  // 신고기한 전
    });
    expect(r.interestDays).toBe(0);
    expect(r.interestAmount).toBe(0);
    expect(r.recaptureAmount).toBe(2_000_000_000);  // 추징은 적용
  });

  it("FP-9: tax_fraud_conviction (§18의3⑥2호) + justifiedReason 무시 → 추징", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, {
      ...BASE,
      violation: "tax_fraud_conviction",
      justifiedReason: "heir_death",  // 정당사유 입력했지만 §18의3⑥ 트랙이라 무시
    });
    expect(r.recaptureRequired).toBe(true);
    expect(r.exemptedBy).toBeUndefined();
    expect(r.recaptureAmount).toBe(2_000_000_000);
  });

  it("FP-10: 이자상당액 정확성 — 결정세액 5억 × 365일 × 2.9% / 365 = 14,500,000", () => {
    // filingDeadline+1=2025-10-01부터 366일 (윤년 포함) 후 = 2026-10-01
    // 정확히 365일 검증을 위해 filingDeadline=2025-10-01, violationDate=2026-10-01
    const r = calcFarmingPostMgmt(2_000_000_000, {
      ...BASE,
      filingDeadline: "2025-09-30",
      violationDate: "2026-10-01",  // 신고기한+1=10/1부터 다음해 10/1 = 365일
    });
    // 일수 계산: differenceInDays(2026-10-01, 2025-10-01) = 365
    expect(r.interestDays).toBe(365);
    // 이자 = 500,000,000 × 365 × 0.029 / 365 = 14,500,000
    expect(r.interestAmount).toBe(14_500_000);
  });
});

describe("calcFarmingPostMgmt — 신고기한 §18의3⑦", () => {
  it("위반일이 속하는 달 말일 + 6개월 = 신고기한", () => {
    const r = calcFarmingPostMgmt(1_000_000_000, {
      ...BASE,
      violationDate: "2027-03-15",
    });
    // 2027-03-15 속하는 달 말일 = 2027-03-31 + 6개월 = 2027-09-30
    expect(r.reportDeadline).toBe("2027-09-30");
  });

  it("위반일이 윤년 2월 — 말일 정확 처리", () => {
    const r = calcFarmingPostMgmt(1_000_000_000, {
      ...BASE,
      violationDate: "2028-02-10",
    });
    // 2028은 윤년 → 2/29 + 6개월 = 2028-08-29
    expect(r.reportDeadline).toBe("2028-08-29");
  });
});

describe("calcFarmingPostMgmt — 경계 케이스", () => {
  it("originalDeduction 음수 → 0 clamp", () => {
    const r = calcFarmingPostMgmt(-100_000, BASE);
    expect(r.recaptureAmount).toBe(0);
  });

  it("determinedTax=0 → interestAmount=0", () => {
    const r = calcFarmingPostMgmt(1_000_000_000, {
      ...BASE,
      determinedTax: 0,
    });
    expect(r.interestAmount).toBe(0);
  });

  it("interestRate=0 → interestAmount=0", () => {
    const r = calcFarmingPostMgmt(1_000_000_000, {
      ...BASE,
      interestRate: 0,
    });
    expect(r.interestAmount).toBe(0);
  });

  it("breakdown — 추징 적용 시 단계 명시", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, BASE);
    const labels = r.breakdown.map((s) => s.label);
    expect(labels.some((l) => l.includes("위반 사유"))).toBe(true);
    expect(labels.some((l) => l.includes("추징세액"))).toBe(true);
    expect(labels.some((l) => l.includes("이자상당액"))).toBe(true);
    expect(labels.some((l) => l.includes("신고기한"))).toBe(true);
  });

  it("breakdown — 면제 시 면제 사유 명시 + 추징 0", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, {
      ...BASE,
      justifiedReason: "heir_death",
    });
    const labels = r.breakdown.map((s) => s.label);
    expect(labels.some((l) => l.includes("면제 적용"))).toBe(true);
    expect(labels.some((l) => l.includes("§16⑥1호"))).toBe(true);
  });
});
