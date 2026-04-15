import { describe, it, expect } from "vitest";
import {
  findExemptionRuleById,
  getExemptionRulesByCategory,
  getHighRiskRules,
  INHERITANCE_EXEMPTION_RULES,
  GIFT_EXEMPTION_RULES,
  DISABLED_TRUST_LIMIT,
} from "@/lib/tax-engine/exemption-rules";
import {
  evaluateExemptions,
  validateMarriageExemptionOnce,
  convertInheritanceExemptionInput,
  type ExemptionCheckedItem,
} from "@/lib/tax-engine/exemption-evaluator";

// ============================================================
// 1. 룰 데이터 무결성
// ============================================================

describe("비과세 룰 데이터 무결성", () => {
  it("[N1] 상속세 비과세 룰 8종 등록", () => {
    expect(INHERITANCE_EXEMPTION_RULES.length).toBe(8);
  });

  it("[N2] 증여세 비과세 룰 8종 등록", () => {
    expect(GIFT_EXEMPTION_RULES.length).toBe(8);
  });

  it("[N3] 카테고리별 조회 정확성", () => {
    const inh = getExemptionRulesByCategory("inheritance");
    const gift = getExemptionRulesByCategory("gift");
    expect(inh.every((r) => r.category === "inheritance")).toBe(true);
    expect(gift.every((r) => r.category === "gift")).toBe(true);
  });

  it("[N4] 고위험·중위험 룰 존재 확인", () => {
    const highRisk = getHighRiskRules();
    expect(highRisk.length).toBeGreaterThan(0);
    expect(highRisk.every((r) => r.riskLevel === "high" || r.riskLevel === "medium")).toBe(true);
  });

  it("[N5] 금양임야 면적 한도 1,983㎡(600평)", () => {
    const rule = findExemptionRuleById("inh_forest_burial");
    expect(rule?.limitAreaM2).toBe(1983);
  });

  it("[N6] 묘토 면적 한도 3,966㎡(1,200평)", () => {
    const rule = findExemptionRuleById("inh_grave_land");
    expect(rule?.limitAreaM2).toBe(3966);
  });

  it("[N7] 장애인 신탁 한도 5억", () => {
    expect(DISABLED_TRUST_LIMIT).toBe(500_000_000);
    const rule = findExemptionRuleById("gift_disabled_trust");
    expect(rule?.limitAmount).toBe(500_000_000);
  });
});

// ============================================================
// 2. 비과세 평가기 핵심 케이스
// ============================================================

