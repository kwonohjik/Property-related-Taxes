/**
 * §34의3⑩·⑭ 과세제외매출액 (W9 · 리뷰 클러스터 RC-E · RC-B · RC-J).
 *
 * 세 결함이 `computeCommonExclusion` 한 함수를 공유한다:
 *  · RC-E — `isRelated`를 보지 않아 **비특수관계** 매출이 분자·분모에서 차감된다.
 *  · RC-B — ⑩3호의 「× 수혜법인의 주식보유비율」이 빠져 ⑩2호(전액)와 결과가 같아진다.
 *  · RC-J — ⑭ 1·2·4호가 미구현이고 SCOPE_OUT 선언조차 없다.
 */
import { describe, it, expect } from "vitest";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import { computeCommonExclusion } from "@/lib/tax-engine/gift-deemed/related-corp-helpers";
import type { RelatedCorpInput, RcSalesPartner } from "@/lib/tax-engine/gift-deemed/types";

/** 중소기업 · 세후영업이익 2,160,000,000 · 갑(본인) 20% · 을(친족) 10% · 병(기타) 70% */
function inp(partners: RcSalesPartner[]): RelatedCorpInput {
  return {
    enterpriseSize: "small",
    totalSales: 20_000_000_000,
    preTaxAdjOperatingIncome: 2_500_000_000,
    taxableIncome: 1_800_000_000,
    corporateTaxNet: 340_000_000,
    shareholders: [
      { id: "gap", name: "갑", relation: "self", directRatio: { numer: 20, denom: 100 }, isCorporate: false },
      { id: "eul", name: "을", relation: "relative", directRatio: { numer: 10, denom: 100 }, isCorporate: false },
      { id: "byung", name: "병", relation: "other", directRatio: { numer: 70, denom: 100 }, isCorporate: false },
    ],
    intermediaryCorps: [],
    salesPartners: partners,
  };
}

const D_RELATED: RcSalesPartner = {
  id: "sD", name: "D법인", salesAmount: 14_000_000_000, isRelated: true,
};

describe("RC-E — 비특수관계 매출처의 stale 과세제외유형", () => {
  it("[EX-0] 비특수관계 행의 exclusionType은 과세제외매출액에 산입되지 않는다", () => {
    const partners: RcSalesPartner[] = [
      D_RELATED,
      { id: "etc", name: "기타", salesAmount: 6_000_000_000, isRelated: false, exclusionType: "sec10_5" },
    ];
    expect(computeCommonExclusion(partners)).toBe(0);
  });

  it("[EX-0b] 긍정 짝 — 같은 행을 특수관계로 켜면 산입된다 (가드가 유형이 아니라 isRelated를 본다)", () => {
    const partners: RcSalesPartner[] = [
      D_RELATED,
      { id: "etc", name: "기타", salesAmount: 6_000_000_000, isRelated: true, exclusionType: "sec10_5" },
    ];
    expect(computeCommonExclusion(partners)).toBe(6_000_000_000);
  });

  it("[EX-1] stale 유형이 남아 있어도 세액이 흔들리지 않는다 — 43,200,000 유지", () => {
    const clean = calcRelatedCorpGift(
      inp([D_RELATED, { id: "etc", name: "기타", salesAmount: 6_000_000_000, isRelated: false }]),
    );
    const stale = calcRelatedCorpGift(
      inp([
        D_RELATED,
        { id: "etc", name: "기타", salesAmount: 6_000_000_000, isRelated: false, exclusionType: "sec10_5" },
      ]),
    );
    expect(clean.deemedGiftValue).toBe(43_200_000);
    expect(stale.deemedGiftValue).toBe(43_200_000); // 종전 10,800,000 (32,400,000원 과소)
  });

  it("[EX-2] 분자뿐 아니라 분모도 오염됐었다 — 거래비율 70%가 유지된다", () => {
    const stale = calcRelatedCorpGift(
      inp([
        D_RELATED,
        { id: "etc", name: "기타", salesAmount: 6_000_000_000, isRelated: false, exclusionType: "sec10_5" },
      ]),
    );
    // 종전: 8,000,000,000 / 14,000,000,000 (57.14%)
    expect(stale.tradeRatioNumer).toBe(14_000_000_000);
    expect(stale.tradeRatioDenom).toBe(20_000_000_000);
    expect(stale.taxableExcludedSales).toBe(0);
  });
});

