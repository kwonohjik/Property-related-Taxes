/**
 * 청산금 수령분 단독 신고 × 환산 — 「소득세법」 §97②2호 단서 비교 anchor.
 *
 *   가목 = 환산취득가액 + 개산공제 · 나목 = 자본적지출·양도비 등
 *   가목 < 나목이면 나목을 필요경비로 하고 환산취득가액은 차감하지 않는다. 동률은 본문이다(「적은 경우」).
 *
 * 공통 입력: 평가액 120,000,000 · 청산금 20,000,000 · 취득일 기준시가 60,000,000 · 인가일 기준시가 120,000,000
 *   환산취득가액 60,000,000 · 개산공제 1,800,000 ⇒ 가목 61,800,000 · 안분 비율 1/6
 */
import { describe, expect, it } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { computeRedevelopmentSplit } from "@/lib/tax-engine/redevelopment-split";
import { redevFilingTotals } from "@/lib/tax-engine/redev-acquisition-inverse";
import { buildRedevelopmentPayload } from "@/lib/calc/transfer-tax-api-redev";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case46RedevelopmentInfo } from "./_helpers";

const info = (preApprovalExpenses: number, postApprovalExpenses: number) => ({
  ...case46RedevelopmentInfo(),
  rightsValue: 120_000_000,
  settlementAmount: 20_000_000,
  preApprovalExpenses,
  postApprovalExpenses,
  acquisitionHousingPrice: 60_000_000,
  managementDisposalHousingPrice: 120_000_000,
});

function calc(preApprovalExpenses: number, postApprovalExpenses: number, useEstimatedAcquisition = true) {
  const detail = calculateTransferTax(
    baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 20_000_000,
      transferDate: new Date("2023-02-17"),
      acquisitionDate: new Date("2016-05-06"),
      acquisitionPrice: useEstimatedAcquisition ? 0 : 50_000_000,
      expenses: 0,
      useEstimatedAcquisition,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      redevelopment: info(preApprovalExpenses, postApprovalExpenses),
    }),
    makeMockRates(),
  ).redevelopmentDetail;
  if (!detail) throw new Error("redevelopmentDetail 없음");
  return detail;
}

const split = (extra: Partial<Parameters<typeof computeRedevelopmentSplit>[0]>) =>
  computeRedevelopmentSplit({
    redevelopment: info(0, 70_000_000),
    acquisitionDate: new Date("2016-05-06"),
    transferDate: new Date("2023-02-17"),
    transferPrice: 20_000_000,
    useEstimatedAcquisition: true,
    ...extra,
  });

describe("§97②2호 단서 — 청산금 수령분 단독 신고", () => {
  // 70,000,000 − floor(70,000,000 × 100,000,000 ÷ 120,000,000) = 11,666,667 → 20,000,000 − 11,666,667
  it("나목이 크면 나목을 안분해 공제하고 환산취득가액은 차감하지 않는다", () => {
    const d = calc(0, 70_000_000);
    expect(d.settlement.apportionedAcquisition).toBe(0);
    expect(d.settlement.expenses).toBe(11_666_667);
    expect(d.settlement.gain).toBe(8_333_333);
    expect(d.receiveOnlyProvisoComparison).toEqual({ estimatedSide: 61_800_000, directSide: 70_000_000, chosen: "direct" });
  });

  it("인가전 분 칸과 자본적지출·양도비 칸을 합쳐 나목으로 본다", () => {
    const d = calc(30_000_000, 40_000_000);
    expect(d.settlement.gain).toBe(8_333_333);
    expect(d.receiveOnlyProvisoComparison?.directSide).toBe(70_000_000);
  });

  it("동률은 본문이다 — 「적은 경우」만 단서", () => {
    const d = calc(0, 61_800_000);
    expect(d.settlement.apportionedAcquisition).toBe(10_000_000);
    expect(d.settlement.expenses).toBe(300_000);
    expect(d.settlement.gain).toBe(9_700_000);
    expect(d.receiveOnlyProvisoComparison?.chosen).toBe("estimated");
  });

  // 61,800,001 − floor(61,800,001 × 100,000,000 ÷ 120,000,000) = 10,300,001
  it("1원 초과부터 단서다", () => {
    const d = calc(0, 61_800_001);
    expect(d.settlement.apportionedAcquisition).toBe(0);
    expect(d.settlement.expenses).toBe(10_300_001);
    expect(d.settlement.gain).toBe(9_699_999);
  });

  it("나목이 없으면 비교 결과를 싣지 않고 본문으로 계산한다", () => {
    const d = calc(0, 0);
    expect(d.settlement.gain).toBe(9_700_000);
    expect(d.receiveOnlyProvisoComparison).toBeUndefined();
  });

  it("실가 모드에는 단서가 없다", () => {
    const d = calc(0, 70_000_000, false);
    expect(d.settlement.apportionedAcquisition).toBe(8_333_333);
    expect(d.receiveOnlyProvisoComparison).toBeUndefined();
  });

  it("신고서 합계 — 취득가액 0 · 필요경비 안분값으로 자기일관하다", () => {
    const totals = redevFilingTotals(calc(0, 70_000_000), 20_000_000);
    expect(totals.acquisition).toBe(0);
    expect(totals.expenses).toBe(11_666_667);
    expect(totals.gain).toBe(8_333_333);
  });

  // (70,000,000 + 12,000,000) − floor(82,000,000 × 100,000,000 ÷ 120,000,000) = 13,666,667
  it("이월과세 증여세 상당액은 비교 밖의 독립 항이다", () => {
    const r = split({ carryoverGiftTaxExpense: 12_000_000 });
    expect(r.receiveOnlyProvisoComparison).toEqual({ estimatedSide: 61_800_000, directSide: 70_000_000, chosen: "direct" });
    expect(r.settlement.gain).toBe(6_333_333);
    expect(r.carryoverGiftTaxApplied).toBe(2_000_000);
  });

  // 평가액 − 나목 = 50,000,000이 한도 — 60,000,000 중 50,000,000만 산입
  // 120,000,000 − floor(120,000,000 × 100,000,000 ÷ 120,000,000) = 20,000,000
  it("단서를 고르면 증여세 한도도 나목 기준이다", () => {
    const r = split({ carryoverGiftTaxExpense: 60_000_000 });
    expect(r.carryoverGiftTaxCap).toBe(50_000_000);
    expect(r.settlement.gain).toBe(0);
  });

  it("부담부증여는 비교하지 않는다 — 채무비율 안분 후 나목의 범위가 정해지지 않았다", () => {
    const r = split({ debtFraction: { debt: 1, valuation: 2 } });
    expect(r.receiveOnlyProvisoComparison).toBeUndefined();
    expect(r.settlement.apportionedAcquisition).toBe(10_000_000);
  });
});

