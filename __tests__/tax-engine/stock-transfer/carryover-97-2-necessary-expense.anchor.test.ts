/**
 * anchor: 주식 이월과세 §97의2① **필요경비 3요소** (계획서 §5.2 N-1~N-6)
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md
 *
 * §97의2① 각 호 외의 부분: 「… 필요경비는 **제97조제2항에 따르되**, 다음 각 호의 기준을 적용한다」
 *   1호 취득가액 = 증여자 취득 당시 **§97①1호** 금액 (가목 실가 / 나목 환산)
 *   2호 §97①2호 필요경비에 **증여자 지출분**을 포함 (⚠️ 양도비 §97①3호는 제외)
 *   3호 **증여세 상당액**을 필요경비에 산입
 *
 * 영 §163의2②:
 *   증여세 상당액 = 증여세 산출세액 × (양도한 해당 자산가액 / 증여세 과세가액)
 *   **한도** = 양도가액 − (§97① 및 §97②의 금액)   ← 증여세 가산 **직전** 양도차익
 *
 * ── 실행 상태 (Pre-Do 2026-08-11) ─────────────────────────────────────
 * 실패 **7건** / 통과 1건 — **N-4b**.
 *
 * ⚠️ **N-4b는 미구현 상태에서도 통과한다** — 「분모 0이면 산입 0」인데 지금은 증여세를
 *    아예 넣지 않아 항상 0이기 때문이다. **단독으로는 구별력이 없다.**
 *    양성 대조군은 **N-2**(분모가 정상이면 산입된다)이며, 둘을 **쌍으로** 읽어야 의미가 있다
 *    (메모리 `feedback_negative_assertion_needs_mutation_probe` ★★★).
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { carryover, SHARE_COUNT, PER_SHARE_TRANSFER } from "./carryover-97-2-fixtures";

const TRANSFER_TOTAL = PER_SHARE_TRANSFER * SHARE_COUNT; // 1,000,000,000
const DONOR_BASIS_TOTAL = 30_000 * SHARE_COUNT; //           300,000,000

describe("N. §97의2①1호 — 취득가액 승계 (실가)", () => {
  it("N-1 증여자 실지거래가액으로 승계된다", () => {
    const r = calculateStockTransferTax(carryover());
    expect(r.acquisitionPrice).toBe(DONOR_BASIS_TOTAL);
    // 파이프라인 끝까지 — 중간값만 맞고 세액이 틀리는 것을 막는다.
    expect(r.transferIncome).toBe(TRANSFER_TOTAL - DONOR_BASIS_TOTAL);
  });
});

describe("N. §97의2①2호 — 증여자 자본적지출", () => {
  it("N-1b 증여자 자본적지출이 필요경비에 포함된다", () => {
    const r = calculateStockTransferTax(
      carryover({ donorCapitalExpenditure: 5_000_000, actualExpenses: 3_000_000 }),
    );
    // 수증자 지출 3,000,000 + 증여자 지출 5,000,000
    expect(r.expenses).toBe(8_000_000);
    expect(r.transferIncome).toBe(TRANSFER_TOTAL - DONOR_BASIS_TOTAL - 8_000_000);
  });
});

describe("N. §97의2①3호 × 영 §163의2② — 증여세 상당액", () => {
  /**
   * 안분: 증여세 산출세액 200,000,000 × (양도 자산가액 800,000,000 / 과세가액 1,000,000,000)
   *      = 160,000,000
   */
  const giftInputs = {
    giftTaxAmount: 200_000_000,
    transferredAssetValue: 800_000_000,
    giftTaxableValue: 1_000_000_000,
  } as const;
  const APPORTIONED = 160_000_000;

  it("N-2 한도 미달 — 안분액 전액이 산입된다", () => {
    const r = calculateStockTransferTax(carryover(giftInputs));
    // 한도 = 양도가 10억 − 취득가 3억 = 7억 > 안분액 1.6억 ⇒ 전액
    expect(r.expenses).toBe(APPORTIONED);
    expect(r.transferIncome).toBe(TRANSFER_TOTAL - DONOR_BASIS_TOTAL - APPORTIONED);
  });

  /**
   * 🔑 **한도가 걸리면 A의 양도차익은 정확히 0이 된다** (한도의 정의가 「증여세 전 양도차익」이라서).
   *   ⇒ B의 세액이 0보다 크면 A < B가 되어 **②3호로 항상 배제**된다.
   *   ⇒ 한도 조항이 실제로 관측되려면 **B도 세액이 0**이어야 하고, 그 구간에서 두 시나리오의
   *     세액은 어차피 둘 다 0이다. **한도 조항은 세액을 바꾸지 않고 표시값(필요경비)만 바꾼다.**
   *
   * 그래서 아래 두 케이스는 증여 당시 평가액을 양도가 이상(1주당 110,000)으로 두어
   * **B도 손실**이 되게 한다 — 그래야 A가 채택되어 필요경비 산식을 관측할 수 있다.
   * (②3호 자체는 C 시리즈가 검증한다. 여기서 두 축을 섞지 않는다.)
   */
  const bLoss = { perShareAcquisitionPrice: 110_000 } as const; // 증여 당시 평가액 11억 > 양도 10억

  it("N-3 한도 초과 — 「양도가액 − §97①②」까지만 산입된다", () => {
    // 증여자 취득가 3억 ⇒ 한도 = 10억 − 3억 = 7억. 안분액 10억이 한도에 걸린다.
    const r = calculateStockTransferTax(
      carryover({
        ...bLoss,
        donorAcquisitionPrice: 30_000,
        giftTaxAmount: 1_000_000_000,
        transferredAssetValue: 1_000_000_000,
        giftTaxableValue: 1_000_000_000,
      }),
    );
    const cap = TRANSFER_TOTAL - DONOR_BASIS_TOTAL; // 700,000,000
    expect(r.expenses).toBe(cap);
    // 한도가 걸리면 양도차익은 정확히 0이 된다.
    expect(r.transferIncome).toBe(0);
  });

  it("N-4 양도차익이 음수 — 한도 0 ⇒ 증여세 산입 0", () => {
    // 증여자 취득가 1주당 120,000(총 12억) > 양도가 10억 ⇒ 한도 0
    const r = calculateStockTransferTax(
      carryover({ ...bLoss, ...giftInputs, donorAcquisitionPrice: 120_000 }),
    );
    expect(r.expenses).toBe(0);
    expect(r.transferIncome).toBe(TRANSFER_TOTAL - 120_000 * SHARE_COUNT); // −200,000,000
  });

  it("N-4b 안분 분모가 0이면 산입하지 않는다 (0 나눗셈 방어)", () => {
    const r = calculateStockTransferTax(
      carryover({ giftTaxAmount: 200_000_000, transferredAssetValue: 0, giftTaxableValue: 0 }),
    );
    expect(r.expenses).toBe(0);
  });
});