/** 중소기업 · 총매출 1,000억 · 세후영업이익 8,000,000,000 · 갑(본인) 60% */
function inpB(partners: RcSalesPartner[]): RelatedCorpInput {
  return {
    enterpriseSize: "small",
    totalSales: 100_000_000_000,
    preTaxAdjOperatingIncome: 10_000_000_000,
    taxableIncome: 10_000_000_000,
    corporateTaxNet: 2_000_000_000,
    shareholders: [
      { id: "gap", name: "갑", relation: "self", directRatio: { numer: 60, denom: 100 }, isCorporate: false },
      { id: "etc", name: "기타", relation: "other", directRatio: { numer: 40, denom: 100 }, isCorporate: false },
    ],
    intermediaryCorps: [],
    salesPartners: partners,
  };
}
const B_CORP: RcSalesPartner = { id: "B", name: "B법인", salesAmount: 60_000_000_000, isRelated: true };
const THIRD: RcSalesPartner = { id: "T", name: "제3자", salesAmount: 20_000_000_000, isRelated: false };
/** 수혜법인의 A법인 지분 30% (§⑩3호 — 50% 미만) */
const A_SEC3: RcSalesPartner = {
  id: "A", name: "A법인", salesAmount: 20_000_000_000, isRelated: true,
  exclusionType: "sec10_3", beneficiaryStakeInPartner: { numer: 3000, denom: 10_000 },
};

describe("RC-B — §⑩3호 「× 수혜법인의 주식보유비율」", () => {
  it("[B3-0] 200억 × 30% = 60억만 과세제외된다 → 1,080,000,000원 (종전 800,000,000원)", () => {
    const r = calcRelatedCorpGift(inpB([A_SEC3, B_CORP, THIRD]));
    expect(r.taxableExcludedSales).toBe(6_000_000_000);
    expect(r.tradeRatioNumer).toBe(74_000_000_000);
    expect(r.tradeRatioDenom).toBe(94_000_000_000);
    expect(r.deemedGiftValue).toBe(1_080_000_000); // 차액 280,000,000원 과소였다
  });

  it("[B3-1] ⑩2호(전액)와 ⑩3호(× 보유비율)가 더 이상 같은 값이 아니다", () => {
    const two = calcRelatedCorpGift(
      inpB([{ id: "A", name: "A법인", salesAmount: 20_000_000_000, isRelated: true, exclusionType: "sec10_2" }, B_CORP, THIRD]),
    );
    const three = calcRelatedCorpGift(inpB([A_SEC3, B_CORP, THIRD]));
    // 종전에는 둘 다 800,000,000원으로 «한 원도 다르지 않았다» — 분기 부존재의 직접 증거였다
    expect(two.deemedGiftValue).toBe(800_000_000);
    expect(three.deemedGiftValue).toBe(1_080_000_000);
    expect(two.deemedGiftValue).not.toBe(three.deemedGiftValue);
  });

  it("[B3-2] 3호 이외의 호는 전액 제외를 유지한다 (긍정 짝 — 3호만 축소된다)", () => {
    for (const t of ["sec10_1", "sec10_2", "sec10_5", "sec10_8"] as const) {
      const excl = computeCommonExclusion([
        { id: "A", name: "A법인", salesAmount: 20_000_000_000, isRelated: true, exclusionType: t,
          beneficiaryStakeInPartner: { numer: 3000, denom: 10_000 } },
      ]);
      expect(excl).toBe(20_000_000_000); // 비율이 붙어 있어도 3호가 아니면 무시한다
    }
    expect(computeCommonExclusion([A_SEC3])).toBe(6_000_000_000);
  });

  it("[B3-3] §⑩ 후단 「더 큰 금액」 비교는 **축소한 뒤** 금액으로 한다", () => {
    // 같은 법인(id="A")이 3호(200억×30%=60억)와 2호(100억 전액)에 동시 해당 → 더 큰 100억
    const excl = computeCommonExclusion([
      A_SEC3,
      { id: "A", name: "A법인", salesAmount: 10_000_000_000, isRelated: true, exclusionType: "sec10_2" },
    ]);
    // 종전처럼 3호를 전액(200억)으로 넣으면 200억이 되어 max 비교 자체가 틀린다
    expect(excl).toBe(10_000_000_000);
  });

  it("[B3-4] 보유비율 미입력이면 제외액 0 — 전액 제외로 되돌아가지 않는다", () => {
    // 「자동 안분 fallback 금지」. 실제 관문은 ⑧validate이고, 엔진이 전액으로 되메우면 그 정책이 무력해진다.
    const excl = computeCommonExclusion([
      { id: "A", name: "A법인", salesAmount: 20_000_000_000, isRelated: true, exclusionType: "sec10_3" },
    ]);
    expect(excl).toBe(0);
  });

  it("[B3-5] 보유비율은 §⑭3호의 지배주주등 보유비율과 다른 축이다 — 돌려쓰지 않는다", () => {
    const excl = computeCommonExclusion([
      { id: "A", name: "A법인", salesAmount: 20_000_000_000, isRelated: true, exclusionType: "sec10_3",
        rulingShareholderStakes: [{ shareholderId: "gap", ratio: { numer: 3000, denom: 10_000 } }] },
    ]);
    expect(excl).toBe(0); // ⑭3호 값이 있어도 ⑩3호의 곱셈에는 쓰이지 않는다
  });
});

