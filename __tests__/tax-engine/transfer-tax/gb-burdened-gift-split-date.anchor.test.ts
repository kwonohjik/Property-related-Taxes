/**
 * anchor: 일반건물 **부담부증여 × 「토지·건물 취득일 다름」**(V-4) — 파트별 보유기간
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §10-1
 *
 * ## 왜 이 anchor가 필요한가 — 계획서가 「막는다」고 적은 조합이 실은 열려 있었다
 *
 * §9-6은 「부담부증여 × 분리 ON(V-4)은 그대로 막는다 — §159가 채무비율로 자동 산정하므로
 * 파트 분리가 성립하지 않는다」고 적었다. **두 겹 다 틀렸다**:
 *
 *   1. **막고 있지 않았다.** `transfer-tax-validate-gb.ts`의 부담부증여 분기는 자체 검증을
 *      마치고 `return null`로 빠져나가므로, 그 아래 `isSeparate` 블록의 V-4 차단은
 *      **한 번도 실행되지 않는 코드**였다(실측: 분리 ON·OFF 모두 `null`).
 *   2. **파트 분리는 성립한다.** §159는 「양도차익의 계산」 조문이라 **양도가액·취득가액**만
 *      채무비율로 정한다. 보유기간은 「소득세법」 제95조 제4항이 「**그 자산의 취득일**부터」로
 *      따로 정하고, 토지와 건물은 같은 법 제94조 제1항 제1호가 **별개 자산**으로 열거한다.
 *      ⇒ 채무비율이 자동이라는 사실은 파트별 보유기간을 배제하지 않는다.
 *
 * 그래서 이 anchor는 **차단이 없다는 것**과 **없어도 되는 이유**(엔진이 이미 파트별로 맞게
 * 계산한다)를 함께 고정한다. 종전에는 어느 쪽도 고정되어 있지 않아, 누가 파트 취득일 배선을
 * 끊어도 아무 테스트가 빨개지지 않았다.
 *
 * ## 고정 수치 (2026-02-16 양도 · 사례 34 기준시가)
 *
 * | 취득일 | 산출세액 |
 * |---|---|
 * | 토지·건물 모두 1998-09-07 | 740,219,533 |
 * | **토지 1998 · 건물 2023** | **750,312,627** |
 * | 토지·건물 모두 2023-01-01 | 1,017,002,802 |
 *
 * 차단이 살아 있었다면 사용자는 한 칸에 날짜 하나만 넣을 수 있으므로 위·아래 두 값 중 하나로
 * 몰렸다 — 정답(750,312,627)과 **10,093,094원** 또는 **266,690,175원** 어긋난다.
 */

import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

const LAND_AREA = 1279;
const LAND_ACQ_DATE = new Date("1998-09-07");
const BUILDING_ACQ_DATE = new Date("2023-01-01");

const burdenedGiftInfo: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 1_000_000_000,
  mortgageDebtAmount: 3_120_000_000,
  annualRentTotal: 130_000_000,
  landStdPriceAtTransfer: LAND_AREA * 6_215_000,
  buildingStdPriceAtTransfer: 631_846_500,
  landStdPriceAtAcquisition: LAND_AREA * 2_130_000,
  buildingStdPriceAtAcquisition: 424_472_064,
  donorRelation: "lineal_descendant",
};

function run(over: Record<string, unknown>) {
  return calculateGeneralBuildingActualTransfer(
    {
      totalTransferPrice: 0, // §159 모드는 안분 결과로 override
      transferDate: new Date("2026-02-16"),
      acquisitionDate: LAND_ACQ_DATE,
      landArea: LAND_AREA,
      buildingFootprintArea: 388.27,
      transferLandPricePerSqm: 6_215_000,
      transferBuildingStdPrice: 631_846_500,
      zoneType: "general_residential",
      isMetropolitan: false,
      isUnregistered: false,
      actualAcquisitionPrice: 2_500_000_000,
      actualExpenses: 0,
      acquisitionLandPricePerSqm: 2_130_000,
      acquisitionBuildingStdPrice: 424_472_064,
      burdenedGiftInfo,
      ...over,
    } as never,
    2026,
    undefined,
    [],
    rates,
  );
}

