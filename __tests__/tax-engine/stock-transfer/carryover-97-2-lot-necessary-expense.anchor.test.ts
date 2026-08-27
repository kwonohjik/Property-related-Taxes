/**
 * anchor: 주식 이월과세 §97의2① — **lot(split) 판 ①2호·①3호** + lot 경로 게이트 결함 2건
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md
 *
 * ## 왜 필요했나
 *
 * PR #1209는 lot 경로에서 ①**1호**(취득가액 승계)만 배선했다. `AcquisitionLot`에
 * `donorCapitalExpenditure`·`donorGiftTaxAmount` 필드를 두고도 **읽는 곳이 없었고**,
 * 종목 축 입력구(`AcquisitionInfoBlock`)는 `lotsMode === "single"`에서만 렌더되므로
 * **split 모드 사용자는 ①2호·①3호를 입력할 방법이 아예 없었다**
 * (메모리 `feedback_ui_gate_removes_sole_input_path` ★★★ — 법 근거 없이 불리).
 *
 * ## 같은 경로에서 드러난 결함 2건 (P-9 · P-10)
 *
 * · **P-9** `resolveLotStartDate`가 **관계 요건을 판정하지 않았다** — 단건 경로에서 고친
 *   P-6과 같은 결함이 lot 경로에 남아 있었다. 관계는 **양도일이 필요 없어**(기준일 = 증여일)
 *   그 자리에서 판정할 수 있는데도 연혁 게이트만 봤다.
 * · **P-10** `hasCarryoverLot`이 `donorAcquisitionPrice`가 있는 lot만 ②3호 대상으로 봤다 —
 *   승계 취득가액을 입력하지 않아 효과가 **세율 소급뿐**인 lot은 비교 없이 무조건 소급됐다.
 *   단건 `isStockCarryoverEligible`은 날짜만 요구하므로 두 경로가 비대칭이었다.
 *
 * ⚠️ 두 결함이 **회귀 0건**으로 통과했던 이유는 「관계 부적격 lot」·「취득가액 없는 lot」
 *    조합을 다루는 anchor가 **한 건도 없었기** 때문이다(사각지대 —
 *    메모리 `feedback_ui_gate_expansion_activates_latent_defect` ★★★).
 *    그래서 아래 부정 단언에는 전부 **양성 대조군**을 붙였다.
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";
import { D, acqLot, stock, xferLot, SHARE_COUNT, PER_SHARE_TRANSFER } from "./carryover-97-2-fixtures";

/** 이월과세 lot 기본형 — 게이트 통과(증여 2025-06-01 · 양도 2025-12-01 · 배우자 생존) */
function coLot(o: Parameters<typeof acqLot>[0]) {
  return acqLot({
    acquisitionCause: "carryover_gift",
    acquisitionDate: D("2025-06-01"),
    donorAcquisitionDate: D("2015-03-01"),
    donorRelation: "spouse",
    donorDeceased: false,
    ...o,
  });
}

/** split 종목 — 매수 lot / 매도 lot을 그대로 받는다 */
function split(acq: ReturnType<typeof acqLot>[], trn: ReturnType<typeof xferLot>[]) {
  return calculateStockTransferTax(
    stock({
      acquisitionLots: acq,
      transferLots: trn,
      costAllocationMethod: "fifo",
    }),
  );
}

// ============================================================
// M. ①2호 — 증여자 자본적지출
// ============================================================

describe("M. §97의2①2호 — lot별 증여자 자본적지출", () => {
  it("M-1 lot 전량 매도 → 자본적지출 **전액** 산입", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorCapitalExpenditure: 50_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.lotMatchingDetail?.carryoverDonorCapex).toBe(50_000_000);
    expect(r.expenses).toBe(50_000_000);
  });

  it("M-2 lot 절반만 매도 → **매도 몫만** 안분 산입 (25,000,000)", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorCapitalExpenditure: 50_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT / 2 })],
    );
    expect(r.lotMatchingDetail?.carryoverDonorCapex).toBe(25_000_000);
  });

  it("M-3 [양성 대조군] 자본적지출이 실제로 양도차익을 줄인다", () => {
    const base = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    const withCapex = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorCapitalExpenditure: 50_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(base.transferIncome - withCapex.transferIncome).toBe(50_000_000);
  });

  it("M-4 **1년 초과** 매도 sub-lot은 자본적지출도 산입되지 않는다 (①1호와 같은 게이트)", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorCapitalExpenditure: 50_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT, transferDate: D("2026-09-01") })], // 증여 후 1년 3개월
    );
    expect(r.lotMatchingDetail?.carryoverDonorCapex).toBe(0);
  });

  it("M-5 **관계 부적격**(그 밖) lot은 자본적지출도 산입되지 않는다", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorCapitalExpenditure: 50_000_000, donorRelation: "other" })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.lotMatchingDetail?.carryoverDonorCapex).toBe(0);
  });

  it("M-6 moving_avg 산정방법에서도 산입된다 (매칭 3종 전부 배선)", () => {
    const r = calculateStockTransferTax(
      stock({
        acquisitionLots: [
          coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorCapitalExpenditure: 40_000_000 }),
        ],
        transferLots: [xferLot({ shareCount: SHARE_COUNT })],
        costAllocationMethod: "moving_avg",
      }),
    );
    expect(r.lotMatchingDetail?.carryoverDonorCapex).toBe(40_000_000);
  });
});