/**
 * 일반기업 · 총매출 200억 · 세후영업이익 2,160,000,000
 * 주주 갑(본인 20%) · 을(친족 10%) · 병(기타 40%) · B법인(30%)
 * B법인은 §⑱1호 간접출자법인(갑 30% + 을 20% = 50% ≥ 30%)이자 특수관계 매출처다.
 */
function inpJ(partners: RcSalesPartner[]): RelatedCorpInput {
  return {
    enterpriseSize: "large",
    totalSales: 20_000_000_000,
    preTaxAdjOperatingIncome: 2_500_000_000,
    taxableIncome: 1_800_000_000,
    corporateTaxNet: 340_000_000,
    shareholders: [
      { id: "gap", name: "갑", relation: "self", directRatio: { numer: 20, denom: 100 }, isCorporate: false },
      { id: "eul", name: "을", relation: "relative", directRatio: { numer: 10, denom: 100 }, isCorporate: false },
      { id: "byung", name: "병", relation: "other", directRatio: { numer: 40, denom: 100 }, isCorporate: false },
      { id: "Bcorp", name: "B법인", relation: "other", directRatio: { numer: 30, denom: 100 }, isCorporate: true },
    ],
    intermediaryCorps: [
      {
        corpShareholderId: "Bcorp",
        stakeInBeneficiary: { numer: 30, denom: 100 },
        owners: [
          { individualId: "gap", ratio: { numer: 30, denom: 100 } },
          { individualId: "eul", ratio: { numer: 20, denom: 100 } },
        ],
      },
    ],
    salesPartners: partners,
  };
}
const D_12B: RcSalesPartner = { id: "D", name: "D법인", salesAmount: 12_000_000_000, isRelated: true };
const ETC_5B: RcSalesPartner = { id: "E", name: "기타", salesAmount: 5_000_000_000, isRelated: false };
const b = (over: Partial<RcSalesPartner> = {}): RcSalesPartner => ({
  id: "B", name: "B법인", salesAmount: 3_000_000_000, isRelated: true, ...over,
});

