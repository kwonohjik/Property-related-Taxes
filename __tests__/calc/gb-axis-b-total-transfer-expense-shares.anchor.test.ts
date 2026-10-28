/**
 * anchor — 일반건물 지분 빌더(`buildGeneralBuildingShares`)의 총 양도비 주입 (계획서 gb-total-transfer-expense-loss §5.1)
 *
 *   S-1  자산 칸이 비어 있으면 총 양도비(100% 기준)가 카드 `valuation.transferExpense` 가 되고 지분율만큼 줄어든다
 *   S-2  자산 칸이 있으면 그 칸이 우선한다 (`effectiveTransferExpenseFor` 와 같은 우선순위)
 *   S-3  총 양도비가 0·미전달이면 종전 그대로 — 키 자체가 생기지 않는다
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingShares } from "@/lib/calc/transfer-tax-api-gb-shares";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", useEstimatedAcquisition: true,
  landAcqMode: "actual", landAcquisitionPrice: "400000000", buildingAcqMode: "actual", buildingAcquisitionPrice: "200000000",
};
const card = (id: number, n: string, over: Partial<AssetForm> = {}) =>
  Object.assign({ ...makeDefaultAsset(id) }, BASE, { ownershipNumerator: n, ownershipDenominator: "100" }, over) as AssetForm;
const txOf = (shares: ReturnType<typeof buildGeneralBuildingShares>) => shares?.map((s) => s.valuation.transferExpense);

describe("지분 빌더 — 총 양도비 주입", () => {
  it("S-1 자산 칸이 비면 총 5,000,000(100% 기준) × 지분율 → 3,000,000 · 2,000,000", () => {
    const s = buildGeneralBuildingShares([card(1, "60"), card(2, "40")], "2026-02-16", "fractional", 5_000_000);
    expect(txOf(s)).toEqual([3_000_000, 2_000_000]);
  });

  it("S-2 자산 칸이 있으면 그 칸이 우선 — 카드1 1,000,000 × 0.6 = 600,000, 카드2 는 총 양도비 × 0.4 = 2,000,000", () => {
    const s = buildGeneralBuildingShares(
      [card(1, "60", { transferExpense: "1000000" }), card(2, "40")],
      "2026-02-16",
      "fractional",
      5_000_000,
    );
    expect(txOf(s)).toEqual([600_000, 2_000_000]);
  });

  it("S-3 총 양도비 0·미전달 → 종전 그대로 (키 없음)", () => {
    for (const total of [undefined, 0]) {
      const s = buildGeneralBuildingShares([card(1, "60"), card(2, "40")], "2026-02-16", "fractional", total);
      expect(s?.map((x) => "transferExpense" in x.valuation)).toEqual([false, false]);
    }
  });
});
