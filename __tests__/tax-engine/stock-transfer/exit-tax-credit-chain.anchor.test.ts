/**
 * 국외전출세 세액공제 사슬 anchor — 리뷰 2026-08-28 #8·#9
 *
 * 두 결함 모두 **납세자에게 유리한 방향의 과대공제**였다. 조문 본문을 직접 확인하고 고쳤다
 * (소득세법 lawId 001565, 시행 2026-07-01 본).
 *
 *   §118의13①  「… 산출세액에서 조정공제액을 공제한 금액을 **한도로** 다음의 계산식에 따라
 *              계산한 외국납부세액을 산출세액에서 공제한다.
 *              외국정부에 납부한 세액 × [제118조의10제1항에 따른 양도가액(제118조의12제1항에
 *              해당하는 경우에는 실제 양도가액) − 제118조의10제2항에 따른 필요경비]
 *              ÷ (실제 양도가액 − 제118조의10제2항에 따른 필요경비)」
 *              ⇒ 「한도」와 「계산식」은 **별개 요건**인데 코드는 한도만 구현했다.
 *
 *   §118의14①  한도 = 「산출세액에서 조정공제액을 공제한 금액」 — **외국납부세액공제는 차감 항목이 아니다**.
 *   §118의14②  「제1항에 따른 공제를 **하는 경우**에는 제118조의13제1항에 따른 외국납부세액의
 *              공제를 **적용하지 아니한다**」 — 강행. 코드에 배타 분기가 없었다.
 *
 *   ET-FTC-1~4  (#9) §118의13① 안분 비율
 *   ET-EX-1~4   (#8) §118의14② 배타 + §118의14① 한도 정정
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput, ExitTaxHolding } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

// ============================================================
// 공통 픽스처 — 기존 ET-anchor-01 과 같은 수치 축
//   양도차익 100,000주 × (50,000 − 20,000) = 3,000,000,000
//   과세표준 2,997,500,000 · 산출세액 734,375,000
//   §118의10① 양도가액   = 100,000 × 50,000 = 5,000,000,000
//   §118의10② 필요경비   = 100,000 × 20,000 = 2,000,000,000
// ============================================================

const DEPARTURE_DAY_VALUE = 5_000_000_000;
const NECESSARY_EXPENSE = 2_000_000_000;
const INCOME_TAX = 734_375_000;

function makeHolding(overrides?: Partial<ExitTaxHolding>): ExitTaxHolding {
  return {
    id: "holding-1",
    stockName: "테스트주식",
    marketType: "kospi",
    shareCount: 100_000,
    acquisitionDate: new Date("2015-01-01"),
    perShareAcquisitionPrice: 20_000,
    departureDayValuationMode: "market_price",
    departureDayMarketPrice: 50_000,
    ...overrides,
  };
}

function makeInput(overrides?: Partial<ExitTaxInput>): ExitTaxInput {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 8,
    departureDate: new Date("2026-06-01"),
    isMajorShareholder: true,
    holdings: [makeHolding()],
    deferralRequested: false,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    reenteredWithin5Years: false,
    ...overrides,
  };
}

// ============================================================
// #9 — §118의13① 안분 비율
// ============================================================

describe("ET-FTC (#9): §118의13① 외국납부세액공제 안분 비율", () => {
  it("ET-FTC-1: 실양도 > 출국일 시가 → 비율이 1 미만이라 공제가 줄어든다", () => {
    // 실제 양도 60,000/주 = 6,000,000,000 (> 출국일 시가 5,000,000,000)
    //   §118의12① 비해당 → 분자는 §118의10① 양도가액(출국일 시가)
    //   비율 = (5,000,000,000 − 2,000,000,000) ÷ (6,000,000,000 − 2,000,000,000)
    //        = 3,000,000,000 ÷ 4,000,000,000 = 0.75
    //   공제 = floor(500,000,000 × 0.75) = 375,000,000  (한도 734,375,000 이내)
    const r = calculateExitTax(
      makeInput({
        actualTransferPricePerShare: 60_000,
        foreignTaxPaid: 500_000_000,
      }),
    );
    expect(r.adjustmentDeduction).toBe(0); // 실양도 ≥ 출국일 시가 → 조정공제 없음
    expect(r.foreignTaxCreditApplied).toBe(375_000_000);
    expect(r.finalTaxAfterAdjustment).toBe(INCOME_TAX - 375_000_000);
  });

  it("ET-FTC-2: 실양도 < 출국일 시가(§118의12① 해당) → 분자도 실제 양도가액이라 비율 1", () => {
    // 실제 양도 40,000/주 = 4,000,000,000
    //   §118의12① 해당 → 분자 = 실제 양도가액 → 분자 = 분모 → 비율 1
    //   ⇒ 안분으로는 깎이지 않는다. 한도(산출세액 − 조정공제액)만 작동한다.
    const r = calculateExitTax(
      makeInput({
        actualTransferPricePerShare: 40_000,
        foreignTaxPaid: 100_000_000,
      }),
    );
    expect(r.adjustmentDeduction).toBeGreaterThan(0);
    expect(r.foreignTaxCreditApplied).toBe(100_000_000);
  });

  it("ET-FTC-3: 안분 후에도 한도(산출세액 − 조정공제액)를 넘지 못한다", () => {
    // 외국납부세액을 산출세액보다 크게 넣어 한도가 실제로 작동하는지 본다.
    const r = calculateExitTax(
      makeInput({
        actualTransferPricePerShare: 60_000,
        foreignTaxPaid: 9_000_000_000,
      }),
    );
    // 안분값 floor(9,000,000,000 × 0.75) = 6,750,000,000 → 한도 734,375,000 로 잘린다.
    expect(r.foreignTaxCreditApplied).toBe(INCOME_TAX);
    expect(r.finalTaxAfterAdjustment).toBe(0);
  });

  it("ET-FTC-4: 실양도가 미입력이면 안분을 못 하므로 경고를 남긴다(조용한 전액공제 금지)", () => {
    const r = calculateExitTax(
      makeInput({
        foreignTaxPaid: 500_000_000,
      }),
    );
    // 분모(실제 양도가액 − 필요경비)가 성립하지 않는다 → 한도만 적용하되 그 사실을 표면화한다.
    expect(r.foreignTaxCreditApplied).toBe(500_000_000);
    expect(r.warnings.some((w) => w.includes("§118의13①") && w.includes("실제 양도가액"))).toBe(true);
  });

  it("ET-FTC-5: 분모가 0 이하면 공제 0 — 0 나눗셈 방어", () => {
    // 실양도가 = 필요경비와 같으면 분모 0. (100,000 × 20,000 = 2,000,000,000)
    const r = calculateExitTax(
      makeInput({
        actualTransferPricePerShare: 20_000,
        foreignTaxPaid: 500_000_000,
      }),
    );
    expect(Number.isFinite(r.foreignTaxCreditApplied ?? 0)).toBe(true);
    expect(r.foreignTaxCreditApplied).toBe(0);
  });

  it("ET-FTC-6: 전제 — 픽스처의 양도가액·필요경비 축이 맞다", () => {
    const r = calculateExitTax(makeInput());
    expect(r.incomeTax).toBe(INCOME_TAX);
    // §118의10② 필요경비 = 출국일 양도가액 − 양도차익
    expect(DEPARTURE_DAY_VALUE - r.totalTransferGain).toBe(NECESSARY_EXPENSE);
  });
});

// ============================================================
// #8 — §118의14② 배타 + §118의14① 한도
// ============================================================

describe("ET-EX (#8): §118의14② 「①공제를 하는 경우 §118의13① 미적용」", () => {
  it("ET-EX-1: 비거주자 공제가 실제로 적용되면 외국납부세액공제는 0이 된다", () => {
    const r = calculateExitTax(
      makeInput({
        actualTransferPricePerShare: 60_000,
        foreignTaxPaid: 100_000_000,
        domesticSourceTaxWithheld: 200_000_000,
      }),
    );
    expect(r.domesticTaxCreditApplied).toBe(200_000_000);
    expect(r.foreignTaxCreditApplied).toBe(0);
    // 734,375,000 − 200,000,000 = 534,375,000 (종전에는 434,375,000 — 100,000,000 과소)
    expect(r.finalTaxAfterAdjustment).toBe(534_375_000);
    expect(r.localIncomeTax).toBe(53_437_500);
  });

  it("ET-EX-2: 배제 사실을 경고·적용규칙으로 남긴다", () => {
    const r = calculateExitTax(
      makeInput({
        actualTransferPricePerShare: 60_000,
        foreignTaxPaid: 100_000_000,
        domesticSourceTaxWithheld: 200_000_000,
      }),
    );
    expect(r.warnings.some((w) => w.includes("§118의14②"))).toBe(true);
    expect(r.appliedRules.some((a) => a.includes("118의14"))).toBe(true);
  });

  it("ET-EX-3: ①공제액이 0이면 「공제를 하는 경우」가 아니다 → 외납공제 유지", () => {
    // 원천징수액을 0으로 두면 §118의14① 공제가 성립하지 않는다.
    // 「필드가 있으면 무조건 배제」로 짜면 근거 없이 불리해진다.
    const r = calculateExitTax(
      makeInput({
        actualTransferPricePerShare: 60_000,
        foreignTaxPaid: 100_000_000,
        domesticSourceTaxWithheld: 0,
      }),
    );
    expect(r.domesticTaxCreditApplied ?? 0).toBe(0);
    expect(r.foreignTaxCreditApplied).toBe(75_000_000); // floor(100,000,000 × 0.75)
  });

  it("ET-EX-4: §118의14① 한도는 「산출세액 − 조정공제액」뿐 — 외납공제를 빼지 않는다", () => {
    // 조정공제가 걸리는 구간(실양도 < 출국일 시가)에서 한도가 정확히 산출세액 − 조정공제액인지 본다.
    const r = calculateExitTax(
      makeInput({
        actualTransferPricePerShare: 40_000,
        foreignTaxPaid: 100_000_000,
        domesticSourceTaxWithheld: 9_000_000_000, // 한도를 확실히 넘긴다
      }),
    );
    const adj = r.adjustmentDeduction ?? 0;
    expect(adj).toBeGreaterThan(0);
    expect(r.domesticTaxCreditApplied).toBe(INCOME_TAX - adj);
    // ②에 따라 외납공제는 배제된다.
    expect(r.foreignTaxCreditApplied).toBe(0);
    expect(r.finalTaxAfterAdjustment).toBe(0);
  });

  it("ET-EX-5: 원천징수만 있고 외국납부세액이 없으면 종전과 동일(회귀 가드)", () => {
    const r = calculateExitTax(
      makeInput({
        domesticSourceTaxWithheld: 200_000_000,
      }),
    );
    expect(r.domesticTaxCreditApplied).toBe(200_000_000);
    expect(r.foreignTaxCreditApplied).toBeUndefined();
    expect(r.finalTaxAfterAdjustment).toBe(INCOME_TAX - 200_000_000);
  });
});
