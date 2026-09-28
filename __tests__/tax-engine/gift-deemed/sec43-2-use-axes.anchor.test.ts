/**
 * §43² 1년 합산 — 사용이익 2축(§37·§42 무상) 엔진 anchor. 설계 `docs/00-pm/gift43-2-use-axes.plan.md`.
 * 정책 (a): 금액기준 판정에만 합산, 과세액은 당해 건. 픽스처는 당해 이익이 기준 **바로 아래**(실측).
 */
import { describe, it, expect } from "vitest";
import { calcFreeRealEstateGift } from "@/lib/tax-engine/gift-deemed/free-realestate-use";
import { calcPropertyServiceUseGift } from "@/lib/tax-engine/gift-deemed/property-service-use";
import type { DeemedGiftResult, FreeRealEstateInput, PropertyServiceUseInput } from "@/lib/tax-engine/gift-deemed/types";

const GIFT_DATE = new Date("2026-03-02");
const IN = (gain: number) => [{ date: "2025-09-01", gain }];
const OUT = (gain: number) => [{ date: "2025-03-01", gain }]; // 윈도 시작 2025-03-02 하루 전
const AGG = "§43② 1년 합산 금액기준";
const hasAgg = (r: DeemedGiftResult) => r.breakdown.some((s) => s.label === AGG);

const USE: FreeRealEstateInput = { subType: "free_use", propertyValue: 1_200_000_000, isRelatedParty: true }; // 90,978,879 · 1억
const COL: FreeRealEstateInput = { subType: "collateral", loanAmount: 200_000_000, actualInterestPaid: 0, isRelatedParty: true }; // 9,200,000 · 1천만
const MULTI: FreeRealEstateInput = {
  subType: "free_use", isRelatedParty: true,
  periods: [{ startDate: "2026-03-02", propertyValue: 1_200_000_000 }, { startDate: "2031-03-03", propertyValue: 3_000_000_000 }],
};
const PSU_FREE: PropertyServiceUseInput = { subType: "free_use", marketValue: 8_000_000 }; // 8백만 · 1천만
const PSU_LOW: PropertyServiceUseInput = { subType: "low_price", marketValue: 100_000_000, consideration: 80_000_000 }; // 2천만 · 3천만

describe("§37 — 영 §27④⑥ · §32의4 2호·2의2호", () => {
  it("[AU-1] 무상사용 90,978,879 + 선행 1천만 → 1억 이상 → 당해 90,978,879 과세", () => {
    const r = calcFreeRealEstateGift({ ...USE, giftDate: GIFT_DATE, priorSameClauseGains: IN(10_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(90_978_879);
    expect(hasAgg(r)).toBe(true);
  });
  it("[AU-1+] 윈도 밖·합계 미달이면 미적용 · 선행 없으면 합산 행 없음", () => {
    expect(calcFreeRealEstateGift({ ...USE, giftDate: GIFT_DATE, priorSameClauseGains: OUT(10_000_000) }).applied).toBe(false);
    expect(calcFreeRealEstateGift({ ...USE, giftDate: GIFT_DATE, priorSameClauseGains: IN(9_000_000) }).applied).toBe(false);
    expect(hasAgg(calcFreeRealEstateGift(USE))).toBe(false);
  });
  it("[AU-2] 무상담보 9,200,000 + 선행 80만 → 1천만 → 당해 9,200,000 과세", () => {
    const r = calcFreeRealEstateGift({ ...COL, giftDate: GIFT_DATE, priorSameClauseGains: IN(800_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(9_200_000);
  });
  it("[AU-3] 다기간: 선행 이익은 첫 기간(당해 증여) 판정에만 — 첫 기간 90,978,879 과세", () => {
    const r = calcFreeRealEstateGift({ ...MULTI, giftDate: GIFT_DATE, priorSameClauseGains: IN(10_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(90_978_879);
  });
  it("[AU-3+] 다기간: 선행 없으면 첫 기간 미달 0", () => {
    expect(calcFreeRealEstateGift(MULTI).deemedGiftValue).toBe(0);
  });
});

describe("§42 — 영 §32②1호 · §32의4 10호", () => {
  it("[AU-4] 무상 8백만 + 선행 3백만 → 1천만 → 당해 8,000,000 과세", () => {
    const r = calcPropertyServiceUseGift({ ...PSU_FREE, giftDate: GIFT_DATE, priorSameClauseGains: IN(3_000_000) });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(8_000_000);
    expect(hasAgg(r)).toBe(true);
  });
  it("[AU-4+] 윈도 밖이면 미적용", () => {
    expect(calcPropertyServiceUseGift({ ...PSU_FREE, giftDate: GIFT_DATE, priorSameClauseGains: OUT(3_000_000) }).applied).toBe(false);
  });
  it("[AU-5] 저가(시가 30% 상당액)는 합산하지 않는다 — 결과 불변 · 합산 행 없음 (정책 (a))", () => {
    const r = calcPropertyServiceUseGift({ ...PSU_LOW, giftDate: GIFT_DATE, priorSameClauseGains: IN(50_000_000) });
    expect(r.applied).toBe(false);
    expect(hasAgg(r)).toBe(false);
  });
});
