/**
 * anchor (A3 · OH-61 · OH-17 표시) — 겸용 결과 화면의 「12억 초과 안분」 행과 상가분 행이 **엔진이 실제로 쓴**
 * 규칙·분모를 그린다(재도출 금지 — memory `feedback_aggregate_display_rederives_engine_value`).
 *
 * OH-61 결함: 비과세 미적용이어도 「12억 초과 안분」 라벨과 `(주택 양도가액 − 12억)/주택 양도가액` 산식을
 *   그렸고(값 = 전액, 산식 = 음수), 공유지분은 엔진 분모(물건 전체 주택분 — 영 §156①)가 아니라 지분분을 그렸다.
 * OH-17 표시: §154③ 본문으로 상가 부분까지 비과세가 되면 상가분 행이 「주택으로 봄 → 비과세」를 말해야 한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
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
    residentialFloorArea: 100,
    nonResidentialFloorArea: 150,
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

describe("OH-61 ① 비과세 미적용 — 안분 산식을 그리지 않는다", () => {
  const b = calcMixedUseTransferTax(1_000_000_000, TD, asset({ isOneHouseExempt: false }), rates);

  it("엔진 규칙 확인 — non_one_house_full_taxation · 과세대상 = 전액(비사토 제외)", () => {
    expect(b.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(b.housingPart.proratedTaxableGain).toBe(
      b.housingPart.transferGain - b.housingPart.nonBusinessTransferredGain,
    );
  });

  it("🔴 「12억 초과 안분」 라벨·음수 산식 대신 「비과세 미적용 → 전액」", () => {
    const t = text(b);
    expect(t).not.toContain("12억 초과 안분 후 과세대상 양도차익");
    expect(t).toContain("1세대1주택 비과세 미적용 → 과세대상 양도차익 (전액)");
  });
});

describe("OH-61 ② 공유지분 — 분모는 엔진 echo(물건 전체 주택분)", () => {
  // 지분 50% · 물건 전체 25억(내 몫 12.5억)
  const b = calcMixedUseTransferTax(
    1_250_000_000,
    TD,
    asset({ totalPropertyTransferPrice: 2_500_000_000 }),
    rates,
  );

  it("엔진 — 안분 분모가 물건 전체 주택분이고 12억 초과 안분 규칙", () => {
    expect(b.calculationRoute.highValueRule).toBe("above_threshold_prorated");
    expect(b.housingPart.highValueBase).toBe(b.apportionment.wholeHousingTransferPrice);
    expect(b.housingPart.highValueBase).toBeGreaterThan(1_200_000_000);
    expect(b.apportionment.housingTransferPrice).toBeLessThan(1_200_000_000);
  });

  it("🔴 산식 분모에 물건 전체 주택분 값이 그려진다(지분분이 아니다)", () => {
    const t = text(b);
    const whole = b.housingPart.highValueBase!.toLocaleString();
    expect(t).toContain(`물건 전체 주택분 양도가액 ${whole} - 12억`);
    expect(t).not.toContain(`주택 양도가액 ${b.apportionment.housingTransferPrice.toLocaleString()} - 12억`);
  });

  it("산식이 값을 만든다 — (차익 − 비사토) × (분모 − 12억)/분모 = 표시값", () => {
    const h = b.housingPart;
    const base = h.highValueBase!;
    const ratio = (base - 1_200_000_000) / base;
    const land = Math.floor(Math.max(h.landTransferGain - h.nonBusinessTransferredGain, 0) * ratio);
    const bld = Math.floor(Math.max(h.buildingTransferGain, 0) * ratio);
    expect(land + bld).toBe(h.proratedTaxableGain);
  });
});

describe("OH-17 표시 — §154③ 본문으로 상가 부분까지 비과세", () => {
  const b = calcMixedUseTransferTax(
    1_000_000_000,
    TD,
    asset({ residentialFloorArea: 150, nonResidentialFloorArea: 100 }),
    rates,
  );

  it("🔴 상가분 행이 「주택으로 봄 → 1세대1주택 비과세」 · 장특·소득금액 행을 그리지 않는다", () => {
    const t = text(b);
    expect(t).toContain("주택으로 봄 → 1세대1주택 비과세");
    expect(t).not.toContain("상가부분 양도소득금액");
  });

  it("신고서 4열 — 상가 열은 과세 0 · 비과세 = 양도차익", () => {
    const got = new Map<string, number | null>();
    fourPartFinancials(b.housingPart, b.commercialPart, b.nonBusinessLandPart, (row, col, n) =>
      got.set(`${row}:${col}`, n),
    );
    expect(got.get("taxableGain:commercialLand")).toBe(0);
    expect(got.get("taxableGain:commercialBuilding")).toBe(0);
    expect(got.get("exemptGain:commercialBuilding")).toBe(b.commercialPart.buildingTransferGain);
    expect(got.get("exemptGain:commercialLand")).toBe(b.commercialPart.landTransferGain);
  });

  it("🔴 신고서 어댑터 — 과세대상 양도차익 합계에 상가분을 넣지 않는다(비사토 없음 → 0)", () => {
    expect(b.nonBusinessLandPart).toBeNull();
    expect(mixedUseToFilingResult(b).taxableGain).toBe(0);
  });

  it("대조군 — 단서(주택 100 < 상가 150)는 상가 열 과세 그대로", () => {
    const s = calcMixedUseTransferTax(1_000_000_000, TD, asset(), rates);
    const got = new Map<string, number | null>();
    fourPartFinancials(s.housingPart, s.commercialPart, s.nonBusinessLandPart, (row, col, n) =>
      got.set(`${row}:${col}`, n),
    );
    expect(got.get("taxableGain:commercialBuilding")).toBe(s.commercialPart.buildingTransferGain);
    expect(text(s)).toContain("상가부분 양도소득금액");
  });
});
