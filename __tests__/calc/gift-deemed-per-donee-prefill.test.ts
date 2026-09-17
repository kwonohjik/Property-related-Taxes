/**
 * anchor: §45의3·§45의5 증여세 마법사 이관 — **수증자 1인 단위 + 합산배제 플래그 보존**
 *
 * ── 무엇이 잘못돼 있었나 ────────────────────────────────────────────────
 * ① §45의3(일감몰아주기) — `buildGiftWizardPrefill`의 related_corp 분기가 **조기반환**이라
 *    파일 맨 끝에서만 붙이던 `isAggregationExcludedGift`·`aggregationExcludedClass`를
 *    통째로 잃었다. 엔진(`related-corp.ts`)은 `aggregationExcluded: true`·
 *    `aggExclClass: "deemed_profit"`를 올바로 내보내는데 **소비되는 층에 도달하지 못했다**.
 *    ⇒ 증여세 본체가 §55①2호(증여의제이익 그대로)가 아니라 §55①4호 일반스트림으로 계산해
 *      §53 증여재산공제를 붙였다(아래 [P-3] 실측 3,000,000원 과소).
 * ② §45의3 — 2번째 이후 수증자를 `simultaneousGifts`에 넣었다. 그 필드는 §46①2호
 *    「같은 공제그룹 **동시증여** 시 공제한도 안분」 전용이고 «동일 수증자» 전제다.
 * ③ §45의5(특정법인) — prefill에 **분기 자체가 없어** 일반 분기로 떨어졌고, 그 값은
 *    `specific-corp.ts`의 `taxable.reduce((a, d) => a + d.gain, 0)` = **과세 수증자 전원 합계**였다.
 *    결과뷰는 `scSelectedDoneeIndex` 드롭다운을 제공하는데 prefill이 그 선택을 무시했다.
 *
 * ── 법령 ────────────────────────────────────────────────────────────────
 * - 상증법 §45의3① — 지배주주와 그 친족이 이익을 「**각각** 증여받은 것으로 본다」.
 * - 상증령 §34의5⑨ — 「해당 지배주주등이 **각각** 직접 증여받은 것으로 볼 때의 증여세」.
 * - 상증법 §47① 합산배제증여재산 열거 = §31①3호·§40①2·3호·§41의3·§41의5·§42의3·§45·
 *   §45의2~§45의4 ⇒ **§45의3은 포함, §45의5는 미포함**(§45의5는 §55①4호 일반스트림이 맞다).
 * - 상증법 §55①2호 — §45의3·§45의4는 「증여의제이익」 그대로가 과세표준(3천만 공제 없음).
 */
