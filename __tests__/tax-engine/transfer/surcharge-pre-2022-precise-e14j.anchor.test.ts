/**
 * E-14j — 2018.4.1. ~ 2021.12.31. 양도분의 정밀 중과 판정(STEP 0.5) (계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9 E-14j).
 * route 관측은 `__tests__/api/transfer.route.surcharge-pre-2022-precise-e14j.anchor.test.ts`.
 *
 * 종전: 주택 수 산정 규칙 `transfer:special:house_count_exclusion`이 effective 2022-01-01 한 행뿐이라 그 전 양도분은
 * `parsedRates.houseCountExclusionRules`가 비어 STEP 0.5를 건너뛰고 원시 플래그(조정 + 세대 주택 수 ≥ 2)로 중과했다
 * (`transfer-tax-surcharge-predicate.ts` fallback). 영 §167의3①·§167의10①·§167의4·§167의11 각 호가 전부 빠졌다.
 * 수정: 같은 값의 행을 effective **2018-04-01**(법 §104⑦ 시행일 — 법률 제15225호 부칙 제1조1호·제2조②)로 추가하고,
 * 그 기간에 **없던** 호는 게이트하고 **있던** 호 중 엔진에 없던 것은 넣었다.
 *
 * ## 시기별 호 (소득세법 시행령 DRF eflaw 실독 2026-09-29 — 20180213 ~ 20230228 시행본 32개 전수 대조)
 *
 * | 호 | 적용 양도일 | 근거 |
 * |---|---|---|
 * | 1호 지방 3억 이하 불산입(§167의3① 본문 괄호·§167의10① 본문 괄호·§167의4②·§167의11②) | 2018.4.1. ~ (문언 동일) | 20180401 ~ 20220215 시행본 |
 * | 공고 전 매매계약(§167의3①11호·§167의4③5호·§167의10①11호·§167의11①10호) | **2018.8.28.** ~ | 대통령령 제29242호 부칙 제5조 |
 * | 보유 10년 이상(§167의3①12호·§167의4③6호·§167의10①12호·§167의11①11호) | **2019.12.17. ~ 2020.6.30.** | 대통령령 제30395호 부칙 제18조 · 호 본문 「2020년 6월 30일까지 양도」 |
 * | 구 §167의10①8호(일시적 2주택) · 구 §167의11①1·6·7호 | 2018.4.1. ~ 2023.2.27. | E-14e·f(`data/surcharge-old-clauses-era.ts`) |
 * | §167의3①13호 · 구 §167의10①13·14호 | 2021.2.17. ~ | 대통령령 제31442호 부칙 제2조② (종전 게이트) |
 * | 분양권 산입(법 §104⑦2·4호) · §89② 분양권 | 2021.1.1. 이후 **취득** 분양권 | 법률 제17477호 부칙 제4조 (종전 취득일 게이트) |
 *
 * 세율은 양도일 기준 프로덕션 fallback · 강남 · 양도가액 20억 · 취득가액 3억. 「종전」 값은 이 PR 전 엔진 실측이다.
 * ⚠️ 2009.3.16.~2012.12.31. 취득분은 법률 제9270호 부칙 제14조①(세율 특례)이 중과 세율만 빼므로 시료 취득일을 그 밖에 둔다
 *    (그 경로의 도달은 E-14j-C1이 따로 고정).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { baseTransferInput } from "../_helpers/mock-rates";
import { LONG_HOLDING_TEMPORARY_EXCLUSION, MULTI_HOUSE } from "@/lib/tax-engine/legal-codes";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);
const GN = "1168010100";
const CJ = "4311110100"; // 충북 청주 — 가액기준(VALUE) 지역
const h = (id: string, acq: string, extra: Partial<HouseInfo> = {}): HouseInfo => ({
  id,
  acquisitionDate: D(acq),
  officialPrice: 300_000_000,
  region: "capital",
  regionCode: GN,
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...extra,
});
function input(x: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 2_000_000_000,
    acquisitionPrice: 300_000_000,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: false,
    residencePeriodMonths: 0,
    regionCode: GN,
    sellingHouseId: "selling",
    ...x,
  });
}
function calc(i: TransferTaxInput) {
  const r = calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
  const mh = r.multiHouseSurchargeEvaluation;
  return {
    totalTax: r.totalTax,
    reasons: (mh?.exclusionReasons ?? []).map((e) => e.type).join(","),
    detail: mh?.exclusionReasons?.[0]?.detail ?? "",
    surchargeType: mh?.surchargeType,
    count: mh?.effectiveHouseCount,
  };
}
/** 실제 소유 2주택(강남 2채) · 종전 주택 양도 · 일시적 2주택 입력 */
const two = (prev: string, next: string, t: string, x: Partial<TransferTaxInput> = {}) =>
  input({
    acquisitionDate: D(prev),
    transferDate: D(t),
    householdHousingCount: 2,
    houses: [h("selling", prev), h("n", next)],
    temporaryTwoHouse: { previousAcquisitionDate: D(prev), newAcquisitionDate: D(next), newHouseRegionCode: GN } as TransferTaxInput["temporaryTwoHouse"],
    ...x,
  });
