// D4-05 anchor — §99의4·§98의9 취득순서 요건은 이월과세 시나리오 A에서도 「그 1세대」 기준이다
//
// 조문:
//  · §99의4① 「… 농어촌주택등을 취득 … 하고 그 농어촌주택등 **취득 전에 보유하던** 다른 주택
//    (일반주택)을 양도하는 경우 …」
//  · §98의9① 「… 준공후미분양주택을 **취득하기 전에 보유한** 주택을 양도하는 경우 …」
//  두 조문 모두 보유 주체는 **1세대**다.
//
// 소득세법 §97의2①(이월과세)은 「양도차익을 계산할 때 취득가액은 그 배우자등이 취득할 당시의
// 금액으로 한다」로 **취득가액만** 의제한다 — 보유기간 승계는 §95④·§104②의 별도 명문이고
// 이 요건에는 미치지 않는다. 그런데 STEP 0.9는 시나리오 A 재귀 계산에서 교체된
// `workingInput.acquisitionDate`(= donorAcquisitionDate)를 그대로 넘겨, 세대가 실제로는
// 농어촌주택 취득 뒤에 일반주택을 보유하게 된 경우에도 취득순서 요건이 통과했다.
// STEP 0.45(중과 배제 선판정)는 이미 같은 이유로 원본 `input`을 쓴다.
//
// 배우자 증여는 예외다 — 소득세법 §88 6호가 1세대를 「거주자 및 **그 배우자**가 그들과 같은
// 주소 또는 거소에서 생계를 같이 하는 자와 함께 구성하는 가족단위」로 정의하므로 배우자로부터의
// 증여는 세대가 바뀌지 않는다.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 농어촌주택 취득 2020-05-01 — 수증자 취득(2024-01-15)보다 **앞선다** */
const RURAL = {
  type: "new_99_4_rural" as const,
  ruralHouseAcquisitionDate: new Date("2020-05-01"),
  ruralHouseStdPrice: 200_000_000,
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};

function run(over: Partial<TransferTaxInput> = {}, relation?: "spouse" | "lineal") {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_000_000_000, // 12억 이하 — 주택수 1이면 전액 비과세
      acquisitionPrice: 700_000_000,
      // 수증자(양도자)가 그 주택을 보유하기 시작한 날 — 농어촌주택 취득(2020-05) **뒤**
      acquisitionDate: new Date("2024-01-15"),
      transferDate: new Date("2026-06-01"),
      isOneHousehold: true,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        giftRegistryDate: new Date("2024-01-15"),
        donorAcquisitionDate: new Date("2005-01-01"),
        useEstimatedAcquisition: false,
        donorAcquisitionPrice: 300_000_000,
        giftTaxAmount: 0,
        giftDateValuation: 700_000_000,
        ...(relation ? { donorRelation: relation } : {}),
      },
      reductions: [RURAL],
      ...over,
    }),
    rates,
  );
}

describe("D4-05 이월과세 × §99의4 취득순서 — 판정 기준일", () => {
  it("D4-05-1: 별도세대 직계존비속 증여 — 시나리오 A에서도 취득순서 요건이 불충족이다", () => {
    // ⚠️ 관측 지점이 중요하다. 최상위 `new994Detail`은 **채택된 시나리오**의 것이라
    //    누수가 시나리오 A 재귀 안에 있으면 보이지 않는다 — A가 비과세로 떨어졌는지를 본다.
    const r = run({}, "lineal");
    const d = r.carryoverTaxationDetail;
    expect(d?.scenarioA.determinedTax).toBeGreaterThan(0);
    // A가 허위 비과세가 아니므로 §97의2②2호(1세대1주택 배제)가 걸리지 않는다
    expect(d?.exclusionReason).not.toBe("one_house_exemption");
    expect(d?.isEligible).toBe(true);
    expect(d?.adoptedScenario).toBe("A");
  });

  it("D4-05-2: 종전 누수의 세액 영향 — A 169,060,000이 0으로 무너져 B 93,110,000이 채택됐다", () => {
    const r = run({}, "lineal");
    expect(r.carryoverTaxationDetail?.scenarioA.determinedTax).toBe(169_060_000);
    expect(r.carryoverTaxationDetail?.scenarioB.determinedTax).toBe(93_110_000);
    expect(r.determinedTax).toBe(169_060_000);
    expect(r.totalTax).toBe(185_966_000);
  });

  it("D4-05-3: 관계 미선언도 양도자 본인의 취득일을 기준으로 둔다 (동일세대는 예외 사실)", () => {
    const r = run();
    expect(r.carryoverTaxationDetail?.scenarioA.determinedTax).toBeGreaterThan(0);
    expect(r.carryoverTaxationDetail?.exclusionReason).not.toBe("one_house_exemption");
  });

  it("D4-05-4: 배우자 증여는 세대가 바뀌지 않는다 (소법 §88 6호) → 증여자 취득일(2005-01) 기준 적격", () => {
    const r = run({}, "spouse");
    expect(r.new994Detail?.isEligible).toBe(true);
    // 세대 주택수 2 − 1 = 1 → 1세대1주택 · 양도가 10억 ≤ 12억 → 전액 비과세
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    // 시나리오 A·B 재귀에도 같은 기준이 실려야 한다 — 최상위만 비과세이고 A/B가 과세면
    // 카드의 비교표와 최종 세액이 어긋난다 (이중 진실)
    expect(r.carryoverTaxationDetail?.scenarioA.determinedTax).toBe(0);
    expect(r.carryoverTaxationDetail?.scenarioB.determinedTax).toBe(0);
  });

  it("D4-05-5: 취득순서가 실제로 맞으면 직계존비속 증여도 적격 (과잉차단 방지)", () => {
    // 농어촌주택 취득을 수증자 취득(2024-01-15) 뒤로 옮긴다
    const r = run(
      { reductions: [{ ...RURAL, ruralHouseAcquisitionDate: new Date("2024-06-01") }] },
      "lineal",
    );
    expect(r.new994Detail?.isEligible).toBe(true);
  });

  it("D4-05-6: 비-이월과세 경로는 동작이 바뀌지 않는다 (폴백 동일값)", () => {
    const plain = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2014-01-01"),
        transferDate: new Date("2024-06-01"),
        isOneHousehold: true,
        householdHousingCount: 2,
        residencePeriodMonths: 120,
        reductions: [{ ...RURAL, ruralHouseAcquisitionDate: new Date("2020-05-01") }],
      }),
      rates,
    );
    expect(plain.new994Detail?.isEligible).toBe(true);
    expect(plain.isExempt).toBe(true);
  });
});
