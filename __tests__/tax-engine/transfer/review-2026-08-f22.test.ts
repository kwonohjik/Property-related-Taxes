/**
 * anchor — F22 (2026-08 코드리뷰) **§97②2호 판정 단위는 파트 자본적지출 칸의 유무가 아니다**
 *
 * ## 결함
 *
 * `buildEstimatedGeneralBuildingCards`(`general-building-entry.ts`)가 §97②2호 판정의 파트 항목을
 * `landDirectExpenses !== undefined` / `buildingDirectExpenses !== undefined`로만 만들었다.
 * 파트 **모드**를 이미 알면서 싣지 않은 것이다. `resolvePerPart`는 `input?.mode`로 갈래를 정하므로
 * 항목이 없으면 그 파트는 통째로 건너뛰어지고(`estimatedCards.length === 0 → continue`),
 * 「소득세법」 제100조 제2항 후문으로 **그 파트에 안분됐어야 할 양도비가 소실**된다.
 * ④ 변환(`transfer-tax-api-gb.ts`)도 truthy일 때만 실어 「0 입력」과 「미입력」이 같았다.
 *
 * ## 실측 (2026-08-13 · 토지 실가 4억 + 건물 환산 · 총양도 20억 · 양도비 3억)
 *
 * | 토지 자본적지출 | 결정세액 | |
 * |---|---|---|
 * | 비움 (수정 전) | 434,548,681 | 토지 양도비 안분분 293,424,386이 소실 |
 * | 1원 (수정 전)  | 344,916,000 | 항목이 생겨 정상 계산 |
 * | 비움 (수정 후) | 344,916,000 | ← 「1원」과 같아진다 |
 *
 * 양쪽 파트 자본적지출을 모두 비운 혼합 모드는 종전에 **자산총액 분기**로 떨어져 312,933,515였고,
 * 수정 후 파트 단위로 345,210,000이 된다(+32,276,485). **사용자 확정 사항**이다 —
 * §97②2호 단서 요건은 「취득가액을 **환산취득가액으로 하는 경우**」라 혼합 모드에서 그 요건을
 * 충족하는 것은 환산 파트뿐이고, 자산총액 1회 판정은 실가 파트까지 단서에 끌어들인다
 * (`general-building-swap.ts` 헤더 O-1).
 *
 * ## 🔴 반대 방향 회귀 가드가 이 파일의 절반이다
 *
 * 「비-환산이면 파트 축」으로 넓히면 **두 파트가 같은 모드**인 조합까지 파트 축으로 넘어가
 * `resolvePerPart`가 읽지 않는 **자산 단위 자본적지출이 조용히 사라진다**. 파트별 입력 칸은
 * 분리 ON에서만 렌더되고(`GeneralBuildingAcquisitionCards`의 `PartAcqModeField`), 자산 단위 칸을
 * 막는 validate V-8도 분리 ON 안에만 있다. ⇒ 판정 단위 전환은 **모드가 다를 때**만이다.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { buildEstimatedGeneralBuildingCards } from "@/lib/tax-engine/general-building-entry";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates();
const ACQ = "1999-05-24";
const TRANSFER = "2026-02-16";
const TOTAL_TRANSFER = 2_000_000_000;

/** `general-building-part-swap.anchor.test.ts`와 **같은 fixture**(토지 가목 512,888,404 · 건물 6,065,163). */
function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    acquisitionDate: ACQ,
    landAcquisitionDate: ACQ,
    hasSeperateLandAcquisitionDate: false,
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "180.96",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
    gbZoneType: "commercial",
    ...over,
  } as AssetForm;
}

/** 토지 실가 4억 + 건물 환산 · 양도비 3억 — F22 실패 시나리오의 축. */
const MIXED = {
  landAcqMode: "actual",
  buildingAcqMode: "estimated",
  landAcquisitionPrice: "400000000",
  transferExpense: "300000000",
} as Partial<AssetForm>;

function payloadOf(asset: AssetForm) {
  return buildGeneralBuildingValuation(asset, TRANSFER) as Record<string, unknown>;
}

