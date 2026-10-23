/**
 * ⑤ 입력 · ⑦ 결과 — 겸용주택 양도가액 안분 방식 · 감가상각비 · 건물 귀속 양도비.
 * 계획서: `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.4
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MixedUseSaleSplitSection } from "@/components/calc/transfer/mixed-use/MixedUseSaleSplitSection";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { DepreciationField } from "@/components/calc/transfer/DepreciationField";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { mixedUseDisplayedAcqPrice } from "@/lib/calc/mixed-use-part-acq-split";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const mixed = (over: Partial<AssetForm> = {}): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", isMixedUseHouse: true, ...over }) as AssetForm;

describe("⑤ MixedUseSaleSplitSection", () => {
  it("[U-1] 단건 겸용 — 3지선다가 보이고, 감정 선택 시 구분값을 비우는 한 덩어리 patch", () => {
    const onChange = vi.fn();
    render(<MixedUseSaleSplitSection asset={mixed()} onChange={onChange} isSingleAsset transferDate="2026-07-01" />);
    expect(screen.getByTestId("mixed-sale-split-mode")).toBeTruthy();
    fireEvent.click(screen.getByText("감정평가가액으로 안분"));
    expect(onChange).toHaveBeenCalledWith({ saleSplitMode: "appraisal", landTransferPrice: "", buildingTransferPrice: "" });
  });

  it("[U-2] 계약서 구분 모드 — 토지·건물 두 칸과 §166⑧ 예외 카드(2025.1.1. 이후)", () => {
    render(<MixedUseSaleSplitSection asset={mixed({ saleSplitMode: "actual" })} onChange={vi.fn()} isSingleAsset transferDate="2026-07-01" />);
    expect(screen.getByTestId("mixed-land-transfer-price")).toBeTruthy();
    expect(screen.getByTestId("mixed-building-transfer-price")).toBeTruthy();
    expect(screen.getByTestId("sale-split-exemption-toggle")).toBeTruthy();
  });

  it("[U-3] 자산 2건 — 칸 대신 사유", () => {
    render(<MixedUseSaleSplitSection asset={mixed()} onChange={vi.fn()} isSingleAsset={false} />);
    expect(screen.getByTestId("mixed-sale-split-blocked").textContent).toContain("함께 양도");
    expect(screen.queryByTestId("mixed-sale-split-mode")).toBeNull();
  });

  it("[U-4] 겸용이 아니면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <MixedUseSaleSplitSection asset={mixed({ isMixedUseHouse: false })} onChange={vi.fn()} isSingleAsset />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("[U-5] 건물 귀속 양도비 칸 — 단건 겸용에서만", () => {
    render(<AssetSectionExpense asset={mixed()} onChange={vi.fn()} isSingleAsset />);
    expect(screen.getByTestId("mixed-building-direct-transfer-expense")).toBeTruthy();
    cleanup();
    render(<AssetSectionExpense asset={mixed()} onChange={vi.fn()} isSingleAsset={false} />);
    expect(screen.queryByTestId("mixed-building-direct-transfer-expense")).toBeNull();
  });

  it("[U-6] 감가상각비 — 단건 겸용은 상가건물분 칸, 자산 2건은 사유 카드", () => {
    render(<DepreciationField asset={mixed()} onChange={vi.fn()} isSingleAsset />);
    expect(screen.getByText(/상가건물분/)).toBeTruthy();
    cleanup();
    render(<DepreciationField asset={mixed()} onChange={vi.fn()} isSingleAsset={false} />);
    expect(screen.getByTestId("depreciation-unsupported").textContent).toContain("함께 양도");
  });
});

/** 사례 p.772 — 엔진 결과를 그대로 렌더한다(anchor `mixed-use-sale-split-basis.anchor.test.ts`와 같은 입력). */
function caseResult(extra: Partial<MixedUseAssetInput>, transferPrice = 200_000_000) {
  const asset: MixedUseAssetInput = {
    isMixedUseHouse: true, residentialFloorArea: 30, nonResidentialFloorArea: 70, buildingFootprintArea: 100, totalLandArea: 400,
    landAcquisitionDate: new Date("2020-12-01"), buildingAcquisitionDate: new Date("2023-03-20"),
    transferStandardPrice: { housingPrice: 57_000_000, housingBuildingPrice: 27_000_000, commercialBuildingPrice: 63_000_000, landPricePerSqm: 250_000 },
    acquisitionStandardPrice: { housingPrice: 0, housingBuildingPrice: 18_000_000, commercialBuildingPrice: 42_000_000, landPricePerSqm: 100_000, landPricePerSqmAtBuildingAcq: 100_000 },
    separateAcquisition: { landMode: "actual", buildingMode: "actual", landAcquisitionPrice: 50_000_000, buildingAcquisitionPrice: 70_000_000 },
    residencePeriodYears: 3, isMetropolitanArea: false, zoneType: "agriculture_forest", isOneHouseExempt: true,
    ...extra,
  };
  return calcMixedUseTransferTax(transferPrice, new Date("2026-07-01"), asset, makeMockRates());
}

