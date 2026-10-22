/**
 * anchor — 다주택 중과 판정 메뉴 P3b: 판정 단계 · 행별 간이 판정 · 민감도 (계획서 §4.3·§4.5 · MH-P3·P5·P7·P10).
 */
import { describe, it, expect } from "vitest";
import {
  decisionStageOf,
  judgeSurchargeRowSimplified,
  judgeSurchargeRows,
  rowJudgmentHouses,
} from "@/lib/tax-engine/multi-house-surcharge-narrative";
import { assembleSurchargeHouseSet, runMultiHouseSurchargeStep } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import { resolveHceGeneralHouseAcquisitionDate } from "@/lib/tax-engine/transfer-tax-precalc";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { MultiHouseSurchargeResult } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

// 중과 한시 유예(2022.5.10~2026.5.9)가 끝난 뒤
const TD = new Date("2026-09-18");
const rates = parseRatesFromMap(loadFallbackTransferRates(TD));
const house = (id: string, regionCode: string | undefined, over: Record<string, unknown> = {}) => ({
  id, acquisitionDate: new Date("2015-01-01"), officialPrice: 500_000_000, region: "capital", regionCode,
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, ...over,
});
const GANGNAM = "1168010100"; // 강남 — 12의2 나·다목 4개월 지역
const SEOCHO = "1165010100"; // 서초 — 4개월 지역
const GANGNEUNG = "5115010100"; // 강릉 — 비조정
function input(houses: object[], over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    transferDate: TD, acquisitionDate: new Date("2015-01-01"), isOneHousehold: true, isRegulatedArea: true,
    householdHousingCount: houses.length, residencePeriodMonths: 0,
    houses: houses as TransferTaxInput["houses"], sellingHouseId: "selling", ...over,
  } as Partial<TransferTaxInput>);
}
const headlineOf = (i: TransferTaxInput) =>
  runMultiHouseSurchargeStep(i, rates, [], { excluded: false } as never, resolveHceGeneralHouseAcquisitionDate(i))!;

describe("MH-P7 decisionStageOf — 반환 경로별", () => {
  const base: MultiHouseSurchargeResult = {
    effectiveHouseCount: 2, rawHouseCount: 2, excludedHouses: [], isRegulatedAtTransfer: true,
    surchargeApplicable: false, surchargeType: "none", isSurchargeSuspended: false, exclusionReasons: [], warnings: [],
  };
  it("[DS-1] 신호 분류 7갈래", () => {
    expect(decisionStageOf({ ...base, effectiveHouseCount: 1 })).toBe("one_house_or_less");
    expect(decisionStageOf({ ...base, isRegulatedAtTransfer: false })).toBe("not_regulated");
    expect(decisionStageOf({ ...base, exclusionReasons: [{ type: "low_price_local_house", detail: "" }] })).toBe("self_low_price");
    expect(decisionStageOf({ ...base, effectiveHouseCount: 3, exclusionReasons: [{ type: "only_one_remaining", detail: "" }] })).toBe("only_one_remaining");
    expect(decisionStageOf({ ...base, exclusionReasons: [{ type: "cultural_heritage", detail: "" }] })).toBe("excluded");
    expect(decisionStageOf({ ...base, surchargeType: "multi_house_2", isSurchargeSuspended: true })).toBe("suspended");
    expect(decisionStageOf({ ...base, surchargeType: "multi_house_2", surchargeApplicable: true })).toBe("surcharged");
  });
  it("[DS-2] 엔진 실행 — 1주택 · 비조정 · 중과 · 배제", () => {
    expect(decisionStageOf(headlineOf(input([house("selling", GANGNAM)])))).toBe("one_house_or_less");
    expect(decisionStageOf(headlineOf(input([house("selling", GANGNEUNG), house("h2", GANGNAM)])))).toBe("not_regulated");
    expect(decisionStageOf(headlineOf(input([house("selling", GANGNAM), house("h2", SEOCHO)])))).toBe("surcharged");
    expect(decisionStageOf(headlineOf(input([house("selling", GANGNAM, { isCulturalHeritage: true }), house("h2", SEOCHO)])))).toBe("excluded");
  });
});

