/**
 * anchor — F-10 · 소득세법 시행령 §167의3④ (2주택은 §167의10②가 준용).
 *
 * 「1세대가 제1항제2호부터 제4호까지 또는 제8호의2에 따른 장기임대주택·감면대상장기임대주택·장기사원용주택
 *  또는 장기어린이집의 **의무임대기간·의무무상기간 또는 의무사용기간의 요건을 충족하기 전에 일반주택을
 *  양도하는 경우에도** 해당 임대주택등을 제1항에 따른 장기임대주택등으로 보아 **제1항제10호를 적용한다**.」
 *
 * 종전 엔진은 10호 판정에서 다른 주택이 기간까지 채웠는지를 물어, 기간만 모자란 임대주택을 가진
 * 일반주택 양도를 중과했다(과다).
 *
 * ⚠️ ④는 **일반주택을 양도하는 경우**의 10호에만 걸린다 — 기간을 못 채운 임대주택 **자신**을 양도하면
 *    2호에 해당하지 않는다(F10-3).
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

const TD = new Date("2024-06-01");

/** 마목(E) — 2019 등록 · 수도권 6억 이하 · 5%룰. 기간만 바꿔 쓴다(요건 8년). */
const E_RENTAL = {
  isLongTermRental: true,
  rentalType: "E" as const,
  isRegisteredRental: true,
  rentalRegistrationDate: new Date("2019-01-01"),
  businessRegistrationDate: new Date("2019-01-01"),
  rentalStartOfficialPrice: 500_000_000,
  rentIncreaseUnder5Pct: true,
};
const PENDING = { ...E_RENTAL, rentalPeriodYears: 3 };
const MET = { ...E_RENTAL, rentalPeriodYears: 8 };

type Over = Parameters<typeof makeHouse>[1];
function run(others: Over[], sellingId = "h1") {
  const houses = [makeHouse("h1", { regionCode: "11680" }), ...others.map((o, i) => makeHouse(`h${i + 2}`, o))];
  return determineMultiHouseSurcharge(
    makeInput(houses, { sellingHouseId: sellingId, transferDate: TD }),
    defaultRules,
    mockRegulatedHistory,
    suspensionNone,
    true,
  );
}
const types = (r: ReturnType<typeof run>) => r.exclusionReasons.map((e) => e.type);

describe("F-10 §167의3④ — 의무임대기간 충족 전 일반주택 양도", () => {
  it("F10-1 2주택: 기간만 모자란 마목 임대주택 → §167의10①10호 배제", () => {
    const r = run([PENDING]);
    expect(r.surchargeApplicable).toBe(false);
    expect(types(r)).toContain("only_general_two_house");
    const detail = r.exclusionReasons.find((e) => e.type === "only_general_two_house")!.detail;
    expect(detail).toMatch(/§167의3④/);
  });

  it("F10-1b (대조) 기간을 채운 임대주택도 같은 결론 — 종전부터 배제", () => {
    const r = run([MET]);
    expect(r.surchargeApplicable).toBe(false);
    expect(types(r)).toContain("only_general_two_house");
  });

  it("F10-2 (대조) 기간 외 요건(임대료 5%)도 어기면 ④ 밖 → 중과", () => {
    const r = run([{ ...PENDING, rentIncreaseUnder5Pct: false }]);
    expect(r.surchargeApplicable).toBe(true);
  });

  it("F10-2b (대조) 가목 등록상한(2018.4.2) 초과 등록이면 기간 외 요건 위반 → 중과", () => {
    const A_2019 = {
      isLongTermRental: true,
      rentalType: "A" as const,
      isApartment: false,
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2019-01-01"),
      businessRegistrationDate: new Date("2019-01-01"),
      rentalStartOfficialPrice: 500_000_000,
      rentIncreaseUnder5Pct: true,
      rentalPeriodYears: 3,
    };
    expect(run([A_2019]).surchargeApplicable).toBe(true);
    // 긍정 짝 — 2017 등록이면 기간만 모자라 ④ 의제
    expect(
      run([{ ...A_2019, rentalRegistrationDate: new Date("2017-01-01"), businessRegistrationDate: new Date("2017-01-01") }])
        .surchargeApplicable,
    ).toBe(false);
  });

  it("F10-3 (대조) 기간을 못 채운 임대주택 **자신**을 양도하면 ④ 밖 → 중과", () => {
    const r = run([PENDING], "h2");
    expect(r.surchargeApplicable).toBe(true);
  });

  it("F10-4 3주택: 다른 두 채가 기간 미충족 임대 + 기간 충족 임대 → 유일한 일반주택(10호)", () => {
    const r = run([PENDING, MET]);
    expect(r.surchargeApplicable).toBe(false);
    expect(types(r)).toContain("only_one_remaining");
    expect(r.warnings.some((w) => /§167의3⑤/.test(w))).toBe(true);
    expect(run([MET, MET]).warnings.some((w) => /§167의3⑤/.test(w))).toBe(false);
  });

  it("F10-5 사원용(4호) 무상 3년 · 어린이집(8의2호) 운영 2년 · 감면임대(3호) 3년도 같다", () => {
    expect(run([{ isEmployeeHousing: true, freeProvisionYears: 3 }]).surchargeApplicable).toBe(false);
    expect(run([{ isDayCareCenter: true, dayCareOperationYears: 2 }]).surchargeApplicable).toBe(false);
    expect(
      run([{ isTaxIncentiveRental: true, isNationalSizeHousing: true, rentalPeriodYears: 3 }]).surchargeApplicable,
    ).toBe(false);
  });

  it("F10-6 ④를 적용하면 §167의3⑤(요건 미충족 시 차액 신고·납부) 안내", () => {
    const r = run([PENDING]);
    expect(r.warnings.some((w) => /§167의3⑤/.test(w))).toBe(true);
    expect(run([MET]).warnings.some((w) => /§167의3⑤/.test(w))).toBe(false);
  });

  it("F10-7 세액 — 기간 미충족 임대주택을 둔 일반주택 양도 세액 = 기간 충족 시 세액(중과 없음)", () => {
    const hh = (rental: Record<string, unknown>): TransferTaxInput => {
      const houses = [
        { id: "selling", acquisitionDate: new Date("2015-01-01"), officialPrice: 300_000_000, region: "capital", regionCode: "11680", isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false },
        { id: "rental", acquisitionDate: new Date("2012-01-01"), officialPrice: 300_000_000, region: "capital", regionCode: "11680", isInherited: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false, ...rental },
      ];
      return baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: new Date("2015-01-01"),
        // 중과 한시 유예(2022.5.10~2026.5.9)가 끝난 뒤 — 유예 중이면 세 경우 모두 중과가 없어 구별력이 0이다.
        transferDate: new Date("2026-09-18"),
        isRegulatedArea: true,
        isOneHousehold: false,
        householdHousingCount: 2,
        houses: houses as TransferTaxInput["houses"],
        sellingHouseId: "selling",
      } as Partial<TransferTaxInput>);
    };
    const tax = (i: TransferTaxInput) => calculateTransferTax(i, loadFallbackTransferRates(i.transferDate)).totalTax;
    const pending = tax(hh(PENDING));
    const met = tax(hh(MET));
    const surcharged = tax(hh({ ...PENDING, rentIncreaseUnder5Pct: false }));
    expect(pending).toBe(met);
    expect(surcharged).toBeGreaterThan(pending); // 구별력 가드 — 중과면 세액이 다르다
  });
});