import { describe, it, expect } from "vitest";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-api";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import { calcSpecificCorpGiftMulti } from "@/lib/tax-engine/gift-deemed/specific-corp";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { RelatedCorpInput, SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";
import type { EstateItem, GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

function formOf(patch: Partial<DeemedFormState>): DeemedFormState {
  return { ...INITIAL_DEEMED, giftDate: "2026-03-02", ...patch };
}

// ── §45의3 입력: 일반기업(정상거래비율 30%) · 거래비율 70% ⇒ 과세요건 충족 ──
//    갑 직접 50% / 을 직접 20%(둘 다 한계보유비율 3% 초과) · 간접출자 없음.
const RC_INPUT: RelatedCorpInput = {
  enterpriseSize: "large",
  totalSales: 20_000_000_000,
  preTaxAdjOperatingIncome: 2_500_000_000,
  taxableIncome: 1_800_000_000,
  corporateTaxNet: 340_000_000,
  shareholders: [
    { id: "gap", name: "갑", relation: "self", directRatio: { numer: 50, denom: 100 }, isCorporate: false },
    { id: "eul", name: "을", relation: "relative", directRatio: { numer: 20, denom: 100 }, isCorporate: false },
  ],
  intermediaryCorps: [],
  salesPartners: [{ id: "sD", name: "D법인", salesAmount: 14_000_000_000, isRelated: true }],
};

// ── §45의5 입력: 거래이익 30억 · 법인세 안분 5.85억 ⇒ 특정법인의 이익 24.15억 ──
//    부(증여자·20%) 제외, 갑 40%·을 40% 과세 ⇒ 각 9.66억.
const SC_INPUT = {
  type: "specific_corp",
  transactionBenefit: 3_000_000_000,
  annualIncome: 4_000_000_000,
  corporateTaxComputed: 780_000_000,
  corporateTaxCredit: 0,
  shareholders: [
    { id: "bu", name: "부", relation: "lineal_ascendant", shares: 20, totalShares: 100, isDonor: true, isRelated: true },
    { id: "gap", name: "갑", relation: "lineal_descendant", shares: 40, totalShares: 100, isDonor: false, isRelated: true },
    { id: "eul", name: "을", relation: "lineal_descendant", shares: 40, totalShares: 100, isDonor: false, isRelated: true },
  ],
} as unknown as SpecificCorpInput;

describe("§45의3 일감몰아주기 — 수증자 1인 단위 이관 + §55①2호 플래그", () => {
  const result = calcRelatedCorpGift(RC_INPUT);

  it("[P-0] 전제: 과세요건 충족 · 수증자 2인(갑 702,000,000 / 을 280,800,000)", () => {
    expect(result.taxRequirementMet).toBe(true);
    expect(result.recipientBreakdown?.map((r) => [r.recipientName, r.subtotal])).toEqual([
      ["갑", 702_000_000],
      ["을", 280_800_000],
    ]);
    // 엔진은 플래그를 올바로 내보낸다 — 잃어버리는 쪽은 prefill이었다.
    expect(result.aggregationExcluded).toBe(true);
    expect(result.aggExclClass).toBe("deemed_profit");
  });

  it("[P-1] 합산배제 플래그가 이관 payload까지 도달한다 (§47①·§55①2호)", () => {
    const p = buildGiftWizardPrefill(formOf({ type: "related_corp" }), result);
    expect(p.giftItems?.[0]?.isAggregationExcludedGift).toBe(true);
    expect(p.giftItems?.[0]?.aggregationExcludedClass).toBe("deemed_profit");
  });

  it("[P-2] 선택한 수증자 1건만 이관하고 simultaneousGifts를 만들지 않는다", () => {
    const first = buildGiftWizardPrefill(formOf({ type: "related_corp" }), result);
    expect(first.giftItems).toHaveLength(1);
    expect(first.giftItems?.[0]?.marketValue).toBe(702_000_000);
    // §45의3의 수증자는 각자 독립 납세의무자다 — 동시증여(§46①2호)가 아니다.
    expect(first.simultaneousGifts).toBeUndefined();

    const second = buildGiftWizardPrefill(
      formOf({ type: "related_corp", rcSelectedDoneeIndex: 1 }),
      result,
    );
    expect(second.giftItems?.[0]?.marketValue).toBe(280_800_000);
    expect(second.giftItems?.[0]?.name).toContain("을");
    expect(second.simultaneousGifts).toBeUndefined();

    // 범위를 벗어난 인덱스는 첫 과세 수증자로 되돌린다(결과뷰 드롭다운과 같은 술어).
    const overflow = buildGiftWizardPrefill(
      formOf({ type: "related_corp", rcSelectedDoneeIndex: 9 }),
      result,
    );
    expect(overflow.giftItems?.[0]?.marketValue).toBe(702_000_000);
  });

  it("[P-3] 플래그 유무가 결정세액을 가른다 — 147,600,000 → 150,600,000 (실측)", () => {
    const giftInput = (item: EstateItem): GiftTaxInput => ({
      giftDate: "2026-03-02",
      donorRelation: "other_relative",
      donor: "other_relative",
      giftItems: [item],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "other_relative" },
      creditInput: { isFiledOnTime: false },
    });
    const base: EstateItem = {
      id: "rc",
      category: "other",
      name: "일감몰아주기 이익 — 갑",
      marketValue: 702_000_000,
    };

    // 종전(플래그 소실): §55①4호 일반스트림 → §53 기타친족 1천만 공제가 붙는다.
    const before = calcGiftTax(giftInput(base));
    expect(before.finalTax).toBe(147_600_000);

    // 수정(플래그 보존): §55①2호 — 증여의제이익 702,000,000 그대로가 과세표준.
    const after = calcGiftTax(
      giftInput({ ...base, isAggregationExcludedGift: true, aggregationExcludedClass: "deemed_profit" }),
    );
    expect(after.finalTax).toBe(150_600_000);
    expect(after.finalTax - before.finalTax).toBe(3_000_000);

    // prefill이 내보내는 항목이 실제로 '수정' 쪽과 같은 플래그를 갖는다.
    const p = buildGiftWizardPrefill(formOf({ type: "related_corp" }), result);
    expect(calcGiftTax(giftInput(p.giftItems![0] as EstateItem)).finalTax).toBe(150_600_000);
  });
});

