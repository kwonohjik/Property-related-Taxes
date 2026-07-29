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

  // ⚠️ 2026-07-24 법령정합 재작성: 가목 우선 게이트(양도일 ≤ 2026-05-09 무조건 배제) 도입으로
  // 아래 두 테스트는 양도일을 가목 윈도우 밖(2026-05-09 이후)으로 이동해 다목 조건이 실제로
  // 판정에 관여함을 검증한다(anchor 갱신 사유 — plan §7 G3′).
  it("다목 조건 미충족(계약 2026-06-01 — 다목1 위반, 양도일 가목 이후) → 정밀 판정으로 유예 해제 (false)", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2026-08-01"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: twoRegulatedHouses(),
      gracePeriod: {
        contractDate: new Date("2026-06-01"), // 2026-05-09 이후 → 다목1 위반
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      },
    });

    const r = calculateTransferTax(input, ratesWithSuspensionActive());
    expect(r.multiHouseSurchargeDetail).toBeDefined();
    // gracePeriod가 엔진에 도달하지 않으면 blanket(가목 이후 만료)=false와 우연히 같아지므로
    // 계약일을 5-09 이전으로 바꾼 다음 테스트와 대조해 wiring을 증명한다.
    expect(r.isSurchargeSuspended).toBe(false);
  });

  it("다목 조건 충족(계약·계약금증빙, 양도일 가목 이후·계약+4개월 이내) → 유예 유지 (true)", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2026-08-01"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: twoRegulatedHouses(),
      gracePeriod: {
        contractDate: new Date("2026-04-01"), // ≤5-09, +4개월(강남 4개월 지역)=2026-08-01
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      },
    });

    const r = calculateTransferTax(input, ratesWithSuspensionActive());
    expect(r.isSurchargeSuspended).toBe(true);
  });
});

// ⑦ echo — surchargeSuspensionBasis/Deadline이 MultiHouseSurchargeResult → TransferTaxResult까지
// 침묵 stripping 없이 도달함을 고정 (결과 카드 표시용, 2026-07-24 UI 통합).
describe("MHG-03: surchargeSuspensionBasis/Deadline echo — TransferTaxResult 전파", () => {
  it("다목 유예 유지 시 basis='da' + deadline echo 전파", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2026-08-01"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: twoRegulatedHouses(),
      gracePeriod: {
        contractDate: new Date("2026-04-01"), // ≤5-09, +4개월(강남 4개월 지역)=2026-08-01
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      },
    });

    const r = calculateTransferTax(input, ratesWithSuspensionActive());
    expect(r.isSurchargeSuspended).toBe(true);
    expect(r.surchargeSuspensionBasis).toBe("da");
    expect(r.surchargeSuspensionDeadline).toBeInstanceOf(Date);
    expect((r.surchargeSuspensionDeadline as Date).toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("가목 우선 게이트(양도일 ≤ 2026-05-09) → basis='a' echo", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2026-05-09"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: twoRegulatedHouses(),
      gracePeriod: {
        contractDate: new Date("2026-06-01"), // 조건 미충족(다목1 위반)이어도 가목 우선 게이트로 배제
        isLandPermitTarget: false,
        depositReceiptConfirmed: false,
      },
    });

    const r = calculateTransferTax(input, ratesWithSuspensionActive());
    expect(r.isSurchargeSuspended).toBe(true);
    expect(r.surchargeSuspensionBasis).toBe("a");
    expect(r.surchargeSuspensionDeadline).toBeUndefined();
  });
});
