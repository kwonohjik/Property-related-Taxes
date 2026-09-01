/**
 * §165⑤ 간이 «순액 입력» 파생 계산 anchor.
 *
 * 계획서: docs/00-pm/post-listing-simple-amount-input.plan.md §3·§7-2
 *
 * 🔑 이 모듈의 존재 이유는 **완전재현 모드와 같은 값이 나오는 것**이다.
 *    별도 산식을 세우면 floor 시점이 갈려 1원 단위로 달라진다 — AD-5가 그것을 고정한다.
 */

import { describe, it, expect } from "vitest";
import {
  derivePerShareFromAmounts,
  SIMPLE_DISCOUNT_RATE,
} from "@/lib/calc/post-listing-amount-derive";
import {
  calcNetIncomePerShare,
  calcNetAssetPerShare,
} from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";

describe("AD — 순액 입력에서 1주당 가치 파생", () => {
  it("AD-1 계획서 예시 — 순손익액 5억 / 주식수 1만 → 1주당 순손익가치 500,000", () => {
    const d = derivePerShareFromAmounts({
      netIncomeAmount: 500_000_000,
      shareCount: 10_000,
      netAssetAmount: 48_000_000,
      goodwill: 2_000_000,
    });
    expect(d.perShareIncomeBeforeRate).toBe(50_000); // 500,000,000 ÷ 10,000
    expect(d.netIncomePerShare).toBe(500_000); // 50,000 ÷ 10%
  });

  it("AD-2 영업권은 순자산가액에 «가산»된다 — (48,000,000 + 2,000,000) ÷ 10,000 = 5,000", () => {
    const d = derivePerShareFromAmounts({
      netIncomeAmount: 500_000_000,
      shareCount: 10_000,
      netAssetAmount: 48_000_000,
      goodwill: 2_000_000,
    });
    expect(d.netAssetTotal).toBe(50_000_000);
    expect(d.netAssetPerShare).toBe(5_000);
  });

  it("AD-3 영업권 빈칸(0)이면 가산 없이 48,000,000 ÷ 10,000 = 4,800", () => {
    const d = derivePerShareFromAmounts({
      netIncomeAmount: 500_000_000,
      shareCount: 10_000,
      netAssetAmount: 48_000_000,
      goodwill: 0,
    });
    expect(d.netAssetTotal).toBe(48_000_000);
    expect(d.netAssetPerShare).toBe(4_800);
  });

  it("AD-4 주식수 0 — 파생값은 0이다 (호출부가 mirror하지 않고 빈칸으로 둔다)", () => {
    const d = derivePerShareFromAmounts({
      netIncomeAmount: 500_000_000,
      shareCount: 0,
      netAssetAmount: 48_000_000,
      goodwill: 0,
    });
    expect(d.netIncomePerShare).toBe(0);
    expect(d.netAssetPerShare).toBe(0);
  });

  it("AD-5 🔑 완전재현 모드 헬퍼와 «같은 값»이다 — floor 시점이 갈리지 않는다", () => {
    // 나누어떨어지지 않는 값으로 floor 경로를 실제로 태운다.
    const netIncomeAmount = 333_333_333;
    const shareCount = 7_777;
    const netAssetAmount = 123_456_789;
    const goodwill = 1_111_111;

    const mine = derivePerShareFromAmounts({ netIncomeAmount, shareCount, netAssetAmount, goodwill });

    const engineNI = calcNetIncomePerShare({
      addA: [netIncomeAmount], subB: [], shareCount, discountRate: SIMPLE_DISCOUNT_RATE,
    });
    const engineNA = calcNetAssetPerShare({
      assetTotalRow1: netAssetAmount, assetAdd: [], assetSub: [],
      liabTotalRow8: 0, liabAdd: [], liabSub: [], goodwillRow19: goodwill, shareCount,
    });

    expect(mine.netIncomePerShare).toBe(engineNI.perShareValue);
    expect(mine.netAssetPerShare).toBe(engineNA.perShareAsset);
    // 중간 floor도 같은지 — 「÷주식수 후 floor, 그 다음 ÷환원율 후 floor」 순서 고정
    expect(mine.perShareIncomeBeforeRate).toBe(Math.floor(netIncomeAmount / shareCount));
    expect(mine.netIncomePerShare).toBe(
      Math.floor(Math.floor(netIncomeAmount / shareCount) / SIMPLE_DISCOUNT_RATE),
    );
  });

  it("AD-6 환원율은 10% 고정이다 (소칙 §81② → 상증칙 §17)", () => {
    expect(SIMPLE_DISCOUNT_RATE).toBe(0.10);
  });

  it("AD-7 순손익액이 음수(결손)여도 산식은 그대로 흐른다 — 임의 0 치환 금지", () => {
    const d = derivePerShareFromAmounts({
      netIncomeAmount: -100_000_000,
      shareCount: 10_000,
      netAssetAmount: 48_000_000,
      goodwill: 0,
    });
    expect(d.perShareIncomeBeforeRate).toBe(Math.floor(-100_000_000 / 10_000));
    expect(d.netIncomePerShare).toBeLessThan(0);
    // 순자산은 영향 없다
    expect(d.netAssetPerShare).toBe(4_800);
  });
});
