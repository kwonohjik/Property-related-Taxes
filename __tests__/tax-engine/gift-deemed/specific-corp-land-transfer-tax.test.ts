/**
 * anchor: 영 §34의5④2호가목 — 법인세 안분에서 「토지등 양도소득에 대한 법인세액」 제외
 *
 * ── 무엇이 잘못돼 있었나 ────────────────────────────────────────────────
 * `apportionCorporateTax`가 `corporateTaxComputed − corporateTaxCredit`만 계산했다.
 * 법문은 「특정법인의 「법인세법」 제55조제1항에 따른 산출세액(같은 법 **제55조의2에 따른
 * 토지등 양도소득에 대한 법인세액은 제외**한다)에서 법인세액의 공제ㆍ감면액을 뺀 금액」이다.
 *
 * 이 괄호는 확인적 문구가 아니다 — 법인세법 §55① 본문이 산출세액을 「…제55조의2에 따른
 * 토지등 양도소득에 대한 법인세액 … 이 있으면 이를 **합한 금액으로 한다**. 이하 "산출세액"이라
 * 한다」로 정의하므로, **법문 용어 「산출세액」을 충실히 따른 입력이 곧 과대 입력**이었다.
 * ⇒ 법인세 상당액 과대 → 특정법인의 이익 과소 → 증여의제이익 과소(과소과세).
 *
 * ⚠️ 경계 — §55① 괄호는 조특법 §100의32(투자·상생협력 촉진) 특례세액도 함께 합산하지만
 *    상증령 §34의5④2호가목 괄호는 **§55의2만** 열거한다. 확대 적용 금지.
 */
import { describe, it, expect } from "vitest";
import {
  apportionCorporateTax,
  calcSpecificCorpGift,
  calcSpecificCorpGiftMulti,
} from "@/lib/tax-engine/gift-deemed/specific-corp";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

/** 거래이익 10억 · 소득금액 20억 · 산출세액 4억 · 지분 100% */
const SINGLE_BASE = {
  type: "specific_corp",
  counterparty: "ruling_shareholder",
  transactionType: "gratuitous",
  transactionBenefit: 1_000_000_000,
  annualIncome: 2_000_000_000,
  corporateTaxComputed: 400_000_000,
  ownershipRatio: { numer: 100, denom: 100 },
} as unknown as SpecificCorpInput;

/** 교재 사례2 — 거래이익 30억 · 소득 40억 · 산출세액 7.8억 · 갑 60% */
const ROSTER_CASE2 = {
  type: "specific_corp",
  counterparty: "ruling_shareholder",
  transactionType: "gratuitous",
  transactionBenefit: 3_000_000_000,
  annualIncome: 4_000_000_000,
  corporateTaxComputed: 780_000_000,
  giftDeduction: 50_000_000,
  shareholders: [
    { id: "bu", name: "부", relation: "lineal_ascendant", shares: 20_000, totalShares: 100_000, isDonor: true, isRelated: true },
    { id: "gap", name: "갑", relation: "lineal_descendant", shares: 60_000, totalShares: 100_000, isDonor: false, isRelated: true },
    { id: "byeong", name: "병", relation: "other", shares: 20_000, totalShares: 100_000, isDonor: false, isRelated: false },
  ],
} as unknown as SpecificCorpInput;

describe("영 §34의5④2호가목 — 토지등 양도소득 법인세액(법인세법 §55의2) 제외", () => {
  it("[LT-0] 미전달이면 종전과 동일하다 (회귀 0 — 기존 입력은 그대로 계산된다)", () => {
    expect(apportionCorporateTax(SINGLE_BASE)).toBe(200_000_000);
    expect(calcSpecificCorpGift(SINGLE_BASE).deemedGiftValue).toBe(800_000_000);
    // 0 명시 전달도 미전달과 같아야 한다(⑧이 「없으면 0」을 안내한다)
    expect(apportionCorporateTax({ ...SINGLE_BASE, corporateTaxOnLandTransfer: 0 })).toBe(200_000_000);
  });

  it("[LT-1] §55의2분 5천만을 빼면 안분 200,000,000 → 175,000,000 · 이익 800,000,000 → 825,000,000", () => {
    const withLand = { ...SINGLE_BASE, corporateTaxOnLandTransfer: 50_000_000 };
    // 가목 = 400,000,000 − 50,000,000 − 0 = 350,000,000
    // 안분 = 350,000,000 × min(10억, 20억) ÷ 20억 = 175,000,000
    expect(apportionCorporateTax(withLand)).toBe(175_000_000);
    expect(calcSpecificCorpGift(withLand).deemedGiftValue).toBe(825_000_000);
  });

  it("[LT-2] 공제·감면액과 «함께» 빠진다 — 가목은 두 항목을 모두 차감한 금액이다", () => {
    const both = { ...SINGLE_BASE, corporateTaxOnLandTransfer: 50_000_000, corporateTaxCredit: 30_000_000 };
    // 400,000,000 − 50,000,000 − 30,000,000 = 320,000,000 → 안분 160,000,000
    expect(apportionCorporateTax(both)).toBe(160_000_000);
  });

  it("[LT-3] 세 항목 합이 산출세액을 넘어도 음수가 되지 않는다 (가목 하한 0)", () => {
    const over = { ...SINGLE_BASE, corporateTaxOnLandTransfer: 300_000_000, corporateTaxCredit: 300_000_000 };
    expect(apportionCorporateTax(over)).toBe(0);
    expect(calcSpecificCorpGift(over).deemedGiftValue).toBe(1_000_000_000);
  });

  it("[LT-4] roster도 같은 leaf를 쓴다 — 교재 사례2: 안분 585,000,000 → 510,000,000", () => {
    const before = calcSpecificCorpGiftMulti(ROSTER_CASE2);
    const after = calcSpecificCorpGiftMulti({ ...ROSTER_CASE2, corporateTaxOnLandTransfer: 100_000_000 });
    expect(before.specificCorpMulti?.corpTaxApportioned).toBe(585_000_000);
    expect(after.specificCorpMulti?.corpTaxApportioned).toBe(510_000_000);
    // 갑(60%) 증여의제이익 1,449,000,000 → 1,494,000,000 (45,000,000원 과소였다)
    expect(before.deemedGiftValue).toBe(1_449_000_000);
    expect(after.deemedGiftValue).toBe(1_494_000_000);
  });

  it("[LT-5] §45의5② 한도의 ㉡(법인세 상당액×비율)도 함께 줄어 finalTax 189,000,000 → 234,000,000", () => {
    const lc = (input: SpecificCorpInput) =>
      calcSpecificCorpGiftMulti(input).specificCorpMulti?.donees.find((d) => d.name === "갑")?.limitCalc;
    const b = lc(ROSTER_CASE2);
    const a = lc({ ...ROSTER_CASE2, corporateTaxOnLandTransfer: 100_000_000 });
    expect([b?.corpTaxShare, b?.finalTax]).toEqual([351_000_000, 189_000_000]);
    expect([a?.corpTaxShare, a?.finalTax]).toEqual([306_000_000, 234_000_000]);
  });
});

