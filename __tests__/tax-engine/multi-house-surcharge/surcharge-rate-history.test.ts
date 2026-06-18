/**
 * 다주택 중과 가산율 — 양도일 기준 시행일별 분기 (소득세법 §104⑦).
 *
 * 2018.4.1~2021.5.31: 2주택 +10%p / 3주택+ +20%p
 * 2021.6.1~        : 2주택 +20%p / 3주택+ +30%p (현행)
 * ~2018.3.31       : 중과 미적용 (제도 시행 전)
 *
 * 근거: §104⑦ 현행(KoreanLaw MST285523 본문) + 시행일별 변천(국세청 다출처 일치).
 */

import { describe, it, expect } from "vitest";
import { calcTax } from "@/lib/tax-engine/transfer-tax-rate-calc";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { makeMockRatesWithHouseEngine, baseTransferInput } from "../_helpers/mock-rates";
import type { MultiHouseSurchargeResult } from "@/lib/tax-engine/multi-house-surcharge";

const parsed = parseRatesFromMap(makeMockRatesWithHouseEngine());
const TAX_BASE = 300_000_000;

function mh(type: "multi_house_2" | "multi_house_3plus"): MultiHouseSurchargeResult {
  // 중과 적용(유예 아님)만 검증 — 가산율 시행일 분기에 집중.
  return { surchargeApplicable: true, surchargeType: type } as MultiHouseSurchargeResult;
}

function run(transferDate: string, type: "multi_house_2" | "multi_house_3plus") {
  const input = baseTransferInput({
    acquisitionDate: new Date("2010-01-01"), // 장기보유 → 단기세율 회피, T-3 경로
    transferDate: new Date(transferDate),
    householdHousingCount: type === "multi_house_3plus" ? 3 : 2,
  });
  return calcTax(TAX_BASE, parsed, input, mh(type));
}

describe("§104⑦ 다주택 중과 가산율 — 양도일 시행일별", () => {
  it("R1: 2022 양도 3주택+ → +30%p (현행)", () => {
    expect(run("2022-06-01", "multi_house_3plus").surchargeRate).toBeCloseTo(0.3, 5);
  });

  it("R2: 2019 양도 3주택+ → +20%p (2018.4.1~2021.5.31 구 세율)", () => {
    expect(run("2019-06-01", "multi_house_3plus").surchargeRate).toBeCloseTo(0.2, 5);
  });

  it("R3: 2019 양도 2주택 → +10%p", () => {
    expect(run("2019-06-01", "multi_house_2").surchargeRate).toBeCloseTo(0.1, 5);
  });

  it("R4: 2017 양도 → 중과 미적용 (2018.4.1 이전, 일반 누진세율)", () => {
    const r = run("2017-06-01", "multi_house_3plus");
    expect(r.surchargeRate).toBeUndefined();
    expect(r.surchargeType).toBeUndefined();
  });

  it("R5: 2022 양도 2주택 → +20%p (현행)", () => {
    expect(run("2022-06-01", "multi_house_2").surchargeRate).toBeCloseTo(0.2, 5);
  });

  it("R6: 2018.4.1 경계 당일 양도 3주택+ → +20%p (시행 당일 포함)", () => {
    expect(run("2018-04-01", "multi_house_3plus").surchargeRate).toBeCloseTo(0.2, 5);
  });

  it("R7: 2021.6.1 경계 당일 양도 3주택+ → +30%p (강화 당일 포함)", () => {
    expect(run("2021-06-01", "multi_house_3plus").surchargeRate).toBeCloseTo(0.3, 5);
  });
});