describe("MH-P3·P10 행 간이 판정의 집합과 정밀 판정 일치", () => {
  it("[RJ-1] 양도 행위 사실이 없는 폼 — 양도 주택을 간이 판정하면 headline과 같다", () => {
    const i = input([house("selling", GANGNAM), house("h2", SEOCHO), house("h3", GANGNEUNG)]);
    const h = headlineOf(i);
    const s = judgeSurchargeRowSimplified(i, rates, "selling")!.result;
    expect(s.surchargeType).toBe(h.surchargeType);
    expect(s.effectiveHouseCount).toBe(h.effectiveHouseCount);
    expect(s.exclusionReasons.map((e) => e.type)).toEqual(h.exclusionReasons.map((e) => e.type));
  });
  it("[RJ-2] 행 판정 집합 = STEP 0.5 집합(id 순서까지) · 원래 양도 주택의 11호 계약 사실은 지운다", () => {
    const i = input([
      house("selling", GANGNAM, { contractDate: new Date("2017-01-01"), saleDepositReceived: true }),
      house("h2", SEOCHO),
    ]);
    const hs = rowJudgmentHouses(i, rates, "h2")!;
    expect(hs.map((h) => h.id)).toEqual(assembleSurchargeHouseSet(i, rates)!.rawHouses.map((h) => h.id));
    const sold = hs.find((h) => h.id === "selling")!;
    expect(sold.contractDate).toBeUndefined();
    expect(sold.saleDepositReceived).toBeUndefined();
  });
});

describe("MH-P10 명부와 판정 집합이 갈리는 경우 — §155⑳ 불성립 임대 호(카드)", () => {
  // 가목 2019 등록 · 요건 미확인 → §155⑳ 불성립 → STEP 0.5가 카드 임대 호를 명부에 더한다(`unmetRentalSurchargeHouses`).
  const UNIT = {
    businessRegistrationDate: new Date("2019-03-01"), rentalRegistrationDate: new Date("2019-03-01"),
    rentalCategory: "long_general", rentalAcquisitionType: "purchase", isApartment: false, region: "seoul-metro",
    isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 90,
    rentalAutoTermination: false, requirementsConfirmed: false,
  };
  it("[RJ-3] 행 판정 집합에 카드 임대 호가 들어간다(원 명부가 아니라 STEP 0.5 집합)", () => {
    const i = input([house("selling", GANGNAM), house("h2", SEOCHO)], {
      residencePeriodMonths: 48,
      rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [UNIT] } as unknown as TransferTaxInput["rentalHousingException"],
    });
    const setIds = assembleSurchargeHouseSet(i, rates)!.rawHouses.map((h) => h.id);
    expect(setIds.length).toBeGreaterThan(2); // 구별력 — 카드 행이 실제로 더해졌다
    expect(rowJudgmentHouses(i, rates, "h2")!.map((h) => h.id)).toEqual(setIds);
  });
});

describe("MH-P5 민감도 — 간이 결과가 중과일 때만", () => {
  it("[SN-1] 2주택 강남(양도)+서초 — 서초 행은 중과 · S1(§155 의제)·S3(나·다목 4개월)이 결론을 바꿀 수 있다", () => {
    const rows = judgeSurchargeRows(input([house("selling", GANGNAM), house("h2", SEOCHO)]), rates, headlineOf(input([house("selling", GANGNAM), house("h2", SEOCHO)])));
    const seocho = rows.find((r) => r.houseId === "h2")!;
    expect(seocho.basis).toBe("simplified");
    expect(seocho.stage).toBe("surcharged");
    const ids = seocho.sensitivity.map((s) => s.id);
    expect(ids).toContain("S1");
    expect(ids).toContain("S3");
    expect(seocho.sensitivity.find((s) => s.id === "S3")!.message).toContain("4개월");
    expect(rows.find((r) => r.houseId === "selling")!.basis).toBe("headline");
  });
  it("[SN-2] 간이 결과가 중과가 아니면 민감도 없음(비조정 행)", () => {
    const i = input([house("selling", GANGNAM), house("h2", GANGNEUNG)]);
    const row = judgeSurchargeRows(i, rates, headlineOf(i)).find((r) => r.houseId === "h2")!;
    expect(row.stage).toBe("not_regulated");
    expect(row.sensitivity).toEqual([]);
  });
  it("[SN-3] 소재지 코드 없는 행 — 조정대상지역으로 본다(모름 = 불리) · regionCodeMissing", () => {
    const i = input([house("selling", GANGNEUNG), house("h2", undefined)], { isRegulatedArea: false });
    const row = judgeSurchargeRows(i, rates, headlineOf(i)).find((r) => r.houseId === "h2")!;
    expect(row.regionCodeMissing).toBe(true);
    expect(row.result.isRegulatedAtTransfer).toBe(true);
  });
});
