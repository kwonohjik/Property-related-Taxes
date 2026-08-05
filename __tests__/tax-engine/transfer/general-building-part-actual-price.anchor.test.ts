/**
 * Pre-Do anchor — 🔴 분리 ON + 두 파트 모두 실거래가에서 **파트 취득가액이 엔진에 도달하지 않는다**
 * (O-3 조사 중 발견 · 2026-08-06)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §11.5
 *
 * ## 무엇이 잘못됐나
 *
 * 「두 파트 모두 실거래가」는 `anyEstimated === false`라 **환산 경로로 가지 않고 실가 경로**로 간다
 * (`transfer-tax-api-gb.ts` 라우팅). 그런데 실가 경로(`general-building-route-helper.ts`)는
 * 취득가액을 **자산 총액 `actualAcquisitionPrice`의 §166⑥ 비율 안분**으로만 구하고, payload에
 * 실려 온 `landAcquisitionPrice`/`buildingAcquisitionPrice`를 **destructure조차 하지 않는다**.
 *
 * 동시에 분리 ON에서는 자산 단위 취득가액 칸이 화면에서 사라진다(`hideAssetAcqAxis`). 그래서
 * `fixedAcquisitionPrice`가 비고 → `bundledAcq = 0` → **취득가액 0**이 된다.
 *
 * validate는 이 상태를 **통과시킨다**(실측 PASS) — V-7이 파트 취득가액만 요구하고 자산 단위 칸은
 * 분리 ON에서 요구하지 않기 때문이다.
 *
 * ## probe 실측 (2026-08-06)
 *
 *   파트 취득가액 3억 + 1억 입력 · 자산 단위 취득가액 비움(bundledAcq=0)
 *     → 카드 취득가액 `land=0 building=0` · 세액 **621,398,452원**
 *   같은 입력에 자산 단위 4억을 넣으면
 *     → 카드 취득가액 `land=391,232,515 building=8,767,485` · 세액 **482,364,461원**
 *   ⇒ **과대과세 139,033,991원**. 그리고 파트 값을 3억+1억 → 9억+8억으로 바꿔도 세액이 불변이다.
 *
 * ## 법령
 *
 * 「소득세법」 제97조 제1항 제1호 가목은 취득가액을 **그 자산의** 실지거래가액으로 정하고,
 * §100② 전문은 「토지와 건물 등을 함께 취득하거나 양도한 경우에는 이를 **각각 구분하여 기장**하되
 * 토지와 건물 등의 가액 **구분이 불분명할 때에만**」 안분하라고 한다. 별개 취득으로 파트별
 * 실지거래가액이 실재하면 구분이 분명하므로 **안분 대상이 아니다**.
 *
 * ## 고정 계약
 *   P-1  파트 취득가액이 둘 다 있으면 자산 총액과 무관하게 **그 값이 카드 취득가액**이다
 *   P-2  세액이 파트 취득가액에 **반응**한다
 *   P-3  파트 취득가액이 없으면 종전대로 자산 총액을 §166⑥ 안분한다 (회귀 0)
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates();

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
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "180.96",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbZoneType: "commercial",
    actualSalePrice: "2000000000",
    ...over,
  } as AssetForm;
}

/** @param bundledAcq route.ts의 `bundledAcq` — 분리 ON에서 자산 단위 칸이 숨으므로 실전값은 0이다. */
function run(asset: AssetForm, bundledAcq: number) {
  const payload = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
  const result = dispatchGeneralBuilding(
    payload,
    2_000_000_000,
    new Date("2026-02-16"),
    new Date(asset.acquisitionDate),
    bundledAcq,
    0,
    2026,
    undefined,
    [],
    RATES,
    undefined,
    undefined,
    undefined,
  );
  const props = (result.aggregated as unknown as {
    properties?: Array<{ propertyId: string; acquisitionPrice?: number }>;
  }).properties;
  const cards: Record<string, number> = {};
  for (const p of props ?? []) cards[p.propertyId] = p.acquisitionPrice ?? 0;
  return { cards, tax: result.aggregated.totalTax };
}

const LAND_PRICE = 300_000_000;
const BLD_PRICE = 100_000_000;

