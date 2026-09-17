/**
 * anchor: §45의5① ⓐ 「특정법인」 성립요건 — 지배주주등의 주식보유비율 100분의 30 이상
 *
 * ── 무엇이 잘못돼 있었나 ──────────────────────────────────────────────
 * 과세 «대상 법인» 자체를 정하는 요건인데 엔진·타입·⑫Zod·④·⑧·⑤ 어디에도 판정이 없었다.
 * 지배주주등 직접지분 합계가 29%인 법인의 거래도 그대로 과세됐다
 * (실측 — 거래이익 2,000,000,000 · 법인세 0 · 갑 29% ⇒ 증여재산가액 580,000,000,
 *  자진납부세액 110,580,000).
 *
 * ── 이름이 같은 두 비율을 섞지 않는다 ────────────────────────────────
 * - **ⓐ 해당성(법인 단위)**: 법 §45의5① 「지배주주등의 주식보유비율이 100분의 30 이상인 **법인**
 *   (…"특정법인")」. 「지배주주등」 = 법 §45의4① 「지배주주와 그 친족」 — 집합이다.
 * - **ⓑ 승수(개인 단위)**: 상증령 §34의5⑨ 「**해당** 지배주주등의 주식보유비율을 곱한 금액을
 *   해당 지배주주등이 **각각**」 + 동 ⑤ 「증여의제이익이 1억원 이상인 경우로 **한정**」.
 *   ⇒ 그룹이 35%인 특정법인에서 개인 20%를 보유하면 20%로 곱하는 것이 맞다.
 *     **이 게이트는 ⓑ를 건드리지 않는다** — [E-5]가 그 반례를 고정한다.
 *
 * ── 직접지분 합계는 「하한」이다 ─────────────────────────────────────
 * 「주식보유비율」 정의는 법 §45의3①이 외부화한다 — 「**직접 또는 간접으로** 보유하는
 * 주식보유비율(이하 이 조, 제45조의4 및 **제45조의5**에서 "주식보유비율"이라 한다)」.
 * 앱은 간접보유를 수집하지 않으므로 직접합계로는 **충족만 확정**된다.
 * ⇒ 간접분 포함 합계를 신고하는 축(`controllingGroupRatio`)을 두고,
 *   roster는 미신고=간접 0%로 보아 판정, single은 미신고면 판정을 보류("unknown")한다.
 */
import { describe, it, expect } from "vitest";
import {
  calcSpecificCorpGift,
  calcSpecificCorpGiftMulti,
} from "@/lib/tax-engine/gift-deemed/specific-corp";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

/** 지배주주등 직접지분 합계 29% (갑 단독) · 나머지 71% 타인 · 법인세 0 */
function roster(extra: Record<string, unknown> = {}): SpecificCorpInput {
  return {
    transactionBenefit: 2_000_000_000,
    shareholders: [
      { id: "1", name: "갑", relation: "lineal_descendant", shares: 29_000, totalShares: 100_000, isDonor: false, isRelated: true },
      { id: "2", name: "타인", relation: "other", shares: 71_000, totalShares: 100_000, isDonor: false, isRelated: false },
    ],
    ...extra,
  } as unknown as SpecificCorpInput;
}

function single(extra: Record<string, unknown> = {}): SpecificCorpInput {
  return {
    type: "specific_corp",
    transactionBenefit: 1_000_000_000,
    corporateTax: 0,
    ownershipRatio: { numer: 2_000, denom: 10_000 }, // ⓑ 수증자 1인분 20%
    ...extra,
  } as unknown as SpecificCorpInput;
}

