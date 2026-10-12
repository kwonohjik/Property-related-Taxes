/**
 * anchor (#2141 표시) — 겸용 1세대1주택에서 나중에 취득한 부수토지가 보유요건(「소득세법 시행령」 §154①) 미만이라 토지분이
 * 비과세에서 빠지면, 결과 화면·요약 어댑터·신고서 표가 「전액 비과세 0」으로 그리지 않고 엔진 표시
 * (`housingPart.laterLandExemptExcluded`)와 엔진 값을 그대로 쓴다(재도출 금지).
 *  - 계산 내역 배너 · 주택분 「12억 이하」 행 · 상가분(§154③ 본문) 행
 *  - `mixedUseToFilingResult.taxableGain` — 주택으로 본 상가 부분의 과세 토지분 포함
 *  - `fourPartFinancials` — 토지 전액 과세 · 건물만 비과세/안분, 장특·소득금액 열도 같은 축
 * 건물 2021-06-01 · 토지 2023-10-01 · 양도 2024-06-01 · 주택 150㎡ > 상가 100㎡.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { calcMixedUseTransferTaxIdN as calc } from "../tax-engine/_helpers/mixed-use-identity-std";
import { fourPartFinancials } from "@/components/calc/results/transfer/FilingFormTableFinancials";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const TD = new Date("2024-06-01");
const rates = makeMockRates();
const D = (s: string) => new Date(s);

function asset(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 150,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2023-10-01"),
    buildingAcquisitionDate: D("2021-06-01"),
    transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: {
      housingPrice: 350_000_000,
      commercialBuildingPrice: 80_000_000,
      landPricePerSqm: 1_500_000,
      landPricePerSqmAtBuildingAcq: 1_400_000,
    },
    residencePeriodYears: 3,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    ...over,
  };
}

const text = (b: ReturnType<typeof calc>) => render(<MixedUseResultCard breakdown={b} />).container.textContent ?? "";
function financials(b: ReturnType<typeof calc>) {
  const got = new Map<string, number | null>();
  fourPartFinancials(b.housingPart, b.commercialPart, b.nonBusinessLandPart, (row, col, n) => got.set(`${row}:${col}`, n));
  return got;
}

describe("10억 · 나중 토지 보유 8개월 — §154③ 본문(상가도 주택)", () => {
  const b = calc(1_000_000_000, TD, asset(), rates);
  const hp = b.housingPart;
  const cp = b.commercialPart;

  it("엔진 — 표시 플래그 · 주택 토지분 전액 · 상가 토지분 과세", () => {
    expect(hp.laterLandExemptExcluded).toBe(true);
    expect(hp.isExempt).toBe(true);
    expect(hp.proratedTaxableGain).toBe(73_547_369);
    expect(cp.deemedHouseBy154_3Main).toBe(true);
    expect(cp.incomeAmount).toBe(49_031_579);
  });

  it("화면 — 배너·주택분·상가분 행이 토지분 과세를 말한다(「전액 비과세 0」을 그리지 않는다)", () => {
    const t = text(b);
    expect(t).toContain("적용 (12억 이하 비과세 — 나중에 취득한 부수토지분은 보유요건 미달로 과세)");
    expect(t).toContain("12억 이하 → 건물분 비과세 · 나중에 취득한 부수토지분 과세");
    expect(t).toContain("주택으로 봄 → 건물분 비과세 · 나중에 취득한 토지분 과세");
    expect(t).not.toContain("12억 이하 → 전액 비과세");
    expect(t).not.toContain("주택으로 봄 → 1세대1주택 비과세");
  });

  it("요약 어댑터 — 과세대상 양도차익에 상가 토지분 포함", () => {
    expect(mixedUseToFilingResult(b).taxableGain).toBe(73_547_369 + 49_031_579);
  });

  it("신고서 표 — 토지 열 전액 과세 · 건물 열 비과세, 소득금액도 토지 열", () => {
    const g = financials(b);
    expect(g.get("taxableGain:housingLand")).toBe(hp.landTransferGain);
    expect(g.get("taxableGain:housingBuilding")).toBe(0);
    expect(g.get("exemptGain:housingLand")).toBe(0);
    expect(g.get("exemptGain:housingBuilding")).toBe(hp.buildingTransferGain);
    expect(g.get("incomeAmount:housingLand")).toBe(73_547_369);
    expect(g.get("incomeAmount:housingBuilding")).toBe(0);
    expect(g.get("taxableGain:commercialLand")).toBe(49_031_579);
    expect(g.get("exemptGain:commercialLand")).toBe(0);
    expect(g.get("incomeAmount:commercialLand")).toBe(49_031_579);
    expect(g.get("incomeAmount:commercialBuilding")).toBe(0);
  });
});

describe("25억 고가주택 · 나중 토지 — 토지 전액 + 건물만 12억 안분", () => {
  const b = calc(2_500_000_000, TD, asset(), rates);
  const hp = b.housingPart;

  it("화면 — 배너가 안분 과세 + 토지분 전액 과세를 말한다", () => {
    expect(text(b)).toContain("적용 (12억 초과 안분 과세 — 나중에 취득한 부수토지분은 보유요건 미달로 전액 과세)");
  });

  it("신고서 표 — 토지 열 = 토지 차익 전액, 건물 열 = 안분분, 장특은 건물 열만", () => {
    const g = financials(b);
    expect(g.get("taxableGain:housingLand")).toBe(191_968_422);
    expect(g.get("taxableGain:housingBuilding")).toBe(259_870_985 - 191_968_422);
    expect(g.get("ltDeduction:housingLand")).toBe(0);
    expect(g.get("ltDeduction:housingBuilding")).toBe(hp.longTermDeductionAmount);
    expect((g.get("incomeAmount:housingLand") ?? 0) + (g.get("incomeAmount:housingBuilding") ?? 0)).toBe(hp.incomeAmount);
    expect(g.get("incomeAmount:housingLand")).toBe(191_968_422);
  });
});

describe("대조 — 토지·건물 같은 날이면 종전 문구·열 그대로", () => {
  const b = calc(1_000_000_000, TD, asset({ landAcquisitionDate: D("2021-06-01") }), rates);

  it("플래그 없음 · 「12억 이하 → 전액 비과세」 · 「주택으로 봄 → 1세대1주택 비과세」", () => {
    expect(b.housingPart.laterLandExemptExcluded).toBeUndefined();
    const t = text(b);
    expect(t).toContain("적용 (12억 이하 비과세)");
    expect(t).toContain("12억 이하 → 전액 비과세");
    expect(t).toContain("주택으로 봄 → 1세대1주택 비과세");
    const g = financials(b);
    expect(g.get("taxableGain:commercialLand")).toBe(0);
    expect(g.get("incomeAmount:commercialLand")).toBe(0);
  });
});
