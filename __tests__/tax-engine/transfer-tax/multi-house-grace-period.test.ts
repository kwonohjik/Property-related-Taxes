/**
 * 양도세 다주택 중과 — gracePeriod·inheritedDate 입력 위젯 wiring anchor
 *
 * TransferTaxInput.gracePeriod / houses[].inheritedDate 가 calculateTransferTax →
 * mhInput → determineMultiHouseSurcharge 까지 도달함을 end-to-end 로 고정한다.
 * (입력 위젯 구축 시 신규 필드가 엔진에 침묵 stripping 되지 않음을 보장.)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput as baseInput, makeHouseInfo, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";

/** 유예 윈도우 활성(2022.5.10~2026.5.9) 변형 — gracePeriod 정밀 판정 검증용 */
function ratesWithSuspensionActive() {
  const rates = makeMockRatesWithHouseEngine();
  const surcharge = rates.get("transfer:surcharge:_default")!;
  rates.set("transfer:surcharge:_default", {
    ...surcharge,
    specialRules: {
      surcharge_suspended: true,
      suspended_types: ["multi_house_2", "multi_house_3plus"],
      suspended_until: "2026-05-09",
    },
  });
  return rates;
}

const twoRegulatedHouses = () => [
  makeHouseInfo("h1", { regionCode: "11680" }), // 강남(조정) 양도주택
  makeHouseInfo("h2"),
];

describe("MHG-01: inheritedDate end-to-end (houses[] → calculateTransferTax)", () => {
  it("상속개시일 5년 이내 주택은 multiHouseSurchargeDetail에서 inherited_5years 로 배제", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: [
        makeHouseInfo("h1", { regionCode: "11680" }),
        makeHouseInfo("h2", { isInherited: true, inheritedDate: new Date("2022-01-01") }),
      ],
    });

    const r = calculateTransferTax(input, makeMockRatesWithHouseEngine());

    expect(r.multiHouseSurchargeDetail).toBeDefined();
    const ex = r.multiHouseSurchargeDetail!.excludedHouses.find((e) => e.houseId === "h2");
    expect(ex?.reason).toBe("inherited_5years");
  });
});

describe("MHG-02: gracePeriod wiring (TransferTaxInput → mhInput)", () => {
  it("gracePeriod 미제공 + 유예 윈도우 내 → blanket 유예 (isSurchargeSuspended=true)", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: twoRegulatedHouses(),
    });

    const r = calculateTransferTax(input, ratesWithSuspensionActive());
    expect(r.multiHouseSurchargeDetail).toBeDefined();
    expect(r.isSurchargeSuspended).toBe(true);
  });

  it("gracePeriod 조건 미충족(계약 2026-06-01·토지허가X) → 정밀 판정으로 유예 해제 (false)", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: twoRegulatedHouses(),
      gracePeriod: {
        contractDate: new Date("2026-06-01"),
        isLandPermitArea: false,
        hasTenantInResidence: false,
      },
    });

    const r = calculateTransferTax(input, ratesWithSuspensionActive());
    expect(r.multiHouseSurchargeDetail).toBeDefined();
    // gracePeriod가 엔진에 도달하지 않으면 blanket=true가 되어 이 단언이 깨진다 → wiring 증명
    expect(r.isSurchargeSuspended).toBe(false);
  });

  it("gracePeriod 조건 충족(토지거래허가+임차인) → 유예 유지 (true)", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: twoRegulatedHouses(),
      gracePeriod: {
        contractDate: new Date("2024-01-01"),
        isLandPermitArea: true,
        hasTenantInResidence: true,
      },
    });

    const r = calculateTransferTax(input, ratesWithSuspensionActive());
    expect(r.isSurchargeSuspended).toBe(true);
  });
});
