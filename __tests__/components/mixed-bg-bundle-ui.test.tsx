/**
 * RTL — 겸용주택 × 부담부증여 × 함께 양도 묶음 화면 (PR-B 화면 단계 ⑤⑦).
 *
 * ⑤ 채무 귀속 카드: 묶음 안 겸용은 읽기 전용(구분 불분명 고정 + 재배분 채무 표시) · 남은 주택·상가 선언은 지우지 않고 그 항목 라디오만 열어 «구분 불분명»으로 바꿀 길을 낸다.
 * ⑦ 결과: 자산별 4부분 카드 — 증여세 행이 없다. 값은 엔진 echo(`calcMixedUseTransferTax` · `burdenedGiftInBundle`)이고 오라클은 route anchor와 같은 시료(B_i 533,333,334).
 * 단언 축은 «값»이다 — 라디오는 `radioValues`, 금액은 정확한 원 단위. 부재 단언에는 같은 시드의 긍정 짝이 있다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/components/calc/building-std-price/BuildingStdPriceModalButton", () => ({
  BuildingStdPriceModalButton: () => <button type="button">기준시가 계산</button>,
}));

import { TransferModeBlock } from "@/components/calc/transfer/TransferModeBlock";
import { BurdenedGiftDebtAttributionCard } from "@/components/calc/transfer/BurdenedGiftDebtAttributionCard";
import { MixedUseBgBundleAssetCard } from "@/components/calc/results/mixed-use/MixedUseBgBundleAssetCard";
import { mixedBgBundleViewsOf } from "@/components/calc/results/mixed-use/mixed-bg-bundle-views";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { radioValues, checkedRadioValue } from "./_helpers/radio-values";

afterEach(cleanup);

const seed = (over: Partial<AssetForm> = {}): AssetForm => ({
  ...makeDefaultAsset(1),
  assetId: "m2", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-15", isMixedUseHouse: true, mixedAcqPerPartMode: false,
  residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000", mixedTransferHousingBuildingStdPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000", mixedIsMetropolitanArea: true,
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "600000000",
  ...over,
}) as AssetForm;

function Harness({ initial, bundle, onState }: { initial: AssetForm; bundle?: { debt: number | undefined }; onState?: (a: AssetForm) => void }) {
  const [a, setA] = useState(initial);
  onState?.(a);
  return <TransferModeBlock asset={a} onChange={(p) => setA((prev) => ({ ...prev, ...p }))} transferDate="2024-03-01" isCompanionBundle={bundle !== undefined} mixedBgBundle={bundle} />;
}

describe("MBU-1 · 채무 귀속 카드 — 함께 양도 묶음 변형", () => {
  it("묶음: 선택지 없이 재배분 채무 533,333,334원을 보이고 귀속 라디오가 없다 · 짝: 묶음 밖은 4선택지 라디오(값 축)와 재배분 표시가 없다", () => {
    const { container, getByTestId, queryByTestId } = render(<Harness initial={seed()} bundle={{ debt: 533_333_334 }} />);
    expect(getByTestId("bg-attr-bundle-debt").textContent).toBe("533,333,334원");
    expect(getByTestId("bg-attr-card").getAttribute("data-bundle")).toBe("true");
    expect(radioValues(container, "bgMortgageAttribution")).toEqual([]);
    cleanup();
    const solo = render(<Harness initial={seed()} />);
    expect(radioValues(solo.container, "bgMortgageAttribution")).toEqual(["housing", "commercial", "unallocated", "split"]);
    expect(solo.queryByTestId("bg-attr-bundle-debt")).toBeNull();
    expect(queryByTestId("bg-attr-bundle-debt")).toBeNull();
  });

  it("평가액이 없어 재배분할 수 없으면 0원으로 메우지 않고 입력 안내를 보인다", () => {
    const { getByTestId, queryByTestId } = render(<Harness initial={seed()} bundle={{ debt: undefined }} />);
    expect(queryByTestId("bg-attr-bundle-debt")).toBeNull();
    expect(getByTestId("bg-attr-bundle-debt-pending").textContent).toContain("증여재산 평가액");
  });

  it("남은 주택 귀속 선언: 지우지 않고 그 항목 라디오를 열되 주택·상가·나누어 입력은 비활성 · 「구분 불분명」만 고를 수 있다 · 고르면 폼에 unallocated", () => {
    let latest: AssetForm | undefined;
    const { container, getByTestId } = render(<Harness initial={seed({ bgMortgageAttribution: "housing" })} bundle={{ debt: 533_333_334 }} onState={(a) => (latest = a)} />);
    expect(getByTestId("bg-attr-bundle-stale")).toBeTruthy();
    expect(radioValues(container, "bgMortgageAttribution")).toEqual(["housing", "commercial", "unallocated", "split"]);
    expect(checkedRadioValue(container, "bgMortgageAttribution")).toBe("housing"); // 자동으로 지우지 않았다
    const disabled = (v: string) => container.querySelector<HTMLInputElement>(`input[type="radio"][name^="bgMortgageAttribution"][value="${v}"]`)!.disabled;
    expect(["housing", "commercial", "split", "unallocated"].map(disabled)).toEqual([true, true, true, false]);
    fireEvent.click(container.querySelector<HTMLInputElement>('input[type="radio"][name^="bgMortgageAttribution"][value="unallocated"]')!);
    expect(latest?.bgMortgageAttribution).toBe("unallocated");
    expect(container.querySelector('[data-testid="bg-attr-bundle-stale"]')).toBeNull(); // 바꾸면 라디오가 사라진다
  });

  it("직접 렌더 — 임대보증금·담보차입금 둘 다 남은 선언이면 두 그룹 모두 열린다 · 구분 불분명이 남은 항목은 열리지 않는다", () => {
    const both = seed({ bgLendingDepositTotal: "100000000", bgDepositAttribution: "commercial", bgMortgageAttribution: "split" });
    const { container } = render(<BurdenedGiftDebtAttributionCard asset={both} onChange={() => undefined} bundle={{ debt: 1 }} />);
    expect(radioValues(container, "bgDepositAttribution")).toEqual(["housing", "commercial", "unallocated", "split"]);
    expect(radioValues(container, "bgMortgageAttribution")).toEqual(["housing", "commercial", "unallocated", "split"]);
    cleanup();
    const one = seed({ bgLendingDepositTotal: "100000000", bgDepositAttribution: "unallocated", bgMortgageAttribution: "commercial" });
    const r = render(<BurdenedGiftDebtAttributionCard asset={one} onChange={() => undefined} bundle={{ debt: 1 }} />);
    expect(radioValues(r.container, "bgDepositAttribution")).toEqual([]);
    expect(radioValues(r.container, "bgMortgageAttribution")).toEqual(["housing", "commercial", "unallocated", "split"]);
  });
});

describe("MBU-2 · 계산 범위 안내 문구(⑤)", () => {
  it("함께 양도 묶음(보충적평가 승만·구분 불분명 재배분)을 계산 범위에 넣고, 지분 분할 취득만 계산하지 않는다고 적는다", () => {
    const { getByTestId } = render(<Harness initial={seed()} bundle={{ debt: 1 }} />);
    const t = getByTestId("bg-mixed-notice").textContent ?? "";
    expect(t).toContain("함께 양도(여러 물건) 묶음");
    expect(t).toContain("보충적평가");
    expect(t).toContain("구분 불분명");
    expect(t).not.toContain("함께 양도(여러 물건)·지분 분할 취득은 계산하지 않습니다");
    expect(t).toMatch(/지분 분할 취득은 계산하지 않습니다/);
  });
});

/** ⑦ — 엔진이 묶음으로 돌린 겸용 BG 4부분 명세(route anchor CP-1 겸용과 같은 시료: ΣA 18억 중 겸용 12억 · 신고 단위 채무 8억 → B_i 533,333,334) */
const TD = new Date("2024-03-01");
const ACQ = new Date("2010-03-15");
const mixedInput = (): MixedUseAssetInput => ({
  isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
  landAcquisitionDate: ACQ, buildingAcquisitionDate: ACQ,
  transferStandardPrice: { housingPrice: 600e6, commercialBuildingPrice: 100e6, landPricePerSqm: 5_000_000, housingBuildingPrice: 100e6 },
  acquisitionStandardPrice: { housingPrice: 300e6, commercialBuildingPrice: 50e6, landPricePerSqm: 2_500_000, housingBuildingPrice: 50e6 },
  residencePeriodYears: 0, isMetropolitanArea: true, zoneType: "residential", isOneHouseExempt: false, acquisitionCause: "purchase",
}) as MixedUseAssetInput;
const info = (): BurdenedGiftInfo => ({
  valuationMode: "sangjeungbeop_standard", lendingDepositTotal: 0, mortgageDebtAmount: 600e6, annualRentTotal: 0, mortgageSetAmount: 600e6,
  landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 1_200_000_000, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 600e6,
  donorRelation: "lineal_descendant", assumedDebtOverride: 533_333_334,
}) as unknown as BurdenedGiftInfo;
const bundleBg = () => {
  const r = calcMixedUseTransferTax(1, TD, { ...mixedInput(), burdenedGift: info(), burdenedGiftInBundle: true }, makeMockRates() as never);
  if (!r.burdenedGift) throw new Error("묶음 겸용 BG 명세가 없다");
  return r.burdenedGift;
};

