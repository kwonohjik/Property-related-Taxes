/**
 * §45의3 행위시법 — 증여시기(§45의3③ 「수혜법인의 사업연도 종료일」)별 적용 법령 (W12 · ERA-4).
 *
 * 종전에는 비율 상수 4종이 **현행 고정**이었다. 2017-12-31 이전 사업연도에는 법 §45의3①이
 * 「세후영업이익 × 정상거래비율의 1/2(중소·중견은 정상거래비율)을 초과하는 거래비율 ×
 * 한계보유비율을 초과하는 주식보유비율」이라는 **단일 계산식**이었고, 중견기업의 정상거래비율도
 * 중소와 같은 100분의 50이었다(구 영 §34의2⑤). 현행 3분기 산식으로 계산하면:
 *   · 일반기업 70,000,000 → 실제 42,500,000 (**27,500,000원 과대**)
 *   · 중견기업 37,500,000 → 실제 0 (**과세요건조차 미충족인 건에 세금이 생긴다**)
 * 둘 다 납세자 **불리** 방향이다.
 *
 * ⚠️ 구법을 「구현」하지 않고 「차단」하는 이유는 `related-corp-era.ts` 헤더에 적었다 —
 *    구법 구간을 제대로 계산하려면 그 시점의 영 §34의2 전부가 필요한데 그 축들의 시점이
 *    미확인이고, 하나만 구현하면 나머지가 현행으로 섞여 여전히 틀린다.
 */
import { describe, it, expect } from "vitest";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import {
  resolveRcEraExclusion,
  resolveRcEraNotice,
  RC_TIERED_FORMULA_FROM,
} from "@/lib/tax-engine/gift-deemed/related-corp-era";
import type { RelatedCorpInput } from "@/lib/tax-engine/gift-deemed/types";

const R = (pct: number) => ({ numer: Math.round(pct * 100), denom: 10_000 });

/** ERA-4가 실측한 중견기업 사례 — 거래비율 45%. 현행 40% 기준이면 과세, 구법 50% 기준이면 비과세. */
const MEDIUM_45: RelatedCorpInput = {
  enterpriseSize: "medium",
  totalSales: 100_000_000_000,
  preTaxAdjOperatingIncome: 1_000_000_000,
  taxableIncome: 1_000_000_000,
  corporateTaxNet: 0,
  shareholders: [
    { id: "gap", name: "갑", relation: "self", directRatio: R(20), isCorporate: false },
    { id: "x", name: "기타", relation: "other", directRatio: R(80), isCorporate: false },
  ],
  intermediaryCorps: [],
  salesPartners: [
    { id: "D", name: "D", salesAmount: 45_000_000_000, isRelated: true },
    { id: "E", name: "기타", salesAmount: 55_000_000_000, isRelated: false },
  ],
};

describe("경계 — 지정값 ±1 동등성", () => {
  it("[ERA-0] 2017-12-31은 구법 구간이라 차단된다", () => {
    expect(resolveRcEraExclusion("2017-12-31")).toContain("법률 제15224호");
  });

  it("[ERA-1] 2018-01-01(시행일 당일)은 차단되지 않는다", () => {
    expect(resolveRcEraExclusion(RC_TIERED_FORMULA_FROM)).toBeUndefined();
  });

  it("[ERA-2] 날짜 미전달은 현행으로 본다 — 무회귀 안전판", () => {
    expect(resolveRcEraExclusion(undefined)).toBeUndefined();
    expect(resolveRcEraExclusion("")).toBeUndefined();
  });
});

describe("차단이 세액에 도달한다", () => {
  it("[ERA-3] 중견 45% — 2016 사업연도는 세금을 만들지 않는다 (종전 37,500,000원 전액 과대)", () => {
    const now = calcRelatedCorpGift({ ...MEDIUM_45, fiscalYearEndDate: "2025-12-31" });
    expect(now.applied).toBe(true);
    expect(now.deemedGiftValue).toBe(37_500_000); // 현행 정상거래비율 40% 기준

    const old = calcRelatedCorpGift({ ...MEDIUM_45, fiscalYearEndDate: "2016-12-31" });
    expect(old.applied).toBe(false);
    expect(old.deemedGiftValue).toBe(0);
    expect(old.eraBlocked).toBe(true);
    expect(old.appliedLawDate).toBe("2016-12-31");
  });

  it("[ERA-4] 차단 사유가 조문·시행일·구법 산식을 모두 밝힌다", () => {
    const r = calcRelatedCorpGift({ ...MEDIUM_45, fiscalYearEndDate: "2016-12-31" });
    expect(r.exclusionReason).toContain("2016-12-31");
    expect(r.exclusionReason).toContain("법률 제15224호");
    expect(r.exclusionReason).toContain("정상거래비율의 1/2");
    expect(r.exclusionReason).toContain("2018-01-01");
  });

  it("[ERA-5] 차단은 「과세요건 미충족」과 구별된다 — 상세표를 그리지 않게 한다", () => {
    // 요건 미충족(거래비율 미달)은 eraBlocked가 아니다 — 두 축을 섞으면 화면이 거짓말한다.
    const belowRatio = calcRelatedCorpGift({
      ...MEDIUM_45,
      fiscalYearEndDate: "2025-12-31",
      salesPartners: [
        { id: "D", name: "D", salesAmount: 10_000_000_000, isRelated: true },
        { id: "E", name: "기타", salesAmount: 90_000_000_000, isRelated: false },
      ],
    });
    expect(belowRatio.applied).toBe(false);
    expect(belowRatio.eraBlocked).toBeUndefined();
    expect(belowRatio.taxRequirementMet).toBe(false);
  });
});

describe("부칙 적용례 미확인 구간은 «고지»한다 (추정으로 차단 범위를 넓히지 않는다)", () => {
  it("[ERA-6] 2018년에 종료하는 사업연도에만 고지가 붙는다", () => {
    expect(resolveRcEraNotice("2018-06-30")).toContain("부칙");
    expect(resolveRcEraNotice("2018-12-31")).toContain("부칙");
  });

  it("[ERA-7] 2019년 이후 종료 사업연도는 어떤 적용례 형태로도 개정법이라 고지가 없다", () => {
    expect(resolveRcEraNotice("2019-01-01")).toBeUndefined();
    expect(resolveRcEraNotice("2025-12-31")).toBeUndefined();
  });

  it("[ERA-8] 구법 구간은 고지가 아니라 차단이다 (두 경로가 겹치지 않는다)", () => {
    expect(resolveRcEraNotice("2017-12-31")).toBeUndefined();
    expect(resolveRcEraExclusion("2017-12-31")).toBeDefined();
  });

  it("[ERA-9] 고지는 계산을 막지 않고 결과에 실린다", () => {
    const r = calcRelatedCorpGift({ ...MEDIUM_45, fiscalYearEndDate: "2018-06-30" });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(37_500_000);
    expect(r.eraNotice).toContain("2018-06-30");
  });

  it("[ERA-10] 통상 사안(2025)에는 고지가 뜨지 않는다 — 상시 고지는 노이즈가 된다", () => {
    expect(calcRelatedCorpGift({ ...MEDIUM_45, fiscalYearEndDate: "2025-12-31" }).eraNotice).toBeUndefined();
  });
});
