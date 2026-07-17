/**
 * Anchor — H-15 추정상속재산 §11⑤ 유가증권 종류 분류 (상증령 §11⑤1호)
 *
 * §11⑤: 재산종류별 = 1호 현금·예금·유가증권 / 2호 부동산 / 4호 기타재산. 종류별로 임계(2억/5억)와
 *   20% 기준차감(2억 한도)이 독립 적용된다. 유가증권은 1호(예금과 단일 종류)이므로 예금과 합산해야
 *   하나의 임계·하나의 20% 차감(2억 한도)만 적용된다.
 *
 * 종전: 유가증권을 other_asset(4호)로 안내 → 예금(deposit)과 별도 임계·별도 20% 차감(2억×2 = 4억까지)
 *   → 이중 차감으로 과소과세. 라벨 재분류로 유가증권을 deposit(1호)에 귀속.
 */
import { describe, it, expect } from "vitest";
import {
  evaluatePresumedInheritance,
  evaluatePresumedItem,
} from "@/lib/tax-engine/presumed-inheritance";
import type { PresumedInheritanceItem } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("H-15 §11⑤ 카테고리 라벨 재분류", () => {
  it("deposit 라벨 = 현금·예금·유가증권 (1호), other_asset은 유가증권 제외", () => {
    // 라벨은 breakdown label prefix로 노출 — 유가증권이 deposit(1호) 종류임을 anchor
    const dep = evaluatePresumedItem({
      id: "d",
      category: "deposit",
      amountWithin1Y: 0,
      amountWithin2Y: 600_000_000,
      verifiedUseAmount: 0,
    });
    expect(dep.breakdown[0].label).toContain("현금·예금·유가증권");
    const other = evaluatePresumedItem({
      id: "o",
      category: "other_asset",
      amountWithin1Y: 0,
      amountWithin2Y: 600_000_000,
      verifiedUseAmount: 0,
    });
    expect(other.breakdown[0].label).toContain("그 밖의 기타재산");
    expect(other.breakdown[0].label).not.toContain("유가증권");
  });
});

describe("H-15 §11⑤1호 — 유가증권+예금 단일 종류 결합 (이중 20% 차감 방지)", () => {
  // 예금 7억 + 유가증권 5억 = 1호 단일 종류 12억 (2년, 미소명 전액)
  it("[정답] 1호 결합: 임계 1회·20% 차감 2억 한도 1회 → 가산 10억", () => {
    const combined: PresumedInheritanceItem = {
      id: "c",
      category: "deposit",
      amountWithin1Y: 0,
      amountWithin2Y: 1_200_000_000,
      verifiedUseAmount: 0,
    };
    const { total } = evaluatePresumedInheritance([combined]);
    // scrutiny 12억, baseDeduction min(12억×20%=2.4억, 2억)=2억, 가산 12억−2억 = 10억
    expect(total).toBe(1_000_000_000);
  });

  it("[버그 대비] 유가증권을 4호로 분리하면 20% 차감이 2회(2.4억) → 40M 과소", () => {
    // 종전 오분류: 예금 7억(deposit) + 유가증권 5억(other_asset) 별도 종류
    const split: PresumedInheritanceItem[] = [
      { id: "dep", category: "deposit", amountWithin1Y: 0, amountWithin2Y: 700_000_000, verifiedUseAmount: 0 },
      { id: "sec", category: "other_asset", amountWithin1Y: 0, amountWithin2Y: 500_000_000, verifiedUseAmount: 0 },
    ];
    const { total } = evaluatePresumedInheritance(split);
    // deposit: 7억−min(1.4억,2억)=5.6억 · other: 5억−min(1억,2억)=4억 → 합 9.6억 (결합보다 40M 적음)
    expect(total).toBe(960_000_000);
    // 결합(정답 10억) − 분리(9.6억) = 40M 과소과세 (이중 20% 차감)
  });
});
