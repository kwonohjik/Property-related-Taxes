/**
 * §154① 요건 게이트 end-to-end wiring anchor
 *
 * 혼인 2주택 §155⑤ 1세대1주택 의제 중과배제(배제2)는 §167의10①15호상 "§154① 요건 모두 충족"
 * 주택에 한정 → 양도 주택이 보유 2년·(조정취득 시)거주 2년 미충족이면 배제 부적용.
 *
 * calculateTransferTax → meetsOneHouseHoldingResidence precompute → mhInput.sellingHouseMeetsOneHouseRequirements
 * → determineMultiHouseSurcharge 배제2 게이트 까지 도달함을 고정(침묵 strip 방지).
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  baseTransferInput as baseInput,
  makeHouseInfo,
  makeMockRatesWithHouseEngine,
} from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const marriageHouses = () => [makeHouseInfo("h1", { regionCode: "11680" }), makeHouseInfo("h2")];

function marriageInput(overrides: Partial<TransferTaxInput>): TransferTaxInput {
  return baseInput({
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    isRegulatedArea: true,
    householdHousingCount: 2,
    isOneHousehold: true,
    sellingHouseId: "h1",
    houses: marriageHouses(),
    marriageMerge: { marriageDate: new Date("2022-06-01") }, // 혼인 2년전 (10년 이내)
    ...overrides,
  });
}

const hasMarriageExclusion = (r: ReturnType<typeof calculateTransferTax>) =>
  (r.multiHouseSurchargeDetail?.exclusionReasons ?? []).some((e) => e.type === "marriage_merge");

describe("MH154: §154① 요건 게이트 end-to-end (혼인 2주택 §155⑤ 의제)", () => {
  it("보유<2년 → §154① 미충족 → 혼인 전면배제 부적용", () => {
    const r = calculateTransferTax(
      marriageInput({
        acquisitionDate: new Date("2023-01-01"),
        transferDate: new Date("2024-06-01"), // 1.4년 보유
      }),
      makeMockRatesWithHouseEngine(),
    );
    expect(hasMarriageExclusion(r)).toBe(false);
  });

  it("조정취득 + 거주<2년 → §154① 거주 미충족 → 배제 부적용", () => {
    const r = calculateTransferTax(
      marriageInput({
        acquisitionDate: new Date("2020-01-01"),
        transferDate: new Date("2024-06-01"), // 4년 보유(충족)
        wasRegulatedAtAcquisition: true,
        residencePeriodMonths: 12, // 1년 < 2년
      }),
      makeMockRatesWithHouseEngine(),
    );
    expect(hasMarriageExclusion(r)).toBe(false);
  });

  it("보유 2년+ 비조정취득 → §154① 충족 → 혼인 전면배제 적용", () => {
    const r = calculateTransferTax(
      marriageInput({
        acquisitionDate: new Date("2020-01-01"),
        transferDate: new Date("2024-06-01"),
        wasRegulatedAtAcquisition: false,
      }),
      makeMockRatesWithHouseEngine(),
    );
    expect(hasMarriageExclusion(r)).toBe(true);
  });
});
