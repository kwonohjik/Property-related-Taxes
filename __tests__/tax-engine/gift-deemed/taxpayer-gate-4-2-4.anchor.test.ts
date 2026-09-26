/**
 * 「상증법」§4의2④ 납세의무 게이트 — Pre-Do anchor (설계 7-2)
 *
 * §4의2④ verbatim — "**영리법인이 증여받은 재산 또는 이익**에 대하여 「법인세법」에 따른
 * 법인세가 부과되는 경우(법인세가 … 비과세되거나 감면되는 경우를 포함한다) **해당 법인의
 * 주주등**에 대해서는 **제45조의3부터 제45조의5까지의 규정에 따른 경우를 제외하고는**
 * 증여세를 부과하지 아니한다."
 *
 * 근거: 국세청 과세기준자문 기준-2022-법무재산-0178[법무과-4943](생산 2023.07.13.) —
 * §39 증자이익에 이 항을 **직접 적용**했다. 원문·사실관계는
 * `docs/00-pm/gift-deemed-taxpayer-gate-4-2.plan.md` §1.
 *
 * 🔴 이 파일의 절반은 **긍정 짝**이다. 「법인세가 부과되면 무조건 0원」이라는 과잉 배제가
 *    부정형 anchor만으로는 초록으로 통과하기 때문이다. 특히 두 가지를 고정한다:
 *      (a) §39①1호 **다목**의 수증자는 조문상 「해당 법인의 주주등이 **아닌** 자」다
 *          ⇒ 「해당 법인의 주주등」 요건이 성립할 수 없어 배제가 **미치지 않는다**.
 *      (b) ④ 단서가 **§45의3~§45의5를 배제에서 제외**한다 ⇒ 그 유형은 여전히 과세다.
 */

