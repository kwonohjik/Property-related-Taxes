/**
 * §45의3①1호나목2) — 중소·중견이 아닌 법인의 **추가** 과세요건 (W8 · 리뷰 클러스터 RC-A).
 *
 * 종전 엔진은 과세요건을 「특수관계법인거래비율 > 정상거래비율」 **한 갈래**로만 판정했다.
 * 법 §45의3①1호나목은 중소·중견이 아닌 법인에 대해 **택일** 요건을 둔다 —
 *   1) 가목에 따른 사유에 해당하는 경우
 *   2) 특수관계법인거래비율이 정상거래비율의 3분의 2를 초과하는 경우로서 특수관계법인에
 *      대한 매출액이 … 대통령령으로 정하는 금액(상증령 §34의3 「1천억원」)을 초과하는 경우
 * 2)가 없어 **거래비율 20% 초과 ~ 30% 이하 × 특수관계매출 1천억 초과** 구간이 통째로
 * 0원으로 산출됐다(실측 3,400,000,000원 증여의제이익 과소).
 *
 * ⚠️ 이 갭은 «의도된 SCOPE_OUT»이었다(계획서 §6·§10-4). 다만 설계가 대가로 약속한
 *    「일반 케이스 진입 시 경고 출력」이 구현되지 않은 채 `rc-size-large` 입력 경로만
 *    열려 있었고, 결과 화면은 「과세요건 미충족」을 단정했다 — 거짓 안전 신호.
 */
import { describe, it, expect } from "vitest";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import type { RelatedCorpInput, RcSalesPartner } from "@/lib/tax-engine/gift-deemed/types";

type Size = RelatedCorpInput["enterpriseSize"];

/** 세후영업이익 85,000,000,000(= 1,000억 − 법인세 150억, 전액차감) · 갑 직접 20% */
function inp(size: Size, partners: RcSalesPartner[], totalSales = 1_000_000_000_000): RelatedCorpInput {
  return {
    enterpriseSize: size,
    totalSales,
    preTaxAdjOperatingIncome: 100_000_000_000,
    taxableIncome: 80_000_000_000,
    corporateTaxNet: 15_000_000_000,
    shareholders: [
      { id: "gap", name: "갑", relation: "self", directRatio: { numer: 20, denom: 100 }, isCorporate: false },
      { id: "etc", name: "기타", relation: "other", directRatio: { numer: 80, denom: 100 }, isCorporate: false },
    ],
    intermediaryCorps: [],
    salesPartners: partners,
  };
}

/** 특수관계 `rel`원 + 비특수관계 나머지 */
function split(rel: number, total = 1_000_000_000_000, exclusionType?: RcSalesPartner["exclusionType"]): RcSalesPartner[] {
  return [
    { id: "s1", name: "특수법인", salesAmount: rel, isRelated: true, ...(exclusionType ? { exclusionType } : {}) },
    { id: "s2", name: "기타", salesAmount: total - rel, isRelated: false },
  ];
}

