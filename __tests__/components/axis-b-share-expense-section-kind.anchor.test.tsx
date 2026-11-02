/**
 * anchor — 축 B 둘째 이후 지분 카드 ④ 필요경비는 ③과 같은 판정 자산(첫 카드 자산 종류)으로 렌더한다
 * (계획서 `docs/02-design/features/axis-b-share-expense-section-kind.plan.md` Q-1 a).
 *
 * 둘째 지분은 화면이 `makeDefaultAsset`으로 만들어 저장 자산 종류가 「주택」이다. ⑧은 병합 자산(첫 카드 종류)으로 막는데
 * ④만 저장값을 읽어, 재개발 지분 옛 칸 + 자본적 지출액이면 칸이 숨은 채 막혔다(막다른 길) · 옛 칸·재개발·일반건물 안내도 없었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { makeDefaultAsset, type AssetForm } from "@/lib/stores/calc-wizard-asset";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

type Over = Record<string, unknown>;
const redev = (i: number, n: string, o: Over = {}) =>
  ({
    ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-1`, assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2010-01-01",
    redevSubject: "apt", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74", redevExemptionEligibleAtApproval: "no",
    redevApprovalDate: "2018-05-01", redevSettlementDirection: "pay", redevSettlementSaleDate: "2023-05-01",
    redevRightsValue: "500000000", redevSettlementAmount: i === 1 ? "48000000" : "32000000", redevPreApprovalExpenses: "0",
    redevActualAcquisitionPrice: "300000000", fixedAcquisitionPrice: "300000000", useEstimatedAcquisition: false,
    standardPriceAtTransfer: "800000000", standardPriceAtAcq: "300000000", actualSalePrice: "", ownershipNumerator: n, ownershipDenominator: "100", ...o,
  }) as AssetForm;
/** 화면이 만드는 둘째 지분 — 저장 자산 종류 기본값(주택) */
const stored = (a: AssetForm) => ({ ...a, assetKind: "housing", redevSubject: "" }) as AssetForm;
const gb = (i: number, o: Over = {}) =>
  ({
    ...makeDefaultAsset(i), addressJibun: "서울 강남구 역삼동 1", assetKind: "general_building", acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2010-05-01", landAcquisitionDate: "2005-05-01",
    gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
    hasSeperateLandAcquisitionDate: false, ownershipNumerator: "50", ownershipDenominator: "100", ...o,
  }) as AssetForm;

function shareCard(primary: AssetForm, share: AssetForm) {
  const { container } = render(
    <CompanionAssetCard index={1} asset={share} primaryAsset={primary} bundledSaleMode="apportioned" onChange={() => {}} transferDate="2024-06-01"
      splitMode="fractional" onFractionalToggle={() => {}} hasSiblings />,
  );
  const sec4 = container.querySelector('[data-asset-section="4"]');
  return {
    legacyField: sec4?.querySelector('[data-field="directExpenses"]') ?? null,
    has: (id: string) => sec4?.querySelector(`[data-testid="${id}"]`) != null,
  };
}
const form = (assets: AssetForm[]) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1000000000", assetSplitMode: "fractional", bundledSaleMode: "apportioned",
    householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets,
  }) as TransferFormData;
const shareIssueFields = (f: TransferFormData) =>
  [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f)).filter((i) => i.assetIndex === 1).map((i) => i.field);

describe("AXK-1 재개발 지분 — ⑧이 지목하는 옛 칸이 ④에 보인다", () => {
  it.each([
    ["옛 칸 + 자본적 지출액(종전 막다른 길)", { capitalExpenditure: "1000000" }],
    ["옛 칸 + 양도비(종전 막다른 길)", { transferExpense: "1000000" }],
    ["옛 칸만", {}],
  ])("%s", (_n, extra) => {
    const primary = redev(1, "60");
    const share = stored(redev(2, "40", { directExpenses: "7000000", ...extra }));
    expect(shareIssueFields(form([primary, share]))).toEqual(["directExpenses"]);
    const card = shareCard(primary, share);
    expect(card.legacyField).not.toBeNull();
    expect(card.has("redev-legacy-expense-unused-notice")).toBe(true);
  });
});

describe("AXK-2 첫 카드와 같은 안내가 둘째 지분 ④에도 뜬다", () => {
  it("재개발 지분 — 「자본적지출은 인가 후 분」 안내", () => {
    expect(shareCard(redev(1, "60"), stored(redev(2, "40"))).has("redev-expense-post-approval-notice")).toBe(true);
  });
  it("일반건물 환산 지분 — 옛 칸 안내(⑧ 차단과 같은 술어)", () => {
    const primary = gb(1, { useEstimatedAcquisition: true });
    const share = stored(gb(2, { useEstimatedAcquisition: true, directExpenses: "3000000" }));
    expect(shareIssueFields(form([primary, share]))).toContain("directExpenses");
    expect(shareCard(primary, share).has("gb-legacy-expense-unused-notice")).toBe(true);
  });
  it("일반건물 감정 지분 — 개산공제뿐 안내(둘째 지분 자본적 지출액은 세액에 쓰이지 않는다 — 계획서 §4)", () => {
    const appraisal = { isAppraisalAcquisition: true, landAcqMode: "appraisal", buildingAcqMode: "appraisal" };
    expect(shareCard(gb(1, appraisal), stored(gb(2, appraisal))).has("gb-deduction-only-notice")).toBe(true);
  });
});
