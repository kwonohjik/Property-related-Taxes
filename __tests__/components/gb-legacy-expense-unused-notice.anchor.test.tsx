/**
 * anchor — 일반건물 옛 필요경비 칸이 쓰이지 않는 조합의 ⑤ 안내 (계획서 `docs/00-pm/gb-legacy-direct-expense-estimated-mixed.plan.md` Q-1 a).
 * ⑤ 안내와 ⑧ 차단은 같은 술어·같은 문장을 읽는다(`gb-legacy-expense-unused.ts`) — 둘이 어긋나면 안내가 없는데 막히거나 안내만 있고 통과한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { GB_LEGACY_EXPENSE_UNUSED_MESSAGE, gbLegacyExpenseUnused } from "@/lib/calc/gb-legacy-expense-unused";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const gb = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 역삼동 1", assetKind: "general_building", acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2010-05-01", landAcquisitionDate: "2005-05-01", directExpenses: "3000000",
    gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
    actualSalePrice: "1600000000", hasSeperateLandAcquisitionDate: false, useEstimatedAcquisition: false, ...over,
  }) as AssetForm;
const form = (a: AssetForm) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-05-31", assets: [a], contractTotalPrice: "1600000000",
  }) as TransferFormData;
const renderExpense = (a: AssetForm) =>
  render(<AssetSectionExpense asset={a} onChange={() => {}} totalTransferExpense="" isSingleAsset isNonPrimaryAsset={false} />);
const blocked = (a: AssetForm) =>
  [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, form(a))).some((i) => i.field === "directExpenses");

describe("GL-1 ⑤ 안내 ≡ ⑧ 차단 ≡ 술어", () => {
  it.each([
    ["분리 OFF 전체 환산", { useEstimatedAcquisition: true }, true],
    ["분리 OFF 일괄 실가", { fixedAcquisitionPrice: "600000000" }, false],
    ["분리 ON 토지 실가 + 건물 감정", { hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "appraisal", landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000" }, true],
    ["분리 ON 감정 + 감정(개산공제뿐 — 안 쓰이는 것이 맞다)", { hasSeperateLandAcquisitionDate: true, landAcqMode: "appraisal", buildingAcqMode: "appraisal", landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "200000000" }, false],
    ["양도비 칸에 값이 있으면(옛 칸 숨김)", { useEstimatedAcquisition: true, transferExpense: "1000000" }, false],
    ["증축은 전용 규칙", { useEstimatedAcquisition: true, gbHasExtension: true }, false],
    ["부담부증여는 별도", { useEstimatedAcquisition: true, transferType: "burdened_gift" }, false],
    ["이월과세 환산 — 취득원인은 보지 않는다(계획서 non-purchase Q-1 a)", { useEstimatedAcquisition: true, acquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150,000,000", giftTaxAmount: "30,000,000", giftDateValuation: "400,000,000" } }, true],
    ["증여 토지(실가) + 건물 환산", { hasSeperateLandAcquisitionDate: true, acquisitionCause: "gift", landAcqMode: "actual", buildingAcqMode: "estimated", landAcquisitionPrice: "400000000" }, true],
    ["건물 신축(실가) + 토지 환산", { hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "newConstruction", landAcqMode: "estimated", buildingAcqMode: "actual", buildingAcquisitionPrice: "200000000" }, true],
    ["상속(둘 다 실가)은 모드가 실가에 고정돼 거짓", { hasSeperateLandAcquisitionDate: true, acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcqMode: "actual", buildingAcqMode: "actual", publishedValueAtInheritance: "300000000", gbBuildingInheritedValue: "200000000", decedentAcquisitionDate: "1970-01-01" }, false],
  ])("%s", (_n, over, expected) => {
    const a = gb(over);
    expect(gbLegacyExpenseUnused(a)).toBe(expected);
    if (expected) {
      expect(blocked(a)).toBe(true);
    }
  });

  it("안내문은 차단 메시지와 같은 문장이고 옛 칸 입력 위에 뜬다", () => {
    renderExpense(gb({ useEstimatedAcquisition: true }));
    const notice = screen.getByTestId("gb-legacy-expense-unused-notice");
    expect(notice.textContent).toBe(GB_LEGACY_EXPENSE_UNUSED_MESSAGE);
    expect(document.querySelector('[data-field="directExpenses"]')).not.toBeNull();
  });

  it("쓰이는 조합(분리 OFF 일괄 실가)에는 안내가 없다", () => {
    renderExpense(gb({ fixedAcquisitionPrice: "600000000" }));
    expect(screen.queryByTestId("gb-legacy-expense-unused-notice")).toBeNull();
    expect(document.querySelector('[data-field="directExpenses"]')).not.toBeNull();
  });

  it("옛 칸이 0 이면 칸도 안내도 없다", () => {
    renderExpense(gb({ useEstimatedAcquisition: true, directExpenses: "0" }));
    expect(screen.queryByTestId("gb-legacy-expense-unused-notice")).toBeNull();
    expect(document.querySelector('[data-field="directExpenses"]')).toBeNull();
  });
});