describe("V4-1 부담부증여 GB — 파트별 취득일이 세액을 가른다", () => {
  it("토지 1998 · 건물 2023 → 750,312,627 (두 단일-날짜 결과 어느 쪽과도 다르다)", () => {
    const split = run({ buildingAcquisitionDate: BUILDING_ACQ_DATE });
    const bothEarly = run({});
    const bothLate = run({ acquisitionDate: BUILDING_ACQ_DATE });

    expect(split.aggregated.calculatedTax).toBe(750_312_627);
    expect(bothEarly.aggregated.calculatedTax).toBe(740_219_533);
    expect(bothLate.aggregated.calculatedTax).toBe(1_017_002_802);

    // 차단이 살아 있었다면 사용자가 몰렸을 두 값과의 거리 — 침묵 오차의 크기.
    expect(split.aggregated.calculatedTax - bothEarly.aggregated.calculatedTax).toBe(10_093_094);
    expect(split.aggregated.calculatedTax - bothLate.aggregated.calculatedTax).toBe(-266_690_175);
  });

  it("④ API 변환이 보내는 형태(acquisitionDate = 건물 취득일)와 결과가 같다", () => {
    /**
     * `transfer-tax-api-gb.ts`는 `acquisitionDate`에 **건물** 취득일을 싣고
     * `landAcquisitionDate`를 따로 싣는다(M-1a). 라우트의 `landCardDate`/`buildingCardDate`가
     * 두 축을 각자 집으므로 자산 단위 `acquisitionDate`가 어느 쪽이든 결과가 같아야 한다 —
     * 어긋나면 자산 단위 필드가 파트 계산에 새어 들어간 것이다.
     */
    const asEngineFixture = run({ buildingAcquisitionDate: BUILDING_ACQ_DATE });
    const asProductionPayload = run({
      acquisitionDate: BUILDING_ACQ_DATE,
      landAcquisitionDate: LAND_ACQ_DATE,
      buildingAcquisitionDate: BUILDING_ACQ_DATE,
    });
    expect(asProductionPayload.aggregated.calculatedTax).toBe(
      asEngineFixture.aggregated.calculatedTax,
    );
  });

  it("§159가 취득가액을 정하므로 파트 취득가액 칸은 결과를 바꾸지 않는다", () => {
    /**
     * 이것이 **파트 취득가액 축을 화면에서 숨기는 근거**다
     * (`LandBuildingSplitSection.tsx:397` — `isBurdenedGift`이면 `null`).
     * 숨기지 않으면 「입력했는데 세액이 그대로」인 칸이 남는다.
     */
    const base = run({ buildingAcquisitionDate: BUILDING_ACQ_DATE });
    const withPartPrices = run({
      buildingAcquisitionDate: BUILDING_ACQ_DATE,
      landAcquisitionPrice: 9_999_999_999,
      buildingAcquisitionPrice: 8_888_888_888,
    });
    expect(withPartPrices.aggregated.calculatedTax).toBe(base.aggregated.calculatedTax);
  });
});

describe("V4-2 ⑧ validate — 부담부증여 × 분리 ON을 차단하지 않는다", () => {
  /**
   * ⚠️ 이 테스트는 「차단이 없다」를 **의도된 동작으로** 고정한다. 종전 V-4 차단 코드는
   *    부담부증여 분기의 조기 `return null` 뒤에 있어 도달 불가였고, 그 사실을 아무도
   *    몰랐다 — 위 V4-1이 그 차단을 되살리면 안 되는 이유다.
   */
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "general_building" as const,
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgLendingDepositTotal: "1000000000",
    bgMortgageDebtAmount: "3120000000",
    gbLandArea: "1279",
    gbBuildingFootprintArea: "388.27",
    gbZoneType: "commercial",
    gbTransferLandPricePerSqm: "6215000",
    gbTransferBuildingValue: "631846500",
    gbAcqLandPricePerSqm: "2130000",
    gbAcqBuildingValue: "424472064",
    landAcquisitionDate: "1998-09-07",
    acquisitionDate: "2023-01-01",
  };

  it("분리 ON — 통과", () => {
    const v = validateGeneralBuildingAsset(
      { ...asset, hasSeperateLandAcquisitionDate: true } as never,
      "자산1",
      "2026-02-16",
    );
    expect(v).toBeNull();
  });

  it("분리 OFF — 통과 (회귀 0)", () => {
    const v = validateGeneralBuildingAsset(
      { ...asset, hasSeperateLandAcquisitionDate: false } as never,
      "자산1",
      "2026-02-16",
    );
    expect(v).toBeNull();
  });
});
