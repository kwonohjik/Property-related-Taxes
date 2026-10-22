/**
 * anchor — «구분 기재 + 두 칸 비움» 안분 흔적 **렌더** (결과 카드 · 신고서 양식 표 각주) — 사용자 결정 Q-1 B
 *
 * 계획서: `docs/00-pm/sale-split-actual-both-empty.plan.md` §10.3
 *
 * 엔진을 실제로 돌린 결과를 렌더한다(손으로 만든 detail 금지 — `sale-split-judgment-display.test.tsx`와 같은 규약).
 * 면: ① `SplitGainDetailSection`(판정 블록 자리) ② `FilingFormTable` 표 아래 각주.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);
const rates = makeMockRates();

const STD_TEXT = "구분 기재를 선택했으나 토지·건물 양도가액이 입력되지 않아 양도시 기준시가 비율로 안분했습니다 (소득세법 시행령 §166 ⑥)";
const APP_TEXT = "구분 기재를 선택했으나 토지·건물 양도가액이 입력되지 않아 양도시 감정평가가액 비율로 안분했습니다 (소득세법 시행령 §166 ⑥)";

const mk = (over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_500_000_000, transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2016-06-01"), landAcquisitionDate: new Date("2014-06-01"), acquisitionPrice: 0,
    landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 400_000_000, landAcqMode: "actual", buildingAcqMode: "actual",
    isSeparateAcquisition: true, landStandardPriceAtTransfer: 900_000_000, buildingStandardPriceAtTransfer: 600_000_000,
    isOneHousehold: false, householdHousingCount: 1, isRegulatedArea: false, isUnregistered: false, isNonBusinessLand: false, ...over,
  });
const APP = { landAppraisalAtTransfer: 1_000_000_000, buildingAppraisalAtTransfer: 500_000_000 };

function formOf(mode: "actual" | "apportioned" | "appraisal"): TransferFormData {
  const f = createDefaultTransferFormData();
  return { ...f, transferDate: "2024-06-01", assets: [{ ...makeDefaultAsset(1), assetKind: "housing", saleSplitMode: mode } as never] } as TransferFormData;
}

describe("① 결과 카드 — SplitGainDetailSection", () => {
  const render1 = (over: Partial<TransferTaxInput>, actual: boolean | undefined) => {
    const r = calculateTransferTax(mk(over), rates);
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" {...(actual === undefined ? {} : { saleSplitActual: actual })} />);
  };

  it("R-1 구분 기재 선택 + 안분 → 안내 한 줄(기준시가)", () => {
    render1({}, true);
    expect(screen.getByTestId("sale-split-unentered-notice").textContent).toContain(STD_TEXT);
    expect(screen.queryByTestId("sale-split-judgment")).toBeNull();
  });
  it("R-2 감정평가 양쪽이면 감정평가가액 문구", () => {
    render1(APP, true);
    expect(screen.getByTestId("sale-split-unentered-notice").textContent).toContain(APP_TEXT);
  });
  it("R-3 구분 기재를 고르지 않았으면(prop 없음/false) 안 뜬다", () => {
    render1({}, undefined);
    expect(screen.queryByTestId("sale-split-unentered-notice")).toBeNull();
    cleanup();
    render1({}, false);
    expect(screen.queryByTestId("sale-split-unentered-notice")).toBeNull();
  });
  it("R-4 구분 기재가 있으면(판정이 뜬다) 안내는 안 뜬다 — 배타", () => {
    render1({ landTransferPrice: 900_000_000, buildingTransferPrice: 600_000_000 }, true);
    expect(screen.getByTestId("sale-split-judgment")).toBeTruthy();
    expect(screen.queryByTestId("sale-split-unentered-notice")).toBeNull();
  });
});

describe("② 신고서 양식 표 각주 — FilingFormTable", () => {
  const renderTable = (mode: "actual" | "apportioned" | "appraisal", over: Partial<TransferTaxInput> = {}) => {
    const r = calculateTransferTax(mk(over), rates);
    render(<FilingFormTable result={r} formData={formOf(mode)} />);
  };
  it("F-1 actual + 안분 → 표 아래 각주", () => {
    renderTable("actual");
    expect(screen.getByTestId("filing-sale-split-unentered-note").textContent).toContain(STD_TEXT);
  });
  it("F-2 감정평가 안분 → 감정평가가액 문구", () => {
    renderTable("actual", APP);
    expect(screen.getByTestId("filing-sale-split-unentered-note").textContent).toContain(APP_TEXT);
  });
  it("F-3 일괄 양도 모드 → 각주 없음", () => {
    renderTable("apportioned");
    expect(screen.queryByTestId("filing-sale-split-unentered-note")).toBeNull();
  });
  it("F-4 구분 기재 있음 → 각주 없음", () => {
    renderTable("actual", { landTransferPrice: 900_000_000, buildingTransferPrice: 600_000_000 });
    expect(screen.queryByTestId("filing-sale-split-unentered-note")).toBeNull();
  });
});
