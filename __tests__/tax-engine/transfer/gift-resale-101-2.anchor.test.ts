/**
 * 소득세법 §101② 증여 후 10년 내 양도 부당행위계산부인 — 판정 함수 anchor (Pre-Do · P0)
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §4·§5.1·§6
 *
 * 교재 사례: 갑 → 형 을 토지 증여(등기 2026.2.1.) → 을 2026.4.5. 양도. 을에게 실질 귀속 없음.
 * - 1호 = 증여세(산출 6,500,000 − 신고세액공제 195,000 = 6,305,000) + 을 결정세액 36,250,000 = 42,555,000
 * - 2호 = 갑 직접양도 결정세액 13,704,000
 * - 1호 ≥ 2호 → 부인 미적용. 납세의무자 을, 최종부담 42,555,000(지방소득세 별도).
 * 1·2호의 결정세액은 `gift-resale-101-2-e2e-engine.anchor.test.ts`가 실제 엔진으로 고정한다.
 */
import { describe, it, expect } from "vitest";
import { judgeGiftResale1012 } from "@/lib/tax-engine/gift-resale-101-2";

const TEXTBOOK = {
  relation: "related" as const,
  giftRegistryDate: new Date("2026-02-01T00:00:00Z"),
  transferDate: new Date("2026-04-05T00:00:00Z"),
  substantiveAttribution: "no" as const,
  isBurdenedGift: false,
  donorDeceasedAtTransfer: false,
  donorHasOtherTransfersSameYear: false,
  doneeHasOtherTransfersSameYear: false,
  giftTaxIncludesOtherAssets: false,
  giftTaxCalculated: 6_500_000,
  giftTaxCreditsAndReductions: 195_000,
  doneeTransferDeterminedTax: 36_250_000,
  donorTransferDeterminedTax: 13_704_000,
};

describe("§101② 교재 사례 (P0 anchor)", () => {
  it("1호 42,555,000 ≥ 2호 13,704,000 → 미적용 · 수증자 납세 · 최종부담 42,555,000", () => {
    const r = judgeGiftResale1012(TEXTBOOK);
    expect(r.outcome).toBe("not_applied");
    expect(r.reasonCode).toBe("clause1_not_less");
    expect(r.clause1Tax).toBe(42_555_000);
    expect(r.clause2Tax).toBe(13_704_000);
    expect(r.taxpayer).toBe("donee");
    expect(r.finalBurden).toBe(42_555_000);
    expect(r.periodYears).toBe(10);
    expect(r.needsConfirmation).toEqual([]);
  });

  it("증여세를 산출세액 그대로(공제 0) 넣어도 결론 같음 — 1호 42,750,000", () => {
    const r = judgeGiftResale1012({ ...TEXTBOOK, giftTaxCreditsAndReductions: 0 });
    expect(r.outcome).toBe("not_applied");
    expect(r.clause1Tax).toBe(42_750_000);
    expect(r.finalBurden).toBe(42_750_000);
  });

  it("거울 사례(K-1): 1호 < 2호면 부인 적용 · 증여자 납세 · 최종부담 = 2호(증여세 미부과 §101③)", () => {
    const r = judgeGiftResale1012({
      ...TEXTBOOK,
      doneeTransferDeterminedTax: 5_000_000, // 1호 = 6,305,000 + 5,000,000 = 11,305,000 < 13,704,000
    });
    expect(r.outcome).toBe("applied");
    expect(r.reasonCode).toBe("applied");
    expect(r.clause1Tax).toBe(11_305_000);
    expect(r.taxpayer).toBe("donor");
    expect(r.finalBurden).toBe(13_704_000);
  });
});

