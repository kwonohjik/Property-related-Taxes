/**
 * Pre-Do anchor — 일반건물 토지·건물 파트별 취득 (P1)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md`
 * 이 파일은 **구현 전에** 작성돼 현행에서 실패한다(정책 `feedback_pre_anchor_verification`).
 *
 * ## 전제 — M-1a 규약 (계획서 §3.2)
 *
 * 폼·엔진 전 계층에서 필드 의미를 split 규약으로 통일한다.
 *   `acquisitionDate`     = **건물** 취득일
 *   `landAcquisitionDate` = **토지** 취득일
 *   `gbBuildingAcquisitionDate` = 폐기
 *
 * 아래 fixture는 **전환 후 규약**으로 쓴다. 그래서 현행 코드에서는 토지 취득일이 어디에도
 * 도달하지 못해 A-1·A-2가 실패하고, 그 결과 A-3의 세액도 어긋난다.
 *
 * ## 고정 계약
 *   A-1  API 변환이 **실거래가 모드에서도** 건물 취득일을 싣고, 토지 취득일도 함께 싣는다
 *   A-2  카드 취득일이 파트별이다 — 토지 카드 = 토지 취득일 / 건물 카드 = 건물 취득일
 *   A-3  건물 취득일이 **세액에 반영**된다 (§1.3 실측 결함의 해소)
 *
 * ⚠️ A-3의 환산 고정값은 계획서 §1.3 probe와 **같은 fixture**다. 실가 경로의 사후 기대값은
 *    구현 전에는 알 수 없으므로 **방향(공제 축소·세액 증가)**으로 고정한다 — 숫자를 지어내지 않는다.
 */
import { describe, it, expect } from "vitest";
import { dispatchGeneralBuilding } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../_helpers/mock-rates";

const RATES = makeMockRates();

/** 토지 1999-05-24 취득 · 건물은 케이스별 · 양도 2026-02-16 */
const LAND_ACQ = "1999-05-24";
const BUILDING_ACQ_LATER = "2020-03-01";
const TRANSFER = "2026-02-16";
const TOTAL_TRANSFER = 2_000_000_000;

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    useEstimatedAcquisition: false,
    // M-1a 규약 — acquisitionDate = 건물, landAcquisitionDate = 토지
    acquisitionDate: LAND_ACQ,
    landAcquisitionDate: LAND_ACQ,
    hasSeperateLandAcquisitionDate: false,
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "180.96",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbZoneType: "commercial",
    ...over,
  } as AssetForm;
}

/** 취득일이 다른(= 분리 ON) 자산 */
function gbSeparate(over: Partial<AssetForm> = {}): AssetForm {
  return gbAsset({
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: LAND_ACQ,
    acquisitionDate: BUILDING_ACQ_LATER,
    ...over,
  });
}

const ESTIMATED_FIELDS: Partial<AssetForm> = {
  useEstimatedAcquisition: true,
  gbAcqLandPricePerSqm: "2800000",
  gbAcqBuildingValue: "2814470",
};

function run(asset: AssetForm, actualAcquisitionPrice = 600_000_000) {
  const payload = buildGeneralBuildingValuation(asset) as Record<string, unknown>;
  const result = dispatchGeneralBuilding(
    payload,
    TOTAL_TRANSFER,
    new Date(TRANSFER),
    // route.ts:383 — 자산 단위 취득일. M-1a 후에는 **건물** 취득일이다.
    new Date(asset.acquisitionDate),
    actualAcquisitionPrice,
    0,
    2026,
    undefined,
    [],
    RATES,
    undefined,
    undefined,
    undefined,
  );
  return { payload, result };
}

/** 카드별 취득일을 ISO 날짜 문자열로 */
function cardDates(result: ReturnType<typeof run>["result"]): Record<string, string> {
  const detail = result.aggregated.generalBuildingValuationDetail as
    | { assetCards?: Array<{ propertyId: string; acquisitionDate?: Date }> }
    | undefined;
  const out: Record<string, string> = {};
  for (const c of detail?.assetCards ?? []) {
    out[c.propertyId] = c.acquisitionDate?.toISOString().slice(0, 10) ?? "";
  }
  return out;
}

