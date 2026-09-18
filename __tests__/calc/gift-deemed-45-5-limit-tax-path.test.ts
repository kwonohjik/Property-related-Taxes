/**
 * anchor: §45의5② 증여세 한도 — 「표시 전용」에서 **세액 경로**로
 *
 * ── 무엇이 잘못돼 있었나 ────────────────────────────────────────────────
 * ① `calcSpecificCorpLimit`이 산출한 ㉮㉠㉡㉯·finalTax·selfPayTax의 소비처가
 *    `SpecificCorpMultiResultView` **한 곳뿐**이었다. 「이 금액으로 증여세 계산하기 →」는
 *    한도 «전» 증여재산가액만 넘겨, 같은 사안에 두 개의 세액이 나왔다.
 *    (교재 사례2 실측: 화면 자진납부 183,330,000 ↔ 마법사 자진납부 387,612,000)
 * ② 기본 모드인 single(`calcSpecificCorpGift`)은 한도를 **계산조차** 하지 않았다.
 *    그런데 한도 전용 입력(증여재산공제)은 ④⑫⑭를 모두 통과해 엔진까지 도달한 뒤 버려졌다
 *    — 값을 넣어도 결과 JSON이 바이트 단위로 같은 «유령 필드»였다.
 *
 * ── 법령 ────────────────────────────────────────────────────────────────
 * 법 §45의5② 「제1항에 따른 증여세액이 지배주주등이 직접 증여받은 경우의 증여세 상당액에서
 * 특정법인이 부담한 법인세 상당액을 차감한 금액을 초과하는 경우 **그 초과액은 없는 것으로 본다**.」
 * — 감면이 아니라 세액 자체의 상한이고, 조문에 입력 모드(single/roster) 축이 없다.
 * 영 §34의5⑨이 ㉠㉡을 「해당 지배주주등의 주식보유비율을 곱한」 값으로 정의한다.
 *
 * ── 왜 무조건 자르지 않는가 ────────────────────────────────────────────
 * 상한 대상은 「**제1항에 따른** 증여세액」이다. 다른 증여재산·사전증여가 섞이면 산출세액은
 * §45의5① 이익 밖까지 포함하는데 §45의5에는 그 안분 규정이 없다 ⇒ 적용하지 않고 경고를 남긴다.
 */
