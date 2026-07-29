import { describe, it, expect } from "vitest";
import { calcCapitalDecreaseGift } from "@/lib/tax-engine/gift-deemed/capital-decrease";
import type { CapitalDecreaseInput } from "@/lib/tax-engine/gift-deemed/types";

// §39의2 감자에 따른 이익의 증여 — 불균등 감자 N:N 다주주 안분 anchor.
// 교재 두 계산사례(저가소각·고가소각) 재현. 지분율 정확분수(D5). 원단위 toBe.

// ── 사례1 저가소각 (M1 계열) ──────────────────────────────────────────────
describe("§39의2 감자 다주주 저가소각 — 사례1 (M1 anchor)", () => {
  const case1Input: CapitalDecreaseInput = {
    sharePrice: 30_000,
    preTotalShares: 200_000,
    shareholders: [
      { id: "s1", name: "갑", preShares: 100_000, redeemedShares: 100_000, redemptionPricePerShare: 10_000, relationGroup: "family_A" },
      { id: "s2", name: "을", preShares: 30_000, redeemedShares: 30_000, redemptionPricePerShare: 10_000, relationGroup: "family_A" },
      { id: "s3", name: "병", preShares: 60_000, redeemedShares: 0, relationGroup: "family_A" },
      { id: "s4", name: "소액주주", preShares: 10_000, redeemedShares: 0, relationGroup: "other" },
    ],
  };

  it("[M1-f] 감자후 1주평가 표시 = 67,143", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    expect(r.capitalDecreaseMulti?.postPerShareDisplay).toBe(67_143);
  });

  it("[M1-a] 병 ← 갑 = 1,714,285,714", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "병");
    const fromGab = byeong?.fromDonors.find((fd) => fd.donorName === "갑");
    expect(fromGab?.amount).toBe(1_714_285_714);
  });

  it("[M1-b] 병 ← 을 = 514,285,714", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "병");
    const fromEul = byeong?.fromDonors.find((fd) => fd.donorName === "을");
    expect(fromEul?.amount).toBe(514_285_714);
  });

  it("[M1-c] 병 총 = 2,228,571,428 (자기일관)", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "병");
    expect(byeong?.total).toBe(2_228_571_428);
  });

  it("[M1-d] 소액주주 isTaxable=false, potentialAmount=371,428,571", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const soaek = r.capitalDecreaseMulti?.donees.find((d) => d.name === "소액주주");
    expect(soaek?.isTaxable).toBe(false);
    expect(soaek?.potentialAmount).toBe(371_428_571);
  });

  it("[M1-e] 기준금액 = 0 (차액비율 66.7% ≥ 30%)", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "병");
    expect(byeong?.thresholdApplied).toBe(0);
  });

  it("[M1-g] 검증표 병 증감 = 2,228,571,428 (자기일관)", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeongVerif = r.capitalDecreaseMulti?.verification.find((v) => v.name === "병");
    expect(byeongVerif?.delta).toBe(2_228_571_428);
  });

  it("[M1 검증표 합계] Σ delta = 0 (자기일관)", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const sumDelta = r.capitalDecreaseMulti?.verification.reduce((a, v) => a + v.delta, 0) ?? -1;
    expect(sumDelta).toBe(0);
  });

  it("[M1-c 자기일관] Σ fromDonors = donee.total", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    const byeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "병");
    const sum = byeong?.fromDonors.reduce((acc, fd) => acc + fd.amount, 0) ?? 0;
    expect(sum).toBe(byeong?.total);
  });

  it("[deemedGiftValue 하위호환] 과세 수증자 총합 = 2,228,571,428", () => {
    const r = calcCapitalDecreaseGift(case1Input);
    expect(r.deemedGiftValue).toBe(2_228_571_428);
  });
});

// ── 사례2 고가소각 (M2 계열) ──────────────────────────────────────────────
describe("§39의2 감자 다주주 고가소각 — 사례2 (M2 anchor)", () => {
  const case2Input: CapitalDecreaseInput = {
    sharePrice: 6_000,
    faceValue: 10_000, // eval(6000) < face(10000) → 액면 게이트 충족
    preTotalShares: 200_000,
    shareholders: [
      { id: "s1", name: "갑", preShares: 80_000, redeemedShares: 0, relationGroup: "family_B" },
      { id: "s2", name: "을", preShares: 40_000, redeemedShares: 0, relationGroup: "family_B" },
      { id: "s3", name: "병", preShares: 60_000, redeemedShares: 60_000, redemptionPricePerShare: 9_000, relationGroup: "family_B" },
      { id: "s4", name: "정", preShares: 20_000, redeemedShares: 20_000, redemptionPricePerShare: 9_000, relationGroup: "family_B" },
    ],
  };

  it("[M2-h] 감자후 1주평가 = 4,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    expect(r.capitalDecreaseMulti?.postPerShareDisplay).toBe(4_000);
  });

  it("[M2-a] 병 ← 갑 = 120,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const byeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "병");
    expect(byeong?.fromDonors.find((fd) => fd.donorName === "갑")?.amount).toBe(120_000_000);
  });

  it("[M2-b] 병 ← 을 = 60,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const byeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "병");
    expect(byeong?.fromDonors.find((fd) => fd.donorName === "을")?.amount).toBe(60_000_000);
  });

  it("[M2-c] 병 총 = 180,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    expect(r.capitalDecreaseMulti?.donees.find((d) => d.name === "병")?.total).toBe(180_000_000);
  });

  it("[M2-d] 정 ← 갑 = 40,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const jeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "정");
    expect(jeong?.fromDonors.find((fd) => fd.donorName === "갑")?.amount).toBe(40_000_000);
  });

  it("[M2-e] 정 ← 을 = 20,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const jeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "정");
    expect(jeong?.fromDonors.find((fd) => fd.donorName === "을")?.amount).toBe(20_000_000);
  });

  it("[M2-f] 정 총 = 60,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    expect(r.capitalDecreaseMulti?.donees.find((d) => d.name === "정")?.total).toBe(60_000_000);
  });

  it("[M2-g] 기준금액 = 0 (차액비율 50% ≥ 30%)", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    expect(r.capitalDecreaseMulti?.donees.find((d) => d.name === "병")?.thresholdApplied).toBe(0);
  });

  it("[M2-i 자기일관] Σ fromDonors(병)=M2-c / Σ fromDonors(정)=M2-f", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    const byeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "병");
    const jeong = r.capitalDecreaseMulti?.donees.find((d) => d.name === "정");
    expect(byeong?.fromDonors.reduce((a, fd) => a + fd.amount, 0)).toBe(180_000_000);
    expect(jeong?.fromDonors.reduce((a, fd) => a + fd.amount, 0)).toBe(60_000_000);
  });

  it("[deemedGiftValue 하위호환] 병+정 합계 = 240,000,000", () => {
    const r = calcCapitalDecreaseGift(case2Input);
    expect(r.deemedGiftValue).toBe(240_000_000);
  });
});

