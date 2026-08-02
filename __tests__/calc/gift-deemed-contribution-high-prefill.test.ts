/**
 * anchor: §39의3 **고가인수** roster — 수증자 선택 prefill (Phase B ⑫)
 *
 * 계획서: docs/00-pm/gift-inkind-contribution-39-3.plan.md §7 Phase B ⑫ · 결정 4
 *
 * ── 무엇이 잘못돼 있었나 ────────────────────────────────────────────────
 * 고가인수의 수증자는 **각자 독립 납세의무자**다(§39의3①2호 — 이익을 받은 기존주주별로 증여).
 * 저가처럼 동시증여(`simultaneousGifts`)로 묶을 수 없다 — 동시증여는 **동일 수증자** 전제다.
 * 그런데 prefill이 `contributionBreakdown[0]` **첫 행 고정**이었다:
 *   ⓐ 2번째 이후 수증자는 마법사로 이관할 **경로 자체가 없었다**
 *   ⓑ 첫 행이 §29의3② 기준금액 미달(가액 0)이면 **0원짜리 증여항목**이 넘어갔다
 *
 * ── 해소 방식 (선례 승계 · 신규 해석 없음) ──────────────────────────────
 * 감자 §39의2(`cdSelectedDoneeIndex`)·특정법인 §45의5(`scSelectedDoneeIndex`)가 이미 쓰는
 * 「결과뷰에서 과세 수증자 선택 → 그 1건만 이관」을 그대로 따른다.
 */
import { describe, it, expect } from "vitest";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-api";
import { calcContributionGift } from "@/lib/tax-engine/gift-deemed/contribution-in-kind";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { ContributionInput } from "@/lib/tax-engine/gift-deemed/types";

function formOf(patch: Partial<DeemedFormState>): DeemedFormState {
  return { ...INITIAL_DEEMED, type: "contribution", giftDate: "2026-03-02", ...patch };
}

/**
 * CASE-2(교재 계산사례 2 — `contribution-textbook-anchor` TBC-2와 동일 입력).
 * 후 1주가 10,000 · 1주당 차액 10,000 ⇒ 30% 게이트 통과 ⇒ 두 수증자 모두 과세.
 *   B(35,000/100,000) 175,000,000 · C(10,000/100,000) 50,000,000
 */
const CASE2: ContributionInput = {
  caseType: "high",
  preContribPrice: 5_000,
  preContribShares: 100_000,
  newSharePrice: 20_000,
  contributedShares: 50_000,
  allocatedShares: 50_000,
  parties: [
    { name: "B", preShares: 35_000, relation: "father" },
    { name: "C", preShares: 10_000, relation: "sibling" },
  ],
};

/**
 * 30% 게이트 **미달** 케이스 — 후 1주가 10,500 · 차액 500 (< 3,150) ⇒ 3억 게이트가 유일 관문.
 * base = 500 × 1,000,000 = 500,000,000.
 *   Q(100,000/1,000,000) raw 50,000,000  → 3억 미달 ⇒ **0원**
 *   P(700,000/1,000,000) raw 350,000,000 → 3억 이상 ⇒ 과세
 * ⇒ **비과세 행이 선두**인 배열을 만들 수 있다(ⓑ 재현).
 */
function absoluteGateOnly(parties: ContributionInput["parties"]): ContributionInput {
  return {
    caseType: "high",
    preContribPrice: 10_000,
    preContribShares: 1_000_000,
    newSharePrice: 11_000,
    contributedShares: 1_000_000,
    allocatedShares: 1_000_000,
    parties,
  };
}