function swapOf(asset: AssetForm) {
  return buildEstimatedGeneralBuildingCards({
    ...payloadOf(asset),
    totalTransferPrice: TOTAL_TRANSFER,
    transferDate: new Date(TRANSFER),
    acquisitionDate: new Date(asset.acquisitionDate),
    landAcquisitionDate: new Date(asset.landAcquisitionDate || asset.acquisitionDate),
    ownershipRatio: 1,
  } as never).swap;
}

function determinedTaxOf(asset: AssetForm): number {
  return dispatchGeneralBuilding(
    payloadOf(asset),
    TOTAL_TRANSFER,
    new Date(TRANSFER),
    new Date(asset.acquisitionDate),
    400_000_000,
    0,
    2026,
    undefined,
    [],
    RATES,
    undefined,
    undefined,
    undefined,
  ).aggregated.determinedTax;
}

describe("F22 — 혼합 모드에서 파트 자본적지출을 비워도 그 파트가 판정에서 사라지지 않는다", () => {
  it("🔴 토지 칸을 비워도 토지 양도비 안분분이 §97②1호 가산으로 살아 있다", () => {
    const swap = swapOf(gbAsset({ ...MIXED, buildingDirectExpenses: "1000000" } as Partial<AssetForm>));
    // 종전에는 `perPart.land` 키 자체가 없었고 `addition`이 비어 있었다.
    expect(swap.perPart?.land?.directSide).toBe(293_424_386);
    expect(swap.addition.get("land")).toBe(293_424_386);
  });

  it("🔴 세액 — 「비움」이 「1원」과 같아진다 (종전 89,632,681원 과대)", () => {
    const blank = determinedTaxOf(
      gbAsset({ ...MIXED, buildingDirectExpenses: "1000000" } as Partial<AssetForm>),
    );
    const oneWon = determinedTaxOf(
      gbAsset({
        ...MIXED,
        landDirectExpenses: "1",
        buildingDirectExpenses: "1000000",
      } as Partial<AssetForm>),
    );
    expect(blank).toBe(344_916_000);
    expect(oneWon).toBe(344_916_000);
  });

  it("🔄 양쪽 다 비운 혼합 모드도 **파트 단위**다 (사용자 확정 — 종전 312,933,515)", () => {
    const swap = swapOf(gbAsset(MIXED));
    expect(swap.perPart?.land?.directSide).toBe(293_424_386);
    expect(swap.perPart?.building?.swapApplied).toBe(true);
    expect(determinedTaxOf(gbAsset(MIXED))).toBe(345_210_000);
  });
});

describe("F22 회귀 가드 — 두 파트가 같은 모드면 자산총액 판정을 유지한다", () => {
  it("두 파트 모두 환산 + 자산 단위 자본적지출 → 자산총액 분기(안 A)", () => {
    const asset = gbAsset({ capitalExpenditure: "700000000" } as Partial<AssetForm>);
    const swap = swapOf(asset);
    expect(swap.perPart).toBeUndefined(); // 파트 축이 아니다
    expect(swap.directSide).toBe(700_000_000); // 자산 단위 칸이 나목에 도달한다
    expect(swap.swapApplied).toBe(true);
  });

  it("🔑 두 파트 모두 실가여도 파트 칸이 없으면 자산총액 분기다 — 자산 단위 값이 사라지면 안 된다", () => {
    // 분리 OFF·실가 모드: 파트 산정방식·파트 자본적지출 위젯이 화면에 없다.
    const asset = gbAsset({
      useEstimatedAcquisition: false,
      fixedAcquisitionPrice: "300000000",
      capitalExpenditure: "700000000",
      transferExpense: "300000000",
      gbHasExtension: true,
      gbExtensionDate: "2015-06-01",
      gbExtensionAcquisitionCause: "newConstruction",
      gbExtensionAcquisitionMode: "estimated",
      gbTransferExtensionBuildingStdPrice: "8000000",
      gbAcquisitionExtensionBuildingStdPrice: "6000000",
      gbBundledAcquisitionExpenses: "5000000",
    } as Partial<AssetForm>);
    const swap = swapOf(asset);
    expect(swap.perPart).toBeUndefined();
    expect(swap.directSide).toBe(1_000_000_000); // 자본적지출 7억 + 양도비 3억
  });
});
