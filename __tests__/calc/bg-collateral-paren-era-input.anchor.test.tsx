/**
 * 입력 화면 담보 승 문구의 §159①1호 괄호 시기 단서 (리뷰 F3 — 계획서 `burdened-gift-residuals-o9-o11.plan.md` §4 후속).
 *
 * 결과 화면은 2023.2.28. 전 양도의 담보 승을 「확인 필요」로 알리는데(`bgParenthesisEraNotice`), 입력 화면 네 곳은 시기 구분 없이
 * 괄호 적용을 단정했다. 같은 경계로 단서를 붙인다 — 세액은 바뀌지 않는다(엔진은 현행 문언대로 계산).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { AssetSectionTransfer } from "@/components/calc/transfer/asset-sections/AssetSectionTransfer";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import {
  BG_COLLATERAL_PAREN_ERA_SUFFIX,
  bgCollateralForcesStdAcq,
  bgCollateralParenEraUncertain,
} from "@/lib/calc/burdened-gift-collateral-win";
import { bgParenthesisEraNotice } from "@/lib/tax-engine/burdened-gift-valuation";

afterEach(cleanup);

/** 주택 · 시가 5억 · 담보채무 6억 · 채권최고액 7.2억 → 담보평가 6억 승(bg-collateral-win-ratio-one 픽스처와 같다). */
const house = (o: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetId: "h", addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2009-01-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", actualSalePrice: "",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200000000", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "400000000",
    bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "720000000", ...o,
  }) as AssetForm;
const gb = () =>
  house({
    assetKind: "general_building", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01", landAcqMode: "actual", buildingAcqMode: "actual",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", fixedAcquisitionPrice: "200000000",
    bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "100000000",
  });

const BEFORE = "2023-02-27";
const FROM = "2023-02-28";
const DETAIL = "2023.2.28. 전이라 그 당시 괄호에는 담보채권액 평가";
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("PE-1 leaf — 결과 화면 고지와 같은 경계", () => {
  it.each([
    ["2014-12-31", true],
    ["2015-02-03", true],
    [BEFORE, true],
    [FROM, false],
    ["2026-02-16", false],
  ])("양도일 %s → %s · 결과 화면 고지 유무와 같다", (d, expected) => {
    expect(bgCollateralParenEraUncertain(d)).toBe(expected);
    expect(bgParenthesisEraNotice("standard_price", "mortgage", new Date(d)) !== undefined).toBe(expected);
  });

  it("양도일 미입력은 단서 없음(결과 화면이 판정한다)", () => {
    expect(bgCollateralParenEraUncertain("")).toBe(false);
    expect(bgCollateralParenEraUncertain(undefined)).toBe(false);
  });
});

describe("PE-2 화면 — 담보 승 문구 네 곳", () => {
  it("부담부증여 블록 안내 — 2023.2.27. 양도는 상세 단서, 2023.2.28.은 없다", () => {
    const at = (d: string) =>
      render(<BurdenedGiftBlock asset={house()} onChange={() => {}} transferDate={d} />).container
        .querySelector('[data-testid="bg-collateral-forced-notice"]')?.textContent ?? "";
    const before = at(BEFORE);
    expect(before).toContain("취득시 기준시가 × 채무비율");
    expect(before).toContain(DETAIL);
    cleanup();
    const from = at(FROM);
    expect(from).toContain("취득시 기준시가 × 채무비율");
    expect(from).not.toContain(DETAIL);
  });

  it("② 취득시 기준시가 칸 안내 — 짧은 단서", () => {
    const at = (d: string) =>
      render(<AssetSectionTransfer asset={house()} onChange={() => {}} bundledSaleMode="apportioned" singleMode transferDate={d} />).container.textContent ?? "";
    expect(at(BEFORE)).toContain(`(소령 §159①1호 괄호${BG_COLLATERAL_PAREN_ERA_SUFFIX})`);
    cleanup();
    const from = at(FROM);
    expect(from).toContain("(소령 §159①1호 괄호).");
    expect(from).not.toContain(BG_COLLATERAL_PAREN_ERA_SUFFIX);
  });

  it("일반건물 — ① 안내 · 취득가액 안내 두 곳 모두", () => {
    expect(bgCollateralForcesStdAcq(gb())).toBe(true);
    const at = (d: string) => render(<GeneralBuildingBlock asset={gb()} onChange={() => {}} transferDate={d} />).container;
    const c = at(BEFORE);
    expect(count(c.textContent ?? "", BG_COLLATERAL_PAREN_ERA_SUFFIX)).toBe(2);
    expect(c.querySelector('[data-testid="gb-bg-collateral-acq-notice"]')?.textContent).toContain(BG_COLLATERAL_PAREN_ERA_SUFFIX);
    cleanup();
    expect(count(at(FROM).textContent ?? "", BG_COLLATERAL_PAREN_ERA_SUFFIX)).toBe(0);
  });

  it("대조 — 시가 승(채무 4.8억)은 2023.2.28. 전이어도 단서 없음", () => {
    const a = house({ bgMortgageDebtAmount: "480000000", bgMortgageSetAmount: "600000000" });
    expect(bgCollateralForcesStdAcq(a)).toBe(false);
    const t =
      (render(<BurdenedGiftBlock asset={a} onChange={() => {}} transferDate={BEFORE} />).container.textContent ?? "") +
      (render(<AssetSectionTransfer asset={a} onChange={() => {}} bundledSaleMode="apportioned" singleMode transferDate={BEFORE} />).container.textContent ?? "");
    expect(t).not.toContain(DETAIL);
    expect(t).not.toContain(BG_COLLATERAL_PAREN_ERA_SUFFIX);
  });
});
