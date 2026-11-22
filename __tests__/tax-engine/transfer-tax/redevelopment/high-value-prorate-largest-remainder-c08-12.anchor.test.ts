/**
 * R-c08-12 (2026-11-22 사용자 결정 b) — 고가주택·고가 입주권 안분(영 §160①)의 합계와 분기 배분.
 *
 * 합계 = 분기 양도차익 합 × (양도가액 − 기준금액) ÷ 양도가액을 한 번 내림한 값(= 안분 박스의 「과세대상 양도차익」).
 * 분기 = 각 분기를 내림한 뒤 남은 원을 나머지가 큰 분기부터 1원씩(동률은 인가전 → 인가후 → 청산금).
 *
 * 종전에는 분기마다 내림해 합산해서 하단 「합계 양도차익」(total.gain)이 안분 박스(highValueAllocation.taxableGain)보다
 * 1원 작았다(실측 148,148,147 vs 148,148,148).
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { applyHighValueAllocation } from "@/lib/tax-engine/transfer-tax-redevelopment-lthd";
import { prorateBranchGains } from "@/lib/tax-engine/transfer-tax-redevelopment-lthd";
import type {
  RedevelopmentBranchDetail,
  RedevelopmentInfo,
  RedevelopmentResult,
} from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";

const TRANSFER_DATE = new Date("2023-02-16"); // 기준금액 12억 구간
const PRICE_18 = 1_800_000_000; // 비율 (18억 − 12억) / 18억 = 1/3

function branch(gain: number, lthdRate = 0): RedevelopmentBranchDetail {
  return { gain, lthd: 0, lthdRate, holdingMonths: 0, apportionedTransfer: 0, apportionedAcquisition: 0 } as unknown as RedevelopmentBranchDetail;
}

function raw(pre: number, post: number, settlement: number): RedevelopmentResult {
  return {
    preApproval: branch(pre, 0.6),
    postApprovalExistingHouse: branch(post, 0.6),
    settlement: branch(settlement, 0.18),
    total: { gain: pre + post + settlement, lthd: 0, taxableIncome: pre + post + settlement },
  } as unknown as RedevelopmentResult;
}

const aptInfo = { subject: "apt", settlementDirection: "pay" } as unknown as RedevelopmentInfo;

describe("prorateBranchGains — 합계 먼저 · 분기 최대잉여 배분", () => {
  it("리뷰 실측 시료 — 인가전 333,333,335 · 인가후 111,111,110 · 1/3 → 합계 148,148,148, 나머지 동률이면 인가전이 1원", () => {
    const r = prorateBranchGains([333_333_335, 111_111_110], 600_000_000, PRICE_18);
    expect(r.total).toBe(148_148_148);
    expect(r.shares).toEqual([111_111_112, 37_037_036]);
  });

  it("나머지가 큰 분기가 먼저 받는다 — 배열 순서가 아니다", () => {
    // 300,000,001/3 나머지 1 · 300,000,001/3 나머지 1 · 100,000,001/3 나머지 2 → 남은 1원은 청산금
    const r = prorateBranchGains([300_000_001, 300_000_001, 100_000_001], 600_000_000, PRICE_18);
    expect(r.total).toBe(233_333_334);
    expect(r.shares).toEqual([100_000_000, 100_000_000, 33_333_334]);
  });

  it("차손 분기 — 내림은 음의 무한대 방향, 분기 합 = 합계", () => {
    // −100,000,001/3 = −33,333,333.67 → −33,333,334 · 400,000,000/3 → 133,333,333 · 합계 299,999,999/3 → 99,999,999
    const r = prorateBranchGains([-100_000_001, 400_000_000], 600_000_000, PRICE_18);
    expect(r.total).toBe(99_999_999);
    expect(r.shares).toEqual([-33_333_334, 133_333_333]);
  });

  it("곱이 2^53을 넘어도 정수로 정확하다", () => {
    // 9,000,000,000,002 × 6억 ≈ 5.4 × 10^21. 분기 나머지 2/3씩 → 합계 18,000,000,000,004/3 = 6,000,000,000,001.33 → 남은 1원은 인가전
    const r = prorateBranchGains([9_000_000_000_002, 9_000_000_000_002], 600_000_000, PRICE_18);
    expect(r.total).toBe(6_000_000_000_001);
    expect(r.shares).toEqual([3_000_000_000_001, 3_000_000_000_000]);
  });
});

describe("applyHighValueAllocation — 하단 합계(total.gain) = 안분 박스(highValueAllocation.taxableGain)", () => {
  it("리뷰 실측 시료 — 18억 · 인가전 333,333,335 · 인가후 111,111,110 → 148,148,148 (종전 148,148,147)", () => {
    const r = applyHighValueAllocation(raw(333_333_335, 111_111_110, 0), PRICE_18, aptInfo, TRANSFER_DATE);
    expect(r.preApproval.gain).toBe(111_111_112);
    expect(r.postApprovalExistingHouse.gain).toBe(37_037_036);
    expect(r.settlement.gain).toBe(0);
    expect(r.total.gain).toBe(148_148_148);
    expect(r.highValueAllocation?.taxableGain).toBe(148_148_148);
    expect(r.highValueAllocation?.nontaxableGain).toBe(444_444_445 - 148_148_148);
    // 분기 비과세 = 안분 전 − 과세대상
    expect(r.preApproval.nontaxableGain).toBe(333_333_335 - 111_111_112);
  });

  it("세 분기 — 남은 1원은 나머지가 큰 청산금 분기로", () => {
    const r = applyHighValueAllocation(raw(300_000_001, 300_000_001, 100_000_001), PRICE_18, aptInfo, TRANSFER_DATE);
    expect([r.preApproval.gain, r.postApprovalExistingHouse.gain, r.settlement.gain]).toEqual([100_000_000, 100_000_000, 33_333_334]);
    expect(r.total.gain).toBe(233_333_334);
    expect(r.highValueAllocation?.taxableGain).toBe(r.total.gain);
    // 공제 = 분기 안분 후 양도차익 × 공제율 (청산금 33,333,334 × 18% = 6,000,000.12 → 6,000,000)
    expect(r.settlement.lthd).toBe(6_000_000);
  });

  it("청산금 수령 방향(keepSettlement) — 청산금 분기는 배분 대상이 아니고 합계도 신축주택분만", () => {
    const r = applyHighValueAllocation(raw(333_333_335, 111_111_110, 50_000_001), PRICE_18, aptInfo, TRANSFER_DATE, true);
    expect(r.preApproval.gain).toBe(111_111_112);
    expect(r.postApprovalExistingHouse.gain).toBe(37_037_036);
    expect(r.settlement.gain).toBe(50_000_001);
    expect(r.highValueAllocation?.taxableGain).toBe(148_148_148);
    expect(r.highValueAllocation?.nontaxableGain).toBe(444_444_445 - 148_148_148);
    expect(r.total.gain).toBe(148_148_148 + 50_000_001);
  });

  it("차손 분기가 섞여도 분기 합 = 안분 박스 (종전 100,000,000 vs 99,999,999)", () => {
    const r = applyHighValueAllocation(raw(-100_000_001, 400_000_000, 0), PRICE_18, aptInfo, TRANSFER_DATE);
    expect(r.preApproval.gain).toBe(-33_333_334);
    expect(r.postApprovalExistingHouse.gain).toBe(133_333_333);
    expect(r.total.gain).toBe(99_999_999);
    expect(r.highValueAllocation?.taxableGain).toBe(99_999_999);
  });
});

describe("1입주권 안분(applyOneRightExemption) — 같은 규약", () => {
  // case-redev-right-12억-1house.test.ts R-3 fixture에서 양도가액 18억 · 취득가액 100,000,001 · 청산금 90,000,001로 나머지를 만든다.
  const result = calculateTransferTax(
    baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: PRICE_18,
      transferDate: new Date("2023-03-02"),
      acquisitionDate: new Date("2002-04-09"),
      acquisitionPrice: 100_000_001,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      householdRightCount: 1,
      residencePeriodMonths: 24,
      householdNoPresaleRightsConfirmed: true,
      redevelopment: {
        subject: "right",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2018-10-23"),
        rightsValue: 300_000_000,
        settlementDirection: "pay",
        settlementAmount: 90_000_001,
        preApprovalExpenses: 0,
        postApprovalExpenses: 0,
        originalAssetType: "housing",
        exemptionEligibleAtApproval: true,
        otherHouseAcquisitionDate: new Date("2021-06-01"),
      },
    }),
    makeMockRates(),
  );
  const d = result.redevelopmentDetail!;

  it("안분 전 — 인가전 199,999,999 · 인가후(청산금 분기 자리) 1,409,999,999", () => {
    expect(d.oneRightHighValueApplied).toBe(true);
    expect(d.preApproval.gainBeforeAllocation).toBe(199_999_999);
    expect(d.settlement.gainBeforeAllocation).toBe(1_409_999_999);
  });

  it("합계 536,666,666 = 안분 박스 · 나머지 큰 청산금 분기가 1원 (종전 분기 합 536,666,665)", () => {
    expect(d.preApproval.gain).toBe(66_666_666);
    expect(d.settlement.gain).toBe(470_000_000);
    expect(d.total.gain).toBe(536_666_666);
    expect(d.highValueAllocation?.taxableGain).toBe(536_666_666);
    expect(d.highValueAllocation?.nontaxableGain).toBe(1_609_999_998 - 536_666_666);
  });

  it("세액 — 산출세액 174,970,000 · 지방소득세 17,497,000 (종전 174,969,999 · 17,496,999)", () => {
    expect(result.taxBase).toBe(502_166_667);
    expect(result.calculatedTax).toBe(174_970_000);
    expect(result.localIncomeTax).toBe(17_497_000);
  });
});