const bothActual = gbAsset({
  landAcquisitionPrice: String(LAND_PRICE),
  buildingAcquisitionPrice: String(BLD_PRICE),
} as Partial<AssetForm>);

describe("P-1 — 파트 취득가액이 카드 취득가액이 된다", () => {
  it("🔴 자산 단위 취득가액이 0이어도 파트 값이 그대로 쓰인다", () => {
    const { cards } = run(bothActual, 0);
    expect(cards.land).toBe(LAND_PRICE);
    expect(cards.building).toBe(BLD_PRICE);
  });

  it("🔴 자산 총액이 있어도 **파트 값이 우선**한다 — 구분이 분명하면 안분 대상이 아니다(§100② 전문)", () => {
    const { cards } = run(bothActual, 999_999_999);
    expect(cards.land).toBe(LAND_PRICE);
    expect(cards.building).toBe(BLD_PRICE);
  });
});

describe("P-2 — 세액이 파트 취득가액에 반응한다", () => {
  it("🔴 파트 취득가액을 올리면 세액이 줄어든다", () => {
    const low = run(bothActual, 0).tax;
    const high = run(
      gbAsset({
        landAcquisitionPrice: "900000000",
        buildingAcquisitionPrice: "800000000",
      } as Partial<AssetForm>),
      0,
    ).tax;
    expect(high).toBeLessThan(low);
  });

  it("🔴 취득가액 0으로 계산되던 과대과세가 사라진다", () => {
    // probe 실측: 종전에는 파트 값을 넣어도 621,398,452원(취득가액 0)이었다.
    expect(run(bothActual, 0).tax).toBeLessThan(621_398_452);
  });
});

describe("P-3 — 파트 값이 없으면 종전 안분 (회귀 0)", () => {
  it("파트 취득가액 미입력 + 자산 총액 4억 → §166⑥ 안분 그대로", () => {
    const { cards, tax } = run(gbAsset(), 400_000_000);
    expect(cards.land).toBe(391_232_515);
    expect(cards.building).toBe(8_767_485);
    expect(tax).toBe(482_364_461);
  });

  it("한쪽만 입력되면 안분을 유지한다 — 반쪽 값으로 총액을 대체하지 않는다", () => {
    const { cards } = run(
      gbAsset({ landAcquisitionPrice: String(LAND_PRICE) } as Partial<AssetForm>),
      400_000_000,
    );
    expect(cards.land).toBe(391_232_515);
    expect(cards.building).toBe(8_767_485);
  });
});

/**
 * P-4 — 파트별 **자본적지출**도 같은 명시 매핑에서 침묵 strip돼 있었다 (2026-08-06)
 *
 * P5(PR #1081)가 `landExp = landDirectExpenses ?? 안분분`을 구현했지만
 * `dispatchGeneralBuilding`의 실가 경로 호출부가 그 두 필드를 나열하지 않아 항상 `undefined`였다
 * — 즉 **직접 귀속이 한 번도 적용되지 않았고** 늘 §166⑥ 안분분이 쓰였다.
 */
describe("P-4 — 파트별 자본적지출이 실가 경로에 도달한다", () => {
  it("🔴 토지분 자본적지출을 직접 귀속하면 세액이 바뀐다", () => {
    const withDirect = run(
      gbAsset({
        landAcquisitionPrice: String(LAND_PRICE),
        buildingAcquisitionPrice: String(BLD_PRICE),
        landDirectExpenses: "50000000",
      } as Partial<AssetForm>),
      0,
    ).tax;
    expect(withDirect).toBeLessThan(run(bothActual, 0).tax);
  });

  it("직접 귀속이 없으면 종전 안분 그대로 (회귀 0)", () => {
    // 자산 총액 필요경비만 있는 경우 — dispatch 6번째 인자(actualExpenses)로 전달된다.
    const payload = buildGeneralBuildingValuation(gbAsset()) as Record<string, unknown>;
    const r = dispatchGeneralBuilding(
      payload, 2_000_000_000, new Date("2026-02-16"), new Date("2015-03-01"),
      400_000_000, 30_000_000, 2026, undefined, [], RATES, undefined, undefined, undefined,
    );
    expect(r.aggregated.totalTax).toBeLessThan(482_364_461); // 필요경비가 반영돼 세액이 준다
  });
});
