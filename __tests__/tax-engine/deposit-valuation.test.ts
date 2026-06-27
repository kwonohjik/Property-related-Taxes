import { describe, it, expect } from "vitest";
import { differenceInDays, parseISO } from "date-fns";
// ⚠️ Pre-Do anchor — computeSavingsAccrual은 아직 미구현(Do에서 추가). 본 anchor는 실패 확보용.
import { computeSavingsAccrual } from "@/lib/tax-engine/property-valuation";

// ============================================================
// 예금·저금·적금 §63④ 평가 — Pre-Do anchor
// 출처: 상증기준 63-58의 2-10 정기예금 계산사례 (이미지2)
//   예금기간 2007.7.1~2009.6.30 · 평가기준일 2008.5.1 · 10억 · 연 5% · 원천징수 14%
//   PDF 평가액 1,035,346,575 / 엔진값 1,035,346,576 (지방소득세 floor, ±1 tolerance)
// ============================================================

describe("예금·적금 §63④ 평가 — Pre-Do anchor (상증기준 63-58의 2-10)", () => {
  it("[probe] 경과일수 = 305일 (2007-07-01 → 2008-05-01, 초일불산입)", () => {
    expect(differenceInDays(parseISO("2008-05-01"), parseISO("2007-07-01"))).toBe(305);
  });

  it("[anchor 3b] computeSavingsAccrual — 정기예금 10억·연5%·305일·원천징수14%·지방세포함", () => {
    const r = computeSavingsAccrual({
      principal: 1_000_000_000,
      annualRate: 5,
      startDate: parseISO("2007-07-01"),
      valuationDate: parseISO("2008-05-01"),
      withholdingRate: 14,
      includeLocalTax: true,
    });
    expect(r.elapsedDays).toBe(305);
    expect(r.accruedInterest).toBe(41_780_822); // ㉡ 미수이자 (round-half-up)
    expect(r.incomeWithholding).toBe(5_849_315); // ㉢-1 이자소득세 (floor, 소득세법 §129①1라)
    expect(r.localIncomeTax).toBe(584_931); // ㉢-2 지방소득세 (floor, 지방세법 §103의13①)
    expect(r.withholdingTax).toBe(6_434_246); // ㉢
    expect(r.valuatedAmount).toBe(1_035_346_576); // ㉠+㉡−㉢ (엔진 floor)
    // PDF(1,035,346,575)와 1원 tolerance — 지방소득세 PDF round / 엔진 floor (국고금관리법 §47: 원 단위)
    expect(Math.abs(r.valuatedAmount - 1_035_346_575)).toBeLessThanOrEqual(1);
  });

  it("[anchor 4] 지방소득세 제외 (includeLocalTax=false)", () => {
    const r = computeSavingsAccrual({
      principal: 1_000_000_000,
      annualRate: 5,
      startDate: parseISO("2007-07-01"),
      valuationDate: parseISO("2008-05-01"),
      withholdingRate: 14,
      includeLocalTax: false,
    });
    expect(r.localIncomeTax).toBe(0);
    expect(r.valuatedAmount).toBe(1_035_931_507); // 1,000,000,000 + 41,780,822 − 5,849,315
  });

  it("[anchor 5] 평가기준일 < 이자기산일 → 미수이자 0 가드", () => {
    const r = computeSavingsAccrual({
      principal: 1_000_000_000,
      annualRate: 5,
      startDate: parseISO("2008-05-01"),
      valuationDate: parseISO("2007-07-01"), // 역전
      withholdingRate: 14,
      includeLocalTax: true,
    });
    expect(r.elapsedDays).toBe(0);
    expect(r.accruedInterest).toBe(0);
    expect(r.valuatedAmount).toBe(1_000_000_000); // 원금만
  });
});
