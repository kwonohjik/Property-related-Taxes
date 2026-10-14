/**
 * anchor — 취득 당시 계약서 구분금액의 §100③ 판정 **표시** (#17-6 · ⑦)
 *
 * 표시는 엔진 판정을 그대로 읽는다(재계산 금지) — 엔진을 실제로 돌린 결과를 렌더한다(`sale-split-judgment-display.test.tsx`와 같은 규약).
 * 미입력(판정 내역 없음)이면 블록이 없다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);
const rates = makeMockRates();

const mk = (over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2012-01-02"), acquisitionPrice: 500_000_000, expenses: 0, useEstimatedAcquisition: false,
    isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
    buildingFootprintArea: 100, acquisitionArea: 500, appurtenantLandZone: "metropolitan_residential",
    landAcquisitionDate: new Date("2012-01-02"),
    standardPriceAtAcquisition: 500_000_000, standardPricePerSqmAtAcquisition: 600_000, buildingStandardPriceAtAcquisition: 200_000_000,
    landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 400_000_000,
    ...over,
  });

function renderFor(over: Partial<TransferTaxInput> = {}) {
  const result = calculateTransferTax(mk(over), rates);
  render(<SplitGainDetailSection splitDetail={result.splitDetail!} assetKind="housing" />);
  return result.splitDetail!.acqSplitJudgment;
}

describe("#17-6 결과 표시 — 구분 근거 4가지", () => {
  it("불분명(30% 이상) — 안분 가액을 적용했음과 이탈률(엔진 bp 그대로)·확인 필요 문구", () => {
    const j = renderFor({ acqContractLandPrice: 380_000_000, acqContractBuildingPrice: 120_000_000 });
    expect(j!.outcome).toBe("deemed_unclear");
    const block = screen.getByTestId("acq-split-judgment");
    expect(block.getAttribute("data-outcome")).toBe("deemed_unclear");
    expect(block.textContent).toContain("안분 가액을 적용했습니다");
    expect(block.textContent).toContain("26.7%"); // 토지 2666bp — 십분율 정수(267)에서 반올림
    expect(block.textContent).toContain("40.0%");
    expect(block.textContent).toContain("확인 필요");
  });

  it("경계 직전(건물 −29.99999%)은 「30% 미만」 제목과 어긋나지 않게 30.0%가 아니라 29.9%로 표시한다", () => {
    renderFor({ acqContractLandPrice: 359_999_999, acqContractBuildingPrice: 140_000_001 });
    const text = screen.getByTestId("acq-split-judgment").textContent ?? "";
    expect(text).toContain("29.9%");
    expect(text).not.toContain("30.0%");
  });

  it("30% 미만 — 계약서 구분금액을 적용", () => {
    renderFor({ acqContractLandPrice: 335_714_285, acqContractBuildingPrice: 164_285_715 });
    expect(screen.getByTestId("acq-split-judgment").textContent).toContain("계약서 구분금액을 적용했습니다");
  });

  it("단서(양도 2026) — 예외로 계약서 구분금액을 적용했고 근거 조문을 밝힌다", () => {
    renderFor({ acqContractLandPrice: 380_000_000, acqContractBuildingPrice: 120_000_000, acqContractOtherLaw: true });
    const t = screen.getByTestId("acq-split-judgment").textContent ?? "";
    expect(t).toContain("다른 법령에서 가액을 구분한 경우로 신고");
    expect(t).toContain("소득세법 시행령 §166 ⑧ 1호");
  });

  it("2016.1.1. 전 양도 — 판정 없이 계약서 구분금액, 차이 행이 없다", () => {
    renderFor({
      transferDate: new Date("2015-12-31"), transferPrice: 800_000_000, acquisitionArea: 800, standardPricePerSqmAtAcquisition: 375_000,
      acqContractLandPrice: 360_000_000, acqContractBuildingPrice: 140_000_000,
    });
    const t = screen.getByTestId("acq-split-judgment").textContent ?? "";
    expect(t).toContain("2016년 1월 1일 전");
    expect(t).not.toContain("차이");
  });

  it("미입력이면 블록이 없다", () => {
    expect(renderFor()).toBeUndefined();
    expect(screen.queryByTestId("acq-split-judgment")).toBeNull();
  });
});
