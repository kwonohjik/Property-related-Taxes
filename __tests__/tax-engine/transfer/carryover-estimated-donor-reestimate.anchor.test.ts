/**
 * anchor — 이월과세 환산 donor 시나리오 A 의 «엔진 재환산» 전제 (PR-0b)
 *
 * 계획서: docs/00-pm/gb-card-built-penalty-114-2.plan.md §15
 *
 * `calcCarryoverScenarios`는 환산 donor 의 A 입력에 `acquisitionPrice: 0`을 두고 엔진이 재환산하길 기대한다.
 * 단건 주택·건물은 최상위 `useEstimatedAcquisition:true`(폼의 `isCarryoverGeneral`)라 성립하고, 일반건물 카드(aggregate 경로)는
 * false 라 성립하지 않았다. 수정은 «환산 donor ∧ 환산 입력(증여자 취득시·양도시 기준시가) 있음»이면 A 입력의 플래그를 켠다.
 * 이 파일은 **현행 결과가 바뀌면 안 되는 단건 셀**을 숫자로 고정한다(수정 전 격자 288셀에서 채취).
 *
 * 손계산(주택, 양도가 10억 · donor 취득시 기준시가 2억 · 양도시 4억): 환산취득가 = 1,000,000,000 × 200,000,000 / 400,000,000 = 500,000,000
 *   개산공제 = 200,000,000 × 3% = 6,000,000 → 양도차익 = 1,000,000,000 − 500,000,000 − 6,000,000 = 494,000,000
 *   증여세 30,000,000 가산 → 464,000,000
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { PHD_INPUT, PHD_TRANSFER_PRICE } from "../transfer-tax/_helpers/pre-housing-disclosure-fixture";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function run(opts: { raw: boolean; kind: "actual" | "est"; gift?: number; capex?: number; pt?: "housing" | "building"; card?: boolean; noStd?: boolean }) {
  const ct = {
    giftRegistryDate: D("2024-05-01"), donorAcquisitionDate: D("2015-01-01"),
    useEstimatedAcquisition: opts.kind !== "actual", giftTaxAmount: opts.gift ?? 0, giftDateValuation: 800_000_000,
    donorAcquisitionPrice: opts.kind === "actual" ? 60_000_000 : 0,
  };
  const over: Record<string, unknown> = {
    propertyType: opts.pt ?? "housing", isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    transferPrice: 1_000_000_000, transferDate: D("2026-03-01"), acquisitionPrice: 0, acquisitionDate: D("2024-05-01"),
    useEstimatedAcquisition: opts.raw && opts.kind !== "actual",
    standardPriceAtAcquisition: opts.noStd ? undefined : 200_000_000, standardPriceAtTransfer: opts.noStd ? undefined : 400_000_000,
    // 일반건물 카드 표지 — aggregate 경로의 카드는 이 값을 항상 boolean 으로 싣는다(`buildProperties`)
    ...(opts.card ? { usedEstimatedAcquisition: true } : {}),
    capitalExpenditure: opts.capex, acquisitionCause: "carryover_gift", carryoverTaxation: ct,
  };
  return calculateTransferTax(baseTransferInput(over as never), rates);
}

describe("PR-0b 환산 donor 시나리오 A — 재환산 전제", () => {
  it("R1 단건 주택(최상위 true · 현행 정본) 증여세 0 → 양도차익 494,000,000 (불변)", () => {
    const r = run({ raw: true, kind: "est" });
    expect(r.carryoverTaxationDetail?.scenarioA.transferGain).toBe(494_000_000);
    expect(r.determinedTax).toBe(127_188_000);
  });

  it("R2 단건 주택 증여세 3천만 → 양도차익 464,000,000 · 채택 B (불변)", () => {
    const r = run({ raw: true, kind: "est", gift: 30_000_000 });
    expect(r.carryoverTaxationDetail?.scenarioA.transferGain).toBe(464_000_000);
    expect(r.carryoverTaxationDetail?.adoptedScenario).toBe("B");
    expect(r.determinedTax).toBe(118_500_000);
  });

  it("R3 범위 밖 고정 — 최상위 false 로 오는 단건 API 직접 호출·컴패니언은 이번 수정이 건드리지 않는다 (Q-16)", () => {
    // 같은 결함(환산 donor 인데 재환산 안 됨)이 있으나 현행 결과가 바뀌므로 수정하지 않았다. 수정하면 이 단언을 뒤집는다.
    const direct = run({ raw: false, kind: "est" });
    expect(direct.carryoverTaxationDetail?.scenarioA.transferGain).toBe(1_000_000_000);
    expect(direct.determinedTax).toBe(290_610_000);
    const direct30 = run({ raw: false, kind: "est", gift: 30_000_000 });
    expect(direct30.carryoverTaxationDetail?.scenarioA.transferGain).toBe(470_000_000);
    expect(direct30.determinedTax).toBe(119_700_000);
  });

  it("R4 §97②2호 단서 swap(자본적지출 6억 > 환산취득가 5억 + 개산공제 600만) — 단건 불변", () => {
    const r = run({ raw: true, kind: "est", capex: 600_000_000 });
    expect(r.carryoverTaxationDetail?.scenarioA.transferGain).toBe(400_000_000);
    expect(r.determinedTax).toBe(97_860_000);
  });

  it("R5 실가 donor 는 환산 입력(기준시가)이 함께 와도 재환산하지 않는다 — 취득가액 6천만 · 양도차익 940,000,000 (불변)", () => {
    for (const raw of [true, false]) {
      const r = run({ raw, kind: "actual" });
      expect(r.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(60_000_000);
      expect(r.carryoverTaxationDetail?.scenarioA.transferGain).toBe(940_000_000);
      expect(r.determinedTax).toBe(270_954_000);
    }
  });

  /**
   * R6 정정(계획서 `carryover-phd-owner-split-residuals.plan.md` PHD-1) — 종전 R6 「PHD 환산은 자체 환산이라 건드리지 않는다 · 494,000,000」은
   * 토지 취득일이 없어 PHD 경로(`phdSplitPathTaken`)를 타지 않고 **함께 넣은 일반 기준시가**로 환산한 값을 고정했다(픽스처 PHD 칸도 형식 값 1). 실제 PHD donor는
   * 취득가액 0(양도차익 = 양도가액)이었다. 이제 시나리오 A가 매매 PHD와 같은 3시점 환산 경로를 탄다 — 실제 PHD 픽스처로 매매 대조값과 같은지 본다.
   */
  it("R6 PHD 환산 donor — 시나리오 A = 매매 PHD 같은 날짜 대조값(147,580,813)", () => {
    const common = {
      propertyType: "housing", transferPrice: PHD_TRANSFER_PRICE, transferDate: D("2023-02-16"), acquisitionPrice: 0, expenses: 0,
      isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0, landSplitMode: "apportioned", preHousingDisclosure: PHD_INPUT,
    };
    const purchase = calculateTransferTax(baseTransferInput({
      ...common, acquisitionCause: "purchase", acquisitionDate: D("2014-09-14"), landAcquisitionDate: D("2014-09-14"), useEstimatedAcquisition: true,
    } as never), rates);
    const carry = calculateTransferTax(baseTransferInput({
      ...common, acquisitionCause: "carryover_gift", acquisitionDate: D("2020-01-01"), useEstimatedAcquisition: false,
      carryoverTaxation: { giftRegistryDate: D("2020-01-01"), donorAcquisitionDate: D("2014-09-14"), useEstimatedAcquisition: true, giftTaxAmount: 0, giftDateValuation: 600_000_000 },
    } as never), rates);
    expect(purchase.transferGain).toBe(147_580_813);
    expect(carry.carryoverTaxationDetail?.scenarioA.transferGain).toBe(147_580_813);
  });

  it("R7 환산 입력(증여자 취득시 기준시가)이 없으면 켜지 않는다 — 입력을 지어내지 않는다", () => {
    const ct = { giftRegistryDate: D("2024-05-01"), donorAcquisitionDate: D("2015-01-01"), useEstimatedAcquisition: true, giftTaxAmount: 0, giftDateValuation: 800_000_000, donorAcquisitionPrice: 0 };
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
        transferPrice: 1_000_000_000, transferDate: D("2026-03-01"), acquisitionPrice: 0, acquisitionDate: D("2024-05-01"),
        useEstimatedAcquisition: false, acquisitionCause: "carryover_gift", carryoverTaxation: ct,
      } as never),
      rates,
    );
    // 종전과 같다: 플래그를 켜지 않으므로 환산 분기에 들어가지 않고 취득가액 0 그대로(⑧이 먼저 막는 입력)
    expect(r.carryoverTaxationDetail?.scenarioA.transferGain).toBe(1_000_000_000);
  });
  it("R8 카드 표지가 있어도 환산 입력(기준시가)이 없으면 켜지 않는다 — 입력을 지어내지 않는다 (불변)", () => {
    const r = run({ raw: false, kind: "est", card: true, noStd: true });
    expect(r.carryoverTaxationDetail?.scenarioA.transferGain).toBe(1_000_000_000);
  });

  it("R9 카드 표지가 있어도 실가 donor 는 재환산하지 않는다 — 취득가액 6천만 · 양도차익 940,000,000", () => {
    const r = run({ raw: false, kind: "actual", card: true });
    expect(r.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(60_000_000);
    expect(r.carryoverTaxationDetail?.scenarioA.transferGain).toBe(940_000_000);
  });

  it("R10 카드 표지 + 환산 donor + 기준시가 → 단건 최상위 true 와 같은 값 (카드가 단건과 같은 규약으로 환산된다)", () => {
    const card = run({ raw: false, kind: "est", card: true });
    const form = run({ raw: true, kind: "est" });
    expect(card.carryoverTaxationDetail?.scenarioA.transferGain).toBe(494_000_000);
    expect(card.determinedTax).toBe(form.determinedTax);
    const card30 = run({ raw: false, kind: "est", card: true, gift: 30_000_000 });
    const form30 = run({ raw: true, kind: "est", gift: 30_000_000 });
    expect(card30.carryoverTaxationDetail?.scenarioA.transferGain).toBe(form30.carryoverTaxationDetail?.scenarioA.transferGain);
    expect(card30.determinedTax).toBe(form30.determinedTax);
    const cardSwap = run({ raw: false, kind: "est", card: true, capex: 600_000_000 });
    expect(cardSwap.carryoverTaxationDetail?.scenarioA.transferGain).toBe(400_000_000);
  });
});
