/**
 * 갭5a — 공익법인 동족주식 한도 자동계산 (상증법 §16②)
 * 계획: docs/00-pm/inheritance-gaps.plan.md §3 · 설계: inheritance-gaps.engine.design.md 케이스 5a-1~7
 * 법령: KoreanLaw §16② 원문 검증 2026-06-19 (본문 10%·가목 20%·나목/다목 5%)
 */
import { describe, it, expect } from "vitest";

import {
  computeRelatedStockExcess,
  hasAutoRelatedStockInput,
} from "@/lib/tax-engine/public-interest-stock-limit";
import { evaluateExemptions } from "@/lib/tax-engine/exemption-evaluator";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/types/inheritance-exemption.types";

describe("computeRelatedStockExcess — §16② 유형별 한도", () => {
  it("[5a-1] 일반 공익법인 10% — 발행10만·출연1.5만 → 초과5천주·50,000,000", () => {
    const r = computeRelatedStockExcess({
      donatedShares: 15_000,
      totalShares: 100_000,
      priorHeld: 0,
      type: "general",
      valuePerShare: 10_000,
    });
    expect(r.ratio).toBe(0.1);
    expect(r.limitShares).toBe(10_000);
    expect(r.excessShares).toBe(5_000);
    expect(r.excessStockAmount).toBe(50_000_000);
  });

  it("[5a-2] 가목 20%(자선·장학·사회복지+의결권미행사) — 한도2만 ≥ 출연1.5만 → 초과 0", () => {
    const r = computeRelatedStockExcess({
      donatedShares: 15_000,
      totalShares: 100_000,
      priorHeld: 0,
      type: "charity_no_voting",
      valuePerShare: 10_000,
    });
    expect(r.ratio).toBe(0.2);
    expect(r.limitShares).toBe(20_000);
    expect(r.excessShares).toBe(0);
    expect(r.excessStockAmount).toBe(0);
  });

  it("[5a-3] 나목 5%(상호출자제한 특수관계) — 한도5천·초과1만·100,000,000", () => {
    const r = computeRelatedStockExcess({
      donatedShares: 15_000,
      totalShares: 100_000,
      priorHeld: 0,
      type: "mutual_investment_restricted",
      valuePerShare: 10_000,
    });
    expect(r.ratio).toBe(0.05);
    expect(r.limitShares).toBe(5_000);
    expect(r.excessShares).toBe(10_000);
    expect(r.excessStockAmount).toBe(100_000_000);
  });

  it("[5a-4] 다목 5%(§48⑪ 미충족) — 나목과 동일 비율", () => {
    const r = computeRelatedStockExcess({
      donatedShares: 15_000,
      totalShares: 100_000,
      priorHeld: 0,
      type: "art48_11_unmet",
      valuePerShare: 10_000,
    });
    expect(r.ratio).toBe(0.05);
    expect(r.excessShares).toBe(10_000);
    expect(r.excessStockAmount).toBe(100_000_000);
  });

  it("[5a-5] 기보유분 차감 — 발행10만·10%·기보유3천·출연1만 → 한도7천·초과3천·30,000,000", () => {
    const r = computeRelatedStockExcess({
      donatedShares: 10_000,
      totalShares: 100_000,
      priorHeld: 3_000,
      type: "general",
      valuePerShare: 10_000,
    });
    expect(r.limitShares).toBe(7_000);
    expect(r.excessShares).toBe(3_000);
    expect(r.excessStockAmount).toBe(30_000_000);
  });

  it("[5a-5b] 기보유분 > 한도 → 한도 0(전량 초과 가능)", () => {
    const r = computeRelatedStockExcess({
      donatedShares: 5_000,
      totalShares: 100_000,
      priorHeld: 12_000, // 발행×10%=1만 < 기보유 1.2만
      type: "general",
      valuePerShare: 10_000,
    });
    expect(r.limitShares).toBe(0);
    expect(r.excessShares).toBe(5_000);
  });

  it("hasAutoRelatedStockInput — 유형+주식수+발행+단가 모두 유효해야 true", () => {
    expect(
      hasAutoRelatedStockInput({
        publicInterestType: "general",
        relatedStockDonatedShares: 15_000,
        relatedStockTotalShares: 100_000,
        relatedStockValuePerShare: 10_000,
      }),
    ).toBe(true);
    expect(hasAutoRelatedStockInput({ publicInterestType: "general" })).toBe(false);
    expect(
      hasAutoRelatedStockInput({
        relatedStockDonatedShares: 15_000,
        relatedStockTotalShares: 100_000,
        relatedStockValuePerShare: 10_000,
      }),
    ).toBe(false);
  });
});

describe("evaluateExemptions 통합 — §16② 자동 산입 + lawRef §16①", () => {
  it("[5a-6] 자동계산 입력 시 초과분 50,000,000 과세가액 산입", () => {
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "inh_public_interest",
        claimedAmount: 150_000_000, // 1.5만주 × 1만원
        publicInterestType: "general",
        relatedStockDonatedShares: 15_000,
        relatedStockTotalShares: 100_000,
        relatedStockValuePerShare: 10_000,
      },
    ];
    const r = evaluateExemptions(items, 5_000_000_000);
    expect(r.itemResults[0].taxableOverflow).toBe(50_000_000);
    expect(r.itemResults[0].exemptAmount).toBe(100_000_000);
  });

  it("[5a-6b] 과소과세 회귀 가드 — 자동/수동 입력 부재 시 전액 불산입(taxableOverflow 0)", () => {
    // 미입력 시 한도 적용 없이 전액 불산입 → 자동계산 도입 전 동작 보존(주식 출연 아닌 일반 출연 케이스).
    const items: ExemptionCheckedItem[] = [
      { ruleId: "inh_public_interest", claimedAmount: 150_000_000 },
    ];
    const r = evaluateExemptions(items, 5_000_000_000);
    expect(r.itemResults[0].taxableOverflow).toBe(0);
    expect(r.itemResults[0].exemptAmount).toBe(150_000_000);
  });

  it("[5a-7] lawRef 정정 — 상속 불산입 breakdown은 §16①(§48① 아님)", () => {
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "inh_public_interest",
        claimedAmount: 150_000_000,
        publicInterestType: "general",
        relatedStockDonatedShares: 15_000,
        relatedStockTotalShares: 100_000,
        relatedStockValuePerShare: 10_000,
      },
    ];
    const r = evaluateExemptions(items, 5_000_000_000);
    const refs = r.itemResults[0].breakdown.map((b) => b.lawRef);
    expect(refs).toContain("상증법 §16①");
    expect(refs).not.toContain("상증법 §48①");
  });

  it("[5a-8] 수동 fallback 보존 — excessStockAmount 직접 입력", () => {
    const items: ExemptionCheckedItem[] = [
      {
        ruleId: "inh_public_interest",
        claimedAmount: 150_000_000,
        relatedStockExceeded: true,
        excessStockAmount: 70_000_000,
      },
    ];
    const r = evaluateExemptions(items, 5_000_000_000);
    expect(r.itemResults[0].taxableOverflow).toBe(70_000_000);
    expect(r.itemResults[0].exemptAmount).toBe(80_000_000);
  });
});