describe("RC-J — §⑭1호 간접출자법인 매출 전액 과세제외", () => {
  it("[J1-0] B법인을 §⑱ 간접출자법인으로 지정하면 30억 전액이 제외된다 → 541,890,000원", () => {
    const off = calcRelatedCorpGift(inpJ([b(), D_12B, ETC_5B]));
    const on = calcRelatedCorpGift(inpJ([b({ intermediaryCorpShareholderId: "Bcorp" }), D_12B, ETC_5B]));
    expect(off.deemedGiftValue).toBe(680_400_000); // 종전 — 138,510,000원 과대
    expect(on.deemedGiftValue).toBe(541_890_000);
    expect(on.recipientBreakdown?.map((r) => r.subtotal)).toEqual([349_218_000, 192_672_000]);
  });

  it("[J1-1] §⑱ 요건 미충족이면 지정해도 성립하지 않는다 (선택만으로 만들지 않는다)", () => {
    // 지배주주등 합산 = 갑 25% < 30% → §⑱1호 미충족.
    // ⚠️ 소유주를 바꾸면 «간접보유비율»도 함께 움직여 기준선이 달라진다 —
    //    그래서 **같은 weak 입력에서 지정 여부만** 가른다(다른 축 혼입 차단).
    const weakCorps = [
      {
        corpShareholderId: "Bcorp",
        stakeInBeneficiary: { numer: 30, denom: 100 },
        owners: [{ individualId: "gap", ratio: { numer: 25, denom: 100 } }],
      },
    ];
    const off = inpJ([b(), D_12B, ETC_5B]);
    off.intermediaryCorps = weakCorps;
    const on = inpJ([b({ intermediaryCorpShareholderId: "Bcorp" }), D_12B, ETC_5B]);
    on.intermediaryCorps = weakCorps;
    expect(calcRelatedCorpGift(on).deemedGiftValue).toBe(calcRelatedCorpGift(off).deemedGiftValue);

    // 긍정 짝 — 같은 자리에서 §⑱을 충족시키면(갑 30%) 값이 «달라진다»
    const strong = inpJ([b({ intermediaryCorpShareholderId: "Bcorp" }), D_12B, ETC_5B]);
    strong.intermediaryCorps = [
      { ...weakCorps[0]!, owners: [{ individualId: "gap", ratio: { numer: 30, denom: 100 } }] },
    ];
    const strongOff = inpJ([b(), D_12B, ETC_5B]);
    strongOff.intermediaryCorps = strong.intermediaryCorps;
    expect(calcRelatedCorpGift(strong).deemedGiftValue).not.toBe(
      calcRelatedCorpGift(strongOff).deemedGiftValue,
    );
  });

  it("[J1-2] 없는 법인주주 id를 가리키면 무시된다 (고아 참조)", () => {
    const orphan = calcRelatedCorpGift(inpJ([b({ intermediaryCorpShareholderId: "NOPE" }), D_12B, ETC_5B]));
    expect(orphan.deemedGiftValue).toBe(680_400_000);
  });

  it("[J1-3] ⑩ 해당 매출처는 ⑭ 대상이 아니다 — ⑭ 본문 「제10항 … 해당하지 아니하는 경우로서」", () => {
    const withSec10 = calcRelatedCorpGift(
      inpJ([b({ intermediaryCorpShareholderId: "Bcorp", exclusionType: "sec10_5" }), D_12B, ETC_5B]),
    );
    // ⑩5호로 이미 전액 제외되므로 ⑭1호가 «추가로» 더하지 않는다 (이중 차감 금지)
    expect(withSec10.taxableExcludedSales).toBe(3_000_000_000);
    expect(withSec10.recipientBreakdown?.every((r) => r.additionalExclusion === 0)).toBe(true);
  });

  it("[J1-4] ⑭ 후단 「더 큰 금액」 — 같은 매출처에서 1호(전액)와 3호(× 보유비율) 중 큰 쪽", () => {
    const both = calcRelatedCorpGift(
      inpJ([
        b({
          intermediaryCorpShareholderId: "Bcorp",
          rulingShareholderStakes: [{ shareholderId: "gap", ratio: { numer: 1000, denom: 10_000 } }],
        }),
        D_12B, ETC_5B,
      ]),
    );
    // 갑: 1호 30억 vs 3호 3억 → 30억. 합산(33억)이 아니다.
    expect(both.recipientBreakdown?.[0]?.additionalExclusion).toBe(3_000_000_000);
  });

  it("[J1-5] ⑭3호만 있는 경우는 종전대로 × 보유비율", () => {
    const only3 = calcRelatedCorpGift(
      inpJ([
        b({ rulingShareholderStakes: [{ shareholderId: "gap", ratio: { numer: 1000, denom: 10_000 } }] }),
        D_12B, ETC_5B,
      ]),
    );
    expect(only3.recipientBreakdown?.[0]?.additionalExclusion).toBe(300_000_000);
  });
});

describe("RC-J — §⑭2호·4호 미구현 고지", () => {
  it("[J2-0] ⑭1호가 걸리지 않은 ⑩ 미해당 특수관계 매출처가 있으면 고지한다", () => {
    const r = calcRelatedCorpGift(inpJ([b({ intermediaryCorpShareholderId: "Bcorp" }), D_12B, ETC_5B]));
    expect(r.sec14ScopeNotice).toContain("§34의3⑭");
    expect(r.sec14ScopeNotice).toContain("2호");
    expect(r.sec14ScopeNotice).toContain("4호");
    expect(r.sec14ScopeNotice).toContain("1곳"); // D법인만 남는다 (B는 ⑭1호로 전액)
  });

  it("[J2-1] 여지가 없으면 고지가 사라진다 — 상시 노출 금지", () => {
    // D법인까지 ⑩5호로 전액 제외 → ⑭ 대상 매출처 0곳
    const r = calcRelatedCorpGift(
      inpJ([
        b({ intermediaryCorpShareholderId: "Bcorp" }),
        { ...D_12B, exclusionType: "sec10_5" },
        ETC_5B,
      ]),
    );
    expect(r.sec14ScopeNotice).toBeUndefined();
  });

  it("[J2-2] 비특수관계 매출처는 고지 모수에 넣지 않는다", () => {
    const r = calcRelatedCorpGift(
      inpJ([
        b({ intermediaryCorpShareholderId: "Bcorp" }),
        { ...D_12B, exclusionType: "sec10_5" },
        { ...ETC_5B, isRelated: false },
      ]),
    );
    expect(r.sec14ScopeNotice).toBeUndefined();
  });
});