import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import type { CapitalIncreaseInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";

/**
 * 자문 사실관계(§1) 재현 — §39①2호 **라목** + 「상증령」§29②5호.
 * 원문에 증자전 발행주식총수가 없어 지분율 「1.28%」에서 역산한다(甲 982,639주).
 * ⇒ 증자전 76,768,672주 · 증자후 1주당 ≈3,447.36 · 균등배정분 736,667 · 이익 ≈289,246,862.
 * ㈜C가 신주 전량을 단독 인수했으므로 §29②5호의 비율은 57,552,083 ÷ 57,552,083 = 1이다.
 */
const ADVISORY: CapitalIncreaseInput = {
  direction: "high",
  subType: "excess", // §39①2호 라목 — 균등배정분을 초과하여 직접 배정받아 인수
  preIssuePrice: 3_153, // 「상증법」§63①1가 — 전후 2개월 종가평균
  preIssueShares: 76_768_672,
  newSharePrice: 3_840, // 출자전환 발행가액
  issuedShares: 57_552_083,
  forfeitedShares: 736_667, // 甲이 미달 배정된 부분의 신주수
  relatedAcquiredShares: 57_552_083,
  ratioDenomShares: 57_552_083,
};

describe("[TG] §4의2④ — 법인세가 부과된 영리법인의 주주등", () => {
  it("[TG-1] 발행법인 수증이익에 법인세 부과 + 수증자가 그 법인의 주주 → 증여세 0원", () => {
    const r = calcCapitalIncreaseGift({
      ...ADVISORY,
      issuerGainCorporateTaxed: true,
    } as CapitalIncreaseInput);
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("§4의2④");
  });

  it("[TG-5] 산출 이익은 보존된다 — 그 금액은 법인세 익금의 근거이지 허수가 아니다", () => {
    const r = calcCapitalIncreaseGift({
      ...ADVISORY,
      issuerGainCorporateTaxed: true,
    } as CapitalIncreaseInput);
    // 「상증법」§31①이 「증여재산가액」을 과세대상 가액에 한정 정의하므로 라벨이 바뀐다.
    const labels = r.breakdown.map((b) => b.label);
    expect(labels).toContain("제외 전 산출 이익 (「상증법」§4의2④ — 주주등 증여세 미과세)");
    expect(labels).not.toContain("증여재산가액");
    expect(r.thresholdEcho?.gain).toBeGreaterThan(289_000_000);
    expect(r.thresholdEcho?.gain).toBeLessThan(290_000_000);
  });

  it("[TG-7] 자문 사실관계 실측 — 게이트 전 ≈289,246,862 → 게이트 후 0", () => {
    const before = calcCapitalIncreaseGift(ADVISORY);
    expect(before.deemedGiftValue).toBeGreaterThan(289_000_000);
    expect(before.deemedGiftValue).toBeLessThan(290_000_000);
    const after = calcCapitalIncreaseGift({
      ...ADVISORY,
      issuerGainCorporateTaxed: true,
    } as CapitalIncreaseInput);
    expect(after.deemedGiftValue).toBe(0);
  });
});

describe("[TG] 긍정 짝 — 배제가 미치면 «안 되는» 자리", () => {
  it("[TG-2] 법인세 미부과면 종전 금액 그대로 — 요건 없이 0원으로 만들지 않는다", () => {
    const r = calcCapitalIncreaseGift({
      ...ADVISORY,
      issuerGainCorporateTaxed: false,
    } as CapitalIncreaseInput);
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBeGreaterThan(289_000_000);
  });

  it("[TG-2b] 플래그 미지정도 종전 그대로 — 미입력을 «부과됨»으로 읽지 않는다", () => {
    const r = calcCapitalIncreaseGift(ADVISORY);
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBeGreaterThan(289_000_000);
  });

  it("[TG-3] §39①1호 «다목» — 수증자가 조문상 「주주등이 아닌 자」라 배제가 미치지 않는다", () => {
    // 「상증법」§39①1호 다목 — "해당 법인의 **주주등이 아닌 자**가 해당 법인으로부터 신주를
    // 직접 배정받음으로써 얻은 이익". §4의2④의 「해당 법인의 주주등」 요건이 성립할 수 없다.
    const thirdParty: CapitalIncreaseInput = {
      direction: "low",
      subType: "third_party",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 20_000,
    };
    const base = calcCapitalIncreaseGift(thirdParty);
    expect(base.deemedGiftValue).toBe(66_660_000);

    const gated = calcCapitalIncreaseGift({
      ...thirdParty,
      issuerGainCorporateTaxed: true,
    } as CapitalIncreaseInput);
    // 법인세 부과 사실이 있어도 이 목에서는 배제되지 않는다.
    expect(gated.applied).toBe(true);
    expect(gated.deemedGiftValue).toBe(66_660_000);
  });

  it("[TG-3b] 1호 «라목»은 반대로 주주가 확정이라 배제가 미친다 — 다목과 갈리는 것이 목이다", () => {
    // 「상증법」§39①1호 라목 — "해당 법인의 **주주등**이 … 초과하여 신주를 직접 배정받음으로써"
    const excess: CapitalIncreaseInput = {
      direction: "low",
      subType: "excess",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 20_000,
    };
    const gated = calcCapitalIncreaseGift({
      ...excess,
      issuerGainCorporateTaxed: true,
    } as CapitalIncreaseInput);
    expect(gated.applied).toBe(false);
    expect(gated.deemedGiftValue).toBe(0);
  });

  it("[TG-3c] 사안 의존 목(1호 가목)은 주주 여부 «입력»이 판정을 가른다", () => {
    // 1호 가목 — "그 실권주를 **배정받은 자**". 주주일 수도, 아닐 수도 있다 ⇒ 입력으로 받는다.
    const realloc: CapitalIncreaseInput = {
      direction: "low",
      subType: "forfeited_realloc",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 20_000,
    };
    const asShareholder = calcCapitalIncreaseGift({
      ...realloc,
      issuerGainCorporateTaxed: true,
      doneeIsShareholderOfIssuer: true,
    } as CapitalIncreaseInput);
    expect(asShareholder.deemedGiftValue).toBe(0);

    const asOutsider = calcCapitalIncreaseGift({
      ...realloc,
      issuerGainCorporateTaxed: true,
      doneeIsShareholderOfIssuer: false,
    } as CapitalIncreaseInput);
    expect(asOutsider.applied).toBe(true);
    expect(asOutsider.deemedGiftValue).toBeGreaterThan(0);
  });

  it("[TG-3d] 사안 의존 목에서 주주 여부 미지정은 «배제하지 않는다» — 안전측", () => {
    // 미입력을 「주주다」로 읽으면 과소과세 방향이다. §4의2④는 납세자에게 유리한 배제이므로
    // 요건 미입증 시 적용하지 않는다(§39② 소액주주 `faceValueSum` 미입력과 같은 층위).
    const r = calcCapitalIncreaseGift({
      direction: "low",
      subType: "forfeited_realloc",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 20_000,
      issuerGainCorporateTaxed: true,
    } as CapitalIncreaseInput);
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBeGreaterThan(0);
  });
});

describe("[TG] 게이트가 다른 배제와 겹칠 때", () => {
  it("[TG-8] 공모 제외가 먼저 성립하면 그 사유가 남는다 — 요건 불성립이 납세의무보다 앞선다", () => {
    const r = calcCapitalIncreaseGift({
      ...ADVISORY,
      isListed: true,
      allocationMethod: "public_offering",
      issuerGainCorporateTaxed: true,
    } as CapitalIncreaseInput);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("§39①");
  });
});

describe("[TG] §39①3호 전환주식 — 게이트는 «차감항»에서 발동하면 안 된다", () => {
  // 「상증령」§29②6호 — 가목(전환 후 이익) − 나목(발행 당시 이익).
  // 나목은 과세단위가 아니라 **기준선**이다. 거기서만 게이트가 발동하면 기준선이 0이 되어
  // 결과가 **부풀어 오른다** — 이 엔진이 공모 제외에서 이미 겪은 비대칭과 같은 형태다.
  const leg = (over: Partial<CapitalIncreaseInput> = {}): CapitalIncreaseInput => ({
    direction: "low",
    subType: "forfeited_realloc",
    preIssuePrice: 10_000,
    preIssueShares: 100_000,
    newSharePrice: 5_000,
    issuedShares: 50_000,
    forfeitedShares: 20_000,
    ...over,
  });

  it("[TG-9] 차감항에만 법인세 플래그가 서도 차감액이 살아 있다 (기준선 소멸 금지)", () => {
    const base = calcConvertibleStockGift({
      atConversion: leg({ forfeitedShares: 30_000 }),
      atIssuance: leg(),
    });
    const issuanceFlagged = calcConvertibleStockGift({
      atConversion: leg({ forfeitedShares: 30_000 }),
      // 나목에만 플래그 — 이 목은 「주주등」이 확정되지 않지만, 설령 확정돼도
      // 차감항에서 게이트가 돌면 안 된다는 것이 이 anchor의 요지다.
      atIssuance: leg({ issuerGainCorporateTaxed: true, doneeIsShareholderOfIssuer: true }),
    });
    expect(issuanceFlagged.deemedGiftValue).toBe(base.deemedGiftValue);
  });

  it("[TG-10] 과세단위(가목)에 요건이 서면 전체가 0 — 사유는 §4의2④", () => {
    const r = calcConvertibleStockGift({
      atConversion: leg({
        forfeitedShares: 30_000,
        issuerGainCorporateTaxed: true,
        doneeIsShareholderOfIssuer: true,
      }),
      atIssuance: leg(),
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("§4의2④");
    expect(r.thresholdEcho?.gain).toBeGreaterThan(0); // 금액은 보존
  });
});

describe("[TG] ⑫ Zod — 게이트 2축이 침묵 strip 되지 않는다", () => {
  // leaf 직접호출 anchor는 이 층을 지나가지 않는다
  // (memory `feedback_leaf_anchor_skips_zod_layer`).
  // 최상위 discriminatedUnion으로 잰다 — route가 실제로 통과시키는 경계다.
  const payload = {
    type: "capital_increase" as const,
    direction: "high",
    subType: "excess",
    preIssuePrice: 3_153,
    preIssueShares: 76_768_672,
    newSharePrice: 3_840,
    issuedShares: 57_552_083,
    forfeitedShares: 736_667,
    relatedAcquiredShares: 57_552_083,
    ratioDenomShares: 57_552_083,
    issuerGainCorporateTaxed: true,
    doneeIsShareholderOfIssuer: true,
  };

  it("[TG-11] 두 필드가 파싱 결과에 살아서 나온다", () => {
    const r = deemedGiftInputSchema.safeParse(payload);
    expect(r.success).toBe(true);
    if (r.success && r.data.type === "capital_increase") {
      expect(r.data.issuerGainCorporateTaxed).toBe(true);
      expect(r.data.doneeIsShareholderOfIssuer).toBe(true);
    } else {
      expect.unreachable("capital_increase로 파싱돼야 한다");
    }
  });

  it("[TG-12] 긍정 짝: 안 실으면 undefined — 기본값을 주입하지 않는다", () => {
    const r = deemedGiftInputSchema.safeParse({
      ...payload,
      issuerGainCorporateTaxed: undefined,
      doneeIsShareholderOfIssuer: undefined,
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.type === "capital_increase") {
      expect(r.data.issuerGainCorporateTaxed).toBeUndefined();
      expect(r.data.doneeIsShareholderOfIssuer).toBeUndefined();
    } else {
      expect.unreachable("capital_increase로 파싱돼야 한다");
    }
  });
});