// ── ④API변환 → ⑬body → ⑫Zod → ⑭엔진 관통 (leaf anchor는 ⑫를 건너뛴다) ──
const FORM: DeemedFormState = {
  ...INITIAL_DEEMED,
  type: "specific_corp",
  giftDate: "2026-03-02",
  scMode: "single",
  scCorporateTaxMode: "auto",
  scCounterparty: "ruling_shareholder",
  scTransactionType: "gratuitous",
  scTransactionBenefit: "1000000000",
  scRatioPct: "100",
  scCorpTaxAssessed: "400000000",
  scCorpTaxLandTransfer: "50000000",
  scCorpIncome: "2000000000",
} as unknown as DeemedFormState;

function throughPipeline(form: DeemedFormState) {
  const input = buildDeemedGiftInput(form);
  const parsed = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(input)));
  if (!parsed.success) throw new Error(`⑫ Zod 거부: ${parsed.error.issues[0]?.message}`);
  return {
    reached: "corporateTaxOnLandTransfer" in (parsed.data as Record<string, unknown>),
    result: calcDeemedGift(parsed.data as never),
  };
}

describe("14지점 관통 — scCorpTaxLandTransfer", () => {
  it("[LT-6] ⑫Zod가 stripping하지 않고 엔진까지 도달해 825,000,000을 낸다", () => {
    const { reached, result } = throughPipeline(FORM);
    expect(reached).toBe(true);
    expect(result.deemedGiftValue).toBe(825_000_000);
    // 칸을 비우면 종전값 — 이 필드 하나가 차이를 만든다는 구별력 증명
    expect(throughPipeline({ ...FORM, scCorpTaxLandTransfer: "" }).result.deemedGiftValue).toBe(800_000_000);
  });

  it("[LT-6b] roster+auto ④도 같은 필드를 싣는다 — 두 return 지점이 따로 있다", () => {
    const roster = {
      ...FORM,
      scMode: "roster",
      scTotalShares: "100000",
      scShareholders: [
        { id: "1", name: "갑", relation: "lineal_descendant", shares: "60000", isDonor: false },
        { id: "2", name: "부", relation: "lineal_ascendant", shares: "40000", isDonor: true },
      ],
    } as unknown as DeemedFormState;
    const { reached, result } = throughPipeline(roster);
    expect(reached).toBe(true);
    // 가목 350,000,000 → 안분 175,000,000 → 특정법인의 이익 825,000,000 → 갑 60% = 495,000,000
    expect(result.specificCorpMulti?.corpTaxApportioned).toBe(175_000_000);
    expect(result.deemedGiftValue).toBe(495_000_000);
    expect(
      throughPipeline({ ...roster, scCorpTaxLandTransfer: "" }).result.specificCorpMulti?.corpTaxApportioned,
    ).toBe(200_000_000);
  });

  it("[LT-7] ⑧validate — 토지등 세액이 산출세액보다 크면 차단한다 (자동 clamp 금지)", () => {
    expect(validateDeemedInput(FORM)).toBeNull();
    const bad = { ...FORM, scCorpTaxLandTransfer: "500000000" } as DeemedFormState;
    expect(validateDeemedInput(bad)).toMatch(/토지등 양도소득에 대한 법인세액이 법인세 산출세액보다/);
    // roster+auto 경로도 같은 가드를 탄다
    const roster = {
      ...bad,
      scMode: "roster",
      scTotalShares: "100000",
      scShareholders: [{ id: "1", name: "갑", relation: "lineal_descendant", shares: "60000", isDonor: false }],
    } as unknown as DeemedFormState;
    expect(validateDeemedInput(roster)).toMatch(/토지등 양도소득에 대한 법인세액이 법인세 산출세액보다/);
  });

  it("[LT-8] direct 모드는 이 칸을 보내지 않는다 — 사용자가 이미 차감한 「법인세 상당액」이다", () => {
    const direct = { ...FORM, scCorporateTaxMode: "direct", scCorporateTax: "200000000" } as DeemedFormState;
    const input = buildDeemedGiftInput(direct) as unknown as Record<string, unknown>;
    expect(input.corporateTaxOnLandTransfer).toBeUndefined();
    expect(input.corporateTax).toBe(200_000_000);
  });
});
