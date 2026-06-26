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
  it("[N1] 상속세 비과세·과세가액 불산입 룰 8종 (문화재 §12 2호 삭제 정정 2026-06-05)", () => {
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

  it("[N5] 금양임야 면적 한도 9,900㎡ (상증령 §8③1호, 2026-06-05 정정)", () => {
    const rule = findExemptionRuleById("inh_forest_burial");
    expect(rule?.limitAreaM2).toBe(9900);
  });

  it("[N6] 묘토 면적 한도 1,980㎡ (상증령 §8③2호, 2026-06-05 정정)", () => {
    const rule = findExemptionRuleById("inh_grave_land");
    expect(rule?.limitAreaM2).toBe(1980);
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
  it("[N8] 문화재 비과세 룰 제거 — §12 2호 삭제·§74 징수유예 (2026-06-05)", () => {
    // 현행 상증법 §12에 문화재 비과세 호 없음(구 2호 삭제, KoreanLaw 검증).
    // 문화유산은 비과세가 아니라 §74 징수유예로 처리(inheritance-cultural-heritage-deferral.ts).
    expect(findExemptionRuleById("inh_cultural_property")).toBeUndefined();
    expect(
      getExemptionRulesByCategory("inheritance").some((r) => r.name.includes("문화재")),
    ).toBe(false);
  });

  it("[N9] §12 비과세 룰 조문 정합성 — 국가유증 1호·제사용 3호·정당 4호", () => {
    // lawRef 라벨은 "상증법 §12" 단일, 호수는 주석으로 정합화(KoreanLaw 검증)
    expect(findExemptionRuleById("inh_state_bequest")?.lawRef).toBe("상증법 §12");
    expect(findExemptionRuleById("inh_forest_burial")?.lawRef).toBe("상증법 §12");
    expect(findExemptionRuleById("inh_grave_land")?.lawRef).toBe("상증법 §12");
    expect(findExemptionRuleById("inh_political_party")?.lawRef).toBe("상증법 §12");
  });

  it("[N10/GF-02] 금양임야 9,900㎡ 초과 면적 안분 과세", () => {
    // 총 15,000㎡ 중 9,900㎡만 비과세 → 평가액 3억 × 9900/15000 = 1억9,800만
    const items: ExemptionCheckedItem[] = [
      { ruleId: "inh_forest_burial", claimedAmount: 300_000_000, claimedAreaM2: 15000 },
    ];
    const result = evaluateExemptions(items, 1_000_000_000);
    expect(result.itemResults[0].exemptAmount).toBe(198_000_000);
    expect(result.itemResults[0].taxableOverflow).toBe(102_000_000);
    expect(result.itemResults[0].warnings.some((w) => w.includes("면적"))).toBe(true);
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

  it("[N12b] 공익법인: 특수관계법인 주식 초과 시 경고 포함", () => {
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "inh_public_interest",
        claimedAmount: 1_000_000_000,
        relatedStockExceeded: true,
      },
    ];
    const result = evaluateExemptions(items, 5_000_000_000);
    expect(result.itemResults[0].warnings.some((w) => w.includes("특수관계법인 주식"))).toBe(true);
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

  it("[N17] 공익신탁 §17 룰 등록 + lawRef + unlimited (과세가액 불산입)", () => {
    const rule = findExemptionRuleById("inh_public_trust");
    expect(rule).toBeDefined();
    expect(rule?.category).toBe("inheritance");
    expect(rule?.lawRef).toBe("상증법 §17");
    expect(rule?.limitType).toBe("unlimited");
    // 상속 카테고리 조회에 포함
    expect(
      getExemptionRulesByCategory("inheritance").some((r) => r.id === "inh_public_trust"),
    ).toBe(true);
  });

  it("[N18] 공익신탁 §17 — 전액 불산입 + 사후관리 경고", () => {
    const items: ExemptionCheckedItem[] = [
      { ruleId: "inh_public_trust", claimedAmount: 500_000_000 },
    ];
    const result = evaluateExemptions(items, 2_000_000_000);
    expect(result.itemResults[0].exemptAmount).toBe(500_000_000);
    expect(result.itemResults[0].taxableOverflow).toBe(0);
    // riskNote(§17② 시행령 위임 요건) 경고 포함
    expect(
      result.itemResults[0].warnings.some((w) => w.includes("공익신탁")),
    ).toBe(true);
  });

  it("[N16] ExemptionInput → CheckedItems 변환", () => {
    const input = {
      donatedToState: 100_000_000,
      ceremonialProperty: 5_000_000,
    };
    const items = convertInheritanceExemptionInput(input);
    expect(items.length).toBe(2);
    expect(items.find((i) => i.ruleId === "inh_state_bequest")?.claimedAmount).toBe(100_000_000);
    expect(items.find((i) => i.ruleId === "inh_ritual_items")?.claimedAmount).toBe(5_000_000);
  });
});

// ============================================================
// 3. 금양임야·묘토 면적/금액 한도 (상증령 §8③) — 2026-06-05 신규
// ============================================================

describe("금양임야·묘토 면적/금액 한도 (상증령 §8③)", () => {
  it("[GF-01] 금양임야 면적·금액 한도 이내 — 전액 비과세", () => {
    const r = evaluateExemptions(
      [{ ruleId: "inh_forest_burial", claimedAmount: 100_000_000, claimedAreaM2: 5000 }],
      1_000_000_000,
    );
    expect(r.itemResults[0].exemptAmount).toBe(100_000_000);
    expect(r.itemResults[0].taxableOverflow).toBe(0);
  });

  it("[GF-03] 금양임야 금액 2억 초과 (면적 이내) — 2억 한도", () => {
    const r = evaluateExemptions(
      [{ ruleId: "inh_forest_burial", claimedAmount: 300_000_000, claimedAreaM2: 9000 }],
      1_000_000_000,
    );
    expect(r.itemResults[0].exemptAmount).toBe(200_000_000);
    expect(r.itemResults[0].taxableOverflow).toBe(100_000_000);
    expect(r.itemResults[0].warnings.some((w) => w.includes("2억"))).toBe(true);
  });

  it("[GL-02] 묘토 1,980㎡ 초과 면적 안분", () => {
    const r = evaluateExemptions(
      [{ ruleId: "inh_grave_land", claimedAmount: 24_000_000, claimedAreaM2: 3000 }],
      1_000_000_000,
    );
    expect(r.itemResults[0].exemptAmount).toBe(15_840_000); // floor(2,400만×1980/3000)
  });

  it("[GL-03] 묘토 단독 금액 2억 초과 (면적 이내) — 2억 한도", () => {
    const r = evaluateExemptions(
      [{ ruleId: "inh_grave_land", claimedAmount: 250_000_000, claimedAreaM2: 1500 }],
      1_000_000_000,
    );
    expect(r.itemResults[0].exemptAmount).toBe(200_000_000);
    expect(r.itemResults[0].taxableOverflow).toBe(50_000_000);
  });

  it("[BOTH-02] 금양+묘토 합산 2억 초과 — 비율 안분 클램프", () => {
    const r = evaluateExemptions(
      [
        { ruleId: "inh_forest_burial", claimedAmount: 150_000_000, claimedAreaM2: 9000 },
        { ruleId: "inh_grave_land", claimedAmount: 100_000_000, claimedAreaM2: 1500 },
      ],
      1_000_000_000,
    );
    const forest = r.itemResults.find((x) => x.ruleId === "inh_forest_burial")!;
    const grave = r.itemResults.find((x) => x.ruleId === "inh_grave_land")!;
    expect(forest.exemptAmount).toBe(120_000_000); // floor(2억×1.5/2.5)
    expect(grave.exemptAmount).toBe(80_000_000); // 잔액 흡수
    expect(r.totalExemptAmount).toBe(200_000_000);
  });

  it("[BOTH-03] 금양 면적 초과 후 합산도 2억 초과 (2단계)", () => {
    const r = evaluateExemptions(
      [
        { ruleId: "inh_forest_burial", claimedAmount: 300_000_000, claimedAreaM2: 15000 },
        { ruleId: "inh_grave_land", claimedAmount: 100_000_000, claimedAreaM2: 1500 },
      ],
      2_000_000_000,
    );
    const forest = r.itemResults.find((x) => x.ruleId === "inh_forest_burial")!;
    const grave = r.itemResults.find((x) => x.ruleId === "inh_grave_land")!;
    // 면적 안분: 금양 floor(3억×9900/15000)=198,000,000, 묘토 1억(면적 이내)
    // 합산 2.98억 → floor(2억×198/298)=132,885,906, 묘토 잔액 67,114,094
    expect(forest.exemptAmount).toBe(132_885_906);
    expect(grave.exemptAmount).toBe(67_114_094);
    expect(r.totalExemptAmount).toBe(200_000_000);
  });

  it("[BND-2억] 합산 정확히 2억 — 클램프 미작동", () => {
    const r = evaluateExemptions(
      [
        { ruleId: "inh_forest_burial", claimedAmount: 100_000_000, claimedAreaM2: 5000 },
        { ruleId: "inh_grave_land", claimedAmount: 100_000_000, claimedAreaM2: 1000 },
      ],
      1_000_000_000,
    );
    expect(r.totalExemptAmount).toBe(200_000_000);
    expect(r.itemResults.every((x) => x.taxableOverflow === 0)).toBe(true);
  });

  it("[RITUAL-02] 족보·제구 1천만원 초과 과세", () => {
    const r = evaluateExemptions(
      [{ ruleId: "inh_ritual_items", claimedAmount: 15_000_000 }],
      1_000_000_000,
    );
    expect(r.itemResults[0].exemptAmount).toBe(10_000_000);
    expect(r.itemResults[0].taxableOverflow).toBe(5_000_000);
  });

  it("[ALL-01] 금양+묘토(2억 안분)+족보(1천만)", () => {
    const r = evaluateExemptions(
      [
        { ruleId: "inh_forest_burial", claimedAmount: 150_000_000, claimedAreaM2: 9000 },
        { ruleId: "inh_grave_land", claimedAmount: 100_000_000, claimedAreaM2: 1500 },
        { ruleId: "inh_ritual_items", claimedAmount: 15_000_000 },
      ],
      1_000_000_000,
    );
    const forest = r.itemResults.find((x) => x.ruleId === "inh_forest_burial")!;
    const grave = r.itemResults.find((x) => x.ruleId === "inh_grave_land")!;
    const ritual = r.itemResults.find((x) => x.ruleId === "inh_ritual_items")!;
    expect(forest.exemptAmount + grave.exemptAmount).toBe(200_000_000);
    expect(ritual.exemptAmount).toBe(10_000_000);
    expect(r.totalExemptAmount).toBe(210_000_000);
  });

  it("[DEPREC] areaM2(deprecated) fallback — claimedAreaM2 없을 때", () => {
    const r = evaluateExemptions(
      [{ ruleId: "inh_forest_burial", claimedAmount: 300_000_000, areaM2: 15000 }],
      1_000_000_000,
    );
    expect(r.itemResults[0].exemptAmount).toBe(198_000_000);
    expect(r.itemResults[0].taxableOverflow).toBe(102_000_000);
  });
});
