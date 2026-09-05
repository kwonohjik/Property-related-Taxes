/**
 * anchor: 함께양도 공통 양도비 = 양도가액 비례 안분 (2026-09-05 · 코드리뷰 Q08)
 *
 * ## 조문
 *
 * 「이 경우 **공통되는 취득가액과 양도비용은 해당 자산의 가액에 비례하여 안분계산한다**」
 *   — 「소득세법」 §100② 후단 (KoreanLaw 실독, 시행 2026-01-01)
 *
 * 「자산 수 안분」은 조문상 근거가 없다. 분모는 **가액**이다.
 *
 * ## 종전 결함 — 안분 엔진은 있었는데 호출자가 0건이었다
 *
 * `apportionBundledSale`의 `commonExpenses`(Step 5)가 정확히 이 규칙을 구현하고 단위테스트도
 * 있었는데, **프로덕션 호출자가 하나도 없었다**. 그래서 ④가 폼-수준 「총 양도비」를
 * **주 자산에 100%** 싣고 컴패니언에는 0을 보냈다 — `effectiveTransferExpenseFor`가
 * 지분 모드에서만 안분하기 때문이다. 화면은 카드마다 「자동 적용 {총액}」이라 표시했다.
 *
 * ⇒ ⑫`commonTransferExpense` 신설 → ⑬ 신고 단위 1회 전송 → ⑭ route가 `commonExpenses`로 주입.
 *
 * ## 🔑 이중 계상 금지
 *
 * 엔진 계약은 `allocatedExpenses = directExpenses + commonShare`다. 공통분을 자산에도 실으면
 * 두 번 빠진다 — 그래서 ④는 공통을 보낼 때 **어느 자산에도** 폼-수준 양도비를 싣지 않는다.
 */
import { describe, it, expect } from "vitest";
import { apportionBundledSale } from "../../lib/tax-engine/bundled-sale-apportionment";
import type { BundledAssetInput } from "../../lib/tax-engine/types/bundled-sale.types";

const asset = (
  id: string,
  fixedSalePrice: number,
  directExpenses = 0,
): BundledAssetInput => ({
  assetId: id,
  assetLabel: id,
  assetKind: "land",
  standardPriceAtTransfer: fixedSalePrice,
  fixedSalePrice,
  directExpenses,
});

describe("§100② 후단 — 공통 양도비는 가액 비례로 안분된다", () => {
  it("🔴 가액 7:3이면 공통 양도비도 7:3 (자산 수 5:5가 아니다)", () => {
    const r = apportionBundledSale({
      totalSalePrice: 1_000_000_000,
      commonExpenses: 10_000_000,
      assets: [asset("a", 700_000_000), asset("b", 300_000_000)],
    });
    const [a, b] = r.apportioned;
    expect(a.allocatedExpenses).toBe(7_000_000);
    expect(b.allocatedExpenses).toBe(3_000_000);
  });

  it("Σ 보존 — 마지막 자산이 절사 잔액을 흡수한다 (3등분 반례)", () => {
    const r = apportionBundledSale({
      totalSalePrice: 300_000_000,
      commonExpenses: 10_000_000,
      assets: [
        asset("a", 100_000_000),
        asset("b", 100_000_000),
        asset("c", 100_000_000),
      ],
    });
    const sum = r.apportioned.reduce((s, x) => s + x.allocatedExpenses, 0);
    expect(sum, "안분 합계가 총액과 달라지면 필요경비가 새거나 늘어난다").toBe(10_000_000);
  });

  it("🔑 직접 입력분은 **대체가 아니라 합산**이다 (이중 계상 방지의 반대편)", () => {
    // 엔진 계약: allocatedExpenses = directExpenses + commonShare.
    // ④가 공통을 보낼 때 자산에 폼-수준 값을 함께 실으면 여기서 두 번 더해진다.
    const r = apportionBundledSale({
      totalSalePrice: 1_000_000_000,
      commonExpenses: 10_000_000,
      assets: [
        asset("a", 700_000_000, 5_000_000),
        asset("b", 300_000_000, 0),
      ],
    });
    expect(r.apportioned[0].allocatedExpenses).toBe(5_000_000 + 7_000_000);
    expect(r.apportioned[1].allocatedExpenses).toBe(3_000_000);
  });

  it("대조군 — 공통 양도비가 없으면 직접 입력분만 남는다 (종전 동작)", () => {
    const r = apportionBundledSale({
      totalSalePrice: 1_000_000_000,
      assets: [
        asset("a", 700_000_000, 5_000_000),
        asset("b", 300_000_000, 2_000_000),
      ],
    });
    expect(r.apportioned[0].allocatedExpenses).toBe(5_000_000);
    expect(r.apportioned[1].allocatedExpenses).toBe(2_000_000);
  });

  it("기준시가 안분 모드에서도 **결정된 양도가액** 비율을 쓴다 (기준시가 비율이 아니다)", () => {
    // fixedSalePrice 없이 기준시가로 양도가액을 정하는 모드 — 안분 후 확정된 가액이 분자다.
    const r = apportionBundledSale({
      totalSalePrice: 1_000_000_000,
      commonExpenses: 10_000_000,
      assets: [
        { assetId: "a", assetLabel: "a", assetKind: "land", standardPriceAtTransfer: 600_000_000 },
        { assetId: "b", assetLabel: "b", assetKind: "land", standardPriceAtTransfer: 400_000_000 },
      ],
    });
    const [a, b] = r.apportioned;
    expect(a.allocatedSalePrice + b.allocatedSalePrice).toBe(1_000_000_000);
    expect(a.allocatedExpenses).toBe(
      Math.floor((10_000_000 * a.allocatedSalePrice) / 1_000_000_000),
    );
    expect(a.allocatedExpenses + b.allocatedExpenses).toBe(10_000_000);
  });
});
