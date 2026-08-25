/**
 * anchor — E2-03 : 단독주택 출자 입주권 **환산** 경로가 1세대1주택·거주기간을 하드코딩으로 버려
 * 실가 경로와 LTHD 표가 갈린다.
 *
 * ## 조문
 *
 * · 소득세법 §95② 단서 — 「대통령령으로 정하는 **1세대 1주택**…에 해당하는 자산의 경우에는 … 표 2」
 * · 소득세법 시행령 §159의4 — 「1세대가 **양도일 현재 국내에 1주택**을 보유하고 보유기간 중
 *   **거주기간이 2년 이상**인 것」
 * · 소득세법 시행령 §166⑤1호 — 인가전 분 보유기간 = 취득일 ~ 인가일
 *
 * 표2 진입을 가르는 축은 **1세대1주택 + 거주 2년**이다. **취득가액 산정 방식(실가/환산)은
 * 어디에도 없다.**
 *
 * ## 결함
 *
 * `calcRedevHousingContribReceiveEstimated`가 `computeRightLthd`를 부르면서
 * `isOneHouseSingle: false`, `residencePeriodMonths: 0`을 **상수로** 넘겼다
 * (주석: 「1세대1주택 분기는 UI PR에서 처리」). 그런데 상위 오케스트레이터는 같은 사실관계에서
 * `isOneHouseSingle`을 정상 산정해 내려보내고, **실가 경로**(`computeRedevelopmentLthd`
 * → `computeRightLthd`)는 그 값을 소비해 표2를 적용한다.
 *
 * ⇒ §95②·§159의4와 무관한 축(취득가액 산정 방식)이 LTHD 표를 갈랐다. 두 결과가 동시에 옳을 수 없다.
 *
 * ## 실측 (mock 세율 · 단독주택 출자 · 인가 2013-10-23 · 취득 2008-04-09 · 청산금 5천만 수령
 *          · 양도 2023-03-02 320,000,000 · 거주 60개월)
 *
 * | 경로 | 1세대1주택 | 인가전 공제율 | LTHD | 세액합계 |
 * |---|---|---|---|---|
 * | 환산 (종전) | OFF | 0.10 | 9,700,000 | 42,772,400 |
 * | 환산 (종전) | **ON** | **0.10** | **9,700,000** | **42,772,400** ← 완전 동일 |
 * | 실가 | OFF | 0.10 | 10,000,000 | 43,901,000 |
 * | 실가 | **ON** | **0.40** | 40,000,000 | 32,103,500 |
 *
 * ⇒ 실가에서는 1세대1주택이 세액을 **11,797,500원** 움직이는데 환산에서는 **0원**이었다.
 *
 * ⚠️ 이 fixture는 `exemptionEligibleAtApproval`을 **넣지 않는다**. 그 값을 `true`로 두면
 *    §166④1호 청산금 수령 비과세(`applySettlementExemption`)가 함께 발화해 축이 섞인다
 *    (실측: 양도차익 167,000,000 → 97,000,000). 여기서 보려는 것은 **LTHD 표 축 하나**다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

function redevInfo(extra: Partial<RedevelopmentInfo> = {}): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "receive",
    settlementAmount: 50_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
    ...extra,
  };
}

/** §164⑤ 2-point 환산 — 취득당시 1.2억 / 인가당시 2억 */
const PHD = { housingStdPriceAtAcq: 120_000_000, housingStdPriceAtApproval: 200_000_000 };

function input(o: Partial<TransferTaxInput>, redev: Partial<RedevelopmentInfo> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 320_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2008-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    residencePeriodMonths: 60, // 거주 5년 — §159의4 「거주 2년 이상」 충족
    redevelopment: redevInfo(redev),
    ...o,
  });
}

const ESTIMATED_OFF = { useEstimatedAcquisition: true, isOneHousehold: false, householdHousingCount: 2 };
const ESTIMATED_ON = { useEstimatedAcquisition: true, isOneHousehold: true, householdHousingCount: 1 };
const ACTUAL_OFF = { useEstimatedAcquisition: false, acquisitionPrice: 180_000_000, isOneHousehold: false, householdHousingCount: 2 };
const ACTUAL_ON = { useEstimatedAcquisition: false, acquisitionPrice: 180_000_000, isOneHousehold: true, householdHousingCount: 1 };

describe("E2-03 anchor — 환산 경로도 1세대1주택·거주기간을 소비한다", () => {
  const estOff = calculateTransferTax(input(ESTIMATED_OFF, PHD), rates);
  const estOn = calculateTransferTax(input(ESTIMATED_ON, PHD), rates);
  const actOff = calculateTransferTax(input(ACTUAL_OFF), rates);
  const actOn = calculateTransferTax(input(ACTUAL_ON), rates);

  it("기준선 — 실가 경로는 1세대1주택이 표1(0.10) → 표2(0.40)를 가른다", () => {
    expect(actOff.redevelopmentDetail?.preApproval.lthdRate).toBe(0.1);
    expect(actOn.redevelopmentDetail?.preApproval.lthdRate).toBe(0.4);
  });

  it("환산 경로 1세대1주택 OFF — 표1 (0.10) 유지 (회귀 가드)", () => {
    expect(estOff.redevelopmentDetail?.preApproval.lthdRate).toBe(0.1);
    expect(estOff.totalTax).toBe(42_772_400);
  });

  it("🔑 환산 경로 1세대1주택 ON → 표2 (0.40) 진입 (종전 0.10 고정)", () => {
    expect(estOn.redevelopmentDetail?.preApproval.lthdRate).toBe(0.4);
  });

  it("🔑 구별력 — 환산 경로에서도 1세대1주택이 세액을 가른다 (종전 두 값이 동일했다)", () => {
    expect(estOn.totalTax).not.toBe(estOff.totalTax);
    expect(estOn.totalTax).toBeLessThan(estOff.totalTax);
  });

  it("🔑 취득가액 산정 방식이 LTHD 표를 가르지 않는다 — 실가·환산이 같은 표를 쓴다", () => {
    expect(estOn.redevelopmentDetail?.preApproval.lthdRate)
      .toBe(actOn.redevelopmentDetail?.preApproval.lthdRate);
    expect(estOff.redevelopmentDetail?.preApproval.lthdRate)
      .toBe(actOff.redevelopmentDetail?.preApproval.lthdRate);
  });

  it("거주 2년 미만이면 환산 경로도 표1 — §159의4 「거주기간 2년 이상」", () => {
    const shortStay = calculateTransferTax(
      input({ ...ESTIMATED_ON, residencePeriodMonths: 12 }, PHD),
      rates,
    );
    expect(shortStay.redevelopmentDetail?.preApproval.lthdRate).toBe(0.1);
  });
});