describe("⑦ 결과 — ① 양도가액 안분 · 상가건물 안내", () => {
  it("[R-1] 감정가액 경로 — 1차 토지·건물 → 2차 4파트 산식, 감가상각·철거비 안내", () => {
    const r = caseResult({
      landAppraisalAtTransfer: 150_000_000, buildingAppraisalAtTransfer: 100_000_000,
      commercialBuildingDepreciation: 2_250_000, buildingDirectTransferExpense: 1_000_000,
    });
    render(<MixedUseResultCard breakdown={r} />);
    const sec = screen.getByTestId("mixed-sale-split-result");
    expect(sec.textContent).toContain("감정평가가액");
    expect(sec.textContent).toContain("56,000,000");
    expect(sec.textContent).toContain("84,000,000");
    expect(screen.getByTestId("mixed-building-extras").textContent).toContain("2,250,000");
  });

  it("[R-2] 의제 후 기준시가 — 사유를 밝히고 종전 기준시가 표를 그린다", () => {
    const r = caseResult({ landTransferPrice: 180_000_000, buildingTransferPrice: 20_000_000 });
    render(<MixedUseResultCard breakdown={r} />);
    expect(screen.getByTestId("mixed-sale-split-fallback").textContent).toContain("30% 이상");
    expect(screen.queryByTestId("mixed-sale-split-result")).toBeNull();
  });

  /** 공유지분 2/3 · 계약서 토지 1.2억 / 건물 0.8억 → 지분 몫 토지 80,000,000 · 건물 53,333,333(잔액). */
  const share = (extra: Partial<MixedUseAssetInput> = {}) =>
    caseResult({
      ownershipRatio: 2 / 3, totalPropertyTransferPrice: 200_000_000,
      landTransferPrice: 80_000_000, buildingTransferPrice: 53_333_333,
      contractLandTransferPrice: 120_000_000, contractBuildingTransferPrice: 80_000_000, ...extra,
    }, 133_333_333);

  it("[R-3] 공유지분 구분 기재 적용 — 판정은 계약서 금액, 행은 지분 몫(Q-3 a)", () => {
    render(<MixedUseResultCard breakdown={share()} />);
    const note = screen.getByTestId("mixed-sale-split-contract").textContent;
    expect(note).toContain("120,000,000");
    expect(note).toContain("80,000,000");
    expect(note).toContain("66.67%");
    const sec = screen.getByTestId("mixed-sale-split-result").textContent;
    expect(sec).toContain("계약서 토지 120,000,000 × 지분 66.67%");
    expect(sec).not.toContain("계약서에 구분 기재된 금액");
  });

  it("[R-4] 공유지분 의제 후 기준시가 — 사유와 함께 계약서 금액을 밝힌다", () => {
    render(<MixedUseResultCard breakdown={share({
      landTransferPrice: 120_000_000, buildingTransferPrice: 13_333_333,
      contractLandTransferPrice: 180_000_000, contractBuildingTransferPrice: 20_000_000,
    })} />);
    expect(screen.getByTestId("mixed-sale-split-fallback")).toBeTruthy();
    expect(screen.getByTestId("mixed-sale-split-contract").textContent).toContain("180,000,000");
  });

  it("[R-5] 단독 소유 — 계약서 금액 문장 없음 · 종전 산식", () => {
    render(<MixedUseResultCard breakdown={caseResult({ landTransferPrice: 120_000_000, buildingTransferPrice: 80_000_000 })} />);
    expect(screen.queryByTestId("mixed-sale-split-contract")).toBeNull();
    expect(screen.getByTestId("mixed-sale-split-result").textContent).toContain("계약서에 구분 기재된 금액");
  });
});

describe("동기화 점검 후속 — M-1 표시 취득가액 · M-2 파트별 환산 산식", () => {
  /** 총액 모델(같은 날 취득) — 별개 취득 파트 모델이 아니다. */
  function totalModel(extra: Partial<MixedUseAssetInput>) {
    return caseResult({
      separateAcquisition: undefined,
      buildingAcquisitionDate: new Date("2020-12-01"),
      acquisitionStandardPrice: { housingPrice: 30_000_000, housingBuildingPrice: 18_000_000, commercialBuildingPrice: 42_000_000, landPricePerSqm: 100_000 },
      ...extra,
    });
  }

  it("[M-1] 총액 모델 + 감가상각 — 표시 취득가액 = 엔진 4파트 취득가액 합(차감 후) · 감가상각 없으면 종전 값", () => {
    const withDep = totalModel({ useActualAcquisition: true, acquisitionActualTotalPrice: 120_000_000, commercialBuildingDepreciation: 2_250_000 });
    const h = withDep.housingPart;
    const c = withDep.commercialPart;
    expect(mixedUseDisplayedAcqPrice(withDep)).toBe(h.landAcqPrice + h.buildingAcqPrice + c.landAcqPrice + c.buildingAcqPrice);
    expect(mixedUseDisplayedAcqPrice(withDep)).toBe(117_750_000);
    const noDep = totalModel({ useActualAcquisition: true, acquisitionActualTotalPrice: 120_000_000 });
    expect(mixedUseDisplayedAcqPrice(noDep)).toBe(noDep.housingPart.estimatedAcquisitionPrice + noDep.commercialPart.estimatedAcquisitionPrice);
  });

  it("[M-2] 새 안분 + 환산 — 결과 카드 환산 산식이 토지·건물 파트별(엔진 Q-8)이다", () => {
    const r = totalModel({ landAppraisalAtTransfer: 150_000_000, buildingAppraisalAtTransfer: 100_000_000 });
    render(<MixedUseResultCard breakdown={r} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("파트별 환산의 합");
    expect(text).toContain("84,000,000");
    expect(text).toContain("양도시 토지 기준시가 70,000,000");
  });
});