describe("MBU-3 · 자산별 겸용 BG 4부분 카드 — 증여세 행이 없고 엔진 값을 그대로 읽는다", () => {
  it("증여가액 12억 · 재배분 채무 533,333,334(귀속 구분 불분명) · 4부분 양도가액/취득가액/개산공제/양도차익 · 증여세 행 없음", () => {
    const bg = bundleBg();
    expect(bg.giftTax).toBeUndefined();
    const { getByTestId, container, queryByTestId } = render(<MixedUseBgBundleAssetCard bg={bg} assetLabel="자산 2" assetKey="m2" valuationMode="sangjeungbeop_standard" />);
    expect(getByTestId("bg-mixed-bundle-gift-value-m2").textContent).toBe("1,200,000,000");
    expect(getByTestId("bg-mixed-bundle-debt-m2").textContent).toBe("533,333,334");
    expect(getByTestId("bg-mixed-bundle-debt-housing-m2").textContent).toBe("266,666,667");
    const row = (k: string) => Array.from(container.querySelectorAll(`[data-testid="bg-mixed-bundle-parts-m2"] tr[data-part="${k}"] td`)).map((td) => td.textContent ?? "");
    // 양도가액 · 취득가액 · 개산공제 · 양도차익 (오라클: 엔진 echo 3값의 뺄셈 — route anchor 실측)
    expect(row("housingLand").slice(1)).toEqual(["222,222,222", "111,111,111", "3,333,333", "107,777,778"]);
    expect(row("housingBuilding").slice(1)).toEqual(["44,444,445", "22,222,222", "666,666", "21,555,557"]);
    expect(row("commercialLand").slice(1)).toEqual(["222,222,222", "111,111,111", "3,333,333", "107,777,778"]);
    expect(row("commercialBuilding").slice(1)).toEqual(["44,444,445", "22,222,222", "666,666", "21,555,557"]);
    // 증여세 행은 이 카드에 없다(계약 단위 1회 — 묶음의 §159 명세 카드가 소유)
    expect(container.textContent).not.toContain("증여세 산출세액");
    expect(container.textContent).toContain("증여세는 증여계약 전체를 한 번 계산합니다");
    expect(queryByTestId("bg-mixed-detail-card")).toBeNull();
    // 주택분·상가분 취득가액 산식 행(단건 카드와 같은 컴포넌트)
    expect(getByTestId("bg-mixed-bundle-card-m2").querySelector('[data-testid="bg-result-acq-housing"]')).not.toBeNull();
  });

  it("mixedBgBundleViewsOf: 슬롯 키 순서(주 자산 primary 먼저) · 라벨은 안분 행 라벨 · 슬롯이 없으면 빈 목록", () => {
    const bg = bundleBg();
    const aggregated = { mixedUseBgDetailsByAsset: { m3: bg, primary: bg } } as never;
    const apportionment = { apportioned: [{ assetId: "primary", assetLabel: "주 자산" }, { assetId: "m3", assetLabel: "겸용 B" }] } as never;
    const assets = [{ assetId: "x" }, { assetId: "m2" }, { assetId: "m3", bgValuationMode: "sangjeungbeop_market" }] as never;
    const views = mixedBgBundleViewsOf(aggregated, apportionment, { assets });
    expect(views.map((v) => [v.assetKey, v.label, v.valuationMode])).toEqual([["primary", "주 자산", undefined], ["m3", "겸용 B", "sangjeungbeop_market"]]);
    expect(mixedBgBundleViewsOf({} as never, apportionment, { assets })).toEqual([]);
  });
});