// ============================================================
// N. ①3호 — 증여세 상당액 (영 §163의2②)
// ============================================================

describe("N. §97의2①3호 — lot별 증여세 상당액", () => {
  /**
   * 안분 = 산출세액 × (양도한 해당 자산가액 / 증여세 과세가액).
   * 분자는 **매칭주식수 × 증여 당시 1주당 평가액**을 엔진이 산출한다.
   *   전량(10,000주 × 80,000 = 8억) / 과세가액 8억 → 비율 1 → 산출세액 전액
   */
  it("N-1 전량 매도 · 과세가액 = 증여 주식가액 → 산출세액 **전액** 산입", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorGiftTaxAmount: 120_000_000, donorGiftTaxableValue: 800_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.lotMatchingDetail?.carryoverGiftTaxApportioned).toBe(120_000_000);
    expect(r.expenses).toBe(120_000_000);
  });

  it("N-2 절반 매도 → 분자가 절반이라 **60,000,000**", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorGiftTaxAmount: 120_000_000, donorGiftTaxableValue: 800_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT / 2 })],
    );
    expect(r.lotMatchingDetail?.carryoverGiftTaxApportioned).toBe(60_000_000);
  });

  it("N-3 증여재산에 주식 외가 섞여 과세가액이 크면 그 비율만큼만 (16억 → 절반)", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorGiftTaxAmount: 120_000_000, donorGiftTaxableValue: 1_600_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.lotMatchingDetail?.carryoverGiftTaxApportioned).toBe(60_000_000);
  });

  it("N-4 **과세가액(분모) 미입력이면 산입 0** — 안분이 성립하지 않는다 (⑧ validate가 짝을 강제)", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorGiftTaxAmount: 120_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.lotMatchingDetail?.carryoverGiftTaxApportioned).toBe(0);
  });

  /**
   * 영 §163의2② 후단 한도 — 「양도가액에서 법 §97①·②의 금액을 공제한 잔액」.
   * 양도 10억 − 승계 취득가액 3억 = **7억**이 한도다.
   *
   * 🔑 **한도가 실제로 물리면 그 종목은 반드시 ②3호로 배제된다** — A의 양도차익이 0이 되어
   *   B(차익 2억)보다 세액이 작아지기 때문이다. 그래서 단건 종목에서는 한도의 clamp 값 자체를
   *   결과에서 볼 수 없고, **경계**(A와 B가 동률이 되는 지점)로만 관측된다.
   *   clamp가 죽은 코드가 아님은 N-7(다종목 차손통산)이 지킨다.
   */
  /**
   * ⚠️ **경계는 「양도소득금액 동률」이 아니라 「세액 동률」이다.**
   * A는 증여자 취득일로 소급해 가목**2)** 누진 20%, B는 수증일 기산이라 가목**1)** 단기 30%다.
   *   B 세액 = 0.3 × (2억 − 250만) = 59,250,000
   *   A 세액 = 0.2 × (7억 − 증여세 − 250만) 이므로 증여세 **401,250,000**에서 정확히 같아진다.
   */
  it("N-5 [경계] 증여세 401,250,000 → A·B **세액 동률**(59,250,000) → 적용 유지", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorGiftTaxAmount: 401_250_000, donorGiftTaxableValue: 800_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.carryoverDetail?.outcome).toBe("applied"); // 동률은 「적은 경우」가 아니다
    expect(r.expenses).toBe(401_250_000);
    expect(r.transferIncome).toBe(298_750_000);
    expect(r.calculatedTax).toBe(59_250_000);
    expect(r.carryoverDetail?.appliedTotalTax).toBe(r.carryoverDetail?.excludedTotalTax);
  });

  it("N-5b [경계 넘김] 증여세 +1원 → A가 B보다 작아져 **②3호로 배제**", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorGiftTaxAmount: 401_250_001, donorGiftTaxableValue: 800_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.carryoverDetail?.outcome).toBe("excluded");
    expect(r.expenses).toBe(0);
  });

  it("N-6 **1년 초과** sub-lot은 증여세도 산입되지 않는다", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorGiftTaxAmount: 120_000_000, donorGiftTaxableValue: 800_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT, transferDate: D("2026-09-01") })],
    );
    expect(r.lotMatchingDetail?.carryoverGiftTaxApportioned).toBe(0);
  });

  /**
   * 한도 clamp가 **죽은 코드가 아님**을 지킨다.
   * clamp가 없으면 증여세 9억이 그대로 산입되어 A의 양도소득금액이 **−2억(차손)** 이 되고,
   * 그 차손이 §102① 통산으로 다른 종목의 차익을 깎아 `appliedTotalTax`가 더 내려간다.
   * clamp가 있으면 A의 양도소득금액이 **0**에서 멈춰 통산할 차손이 없다.
   */
  it("N-7 다종목 — 한도 clamp가 차손 통산을 막는다 (clamp 없으면 A 세액이 더 내려간다)", () => {
    const carryoverItem = stock({
      acquisitionLots: [
        coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorGiftTaxAmount: 900_000_000, donorGiftTaxableValue: 800_000_000 }),
      ],
      transferLots: [xferLot({ shareCount: SHARE_COUNT })],
      costAllocationMethod: "fifo",
    });
    const other = stock({ perShareAcquisitionPrice: 50_000 }); // 차익 5억
    const agg = calculateStockTransferTaxAggregate([carryoverItem, other]);
    const d = agg.items[0].carryoverDetail!;

    /**
     * A 시나리오의 전체 결정세액 = **상대 종목 5억만** 과세한 값이다:
     *   과세표준 500,000,000 − 기본공제 2,500,000 = 497,500,000 × 30%(단기) = **149,250,000**
     * 즉 이월과세 종목의 A 양도소득금액이 **0에서 멈췄다**. clamp가 없으면 −2억 차손이
     * §102① 통산으로 상대 종목 차익을 깎아 이 값이 더 내려간다.
     *
     * ⚠️ 2026-08-27 정정 — 종전 값 164,175,000 의 차액 14,925,000 을 이 주석은 「지방소득세」라
     *    적었지만 `appliedTotalTax` 는 `aggregateCore(...).totalFinalTax` 라 지방소득세를 담지
     *    않는다. 실제 정체는 **픽스처가 `filingViolation` 을 안 채워 붙던 과소신고 10% 가산세**
     *    였다(149,250,000 × 10%). 지방소득세율과 같은 10% 라 두 값이 구분되지 않았다.
     */
    expect(d.appliedTotalTax).toBe(149_250_000);
    // 한도가 물린 A는 B보다 세액이 작으므로 ②3호로 배제되고, 채택값은 B다.
    expect(d.outcome).toBe("excluded");
    expect(agg.totalFinalTax).toBe(d.excludedTotalTax);
  });
});