/** 양도 주택 + 다른 주택 1채(일시적 2주택 입력 없음) */
const pair = (acq: string, other: HouseInfo, t: string, selling: Partial<HouseInfo> = {}) =>
  input({
    acquisitionDate: D(acq),
    transferDate: D(t),
    householdHousingCount: 2,
    houses: [h("selling", acq, selling), other],
  });
const OTHER = h("n", "2014-01-01");

/** 2주택 원시 플래그 중과(+10%p · 장특 배제) — 2018.4.1.~2021.5.31. · 2013.6. 취득 */
const RAW_2HOUSE = 932_030_000;

describe("E-14j 주택 수 규칙 행 — 2018-04-01 ~ (fallback = seed 같은 의미론)", () => {
  const rule = (d: string) => loadFallbackTransferRates(D(d)).get("transfer:special:house_count_exclusion");
  it("S-1 2018-03-31 없음 · 2018-04-01 · 2021-12-31 = 2018 행 · 2022-01-01 = 2022 행 — 값은 같다", () => {
    expect(rule("2018-03-31")).toBeUndefined();
    expect(rule("2018-04-01")?.effectiveDate).toBe("2018-04-01");
    expect(rule("2021-12-31")?.effectiveDate).toBe("2018-04-01");
    expect(rule("2022-01-01")?.effectiveDate).toBe("2022-01-01");
    expect(rule("2018-04-01")?.specialRules).toEqual(rule("2022-01-01")?.specialRules);
  });
});

