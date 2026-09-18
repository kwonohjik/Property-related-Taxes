/**
 * anchor: §45의5 수증자별 귀속 — 증여자 2인(SC-F) · §53 공제(SC-I) · §57 할증(SC-J)
 *
 * ── SC-F 증여자 2인이면 두 행이 서로 상쇄돼 0원이 된다 ──────────────
 * 거래이익 2,000,000,000(갑 1,000,000,000 + 을 1,000,000,000) · 갑 60% · 을 40% 둘 다 isDonor
 * ⇒ 실측 `deemedGiftValue = 0`. 갑은 을이 준 몫을, 을은 갑이 준 몫을 받았는데 둘 다 사라진다.
 * 가장 다툼 없는 지표: **증여재산가액 1,000,000,000(갑 600,000,000 + 을 400,000,000) → 0원**.
 *
 * 【해결 방향 — 왜 「분해」가 아니라 「차단」인가】
 * 법 §45의5①은 「… 거래를 하는 경우에는 **거래한 날을 증여일로 하여**」라고 **거래 단위**로
 * 증여를 본다. 증여자가 2인이면 그것은 서로 다른 날의 **별개 거래 2건**이고, 각각 계산하는 것이
 * 조문 구조다. 합산 입력 자체가 오용이므로 ⑧·⑫·⑤ 세 층에서 막고 안내한다.
 * (엔진에 「자기증여분 차감」 분해를 넣는 쪽은 납세자에게 **불리한 방향**인데 그 분해를 지시하는
 *  법령·해석 근거를 확인하지 못했다 — 근거 없이 불리하게 적용하지 않는다.)
 *
 * ── SC-I §53 공제가 전 수증자 공통이었다 ─────────────────────────────
 * 배우자 50% + 자녀 50% · 공제 600,000,000 단일 입력 ⇒ 둘 다 computedTax 70,000,000.
 * 자녀는 §53①2호로 50,000,000이 맞다 ⇒ 225,000,000. **155,000,000 과소**.
 * ⚠️ roster의 `relation`은 「**지배주주와의** 관계」라 §53에 쓸 수 없다 — 엔진은 그 필드를
 *   `isRelated` 판정에만 쓴다. §53은 「**증여자와의** 관계」를 요구하므로 별도 축을 신설했다.
 *
 * ── SC-J §57 세대생략 할증이 §45의5② 한도 패널에 없었다 ──────────────
 * gain 1,000,000,000 · 공제 0 ⇒ finalTax 240,000,000 · 자진납부 232,800,000.
 * 손자 수증이면 §57① 30% 할증 72,000,000 ⇒ 312,000,000 · 302,640,000. **69,840,000 과소**.
 * ⚠️ 앱의 증여세 «산출» 경로는 §57을 이미 적용한다 — 틀린 것은 이 **한도 패널**이었다(medium).
 */
import { describe, it, expect } from "vitest";
import { calcSpecificCorpGiftMulti } from "@/lib/tax-engine/gift-deemed/specific-corp";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

const SH = (o: Record<string, unknown>) => ({
  totalShares: 100_000,
  isDonor: false,
  isRelated: true,
  relation: "lineal_descendant",
  ...o,
});
const engine = (sh: unknown[], extra: Record<string, unknown> = {}) =>
  calcSpecificCorpGiftMulti({
    transactionBenefit: 2_000_000_000,
    counterparty: "ruling_shareholder",
    controllingGroupRatio: { numer: 10_000, denom: 10_000 },
    shareholders: sh,
    ...extra,
  } as unknown as SpecificCorpInput);

