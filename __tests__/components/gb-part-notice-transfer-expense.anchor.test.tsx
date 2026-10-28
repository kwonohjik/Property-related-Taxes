/**
 * @vitest-environment jsdom
 *
 * anchor — 일반건물 「감정·매매사례는 개산공제만」 안내문의 양도비 문장 (계획서 gb-deduction-only-notice-mixed-asset-transfer-expense §5·§7)
 *
 * 자산 단위 양도비는 카드에 가액 비례로 나뉘어 감정·매매사례 카드 몫만 버려진다(소득세법 §100② 후문 · §97②2호).
 * 다른 카드가 몫을 받는 혼합 자산에서는 「양도비도 입력해도 세액이 바뀌지 않는다」고 쓰면 거짓이다.
 *
 *   N-1  혼합(실가·환산 + 감정·매매사례) → 「다른 파트·증축분이 받는 몫은 … 반영」, 종전 단정 문장 없음
 *   N-2  두 파트 모두 감정·매매사례(증축 없음) → 종전 문구 그대로
 *   N-3  증축이 있으면 두 파트 모두 새 문구, 건물 파트만 「증축 후 자본적지출 중 증축분 몫」 덧붙임
 *   N-4  분리 OFF 자산 단위 안내(AssetSectionExpense) → 종전 문구 (두 파트 모드 동일)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GeneralBuildingAcquisitionCards } from "@/components/calc/transfer/GeneralBuildingAcquisitionCards";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const LAND = "1999-05-24";
const BUILDING = "2015-03-01";
const ON: Partial<AssetForm> = { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: LAND, acquisitionDate: BUILDING };
const gbAsset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: LAND,
    landAcquisitionDate: LAND,
    hasSeperateLandAcquisitionDate: false,
    ...over,
  }) as AssetForm;
const renderCards = (over: Partial<AssetForm>) =>
  render(<GeneralBuildingAcquisitionCards asset={gbAsset(over)} onChange={() => {}} transferDate="2026-02-16" />);

const OLD = "자본적지출·양도비는 필요경비에 산입되지 않으므로 입력해도 세액이 바뀌지 않습니다";
const SHARE = "다른 파트·증축분이 받는 몫은 그 취득방식대로 반영됩니다";
const EXT_CAPEX = "증축 후 자본적지출 중 증축분 몫도 증축분 취득방식대로 반영됩니다";
const EXT = { gbHasExtension: true, gbExtensionDate: "2018-05-01", gbExtensionArea: "50" } as Partial<AssetForm>;
const texts = () => screen.queryAllByTestId("gb-deduction-only-notice").map((n) => n.textContent ?? "");

describe("N-1 혼합 자산 — 양도비 단정 문장을 쓰지 않는다", () => {
  it.each([
    ["토지 실가 + 건물 감정", { landAcqMode: "actual", buildingAcqMode: "appraisal" }],
    ["토지 실가 + 건물 매매사례", { landAcqMode: "actual", buildingAcqMode: "salesCase" }],
    ["토지 감정 + 건물 실가", { landAcqMode: "appraisal", buildingAcqMode: "actual" }],
    ["토지 환산 + 건물 감정", { landAcqMode: "estimated", buildingAcqMode: "appraisal" }],
    ["토지 감정 + 건물 환산", { landAcqMode: "appraisal", buildingAcqMode: "estimated" }],
  ] as const)("%s", (_tag, modes) => {
    renderCards({ ...ON, ...modes });
    const t = texts();
    expect(t).toHaveLength(1);
    expect(t[0]).toContain(SHARE);
    expect(t[0]).toContain("§100② 후문");
    expect(t[0]).not.toContain(OLD);
    expect(t[0]).not.toContain(EXT_CAPEX);
  });
});

describe("N-2 두 파트 모두 감정·매매사례 — 종전 문구", () => {
  it.each([
    ["감정 + 감정", { landAcqMode: "appraisal", buildingAcqMode: "appraisal" }],
    ["감정 + 매매사례", { landAcqMode: "appraisal", buildingAcqMode: "salesCase" }],
    ["매매사례 + 매매사례", { landAcqMode: "salesCase", buildingAcqMode: "salesCase" }],
  ] as const)("%s — 두 카드 모두 종전 문장", (_tag, modes) => {
    renderCards({ ...ON, ...modes });
    const t = texts();
    expect(t).toHaveLength(2);
    for (const x of t) {
      expect(x).toContain(OLD);
      expect(x).not.toContain(SHARE);
    }
  });
});

describe("N-3 증축 — 몫을 받는 카드가 항상 하나 더 있다", () => {
  it("두 파트 모두 감정이어도 증축이 있으면 토지·건물 모두 새 문구, 증축 후 자본적지출 문장은 건물 파트에만", () => {
    renderCards({ ...ON, ...EXT, landAcqMode: "appraisal", buildingAcqMode: "appraisal" });
    const t = texts();
    expect(t).toHaveLength(2);
    for (const x of t) {
      expect(x).toContain(SHARE);
      expect(x).not.toContain(OLD);
    }
    // 렌더 순서: 토지 카드 → 건물 카드
    expect(t[0]).not.toContain(EXT_CAPEX);
    expect(t[1]).toContain(EXT_CAPEX);
  });
});

describe("N-4 분리 OFF 자산 단위 안내 — 종전 문구", () => {
  it.each([{ isAppraisalAcquisition: true }, { isSalesCaseAcquisition: true }])("%o", (over) => {
    render(<AssetSectionExpense asset={gbAsset(over)} onChange={() => {}} />);
    const t = texts();
    expect(t).toHaveLength(1);
    expect(t[0]).toContain(OLD);
    expect(t[0]).not.toContain(SHARE);
  });
});
