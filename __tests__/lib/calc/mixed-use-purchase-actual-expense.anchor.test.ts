/**
 * anchor: 겸용 매매 실가 실비(필요경비) — 폼 필드 → 엔진 슬롯 배선 (R1 후속).
 *
 * 매매 실가(useActualAcquisition)는 개산공제(§163⑥) 배제 대신 실제 필요경비(자본적지출·양도비,
 * 법 §97①2·3호)를 입력받는다. 폼 `mixedHousing/CommercialActualExpense` → API가 엔진 공용 슬롯
 * `housing/commercialInheritedExpense`(usesDeemedAcq 경로 건물분 차감)로 매핑.
 *
 * ⚠️ 취득원인 종속 선택(stale 방지): 매매→Actual·증여→Gift·상속→Inherited (gift 필드 stale 잔존해도 무시).
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
    fixedAcquisitionPrice: "1000000000",
    ...over,
  };
}
const form = { transferDate: "2026-06-01", assets: [] } as unknown as TransferFormData;
const payload = (a: AssetForm) =>
  buildMixedUsePayload(a, form) as Record<string, unknown> | undefined;

describe("겸용 매매 실가 실비 배선 (R1 후속)", () => {
  it("매매 실가 + 실비 입력 → housing/commercialInheritedExpense 슬롯으로 매핑", () => {
    const p = payload(
      asset({ mixedHousingActualExpense: "30000000", mixedCommercialActualExpense: "20000000" }),
    );
    expect(p?.useActualAcquisition).toBe(true);
    expect(p?.acquisitionActualTotalPrice).toBe(1_000_000_000);
    expect(p?.housingInheritedExpense).toBe(30_000_000);
    expect(p?.commercialInheritedExpense).toBe(20_000_000);
  });

  it("매매 실가 + 실비 미입력 → undefined(필요경비 0)", () => {
    const p = payload(asset());
    expect(p?.useActualAcquisition).toBe(true);
    expect(p?.housingInheritedExpense).toBeUndefined();
    expect(p?.commercialInheritedExpense).toBeUndefined();
  });

  it("stale 방지: 매매인데 gift 실비 필드 잔존 → Actual 필드만 채택(gift stale 무시)", () => {
    const p = payload(
      asset({
        mixedHousingActualExpense: "30000000",
        mixedHousingGiftExpense: "99000000", // stale (이전 증여 입력 잔존)
      }),
    );
    expect(p?.housingInheritedExpense).toBe(30_000_000); // gift stale 99M 무시
  });

  it("R(회귀): 환산 모드(useEstimated) → useActualAcquisition false·실비 미매핑", () => {
    const p = payload(asset({ useEstimatedAcquisition: true, mixedHousingActualExpense: "30000000" }));
    expect(p?.useActualAcquisition).toBe(false);
    expect(p?.housingInheritedExpense).toBeUndefined();
  });

  it("R(회귀): 감정가액 모드(isAppraisal) → useActualAcquisition false·실비 미매핑", () => {
    const p = payload(asset({ isAppraisalAcquisition: true, mixedHousingActualExpense: "30000000" }));
    expect(p?.useActualAcquisition).toBe(false);
    expect(p?.housingInheritedExpense).toBeUndefined();
  });

  it("R(회귀): 증여 취득 → gift 실비 채택(Actual 아님)", () => {
    const p = payload(
      asset({
        acquisitionCause: "gift",
        mixedHousingGiftExpense: "40000000",
        mixedHousingActualExpense: "99000000", // 매매 필드 stale
      }),
    );
    expect(p?.useActualAcquisition).toBe(false);
    expect(p?.housingInheritedExpense).toBe(40_000_000); // gift 채택, Actual stale 무시
  });
});