// ============================================================
// P-9. lot 세율 축이 관계 요건을 판정한다
// ============================================================

describe("P-9. lot §104②2호 소급은 **관계 요건**을 통과해야 한다", () => {
  const lots = (o: Partial<Parameters<typeof acqLot>[0]> = {}) => [
    coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, ...o }),
  ];

  it("P-9-a [양성 대조군] 배우자 생존 → 증여자 취득일로 소급되어 **장기**(가목2)", () => {
    const r = split(lots({ donorAcquisitionPrice: 30_000 }), [xferLot({ shareCount: SHARE_COUNT })]);
    expect(r.lotMatchingDetail?.matched[0].isShortTerm).toBe(false);
  });

  it("P-9-b 관계가 「그 밖」이면 소급하지 않는다 → 수증일 기산 **단기 30%**", () => {
    const r = split(
      lots({ donorAcquisitionPrice: 30_000, donorRelation: "other" }),
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.lotMatchingDetail?.matched[0].isShortTerm).toBe(true);
    // 취득가액도 승계되지 않는다 — 8억 그대로
    expect(r.acquisitionPrice).toBe(80_000 * SHARE_COUNT);
    // 과세표준 197,500,000 × 30% = 59,250,000
    expect(r.taxBase).toBe(197_500_000);
    expect(r.calculatedTax).toBe(59_250_000);
  });

  it("P-9-c 배우자 **사별** → 소급하지 않는다 (§97의2① 괄호)", () => {
    const r = split(
      lots({ donorAcquisitionPrice: 30_000, donorDeceased: true }),
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.lotMatchingDetail?.matched[0].isShortTerm).toBe(true);
  });

  /**
   * 결함 크기 — **수정 전후 실측**(2026-08-12, 같은 픽스처를 두 코드로 각각 실행):
   *   before 39,500,000 (소급 → 가목2 누진 20%) / after 59,250,000 (가목1 단기 30%)
   *   ⇒ **과소과세 19,750,000** (단건 경로 P-6과 같은 크기)
   *
   * ⚠️ 이 결함은 **취득가액을 입력하지 않은 경우에만** 노출됐다 — 입력했으면 P-10의 옛
   * `hasCarryoverLot`이 그 종목을 ②3호 대상으로 잡아 배제해 주면서 결과적으로 가려졌다.
   * 그래서 아래 픽스처는 `donorAcquisitionPrice`가 **없다**.
   */
  it("P-9-d 결함 크기 — 관계 부적격인데 소급하면 19,750,000 적다 (before 39,500,000)", () => {
    const r = split(lots({ donorRelation: "other" }), [xferLot({ shareCount: SHARE_COUNT })]);
    expect(r.calculatedTax).toBe(59_250_000);
    expect(r.calculatedTax - 39_500_000).toBe(19_750_000);
    // 관계 부적격이면 ②3호 비교 자체를 하지 않는다 — 애초에 「해당하는 자산」이 아니다.
    expect(r.carryoverDetail).toBeUndefined();
  });
});

