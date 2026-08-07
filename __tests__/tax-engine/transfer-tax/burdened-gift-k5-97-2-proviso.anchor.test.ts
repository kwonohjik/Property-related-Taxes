/**
 * anchor: 부담부증여 **K-5(환산취득가액)** — §97②2호 **단서** 가목·나목 택일 (W-6, 2026-08-07)
 *
 * ── 조문 ────────────────────────────────────────────────────────────────
 * 「소득세법」 제97조 제2항 제2호 **단서**:
 *   「다만, **제1항제1호나목에 따라 취득가액을 환산취득가액으로 하는 경우**로서
 *    **가목의 금액이 나목의 금액보다 적은 경우**에는 나목의 금액을 필요경비로 할 수 있다.」
 *
 *   · **가목** = 환산취득가액 + 개산공제  (= 필요경비 **전체**)
 *   · **나목** = 자본적지출 + 양도비
 *
 * ── 왜 K-5가 「제1항제1호나목」인가 (위임 체인) ───────────────────────────
 * 「소득세법 시행령」 **제163조 제12항**: 「법 **제97조제1항제1호나목**에서 "…환산취득가액"이란
 * **제176조의2제2항부터 제4항까지**의 규정에 따른 가액을 말한다」.
 * ⇒ K-5가 쓰는 §176의2②2호 산식은 §114⑦(추계결정·경정)과 **공유**하는 것이고,
 *   납세자가 증여자의 실지취득가액을 확인할 수 없어 환산을 택하는 K-5는 **1호나목** 계열이다.
 *
 * ── 계약 ────────────────────────────────────────────────────────────────
 * ⚠️ 나목 채택 시 **취득가액 슬롯이 0**이 된다 — 가목이 「환산취득가액 **과** 개산공제의
 *    **합계액**」이라 둘은 필요경비 **전체**를 놓고 겨루기 때문이다. 취득가액을 남기면
 *    **이중차감**이다(메모리 `feedback_97_2_swap_necessary_expense_max_not_sum`).
 * ⚠️ 동률(==)은 **본문**이다 — 단서가 「적은 경우」로 명시한다.
 * ⚠️ K-1~K-3(기준시가)·K-4(실지취득가)는 **단서 대상이 아니다**.
 */
import { describe, it, expect } from "vitest";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

// ── 산술이 손으로 검산되도록 고른 값 ────────────────────────────────────
const LAND_STD_TRANSFER = 300_000_000;
const BLDG_STD_TRANSFER = 100_000_000;
const LAND_STD_ACQ = 60_000_000;   // 취득/양도 = 0.2
const BLDG_STD_ACQ = 20_000_000;   // 취득/양도 = 0.2
const MARKET_AT_TRANSFER = 400_000_000;
const DEBT = 200_000_000;          // 채무비율 = 200/400 = 0.5

/**
 * 가목 검산:
 *   자산별 양도가액  land = 200,000,000 × 300/400 = 150,000,000 · building = 50,000,000
 *   환산취득가액     land = 150,000,000 × 60/300  =  30,000,000 · building = 10,000,000  → 40,000,000
 *   개산공제(3%)     land = (60,000,000 × 0.5) × 3% = 900,000 · building = (20,000,000 × 0.5) × 3% = 300,000
 *   ⇒ 가목 = 40,000,000 + 1,200,000 = **41,200,000**
 */
const ANS_ESTIMATED_SIDE = 41_200_000;

/** 단서 발동: 자본적지출 1억 → 채무안분 1억 × 0.5 = 50,000,000 > 41,200,000 */
const CAPEX_FIRES = 100_000_000;
const ANS_DIRECT_SIDE_FIRES = 50_000_000;

/** 미발동: 자본적지출 5,000만 → 채무안분 25,000,000 < 41,200,000 */
const CAPEX_NO_FIRE = 50_000_000;

const infoK5: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_market",
  acquisitionMethod: "converted",
  marketValueAtTransfer: MARKET_AT_TRANSFER,
  lendingDepositTotal: 0,
  mortgageDebtAmount: DEBT,
  annualRentTotal: 0,
  landStdPriceAtTransfer: LAND_STD_TRANSFER,
  buildingStdPriceAtTransfer: BLDG_STD_TRANSFER,
  landStdPriceAtAcquisition: LAND_STD_ACQ,
  buildingStdPriceAtAcquisition: BLDG_STD_ACQ,
  donorRelation: "lineal_descendant",
};

function build(info: BurdenedGiftInfo, expenses?: { capitalExpenditure?: number; transferExpense?: number }) {
  return buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: LAND_STD_TRANSFER,
    buildingStdPriceAtTransfer: BLDG_STD_TRANSFER,
    landStdPriceAtAcquisition: LAND_STD_ACQ,
    buildingStdPriceAtAcquisition: BLDG_STD_ACQ,
    info,
    ...expenses,
  });
}