describe("비과세 평가기 — 핵심 케이스", () => {
  it("[N8] 문화재 지정 취소 시 비과세 0 + 경고", () => {
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "inh_cultural_property",
        claimedAmount: 300_000_000,
        culturalDesignationRevoked: true,
      },
    ];
    const result = evaluateExemptions(items, 1_000_000_000);
    expect(result.totalExemptAmount).toBe(0);
    expect(result.itemResults[0].taxableOverflow).toBe(300_000_000);
    expect(result.itemResults[0].warnings.some((w) => w.includes("지정 취소"))).toBe(true);
  });

  it("[N9] 문화재 정상 지정 — 전액 비과세", () => {
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "inh_cultural_property",
        claimedAmount: 500_000_000,
        culturalDesignationRevoked: false,
      },
    ];
    const result = evaluateExemptions(items, 2_000_000_000);
    expect(result.totalExemptAmount).toBe(500_000_000);
    expect(result.itemResults[0].taxableOverflow).toBe(0);
  });

  it("[N10] 금양임야 600평(1,983㎡) 초과 분할 과세", () => {
    // 총 3,000㎡ 면적 중 1,983㎡만 비과세
    // 평가액 3억 → 비과세 비율 = 1983/3000 = 0.661 → 비과세 1억9천830만
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "inh_forest_burial",
        claimedAmount: 300_000_000,
        areaM2: 3000,
      },
    ];
    const result = evaluateExemptions(items, 1_000_000_000);
    const expectedExempt = Math.floor(300_000_000 * (1983 / 3000));
    expect(result.itemResults[0].exemptAmount).toBe(expectedExempt);
    expect(result.itemResults[0].taxableOverflow).toBe(300_000_000 - expectedExempt);
    expect(result.itemResults[0].warnings.some((w) => w.includes("600평"))).toBe(true);
  });

  it("[N11] 장애인 신탁: 기사용 3억 + 신규 3억 → 2억만 비과세, 1억 과세", () => {
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "gift_disabled_trust",
        claimedAmount: 300_000_000,
        priorDisabledTrustUsed: 300_000_000, // 기사용 3억
      },
    ];
    const result = evaluateExemptions(items, 1_000_000_000);
    // 잔여 한도 = 5억 - 3억 = 2억
    expect(result.itemResults[0].exemptAmount).toBe(200_000_000);
    expect(result.itemResults[0].taxableOverflow).toBe(100_000_000);
    expect(
      result.itemResults[0].warnings.some((w) => w.includes("한도(5억)")),
    ).toBe(true);
  });

  it("[N12] 장애인 신탁: 한도 5억 미사용 → 전액 비과세", () => {
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "gift_disabled_trust",
        claimedAmount: 400_000_000,
        priorDisabledTrustUsed: 0,
      },
    ];
    const result = evaluateExemptions(items, 1_000_000_000);
    expect(result.itemResults[0].exemptAmount).toBe(400_000_000);
    expect(result.itemResults[0].taxableOverflow).toBe(0);
  });

  it("[N12b] 공익법인: 동족주식 초과 시 경고 포함", () => {
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "inh_public_interest",
        claimedAmount: 1_000_000_000,
        relatedStockExceeded: true,
      },
    ];
    const result = evaluateExemptions(items, 5_000_000_000);
    expect(result.itemResults[0].warnings.some((w) => w.includes("동족주식"))).toBe(true);
    // 3년 내 공익 외 사용 사후관리 경고도 포함
    expect(result.itemResults[0].warnings.some((w) => w.includes("3년"))).toBe(true);
  });

  it("[N13] 혼인공제 평생 1회 — 기사용 시 경고", () => {
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "gift_marriage_birth",
        claimedAmount: 100_000_000,
        marriageExemptionAlreadyUsed: true,
      },
    ];
    const warnings = validateMarriageExemptionOnce(items);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("평생 1회");
  });

  it("[N14] 복수 비과세 항목 합산 — 국가유증 + 족보제구", () => {
    const items: ExemptionCheckedItem[] = [
      { ruleId: "inh_state_bequest", claimedAmount: 200_000_000 },
      { ruleId: "inh_ritual_items", claimedAmount: 5_000_000 },
    ];
    const result = evaluateExemptions(items, 1_000_000_000);
    expect(result.totalExemptAmount).toBe(205_000_000);
    expect(result.itemResults.length).toBe(2);
  });

  it("[N15] 비과세 총액이 재산 총액 초과 시 재산 총액으로 절사", () => {
    const items: ExemptionCheckedItem[] = [
      { ruleId: "inh_state_bequest", claimedAmount: 500_000_000 },
    ];
    // grossEstateValue = 3억 → 비과세 5억이어도 3억으로 절사
    const result = evaluateExemptions(items, 300_000_000);
    expect(result.totalExemptAmount).toBe(300_000_000);
  });

  it("[N16] ExemptionInput → CheckedItems 변환", () => {
    const input = {
      donatedToState: 100_000_000,
      ceremonialProperty: 5_000_000,
      culturalProperty: 0,
    };
    const items = convertInheritanceExemptionInput(input);
    expect(items.length).toBe(2);
    expect(items.find((i) => i.ruleId === "inh_state_bequest")?.claimedAmount).toBe(100_000_000);
    expect(items.find((i) => i.ruleId === "inh_ritual_items")?.claimedAmount).toBe(5_000_000);
    // culturalProperty=0 이므로 포함 안 됨
    expect(items.find((i) => i.ruleId === "inh_cultural_property")).toBeUndefined();
  });
});
