/**
 * anchor F19 — 겸용주택 §97②2호 **단서**는 「환산취득가액으로 하는 경우」 한정이다.
 *              감정가액·매매사례가액(`useAppraisalSalesAcquisition`)에는 발동하지 않는다.
 *
 * ── 조문 ─────────────────────────────────────────────────────────────────
 * 「소득세법」 제97조 제2항 제2호 **단서**: 「다만, 제1항제1호나목에 따라 취득가액을
 * **환산취득가액**으로 하는 경우로서 가목의 금액이 나목의 금액보다 적은 경우에는
 * 나목의 금액을 필요경비로 할 수 있다.」
 *
 * 감정가액·매매사례가액은 「소득세법 시행령」 §176의2②③에 따른 **같은 호 본문**의 갈래이지
 * 환산취득가액이 아니다. 겸용의 감정·매매사례 경로는 취득가액 **총액**을 법 §100②로 안분해
 * **직접 차감**하는 경로라, 단서가 발동하면 그 안분값이 통째로 0이 되어 취득가액이 소멸한다.
 *
 * ── 회귀 원인 ────────────────────────────────────────────────────────────
 * `transfer-tax-mixed-use.ts` `provisoEligible`이 `useActualAcquisition`만 배제하고
 * `useAppraisalSalesAcquisition`을 빠뜨렸다. 기존 anchor(`mixed-use-97-2-proviso` P4)는
 * 실가·상속만 보고 감정·매매사례를 **한 번도 쓰지 않아** 교차 커버리지가 0이었다.
 *
 * ── 실측(엔진 직접 호출) ──────────────────────────────────────────────────
 * 겸용 양도가 15억 · 양도 2024-03-01 · 취득 2009-03-01 · 주거 60㎡/비주거 40㎡ · 토지 100㎡
 * 다주택(isOneHouseExempt=false) · 감정가액 총액 5억
 *   수정 전: proviso={506,600,000 / 900,000,000 / "direct"} · 취득가액 5억→**0** ·
 *            totalPayable **160,446,000**
 *   수정 후: proviso=undefined · 취득가액 500,000,000 유지 · totalPayable **289,755,577**
 *   ⇒ 129,309,577 과소가 해소된다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2024-03-01");
const TRANSFER_PRICE = 1_500_000_000;
/** 감정가액·매매사례가액 총액 (§176의2②③). */
const APPRAISAL_TOTAL = 500_000_000;
/** 환산 모드였다면 단서를 깨웠을 크기의 나목. */
const HUGE_NAMOK = 900_000_000;

function makeAsset(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: new Date("2009-03-01"),
    buildingAcquisitionDate: new Date("2009-03-01"),
    transferStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 2_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 150_000_000,
      commercialBuildingPrice: 30_000_000,
      landPricePerSqm: 1_000_000,
    },
    residencePeriodYears: 10,
    zoneType: "general_residential",
    isOneHouseExempt: false,
    ...over,
  } as MixedUseAssetInput;
}

function run(over: Partial<MixedUseAssetInput> = {}) {
  const r = calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, makeAsset(over), rates);
  const h = r.housingPart;
  const c = r.commercialPart;
  return {
    proviso: r.necessaryExpenseProviso,
    acqTotal: h.landAcqPrice + h.buildingAcqPrice + c.landAcqPrice + c.buildingAcqPrice,
    dedTotal:
      h.landAppraisalDed + h.buildingAppraisalDed + c.landAppraisalDed + c.buildingAppraisalDed,
    aggregateIncome: r.total.aggregateIncome,
    totalPayable: r.total.totalPayable,
    route: r.calculationRoute.acquisitionConversionRoute,
  };
}

const appraisal = (over: Partial<MixedUseAssetInput> = {}) =>
  run({
    useAppraisalSalesAcquisition: true,
    acquisitionActualTotalPrice: APPRAISAL_TOTAL,
    ...over,
  });

describe("F19 — 감정가액·매매사례가액 모드는 §97②2호 단서 대상이 아니다", () => {
  it("🔴 거대 나목(자본적지출 9억)을 넣어도 단서가 발동하지 않는다", () => {
    const r = appraisal({ capitalExpenditure: HUGE_NAMOK });
    expect(r.route).toBe("section176_2_appraisal_sales");
    expect(r.proviso).toBeUndefined();
    // 안분 취득가액 5억이 살아 있어야 한다 — 발동 시 통째로 0이 됐다.
    expect(r.acqTotal).toBe(APPRAISAL_TOTAL);
    // 개산공제(§163⑥) 유지 — 발동 시 900,000,000으로 뒤바뀌었다.
    expect(r.dedTotal).toBe(6_600_000);
    expect(r.totalPayable).toBe(289_755_577);
  });

  it("🔴 자본적지출 + 양도비 조합에서도 미발동 — 세액이 실비 미입력 기준선과 같다", () => {
    const baseline = appraisal();
    const withExpenses = appraisal({
      capitalExpenditure: HUGE_NAMOK,
      transferExpense: 10_000_000,
    });
    expect(baseline.totalPayable).toBe(289_755_577);
    expect(withExpenses.totalPayable).toBe(baseline.totalPayable);
    expect(withExpenses.proviso).toBeUndefined();
    expect(withExpenses.acqTotal).toBe(APPRAISAL_TOTAL);
  });

  it("나목이 가목보다 작아도 마찬가지로 비교 자체가 없다(proviso 미기록)", () => {
    const r = appraisal({ capitalExpenditure: 100_000_000 });
    expect(r.proviso).toBeUndefined();
    expect(r.totalPayable).toBe(289_755_577);
  });
});

describe("F19 — 게이트가 과잉 차단하지 않는다(대조군)", () => {
  it("환산(§97②2호 본문) 모드에서는 같은 실비로 단서가 정상 발동한다", () => {
    const r = run({ capitalExpenditure: HUGE_NAMOK });
    expect(r.route).toBe("section97_direct");
    expect(r.proviso).toEqual({
      estimatedSide: 694_100_000,
      directSide: HUGE_NAMOK,
      chosen: "direct",
    });
    expect(r.acqTotal).toBe(0);
    expect(r.dedTotal).toBe(HUGE_NAMOK);
    expect(r.totalPayable).toBe(160_446_000);
  });

  it("실가(§97①1호가목) 모드는 종전대로 미발동 — 기존 P4 계약 유지", () => {
    const r = run({
      useActualAcquisition: true,
      acquisitionActualTotalPrice: APPRAISAL_TOTAL,
      capitalExpenditure: HUGE_NAMOK,
    });
    expect(r.proviso).toBeUndefined();
    // 실가는 §97②**1호** 가산이라 실비가 필요경비에 그대로 더해진다(취득가액도 유지).
    expect(r.acqTotal).toBe(APPRAISAL_TOTAL);
    expect(r.dedTotal).toBe(HUGE_NAMOK);
    expect(r.totalPayable).toBe(14_915_998);
  });
});