describe("E-14j 기존 호가 2022.1.1. 전 양도분에 닿는다", () => {
  it("J-1 (종전 E8-pre22) 구 8호 · 2021-12-31 1,141,772,500 → 768,322,500 = 2022-01-01 값(연속)", () => {
    const x = { residencePeriodMonths: 24, wasRegulatedAtAcquisition: true };
    const r = calc(two("2019-06-01", "2020-03-01", "2021-12-31", x));
    expect(r).toMatchObject({ totalTax: 768_322_500, reasons: "temporary_two_house", surchargeType: "none" });
    expect(r.detail).toContain(MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS_OLD);
    expect(calc(two("2019-06-01", "2020-03-01", "2022-01-01", x)).totalTax).toBe(768_322_500);
  });

  it("J-2 구 8호 · 2019-06-01 양도(신규 2018-06) 494,450,000 → 288,202,200", () => {
    expect(calc(two("2016-06-01", "2018-06-01", "2019-06-01"))).toMatchObject({
      totalTax: 288_202_200,
      reasons: "temporary_two_house",
    });
  });

  it("J-3 2018.4.1. 경계 — 3-31 391,875,000 불변(규칙 없음 · §104⑦ 시행 전) · 4-01 494,450,000 → 391,875,000(구 8호)", () => {
    expect(calc(two("2015-06-01", "2017-06-01", "2018-03-31"))).toMatchObject({ totalTax: 391_875_000, surchargeType: undefined });
    expect(calc(two("2015-06-01", "2017-06-01", "2018-04-01"))).toMatchObject({
      totalTax: 391_875_000,
      reasons: "temporary_two_house",
    });
  });

  it("J-3p [짝] 배제 호가 없는 2주택 · 2019 → 정밀 판정도 2주택 중과 932,030,000 (종전 값과 같다)", () => {
    expect(calc(pair("2013-06-01", OTHER, "2019-06-01"))).toMatchObject({
      totalTax: RAW_2HOUSE,
      reasons: "",
      surchargeType: "multi_house_2",
      count: 2,
    });
  });

  it("J-4 1호 지방 기준시가 1억 주택은 주택 수 불산입 · 2020 → 1주택 932,030,000 → 635,349,000", () => {
    const jibang = h("n", "2014-01-01", { region: "non_capital", regionCode: CJ, officialPrice: 100_000_000 });
    expect(calc(pair("2013-06-01", jibang, "2020-06-01"))).toMatchObject({ totalTax: 635_349_000, surchargeType: "none", count: 1 });
  });

  it("J-4p [짝] 지방 기준시가 3.5억은 산입 → 2주택 중과 932,030,000 (종전 값과 같다)", () => {
    const jibang = h("n", "2014-01-01", { region: "non_capital", regionCode: CJ, officialPrice: 350_000_000 });
    expect(calc(pair("2013-06-01", jibang, "2020-06-01"))).toMatchObject({ totalTax: RAW_2HOUSE, surchargeType: "multi_house_2", count: 2 });
  });

  it("J-5 다른 주택이 영 §167의3①2호 가목 장기임대주택 → §167의10①10호 · 2020 932,030,000 → 635,349,000", () => {
    const rental = h("r1", "2013-01-01", {
      isLongTermRental: true,
      rentalType: "A",
      isRegisteredRental: true,
      rentalRegistrationDate: D("2014-03-01"),
      businessRegistrationDate: D("2014-03-01"),
      rentalStartDate: D("2014-03-01"),
      rentalPeriodYears: 6,
      rentalStartOfficialPrice: 250_000_000,
      rentIncreaseUnder5Pct: true,
      isApartment: false,
    });
    const r = calc(pair("2013-06-01", rental, "2020-09-01"));
    expect(r).toMatchObject({ totalTax: 635_349_000, reasons: "only_general_two_house" });
    expect(r.detail).toContain(MULTI_HOUSE.TWO_HOUSE_ONLY_GENERAL);
  });

  it("J-6 구 §167의10①13호(2021.2.17.) 경계 — 2014 상속주택 + 일반주택: 2-16 494,450,000 불변(중과) · 2-17 494,450,000 → 331,399,200", () => {
    const inherited = h("i", "2014-06-01", { isInherited: true, inheritedDate: D("2014-06-01") });
    expect(calc(pair("2013-06-01", inherited, "2021-02-16"))).toMatchObject({ totalTax: 494_450_000, surchargeType: "multi_house_2" });
    expect(calc(pair("2013-06-01", inherited, "2021-02-17"))).toMatchObject({
      totalTax: 331_399_200,
      reasons: "inherited_general_house",
    });
  });

  it("J-7 주택 1 + 조합원입주권 1(§156의2③ 1년 요건 미충족) · 2020 → 법 §104⑦2호 중과 698,181,000 → 932,030,000", () => {
    const r = calc(
      input({
        acquisitionDate: D("2017-09-01"),
        transferDate: D("2020-09-01"),
        householdHousingCount: 1,
        wasRegulatedAtAcquisition: true,
        houses: [h("selling", "2017-09-01")],
        presaleRights: [{ id: "r", type: "redevelopment_right", acquisitionDate: D("2017-10-01"), region: "capital", regionCode: GN }] as never,
      }),
    );
    expect(r).toMatchObject({ totalTax: 932_030_000, reasons: "", surchargeType: "multi_house_2", count: 2 });
  });

  it("J-7b 같은 세대 2018.4.1. 경계 — 3-31 745,305,000 불변 · 4-01 745,305,000 → 932,030,000", () => {
    const at = (t: string) =>
      calc(
        input({
          acquisitionDate: D("2015-09-01"),
          transferDate: D(t),
          householdHousingCount: 1,
          houses: [h("selling", "2015-09-01")],
          presaleRights: [{ id: "r", type: "redevelopment_right", acquisitionDate: D("2015-10-01"), region: "capital", regionCode: GN }] as never,
        }),
      );
    expect(at("2018-03-31")).toMatchObject({ totalTax: 745_305_000, surchargeType: undefined });
    expect(at("2018-04-01")).toMatchObject({ totalTax: 932_030_000, surchargeType: "multi_house_2" });
  });

  it("J-8 분양권 취득일 2021.1.1. 경계(2021-12-01 양도) — 2020-12-31 취득분 불산입(1주택) · 2021-01-01 취득분 산입 → 구 §167의11①1호(§156의3②) 배제 · 세액 201,808,200 불변", () => {
    const at = (acq: string) =>
      calc(
        input({
          acquisitionDate: D("2013-06-01"),
          transferDate: D("2021-12-01"),
          householdHousingCount: 1,
          residencePeriodMonths: 36,
          houses: [h("selling", "2013-06-01")],
          presaleRights: [{ id: "p", type: "presale_right", acquisitionDate: D(acq), region: "capital", regionCode: GN }] as never,
        }),
      );
    expect(at("2020-12-31")).toMatchObject({ totalTax: 201_808_200, count: 1, surchargeType: "none" });
    expect(at("2021-01-01")).toMatchObject({ totalTax: 201_808_200, count: 2, reasons: "right_holding_one_house" });
  });

  it("J-9 3주택 · 배제 호 없음 · 2020 → 정밀 판정도 3주택 중과 1,118,755,000 (종전 값과 같다)", () => {
    expect(
      calc(
        input({
          acquisitionDate: D("2013-06-01"),
          transferDate: D("2020-09-01"),
          householdHousingCount: 3,
          houses: [h("selling", "2013-06-01"), h("a", "2013-06-01"), h("b", "2014-01-01")],
        }),
      ),
    ).toMatchObject({ totalTax: 1_118_755_000, surchargeType: "multi_house_3plus", count: 3 });
  });

  it("J-C1 법률 제9270호 부칙 제14조①(2009.3.16.~2012.12.31. 취득분 세율 특례)도 2022.1.1. 전 양도분에 닿는다 — 2012 취득 · 2019 932,030,000 → 745,305,000", () => {
    // 부칙 원문(법률 제9270호 · 2010.12.27. 개정): 「2009년 3월 16일부터 2012년 12월 31일까지 취득한 자산을 양도함으로써
    // 발생하는 소득에 대하여는 제104조제1항제4호부터 제9호까지의 규정에도 불구하고 같은 항 제1호에 따른 세율 …을 적용한다」
    // — 양도일 제한이 없다. 세율만 빼고 장특 배제는 남기는 것은 종전 엔진 규약(`multi-house-surcharge.ts` Step 7).
    expect(calc(pair("2012-01-01", OTHER, "2019-06-01"))).toMatchObject({ totalTax: 745_305_000, surchargeType: "multi_house_2" });
  });
});

