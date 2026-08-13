/**
 * F01 — 다건 집계가 houses[] 정밀 다주택 판정을 버리고 원시 플래그로 §104⑦ 중과를 되살리던 결함.
 *
 * `aggregateByGroup`의 `assetTaxOf`가 `resolveSplitAwareTax` ctx에 `multiHouseSurchargeResult`를
 * 넣지 않아 `calcTax`가 원시 플래그(propertyType·isRegulatedArea·householdHousingCount)로 중과를
 * **재판정**했다. `classifyRateGroup`의 `multiHouseByInput`도 같은 원시 축이라 그룹 라벨까지 어긋났다.
 * optional 인자라 TypeScript가 잡지 못한다.
 *
 * `transfer-tax.ts` STEP 3은 이미 「정밀 결과가 정본, 없을 때만 원시 fallback」 규약을 구현한다 —
 * 집계만 그 규약 밖에 있었다. 전달 경로는 `TransferTaxResult.multiHouseSurchargeEvaluation` echo다
 * (표시용 `multiHouseSurchargeDetail`에는 surchargeApplicable·surchargeType·isSurchargeSuspended가
 * 없어 재사용할 수 없다). 집계가 `runMultiHouseSurchargeStep`을 다시 부르면 이중 진실이 된다.
 *
 * 기대값은 전부 엔진을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import {
  makeMockRatesWithHouseEngine,
  makeHouseInfo,
  baseTransferInput,
} from "../_helpers/mock-rates";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const rates = makeMockRatesWithHouseEngine();

/** 3채 중 2채가 2023-03-01 상속 → 영 §167의3 상속 5년 배제로 유효 주택수 1 */
const houses = [
  makeHouseInfo("h1", { acquisitionDate: new Date("2015-01-01") }),
  makeHouseInfo("h2", {
    acquisitionDate: new Date("2023-03-01"),
    isInherited: true,
    inheritedDate: new Date("2023-03-01"),
  }),
  makeHouseInfo("h3", {
    acquisitionDate: new Date("2023-03-01"),
    isInherited: true,
    inheritedDate: new Date("2023-03-01"),
  }),
];

/** 조정대상지역 주택 · 원시 입력은 3주택(중과 조건 충족)이나 정밀 판정은 1주택 */
const asset = {
  propertyType: "housing" as const,
  transferPrice: 900_000_000,
  acquisitionPrice: 400_000_000,
  acquisitionDate: new Date("2015-01-01"),
  transferDate: new Date("2024-06-01"),
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 3,
  residencePeriodMonths: 0,
  isRegulatedArea: true,
  wasRegulatedAtAcquisition: true,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [],
  annualBasicDeductionUsed: 0,
  regionCode: "11680",
  houses,
  sellingHouseId: "h1",
};

describe("F01 — 다건 집계가 houses[] 정밀 다주택 판정을 승계한다", () => {
  it("단건이 배제한 중과가 1건 다건에서 되살아나지 않는다", () => {
    const single = calculateTransferTax(baseTransferInput(asset), rates);
    const agg = calculateTransferTaxAggregate(
      {
        taxYear: 2024,
        annualBasicDeductionUsed: 0,
        properties: [{ propertyId: "p1", propertyLabel: "P1", ...asset } as TransferTaxItemInput],
      },
      rates,
    );

    // 단건 — 정밀 판정이 상속 2채를 빼 유효 1주택 → 중과 없음(누진 40%)·표1 장특 적용
    expect(single.multiHouseSurchargeDetail?.effectiveHouseCount).toBe(1);
    expect(single.longTermHoldingDeduction).toBe(90_000_000);
    expect(single.taxBase).toBe(407_500_000);
    expect(single.appliedRate).toBe(0.4);
    expect(single.calculatedTax).toBe(137_060_000);
    expect(single.totalTax).toBe(150_766_000);

    // 다건 — 수정 전에는 rateGroup=multi_house_surcharge·0.7·산출세액 259,310,000
    //        (=407,500,000 × 0.30 만큼 122,250,000 과대)·totalTax 285,241,000 이었다.
    expect(agg.groupTaxes).toHaveLength(1);
    expect(agg.groupTaxes[0].group).toBe("progressive");
    expect(agg.groupTaxes[0].appliedRate).toBe(0.4);
    expect(agg.groupTaxes[0].groupCalculatedTax).toBe(137_060_000);
    expect(agg.calculatedTax).toBe(137_060_000);
    expect(agg.totalTax).toBe(150_766_000);
  });

  it("정밀 판정이 없는 자산(houses[] 미제공)은 원시 플래그 경로가 그대로 유지된다", () => {
    const raw = { ...asset, houses: undefined, sellingHouseId: undefined };
    const single = calculateTransferTax(baseTransferInput(raw), rates);
    const agg = calculateTransferTaxAggregate(
      {
        taxYear: 2024,
        annualBasicDeductionUsed: 0,
        properties: [{ propertyId: "p1", propertyLabel: "P1", ...raw } as TransferTaxItemInput],
      },
      rates,
    );

    // 대조군 — 원시 3주택·조정지역이므로 중과 70%가 정답이고 단건·다건이 일치한다.
    expect(single.appliedRate).toBe(0.7);
    expect(single.calculatedTax).toBe(322_310_000);
    expect(agg.groupTaxes[0].group).toBe("multi_house_surcharge");
    expect(agg.calculatedTax).toBe(322_310_000);
  });

  it("rateGroup 교정이 §102② 통산 범위·기본공제 배분에도 반영된다", () => {
    // 같은 자산 + 차손 사업용 토지 1건. 종전에는 주택이 multi_house_surcharge 그룹이라
    // 토지(progressive)의 차손이 **타군 안분**으로 넘어왔고 기본공제도 중과 그룹 우선이었다.
    // 정밀 판정 승계 후에는 둘 다 progressive라 **같은 군 통산**이 된다.
    const lossLand: TransferTaxItemInput = {
      propertyId: "p2",
      propertyLabel: "P2",
      propertyType: "land",
      transferPrice: 100_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2024-07-01"),
      expenses: 0,
      useEstimatedAcquisition: false,
      householdHousingCount: 3,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: true,
      reductions: [],
    } as unknown as TransferTaxItemInput;

    const agg = calculateTransferTaxAggregate(
      {
        taxYear: 2024,
        annualBasicDeductionUsed: 0,
        properties: [
          { propertyId: "p1", propertyLabel: "P1", ...asset } as TransferTaxItemInput,
          lossLand,
        ],
      },
      rates,
    );

    // 두 자산이 같은 세율군(progressive)으로 묶여 통산 scope가 "same"이 된다.
    expect(agg.groupTaxes).toHaveLength(1);
    expect(agg.groupTaxes[0].group).toBe("progressive");
    expect(agg.lossOffsetTable.map((r) => r.scope)).toEqual(["same_group"]);
    expect(agg.lossOffsetTable[0].amount).toBe(100_000_000);
    expect(agg.groupTaxes[0].groupTaxBase).toBe(307_500_000);
    expect(agg.groupTaxes[0].groupCalculatedTax).toBe(97_060_000);
    expect(agg.calculatedTax).toBe(97_060_000);
  });
});