describe("§97②2호 단서 — 입력 축", () => {
  it("토지 출자도 §166③ 환산이라 같은 비교를 한다", () => {
    const r = split({
      redevelopment: {
        ...info(0, 70_000_000),
        originalAssetType: "land",
        landStdPriceAtAcq: 60_000_000,
        landStdPriceAtApproval: 120_000_000,
      },
    });
    expect(r.receiveOnlyProvisoComparison?.chosen).toBe("direct");
    expect(r.settlement.gain).toBe(8_333_333);
  });

  // 평가액 2,000,000,000 · 청산금 1,500,000,000 · 가목 412,000,000 < 나목 900,000,000
  // 양도차익 1,500,000,000 − 675,000,000 = 825,000,000 → 12억 초과분 × 800,000,000 ÷ 2,000,000,000 = 330,000,000
  it("1세대1주택 고가 안분은 단서를 적용한 양도차익 위에서 한다", () => {
    const d = calculateTransferTax(
      baseTransferInput({
        propertyType: "redevelopment_apt",
        transferPrice: 1_500_000_000,
        transferDate: new Date("2023-02-17"),
        acquisitionDate: new Date("2002-04-09"),
        acquisitionPrice: 0,
        expenses: 0,
        useEstimatedAcquisition: true,
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
        redevelopment: {
          ...info(0, 900_000_000),
          rightsValue: 2_000_000_000,
          settlementAmount: 1_500_000_000,
          acquisitionHousingPrice: 400_000_000,
          managementDisposalHousingPrice: 2_000_000_000,
          exemptionEligibleAtApproval: true,
        },
      }),
      makeMockRates(),
    ).redevelopmentDetail!;
    expect(d.receiveOnlyProvisoComparison).toEqual({ estimatedSide: 412_000_000, directSide: 900_000_000, chosen: "direct" });
    expect(d.settlement.expenses).toBe(675_000_000);
    expect(d.settlement.gainBeforeAllocation).toBe(825_000_000);
    expect(d.settlement.gain).toBe(330_000_000);
  });
});

describe("API 변환 — 숨은 인가전 분 칸이 나목에 들어가지 않는다", () => {
  const asset = (over: Partial<AssetForm>) =>
    ({
      assetKind: "redevelopment_apt",
      redevSubject: "apt",
      redevSettlementDirection: "receive",
      redevReceiveOnlyMode: "yes",
      redevRightsValue: "120,000,000",
      redevSettlementAmount: "20,000,000",
      redevPreApprovalExpenses: "70,000,000",
      capitalExpenditure: "",
      transferExpense: "",
      useEstimatedAcquisition: true,
      ...over,
    }) as AssetForm;

  it("환산이면 칸이 숨으므로 저장값을 보내지 않는다", () => {
    expect(buildRedevelopmentPayload(asset({})).preApprovalExpenses).toBe(0);
  });

  it("실가면 칸이 보이므로 그대로 보낸다", () => {
    expect(buildRedevelopmentPayload(asset({ useEstimatedAcquisition: false })).preApprovalExpenses).toBe(70_000_000);
  });

  it("감정·매매사례 플래그가 남아 환산으로 보내지 않는 자산은 칸 값을 지우지 않는다", () => {
    expect(buildRedevelopmentPayload(asset({ isAppraisalAcquisition: true })).preApprovalExpenses).toBe(70_000_000);
    expect(buildRedevelopmentPayload(asset({ isSalesCaseAcquisition: true })).preApprovalExpenses).toBe(70_000_000);
  });

  it("공유지분이면 칸 값이 지분율로 들어가 나목도 지분 기준이다", () => {
    const p = buildRedevelopmentPayload(asset({ capitalExpenditure: "200,000,000" }), 0.5);
    expect(p.rightsValue).toBe(60_000_000);
    expect(p.preApprovalExpenses).toBe(0);
    expect(p.postApprovalExpenses).toBe(100_000_000);
  });

  it("동시신고는 종전과 같다", () => {
    expect(buildRedevelopmentPayload(asset({ redevReceiveOnlyMode: "no" })).preApprovalExpenses).toBe(70_000_000);
  });
});