describe("E-14j 그 기간의 호 게이트 — 공고 전 매매계약(2018.8.28.~)", () => {
  // ⚠️ 이 호는 양도 주택 regionCode가 조정대상지역 명부 코드(시군구 5자리)와 **정확히 같을 때만** 도달한다
  //    (`getFirstDesignatedDate` — 종전 동작. 10자리 법정동코드는 명부와 맞지 않는다 · 별건).
  const contract = (t: string, contractDate: string) =>
    calc(pair("2013-06-01", OTHER, t, { regionCode: "11680", contractDate: D(contractDate), hasContractDepositProof: true }));

  it("P-1 2018-08-27 양도 → 호 없음 · 중과 932,030,000 (종전 값과 같다) · 2018-08-28 → 배제 666,765,000 (종전 932,030,000)", () => {
    expect(contract("2018-08-27", "2017-07-01")).toMatchObject({ totalTax: RAW_2HOUSE, reasons: "", surchargeType: "multi_house_2" });
    expect(contract("2018-08-28", "2017-07-01")).toMatchObject({ totalTax: 666_765_000, reasons: "pre_designation_contract" });
  });

  it("P-1p [짝] 계약이 지정일(2017-08-03) 뒤 → 배제 없음 · 932,030,000", () => {
    expect(contract("2018-09-01", "2017-09-01")).toMatchObject({ totalTax: RAW_2HOUSE, reasons: "" });
  });
});