describe("§45의3①1호나목2) 대기업 추가 과세요건", () => {
  it("[B2-0] 일반기업 거래비율 25%·특수관계매출 2,500억 → 3,400,000,000원 (종전 0원)", () => {
    const r = calcRelatedCorpGift(inp("large", split(250_000_000_000)));
    expect(r.taxRequirementMet).toBe(true);
    expect(r.applied).toBe(true);
    // 세후영업이익 85,000,000,000 × (25% − 다목 5%) × 직접 20%
    expect(r.deemedGiftValue).toBe(3_400_000_000);
    expect(r.taxRequirementClause).toBe("상증법 §45의3①1호나목2)");
  });

  it("[B2-1] 나목1)(=가목 사유) 경로는 그대로 — 거래비율 31% → 4,420,000,000원", () => {
    const r = calcRelatedCorpGift(inp("large", split(310_000_000_000)));
    expect(r.deemedGiftValue).toBe(4_420_000_000);
    // 정상거래비율 자체를 넘었으므로 나목2)가 아니라 나목1)로 표시돼야 한다
    expect(r.taxRequirementClause).toBe("상증법 §45의3①1호나목1)");
  });

  it("[B2-2] 3분의 2 경계 — 정확히 20%(=30%×2/3)는 「초과」가 아니므로 미충족", () => {
    const r = calcRelatedCorpGift(inp("large", split(200_000_000_000)));
    expect(r.taxRequirementMet).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.taxRequirementClause).toBeUndefined();
  });

  it("[B2-3] 3분의 2 경계 +1원 → 충족 (지정값 ±1 동등성)", () => {
    const r = calcRelatedCorpGift(inp("large", split(200_000_000_001)));
    expect(r.taxRequirementMet).toBe(true);
    expect(r.taxRequirementClause).toBe("상증법 §45의3①1호나목2)");
  });

  it("[B2-4] 1천억 경계 — 정확히 1천억원은 「초과」가 아니므로 미충족", () => {
    // 총매출 4,000억 · 특수관계 1,000억 = 25% (3분의 2는 넘지만 금액 요건 미달)
    const r = calcRelatedCorpGift(inp("large", split(100_000_000_000, 400_000_000_000), 400_000_000_000));
    expect(r.taxRequirementMet).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[B2-5] 1천억 경계 +1원 → 충족", () => {
    const r = calcRelatedCorpGift(inp("large", split(100_000_000_001, 400_000_000_000), 400_000_000_000));
    expect(r.taxRequirementMet).toBe(true);
    expect(r.taxRequirementClause).toBe("상증법 §45의3①1호나목2)");
  });

  it("[B2-6] 중소기업은 나목2)가 없다 — 35%(정상 50%의 3분의 2 초과)·3,500억이어도 미충족", () => {
    const r = calcRelatedCorpGift(inp("small", split(350_000_000_000)));
    expect(r.taxRequirementMet).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[B2-7] 중견기업도 나목2)가 없다 — 28%(정상 40%의 3분의 2 초과)·2,800억이어도 미충족", () => {
    const r = calcRelatedCorpGift(inp("medium", split(280_000_000_000)));
    expect(r.taxRequirementMet).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[B2-8] 1천억과 견줄 매출액은 §45의3④ 과세제외매출 **차감 후** — 1,050억 − 100억 = 950억 → 미충족", () => {
    // 총매출 4,000억 · 특수관계 1,050억(그중 수출목적 §⑩5호로 전액 과세제외)
    const partners: RcSalesPartner[] = [
      { id: "s1", name: "특수법인A", salesAmount: 95_000_000_000, isRelated: true },
      { id: "s2", name: "특수법인B(수출)", salesAmount: 10_000_000_000, isRelated: true, exclusionType: "sec10_5" },
      { id: "s3", name: "기타", salesAmount: 295_000_000_000, isRelated: false },
    ];
    const r = calcRelatedCorpGift(inp("large", partners, 400_000_000_000));
    expect(r.relatedSales).toBe(105_000_000_000); // 차감 전 총액은 1천억 초과
    expect(r.tradeRatioNumer).toBe(95_000_000_000); // 차감 후 950억
    expect(r.taxRequirementMet).toBe(false);
  });

  it("[B2-8b] 긍정 짝 — 같은 매출에서 과세제외만 걷으면 1,050억 > 1천억으로 충족", () => {
    const partners: RcSalesPartner[] = [
      { id: "s1", name: "특수법인A", salesAmount: 95_000_000_000, isRelated: true },
      { id: "s2", name: "특수법인B", salesAmount: 10_000_000_000, isRelated: true },
      { id: "s3", name: "기타", salesAmount: 295_000_000_000, isRelated: false },
    ];
    const r = calcRelatedCorpGift(inp("large", partners, 400_000_000_000));
    expect(r.tradeRatioNumer).toBe(105_000_000_000);
    expect(r.taxRequirementMet).toBe(true);
  });

  /**
   * ⚠️ **이 anchor의 BigInt 축 구별력은 현재 0이다** — 정직하게 적어 둔다.
   *
   * 3분의 2 교차곱은 총매출 300조(대기업 실재 규모)에서 이미 2^53을 넘는다
   * (225조 × 30 × 2 = 1.35e16 > 9.007e15 — 아래에서 실측 단언). 그런데 **넘는 것과
   * 뒤집히는 것은 다르다**: 양변은 각각 300·60의 배수라 정확한 차이가 0이거나 60 이상이고,
   * 차이가 0이면 `round(300N) = 2·round(150N)`(2배는 지수 증가라 오차 없음)으로 양변이
   * 같은 값으로 반올림된다. 따라서 flip은 「차이 60 < ulp」일 때만 생기고, 실측 탐색 결과
   * **최초 flip은 총매출 약 5.6경원(5.6e16)에서 나타난다** — 어떤 수혜법인도 도달할 수 없다.
   *
   * ⇒ 이 테스트를 `Number` 교차곱으로 바꿔도 **빨개지지 않는다**(뮤테이션 V8 생존 실측).
   *    그럼에도 BigInt를 유지하는 이유는 세 가지다:
   *      · 정확성이 공짜다 — 판정 1회라 성능 논점이 없다.
   *      · 저장소 규칙이 「2^53을 넘는 곱은 BigInt」이고, 이 곱은 실재 규모에서 넘는다.
   *      · 상증령 §34의3⑦ 정상거래비율이 개정되면 승수(현재 ×300, ×60)가 달라져
   *        여유폭도 함께 달라진다 — 그때 이 주석이 재계산의 출발점이 된다.
   */
  it("[B2-9] 총매출 300조에서도 정확히 판정한다 (교차곱은 이미 2^53 초과)", () => {
    expect(225_000_000_000_000 * 30 * 2).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    const r = calcRelatedCorpGift(
      inp("large", split(75_000_000_000_000, 300_000_000_000_000), 300_000_000_000_000),
    );
    expect(r.taxRequirementMet).toBe(true); // 25% > 20% · 75조 > 1천억
  });

  it("[B2-10] 미충족 사유가 막힌 갈래를 밝힌다 — 3분의 2 이하", () => {
    const r = calcRelatedCorpGift(inp("large", split(150_000_000_000)));
    expect(r.exclusionReason).toBe(
      "특수관계법인거래비율이 정상거래비율의 3분의 2 이하 — 나목1)·2) 모두 미해당 (상증법 §45의3①1호나목)",
    );
  });

  it("[B2-11] 미충족 사유가 막힌 갈래를 밝힌다 — 3분의 2는 넘었으나 1천억 이하", () => {
    const r = calcRelatedCorpGift(inp("large", split(100_000_000_000, 400_000_000_000), 400_000_000_000));
    expect(r.exclusionReason).toContain("3분의 2를 초과하나");
    expect(r.exclusionReason).toContain("100,000,000,000원");
    expect(r.exclusionReason).toContain("1천억원 이하");
  });

  it("[B2-12] 중소·중견의 미충족 사유는 가목 문구를 유지한다", () => {
    const r = calcRelatedCorpGift(inp("small", split(350_000_000_000)));
    expect(r.exclusionReason).toBe(
      "특수관계법인거래비율이 정상거래비율 이하 — 과세요건 미충족 (상증법 §45의3①1호가목)",
    );
  });

  it("[B2-13] 중소의 가목 경로 라벨 — 나목이 아니다", () => {
    const r = calcRelatedCorpGift(inp("small", split(600_000_000_000)));
    expect(r.taxRequirementMet).toBe(true);
    expect(r.taxRequirementClause).toBe("상증법 §45의3①1호가목");
  });
});