/** K-1 형태(1호 11,305,000 < 2호 13,704,000)를 기준으로 한 축씩 바꾼다 */
const APPLIED = { ...TEXTBOOK, doneeTransferDeterminedTax: 5_000_000 };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("§101② 케이스 매트릭스 K-1~K-18", () => {
  it("K-3 1호 = 2호 → 미적용(「적은 경우」만 부인)", () => {
    const r = judgeGiftResale1012({ ...APPLIED, doneeTransferDeterminedTax: 13_704_000 - 6_305_000 });
    expect(r.clause1Tax).toBe(13_704_000);
    expect(r.outcome).toBe("not_applied");
    expect(r.reasonCode).toBe("clause1_not_less");
  });

  it("K-4 실질귀속(단서) → 미적용 · 수증자 1호 부담", () => {
    const r = judgeGiftResale1012({ ...APPLIED, substantiveAttribution: "yes" });
    expect(r).toMatchObject({ outcome: "not_applied", reasonCode: "attributed_to_donee", taxpayer: "donee", finalBurden: 11_305_000 });
  });

  it("K-6 증여일부터 10년 초과 → 미적용", () => {
    const r = judgeGiftResale1012({ ...APPLIED, giftRegistryDate: d("2023-03-01"), transferDate: d("2033-03-02") });
    expect(r).toMatchObject({ outcome: "not_applied", reasonCode: "period_exceeded", periodYears: 10 });
  });

  it("경계 — 10년 되는 날 당일은 기간 안(적용) · 다음날은 초과", () => {
    const onDay = judgeGiftResale1012({ ...APPLIED, giftRegistryDate: d("2023-03-01"), transferDate: d("2033-03-01") });
    expect(onDay.deadline).toEqual(d("2033-03-01"));
    expect(onDay.outcome).toBe("applied");
    const next = judgeGiftResale1012({ ...APPLIED, giftRegistryDate: d("2023-03-01"), transferDate: d("2033-03-02") });
    expect(next.outcome).toBe("not_applied");
  });

  it("K-7 경계 — 증여 등기 2022-12-31은 5년 · 2023-01-01은 10년", () => {
    const before = judgeGiftResale1012({ ...APPLIED, giftRegistryDate: d("2022-12-31"), transferDate: d("2028-01-01") });
    expect(before).toMatchObject({ periodYears: 5, outcome: "not_applied", reasonCode: "period_exceeded" });
    expect(before.deadline).toEqual(d("2027-12-31"));
    const after = judgeGiftResale1012({ ...APPLIED, giftRegistryDate: d("2023-01-01"), transferDate: d("2028-01-01") });
    expect(after).toMatchObject({ periodYears: 10, outcome: "applied" });
  });

  it("K-8·K-9 배우자·직계존비속 → 차단(이월과세 적용·배제 불문, Q-1)", () => {
    const r = judgeGiftResale1012({ ...APPLIED, relation: "spouse_lineal" });
    expect(r).toMatchObject({ outcome: "out_of_scope", reasonCode: "relation_spouse_lineal", taxpayer: null, finalBurden: null });
  });

  it("K-10 특수관계 없음 → 미적용", () => {
    const r = judgeGiftResale1012({ ...APPLIED, relation: "none" });
    expect(r).toMatchObject({ outcome: "not_applied", reasonCode: "relation_none", taxpayer: "donee" });
  });

  it("K-11 증여자 비과세(2호 0원) → 1호 ≥ 2호로 미적용", () => {
    const r = judgeGiftResale1012({ ...APPLIED, donorTransferDeterminedTax: 0 });
    expect(r).toMatchObject({ outcome: "not_applied", reasonCode: "clause1_not_less" });
  });

  it("K-12 부담부증여 → 차단(Q-5)", () => {
    expect(judgeGiftResale1012({ ...APPLIED, isBurdenedGift: true })).toMatchObject({ outcome: "out_of_scope", reasonCode: "burdened_gift" });
  });

  it("K-13 양도일 현재 증여자 사망 → 차단(근거가 구법 해석뿐)", () => {
    expect(judgeGiftResale1012({ ...APPLIED, donorDeceasedAtTransfer: true })).toMatchObject({ outcome: "out_of_scope", reasonCode: "donor_deceased" });
  });

  it("K-15 경계 — 양도일 2012-12-31 차단 · 2013-01-01 판정", () => {
    const before = judgeGiftResale1012({ ...APPLIED, giftRegistryDate: d("2010-06-01"), transferDate: d("2012-12-31") });
    expect(before).toMatchObject({ outcome: "out_of_scope", reasonCode: "before_2013" });
    const from = judgeGiftResale1012({ ...APPLIED, giftRegistryDate: d("2010-06-01"), transferDate: d("2013-01-01") });
    expect(from).toMatchObject({ outcome: "applied", periodYears: 5 });
  });

  it("K-17·K-18 토글은 결론·금액을 바꾸지 않고 확인 필요만 더한다", () => {
    const off = judgeGiftResale1012(APPLIED);
    const on = judgeGiftResale1012({
      ...APPLIED,
      donorHasOtherTransfersSameYear: true,
      giftTaxIncludesOtherAssets: true,
    });
    expect(on.outcome).toBe(off.outcome);
    expect(on.finalBurden).toBe(off.finalBurden);
    expect(off.needsConfirmation).toEqual([]);
    expect(on.needsConfirmation).toEqual(["other_transfers_same_year", "gift_tax_includes_other_assets"]);
    // 수증자 쪽 토글도 같은 항목
    expect(judgeGiftResale1012({ ...APPLIED, doneeHasOtherTransfersSameYear: true }).needsConfirmation)
      .toEqual(["other_transfers_same_year"]);
  });
});