describe("SC-F 증여자 2인 — 별개 거래이므로 차단한다 (§45의5①)", () => {
  const TWO_DONORS: DeemedFormState = {
    ...INITIAL_DEEMED,
    type: "specific_corp",
    giftDate: "2026-03-02",
    scMode: "roster",
    scCorporateTaxMode: "direct",
    scCounterparty: "ruling_shareholder",
    scTransactionBenefit: "2000000000",
    scCorporateTax: "0",
    scTotalShares: "100000",
    scShareholders: [
      { id: "gap", name: "갑", relation: "lineal_ascendant", shares: "60000", isDonor: true, isCorporate: false, donorRelation: "", isGenerationSkip: false },
      { id: "eul", name: "을", relation: "lineal_descendant", shares: "40000", isDonor: true, isCorporate: false, donorRelation: "", isGenerationSkip: false },
    ],
  } as unknown as DeemedFormState;

  it("[D-0] 종전 동작 재현 — 두 행이 서로 상쇄돼 0원이 된다", () => {
    const r = engine([
      SH({ id: "gap", name: "갑", shares: 60_000, isDonor: true }),
      SH({ id: "eul", name: "을", shares: 40_000, isDonor: true }),
    ]);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.specificCorpMulti!.donees.every((d) => d.nonTaxableReason === "donor_self")).toBe(true);
  });

  it("[D-1] ⑧ validate가 막는다 — 1명이면 통과", () => {
    expect(validateDeemedInput(TWO_DONORS)).toContain("증여자 본인은 1명만");
    const one = {
      ...TWO_DONORS,
      scShareholders: TWO_DONORS.scShareholders!.map((sh, i) => (i === 1 ? { ...sh, isDonor: false } : sh)),
    } as DeemedFormState;
    expect(validateDeemedInput(one)).toBeNull();
  });

  it("[D-2] ⑫ Zod도 같은 규칙을 건다 (3중 패턴 — ⑧만 막으면 직접 호출이 뚫린다)", () => {
    const input = buildDeemedGiftInput(TWO_DONORS);
    const parsed = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(input)));
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("증여자 본인은 1명만");
  });
});

describe("SC-I §53 증여재산공제 — 수증자별", () => {
  it("[D-3] 배우자 6억 / 자녀 5천만 — 자녀 70,000,000 → 225,000,000 (155,000,000 과소 해소)", () => {
    const r = engine(
      [
        SH({ id: "sp", name: "배우자", relation: "spouse", shares: 50_000, donorRelation: "spouse" }),
        SH({ id: "ch", name: "자녀", shares: 50_000, donorRelation: "lineal_ascendant_adult" }),
      ],
      { giftDeduction: 600_000_000 },
    );
    const by = (n: string) => r.specificCorpMulti!.donees.find((d) => d.name === n)!;
    expect(by("배우자").limitCalc!.computedTax).toBe(70_000_000); // 6억 공제 → 과세표준 4억
    expect(by("자녀").limitCalc!.computedTax).toBe(225_000_000); // 5천만 공제 → 과세표준 9.5억
  });

  it("[D-4] 미지정(\"\")이면 입력 단의 단일 공제로 떨어진다 — 기사용 공제가 있을 때의 경로", () => {
    const r = engine([SH({ id: "a", name: "갑", shares: 100_000 })], { giftDeduction: 600_000_000 });
    expect(r.specificCorpMulti!.donees[0].limitCalc!.computedTax).toBe(
      engine([SH({ id: "a", name: "갑", shares: 100_000, donorRelation: "spouse" })]).specificCorpMulti!
        .donees[0].limitCalc!.computedTax,
    ); // 단일 6억 == 배우자 한도 6억
  });

  it("[D-5] §53 한도는 gift-deductions의 단일 소스를 쓴다 — 관계별로 값이 갈린다", () => {
    const taxOf = (donorRelation: string) =>
      engine([SH({ id: "a", name: "갑", shares: 100_000, donorRelation })]).specificCorpMulti!.donees[0]
        .limitCalc!.computedTax;
    // 공제가 클수록 세액이 작다 — 6억 > 5천만 > 2천만 > 1천만
    expect(taxOf("spouse")).toBeLessThan(taxOf("lineal_ascendant_adult"));
    expect(taxOf("lineal_ascendant_adult")).toBeLessThan(taxOf("lineal_ascendant_minor"));
    expect(taxOf("lineal_ascendant_minor")).toBeLessThan(taxOf("other_relative"));
  });
});

