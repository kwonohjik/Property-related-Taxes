/**
 * anchor — F21 (2026-08 코드리뷰) **증축 3-way가 파트 자본적지출을 이중 계상했다**
 *
 * ## 결함
 *
 * `buildGeneralBuildingAssetCardsWithExtension`(`general-building-extension.ts`)이 파트를
 * 비-환산 값으로 대체할 때 `landExp = input.landDirectExpenses ?? 0`으로 **파트 자본적지출을
 * 카드 필요경비에 직접** 실었다. 같은 값이 `general-building-entry.ts` → `resolveGeneralBuildingSwap`의
 * `partAxis.direct`로도 들어가 §97②1호 **가산**(`addition`)으로 배분되고, 최종 엔진 input은
 * `expenses = card.expenses + directAddition`(`general-building-route-cards.ts`)이라
 * **같은 지출이 두 번 차감**됐다.
 *
 * 2-way 경로는 `applyPartAcqModes`가 돌려주는 **개산공제만** 카드에 싣고(실가 파트는 0 —
 * `general-building-part-acq.ts`) 자본적지출은 swap의 `addition` 단일 경로에 맡긴다.
 * 3-way가 그 반환값 중 `estimatedDeduction`만 버린 것이 결함의 정체다.
 *
 * ## 실측 (2026-08-13 · 분리 ON · 토지 실가 4억 + 건물 환산 · 증축 ON · 총양도 20억)
 *
 * | 토지 자본적지출 30,000,000 | 토지 카드 `expenses` | 엔진 input `expenses` | 결정세액 |
 * |---|---|---|---|
 * | 수정 전 | 30,000,000 | **60,000,000** | 412,282,803 |
 * | 수정 후 | 0 | 30,000,000 | **421,732,803** (+9,450,000) |
 *
 * 30,000,000 × (1 − LTHD 30%) × 45% = 9,450,000 — 증축분 기준시가를 바꿔도 차액은 불변이다.
 *
 * ## 개산공제 인자도 함께 맞춘다 (제안 수정의 함정)
 *
 * `applyPartAcqModes`에 넘기던 개산공제는 `originUsedEstimated ? landExp : 0`이었는데,
 * production에서는 `route-helper`가 `actualBundledAcquisitionPrice`를 **항상** 주입해
 * `isOriginActual`이 상시 true다 ⇒ 인자가 **항상 0**이었다. 그대로 두고 반환값을 읽으면
 * 감정가액·매매사례가액 파트의 개산공제가 0이 되어 2-way와 어긋난다
 * (「소득세법」 §97②2호는 제1항제1호 **나목** 전부를 「그 밖의 경우」로 묶고 §163⑥ 개산공제를
 * 붙인다 — 실지거래가액 파트만 제외다). ⇒ 인자를 **환산 개산공제**로 바꿨다.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { buildEstimatedGeneralBuildingCards } from "@/lib/tax-engine/general-building-entry";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates();
const TRANSFER = "2026-02-16";
const TOTAL_TRANSFER = 2_000_000_000;
const LAND_CAPEX = 30_000_000;

/** 분리 ON(토지 1999 · 건물 2005) · 토지 실가 + 건물 환산 · 증축 ON(2015). */
function gbExtAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    useEstimatedAcquisition: false,
    acquisitionDate: "2005-03-10",
    landAcquisitionDate: "1999-05-24",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: "400000000",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "90.48",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
    gbZoneType: "commercial",
    gbHasExtension: true,
    gbExtensionDate: "2015-06-01",
    gbExtensionAcquisitionCause: "newConstruction",
    gbExtensionAcquisitionMode: "estimated",
    gbTransferExtensionBuildingStdPrice: "8000000",
    gbAcquisitionExtensionBuildingStdPrice: "6000000",
    ...over,
  } as AssetForm;
}

function run(asset: AssetForm) {
  const payload = buildGeneralBuildingValuation(asset, TRANSFER) as Record<string, unknown>;
  const { gbOut, swap } = buildEstimatedGeneralBuildingCards({
    ...payload,
    totalTransferPrice: TOTAL_TRANSFER,
    transferDate: new Date(TRANSFER),
    acquisitionDate: new Date(asset.acquisitionDate),
    landAcquisitionDate: new Date(asset.landAcquisitionDate || asset.acquisitionDate),
    ownershipRatio: 1,
  } as never);
  const r = dispatchGeneralBuilding(
    payload,
    TOTAL_TRANSFER,
    new Date(TRANSFER),
    new Date(asset.acquisitionDate),
    (payload.bundledAcquisitionPrice as number | undefined) ?? 0,
    (payload.bundledExpenses as number) ?? 0,
    2026,
    undefined,
    [],
    RATES,
    undefined,
    undefined,
    undefined,
  );
  const land = gbOut.assetCards.find((c) => c.propertyType === "land")!;
  return {
    landCardExpenses: land.expenses,
    landAddition: swap.addition.get("land") ?? 0,
    tax: r.aggregated.determinedTax,
    total: r.aggregated.totalTax,
  };
}

describe("F21 — 증축 3-way는 파트 자본적지출을 카드에 싣지 않는다 (가산 경로 단일화)", () => {
  it("🔴 실가 파트 카드 필요경비는 0이고 자본적지출은 `addition`에만 있다", () => {
    const r = run(gbExtAsset({ landDirectExpenses: String(LAND_CAPEX) } as Partial<AssetForm>));
    expect(r.landCardExpenses).toBe(0); // 종전 30,000,000 (가산과 이중)
    expect(r.landAddition).toBe(LAND_CAPEX);
  });

  it("🔴 세액 — 이중 차감이 사라진다 (종전 412,282,803 · 9,450,000 과소)", () => {
    const r = run(gbExtAsset({ landDirectExpenses: String(LAND_CAPEX) } as Partial<AssetForm>));
    expect(r.tax).toBe(421_732_803);
    expect(r.total).toBe(463_906_083);
  });

  it("🔑 3-way 차감액이 2-way(증축 OFF)와 같은 자본적지출을 **한 번만** 반영한다", () => {
    // 증축 OFF 대조군은 종전에도 정상이었다 — 카드 필요경비 0 + 가산 30,000,000.
    const twoWay = run(
      gbExtAsset({
        gbHasExtension: false,
        landDirectExpenses: String(LAND_CAPEX),
      } as Partial<AssetForm>),
    );
    expect(twoWay.landCardExpenses).toBe(0);
    expect(twoWay.landAddition).toBe(LAND_CAPEX);
  });

  it("🔑 mutation — 자본적지출을 절반으로 줄이면 세액이 정확히 그만큼만 움직인다", () => {
    const full = run(gbExtAsset({ landDirectExpenses: String(LAND_CAPEX) } as Partial<AssetForm>));
    const half = run(
      gbExtAsset({ landDirectExpenses: String(LAND_CAPEX / 2) } as Partial<AssetForm>),
    );
    // 15,000,000 × (1 − LTHD 30%) × 45% = 4,725,000
    expect(half.tax - full.tax).toBe(4_725_000);
  });

  it("감정가액 파트는 개산공제를 유지한다 — §163⑥은 「그 밖의 경우」 전부에 붙는다", () => {
    const r = run(
      gbExtAsset({ landAcqMode: "appraisal" } as Partial<AssetForm>),
    );
    // 취득시 토지 기준시가 238,000,000 × 3% = 7,140,000 (종전 0 — 2-way와 어긋났다)
    expect(r.landCardExpenses).toBe(7_140_000);
    expect(r.tax).toBe(428_933_703);
  });
});
