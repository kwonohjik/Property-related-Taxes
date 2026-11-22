/**
 * RTL — 겸용주택 × 부담부증여 취득가액·필요경비 산식의 「이 부분 몫」 금액 (NIT R-c02-09).
 *
 * 금액은 엔진 echo(`acquisitionBeforeRatio`·`expenseBeforeRatio`) 그대로다 — 화면이 다시 계산하지 않는다.
 * 구 이력(echo 없음)은 금액 없는 종전 문구로 떨어진다. 결과 카드와 상세명세서가 같은 금액을 적는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput, MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { MixedUsePartKey } from "@/lib/tax-engine/types/mixed-use-burdened-gift.types";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

const RATES = makeMockRates() as never;
const TD = new Date("2024-03-01");
const ACQ = new Date("2010-03-15");
const KEYS: MixedUsePartKey[] = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"];

const asset = (over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput =>
  ({
    isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
    landAcquisitionDate: ACQ, buildingAcquisitionDate: ACQ,
    transferStandardPrice: { housingPrice: 600e6, commercialBuildingPrice: 100e6, landPricePerSqm: 5_000_000, housingBuildingPrice: 100e6 },
    acquisitionStandardPrice: { housingPrice: 300e6, commercialBuildingPrice: 50e6, landPricePerSqm: 2_500_000, housingBuildingPrice: 50e6 },
    residencePeriodYears: 0, isMetropolitanArea: true, zoneType: "residential", isOneHouseExempt: false, acquisitionCause: "purchase",
    ...over,
  }) as MixedUseAssetInput;
const info = {
  valuationMode: "sangjeungbeop_market", lendingDepositTotal: 0, mortgageDebtAmount: 600e6, annualRentTotal: 0, marketValueAtTransfer: 1_500_000_000,
  acquisitionMethod: "actual", actualAcquisitionTotal: 700e6, landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 1_200_000_000,
  landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 600e6, donorRelation: "lineal_descendant",
  debtAttribution: { housing: 0, commercial: 0, unallocated: 600e6 }, housingAppraisal: { exists: false },
} as BurdenedGiftInfo;
const calc = (): MixedUseGainBreakdown =>
  calcMixedUseTransferTax(1, TD, { ...asset({ capitalExpenditure: 40_000_000, transferExpense: 10_000_000 } as never), burdenedGift: info }, RATES);
const formData = () =>
  ({ transferDate: "2024-03-01", filingDate: "2024-05-31", assets: [{ ...makeDefaultAsset(1), bgValuationMode: "sangjeungbeop_market" }], houses: [], presaleRights: [], contractTotalPrice: "", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false }) as never;
const view = (r: MixedUseGainBreakdown) => {
  const { container } = render(<MixedUseResultCard breakdown={r} formData={formData()} />);
  return container;
};
const ACQ_LINE = "주택 토지분: 실지취득가액 중 이 부분 몫 291,666,666 × ";
const EXP_LINE = "주택 토지분: 자본적지출·양도비 등 실제 필요경비 중 이 부분 몫 20,833,332 × ";

describe("echo가 있으면 금액을 적는다", () => {
  it("결과 카드 — 취득가액·필요경비 산식에 부분 몫 금액이 채무비율 앞에 적힌다", () => {
    const c = view(calc());
    const acq = c.querySelector('[data-testid="bg-result-acq-housing"]')!.textContent ?? "";
    expect(acq).toContain(ACQ_LINE);
    expect(acq).toContain("주택 건물분: 실지취득가액 중 이 부분 몫 58,333,334 × ");
    expect(acq).toContain(EXP_LINE);
    expect(acq).toContain("주택 건물분: 자본적지출·양도비 등 실제 필요경비 중 이 부분 몫 4,166,668 × ");
    // 적힌 값이 곧 엔진 echo다 — 적힌 몫 × 채무비율 = 적용 값
    const r = calc();
    expect(r.burdenedGift!.perPart.housingLand.acquisitionBeforeRatio).toBe(291_666_666);
    expect(r.burdenedGift!.perPart.housingLand.expenseBeforeRatio).toBe(20_833_332);
  });

  it("상세명세서 — 같은 금액이 `= 적용값` 앞의 산식에 적힌다", () => {
    const txt = view(calc()).textContent ?? "";
    expect(txt).toContain(`${ACQ_LINE}(주택분 양도로 보는 채무액 300,000,000 / 주택분 증여가액 750,000,000) = 116,666,666`);
    expect(txt).toContain(`${EXP_LINE}(주택분 양도로 보는 채무액 300,000,000 / 주택분 증여가액 750,000,000) = 8,333,332`);
  });
});

describe("구 이력(echo 없음) — 종전 문구", () => {
  const legacy = (): MixedUseGainBreakdown => {
    const r = structuredClone(calc());
    for (const k of KEYS) {
      delete r.burdenedGift!.perPart[k].acquisitionBeforeRatio;
      delete r.burdenedGift!.perPart[k].expenseBeforeRatio;
    }
    return r;
  };

  it("금액 없는 「이 부분 몫 ×」 · 필요경비는 한 줄로 떨어진다 — 0이나 NaN을 적지 않는다", () => {
    const c = view(legacy());
    const acq = c.querySelector('[data-testid="bg-result-acq-housing"]')!.textContent ?? "";
    expect(acq).toContain("주택 토지분: 실지취득가액 중 이 부분 몫 × ");
    expect(acq).not.toContain("291,666,666 × ");
    expect(acq).toContain("자본적지출·양도비 등 실제 필요경비 중 이 부분 몫 × ");
    expect(acq).not.toContain("주택 토지분: 자본적지출");
    expect(acq).not.toContain("NaN");
    const txt = c.textContent ?? "";
    expect(txt).toContain("주택 토지분: 실지취득가액 중 이 부분 몫 × (주택분 양도로 보는 채무액 300,000,000 / 주택분 증여가액 750,000,000) = 116,666,666");
    expect(txt).toContain("자본적지출·양도비 등 실제 필요경비 중 이 부분 몫 × (주택분 양도로 보는 채무액");
  });
});
