/**
 * anchor — O-4 부수토지 비사업용 분할 × 파트 취득가액의 **계산 순서** (2026-08-06)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §14
 *
 * ## 검증 대상
 *
 * 토지가 배율 한도를 넘으면 카드가 **사업용·비사업용 2장**으로 쪼개진다(「소득세법」 §104의3①4호나목 →
 * 「지방세법」 §106①2호 → 「지방세법 시행령」 §101 — 초과분만 중과). 여기에 파트별 취득가액이
 * 겹칠 때 순서가 문제였다(R-6·O-4 「미검증」):
 *
 *   (A) 파트 취득가액 확정 → 그 값을 **면적비로** 사업용·비사업용 안분
 *   (B) 먼저 쪼갠 뒤 각 조각의 취득가액을 따로 구함
 *
 * **(B)는 성립하지 않는다** — 사업용·비사업용은 같은 필지의 면적 구분이라 조각별 실지거래가액이
 * 애초에 존재하지 않는다. 그리고 같은 필지 안에서는 ㎡당 공시지가가 같으므로 **면적비 = 가액비**다
 * ⇒ 면적비 안분이 근사가 아니라 정확한 값이다.
 *
 * ⇒ (A)가 유일한 성립 순서이고, 두 경로 모두 이미 (A)다. 이 파일은 그 순서와 불변식을 **고정**한다.
 *
 * ## 고정 계약
 *   N-1  사업용 + 비사업용 취득가액의 합 = 파트 취득가액 (잔액 흡수 — 반올림 누락 0)
 *   N-2  두 카드의 취득가액 비율 = **면적 비율** (같은 필지 = 같은 단가)
 *   N-3  파트 취득가액을 바꾸면 두 카드가 **함께** 반응한다 (순서 (A)의 관찰 가능한 결과)
 *   N-4  환산 경로도 같다 — `applyPartAcqModes` 결과에 면적 안분이 적용된다
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates();

/** 바닥면적 10㎡ · 상업지역 배율 3 → 한도 30㎡. 토지 85㎡라 **55㎡ 초과**(비사업용). */
const LAND_AREA = 85;
const FOOTPRINT = 10;
const BUSINESS_AREA = 30; // 10 × 3

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    landAcquisitionDate: "2005-06-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "100000000",
    gbLandArea: String(LAND_AREA),
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: String(FOOTPRINT),
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbZoneType: "commercial",
    actualSalePrice: "2000000000",
    ...over,
  } as AssetForm;
}

function cards(asset: AssetForm) {
  const payload = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
  const result = dispatchGeneralBuilding(
    payload, 2_000_000_000, new Date("2026-02-16"), new Date(asset.acquisitionDate),
    0, 0, 2026, undefined, [], RATES, undefined, undefined, undefined,
  );
  const props = (result.aggregated as unknown as {
    properties?: Array<{ propertyId: string; acquisitionPrice?: number; isNonBusinessLand?: boolean }>;
  }).properties;
  const out: Record<string, number> = {};
  for (const p of props ?? []) out[p.propertyId] = p.acquisitionPrice ?? 0;
  return out;
}

const LAND_PRICE = 300_000_000;

describe("N-1 — 잔액 흡수 불변식", () => {
  it("사업용 + 비사업용 = 파트 취득가액", () => {
    const c = cards(gbAsset());
    expect(c.land_business + c.land_nbl).toBe(LAND_PRICE);
  });

  it("두 카드로 실제로 쪼개진다 (초과분이 있는 fixture임을 확인)", () => {
    const c = cards(gbAsset());
    expect(c.land_business).toBeGreaterThan(0);
    expect(c.land_nbl).toBeGreaterThan(0);
    expect(c.land).toBeUndefined(); // 분할되면 단일 `land` 카드는 없다
  });
});

describe("N-2 — 면적비 = 가액비 (같은 필지는 단가가 같다)", () => {
  it("사업용 취득가액 = floor(파트 취득가액 × 사업용면적 / 전체면적)", () => {
    const c = cards(gbAsset());
    expect(c.land_business).toBe(Math.floor((LAND_PRICE * BUSINESS_AREA) / LAND_AREA));
  });

  it("비사업용은 잔액이다 — 비율로 재계산하지 않는다", () => {
    const c = cards(gbAsset());
    expect(c.land_nbl).toBe(LAND_PRICE - Math.floor((LAND_PRICE * BUSINESS_AREA) / LAND_AREA));
  });
});

