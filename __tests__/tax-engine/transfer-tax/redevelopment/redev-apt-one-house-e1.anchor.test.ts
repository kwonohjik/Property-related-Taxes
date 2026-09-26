/**
 * E1 anchor — 재개발·재건축 **완공 신축주택**(subject="apt") 1세대1주택 비과세 (OH-19 · OH-48 · OH-50)
 *
 * ── 근거 (KoreanLaw MCP 원문 · 소득세법 시행령 MST 286211, 2026-09-26 조회) ─────────────────
 * · 시행령 §154① — 「…보유기간이 2년 이상인 것[취득 당시에 … 조정대상지역에 있는 주택의 경우에는
 *   … 보유기간이 2년 이상이고 **그 보유기간 중 거주기간이 2년 이상**인 것]」
 * · 시행령 §154⑧1호 — 「거주하거나 보유하는 중에 … 멸실되어 재건축한 주택인 경우에는 그 멸실된
 *   주택과 재건축한 주택에 대한 **거주기간 및 보유기간**」을 통산
 * · 시행령 §162①4호 — 자기가 건설한 건축물의 취득시기 = 사용승인서 교부일
 * · 국세청 서면-2019-부동산-4508(2022.12.06, taxlaw.nts.go.kr 원문 확인) 요지 — 「조합원입주권을
 *   승계취득하여 재개발 사업시행완료로 취득한 주택 … 보유기간은 해당 주택의 취득일(준공인가증
 *   교부일)부터 계산하는 것으로 **멸실 전 거주기간을 통산하지 아니함**」
 * · 서면-2016-법령해석재산-2705 — 청산금 수령분의 비과세 판정 시점 = 관리처분계획 인가일
 *
 * ── 수정 전 실측 (`makeMockRates()`) ─────────────────────────────────────────────────────
 * | 시나리오 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 사례 47 수령 동시신고 10억 | 54,351,000 · isExempt=false | 0 · isExempt=true |
 * | 사례 47 수령 동시신고 12억 | 71,071,000 | 0 |
 * | 수령 동시신고 20억 · 조정 취득 · 거주 0 · 인가일 미충족 | 252,034,200 (요건 무검증 안분) | 710,308,500 (안분 없음) |
 * | 원조합원 분리 입력 종전 30 · Step4 0 · 10억 | 124,491,714 · isExempt=false | 0 · isExempt=true |
 * | 승계조합원 Step4 26 · 신축 0 | 0 · isExempt=true | 236,511,000 |
 * | 승계조합원 신축 미입력 · Step4 132 · 표2 | 0.22 (표1) | 0.8 (표2) |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case47RedevelopmentInfo } from "./_helpers";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

/** 사례 47 사실관계(2001 취득·21년 거주·인가 2014·평가액 8억·청산금 2억 수령) — 양도가액만 바꾼다. */
function case47(price: number, redev: Partial<RedevelopmentInfo> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: price,
    transferDate: new Date("2022-03-01"),
    acquisitionDate: new Date("2001-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 254,
    redevelopment: { ...case47RedevelopmentInfo(), ...redev },
  });
}

/** 원조합원 — 종전주택 2018-01-10 취득(취득 당시 조정대상지역) · 인가 2019-06-01 · 양도 2024-03-01. */
function original(
  price: number,
  o: Partial<TransferTaxInput> = {},
  redev: Partial<RedevelopmentInfo> = {},
): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: price,
    transferDate: new Date("2024-03-01"),
    acquisitionDate: new Date("2018-01-10"),
    acquisitionPrice: 400_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    wasRegulatedAtAcquisition: true,
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2019-06-01"),
      rightsValue: 600_000_000,
      settlementDirection: "pay",
      settlementAmount: 100_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      ...redev,
    },
    ...o,
  });
}

const RECEIVE_SIMULTANEOUS: Partial<RedevelopmentInfo> = {
  settlementDirection: "receive",
  settlementAmount: 200_000_000,
  settlementSaleDate: new Date("2024-03-01"),
  receiveOnlyMode: false,
  exemptionEligibleAtApproval: false,
};

