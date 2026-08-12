/**
 * anchor: 증축 케이스 **양도가액 안분 표** — 건물2 기준시가·분모·비율
 *
 * ## 🔴 결함 (2026-08-12 사용자 지적)
 *
 * `buildApportionment`는 카드를 `propertyType === "land"` **2분류**로만 봤다.
 * 그래서 건물1·건물2가 같은 슬롯에 떨어져:
 *
 *   · 증축건물(3002) 행의 기준시가가 **건물(3001)과 같은 값**으로 표시
 *   · 호출부 `totalStd = 토지 + 건물1`이라 **분모에서 건물2 누락**
 *   · 결과: 비율 합 **102.29%** (실측 97.71 + 2.29 + 2.29)
 *
 * ⚠️ **세액에는 영향이 없다** — `allocatedSalePrice`는 엔진 카드(`card.transferPrice`)를
 *    그대로 싣고 그 값은 §166⑥ 3-way로 이미 정확하다(실측 3열 합 = 양도가액 총액).
 *    표시 전용 결함이라 anchor도 표시 필드만 본다.
 */
import { describe, it, expect } from "vitest";
import { buildApportionment } from "@/app/api/calc/transfer/general-building-route-cards";
import type { AssetCardForAggregate } from "@/lib/tax-engine/general-building-valuation";

// 사용자 실측 수치
const LAND_STD = 356_934_000;
const B1_STD = 8_373_000;
const B2_STD = 48_306_440;
const TOTAL_STD = LAND_STD + B1_STD + B2_STD; // 413,613,440

const card = (propertyId: string, propertyType: string, transferPrice: number) =>
  ({
    propertyId,
    propertyLabel: propertyId,
    propertyType,
    transferPrice,
    acquisitionPrice: 0,
    expenses: 0,
  }) as unknown as AssetCardForAggregate;

const cards = [
  card("land", "land", 284_778_512),
  card("building1", "building", 6_680_368),
  card("building2", "building", 38_541_120),
];

function build() {
  return buildApportionment(
    cards,
    TOTAL_STD,
    0,
    LAND_STD,
    null,
    B1_STD,
    null,
    true,
    "소득세법 시행령 §166⑥",
    undefined,
    B2_STD,
    0,
  );
}

describe("증축 안분 표 — 건물2가 자기 기준시가를 쓴다", () => {
  it("🔴 건물2 기준시가 ≠ 건물1 기준시가", () => {
    const ap = build();
    const b1 = ap.apportioned.find((a) => a.assetId === "building1")!;
    const b2 = ap.apportioned.find((a) => a.assetId === "building2")!;
    expect(b2.standardPriceAtTransfer).toBe(B2_STD);
    expect(b2.standardPriceAtTransfer).not.toBe(b1.standardPriceAtTransfer);
  });

  it("토지·건물1은 종전 그대로 (대조군)", () => {
    const ap = build();
    expect(ap.apportioned.find((a) => a.assetId === "land")!.standardPriceAtTransfer).toBe(LAND_STD);
    expect(ap.apportioned.find((a) => a.assetId === "building1")!.standardPriceAtTransfer).toBe(B1_STD);
  });

  it("🔴 비율 합 = 100% (종전 102.29%)", () => {
    const ap = build();
    const sum = ap.apportioned.reduce((s, a) => s + a.displayRatio, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("기준시가 합 = 표시 분모 (표 내부 자기일관)", () => {
    const ap = build();
    const sum = ap.apportioned.reduce((s, a) => s + a.standardPriceAtTransfer, 0);
    expect(sum).toBe(ap.totalStandardAtTransfer);
  });

  it("안분 양도가액은 엔진 카드 값 그대로 (세액 무영향 — 회귀 가드)", () => {
    const ap = build();
    expect(ap.apportioned.map((a) => a.allocatedSalePrice)).toEqual([
      284_778_512, 6_680_368, 38_541_120,
    ]);
  });
});

describe("증축이 없으면 종전 동작 (범위 가드)", () => {
  it("extensionStd 미전달 시 건물 카드는 buildingStd를 쓴다", () => {
    const ap = buildApportionment(
      [card("land", "land", 100), card("building", "building", 50)],
      LAND_STD + B1_STD,
      0,
      LAND_STD,
      null,
      B1_STD,
      null,
      true,
      "§166⑥",
    );
    expect(ap.apportioned.find((a) => a.assetId === "building")!.standardPriceAtTransfer).toBe(B1_STD);
    expect(ap.apportioned.reduce((s, a) => s + a.displayRatio, 0)).toBeCloseTo(1, 10);
  });
});