describe("N-3 — 순서 (A)의 관찰 가능한 결과", () => {
  it("파트 취득가액을 2배로 하면 두 카드가 함께 2배 방향으로 움직인다", () => {
    const base = cards(gbAsset());
    const doubled = cards(
      gbAsset({ landAcquisitionPrice: String(LAND_PRICE * 2) } as Partial<AssetForm>),
    );
    expect(doubled.land_business).toBeGreaterThan(base.land_business);
    expect(doubled.land_nbl).toBeGreaterThan(base.land_nbl);
    expect(doubled.land_business + doubled.land_nbl).toBe(LAND_PRICE * 2);
  });

  it("건물 파트 취득가액은 토지 분할에 영향을 주지 않는다 (축 분리)", () => {
    const base = cards(gbAsset());
    const other = cards(
      gbAsset({ buildingAcquisitionPrice: "900000000" } as Partial<AssetForm>),
    );
    expect(other.land_business).toBe(base.land_business);
    expect(other.land_nbl).toBe(base.land_nbl);
  });
});

describe("N-4 — 환산 경로도 같은 순서다", () => {
  /** 토지 환산 + 건물 환산 — `applyPartAcqModes` 결과에 면적 안분이 적용되는지 본다. */
  const estimated = gbAsset({
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: "",
    buildingAcquisitionPrice: "",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
  } as Partial<AssetForm>);

  it("환산 파트도 두 카드로 쪼개지고 합이 보존된다", () => {
    const c = cards(estimated);
    expect(c.land_business).toBeGreaterThan(0);
    expect(c.land_nbl).toBeGreaterThan(0);
    // 환산취득가 총액은 입력값이 아니라 산출값이라 합만 고정한다(면적비 관계는 아래에서).
    const total = c.land_business + c.land_nbl;
    expect(c.land_business).toBe(Math.floor((total * BUSINESS_AREA) / LAND_AREA));
  });
});

/**
 * N-5 — O-1 × O-4 상호작용 (계획서 C-13)
 *
 * §97②2호 판정은 **파트 단위**인데(O-1) 토지 파트는 NBL 초과로 **2카드**로 쪼개진다. 파트의
 * 나목(자본적지출·양도비)이 그 두 카드에 배분되면서 `Σ 배분 = 파트 나목` 불변식이 유지되는지 본다
 * (`allocateWithinGroup`의 잔액 흡수 — 메모리 `feedback_floor_residual_absorption`).
 */
describe("N-5 — 파트 나목이 NBL 2카드에 걸칠 때", () => {
  const LAND_CAPEX = 50_000_000;

  function expensesOf(asset: AssetForm) {
    const payload = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
    const result = dispatchGeneralBuilding(
      payload, 2_000_000_000, new Date("2026-02-16"), new Date(asset.acquisitionDate),
      0, 0, 2026, undefined, [], RATES, undefined, undefined, undefined,
    );
    const props = (result.aggregated as unknown as {
      properties?: Array<{ propertyId: string; necessaryExpense?: number }>;
    }).properties;
    // ⚠️ 결과 필드명은 `necessaryExpense`다 — `expenses`는 엔진 **input** 쪽 이름이라 결과에는 없다
    //    (probe로 확인 · 잘못 읽으면 0이 되어 「반영 안 됨」으로 오독한다).
    const out: Record<string, number> = {};
    for (const p of props ?? []) out[p.propertyId] = p.necessaryExpense ?? 0;
    return out;
  }

  it("실가 토지 파트의 자본적지출이 두 카드에 배분되고 합이 보존된다", () => {
    const e = expensesOf(
      gbAsset({ landDirectExpenses: String(LAND_CAPEX) } as Partial<AssetForm>),
    );
    expect(e.land_business + e.land_nbl).toBe(LAND_CAPEX);
  });

  it("배분 basis도 면적비다 — 사업용분이 면적 비율과 일치한다", () => {
    const e = expensesOf(
      gbAsset({ landDirectExpenses: String(LAND_CAPEX) } as Partial<AssetForm>),
    );
    expect(e.land_business).toBe(Math.floor((LAND_CAPEX * BUSINESS_AREA) / LAND_AREA));
  });
});
