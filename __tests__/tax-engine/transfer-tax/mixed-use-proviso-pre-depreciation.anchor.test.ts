/**
 * anchor — 겸용주택 §97②2호 단서 가목은 §97③ 상가건물 감가상각비 **차감 전** 값으로 비교한다
 * (사용자 결정 2026-10-20 — 계획서 `docs/00-pm/mixed-use-sale-split-basis.plan.md` §18).
 *
 * 감가상각비는 본문(가목) 채택 후 상가건물 취득가액에서만 공제한다. 나목 채택 시에는 취득가액 자체를 쓰지 않으므로 공제하지 않는다.
 * 경계 구간 `차감 후 가목 < 나목 ≤ 차감 전 가목`에서 종전(차감 후 비교)은 나목으로 뒤집혔다 — 이 파일이 그 구간을 고정한다.
 *
 * 기준시가는 사례 p.772 역산값(`mixed-use-sale-split-engine.test.ts`와 같다). 감가상각비 10,000,000.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2026-07-01");
const TOTAL = 200_000_000;
const DEP = 10_000_000;

const BASE: MixedUseAssetInput = {
  isMixedUseHouse: true,
  residentialFloorArea: 30,
  nonResidentialFloorArea: 70,
  buildingFootprintArea: 100,
  totalLandArea: 400,
  landAcquisitionDate: new Date("2020-12-01"),
  buildingAcquisitionDate: new Date("2020-12-01"),
  transferStandardPrice: {
    housingPrice: 57_000_000, housingBuildingPrice: 27_000_000, commercialBuildingPrice: 63_000_000, landPricePerSqm: 250_000,
  },
  acquisitionStandardPrice: {
    housingPrice: 30_000_000, housingBuildingPrice: 18_000_000, commercialBuildingPrice: 42_000_000,
    landPricePerSqm: 100_000, landPricePerSqmAtBuildingAcq: 100_000,
  },
  residencePeriodYears: 3,
  isMetropolitanArea: false,
  zoneType: "agriculture_forest",
  isOneHouseExempt: true,
};

const calc = (extra: Partial<MixedUseAssetInput>) => calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, { ...BASE, ...extra }, rates);

describe("PD-1 총액 모델(같은 날 취득 · 환산) — `transfer-tax-mixed-use-proviso.ts`", () => {
  // 가목 = 환산 105,263,157 + 개산공제 3,000,000 = 108,263,157 (차감 후였다면 98,263,157)
  it("🔴 경계 — 나목 105,000,000 : 감가상각비가 있어도 가목 108,263,157 그대로 → 본문 · 상가건물 취득가액에서 감가상각비 공제", () => {
    const plain = calc({ transferExpense: 105_000_000 });
    const r = calc({ transferExpense: 105_000_000, commercialBuildingDepreciation: DEP });
    expect(r.necessaryExpenseProviso).toEqual({ estimatedSide: 108_263_157, directSide: 105_000_000, chosen: "estimated" });
    expect(r.necessaryExpenseProviso).toEqual(plain.necessaryExpenseProviso);
    expect(plain.commercialPart.buildingAcqPrice - r.commercialPart.buildingAcqPrice).toBe(DEP);
    expect(r.commercialPart.incomeAmount - plain.commercialPart.incomeAmount).toBe(9_000_000); // 차익 +10,000,000 · 장특 10%
  });

  it("🔴 나목 110,000,000 > 가목 → 나목 · 취득가액 0이라 감가상각비를 따로 빼지 않는다", () => {
    const r = calc({ transferExpense: 110_000_000, commercialBuildingDepreciation: DEP });
    expect(r.necessaryExpenseProviso).toEqual({ estimatedSide: 108_263_157, directSide: 110_000_000, chosen: "direct" });
    const h = r.housingPart;
    const c = r.commercialPart;
    expect(h.landAcqPrice + h.buildingAcqPrice + c.landAcqPrice + c.buildingAcqPrice).toBe(0);
  });
});

describe("PD-2 별개 취득 파트 모델(건물 환산 · 토지 실가) — `mixed-use-part-acq.ts`", () => {
  const PART: Partial<MixedUseAssetInput> = {
    buildingAcquisitionDate: new Date("2023-03-20"),
    separateAcquisition: { landMode: "actual", buildingMode: "estimated", landAcquisitionPrice: 50_000_000 },
  };
  // 건물 환산 묶음 가목 = 64,957,895 (차감 후였다면 54,957,895) · 나목(건물 몫 양도비) 59,210,527
  it("🔴 경계 — 나목 59,210,527 : 감가상각비가 있어도 가목 64,957,895 그대로 → 본문 · 상가건물 취득가액에서 공제", () => {
    const plain = calc({ ...PART, transferExpense: 125_000_000 });
    const r = calc({ ...PART, transferExpense: 125_000_000, commercialBuildingDepreciation: DEP });
    const group = { parts: ["building"], estimatedSide: 64_957_895, directSide: 59_210_527, chosen: "estimated" };
    expect(r.separateAcquisition?.provisoGroup).toEqual(group);
    expect(plain.separateAcquisition?.provisoGroup).toEqual(group);
    expect(r.commercialPart.buildingAcqPrice).toBe(34_210_526);
    expect(plain.commercialPart.buildingAcqPrice - r.commercialPart.buildingAcqPrice).toBe(DEP);
  });

  it("🔴 나목 66,315,790 > 가목 → 그 묶음만 나목 · 상가건물 취득가액 0(감가상각비 따로 빼지 않음)", () => {
    const r = calc({ ...PART, transferExpense: 140_000_000, commercialBuildingDepreciation: DEP });
    expect(r.separateAcquisition?.provisoGroup).toEqual({ parts: ["building"], estimatedSide: 64_957_895, directSide: 66_315_790, chosen: "direct" });
    expect(r.commercialPart.buildingAcqPrice).toBe(0);
    expect(r.housingPart.buildingAcqPrice).toBe(0);
  });
});
