/**
 * 감사 확정 결함 회귀 테스트 — lib/tax-engine/exemption-rules.ts (+ evaluator·legal-codes)
 *
 * 대상 결함(audit-confirmed):
 *  - exemption-rules.ts:353 gift_disabled_trust 조문 인용 §48①/§46의2 → 상증법 §52의2
 *  - exemption-rules.ts:335 gift_public_trust 조문 인용 §48①/§46 1호 → 상증법 §52
 *  - exemption-rules.ts:161 inh_public_interest lawRef §48① → 상증법 §16①
 *  - exemption-rules.ts:311/322 §46 호번호 오기 (이재구호금품 2호→5호, 국가유공자 6호→9호)
 *
 * 기대값은 현행 상증법 원문(KoreanLaw MCP, MST 276123, 시행 20260102)에서 독립 도출:
 *  §16① = 상속재산 중 공익법인 출연재산 상속세 과세가액 불산입
 *  §46 5호 = 사회통념상 이재구호금품·치료비·생활비·교육비
 *  §46 9호 = 국가유공자 유족 등이 증여받은 성금·물품
 *  §52 = 공익신탁재산에 대한 증여세 과세가액 불산입
 *  §52의2 = 장애인이 증여받은 재산의 과세가액 불산입 (③ 5억 한도, ④ 추징)
 */
import { describe, it, expect } from "vitest";
import { findExemptionRuleById, DISABLED_TRUST_LIMIT } from "@/lib/tax-engine/exemption-rules";
import {
  evaluateExemptions,
  type ExemptionCheckedItem,
} from "@/lib/tax-engine/exemption-evaluator";
import { EXEMPTION } from "@/lib/tax-engine/legal-codes";

describe("audit-fix: exemption-rules 조문 인용 정정", () => {
  // ── 결함 #3: inh_public_interest lawRef ──────────────────────
  it("[AF-1] inh_public_interest.lawRef = 상증법 §16① (§48① 아님)", () => {
    const rule = findExemptionRuleById("inh_public_interest");
    expect(rule?.lawRef).toBe("상증법 §16①");
    expect(rule?.lawRef).not.toBe("상증법 §48①");
    // dual-truth 방지: 상수와 일치
    expect(rule?.lawRef).toBe(EXEMPTION.INH_PUBLIC_CONTRIBUTION);
  });

  it("[AF-2] inh_public_interest 평가 appliedLaws에 §16① 포함·§48① 미포함, 불산입액 불변", () => {
    const items: ExemptionCheckedItem[] = [
      { ruleId: "inh_public_interest", claimedAmount: 100_000_000 },
    ];
    const r = evaluateExemptions(items, 1_000_000_000, "inheritance");
    expect(r.appliedLaws).toContain("상증법 §16①");
    expect(r.appliedLaws).not.toContain("상증법 §48①");
    // 인용-only 수정: 세액 산출값(불산입액)은 종전과 동일 (전액 불산입)
    expect(r.itemResults[0].exemptAmount).toBe(100_000_000);
    expect(r.totalExemptAmount).toBe(100_000_000);
  });

  // ── 결함 #2: gift_public_trust ──────────────────────────────
  it("[AF-3] gift_public_trust.lawRef = 상증법 §52, description에 §52 포함·§46/§48 미포함", () => {
    const rule = findExemptionRuleById("gift_public_trust");
    expect(rule?.lawRef).toBe("상증법 §52");
    expect(rule?.lawRef).toBe(EXEMPTION.GIFT_PUBLIC_TRUST);
    expect(rule?.description).toContain("§52");
    expect(rule?.description).not.toContain("§46");
    expect(rule?.description).not.toContain("§48");
  });

  // ── 결함 #1: gift_disabled_trust ────────────────────────────
  it("[AF-4] gift_disabled_trust.lawRef = 상증법 §52의2, description/riskNote §52의2·§46의2 미포함", () => {
    const rule = findExemptionRuleById("gift_disabled_trust");
    expect(rule?.lawRef).toBe("상증법 §52의2");
    expect(rule?.lawRef).toBe(EXEMPTION.DISABLED_TRUST_EXCLUSION);
    expect(rule?.lawRef).not.toBe("상증법 §48①");
    expect(rule?.description).toContain("§52의2");
    expect(rule?.description).not.toContain("§46의2");
    // 추징 근거는 §52의2④
    expect(rule?.riskNote).toContain("§52의2④");
    expect(rule?.riskNote).not.toContain("§46의2");
  });

  it("[AF-5] 장애인 신탁 평가 breakdown 한도 근거 = 상증법 §52의2③, 5억 한도 계산 불변", () => {
    // 한도 이내
    const within = evaluateExemptions(
      [{ ruleId: "gift_disabled_trust", claimedAmount: 300_000_000 }],
      1_000_000_000,
      "gift",
    );
    const limitStep = within.itemResults[0].breakdown[0];
    expect(limitStep.lawRef).toBe("상증법 §52의2③");
    expect(limitStep.lawRef).toBe(EXEMPTION.DISABLED_TRUST_LIMIT_REF);
    expect(within.itemResults[0].exemptAmount).toBe(300_000_000);
    expect(within.itemResults[0].taxableOverflow).toBe(0);
    // 추징 경고 §52의2④ 유지
    expect(within.itemResults[0].warnings.some((w) => w.includes("§52의2④"))).toBe(true);

    // 5억 한도 초과 — 산출 로직 불변 확인
    const over = evaluateExemptions(
      [{ ruleId: "gift_disabled_trust", claimedAmount: 600_000_000 }],
      2_000_000_000,
      "gift",
    );
    expect(DISABLED_TRUST_LIMIT).toBe(500_000_000);
    expect(over.itemResults[0].exemptAmount).toBe(500_000_000);
    expect(over.itemResults[0].taxableOverflow).toBe(100_000_000);
  });

  // ── 결함 #4: §46 호번호 오기 ────────────────────────────────
  it("[AF-6] gift_disaster_relief description = §46 5호 (2호 아님)", () => {
    const rule = findExemptionRuleById("gift_disaster_relief");
    expect(rule?.description).toContain("§46 5호");
    expect(rule?.description).not.toContain("§46 2호");
  });

  it("[AF-7] gift_veterans_benefit description = §46 9호 (6호 아님)", () => {
    const rule = findExemptionRuleById("gift_veterans_benefit");
    expect(rule?.description).toContain("§46 9호");
    expect(rule?.description).not.toContain("§46 6호");
  });
});
