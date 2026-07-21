/**
 * anchor: 겸용 감정가액·매매사례가액 API 매핑 (R-B).
 *
 * 겸용 매매 + 감정가액(isAppraisal)/매매사례(isSalesCase) → useAppraisalSalesAcquisition=true +
 * acquisitionActualTotalPrice(감정=fixedAcquisitionPrice · 매매사례=similarSalesValue). 실거래가·환산과 배타.
 */
import { describe, it, expect } from "vitest";
import { buildMixedUsePayload } from "@/lib/calc/transfer-tax-api-mixed-use";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    acquisitionDate: "2020-06-01",
    acquisitionCause: "purchase",
    ...over,
  };
}
const form = { transferDate: "2026-06-01", assets: [] } as unknown as TransferFormData;
const payload = (a: AssetForm) =>
  buildMixedUsePayload(a, form) as Record<string, unknown> | undefined;

describe("겸용 감정가액·매매사례가액 API 매핑 (R-B)", () => {
  it("감정가액 → useAppraisalSalesAcquisition + acquisitionActualTotalPrice=fixedAcquisitionPrice", () => {
    const p = payload(asset({ isAppraisalAcquisition: true, fixedAcquisitionPrice: "800000000" }));
    expect(p?.useAppraisalSalesAcquisition).toBe(true);
    expect(p?.useActualAcquisition).toBe(false);
    expect(p?.acquisitionActualTotalPrice).toBe(800_000_000);
  });

  it("매매사례가액 → acquisitionActualTotalPrice=similarSalesValue(감정과 다른 소스)", () => {
    const p = payload(
      asset({
        isSalesCaseAcquisition: true,
        similarSalesValue: "700000000",
        fixedAcquisitionPrice: "999000000", // 매매사례는 similarSalesValue를 써야 함(fixed 무시)
      }),
    );
    expect(p?.useAppraisalSalesAcquisition).toBe(true);
    expect(p?.acquisitionActualTotalPrice).toBe(700_000_000);
  });

  it("R(회귀): 실거래가 → useActual true·useAppraisalSales false", () => {
    const p = payload(asset({ fixedAcquisitionPrice: "1000000000" }));
    expect(p?.useActualAcquisition).toBe(true);
    expect(p?.useAppraisalSalesAcquisition).toBe(false);
  });

  it("R(회귀): 환산 모드 → 둘 다 false", () => {
    const p = payload(asset({ useEstimatedAcquisition: true, isAppraisalAcquisition: true }));
    expect(p?.useActualAcquisition).toBe(false);
    expect(p?.useAppraisalSalesAcquisition).toBe(false);
  });
});
