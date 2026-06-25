import { describe, it, expect } from "vitest";
import { calcMergerGift } from "@/lib/tax-engine/gift-deemed/merger";

/**
 * 합병 §38 보완 — 교재 사례1·2 anchor (gift-merger-supplement.engine.design.md C1~C10).
 * Phase A: 단순평균액 자동(§28⑤) · Phase B: 자기증여 차감·증여자별 안분(재산세과-799 + 사례2).
 */

// ── C1·C2 회귀(직접입력 — 기본 direct) ──
describe("C1·C2 회귀 (mergedPriceMode 기본 direct)", () => {
  it("[MRG-1] direct 주식교부 = 250,000,000", () => {
    const r = calcMergerGift({
      mergedSharePrice: 15_000, overvaluedSharePrice: 10_000,
      preMergerShares: 100, exchangedShares: 100, majorShares: 50_000,
    });
    expect(r.deemedGiftValue).toBe(250_000_000);
  });
  it("[MRG-NS] 주식외 = 400,000,000", () => {
    const r = calcMergerGift({
      caseType: "non_stock", faceValue: 5_000, overvaluedSharePrice: 3_000, majorShares: 200_000,
    });
    expect(r.deemedGiftValue).toBe(400_000_000);
  });
});

// ── C3 사례1: 비상장 1:1, 단순평균액 auto ──
// A(과대평가 40,000)·B(과소평가 30,000) 흡수합병. 이익측=B 주주.
// over=B(이익측 30,000), under=A(40,000). 합병후 단순평균액 = (200,000×40,000 + 100,000×30,000)/300,000 = 36,666
describe("C3 사례1 — 단순평균액 auto (비상장)", () => {
  const base = {
    caseType: "stock" as const,
    mergedPriceMode: "auto" as const,
    overvaluedSharePrice: 30_000, // 이익측 B 1주평가 (나목 베이스)
    preMergerShares: 100_000,     // B 합병전 주식수
    exchangedShares: 100_000,     // B→A' 교부(1:1)
    underSharePrice: 40_000,      // 반대측 A 1주평가
    underPreShares: 200_000,      // A 합병전 주식수
    postMergerTotalShares: 300_000,
  };
  it("[MRG-S1-병] 단순평균액 36,666 → 병 466,620,000", () => {
    const r = calcMergerGift({ ...base, majorShares: 70_000 });
    expect(r.thresholdEcho?.computedMergedPrice).toBe(36_666);
    expect(r.deemedGiftValue).toBe(466_620_000);
  });
  it("[MRG-S1-정] 199,980,000 < 3억 → 제외(0)", () => {
    const r = calcMergerGift({ ...base, majorShares: 30_000 });
    expect(r.deemedGiftValue).toBe(0);
  });
});

// ── C4 사례2: 비상장 1:0.5, 단순평균액 40,000 ──
describe("C4 사례2 — 단순평균액 auto (합병비율≠1)", () => {
  it("[MRG-S2] 단순평균액 40,000 → 갑 차감전 1,400,000,000", () => {
    const r = calcMergerGift({
      caseType: "stock", mergedPriceMode: "auto",
      overvaluedSharePrice: 10_000, preMergerShares: 200_000, exchangedShares: 100_000,
      underSharePrice: 50_000, underPreShares: 200_000, postMergerTotalShares: 300_000,
      majorShares: 70_000,
    });
    expect(r.thresholdEcho?.computedMergedPrice).toBe(40_000);
    expect(r.deemedGiftValue).toBe(1_400_000_000);
  });
});