describe("N. 계획서 §3.1 실측 재현 — 과소과세 89,875,000", () => {
  /**
   * 계획서 §3.1의 조건 그대로. **세액까지** 단언해 파이프라인 끝을 고정한다
   * (메모리 `feedback_anchor_observes_wrong_stage` ★★★ — 중간값만 맞고 세액이 틀리는 것 방지).
   *
   * | | 취득가액 | 필요경비 | 양도소득금액 | 과세표준 | 세율 | 산출세액 |
   * |---|---|---|---|---|---|---|
   * | 종전(승계 미구현) | 800,000,000 | 0 | 200,000,000 | 197,500,000 | 20% | 39,500,000 |
   * | **§97의2① 적용**  | 300,000,000 | 120,000,000 | 580,000,000 | 577,500,000 | 25% | **129,375,000** |
   */
  it("N-7 실가 승계 + 증여세 산입 — 산출세액 129,375,000", () => {
    const r = calculateStockTransferTax(
      carryover({
        donorAcquisitionPrice: 30_000,
        giftTaxAmount: 120_000_000,
        transferredAssetValue: 1_000_000_000,
        giftTaxableValue: 1_000_000_000, // 안분 비율 1
      }),
    );
    expect(r.acquisitionPrice).toBe(300_000_000);
    expect(r.expenses).toBe(120_000_000);
    expect(r.transferIncome).toBe(580_000_000);
    expect(r.taxBase).toBe(577_500_000);
    expect(r.calculatedTax).toBe(129_375_000);
    // 종전 39,500,000 대비 +89,875,000
    expect(r.calculatedTax - 39_500_000).toBe(89_875_000);
  });
});