describe("§45의5 특정법인 — roster 이관은 수증자 1인분", () => {
  const result = calcSpecificCorpGiftMulti(SC_INPUT);

  it("[S-0] 전제: 증여자 제외 · 과세 수증자 2인이 각 966,000,000", () => {
    expect(result.specificCorpMulti?.corpProfit).toBe(2_415_000_000);
    expect(result.specificCorpMulti?.donees.map((d) => [d.name, d.gain, d.isTaxable])).toEqual([
      ["부", 0, false],
      ["갑", 966_000_000, true],
      ["을", 966_000_000, true],
    ]);
    // 엔진의 Σ집계 자체는 유지한다 — 문제는 그 값을 1인 증여로 이관한 것이었다.
    expect(result.deemedGiftValue).toBe(1_932_000_000);
  });

  it("[S-1] 전원 합계(1,932,000,000)가 아니라 선택 수증자 1인분(966,000,000)을 이관한다", () => {
    const first = buildGiftWizardPrefill(formOf({ type: "specific_corp" }), result);
    expect(first.giftItems).toHaveLength(1);
    expect(first.giftItems?.[0]?.marketValue).toBe(966_000_000);
    expect(first.giftItems?.[0]?.name).toContain("갑");

    const second = buildGiftWizardPrefill(
      formOf({ type: "specific_corp", scSelectedDoneeIndex: 1 }),
      result,
    );
    expect(second.giftItems?.[0]?.name).toContain("을");
    expect(second.giftItems?.[0]?.marketValue).toBe(966_000_000);
  });

  it("[S-2] §45의5는 §47① 합산배제 열거에 없다 — 플래그를 붙이지 않는다", () => {
    expect(result.aggregationExcluded).toBeUndefined();
    const p = buildGiftWizardPrefill(formOf({ type: "specific_corp" }), result);
    expect(p.giftItems?.[0]?.isAggregationExcludedGift).toBeUndefined();
  });

  it("[S-3] 이관 후보는 과세 수증자 갑·을뿐 — 증여자(부)는 donor_self로 빠진다", () => {
    const names = [0, 1, 2].map(
      (i) =>
        buildGiftWizardPrefill(formOf({ type: "specific_corp", scSelectedDoneeIndex: i }), result)
          .giftItems?.[0]?.name ?? "",
    );
    // 이름을 직접 단언한다 — 「부가 없다」만 보면 분기가 통째로 사라져 일반 분기로
    // 떨어져도(항목명이 유형 라벨이 된다) 통과해 버린다(구별력 0).
    expect(names[0]).toBe("특정법인과의 거래 이익 — 갑");
    expect(names[1]).toBe("특정법인과의 거래 이익 — 을");
    // 과세 수증자는 2인뿐이므로 인덱스 2는 첫 과세 수증자로 되돌린다.
    expect(names[2]).toBe("특정법인과의 거래 이익 — 갑");
  });
});