/** 카드별 장기보유특별공제 */
function cardLthd(result: ReturnType<typeof run>["result"]): Record<string, number> {
  const props = (result.aggregated as unknown as {
    properties?: Array<{ propertyId: string; longTermHoldingDeduction: number }>;
  }).properties;
  const out: Record<string, number> = {};
  for (const p of props ?? []) out[p.propertyId] = p.longTermHoldingDeduction;
  return out;
}

describe("A-1 — API 변환이 파트별 취득일을 싣는다", () => {
  it("실거래가 모드 payload에 건물 취득일이 있다 (§1.3 결함)", () => {
    const { payload } = run(gbSeparate());
    expect(payload.buildingAcquisitionDate).toBe(BUILDING_ACQ_LATER);
  });

  it("실거래가 모드 payload에 토지 취득일이 있다", () => {
    const { payload } = run(gbSeparate());
    expect(payload.landAcquisitionDate).toBe(LAND_ACQ);
  });

  it("환산 모드 payload에도 두 취득일이 모두 있다", () => {
    const { payload } = run(gbSeparate(ESTIMATED_FIELDS));
    expect(payload.buildingAcquisitionDate).toBe(BUILDING_ACQ_LATER);
    expect(payload.landAcquisitionDate).toBe(LAND_ACQ);
  });
});

describe("A-2 — 카드 취득일이 파트별이다", () => {
  it("실거래가 모드: 토지 카드 = 1999 · 건물 카드 = 2020", () => {
    const dates = cardDates(run(gbSeparate()).result);
    expect(dates.land).toBe(LAND_ACQ);
    expect(dates.building).toBe(BUILDING_ACQ_LATER);
  });

  it("환산 모드: 토지 카드 = 1999 · 건물 카드 = 2020", () => {
    const dates = cardDates(run(gbSeparate(ESTIMATED_FIELDS)).result);
    expect(dates.land).toBe(LAND_ACQ);
    expect(dates.building).toBe(BUILDING_ACQ_LATER);
  });

  it("분리 OFF(두 날짜 동일)면 두 카드가 같은 날짜다 — 회귀 0", () => {
    const dates = cardDates(run(gbAsset()).result);
    expect(dates.land).toBe(LAND_ACQ);
    expect(dates.building).toBe(LAND_ACQ);
  });
});

describe("A-3 — 건물 취득일이 세액에 반영된다", () => {
  /**
   * ⚠️ **토지 공제 불변 단언이 이 anchor의 핵심**이다. 이것 없이 「건물 공제 축소 + 세액 증가」만
   *    보면 현행에서도 통과한다 — 현행은 자산 단위 취득일(=건물 2020)이 **토지 카드까지** 덮어써
   *    토지 공제가 함께 무너지면서 같은 방향이 나오기 때문이다(P1 자가검토에서 발견한 거짓 통과).
   */
  it("실거래가 모드: 건물만 늦어지면 **토지 공제는 그대로**·건물 공제만 줄고 세액이 는다", () => {
    const same = run(gbAsset()).result; // 토지·건물 모두 1999
    const later = run(gbSeparate()).result; // 토지 1999 · 건물 2020

    expect(cardLthd(later).land).toBe(cardLthd(same).land); // 토지는 영향 없음
    expect(cardLthd(later).building).toBeLessThan(cardLthd(same).building);
    expect(later.aggregated.totalTax).toBeGreaterThan(same.aggregated.totalTax);
  });

  it("환산 모드 고정값 — 계획서 §1.3 probe와 동일 fixture", () => {
    const same = run(gbAsset(ESTIMATED_FIELDS)).result;
    const later = run(gbSeparate(ESTIMATED_FIELDS)).result;

    expect(cardLthd(same).building).toBe(11_331_677);
    expect(same.aggregated.totalTax).toBe(439_411_088);
    expect(cardLthd(later).building).toBe(3_777_225);
    expect(later.aggregated.totalTax).toBe(443_150_543);
  });
});
