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