describe("§39의3 고가인수 — 수증자 선택 prefill", () => {
  it("PB-1: 선택 안 함(index 0) → 첫 과세 수증자 B 175,000,000", () => {
    const result = calcContributionGift(CASE2);
    const p = buildGiftWizardPrefill(formOf({ conCaseType: "high" }), result);
    expect(p.giftItems).toHaveLength(1);
    expect(p.giftItems?.[0].marketValue).toBe(175_000_000);
    expect(p.giftItems?.[0].name).toContain("B");
    // 증여자 = 현물출자자. B의 관계 father ⇒ §53 직계존속 그룹
    expect(p.donorRelation).toBe("lineal_ascendant_adult");
    // 고가는 독립 건 — 동시증여로 묶지 않는다
    expect(p.simultaneousGifts).toBeUndefined();
  });

  it("PB-2 ⭐: index 1 선택 → 둘째 수증자 C 50,000,000 (종전엔 도달 경로 없음)", () => {
    const result = calcContributionGift(CASE2);
    const p = buildGiftWizardPrefill(
      formOf({ conCaseType: "high", conSelectedDoneeIndex: 1 }),
      result,
    );
    expect(p.giftItems?.[0].marketValue).toBe(50_000_000);
    expect(p.giftItems?.[0].name).toContain("C");
    expect(p.donorRelation).toBe("other_relative"); // sibling → 기타친족 그룹
  });

  it("PB-3 ⭐: 비과세(0원) 행이 선두여도 **과세 행**만 이관", () => {
    const result = calcContributionGift(
      absoluteGateOnly([
        { name: "Q", preShares: 100_000 },
        { name: "P", preShares: 700_000 },
      ]),
    );
    // 전제 고정 — 엔진이 실제로 0원 행을 선두에 만든다
    expect(result.contributionBreakdown?.[0]).toMatchObject({ party: "Q", value: 0 });
    expect(result.deemedGiftValue).toBe(350_000_000);

    const p = buildGiftWizardPrefill(formOf({ conCaseType: "high" }), result);
    expect(p.giftItems).toHaveLength(1);
    expect(p.giftItems?.[0].marketValue).toBe(350_000_000); // 종전 0
    expect(p.giftItems?.[0].name).toContain("P");
  });

  it("PB-4: 전원 기준금액 미달 → 이관 항목 없음", () => {
    const result = calcContributionGift(
      absoluteGateOnly([
        { name: "Q1", preShares: 100_000 },
        { name: "Q2", preShares: 200_000 },
      ]),
    );
    expect(result.deemedGiftValue).toBe(0);

    const p = buildGiftWizardPrefill(formOf({ conCaseType: "high" }), result);
    expect(p.giftItems).toEqual([]);
    expect(p.giftDate).toBe("2026-03-02");
  });

  it("PB-5: index 범위 초과(수증자 삭제 후 stale) → 첫 과세 행 fallback", () => {
    const result = calcContributionGift(CASE2);
    const p = buildGiftWizardPrefill(
      formOf({ conCaseType: "high", conSelectedDoneeIndex: 7 }),
      result,
    );
    expect(p.giftItems?.[0].marketValue).toBe(175_000_000);
  });
});

describe("§39의3 저가인수 — 회귀(동시증여 경로 불변)", () => {
  it("PB-6: 저가는 1 수증자·N 증여자 ⇒ 현 신고 건 + simultaneousGifts", () => {
    // 교재 계산사례 1(TBC-1)과 동일 입력 — A 275,000,000 · B 175,000,000
    const result = calcContributionGift({
      caseType: "low",
      preContribPrice: 20_000,
      preContribShares: 100_000,
      newSharePrice: 10_000,
      contributedShares: 100_000,
      allocatedShares: 100_000,
      parties: [
        { name: "A", preShares: 55_000, relation: "father" },
        { name: "B", preShares: 35_000, relation: "mother" },
      ],
    });

    // conSelectedDoneeIndex는 고가 전용 — 저가 경로에 영향을 주지 않는다
    const p = buildGiftWizardPrefill(
      formOf({ conCaseType: "low", conSelectedDoneeIndex: 1 }),
      result,
    );
    expect(p.giftItems?.[0].marketValue).toBe(275_000_000);
    expect(p.simultaneousGifts).toEqual([
      { donorRelation: "lineal_ascendant_adult", taxableValue: "175000000" },
    ]);
  });
});