import { describe, it, expect } from "vitest";
import { buildGiftWizardPrefill } from "@/lib/calc/gift-deemed-api";
import {
  calcSpecificCorpGift,
  calcSpecificCorpGiftMulti,
} from "@/lib/tax-engine/gift-deemed/specific-corp";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { estateItemSchema } from "@/lib/validators/estate-item-schema";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";
import type { EstateItem, GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

/** 교재 사례2 — 거래이익 30억 · 소득 40억 · 산출세액 7.8억 · 갑 60% · 공제 5천만 */
const COMMON = {
  type: "specific_corp",
  counterparty: "ruling_shareholder",
  transactionType: "gratuitous",
  transactionBenefit: 3_000_000_000,
  annualIncome: 4_000_000_000,
  corporateTaxComputed: 780_000_000,
  giftDeduction: 50_000_000,
} as unknown as SpecificCorpInput;

const ROSTER = {
  ...COMMON,
  shareholders: [
    { id: "gap", name: "갑", relation: "lineal_descendant", shares: 60_000, totalShares: 100_000, isDonor: false, isRelated: true },
    { id: "byeong", name: "병", relation: "other", shares: 40_000, totalShares: 100_000, isDonor: false, isRelated: false },
  ],
} as unknown as SpecificCorpInput;

const SINGLE = { ...COMMON, ownershipRatio: { numer: 6_000, denom: 10_000 } } as unknown as SpecificCorpInput;

const FORM = { ...INITIAL_DEEMED, type: "specific_corp", giftDate: "2026-03-02" } as DeemedFormState;

/** 마법사 기본값과 같은 구성 — 직계존속(성년) 증여, 기한 내 신고 */
function wizard(items: EstateItem[], priorGifts: unknown[] = []): GiftTaxInput {
  return {
    giftDate: "2026-03-02",
    donorRelation: "lineal_ascendant_adult",
    donor: "parent",
    giftItems: items,
    priorGiftsWithin10Years: priorGifts,
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult" },
    creditInput: { isFiledOnTime: true },
  } as unknown as GiftTaxInput;
}

describe("§45의5② 한도 — single/roster parity (조문에 입력 모드 축이 없다)", () => {
  it("[L-0] 같은 사실관계면 두 모드의 한도가 완전히 같다", () => {
    const single = calcSpecificCorpGift(SINGLE).specificCorpLimit;
    const roster = calcSpecificCorpGiftMulti(ROSTER).specificCorpMulti?.donees[0]?.limitCalc;
    expect(single).toBeDefined();
    expect(single).toEqual(roster);
    expect(single?.finalTax).toBe(189_000_000);
    expect(single?.selfPayTax).toBe(183_330_000);
  });

  it("[L-1] single의 증여재산공제가 더 이상 유령 필드가 아니다 — 값이 결과를 바꾼다", () => {
    const none = calcSpecificCorpGift({ ...SINGLE, giftDeduction: 0 });
    const some = calcSpecificCorpGift(SINGLE);
    // 증여의제이익 자체는 공제와 무관(공제는 한도 ㉮㉠ 단계다)
    expect(none.deemedGiftValue).toBe(some.deemedGiftValue);
    // 한도는 갈린다 — 종전에는 결과 JSON이 바이트 단위로 같았다
    expect(none.specificCorpLimit?.computedTax).toBe(419_600_000);
    expect(some.specificCorpLimit?.computedTax).toBe(399_600_000);
    expect(none.specificCorpLimit?.giftDeductionApplied).toBe(0);
  });

  it("[L-2] 과세 미성립이면 한도를 만들지 않는다 (1억 미만·특정법인 아님)", () => {
    const tiny = calcSpecificCorpGift({
      ...SINGLE,
      transactionBenefit: 100_000_000,
      annualIncome: 0,
      corporateTax: 0,
    } as unknown as SpecificCorpInput);
    expect(tiny.applied).toBe(false);
    expect(tiny.specificCorpLimit).toBeUndefined();
  });
});

describe("§55② 과세최저한 — 천원절사는 §55 어디에도 없다", () => {
  const flat = (benefit: number, deduction: number) =>
    calcSpecificCorpGift({
      ...COMMON,
      transactionBenefit: benefit,
      annualIncome: 0,
      corporateTax: 0,
      giftDeduction: deduction,
      ownershipRatio: { numer: 1, denom: 1 },
    } as unknown as SpecificCorpInput).specificCorpLimit;

  it("[L-3] 과세표준 499,999원 → 증여세 0 (종전 49,900원 과다)", () => {
    expect(flat(600_499_999, 600_000_000)?.computedTax).toBe(0);
    expect(flat(600_499_999, 600_000_000)?.selfPayTax).toBe(0);
  });

  it("[L-4] 과세표준 500,000,999원 → 90,000,299 (종전 천원절사로 299원 과소)", () => {
    expect(flat(500_000_999, 0)?.computedTax).toBe(90_000_299);
  });

  it("[L-5] 과세표준 500,000원 정확히는 과세된다 — 「미만」이 기준이다 (경계 ±1)", () => {
    // ⚠️ 증여의제이익 자체는 영 §34의5⑤ 1억원 문턱을 넘어야 한다 — 50만원 부근 과세표준은
    //    「1억 이상 이익 − 그만큼의 증여재산공제」로만 도달한다(L-3과 같은 경로).
    expect(flat(600_500_000, 600_000_000)?.computedTax).toBe(50_000);
    expect(flat(600_499_999, 600_000_000)?.computedTax).toBe(0);
  });
});

describe("한도가 증여세 마법사까지 도달한다 (④이관 → ⑫Zod → 본엔진)", () => {
  const capItem = () => buildGiftWizardPrefill(FORM, calcSpecificCorpGiftMulti(ROSTER)).giftItems![0] as EstateItem;

  it("[L-6] prefill이 한도액과 산출 근거(staleness 가드)를 함께 싣는다", () => {
    expect(capItem().deemedGiftTaxCap).toEqual({
      limitAmount: 189_000_000,
      basis: { deemedGiftValue: 1_449_000_000, giftDeduction: 50_000_000 },
    });
    // single 모드도 같은 한도를 싣는다(모드 parity)
    expect((buildGiftWizardPrefill(FORM, calcSpecificCorpGift(SINGLE)).giftItems![0] as EstateItem)
      .deemedGiftTaxCap?.limitAmount).toBe(189_000_000);
  });

  it("[L-7] ⑫Zod가 stripping하지 않는다 — 빠지면 마법사가 한도를 모른 채 계산한다", () => {
    const parsed = estateItemSchema.safeParse(JSON.parse(JSON.stringify(capItem())));
    expect(parsed.success).toBe(true);
    expect((parsed as { data: EstateItem }).data.deemedGiftTaxCap?.limitAmount).toBe(189_000_000);
  });

  it("[L-8] 두 화면의 세액이 일치한다 — 산출 189,000,000 · 자진납부 183,330,000", () => {
    const withCap = calcGiftTax(wizard([capItem()]));
    expect(withCap.computedTax).toBe(189_000_000);
    expect(withCap.finalTax).toBe(183_330_000);
    // 증여의제 결과뷰가 표시하는 값과 같아야 한다
    const shown = calcSpecificCorpGiftMulti(ROSTER).specificCorpMulti?.donees[0]?.limitCalc;
    expect([shown?.finalTax, shown?.selfPayTax]).toEqual([withCap.computedTax, withCap.finalTax]);
  });

  it("[L-9] 한도가 없으면 종전값 — 이 필드 하나가 204,282,000원을 가른다", () => {
    const noCap = calcGiftTax(wizard([{ ...capItem(), deemedGiftTaxCap: undefined }]));
    expect(noCap.computedTax).toBe(399_600_000);
    expect(noCap.finalTax).toBe(387_612_000);
    expect(noCap.finalTax - 183_330_000).toBe(204_282_000);
  });

  it("[L-10] 한도 차감이 breakdown에 드러난다 (조용히 줄지 않는다)", () => {
    const r = calcGiftTax(wizard([capItem()]));
    const row = r.breakdown.find((b) => b.label.includes("§45의5② 특정법인 증여세 한도"));
    expect(row?.amount).toBe(-210_600_000);
    expect(r.appliedLaws).toContain("상증법 §45의5②");
  });
});

describe("한도를 적용하지 않는 경우 — 조용히 버리지 않고 경고를 남긴다", () => {
  const capItem = () => buildGiftWizardPrefill(FORM, calcSpecificCorpGiftMulti(ROSTER)).giftItems![0] as EstateItem;
  const other: EstateItem = { id: "x", category: "other", name: "기타", marketValue: 100_000_000 } as EstateItem;
  const warned = (r: { warnings: string[] }) => r.warnings.some((w) => w.includes("§45의5②(특정법인) 한도"));

  it("[L-11] 다른 증여재산이 함께 있으면 적용하지 않는다 (안분 규정 부존재)", () => {
    const r = calcGiftTax(wizard([capItem(), other]));
    expect(r.computedTax).toBe(439_600_000);
    expect(warned(r)).toBe(true);
  });

  it("[L-11b] 과세가액이 그대로여도 다른 증여재산이 있으면 적용하지 않는다 (부담부증여로 상쇄된 경우)", () => {
    // 아파트 2억 + 인수채무 2억 → §47① 과세가액 기여 0. 가액 가드만으로는 걸러지지 않는다.
    // 그래도 산출세액은 §45의5① 이익 «밖»의 재산을 포함하므로 상한을 걸 근거가 없다.
    const burdened = {
      id: "apt",
      category: "real_estate_apartment",
      name: "아파트",
      marketValue: 200_000_000,
      assumedDebtForGift: 200_000_000,
    } as unknown as EstateItem;
    const r = calcGiftTax(wizard([capItem(), burdened]));
    expect(r.aggregatedGiftValue).toBe(1_449_000_000); // 가액은 그대로다
    expect(r.computedTax).toBe(399_600_000); // 자르지 않았다
    expect(warned(r)).toBe(true);
  });

  it("[L-12] 사전증여 합산이 있으면 적용하지 않는다", () => {
    const r = calcGiftTax(
      wizard([capItem()], [{ giftDate: "2020-01-01", amount: 100_000_000, donorRelation: "lineal_ascendant_adult" }]),
    );
    expect(warned(r)).toBe(true);
    expect(r.computedTax).toBeGreaterThan(189_000_000);
  });

  it("[L-13] 마법사에서 공제가 달라지면 적용하지 않는다 — ㉠가 공제에 의존한다", () => {
    // 배우자(6억 공제)로 바꾸면 이관 당시의 5천만 전제가 깨진다
    const r = calcGiftTax({
      ...wizard([capItem()]),
      donorRelation: "spouse",
      deductionInput: { donorRelation: "spouse" },
    } as unknown as GiftTaxInput);
    expect(warned(r)).toBe(true);
  });

  it("[L-14] 가액이 달라지면 적용하지 않는다", () => {
    const r = calcGiftTax(wizard([{ ...capItem(), marketValue: 1_000_000_000 }]));
    expect(warned(r)).toBe(true);
  });

  it("[L-15] 한도가 산출세액보다 크면 자르지 않는다 — 상한이지 하한이 아니다", () => {
    const item = { ...capItem(), deemedGiftTaxCap: { limitAmount: 900_000_000, basis: { deemedGiftValue: 1_449_000_000, giftDeduction: 50_000_000 } } };
    const r = calcGiftTax(wizard([item as EstateItem]));
    expect(r.computedTax).toBe(399_600_000);
    expect(warned(r)).toBe(false);
  });
});
