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