// ── C8·C9 사례2 매트릭스 (자기증여 차감 + 증여자별 안분) ──
describe("C8·C9 사례2 — 주주 매트릭스", () => {
  const r = calcMergerGift({
    caseType: "stock", mergedPriceMode: "auto",
    overvaluedSharePrice: 10_000, underSharePrice: 50_000,
    preMergerShares: 200_000, exchangedShares: 100_000, postMergerTotalShares: 300_000,
    underPreShares: 200_000, majorShares: 0, // 매트릭스 모드는 majorShares 미사용
    shareholders: {
      overvalued: [ { id: "gap", name: "갑", shares: 140_000 }, { id: "byung", name: "병", shares: 60_000 } ],
      undervalued: [ { id: "gap", name: "갑", shares: 100_000 }, { id: "eul", name: "을", shares: 60_000 }, { id: "small", name: "소액", shares: 40_000 } ],
      exchangeRatio: { numer: 1, denom: 2 },
    },
  });
  const m = () => r.mergerMatrix!;
  it("갑 self 1,000,000,000 · 순 400,000,000", () => {
    const gap = m().recipients.find((x) => x.id === "gap")!;
    expect(gap.grossGain).toBe(1_400_000_000);
    expect(gap.selfGift).toBe(1_000_000_000);
    expect(gap.netGain).toBe(400_000_000);
  });
  it("병 순 600,000,000 (self 0)", () => {
    const byung = m().recipients.find((x) => x.id === "byung")!;
    expect(byung.netGain).toBe(600_000_000);
    expect(byung.selfGift).toBe(0);
  });
  it("갑 증여자별 안분: 을 240,000,000 · 소액 160,000,000", () => {
    expect(m().allocation["gap"]["eul"]).toBe(240_000_000);
    expect(m().allocation["gap"]["small"]).toBe(160_000_000);
  });
  it("병 증여자별 안분: 갑 300,000,000 · 을 180,000,000 · 소액 120,000,000", () => {
    expect(m().allocation["byung"]["gap"]).toBe(300_000_000);
    expect(m().allocation["byung"]["eul"]).toBe(180_000_000);
    expect(m().allocation["byung"]["small"]).toBe(120_000_000);
  });
  it("자기일관성: Σ안분 = 순이익", () => {
    for (const rec of m().recipients) {
      const sum = Object.values(m().allocation[rec.id] ?? {}).reduce((a, b) => a + b, 0);
      expect(sum).toBe(rec.netGain);
    }
  });
});

// ── C11 분할합병 §28⑦ (2016.2.4 이전 순자산비율 안분) ──
describe("C11 분할합병 — 순자산비율 안분 (상증칙 §10의2)", () => {
  it("[SPLIT-1] 분할직전 50,000 × (순자산 30억/100억) = 과대평가 1주 15,000 → 350,000,000", () => {
    const r = calcMergerGift({
      isSplitMerger: true,
      splitValuationMode: "net_asset_ratio",
      splitCompanyPreSharePrice: 50_000,
      splitBusinessNetAsset: 3_000_000_000,
      splitCompanyNetAsset: 10_000_000_000,
      // → overvaluedSharePrice(분할사업부문 합병전 1주평가) = 15,000
      overvaluedSharePrice: 0, // 분할합병 시 안분으로 대체
      mergedSharePrice: 20_000,
      preMergerShares: 100_000,
      exchangedShares: 100_000,
      majorShares: 70_000,
    });
    // ㉯ = 15,000 × (100,000/100,000) = 15,000 / perShare = 20,000−15,000 = 5,000 / ×70,000 = 350,000,000
    // threshold = Min(20,000×70,000×0.3, 3억) = 3억. 350,000,000 ≥ 3억 → 적용
    expect(r.deemedGiftValue).toBe(350_000_000);
  });
  it("[SPLIT-2] 보충평가 모드(2016.2.5~)는 overvaluedSharePrice 직접 사용", () => {
    const r = calcMergerGift({
      isSplitMerger: true,
      splitValuationMode: "supplementary",
      overvaluedSharePrice: 15_000, // §63①1나 보충평가액 직접
      mergedSharePrice: 20_000,
      preMergerShares: 100_000,
      exchangedShares: 100_000,
      majorShares: 70_000,
    });
    expect(r.deemedGiftValue).toBe(350_000_000);
  });
});