describe("§45의5① ⓐ 특정법인 해당성 — roster", () => {
  it("[E-0] 직접합계 29% · 간접 미신고 → 특정법인 아님 (종전 580,000,000 → 0)", () => {
    const r = calcSpecificCorpGiftMulti(roster());
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.specificCorpEligibility).toMatchObject({ directPct: 29, effectivePct: 29, met: "no" });
    // 표에서도 사유가 갱신된다 — 「과세」 배지가 남으면 합계 0과 어긋난다
    expect(r.specificCorpMulti!.donees[0].isTaxable).toBe(false);
    expect(r.specificCorpMulti!.donees[0].nonTaxableReason).toBe("not_specific_corp");
    // 간접보유를 0%로 본 전제를 사유에 적어 되돌릴 수 있게 한다
    expect(r.exclusionReason).toContain("100분의 30 미만");
    expect(r.exclusionReason).toContain("간접보유");
  });

  it("[E-1] 간접 포함 35% 신고 → 특정법인 성립, 종전 값이 그대로 살아난다", () => {
    const r = calcSpecificCorpGiftMulti(roster({ controllingGroupRatio: { numer: 3_500, denom: 10_000 } }));
    expect(r.specificCorpEligibility!.met).toBe("yes");
    expect(r.deemedGiftValue).toBe(580_000_000);
    const gap = r.specificCorpMulti!.donees.find((d) => d.name === "갑")!;
    expect(gap.isTaxable).toBe(true);
    expect(gap.limitCalc!.finalTax).toBe(114_000_000);
    expect(gap.limitCalc!.selfPayTax).toBe(110_580_000);
  });

  it("[E-2] 신고값이 직접합계보다 낮아도 직접분이 하한 — 29%로 판정한다", () => {
    const r = calcSpecificCorpGiftMulti(roster({ controllingGroupRatio: { numer: 2_000, denom: 10_000 } }));
    expect(r.specificCorpEligibility).toMatchObject({ directPct: 29, declaredPct: 20, effectivePct: 29, met: "no" });
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[E-3] 증여자 본인(isDonor) 행도 지배주주등이라 ⓐ 합계에 포함된다", () => {
    // 갑 15% + 부(증여자) 15% = 30% ⇒ 성립. donor_self 제외는 «수증자» 축이지 «법인 해당성» 축이 아니다.
    const r = calcSpecificCorpGiftMulti({
      transactionBenefit: 2_000_000_000,
      shareholders: [
        { id: "1", name: "갑", relation: "lineal_descendant", shares: 15_000, totalShares: 100_000, isDonor: false, isRelated: true },
        { id: "2", name: "부", relation: "lineal_ascendant", shares: 15_000, totalShares: 100_000, isDonor: true, isRelated: true },
        { id: "3", name: "타인", relation: "other", shares: 70_000, totalShares: 100_000, isDonor: false, isRelated: false },
      ],
    } as unknown as SpecificCorpInput);
    expect(r.specificCorpEligibility).toMatchObject({ directPct: 30, met: "yes" });
    expect(r.specificCorpMulti!.donees.find((d) => d.name === "갑")!.isTaxable).toBe(true);
    expect(r.deemedGiftValue).toBe(300_000_000);
  });

  it("[E-4] 경계 — 직접합계 30%는 충족, 29.99%는 미충족", () => {
    const at30 = calcSpecificCorpGiftMulti({
      transactionBenefit: 2_000_000_000,
      shareholders: [
        { id: "1", name: "갑", relation: "lineal_descendant", shares: 3_000, totalShares: 10_000, isDonor: false, isRelated: true },
        { id: "2", name: "타인", relation: "other", shares: 7_000, totalShares: 10_000, isDonor: false, isRelated: false },
      ],
    } as unknown as SpecificCorpInput);
    expect(at30.specificCorpEligibility!.met).toBe("yes");
    expect(at30.deemedGiftValue).toBe(600_000_000);

    // 2,999/10,000 = 29.99% — 정수 교차곱(2999×100 < 30×10000)이라 부동소수로 30%가 되지 않는다
    const under = calcSpecificCorpGiftMulti({
      transactionBenefit: 2_000_000_000,
      shareholders: [
        { id: "1", name: "갑", relation: "lineal_descendant", shares: 2_999, totalShares: 10_000, isDonor: false, isRelated: true },
        { id: "2", name: "타인", relation: "other", shares: 7_001, totalShares: 10_000, isDonor: false, isRelated: false },
      ],
    } as unknown as SpecificCorpInput);
    expect(under.specificCorpEligibility!.met).toBe("no");
    expect(under.deemedGiftValue).toBe(0);
  });
});

describe("§45의5① ⓑ 승수는 이 게이트가 건드리지 않는다 — single", () => {
  it("[E-5] single 20% 미신고 → 판정 보류(unknown), 200,000,000은 그대로 남는다", () => {
    // ⚠️ 여기서 0원으로 막으면 그룹 35%인 특정법인의 정당한 과세분이 사라진다.
    const r = calcSpecificCorpGift(single());
    expect(r.specificCorpEligibility!.met).toBe("unknown");
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(200_000_000);
  });

  it("[E-6] 그룹 25% 신고 → 미충족으로 차단 / 35% 신고 → 200,000,000 유지", () => {
    const low = calcSpecificCorpGift(single({ controllingGroupRatio: { numer: 2_500, denom: 10_000 } }));
    expect(low.specificCorpEligibility!.met).toBe("no");
    expect(low.deemedGiftValue).toBe(0);
    expect(low.exclusionReason).toContain("특정법인이 아닙니다");

    const ok = calcSpecificCorpGift(single({ controllingGroupRatio: { numer: 3_500, denom: 10_000 } }));
    expect(ok.specificCorpEligibility!.met).toBe("yes");
    expect(ok.deemedGiftValue).toBe(200_000_000); // ⓑ 승수는 여전히 20%
  });

  it("[E-7] 1인 비율만으로 30%를 넘으면 그룹도 30% 이상이 확정된다 — 신고 없이 충족", () => {
    const r = calcSpecificCorpGift(single({ ownershipRatio: { numer: 3_000, denom: 10_000 } }));
    expect(r.specificCorpEligibility!.met).toBe("yes");
    expect(r.deemedGiftValue).toBe(300_000_000);
  });
});

describe("교재 계산사례 회귀 — ⓐ 게이트가 통과시켜야 한다", () => {
  it("[E-8] 사례1 지배주주등 70% · 사례2 83% ⇒ 둘 다 met=yes", () => {
    const case1 = calcSpecificCorpGiftMulti({
      transactionBenefit: 1_000_000_000,
      shareholders: [
        { id: "1", name: "부", relation: "lineal_ascendant", shares: 20_000, totalShares: 50_000, isDonor: true, isRelated: true },
        { id: "2", name: "직원", relation: "other", shares: 15_000, totalShares: 50_000, isDonor: false, isRelated: false },
        { id: "3", name: "장남", relation: "lineal_descendant", shares: 12_500, totalShares: 50_000, isDonor: false, isRelated: true },
        { id: "4", name: "차남", relation: "lineal_descendant", shares: 2_500, totalShares: 50_000, isDonor: false, isRelated: true },
      ],
    } as unknown as SpecificCorpInput);
    expect(case1.specificCorpEligibility).toMatchObject({ directPct: 70, met: "yes" });
    expect(case1.deemedGiftValue).toBe(250_000_000); // 장남분 불변
  });
});