/**
 * 승계조합원 — 입주권 승계 2017-07-15 · 준공 2021-06-30(성남 중원구, 준공일 현재 조정대상지역) ·
 * 양도 2024-03-01 11억. `regionCode`가 있어 엔진은 준공일 기준으로 조정 여부를 판정한다.
 */
function successor(o: Partial<TransferTaxInput> = {}, redev: Partial<RedevelopmentInfo> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 1_100_000_000,
    transferDate: new Date("2024-03-01"),
    acquisitionDate: new Date("2017-07-15"),
    acquisitionPrice: 500_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    regionCode: "4113310100",
    isSuccessorRightToMoveIn: true,
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2016-05-01"),
      rightsValue: 0,
      settlementDirection: "pay",
      settlementAmount: 0,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      isSuccessorMember: true,
      completionDate: new Date("2021-06-30"),
      ...redev,
    },
    ...o,
  });
}

describe("OH-19 — 청산금 수령 동시신고도 신축주택분은 §89①3호가목으로 판정한다", () => {
  it("🔑 10억 — 신축주택분 비과세 + 청산금분 인가일 기준 비과세 → 전액 0 (수정 전 54,351,000)", () => {
    const r = calculateTransferTax(case47(1_000_000_000), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(r.redevelopmentDetail?.aptOneHouseExemptionApplied).toBe(true);
    expect(r.redevelopmentDetail?.settlementExemptionApplied).toBe(true);
  });

  it("경계 12억 정확히 — 「12억원을 초과하는 고가주택은 제외」라 비과세 (수정 전 71,071,000)", () => {
    const r = calculateTransferTax(case47(1_200_000_000), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("경계 짝 12억+1원 — 고가주택 안분(부분 비과세)으로 넘어간다", () => {
    const r = calculateTransferTax(case47(1_200_000_001), rates);
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(true);
    expect(r.redevelopmentDetail?.highValueAllocation).toBeDefined();
  });

  it("형제 짝 — 청산금 납부 방향은 종전부터 비과세였다(방향만 다른 같은 사실)", () => {
    const r = calculateTransferTax(case47(1_000_000_000, { settlementDirection: "pay" }), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("🔑 청산금분은 인가일 축이 따로 판정한다 — 인가일 요건 미충족 선언이면 청산금분만 과세", () => {
    const r = calculateTransferTax(case47(1_000_000_000, { exemptionEligibleAtApproval: false }), rates);
    const d = r.redevelopmentDetail!;
    expect(d.aptOneHouseExemptionApplied).toBe(true);
    expect(d.preApproval.gain).toBe(0);
    expect(d.postApprovalExistingHouse.gain).toBe(0);
    // 청산금분 175,000,000은 가려지지 않는다 — 신축주택 §89①3호 판정이 인가일 축을 덮으면 안 된다.
    expect(d.settlement.gain).toBe(175_000_000);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
    // 같은 청산금분을 단독신고한 결과와 세액이 같다 — 신축주택분이 0이므로.
    const receiveOnly = calculateTransferTax(
      case47(1_000_000_000, { exemptionEligibleAtApproval: false, receiveOnlyMode: true }),
      rates,
    );
    expect(r.totalTax).toBe(receiveOnly.totalTax);
  });

  it("단독신고(사례 46 · receiveOnlyMode)는 종전대로 신축주택 판정을 하지 않는다", () => {
    const r = calculateTransferTax(case47(1_000_000_000, { receiveOnlyMode: true }), rates);
    expect(r.redevelopmentDetail?.aptOneHouseExemptionApplied).toBeUndefined();
  });

  it("사례 47 원본(20억)은 불변 — 요건 충족 신축주택의 12억 안분 + 청산금분 비과세", () => {
    const r = calculateTransferTax(case47(2_000_000_000), rates);
    expect(r.isPartialExempt).toBe(true);
    expect(r.calculatedTax).toBe(37_630_000);
  });

  it("🔑 §154① 미충족(조정 취득 · 거주 0)이면 20억이어도 §95③ 안분을 걸지 않는다 (수정 전 252,034,200)", () => {
    const r = calculateTransferTax(original(2_000_000_000, {}, RECEIVE_SIMULTANEOUS), rates);
    expect(r.isPartialExempt).toBe(false);
    expect(r.redevelopmentDetail?.highValueAllocation).toBeUndefined();
    expect(r.totalTax).toBe(710_308_500);
  });

  it("긍정 짝 — 같은 사실에 거주 30개월이면 요건 충족 → 안분이 걸린다", () => {
    const r = calculateTransferTax(
      original(2_000_000_000, { residencePeriodMonths: 30 }, RECEIVE_SIMULTANEOUS),
      rates,
    );
    expect(r.isPartialExempt).toBe(true);
    expect(r.redevelopmentDetail?.highValueAllocation).toBeDefined();
  });
});

describe("OH-48 — 원조합원 거주월수는 분리 입력(§154⑧1호 통산)이 비과세 판정에도 쓰인다", () => {
  it("🔑 분리 입력 종전 30 · Step4 0 · 10억 → 비과세 (수정 전 124,491,714)", () => {
    const r = calculateTransferTax(original(1_000_000_000, {}, { priorHouseResidenceMonths: 30 }), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("부정 짝 — 분리 입력 종전 12개월(2년 미만)이면 거주요건 미달로 과세", () => {
    const r = calculateTransferTax(original(1_000_000_000, {}, { priorHouseResidenceMonths: 12 }), rates);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("경계 — 종전 12 + 신축 12 = 24개월이면 통산으로 2년 충족", () => {
    const r = calculateTransferTax(
      original(1_000_000_000, {}, { priorHouseResidenceMonths: 12, newHouseResidenceMonths: 12 }),
      rates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("경계 짝 — 통산 23개월은 미달", () => {
    const r = calculateTransferTax(
      original(1_000_000_000, {}, { priorHouseResidenceMonths: 12, newHouseResidenceMonths: 11 }),
      rates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("분리 입력이 없으면 Step4 값을 쓴다 (fallback)", () => {
    const r = calculateTransferTax(original(1_000_000_000, { residencePeriodMonths: 30 }), rates);
    expect(r.isExempt).toBe(true);
  });

  it("🔑 분리 입력이 있으면 Step4 값보다 우선한다 — 표2와 같은 값 (한 계산 한 답)", () => {
    const r = calculateTransferTax(
      original(1_000_000_000, { residencePeriodMonths: 30 }, { priorHouseResidenceMonths: 12 }),
      rates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("15억 — 분리 입력만으로 요건 충족 → 12억 안분 (수정 전 286,143,000 전액 과세)", () => {
    const r = calculateTransferTax(original(1_500_000_000, {}, { priorHouseResidenceMonths: 30 }), rates);
    expect(r.isPartialExempt).toBe(true);
    const viaStep4 = calculateTransferTax(
      original(1_500_000_000, { residencePeriodMonths: 30 }, { priorHouseResidenceMonths: 30 }),
      rates,
    );
    expect(r.totalTax).toBe(viaStep4.totalTax);
  });
});

describe("OH-50 — 승계조합원은 준공 후 신축주택 거주만 §154① 거주기간이다", () => {
  it("🔑 신축 거주 0을 입력했으면 Step4의 26개월(멸실 전 거주)은 쓰지 않는다 → 과세", () => {
    const r = calculateTransferTax(
      successor({ residencePeriodMonths: 26 }, { newHouseResidenceMonths: 0 }),
      rates,
    );
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(236_511_000);
  });

  it("긍정 짝 — 신축 거주 26개월이면 준공일 기준 조정지역 거주요건 충족 → 비과세", () => {
    const r = calculateTransferTax(successor({}, { newHouseResidenceMonths: 26 }), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("승계조합원은 종전주택 거주(`prior`)를 통산하지 않는다", () => {
    const r = calculateTransferTax(
      successor({}, { priorHouseResidenceMonths: 30, newHouseResidenceMonths: 0 }),
      rates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("🔑 표2도 같은 값 — 신축 거주 미입력이면 Step4 132개월로 표2 진입 (수정 전 표1 0.22)", () => {
    const r = calculateTransferTax(
      successor({
        residencePeriodMonths: 132,
        transferPrice: 2_000_000_000,
        transferDate: new Date("2033-01-01"),
      }),
      rates,
    );
    expect(r.redevelopmentDetail?.postApprovalExistingHouse.lthdRate).toBe(0.8);
  });
});
