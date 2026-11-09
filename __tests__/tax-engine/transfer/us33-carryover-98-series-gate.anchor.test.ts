/**
 * anchor: 이월과세(배우자·직계 증여) × §98 시리즈 — 증여 승계취득은 배제한다 (리뷰 US-33 · 사용자 결정 Q-12 (a), 2026-11-08)
 *
 * 리뷰 US-33은 「이월과세 시나리오 A는 §98 시리즈를 증여자 취득일로, 채택 뒤 본 계산은 수증자 취득일로 판정해 비교에 쓴 결정세액과
 * 최종 세액이 서로 다른 감면 효과를 쓴다」였다. 증여 승계취득을 배제하면(#2953 「전 조문 차단」을 이월과세 경로에도 적용) 기준일 축이 갈릴 일이
 * 없다 — 시나리오 A·B·본 계산이 모두 같은 입력(감면 없음)으로 판정한다. 이 파일은 그 세 군데를 고정한다.
 *
 *  · 엔진: 원 입력 `carryover_gift`, 시나리오 A 입력 `gift`, 시나리오 B 입력(`reductionAcquisitionCause`) 모두 진입부 게이트에 걸린다.
 *  · 집계(일괄양도·다건): 자산마다 단건 엔진을 부르므로 같은 결과다.
 *  · ⑧: 이월과세 자산에 §98 시리즈를 고르면 막는다(수증자 취득일 5년 판정으로 가기 전에).
 *
 * 값은 mock 세율 기준. 배우자 지분 증여 예외(기준-2025-법규재산-0033 — 부부 공동 최초계약 후 지분 증여)는 이 코드에 구현이 없다 —
 * 그 경우는 취득 원인을 매매(공동 최초 계약자)로 입력해 게이트 밖에서 다룬다. 지분 증여분의 입력 방법은 확인 필요.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const R985 = {
  type: "unsold_98_5" as const,
  contractDate985: D("2010-06-01"),
  priceReductionRatePct985: 15,
  isNonCapitalUnsoldAtCutoff985: true,
  isFirstContract985: true,
  isNotOccupiedAtContract985: true,
  isNotRecontract985: true,
  standardPriceAtAcquisition985: 200_000_000,
  standardPriceAt5Years985: 300_000_000,
  standardPriceAtTransfer985: 400_000_000,
};
const R98 = {
  type: "unsold_98" as const,
  contractDate98: D("1996-06-01"),
  isResident98: true,
  isNationalScale98: true,
  isOutsideSeoul98: true,
  isUnsoldConfirmed98: true,
  isNotRentalHousing98: true,
  isFirstBuyerNoOccupancy98: true,
  rentedFor5Years98: true,
};
const ct = (donorAcq: string) => ({
  giftRegistryDate: D("2022-06-01"),
  donorAcquisitionDate: D(donorAcq),
  useEstimatedAcquisition: false,
  donorAcquisitionPrice: 400_000_000,
  giftTaxAmount: 0,
  giftDateValuation: 600_000_000,
  donorRelation: "spouse",
});
const mk = (reductions: unknown[], cause: "carryover_gift" | "purchase", donorAcq: string, regulated = false) =>
  baseTransferInput({
    transferPrice: 900_000_000,
    acquisitionPrice: 600_000_000,
    acquisitionDate: D("2022-06-01"),
    transferDate: D("2026-03-02"),
    householdHousingCount: 2,
    isRegulatedArea: regulated,
    isOneHousehold: false,
    reductions,
    acquisitionCause: cause,
    carryoverTaxation: cause === "carryover_gift" ? ct(donorAcq) : undefined,
  } as unknown as Partial<TransferTaxInput>);

const CASES = [
  ["§98의5", R985, "2011-03-15"],
  ["§98", R98, "1997-06-01"],
] as const;

describe("US-33 엔진 — 이월과세 시나리오 A·B·본 계산이 모두 감면 없는 대조와 같다", () => {
  for (const regulated of [false, true]) {
    for (const [label, red, donor] of CASES) {
      it(`${label} · 조정대상지역=${regulated}: 총부담·A·B 결정세액 = 감면 없는 대조 (종전 §98 노선에서는 A/B/본 계산이 갈렸다)`, () => {
        const w = calculateTransferTax(mk([red], "carryover_gift", donor, regulated), rates);
        const c = calculateTransferTax(mk([], "carryover_gift", donor, regulated), rates);
        expect(w.totalTax).toBe(c.totalTax);
        expect(w.carryoverTaxationDetail?.scenarioA?.determinedTax).toBe(c.carryoverTaxationDetail?.scenarioA?.determinedTax);
        expect(w.carryoverTaxationDetail?.scenarioB?.determinedTax).toBe(c.carryoverTaxationDetail?.scenarioB?.determinedTax);
        expect(w.carryoverTaxationDetail?.adoptedScenario).toBe(c.carryoverTaxationDetail?.adoptedScenario);
        expect(w.reductionAmount).toBe(0);
        expect(w.warnings?.some((x) => x.includes("증여(이월과세 대상 증여)로 취득한 주택"))).toBe(true);
      });
    }
  }

  it("원 값 고정 — §98 노선(증여자 1997-06-01 취득): A 113,060,000 · B 86,270,000 · 총부담 124,366,000 (비과세·감면 모두 없음)", () => {
    const w = calculateTransferTax(mk([R98], "carryover_gift", "1997-06-01"), rates);
    expect(w.carryoverTaxationDetail?.scenarioA?.determinedTax).toBe(113_060_000);
    expect(w.carryoverTaxationDetail?.scenarioB?.determinedTax).toBe(86_270_000);
    expect(w.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(w.totalTax).toBe(124_366_000);
  });

  it("대조군 — 같은 사실이 매매 취득이면 §98 감면이 적용된다 (94,897,000)", () => {
    const p = calculateTransferTax(mk([R98], "purchase", "1997-06-01"), rates);
    expect(p.totalTax).toBe(94_897_000);
  });
});

describe("US-33 집계 — 일괄양도·다건도 단건 엔진 게이트를 그대로 탄다", () => {
  it("이월과세 자산 + §98 선택 = 선택하지 않은 집계와 같다", () => {
    const run = (reductions: unknown[]) =>
      calculateTransferTaxAggregate(
        {
          taxYear: 2026,
          annualBasicDeductionUsed: 0,
          properties: [{ ...(mk(reductions, "carryover_gift", "1997-06-01") as object), propertyId: "p1", propertyLabel: "p1" } as never],
        },
        rates,
      );
    expect(run([R98]).totalTax).toBe(run([]).totalTax);
  });
});

describe("US-33 ⑧ — 이월과세 자산에서 §98 시리즈 선택은 수증자 취득일 5년 판정에 이르기 전에 막힌다", () => {
  it("§98의7 선택 + 취득 원인 이월과세 증여 → 증여 승계취득 사유로 차단 (감면 선택 해제 안내)", () => {
    const form = createDefaultTransferFormData();
    form.transferDate = "2026-03-02";
    form.assets[0] = {
      ...form.assets[0],
      acquisitionCause: "carryover_gift",
      acquisitionDate: "2022-06-01",
      reductions: [{ type: "unsold_98_7", contractDate987: "2012-10-15" } as never],
    };
    const msg = validateStep(2, form);
    expect(msg).toContain("감면 선택을 해제");
  });
});