// ============================================================
// P-10. 취득가액 없는 이월과세 lot도 ②3호 비교를 거친다
// ============================================================

describe("P-10. 세율 축만 걸린 lot도 §97의2②3호 비교 대상이다", () => {
  it("P-10-a 승계 취득가액 없음 → 소급하면 세액이 줄어 **②3호로 배제**된다", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000 })], // donorAcquisitionPrice 없음
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.carryoverDetail?.outcome).toBe("excluded");
    // 배제되면 세율도 수증일 기산으로 돌아간다 — 단기 30%
    expect(r.calculatedTax).toBe(59_250_000);
  });

  it("P-10-b [양성 대조군] 승계 취득가액이 있어 세액이 늘면 **적용을 유지**한다", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.carryoverDetail?.outcome).toBe("applied");
    expect(r.acquisitionPrice).toBe(30_000 * SHARE_COUNT);
  });

  /**
   * 결함 크기 — **수정 전후 실측**(2026-08-12): before 39,500,000 / after 59,250,000
   * ⇒ **과소과세 19,750,000**. 종전에는 `carryoverDetail`조차 없었다(비교를 아예 안 했다).
   */
  it("P-10-c 결함 크기 — 비교 없이 소급하면 19,750,000 적다 (before 39,500,000)", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    expect(r.calculatedTax).toBe(59_250_000);
    expect(r.calculatedTax - 39_500_000).toBe(19_750_000);
  });
});

// ============================================================
// Q. ⑦ 결과 계층 — A/B 비교 detail
// ============================================================

describe("Q. carryoverDetail — ②3호가 견준 두 세액을 결과가 보존한다", () => {
  it("Q-1 적용 시 — 두 세액이 실려 있고 적용 쪽이 크거나 같다", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000, donorAcquisitionPrice: 30_000, donorCapitalExpenditure: 10_000_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    const d = r.carryoverDetail!;
    expect(d.outcome).toBe("applied");
    expect(d.appliedTotalTax).toBeGreaterThanOrEqual(d.excludedTotalTax);
    expect(d.donorCapexIncluded).toBe(10_000_000);
  });

  it("Q-2 배제 시 — 배제 사실과 두 세액이 남는다 (B는 acquisitionCause를 되돌리므로 흔적이 사라진다)", () => {
    const r = split(
      [coLot({ shareCount: SHARE_COUNT, perShareAcquisitionPrice: 80_000 })],
      [xferLot({ shareCount: SHARE_COUNT })],
    );
    const d = r.carryoverDetail!;
    expect(d.outcome).toBe("excluded");
    expect(d.appliedTotalTax).toBeLessThan(d.excludedTotalTax);
    expect(d.excludedTotalTax).toBe(r.finalTax);
  });

  it("Q-3 단건 경로 — A/B 1주당 취득가액이 나란히 남는다", () => {
    const r = calculateStockTransferTax(
      stock({
        acquisitionCause: "carryover_gift",
        donorAcquisitionDate: D("2015-03-01"),
        donorRelation: "spouse",
        donorAcquisitionPrice: 30_000,
        donorCapitalExpenditure: 5_000_000,
        giftTaxAmount: 120_000_000,
        transferredAssetValue: 800_000_000,
        giftTaxableValue: 800_000_000,
      }),
    );
    const d = r.carryoverDetail!;
    expect(d.outcome).toBe("applied");
    expect(d.donorAcquisitionPricePerShare).toBe(30_000);
    expect(d.giftDateValuationPerShare).toBe(80_000);
    expect(d.donorCapexIncluded).toBe(5_000_000);
    expect(d.giftTaxIncluded).toBe(120_000_000);
  });

  it("Q-4 이월과세와 무관한 종목은 detail이 없다 (표시 게이트)", () => {
    const r = calculateStockTransferTax(stock({ perShareTransferPrice: PER_SHARE_TRANSFER }));
    expect(r.carryoverDetail).toBeUndefined();
  });
});