describe("E-14j 그 기간에 있던 호를 새로 넣었다 — 보유 10년 이상 · 2019.12.17.~2020.6.30. 양도", () => {
  const at = (acq: string, t: string) => calc(pair(acq, OTHER, t));

  it("L-1 양도일 창 경계(2008-12 취득) — 12-16 중과 932,030,000 · 12-17 572,517,000 · 6-30 572,517,000 · 7-01 중과 932,030,000 (종전 모두 932,030,000)", () => {
    expect(at("2008-12-01", "2019-12-16")).toMatchObject({ totalTax: RAW_2HOUSE, reasons: "" });
    const first = at("2008-12-01", "2019-12-17");
    expect(first).toMatchObject({ totalTax: 572_517_000, reasons: "long_holding_10y_until_2020_06_30" });
    expect(first.detail).toContain(LONG_HOLDING_TEMPORARY_EXCLUSION.TWO_HOUSE_BASIS);
    expect(at("2008-12-01", "2020-06-30")).toMatchObject({ totalTax: 572_517_000, reasons: "long_holding_10y_until_2020_06_30" });
    expect(at("2008-12-01", "2020-07-01")).toMatchObject({ totalTax: RAW_2HOUSE, reasons: "" });
  });

  it("L-2 보유 10년 경계(2020-03-02 양도) — 2010-03-02 취득 588,225,000 · 2010-03-03 취득은 10년 미만 → 중과 유형 유지 745,305,000(부칙 제9270호 세율 특례)", () => {
    expect(at("2010-03-02", "2020-03-02")).toMatchObject({ totalTax: 588_225_000, reasons: "long_holding_10y_until_2020_06_30" });
    expect(at("2010-03-03", "2020-03-02")).toMatchObject({ totalTax: 745_305_000, reasons: "", surchargeType: "multi_house_2" });
  });

  it("L-3 3주택 → 영 §167의3①12호 · 1,118,755,000 → 572,517,000", () => {
    const r = calc(
      input({
        acquisitionDate: D("2008-12-01"),
        transferDate: D("2020-03-02"),
        householdHousingCount: 3,
        houses: [h("selling", "2008-12-01"), h("a", "2013-06-01"), h("b", "2014-01-01")],
      }),
    );
    expect(r).toMatchObject({ totalTax: 572_517_000, reasons: "long_holding_10y_until_2020_06_30", count: 3 });
    expect(r.detail).toContain(LONG_HOLDING_TEMPORARY_EXCLUSION.THREE_PLUS_BASIS);
  });

  it("L-4 주택 + 조합원입주권 — 1 + 1은 영 §167의11①11호 · 합 3은 영 §167의4③6호", () => {
    const RIGHT = [{ id: "r", type: "redevelopment_right", acquisitionDate: D("2015-01-01"), region: "capital", regionCode: GN }] as never;
    const oneEach = calc(
      input({ acquisitionDate: D("2008-12-01"), transferDate: D("2020-03-02"), householdHousingCount: 1, houses: [h("selling", "2008-12-01")], presaleRights: RIGHT }),
    );
    expect(oneEach).toMatchObject({ totalTax: 296_841_600, reasons: "long_holding_10y_until_2020_06_30", count: 2 });
    expect(oneEach.detail).toContain(LONG_HOLDING_TEMPORARY_EXCLUSION.HOUSE_RIGHT_ONE_EACH_BASIS);
    const threePlus = calc(
      input({ acquisitionDate: D("2008-12-01"), transferDate: D("2020-03-02"), householdHousingCount: 2, houses: [h("selling", "2008-12-01"), OTHER], presaleRights: RIGHT }),
    );
    expect(threePlus).toMatchObject({ totalTax: 572_517_000, reasons: "long_holding_10y_until_2020_06_30", count: 3 });
    expect(threePlus.detail).toContain(LONG_HOLDING_TEMPORARY_EXCLUSION.HOUSE_RIGHT_THREE_PLUS_BASIS);
  });
});

// 겸용주택 경로(`calcMixedUseTransferTax`)는 2022.1.1. 전 양도분을 받지 않는다(`MIXED_USE_EFFECTIVE_DATE` 거부) — 이 변경의 영향 밖.