describe("가목 검산 — 단서 비교의 좌변", () => {
  it("환산취득가액 40,000,000 + 개산공제 1,200,000 = 41,200,000", () => {
    const b = build(infoK5, { capitalExpenditure: CAPEX_NO_FIRE });
    expect(b.acquisitionMethodUsed).toBe("converted");
    expect(b.necessaryExpenseSwap?.estimatedSide).toBe(ANS_ESTIMATED_SIDE);
    expect(b.perAsset.land.acquisitionPrice + b.perAsset.building.acquisitionPrice).toBe(40_000_000);
    expect(b.perAsset.land.estimatedDeduction + b.perAsset.building.estimatedDeduction).toBe(1_200_000);
  });
});

describe("W-6 — 단서 발동 (가목 < 나목)", () => {
  const fired = build(infoK5, { capitalExpenditure: CAPEX_FIRES });

  it("🔴 나목을 택한다", () => {
    expect(fired.necessaryExpenseSwap).toEqual({
      estimatedSide: ANS_ESTIMATED_SIDE,
      directSide: ANS_DIRECT_SIDE_FIRES,
      chosen: "direct",
    });
  });

  it("🔴 취득가액 슬롯이 0이 된다 — 나목이 필요경비 **전체**라 이중차감 금지", () => {
    expect(fired.perAsset.land.acquisitionPrice).toBe(0);
    expect(fired.perAsset.building.acquisitionPrice).toBe(0);
  });

  it("🔴 필요경비 = 나목 총액 (개산공제 아님)", () => {
    expect(
      fired.perAsset.land.estimatedDeduction + fired.perAsset.building.estimatedDeduction,
    ).toBe(ANS_DIRECT_SIDE_FIRES);
  });

  it("🔑 환산취득가액은 **보존**된다 — §114조의2 가산세 base가 읽는다", () => {
    expect(fired.convertedAcquisitionBeforeSwap).toEqual({ land: 30_000_000, building: 10_000_000 });
  });

  it("양도가액은 단서와 무관하게 불변 (§159①2호)", () => {
    const base = build(infoK5, { capitalExpenditure: CAPEX_NO_FIRE });
    expect(fired.perAsset.land.transferPrice).toBe(base.perAsset.land.transferPrice);
    expect(fired.perAsset.building.transferPrice).toBe(base.perAsset.building.transferPrice);
  });
});

describe("W-6 — 미발동 (가목 ≥ 나목)", () => {
  it("본문 유지 — 취득가액·개산공제 그대로", () => {
    const b = build(infoK5, { capitalExpenditure: CAPEX_NO_FIRE });
    expect(b.necessaryExpenseSwap?.chosen).toBe("estimated");
    expect(b.perAsset.land.acquisitionPrice).toBe(30_000_000);
    expect(b.perAsset.land.estimatedDeduction + b.perAsset.building.estimatedDeduction).toBe(1_200_000);
    expect(b.convertedAcquisitionBeforeSwap).toBeUndefined();
  });

  it("🔴 **동률은 본문**이다 — 단서는 「적은 경우」로 명시한다", () => {
    // 나목이 가목과 같아지는 자본적지출 = 41,200,000 ÷ 0.5 = 82,400,000
    const b = build(infoK5, { capitalExpenditure: 82_400_000 });
    expect(b.necessaryExpenseSwap?.directSide).toBe(ANS_ESTIMATED_SIDE);
    expect(b.necessaryExpenseSwap?.chosen).toBe("estimated");
    expect(b.perAsset.land.acquisitionPrice).toBe(30_000_000);
  });

  it("실비 미입력이면 비교 자체를 하지 않는다 — 본문(개산공제)이 정본", () => {
    const b = build(infoK5);
    expect(b.necessaryExpenseSwap).toBeUndefined();
    expect(b.perAsset.land.estimatedDeduction + b.perAsset.building.estimatedDeduction).toBe(1_200_000);
  });
});

/**
 * 단서는 **환산취득가액으로 하는 경우**에 한정된다. 다른 평가모드에 번지면
 * 개산공제 정본(§97②2호 본문)이나 실비 가산(§97②1호)을 침범한다.
 */
describe("W-6 — 단서는 K-5 전용", () => {
  it("K-1~K-3(기준시가) — 아무리 큰 자본적지출도 단서를 깨우지 않는다", () => {
    const b = build(
      { ...infoK5, valuationMode: "sangjeungbeop_standard", acquisitionMethod: undefined },
      { capitalExpenditure: 10_000_000_000 },
    );
    expect(b.acquisitionMethodUsed).toBe("standard_price");
    expect(b.necessaryExpenseSwap).toBeUndefined();
    expect(b.perAsset.land.acquisitionPrice).toBeGreaterThan(0);
  });

  it("K-4(실지취득가) — §97②**1호** 가산이라 단서 대상 아님", () => {
    const b = build(
      {
        ...infoK5,
        acquisitionMethod: "actual",
        actualLandAcquisitionPrice: 40_000_000,
        actualBuildingAcquisitionPrice: 10_000_000,
      },
      { capitalExpenditure: 10_000_000_000 },
    );
    expect(b.acquisitionMethodUsed).toBe("actual");
    expect(b.necessaryExpenseSwap).toBeUndefined();
    expect(b.perAsset.land.acquisitionPrice).toBeGreaterThan(0);
  });
});
