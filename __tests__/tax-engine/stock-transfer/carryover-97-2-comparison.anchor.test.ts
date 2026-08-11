/**
 * anchor: 주식 이월과세 §97의2②3호 **비교과세** (계획서 §5.3 C-1~C-4 · §4 Q-2/Q-2b)
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md
 *
 * > ② 다음 각 호의 어느 하나에 해당하는 경우에는 제1항을 적용하지 아니한다.
 * >   3. 제1항을 적용하여 계산한 양도소득 **결정세액**이 제1항을 적용하지 아니하고 계산한
 * >      양도소득 **결정세액**보다 **적은 경우**
 *
 * 🔑 **①이 배제되면 그 자산은 「§97의2①에 해당하는 자산」이 아니므로 §104②2호도 발동하지
 *    않는다** — 보유기간이 수증일 기산으로 **함께** 돌아간다. 부동산 `buildInputB`가
 *    `acquisitionCause: "purchase"`로 되돌리는 것과 같은 규약이다
 *    (`transfer-tax-carryover.ts:616-645` · 선행 계획서 D-2가 연혁으로 종결).
 *
 * **Q-2 종결** — 비교 금액은 **전체(그룹 합산) 결정세액**이다. 종목 단위 비교는 틀린다
 * (§103② 기본공제가 그룹 단위 연 1회라 다른 종목의 세액이 함께 움직인다).
 * **Q-2b 종결** — 판정 단위는 **자산별**. 2ⁿ 조합 중 「모든 자산에 대해 T(적용) ≥ T(미적용)」인
 * 것을 고르고, 복수면 **적용 최다**를 택한다(「적은 경우」만 배제하므로 동률은 적용 유지).
 *
 * ── 실행 상태 (Pre-Do 2026-08-11) ─────────────────────────────────────
 * 실패 **5건** — C-1 · C-4 · C-5 · C-6 · C-7 / 통과 3건 — C-2 · C-3 · C-8
 *
 * ⚠️ **통과 3건은 「구별력이 없어서」 통과한다.** ②3호로 배제된 결과(승계 X)와 미구현 상태
 *    (승계 X)가 **같은 값**이기 때문이다. 세 건 모두 **양성 대조군과 쌍으로** 읽어야 한다:
 *      · C-2 ↔ **C-1**(배제되지 않으면 승계된다)
 *      · C-3·C-8 ↔ **C-4**(배제되면 세율도 돌아간다)
 *    구현 후에는 C-4·C-7이 이 파일의 구별력을 책임진다.
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";
import { carryover, stock, SHARE_COUNT } from "./carryover-97-2-fixtures";

const GIFT_VALUATION_TOTAL = 80_000 * SHARE_COUNT; // 800,000,000
const DONOR_BASIS_TOTAL = 30_000 * SHARE_COUNT; //    300,000,000

describe("C. §97의2②3호 — 자산별 판정 · 전체 결정세액 비교", () => {
  it("C-1 증여자 취득가가 **낮음** → 적용이 더 비싸다 ⇒ A 채택(승계 O · 증여자 기산)", () => {
    const r = calculateStockTransferTax(carryover({ donorAcquisitionPrice: 30_000 }));
    expect(r.acquisitionPrice).toBe(DONOR_BASIS_TOTAL);
    expect(r.isShortTermHolding).toBe(false); // 증여자 기산 3,928일
  });

  it("C-2 증여자 취득가가 **높음** → 적용이 더 싸다 ⇒ ②3호로 B 채택(승계 X)", () => {
    const r = calculateStockTransferTax(carryover({ donorAcquisitionPrice: 120_000 }));
    expect(r.acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
  });

  /**
   * 🔑 **취득가액이 같아도 A와 B는 세액이 다르다** — 세율 기산일이 갈리기 때문이다.
   *   그리고 이월과세는 보통 보유기간을 **길게** 만들어 세율을 낮추므로, 취득가액 승계 효과가
   *   작으면 **A가 오히려 싸져 ②3호로 배제**된다. ⇒ 「동률」은 취득가액이 아니라
   *   **결정세액**으로 정의해야 한다.
   *
   * 여기서는 A·B 모두 **양도차손**이 되게 해 세액을 둘 다 0으로 만든다.
   */
  it("C-3 **세액 동률** — 「적은 경우」가 아니므로 배제하지 않는다 ⇒ A 채택", () => {
    const r = calculateStockTransferTax(
      carryover({ perShareAcquisitionPrice: 110_000, donorAcquisitionPrice: 110_000 }),
    );
    expect(r.calculatedTax).toBe(0);
    expect(r.isShortTermHolding).toBe(false); // ← A 채택이므로 증여자 기산
  });

  it("C-3b 취득가액만 같고 세액은 다르다 — A가 싸지므로 ②3호로 **배제**", () => {
    // 승계해도 취득가액이 그대로(8억)라 A의 이득은 **세율 소급뿐** ⇒ A < B ⇒ 배제
    const r = calculateStockTransferTax(carryover({ donorAcquisitionPrice: 80_000 }));
    expect(r.isShortTermHolding).toBe(true);
    expect(r.appliedRate).toBe(0.3);
  });

  /**
   * C-4 = P-2의 실측 케이스. **배제되면 세율도 함께 돌아간다**는 것이 이 anchor의 존재 이유다.
   *   현행(결함):  증여자 기산 → 가목2) 20% → 39,500,000
   *   정정 후:     수증일 기산 → 가목1) 30% → 59,250,000   (차이 19,750,000)
   */
  it("C-4 ②3호 배제 시 **세율도 수증일 기산으로 돌아간다** (단기 30%)", () => {
    const r = calculateStockTransferTax(carryover({ donorAcquisitionPrice: 120_000 }));
    expect(r.isShortTermHolding).toBe(true);
    expect(r.appliedRate).toBe(0.3);
    expect(r.holdingPeriodDays).toBe(183);
  });
});

