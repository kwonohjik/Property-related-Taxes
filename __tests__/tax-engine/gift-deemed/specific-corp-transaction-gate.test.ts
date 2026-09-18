/**
 * anchor: §45의5① 거래상대방 · 각 호 거래유형 · 영 §34의5⑦ 현저성 · ⑥ 단서
 *
 * ── 무엇이 잘못돼 있었나 ──────────────────────────────────────────────
 * ① **거래상대방**(법 §45의5① 「특정법인이 지배주주 및 그 특수관계인과 … 거래를 하는 경우」)이
 *    ①②③④⑤⑧⑫ 어디에도 없어 증여자가 완전한 제3자여도 그대로 과세됐다
 *    — 실측 거래이익 2,000,000,000 · 지배주주등 100% ⇒ 산출세액 **500,000,000** 과다
 *      (자진납부 485,000,000). 영리법인이 받은 이익이라 §4의2④ 본문상 주주 과세가 아니다.
 * ② **거래유형**(1호·2호·3호·3의2호·4호) 구분축이 없어 `transactionBenefit` 한 칸으로 뭉갰다.
 *    영 §34의5④1호는 가·나·다목으로 이익 산정을 달리 정한다.
 * ③ **영 §34의5⑦ 현저성** — 시가 1,000,000,000 · 대가 800,000,000(차액 20% & < 3억)에서
 *    200,000,000이 그대로 이익으로 계상됐다(증여세 30,000,000 과대).
 *
 * ── 조문 ────────────────────────────────────────────────────────────────
 * - 법 §45의5① — 「특정법인이 **지배주주 및 그 특수관계인**과 다음 각 호에 따른 거래를 하는 경우」
 * - 영 §34의5② — 3의2호 자본거래는 「특정법인과 **지배주주의 특수관계인** 사이에 이루어지거나
 *   지배주주의 특수관계인 사이에 이루어지는」 ⇒ **지배주주 본인이 빠진다**(법 ①은 2026.1.1에
 *   「지배주주 및 그」로 넓혀졌으나 영 ②은 개정되지 않았다).
 * - 영 §34의5④1호 — 가목(1호·4호) 증여재산가액·채무면제이익 / 나목(3의2호) §38 등 **준용** /
 *   다목 「가목 및 나목 외의 경우: **제7항에 따른** 시가와 대가와의 차액에 상당하는 금액」
 * - 영 §34의5⑥ 단서 — 「해당 법인이 해산(합병 또는 분할에 의한 해산은 제외한다) 중인 경우로서
 *   주주등에게 분배할 **잔여재산이 없는 경우는 제외**한다」
 * - 영 §34의5⑦ — 「차액이 시가의 100분의 30 이상**이거나** 그 차액이 3억원 이상인 경우」 ⇒ **OR**
 */
import { describe, it, expect } from "vitest";
import {
  calcSpecificCorpGift,
  calcSpecificCorpGiftMulti,
} from "@/lib/tax-engine/gift-deemed/specific-corp";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

function roster(extra: Record<string, unknown> = {}): SpecificCorpInput {
  return {
    transactionBenefit: 2_000_000_000,
    shareholders: [
      { id: "gap", name: "갑", relation: "lineal_ascendant", shares: 60_000, totalShares: 100_000, isDonor: false, isRelated: true },
      { id: "eul", name: "을", relation: "lineal_descendant", shares: 40_000, totalShares: 100_000, isDonor: false, isRelated: true },
    ],
    ...extra,
  } as unknown as SpecificCorpInput;
}
const totals = (r: ReturnType<typeof calcSpecificCorpGiftMulti>) => ({
  value: r.deemedGiftValue,
  tax: r.specificCorpMulti!.donees.reduce((a, d) => a + (d.limitCalc?.finalTax ?? 0), 0),
  self: r.specificCorpMulti!.donees.reduce((a, d) => a + (d.limitCalc?.selfPayTax ?? 0), 0),
});

function single(extra: Record<string, unknown>): SpecificCorpInput {
  return {
    type: "specific_corp",
    transactionBenefit: 200_000_000,
    corporateTax: 0,
    ownershipRatio: { numer: 10_000, denom: 10_000 },
    controllingGroupRatio: { numer: 10_000, denom: 10_000 },
    counterparty: "ruling_shareholder",
    ...extra,
  } as unknown as SpecificCorpInput;
}

