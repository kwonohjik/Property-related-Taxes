/**
 * anchor — 상가 부수토지 초과분 비사업용 파트 카드 (NBL2611-V5-BX01 ⑦)
 *
 * 엔진 echo(`result.commercialNblPart`)를 그대로 읽는다 — 단건 묶음(`SingleDetailCards`)과 일괄 자산별 카드(`ValuationDetailCards`)가
 * 같은 카드를 렌더하고, 「출력 항목 선택」 게이트(`hasSingleDetailCards`)가 같은 술어로 열린다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ValuationDetailCards } from "@/components/calc/results/transfer/ValuationDetailCards";
import { SingleDetailCards, hasSingleDetailCards } from "@/components/calc/results/transfer/SingleDetailCards";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const input = (partBasis: object | undefined): TransferTaxInput =>
  baseTransferInput({
    propertyType: "commercial_building",
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    transferPrice: 1_200_000_000,
    acquisitionPrice: 600_000_000,
    acquisitionDate: new Date("2014-06-01"),
    transferDate: new Date("2024-06-01"),
    commercialAppurtenantLand: { totalLandArea: 2400, totalBuildingFootprintArea: 200, zoneType: "commercial", ...(partBasis ? { partBasis } : {}) },
  } as Partial<TransferTaxInput>);

const BASIS = { transferLandStd: 800_000_000, transferBuildingStd: 200_000_000, acquisitionLandStd: 800_000_000, acquisitionBuildingStd: 200_000_000 };
const result = calculateTransferTax(input(BASIS), makeMockRates());

describe("CommercialNblPartCard — 엔진 echo를 그대로 보인다", () => {
  it("엔진이 echo를 낸다 (토지 480M · 건물 120M · 초과 0.75 → 비사업용 파트 360M)", () => {
    expect(result.commercialNblPart).toMatchObject({ landGain: 480_000_000, buildingGain: 120_000_000, nonBusinessGain: 360_000_000 });
  });

  it("일괄 자산별 카드(ValuationDetailCards)가 렌더한다", () => {
    const { getByTestId } = render(<ValuationDetailCards result={result} transferPrice={1_200_000_000} />);
    expect(getByTestId("cb-nbl-part-land-gain").textContent).toBe("480,000,000");
    expect(getByTestId("cb-nbl-part-building-gain").textContent).toBe("120,000,000");
    expect(getByTestId("cb-nbl-part-nbl-gain").textContent).toBe("360,000,000");
  });

  it("단건 묶음(SingleDetailCards)도 같은 카드를 렌더하고 게이트가 열린다", () => {
    expect(hasSingleDetailCards(result)).toBe(true);
    const { getByTestId } = render(<SingleDetailCards result={result} />);
    expect(getByTestId("cb-nbl-part-nbl-gain").textContent).toBe("360,000,000");
  });

  it("초과분이 없으면 카드도 게이트도 없다", () => {
    const within = calculateTransferTax(
      { ...input(undefined), commercialAppurtenantLand: { totalLandArea: 1200, totalBuildingFootprintArea: 200, zoneType: "green" } },
      makeMockRates(),
    );
    expect(within.commercialNblPart).toBeUndefined();
    const { queryByTestId } = render(<SingleDetailCards result={within} />);
    expect(queryByTestId("cb-nbl-part-card")).toBeNull();
  });
});