describe("C. Q-2 — 비교 금액은 **전체 결정세액**이다 (종목 단위는 틀린다)", () => {
  /**
   * 반례(격자 probe 실측): 두 시나리오 모두 **그 종목의 세액이 0**인데
   * 소진한 기본공제가 달라(A 300,000 / B 500,000) 상대 종목 과세표준이 200,000 벌어진다.
   *   종목 단위 비교 → 0 == 0 → 동률 → A 채택
   *   전체 비교      → A < B  → ②3호 발동 → **B 채택**
   */
  it("C-5 종목 세액이 둘 다 0이어도 **다른 종목을 통해** ②3호가 발동한다", () => {
    const target = carryover({
      perShareAcquisitionPrice: 99_970, // B: 소득 300,000
      donorAcquisitionPrice: 99_990, //    A: 소득 100,000
    });
    const other = stock({ perShareAcquisitionPrice: 50_000 }); // 소득 5억

    const agg = calculateStockTransferTaxAggregate([target, other], "aggregate");
    const t = agg.items[0];

    // A(적용)가 전체 세액을 **낮추므로** ②3호로 배제 ⇒ 승계 X · 수증일 기산
    expect(t.acquisitionPrice).toBe(99_970 * SHARE_COUNT);
    expect(t.isShortTermHolding).toBe(true);
  });
});

describe("C. Q-2b — carryover 종목이 2건일 때 조합 채택", () => {
  it("C-6 둘 다 적용이 비싸다 ⇒ 둘 다 A", () => {
    const s1 = carryover({ donorAcquisitionPrice: 30_000 });
    const s2 = carryover({ donorAcquisitionPrice: 30_000 });
    const agg = calculateStockTransferTaxAggregate([s1, s2], "aggregate");
    expect(agg.items[0].acquisitionPrice).toBe(DONOR_BASIS_TOTAL);
    expect(agg.items[1].acquisitionPrice).toBe(DONOR_BASIS_TOTAL);
  });

  it("C-7 **엇갈림** — 한쪽만 배제된다 (자산별 판정)", () => {
    const s1 = carryover({ donorAcquisitionPrice: 30_000 }); // 적용이 비쌈 → A
    const s2 = carryover({ donorAcquisitionPrice: 120_000 }); // 적용이 쌈  → B
    const agg = calculateStockTransferTaxAggregate([s1, s2], "aggregate");
    expect(agg.items[0].acquisitionPrice).toBe(DONOR_BASIS_TOTAL);
    expect(agg.items[1].acquisitionPrice).toBe(GIFT_VALUATION_TOTAL);
    // 세율 축도 각각 따라간다
    expect(agg.items[0].isShortTermHolding).toBe(false);
    expect(agg.items[1].isShortTermHolding).toBe(true);
  });

  it("C-8 조합이 **세액 동률**로 복수면 적용(A) 최다를 택한다", () => {
    // 두 종목 모두 A·B가 양도차손이라 4개 조합의 세액이 전부 0 — 복수해다.
    const loss = { perShareAcquisitionPrice: 110_000, donorAcquisitionPrice: 110_000 } as const;
    const agg = calculateStockTransferTaxAggregate(
      [carryover(loss), carryover(loss)],
      "aggregate",
    );
    expect(agg.totalCalculatedTax).toBe(0);
    // 「적은 경우」가 아니므로 어느 쪽도 배제하지 않는다 ⇒ 둘 다 증여자 기산
    expect(agg.items[0].isShortTermHolding).toBe(false);
    expect(agg.items[1].isShortTermHolding).toBe(false);
  });
});