describe("SC-J §57 세대생략 할증 — §45의5② 한도 패널", () => {
  it("[D-6] 손자 수증 240,000,000 → 312,000,000 · 자진납부 232,800,000 → 302,640,000", () => {
    const plain = engine([
      SH({ id: "a", name: "자녀", shares: 50_000 }),
      SH({ id: "x", name: "타인", relation: "other", shares: 50_000, isRelated: false }),
    ]).specificCorpMulti!.donees[0].limitCalc!;
    expect(plain.computedTax).toBe(240_000_000);
    expect(plain.selfPayTax).toBe(232_800_000);

    const gs = engine([
      SH({ id: "a", name: "손자", shares: 50_000, isGenerationSkip: true }),
      SH({ id: "x", name: "타인", relation: "other", shares: 50_000, isRelated: false }),
    ]).specificCorpMulti!.donees[0].limitCalc!;
    expect(gs.computedTax).toBe(312_000_000); // 240,000,000 + 30% 할증 72,000,000
    expect(gs.filingCredit).toBe(9_360_000); // §69 3%
    expect(gs.selfPayTax).toBe(302_640_000);
  });

  it("[D-7] 할증은 ㉠(직접증여 가정)에도 붙는다 — 영 §34의5⑨이 ㉠를 「증여세」로 정의한다", () => {
    const gs = engine([
      SH({ id: "a", name: "손자", shares: 50_000, isGenerationSkip: true }),
      SH({ id: "x", name: "타인", relation: "other", shares: 50_000, isRelated: false }),
    ]).specificCorpMulti!.donees[0].limitCalc!;
    // ㉮와 ㉠의 base가 같으므로(법인세 0) 둘 다 같은 할증 후 값이어야 한다.
    // ㉠에만 할증을 빠뜨리면 limitAmount가 작아져 finalTax가 240,000,000으로 되돌아간다.
    expect(gs.directGiftTax).toBe(312_000_000);
    expect(gs.finalTax).toBe(312_000_000);
  });

  it("[D-9] §57② — 미성년 수증자 + 세대생략 재산 20억 초과면 40%다", () => {
    const at = (donorRelation: string) =>
      calcSpecificCorpGiftMulti({
        transactionBenefit: 5_000_000_000,
        counterparty: "ruling_shareholder",
        controllingGroupRatio: { numer: 10_000, denom: 10_000 },
        shareholders: [
          SH({ id: "a", name: "손자", shares: 100_000, isGenerationSkip: true, donorRelation }),
        ],
      } as unknown as SpecificCorpInput).specificCorpMulti!.donees[0].limitCalc!;

    // 성년: 공제 50,000,000 → 과세표준 4,950,000,000 → 산출 2,015,000,000 × **1.3**
    expect(at("lineal_ascendant_adult").computedTax).toBe(2_619_500_000);
    // 미성년: 공제 20,000,000 → 과세표준 4,980,000,000 → 산출 2,030,000,000 × **1.4**
    expect(at("lineal_ascendant_minor").computedTax).toBe(2_842_000_000);
    // 미성년 판정이 죽으면 30%가 적용돼 2,639,000,000이 된다 — 공제 차이만으로는 갈리지 않는다
    expect(at("lineal_ascendant_minor").computedTax).not.toBe(2_639_000_000);
  });

  it("[D-8] 세대생략이 아니면 할증이 붙지 않는다 (긍정 짝)", () => {
    const r = engine([
      SH({ id: "a", name: "자녀", shares: 50_000, isGenerationSkip: false }),
      SH({ id: "x", name: "타인", relation: "other", shares: 50_000, isRelated: false }),
    ]).specificCorpMulti!.donees[0].limitCalc!;
    expect(r.computedTax).toBe(240_000_000);
  });
});
