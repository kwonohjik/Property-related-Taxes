/**
 * anchor: 주식 이월과세 §97의2① — **lot(split) 경로** + **회귀 방어**
 * (계획서 §5.4 L-1~L-4 · §5.5 R-1~R-5)
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md
 *
 * ## lot — 판정 시점을 **매칭 후 sub-lot**으로 옮겨야 한다
 * `resolveLotStartDate(lot)`는 양도일을 모르므로 1년 요건(§97의2① 괄호)을 판정할 수 없다.
 * 세율 축에서는 무해했지만(주석 `lot-allocation.ts:44-63`), 필요경비 축에서는
 * 1년을 넘으면 **취득가액 승계 자체가 없어** 결과가 갈린다.
 *
 * ## 회귀 — 「적용되지 않는다」는 **부정 단언**이라 probe가 붙어야 한다
 * 대상이 다른 이유로 분기에 도달하지 못해도 통과하기 때문이다
 * (메모리 `feedback_negative_assertion_needs_mutation_probe` ★★★).
 *
 * ── 실행 상태 (Pre-Do 2026-08-11) ─────────────────────────────────────
 * L: 실패 3건(L-1·L-3·L-4) / 통과 1건(**L-2**) · R: 통과 4건 / 실패 1건(**R-3 probe** — 의도)
 *
 * ⚠️ **L-2는 구별력이 없다** — 「1년 초과라 미승계」인데 지금은 어차피 승계하지 않는다.
 *    양성 대조군은 **L-1·L-3**이다.
 * ⚠️ **R-3 probe는 실패해야 정상이다** — R-3의 부정 단언(「기타자산엔 적용 안 됨」)이
 *    분기 미도달 때문에 통과하는 것이 아님을 증명하는 장치이므로, 구현 후 통과로 바뀐다.
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { D, carryover, stock, acqLot, xferLot, SHARE_COUNT } from "./carryover-97-2-fixtures";

const GIFT_VALUATION_TOTAL = 80_000 * SHARE_COUNT;
const DONOR_BASIS_TOTAL = 30_000 * SHARE_COUNT;

// ============================================================
// L. lot(split) 모드
// ============================================================

describe("L. lot 경로 — 1년 요건은 **sub-lot 단위**로 갈린다", () => {
  it("L-1 purchase lot + carryover lot — 이월과세 lot만 승계된다", () => {
    const r = calculateStockTransferTax(
      stock({
        acquisitionLots: [
          acqLot({ shareCount: 5_000, perShareAcquisitionPrice: 60_000 }), // purchase
          acqLot({
            shareCount: 5_000,
            perShareAcquisitionPrice: 80_000,
            acquisitionCause: "carryover_gift",
            acquisitionDate: D("2025-06-01"),
            donorAcquisitionDate: D("2015-03-01"),
            donorAcquisitionPrice: 30_000,
            donorRelation: "spouse",
          }),
        ],
        transferLots: [xferLot({ shareCount: 10_000 })],
        costAllocationMethod: "fifo",
      }),
    );
    const m = r.lotMatchingDetail!.matched;
    expect(m).toHaveLength(2);
    // purchase lot은 그대로, carryover lot은 증여자 단가로 승계
    expect(m.map((x) => x.perShareBuyPrice).sort((a, b) => a - b)).toEqual([30_000, 60_000]);
  });

  it("L-2 증여 후 **1년 초과** 시점 매도 — 미승계(수증 단가 유지)", () => {
    const r = calculateStockTransferTax(
      stock({
        transferDate: D("2026-07-01"),
        acquisitionLots: [
          acqLot({
            shareCount: 10_000,
            perShareAcquisitionPrice: 80_000,
            acquisitionCause: "carryover_gift",
            acquisitionDate: D("2025-06-01"),
            donorAcquisitionDate: D("2015-03-01"),
            donorAcquisitionPrice: 30_000,
            donorRelation: "spouse",
          }),
        ],
        transferLots: [xferLot({ shareCount: 10_000, transferDate: D("2026-07-01") })],
        costAllocationMethod: "fifo",
      }),
    );
    expect(r.lotMatchingDetail!.matched[0].perShareBuyPrice).toBe(80_000);
  });

  /**
   * L-3 = P-4의 본질. **하나의 매수 lot이 두 매도에 걸치고 1년 경계를 사이에 둔다.**
   * lot 단위로는 답이 하나로 정해지지 않는다 — 매도 시점별로 갈려야 한다.
   */
  it("L-3 한 매수 lot이 1년 이내·초과 두 매도에 걸침 — sub-lot별로 갈린다", () => {
    const r = calculateStockTransferTax(
      stock({
        transferDate: D("2026-07-01"),
        acquisitionLots: [
          acqLot({
            shareCount: 10_000,
            perShareAcquisitionPrice: 80_000,
            acquisitionCause: "carryover_gift",
            acquisitionDate: D("2025-06-01"),
            donorAcquisitionDate: D("2015-03-01"),
            donorAcquisitionPrice: 30_000,
            donorRelation: "spouse",
          }),
        ],
        transferLots: [
          xferLot({ shareCount: 4_000, transferDate: D("2025-12-01") }), // 6개월 → 승계
          xferLot({ shareCount: 6_000, transferDate: D("2026-07-01") }), // 13개월 → 미승계
        ],
        costAllocationMethod: "fifo",
      }),
    );
    const m = r.lotMatchingDetail!.matched;
    expect(m).toHaveLength(2);
    const early = m.find((x) => x.saleShares === 4_000)!;
    const late = m.find((x) => x.saleShares === 6_000)!;
    expect(early.perShareBuyPrice).toBe(30_000); // 승계
    expect(late.perShareBuyPrice).toBe(80_000); // 미승계
  });

  /**
   * L-5 — **split 종목에도 ②3호가 걸린다.** 종목 축(`acquisitionCause`)이 아니라 lot에
   * 이월과세가 실려 있어도 비교과세를 건너뛰면 「배제됐는데 취득가액은 승계」가 된다(P-2와 같은 결함).
   *
   * 증여자 취득단가가 **높아** 승계하면 양도차손이 되므로 A < B ⇒ 배제 ⇒ lot도 되돌아간다.
   */
  it("L-5 승계가 세액을 낮추면 ②3호로 배제되고 **lot도 되돌아간다**", () => {
    const r = calculateStockTransferTax(
      stock({
        acquisitionLots: [
          acqLot({ shareCount: 5_000, perShareAcquisitionPrice: 60_000 }),
          acqLot({
            shareCount: 5_000,
            perShareAcquisitionPrice: 80_000,
            acquisitionCause: "carryover_gift",
            acquisitionDate: D("2025-06-01"),
            donorAcquisitionDate: D("2015-03-01"),
            donorAcquisitionPrice: 150_000, // 승계하면 취득가액이 커져 세액이 준다
            donorRelation: "spouse",
          }),
        ],
        transferLots: [xferLot({ shareCount: 10_000 })],
        costAllocationMethod: "fifo",
      }),
    );
    const m = r.lotMatchingDetail!.matched;
    // 승계되지 않았다 — 수증 당시 평가액 80,000 유지
    expect(m.map((x) => x.perShareBuyPrice).sort((a, b) => a - b)).toEqual([60_000, 80_000]);
  });

  it("L-4 moving_avg — 평균단가에 승계가 반영된다", () => {
    const r = calculateStockTransferTax(
      stock({
        acquisitionLots: [
          acqLot({ shareCount: 5_000, perShareAcquisitionPrice: 60_000 }),
          acqLot({
            shareCount: 5_000,
            perShareAcquisitionPrice: 80_000,
            acquisitionCause: "carryover_gift",
            acquisitionDate: D("2025-06-01"),
            donorAcquisitionDate: D("2015-03-01"),
            donorAcquisitionPrice: 30_000,
            donorRelation: "spouse",
          }),
        ],
        transferLots: [xferLot({ shareCount: 10_000 })],
        costAllocationMethod: "moving_avg",
      }),
    );
    // (60,000 × 5,000 + 30,000 × 5,000) / 10,000 = 45,000
    expect(r.lotMatchingDetail!.weightedAvgPerShare).toBe(45_000);
  });
});

