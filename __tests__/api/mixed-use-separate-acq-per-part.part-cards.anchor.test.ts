/**
 * anchor — 겸용 **별개 취득 파트 모델**(B1) × 컴패니언 파트 카드 (엔진 설계 §6 「컴패니언」·V-5·V-12).
 *
 * 컴패니언 겸용은 겸용 엔진 결과를 **파트 카드로 되먹여** aggregate가 다시 계산한다
 * (`mixed-use-part-cards.equivalence.anchor.test.ts`와 같은 구조). 파트 모델 값이 엔진 결과
 * (`housingPart.landAcqPrice`·`landAppraisalDed` 등)에 정확히 들어가면 카드가 **자동 추종**한다 —
 * 이 파일이 그것을 파트 모델 입력으로 고정한다.
 *
 * 입력은 `buildMixedUsePartCards`(엔진 입력 `MixedUseAssetInput` 그대로)를 직접 호출한다. 컴패니언 Route 전체
 * (`companionAssets[].mixedUse`)는 ④ 클라이언트가 파트 필드를 실어야 도달하므로 UI 구현 후 E2E에서 확인한다
 * (⑭ `buildMixedUseAssetInput`이 `...s.mixedUse` 스프레드라 서버 쪽 도달은 predo 파일 R-B1이 단건 Route로 고정한다).
 * fixture는 가상(실제 신고 사례 아님). 세액은 mock 세율표 기준.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildMixedUsePartCards } from "@/app/api/calc/transfer/mixed-use-part-cards";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const rates = makeMockRatesWithHouseEngine();
const D = (s: string) => new Date(s);
const TD = D("2024-08-20");
const PRICE = 3_000_000_000;

function asset(over: Record<string, unknown> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2005-06-10"),
    buildingAcquisitionDate: D("2010-03-15"),
    transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
    acquisitionStandardPrice: {
      housingPrice: 400_000_000,
      commercialBuildingPrice: 80_000_000,
      landPricePerSqm: 1_200_000,
      landPricePerSqmAtBuildingAcq: 1_800_000,
      housingBuildingPrice: 320_000_000,
    },
    residencePeriodYears: 0,
    isMetropolitanArea: true,
    zoneType: "general_residential",
    isOneHouseExempt: false,
    ...over,
  } as unknown as MixedUseAssetInput;
}

function companionBase(): TransferTaxItemInput {
  return {
    propertyId: "c1",
    propertyLabel: "자산 2",
    propertyType: "housing",
    transferPrice: PRICE,
    acquisitionPrice: 0,
    expenses: 0,
    transferDate: TD,
    acquisitionDate: D("2005-06-10"),
    isOneHousehold: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    useEstimatedAcquisition: false,
    isNonBusinessLand: false,
    reductions: [],
  } as TransferTaxItemInput;
}

function compare(a: MixedUseAssetInput) {
  const single = calcMixedUseTransferTax(PRICE, TD, a, rates);
  const cards = buildMixedUsePartCards(companionBase(), a, PRICE, TD, rates, "c1", "자산 2");
  const agg = calculateTransferTaxAggregate({ taxYear: 2024, properties: cards, annualBasicDeductionUsed: 0 }, rates);
  return { single, cards, agg };
}

const SEP = { landMode: "actual", buildingMode: "appraisal", landAcquisitionPrice: 500_000_000, buildingAcquisitionPrice: 400_000_000 } as const;

describe("겸용 별개 취득 파트 모델 — 컴패니언 파트 카드 ≡ 단건 겸용", () => {
  it("CP-1 토지 실가 + 건물 감정: 카드의 취득가액·경비가 엔진 파트 값 그대로이고 과세표준·세액이 단건과 일치", () => {
    const { single, cards, agg } = compare(asset({ separateAcquisition: SEP }));
    // 구별력 근거 — 파트 모델 값이 엔진 결과에 실제로 들어가 있다(환산 모델이면 99,310,344)
    expect(single.housingPart.landAcqPrice).toBe(250_000_000);
    expect(single.housingPart.buildingAppraisalDed).toBe(7_680_000);
    expect(cards.length).toBeGreaterThanOrEqual(4);
    expect(agg.taxBase).toBe(single.total.taxBase);
    expect(agg.totalTax).toBe(Math.floor(single.total.transferTax * 1.1));
  });

  it("CP-2 환산 토지 + 실가 건물 + 자본적지출(실가 파트 경비 가산·환산 묶음 단서 미발동)도 일치 — 경비 이중계상 금지", () => {
    const { single, agg } = compare(
      asset({
        separateAcquisition: { landMode: "estimated", buildingMode: "actual", buildingAcquisitionPrice: 400_000_000 },
        capitalExpenditure: 400_000_000,
        transferExpense: 20_000_000,
      }),
    );
    expect(single.necessaryExpenseProviso?.chosen).toBe("estimated");
    expect(agg.taxBase).toBe(single.total.taxBase);
    expect(agg.totalTax).toBe(Math.floor(single.total.transferTax * 1.1));
  });

  it("CP-3 단서 direct(토지측)도 일치 — 환산 파트 취득가액 0 + 경비 몫이 카드에 그대로 옮겨진다", () => {
    const { single, agg } = compare(
      asset({
        separateAcquisition: { landMode: "estimated", buildingMode: "actual", buildingAcquisitionPrice: 400_000_000 },
        capitalExpenditure: 700_000_000,
      }),
    );
    expect(single.necessaryExpenseProviso?.chosen).toBe("direct");
    expect(single.housingPart.landAcqPrice).toBe(0);
    expect(agg.taxBase).toBe(single.total.taxBase);
    expect(agg.totalTax).toBe(Math.floor(single.total.transferTax * 1.1));
  });
});
