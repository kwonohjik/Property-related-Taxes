/**
 * anchor — 겸용주택 × 축 B 둘째 이후 지분 카드 ③ · ⑧ (계획서 `bg-mixed-use-m2-bundle-share.plan.md` V-0 fix).
 *
 * 지분 카드는 `makeDefaultAsset`로 생겨 겸용 토글이 없다(① 숨김). 종전에는 ③에 겸용 취득 칸이 뜨지 않아 일반 주택 칸만 입력했고 ④도 일반 주택으로 보냈다.
 * 이제 ③은 첫 카드의 물건 단위 겸용 칸을 받아 겸용 취득 칸만 열고(양도시 칸은 숨김 — 자산 1 값), ⑧은 지분 카드가 받지 않는 두 조합(용도변경 · 지분 카드 미공시)을 막는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { makeDefaultAsset, type AssetForm } from "@/lib/stores/calc-wizard-asset";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { MIXED_SHARE_PARTIAL_CHANGE_MESSAGE, MIXED_SHARE_PHD_MESSAGE } from "@/lib/calc/transfer-tax-validate-mixed-use-share";

afterEach(cleanup);

type Over = Record<string, unknown>;
const OBJECT = {
  assetKind: "housing", isMixedUseHouse: true, mixedZoneType: "green", addressJibun: "제주특별자치도 강남구 테스트동 1-1",
  residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50", mixedUseTotalLandArea: "300",
  mixedTransferHousingPrice: "1600000000", mixedTransferCommercialBuildingPrice: "200000000", mixedTransferLandPricePerSqm: "1000000",
};
const ACQ = {
  acquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "500000000",
  mixedAcqHousingPrice: "400000000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqLandPricePerSqm: "300000",
};
const primary = (o: Over = {}) => ({ ...makeDefaultAsset(1), ...OBJECT, ...ACQ, ownershipNumerator: "60", ownershipDenominator: "100", ...o }) as AssetForm;
/** 화면이 만드는 둘째 지분 — 겸용 칸 없음(저장 자산 종류 주택) */
const share = (o: Over = {}) => ({ ...makeDefaultAsset(2), ...ACQ, ownershipNumerator: "40", ownershipDenominator: "100", ...o }) as AssetForm;

function renderShare(p: AssetForm, s: AssetForm) {
  const { container } = render(
    <CompanionAssetCard index={1} asset={s} primaryAsset={p} bundledSaleMode="apportioned" onChange={() => {}} transferDate="2024-06-01"
      splitMode="fractional" onFractionalToggle={() => {}} hasSiblings forceOpenAll />,
  );
  const sec3 = container.querySelector('[data-asset-section="3"]');
  return {
    field: (f: string) => sec3?.querySelector(`[data-field="${f}"]`) ?? null,
    has: (id: string) => sec3?.querySelector(`[data-testid="${id}"]`) != null,
  };
}
const form = (assets: AssetForm[]) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "2000000000", assetSplitMode: "fractional",
    householdHousingCount: "1", isOneHousehold: true, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets,
  }) as TransferFormData;
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4, 5].flatMap((st) => collectStepIssues(st, f));

describe("MSC-1 지분 카드 ③ — 겸용 취득 칸만 연다", () => {
  it("취득시 기준시가 3칸이 보이고 양도시 칸은 없다 · 물건 단위 안내", () => {
    const c = renderShare(primary(), share());
    expect(c.field("mixedAcqCommercialBuildingPrice")).not.toBeNull();
    expect(c.field("mixedAcqLandPricePerSqm")).not.toBeNull();
    expect(c.has("mixed-share-object-fields-note")).toBe(true);
    expect(c.field("mixedTransferHousingPrice")).toBeNull();
    expect(c.field("mixedTransferLandPricePerSqm")).toBeNull();
  });
  it("🔴 짝: 첫 카드가 겸용이 아니면 겸용 칸이 없다", () => {
    const c = renderShare(primary({ isMixedUseHouse: false }), share());
    expect(c.field("mixedAcqCommercialBuildingPrice")).toBeNull();
    expect(c.has("mixed-share-object-fields-note")).toBe(false);
  });
});

describe("MSC-2 ⑧ — 지분 카드가 받지 않는 조합", () => {
  it("첫 카드 보유 중 일부 용도변경 → 자산 1 토글 칸으로 막는다", () => {
    const f = form([primary({ hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial" }), share()]);
    const hit = issues(f).filter((i) => i.message.includes(MIXED_SHARE_PARTIAL_CHANGE_MESSAGE));
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ assetIndex: 0, field: "hasPartialUsageChange" });
  });
  it("둘째 지분 카드 미공시 환산 → 그 카드 토글 칸으로 막는다 · 짝: 첫 카드 미공시는 이 사유로 막지 않는다", () => {
    const hit = issues(form([primary(), share({ usePreHousingDisclosure: true })])).filter((i) => i.message.includes(MIXED_SHARE_PHD_MESSAGE));
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ assetIndex: 1, field: "usePreHousingDisclosure" });
    expect(issues(form([primary({ usePreHousingDisclosure: true }), share()])).some((i) => i.message.includes(MIXED_SHARE_PHD_MESSAGE))).toBe(false);
  });
  it("🔴 짝: 지분 분할이 아니면(단건) 용도변경을 이 사유로 막지 않는다", () => {
    const single = Object.assign(form([primary({ ownershipNumerator: "", ownershipDenominator: "", hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial" })]), { assetSplitMode: undefined });
    expect(issues(single).some((i) => i.message.includes(MIXED_SHARE_PARTIAL_CHANGE_MESSAGE))).toBe(false);
  });
});