// ============================================================
// R. 회귀 방어
// ============================================================

describe("R. 회귀 — 변경이 번지지 않았는가", () => {
  it("R-1 단순 증여(`gift`)는 취득가·세율 **전부 불변** (PR #1207 규약)", () => {
    const r = calculateStockTransferTax(
      carryover({
        acquisitionCause: "gift",
        // 값이 있어도 **선언이 아니므로** 쓰이지 않는다
        donorAcquisitionPrice: 30_000,
        donorAcquisitionDate: D("2015-03-01"),
      }),
    );
    expect(r.acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
    expect(r.isShortTermHolding).toBe(true); // 수증일 기산
    expect(r.appliedRate).toBe(0.3);
  });

  it("R-2 매매(`purchase`)는 전부 불변", () => {
    const r = calculateStockTransferTax(stock({ donorAcquisitionPrice: 30_000 } as never));
    expect(r.acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
    expect(r.appliedRate).toBe(0.3);
  });

  /**
   * R-3 기타자산은 §97의2 **대상이 아니다** — 영 §163의2①이 넣는 「§94①4호**나목**」은
   * 시설물이용권이고, 엔진의 기타자산은 4호 **다목·라목**이다(계획서 §1.2).
   */
  it("R-3 기타자산 + carryover_gift — 이월과세 **미적용**", () => {
    const r = calculateStockTransferTax(
      carryover({
        marketType: "other_asset",
        isHeavyRealEstateForRate: true,
        donorAcquisitionPrice: 30_000,
      }),
    );
    expect(r.acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
  });

  /**
   * **mutation probe** — 위 단언이 「기타자산 분기에 애초에 도달하지 못해서」 통과하는 것이
   * 아님을 증명한다. 같은 픽스처를 주식(kosdaq)으로 되돌리면 승계가 **반드시 일어나야** 한다.
   */
  it("R-3 probe — 같은 픽스처를 주식으로 되돌리면 승계가 일어난다", () => {
    const r = calculateStockTransferTax(carryover({ donorAcquisitionPrice: 30_000 }));
    expect(r.acquisitionPrice).toBe(DONOR_BASIS_TOTAL); // ← 미구현이라 실패해야 한다
  });

  it("R-3b 기타자산이 실제로 기타자산 카테고리로 분류됐는가 (도달 증명)", () => {
    const r = calculateStockTransferTax(
      carryover({ marketType: "other_asset", isHeavyRealEstateForRate: true }),
    );
    expect(r.basicDeductionGroup).toBe("real_estate_and_other_asset");
  });
});