describe("N. 환산 모드 — §97①1호 **나목**은 증여자 기준이어야 한다", () => {
  /**
   * 환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가)  (영 §176의2②1호)
   * 이월과세면 분자가 **증여자 취득 당시** 기준시가다(§97의2①1호 → §97①1호 나목).
   *
   * 증여자 취득 당시 1주당 기준시가 20,000 · 양도일 1개월 종가평균 100,000
   *   ⇒ 환산취득가 = 10억 × 20,000/100,000 = 200,000,000
   *   ⇒ 개산공제(영 §163⑥4호) = 취득기준시가 총액 2억 × 1% = 2,000,000
   */
  it("N-5 증여자 취득 당시 기준시가로 환산 + 개산공제 1%", () => {
    const r = calculateStockTransferTax(
      carryover({
        acquisitionMode: "estimated",
        donorAcquisitionPrice: undefined, // 증여자 실가 확인 불가 → 나목
        donorAcquisitionStdPrice: 20_000,
        transferDatePriceAvg1Month: 100_000,
        acquisitionDatePriceAvg1Month: 40_000, // 수증자 취득시 — **써서는 안 된다**
      }),
    );
    expect(r.acquisitionPrice).toBe(200_000_000);
    expect(r.estimatedBase).toBe(200_000_000);
    expect(r.estimatedDeduction).toBe(2_000_000);
    expect(r.transferIncome).toBe(TRANSFER_TOTAL - 200_000_000 - 2_000_000);
  });

  /**
   * N-6 **가장 위험한 조합** — 환산 × §97②2호 단서 swap × 증여세.
   *
   * 가목 = 환산취득가 2억 + 개산공제 200만 = 202,000,000
   * 나목 = 자본적지출(수증자 3천만 + 증여자 5천만) + 양도비 = 80,000,000  → 가목이 크므로 본문
   * ⇒ swap 미발동. 그 상태에서 증여세가 **개산공제와 함께** 차감되어야 한다.
   *
   * ⚠️ 부동산에서 이 조합이 두 번 사고를 냈다 — 환산 모드는 legacy `expenses`를 무시하므로
   *    증여세를 거기에 얹으면 **세액에 도달하지 못한다**(`transfer-tax-carryover.ts:368-417`).
   */
  it("N-6a 환산 + 증여세 — 개산공제와 **함께** 차감된다 (swap 미발동)", () => {
    const r = calculateStockTransferTax(
      carryover({
        acquisitionMode: "estimated",
        donorAcquisitionPrice: undefined,
        donorAcquisitionStdPrice: 20_000,
        // B(미적용)의 취득측 — 수증자 취득 당시(증여일) 기준시가. **A에서는 20,000으로 치환된다.**
        acquisitionDatePriceAvg1Month: 80_000,
        transferDatePriceAvg1Month: 100_000,
        actualExpenses: 30_000_000,
        donorCapitalExpenditure: 50_000_000,
        giftTaxAmount: 100_000_000,
        transferredAssetValue: 1_000_000_000,
        giftTaxableValue: 1_000_000_000, // 안분 비율 1 ⇒ 100,000,000
      }),
    );
    expect(r.swapApplied).toBe(false);
    // 필요경비 = 개산공제 2,000,000 + 증여세 100,000,000
    expect(r.expenses).toBe(102_000_000);
    expect(r.transferIncome).toBe(TRANSFER_TOTAL - 200_000_000 - 102_000_000);
  });

  /**
   * N-6b swap **발동** — 나목(자본적지출+양도비)이 가목보다 크다.
   * 나목 = 수증자 1억 + 증여자 3억 = 400,000,000 > 가목 202,000,000
   * ⇒ 나목을 필요경비 **전체**로 하고 **환산취득가는 차감하지 않는다**(§97②2호 단서).
   *   양도차익 = 양도가 10억 − 400,000,000
   * ⚠️ 증여세는 단서 비교 **대상 밖**이라 별도 가산된다(부동산 설계 §6.5.3과 동일).
   */
  it("N-6b 환산 + swap 발동 — 나목 채택 · 환산취득가 **미차감**", () => {
    const r = calculateStockTransferTax(
      carryover({
        acquisitionMode: "estimated",
        donorAcquisitionPrice: undefined,
        donorAcquisitionStdPrice: 20_000,
        acquisitionDatePriceAvg1Month: 80_000, // B의 취득측
        transferDatePriceAvg1Month: 100_000,
        actualExpenses: 100_000_000,
        donorCapitalExpenditure: 300_000_000,
        giftTaxAmount: 50_000_000,
        transferredAssetValue: 1_000_000_000,
        giftTaxableValue: 1_000_000_000,
      }),
    );
    expect(r.swapApplied).toBe(true);
    expect(r.expenses).toBe(400_000_000 + 50_000_000);
    // 🔑 취득가액 항이 빠진다 — 이중차감 금지
    expect(r.transferIncome).toBe(TRANSFER_TOTAL - 450_000_000);
  });
});
