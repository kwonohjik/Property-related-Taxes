/**
 * 분리 계산 1985.1.1. 전 상속 토지 파트 3자 max — 화면 표시 (계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §13).
 *
 * - 결과 카드: ③(환산취득가액) 값과 채택 · D2 1985 전 건물 ③ 미비교 고지(Q-9 a). 엔진 결과 그대로 렌더한다.
 * - 입력: 「토지 취득가액 방식」 고정 안내와 영 §164④ 카드에 1985 전 단서(그 밖에는 없음).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { LandSec164Card } from "@/components/calc/transfer/LandSec164Card";
import { LandBuildingSplitSection } from "@/components/calc/transfer/LandBuildingSplitSection";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

afterEach(() => cleanup());

const D = (s: string) => new Date(s);
const engine = (o: Partial<TransferTaxInput>) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_200_000_000,
      transferDate: D("2026-06-30"),
      acquisitionDate: D("2018-03-02"),
      acquisitionCause: "purchase",
      isOneHousehold: false,
      householdHousingCount: 2,
      isSeparateAcquisition: true,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landTransferPrice: 700_000_000,
      buildingTransferPrice: 500_000_000,
      landStandardPriceAtTransfer: 400_000_000,
      buildingStandardPriceAtTransfer: 300_000_000,
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 400_000_000,
      landAcquisitionDate: D("1980-05-01"),
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: D("1960-01-01"),
      landSec164Value: 350_000_000,
      landSec164ValueWhole: 350_000_000,
      ...o,
    }),
    makeMockRates(),
  );

describe("결과 카드", () => {
  it("D1 1980: ③ 612,500,000 · 채택 「환산취득가액(영 §176조의2④)」", () => {
    render(<SplitGainDetailSection splitDetail={engine({}).splitDetail!} assetKind="housing" />);
    expect(screen.getByTestId("split-card-acq-basis-converted").textContent).toBe("612,500,000");
    expect(screen.getByTestId("split-card-acq-basis-adopted").textContent).toBe("환산취득가액(영 §176조의2④)");
    expect(screen.queryByTestId("split-card-acq-basis-uncompared")).toBeNull();
  });

  it("D1 1988(대조군): ③ 칸 없음", () => {
    render(<SplitGainDetailSection splitDetail={engine({ landAcquisitionDate: D("1988-05-01") }).splitDetail!} assetKind="housing" />);
    expect(screen.queryByTestId("split-card-acq-basis-converted")).toBeNull();
  });

  it("D2 1984 상속 건물: ③ 미비교 고지", () => {
    const r = engine({
      acquisitionCause: "inheritance",
      acquisitionDate: D("1984-05-01"),
      decedentAcquisitionDate: D("1960-01-01"),
      landAcquisitionCause: "purchase",
      landAcquisitionDate: D("2000-03-02"),
      landDecedentAcquisitionDate: undefined,
      landSec164Value: undefined,
      landSec164ValueWhole: undefined,
      buildingHouseKind: "house_individual",
      buildingSec164Value: 450_000_000,
    });
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
    expect(screen.getByTestId("split-card-acq-basis-uncompared").textContent).toMatch(/환산취득가액과 비교하지 않았습니다/);
  });
});

describe("입력 — 「토지 취득가액 방식」 고정 안내", () => {
  const section = (date: string) => {
    const asset = { ...makeDefaultAsset(1), assetKind: "housing", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: date } as AssetForm;
    const noop = () => {};
    return (
      <LandBuildingSplitSection
        landCause="inheritance"
        selfOwns="both"
        acqStdPriceRequired={false}
        acqStdRequiredLand={false}
        acqStdRequiredBuilding={false}
        isPhdBothEstimated={false}
        saleStdInLandPart={false}
        saleStdInBuildingPart={false}
        landAcqMode="actual" onLandAcqModeChange={noop}
        buildingAcqMode="actual" onBuildingAcqModeChange={noop}
        landAcquisitionPrice="" onLandAcquisitionPriceChange={noop}
        buildingAcquisitionPrice="" onBuildingAcquisitionPriceChange={noop}
        landSalesCaseValue="" onLandSalesCaseValueChange={noop}
        buildingSalesCaseValue="" onBuildingSalesCaseValueChange={noop}
        landDirectExpenses="" onLandDirectExpensesChange={noop}
        buildingDirectExpenses="" onBuildingDirectExpensesChange={noop}
        isSeparateAcq
        asset={asset}
        onAssetChange={noop}
        transferDate="2026-06-30"
      />
    );
  };
  it("1980 상속: 3자 비교 안내", () => {
    render(section("1980-05-01"));
    expect(screen.getByTestId("part-acq-mode-land-pre-deemed").textContent).toMatch(/환산취득가액/);
  });
  it("1988 상속(대조군): 안내 없음", () => {
    render(section("1988-05-01"));
    expect(screen.queryByTestId("part-acq-mode-land-pre-deemed")).toBeNull();
  });
});

describe("입력 — 영 §164④ 카드", () => {
  const landAsset = (date: string) =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: "purchase",
      landAcquisitionCause: "inheritance",
      landCauseHost: "purchase",
      landAcquisitionDate: date,
      hasSeperateLandAcquisitionDate: true,
      acquisitionArea: "100",
    }) as AssetForm;

  it("1980 상속: ③ 비교 안내", () => {
    render(<LandSec164Card asset={landAsset("1980-05-01")} onChange={vi.fn()} transferDate="2026-06-30" />);
    expect(screen.getByTestId("land-sec164-pre-deemed-note").textContent).toMatch(/환산취득가액/);
  });
  it("1988 상속(대조군): 안내 없음", () => {
    render(<LandSec164Card asset={landAsset("1988-05-01")} onChange={vi.fn()} transferDate="2026-06-30" />);
    expect(screen.queryByTestId("land-sec164-pre-deemed-note")).toBeNull();
  });
});
