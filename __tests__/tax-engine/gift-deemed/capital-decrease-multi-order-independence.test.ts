import { describe, it, expect } from "vitest";
import { calcCapitalDecreaseMulti } from "@/lib/tax-engine/gift-deemed/capital-decrease-multi";
import type { CapitalDecreaseShareholder } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";

/**
 * §39의2 불균등감자 저가 30% 게이트 순서의존 제거 (리뷰 확정 #12 회귀).
 *
 * 저가 게이트 차액을 relatedDonors[0]로 산정 → 감자주주 배열 순서에 따라 taxable ↔ 0 뒤바뀜.
 * 정정: 특수관계 증여자 중 최저 소각가(최대 차액) 기준 → 순서 무관 결정적.
 */
function sh(
  name: string,
  preShares: number,
  redeemedShares: number,
  redemptionPricePerShare: number | undefined,
): CapitalDecreaseShareholder {
  return { id: name, name, preShares, redeemedShares, redemptionPricePerShare, relationGroup: "A" };
}

describe("§39의2 불균등감자 저가 게이트 순서 무관 (리뷰 #12)", () => {
  // 평가액 30000, 30% 기준 9000. 감자주주 을 22000(차액 8000<9000)·병 20000(차액 10000≥9000).
  // 잔존주주 갑(수증자, 대주주·특수관계). 최저가 20000 기준 → 차액 10000 ≥ 9000 → 과세.
  const 갑 = sh("갑", 100, 0, undefined);
  const 을 = sh("을", 100, 100, 22_000);
  const 병 = sh("병", 100, 100, 20_000);

  const make = (order: CapitalDecreaseShareholder[]) => ({
    sharePrice: 30_000,
    preTotalShares: 300,
    shareholders: order,
  });

  it("[CD-ORDER] 감자주주 순서 무관 동일 결과 — 을·병 순서 뒤집어도 1,800,000", () => {
    const r1 = calcCapitalDecreaseMulti(make([갑, 을, 병]));
    const r2 = calcCapitalDecreaseMulti(make([갑, 병, 을]));
    expect(r1.deemedGiftValue).toBe(1_800_000);
    expect(r2.deemedGiftValue).toBe(1_800_000);
  });
});
