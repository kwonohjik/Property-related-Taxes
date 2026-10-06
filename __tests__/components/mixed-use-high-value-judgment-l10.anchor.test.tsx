/**
 * anchor (L-10 표시) — 겸용주택(주택 연면적 > 주택 외) 고가 **판정**은 건물 전체(영 §156②), 12억 초과분
 * **산식**은 주택 부분(영 §160① 괄호). 결과 화면은 엔진 echo(`highValueJudgmentBase`·`highValueBase`)를
 * 그대로 그린다(재도출 금지 — memory `feedback_aggregate_display_rederives_engine_value`).
 *
 * 수정 전 결함: 주택분 ≤ 12억 < 전체 구간을 「12억 이하 → 전액 비과세」로 그렸다. 판정만 고치고 행을 그대로 두면
 * `(주택 양도가액 855,263,157 - 12억) / 855,263,157` 이라는 **음수 산식**이 나온다 — 두 축을 함께 막는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
// S3-2 — 겸용 주택분이 가목:나목 비례라 나목(주택건물 기준시가)이 필수다. 나목이 없는 fixture에 항등 나목(N = H − 가목)을 채워 호출한다.
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../tax-engine/_helpers/mixed-use-identity-std";
import { fourPartFinancials } from "@/components/calc/results/transfer/FilingFormTableFinancials";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const TD = new Date("2024-06-01");
const rates = makeMockRates();

function asset(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 150,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: new Date("2021-06-01"),
    buildingAcquisitionDate: new Date("2021-06-01"),
    transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: { housingPrice: 350_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_500_000 },
    residencePeriodYears: 3,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    ...over,
  };
}

const text = (b: ReturnType<typeof calcMixedUseTransferTax>) =>
  render(<MixedUseResultCard breakdown={b} />).container.textContent ?? "";

describe("L-10 표시 ① 주택분 855,263,157 ≤ 12억 < 전체 13억 (본문)", () => {
  const b = calcMixedUseTransferTax(1_300_000_000, TD, asset(), rates);

  it("🔴 「12억 이하 → 전액 비과세」 대신 판정 행(건물 전체 1,300,000,000 · §156②)", () => {
    const t = text(b);
    expect(t).not.toContain("12억 이하 → 전액 비과세");
    expect(t).toContain("고가주택 판정 — 건물 전체 실지거래가액");
    expect(t).toContain("1,300,000,000");
    expect(t).toContain("소득세법 시행령 §156 ②");
    expect(t).toContain("적용 (12억 초과 안분 과세)");
  });

  it("🔴 산식 행은 음수 분수 대신 「주택 양도가액 855,263,157 ≤ 12억 → 12억 초과분 없음」 (§160① 괄호)", () => {
    const t = text(b);
    expect(t).toContain("주택 양도가액 855,263,157 ≤ 12억 → 12억 초과분 없음");
    expect(t).toContain("소득세법 시행령 §160 ① 괄호");
    expect(t).not.toContain("주택 양도가액 855,263,157 - 12억");
  });

  it("신고서 어댑터·4열 — 주택 열 과세 0 · 상가 열 과세 = 상가 양도차익(세액 축 불변)", () => {
    const got = new Map<string, number | null>();
    fourPartFinancials(b.housingPart, b.commercialPart, b.nonBusinessLandPart, (row, col, n) =>
      got.set(`${row}:${col}`, n),
    );
    expect(got.get("taxableGain:housingBuilding")).toBe(0);
    expect(got.get("taxableGain:housingLand")).toBe(0);
    expect(got.get("taxableGain:commercialBuilding")).toBe(b.commercialPart.buildingTransferGain);
    expect(mixedUseToFilingResult(b).taxableGain).toBe(b.commercialPart.transferGain);
  });
});

describe("L-10 표시 ② 주택분도 12억 초과(20억) — 판정 행 + 주택분 분모 분수", () => {
  const b = calcMixedUseTransferTax(2_000_000_000, TD, asset(), rates);

  it("판정 2,000,000,000 · 산식 분모 1,315,789,473(전체 아님)", () => {
    const t = text(b);
    expect(t).toContain("고가주택 판정 — 건물 전체 실지거래가액");
    expect(t).toContain("주택 양도가액 1,315,789,473 - 12억");
    expect(t).not.toContain("주택 양도가액 2,000,000,000 - 12억");
  });
});

describe("L-10 표시 ③ 대조군 — 단서(주택 100 < 상가 150)는 판정 행 없음 · 12억 이하 비과세", () => {
  it("판정 행을 그리지 않는다", () => {
    const b = calcMixedUseTransferTax(
      1_300_000_000,
      TD,
      asset({ residentialFloorArea: 100, nonResidentialFloorArea: 150 }),
      rates,
    );
    const t = text(b);
    expect(t).toContain("12억 이하 → 전액 비과세");
    expect(t).not.toContain("고가주택 판정 — 건물 전체 실지거래가액");
  });
});