describe("§45의5① 거래상대방", () => {
  it("[T-0] 그 밖의 자와의 거래 → 0원 (종전 500,000,000 / 자진납부 485,000,000)", () => {
    expect(totals(calcSpecificCorpGiftMulti(roster({ counterparty: "ruling_shareholder" })))).toEqual({
      value: 2_000_000_000,
      tax: 500_000_000,
      self: 485_000_000,
    });
    const third = calcSpecificCorpGiftMulti(roster({ counterparty: "other" }));
    expect(totals(third)).toEqual({ value: 0, tax: 0, self: 0 });
    expect(third.exclusionReason).toContain("지배주주 및 그 특수관계인이 아닙니다");
    expect(third.specificCorpMulti!.donees[0].nonTaxableReason).toBe("transaction_not_covered");
  });

  it("[T-1] 지배주주의 특수관계인도 상대방이다 (2026.1.1 「지배주주 및 그」로 확대)", () => {
    expect(calcSpecificCorpGiftMulti(roster({ counterparty: "ruling_related" })).deemedGiftValue).toBe(
      2_000_000_000,
    );
  });

  it("[T-2] 미전달이면 «판정하지 않는다» — 값은 그대로 두고 결과뷰가 고지한다", () => {
    const r = calcSpecificCorpGiftMulti(roster());
    expect(r.specificCorpTransaction!.counterpartyMet).toBe("unknown");
    expect(r.deemedGiftValue).toBe(2_000_000_000); // 조용히 0원으로 막으면 정상 계산이 죽는다
  });

  it("[T-3] 3의2호 자본거래는 지배주주 «본인»이 상대방 후보에서 빠진다 (영 §34의5②)", () => {
    const own = calcSpecificCorpGiftMulti(
      roster({ counterparty: "ruling_shareholder", transactionType: "capital_transaction" }),
    );
    expect(own.deemedGiftValue).toBe(0);
    expect(own.exclusionReason).toContain("상증령 §34의5②");
    // 특수관계인과의 자본거래는 대상이다
    expect(
      calcSpecificCorpGiftMulti(roster({ counterparty: "ruling_related", transactionType: "capital_transaction" }))
        .deemedGiftValue,
    ).toBe(2_000_000_000);
  });
});

describe("영 §34의5⑦ 현저성 — 2·3호", () => {
  it("[T-4] 차액 20% & 3억 미만 → 이익 0 (종전 200,000,000 / 증여세 30,000,000 과대)", () => {
    const before = calcSpecificCorpGift(single({})); // 유형 미지정 = 1호(무상) — 종전 동작
    expect(before.deemedGiftValue).toBe(200_000_000);

    const low = calcSpecificCorpGift(
      single({ transactionType: "low_price", marketValue: 1_000_000_000, consideration: 800_000_000 }),
    );
    expect(low.deemedGiftValue).toBe(0);
    expect(low.specificCorpTransaction!.significance).toMatchObject({
      diff: 200_000_000,
      rateThreshold: 300_000_000,
      met: false,
    });
    expect(low.exclusionReason).toContain("상증령 §34의5⑦");
  });

  it("[T-5] 「30% 이상 **이거나** 3억원 이상」 — OR이다 (AND면 둘 다 죽는다)", () => {
    // 비율만 충족: 차액 350,000,000 = 35% ≥ 30% (3억도 넘지만 비율축 확인용 경계는 T-6)
    expect(
      calcSpecificCorpGift(
        single({ transactionType: "low_price", marketValue: 1_000_000_000, consideration: 650_000_000 }),
      ).deemedGiftValue,
    ).toBe(350_000_000);
    // 금액만 충족: 차액 400,000,000 = 4% (< 30%) 이지만 3억 이상
    expect(
      calcSpecificCorpGift(
        single({ transactionType: "low_price", marketValue: 10_000_000_000, consideration: 9_600_000_000 }),
      ).deemedGiftValue,
    ).toBe(400_000_000);
  });

  it("[T-6] 비율 경계 — 시가 10억의 30%는 정확히 3억이다 (±1원 동등성)", () => {
    const at = calcSpecificCorpGift(
      single({ transactionType: "low_price", marketValue: 1_000_000_000, consideration: 700_000_000 }),
    );
    expect(at.specificCorpTransaction!.significance!.met).toBe(true); // 차액 300,000,000 = 30%
    const under = calcSpecificCorpGift(
      single({ transactionType: "low_price", marketValue: 1_000_000_000, consideration: 700_000_001 }),
    );
    // 차액 299,999,999 — 30% 미달이고 3억 미달
    expect(under.specificCorpTransaction!.significance!.met).toBe(false);
    expect(under.deemedGiftValue).toBe(0);
  });

  it("[T-7] 3호는 부호가 반대다 — 대가 > 시가 (법인이 비싸게 양도)", () => {
    const high = calcSpecificCorpGift(
      single({ transactionType: "high_price", marketValue: 1_000_000_000, consideration: 1_400_000_000 }),
    );
    expect(high.deemedGiftValue).toBe(400_000_000);
    // 같은 값을 2호로 넣으면 차액이 음수라 이익 0 — 유형을 섞으면 안 된다
    expect(
      calcSpecificCorpGift(
        single({ transactionType: "low_price", marketValue: 1_000_000_000, consideration: 1_400_000_000 }),
      ).deemedGiftValue,
    ).toBe(0);
  });
});

describe("영 §34의5⑥ 단서 — 4호 채무면제", () => {
  it("[T-8] 해산 중 + 잔여재산 없음 → 제외", () => {
    expect(calcSpecificCorpGift(single({ transactionType: "debt_relief" })).deemedGiftValue).toBe(
      200_000_000,
    );
    const excluded = calcSpecificCorpGift(
      single({ transactionType: "debt_relief", isDissolvingWithoutResidual: true }),
    );
    expect(excluded.deemedGiftValue).toBe(0);
    expect(excluded.exclusionReason).toContain("상증령 §34의5⑥ 단서");
  });

  it("[T-9] 단서는 4호 전용 — 1호 무상증여에는 적용되지 않는다", () => {
    expect(
      calcSpecificCorpGift(single({ transactionType: "gratuitous", isDissolvingWithoutResidual: true }))
        .deemedGiftValue,
    ).toBe(200_000_000);
  });
});