// ── 경계 케이스 ──────────────────────────────────────────────────────────
describe("§39의2 경계 케이스", () => {
  it("[EC-1] 기준금액 3억 미달 → 미적용", () => {
    // diff/sharePrice = 5000/100000 = 5% < 30% → 기준금액 3억
    // 을 total = floor(5000 × 50000 × 50000/50000) = 250,000,000 < 3억 → isTaxable=false
    const r = calcCapitalDecreaseGift({
      sharePrice: 100_000,
      preTotalShares: 100_000,
      shareholders: [
        { id: "s1", name: "갑", preShares: 50_000, redeemedShares: 50_000, redemptionPricePerShare: 95_000, relationGroup: "fam" },
        { id: "s2", name: "을", preShares: 50_000, redeemedShares: 0, relationGroup: "fam" },
      ],
    });
    const eul = r.capitalDecreaseMulti?.donees.find((d) => d.name === "을");
    expect(eul?.isTaxable).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
  });

  it("[EC-2] 고가 액면 게이트 미충족 → 전체 미적용", () => {
    // eval=15000 >= faceValue=10000 → §29의2①2호 한정 조건 미충족
    const r = calcCapitalDecreaseGift({
      sharePrice: 15_000,
      faceValue: 10_000,
      preTotalShares: 100_000,
      shareholders: [
        { id: "s1", name: "갑", preShares: 60_000, redeemedShares: 0, relationGroup: "fam" },
        { id: "s2", name: "을", preShares: 40_000, redeemedShares: 40_000, redemptionPricePerShare: 20_000, relationGroup: "fam" },
      ],
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.capitalDecreaseMulti?.donees.find((d) => d.name === "을")?.isTaxable).toBe(false);
  });

  it("[EC-3] 비특수관계 전부 → 전원 isTaxable=false", () => {
    const r = calcCapitalDecreaseGift({
      sharePrice: 10_000,
      preTotalShares: 100_000,
      shareholders: [
        { id: "s1", name: "갑", preShares: 70_000, redeemedShares: 70_000, redemptionPricePerShare: 5_000, relationGroup: "groupA" },
        { id: "s2", name: "을", preShares: 30_000, redeemedShares: 0, relationGroup: "groupB" },
      ],
    });
    const eul = r.capitalDecreaseMulti?.donees.find((d) => d.name === "을");
    expect(eul?.isTaxable).toBe(false);
    expect(eul?.nonTaxableReason).toBe("비특수관계");
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[EC-6] 단일 수증자·단일 증여자 → fromDonors[0].amount = total", () => {
    const r = calcCapitalDecreaseGift({
      sharePrice: 10_000,
      preTotalShares: 100_000,
      shareholders: [
        { id: "s1", name: "갑", preShares: 60_000, redeemedShares: 60_000, redemptionPricePerShare: 5_000, relationGroup: "fam" },
        { id: "s2", name: "을", preShares: 40_000, redeemedShares: 0, relationGroup: "fam" },
      ],
    });
    const eul = r.capitalDecreaseMulti?.donees.find((d) => d.name === "을");
    expect(eul?.isTaxable).toBe(true);
    expect(eul?.fromDonors.length).toBe(1);
    expect(eul?.fromDonors[0].donorName).toBe("갑");
    expect(eul?.fromDonors[0].amount).toBe(eul?.total);
  });
});

// ── 회귀: 단일모드 하위호환 (변경 금지) ──────────────────────────────────
describe("§39의2 단일모드 회귀 — shareholders 미존재 시 기존 경로", () => {
  it("[R-CD-1] 저가 단일모드 = 6,000,000 (변경 금지)", () => {
    const r = calcCapitalDecreaseGift({
      sharePrice: 10_000,
      redemptionPrice: 6_000,
      totalRedeemedShares: 10_000,
      majorPostRatio: { numer: 30, denom: 100 },
      relatedRedeemedShares: 5_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(6_000_000);
    expect(r.capitalDecreaseMulti).toBeUndefined();
  });

  it("[R-CD-H] 고가 단일모드 = 500,000,000 (평가 3000 < 액면 5000)", () => {
    const r = calcCapitalDecreaseGift({
      caseType: "high",
      sharePrice: 3_000,
      redemptionPrice: 8_000,
      ownRedeemedShares: 100_000,
      faceValue: 5_000, // §29의2①2호 액면 게이트 (C-9)
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(500_000_000);
    expect(r.capitalDecreaseMulti).toBeUndefined();
  });
});
