import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapShareholder } from "@/lib/tax-engine/gift-deemed/types";

/**
 * §39 증자 저가발행 가·다·라목 특수관계 요건 (리뷰 확정 #4 회귀).
 *
 * §39①1호: 가목(실권주 재배정)·다목(제3자 직접배정)·라목(초과배정)은 특수관계 요건 없음.
 *           나목(실권주 미배정=실권처리)만 특수관계인 요구. (고가발행 2호는 가~라 전부 특수관계)
 * 버그: direction 무관하게 !isRelated → 0을 모든 쌍에 적용 → 저가 다·라목 비특수관계 이익 미과세.
 */
function sh(
  id: string,
  preShares: number,
  entitledShares: number,
  subscribedShares: number,
  reallocatedShares: number,
  relatedTo: string[],
): CapShareholder {
  return { id, name: id, preShares, entitledShares, subscribedShares, reallocatedShares, relatedTo };
}
function totals(r: ReturnType<typeof calcCapitalIncreaseAllocation>) {
  return new Map(r.perBeneficiary.map((b) => [b.beneficiaryId, b.total]));
}

describe("§39 저가발행 다·라목 특수관계 불요 (리뷰 #4)", () => {
  // 사례3(제3자직접배정+초과배정) 구조에서 을·병이 갑과 특수관계 없음.
  // 실권처리 없음(총실권 60,000 = 총재배정 60,000) → 나목 아님 → 관계 게이트 미적용.
  const r = calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 30_000,
    newSharePrice: 10_000,
    shareholders: [
      sh("갑", 60_000, 60_000, 0, 0, []), // 증여자, 특수관계 표시 없음
      sh("을", 30_000, 30_000, 50_000, 20_000, []), // 초과배정 20,000 (라목), 비특수관계
      sh("병", 0, 0, 40_000, 40_000, []), // 제3자 직접배정 40,000 (다목), 비특수관계
      sh("소액주주", 10_000, 10_000, 10_000, 0, []),
    ],
  });

  it("[CI-LOW-NR] 저가 다·라목 비특수관계도 과세 — 을 200,000,000 · 병 400,000,000", () => {
    expect(r.perShareAfter).toBe(20_000);
    expect(totals(r).get("을")).toBe(200_000_000);
    expect(totals(r).get("병")).toBe(400_000_000);
    // 관계 게이트 미적용 → 배제사유 없음
    expect(r.splits.find((s) => s.beneficiaryId === "을")?.excludedReason).toBeUndefined();
    expect(r.splits.find((s) => s.beneficiaryId === "병")?.excludedReason).toBeUndefined();
  });
});

describe("§39 저가발행 나목(실권처리) 특수관계 필요 — 회귀 방지 (리뷰 #4)", () => {
  // 사례2 구조: 실권처리 존재(총실권 30,000 > 총재배정 10,000) → 나목 → 소액주주 비특수관계 0 유지.
  const r = calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 30_000,
    newSharePrice: 10_000,
    shareholders: [
      sh("갑", 30_000, 30_000, 0, 0, ["을", "병"]),
      sh("을", 10_000, 10_000, 20_000, 10_000, ["갑"]),
      sh("병", 5_000, 5_000, 5_000, 0, ["갑"]),
      sh("소액주주", 5_000, 5_000, 5_000, 0, []),
    ],
  });
  it("[CI-LOW-B] 실권처리 나목에서 비특수관계 소액주주는 과세 0 유지", () => {
    expect(totals(r).get("소액주주")).toBe(0);
    expect(totals(r).get("을")).toBe(175_000_000);
    expect(totals(r).get("병")).toBe(25_000_000);
  });
});
