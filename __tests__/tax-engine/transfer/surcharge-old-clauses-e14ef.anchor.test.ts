/**
 * E-14e·f — 다주택 중과 배제의 **구 조문**(2023.2.28. 전 양도분): 구 영 §167의10①8호 · 구 영 §167의11①1·6·7호
 * (계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.3). leaf·근거는 `lib/tax-engine/data/surcharge-old-clauses-era.ts`.
 * route 관측은 `__tests__/api/transfer.route.surcharge-old-clauses-e14ef.anchor.test.ts`.
 *
 * 종전 엔진은 그 기간에도 새 호(15호 · §167의11①13호)의 요건(§155① 타이밍 + §154① 충족)으로 판정했고,
 * 주택 1 + 권리 1 세대는 아예 배제하지 않았다. 구 호에는 §154① 요건이 없다.
 *
 * 해석(본문 실독 2026-09-29):
 * - 사전-2021-법령해석재산-0869(2021.12.31.) — 종전 주택 취득 후 1년 이내 신규 취득이어도 3년 내 종전 주택 양도면 8호 적용.
 * - 사전-2021-법령해석재산-1728(2021.12.17.) — 조정→조정이어도 「신규주택 취득일로부터 3년 이내에 양도하여 … 제8호에
 *   규정된 요건을 충족하는 경우에는 양도소득세가 중과되는 1세대2주택에 해당하지 않는 것」.
 * - 조심2021중1803(2021.6.9.) — 「1주택을 소유한 1세대」는 본문 괄호(1호 불산입)를 적용하지 않고 센다.
 * - 기획재정부 재산세제과-129(2023.1.19.) — §155⑯ 세대는 다른 주택 취득일부터 5년 내 양도하면 2주택 중과세율 미적용.
 *
 * ⚠️ 시료 양도일은 **2022.1.1. ~ 2023.2.27.**이다. 주택 수 산정 규칙(`transfer:special:house_count_exclusion`)의
 *    effective_date가 2022-01-01이라(fallback seed = Supabase — 계획서 transfer-review-4-defects V-3) 그 전 양도분은
 *    정밀 중과 판정(STEP 0.5) 자체를 타지 않는다(원시 플래그 fallback — E8-pre22가 고정). 2022.5.10. 이후는 보유 2년
 *    이상이면 한시 유예(§167의10①12의2호)가 가리므로 경계 시료는 보유 2년 미만으로 둔다.
 *
 * 세율 프로덕션 fallback · 강남 · 양도가액 20억 · 취득가액 3억.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { HouseInfo, MultiHouseSurchargeInput } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import { determineSurchargeExclusion } from "@/lib/tax-engine/multi-house-surcharge-exclusion";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes";
import {
  qualifiesOldClause8TemporaryTwoHouse,
  resolveOldMergeRightClause,
} from "@/lib/tax-engine/data/surcharge-old-clauses-era";
import { baseTransferInput, makeMockRatesWithHouseEngine, makeHouseInfo as makeHouseInfoMock } from "../_helpers/mock-rates";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const GN = "1168010100";
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
    // 조정대상지역 취득 → §154① 거주 2년 요건(residencePeriodMonths 0이면 미충족)
    wasRegulatedAtAcquisition: true,
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
  };
}
const tt = (prev: string, next: string, extra: object = {}) =>
  ({ previousAcquisitionDate: D(prev), newAcquisitionDate: D(next), newHouseRegionCode: GN, ...extra }) as TransferTaxInput["temporaryTwoHouse"];
/** 실제 소유 2주택(강남 2채) — 종전 주택 양도 */
const two = (prev: string, next: string, transfer: string, x: Partial<TransferTaxInput> = {}) =>
  input({
    acquisitionDate: D(prev),
    transferDate: D(transfer),
    householdHousingCount: 2,
    houses: [h("selling", prev), h("n", next)],
    temporaryTwoHouse: tt(prev, next),
    ...x,
  });
const RIGHT = (acq: string) => ({ id: "r", type: "redevelopment_right", acquisitionDate: D(acq), region: "capital", regionCode: GN });
/** 주택 1 + 조합원입주권 1 */
const oneRight = (house: string, right: string, transfer: string, x: Partial<TransferTaxInput> = {}) =>
  input({
    acquisitionDate: D(house),
    transferDate: D(transfer),
    householdHousingCount: 1,
    houses: [h("selling", house)],
    presaleRights: [RIGHT(right)] as never,
    ...x,
  });

/** 2주택 중과(+20%p · 장특 배제) — 보유 2년 이상 · 2022.3. 양도 */
const SURCHARGED_2022 = 1_141_772_500;

describe("E-14e 구 §167의10①8호 — §154① · §155① 1년 · 조정대상지역 기한 없이 「3년」", () => {
  it("E8-1 §154① 미충족(조정 취득 · 거주 0) · §155① 타이밍 충족 → 8호 배제 768,322,500 (종전 1,141,772,500)", () => {
    const r = calc(two("2019-06-01", "2021-07-01", "2022-03-02"));
    expect(r).toMatchObject({ totalTax: 768_322_500, reasons: "temporary_two_house", surchargeType: "none" });
    expect(r.detail).toContain(MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS_OLD);
  });

  it("E8-1p [짝] §154① 충족 → 종전에도 배제였다 274,065,000 (결론 불변 · 근거 호만 8호)", () => {
    const r = calc(two("2019-06-01", "2021-07-01", "2022-03-02", { residencePeriodMonths: 24 }));
    expect(r).toMatchObject({ totalTax: 274_065_000, reasons: "temporary_two_house" });
    expect(r.detail).toContain(MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS_OLD);
  });

  it("E8-2 사전-2021-법령해석재산-0869 — 종전 취득 후 1년 이내 신규 취득 · 3년 내 종전 양도 → 8호 배제 768,322,500 (종전 1,141,772,500)", () => {
    const r = calc(two("2019-06-01", "2020-03-01", "2022-03-02", { residencePeriodMonths: 24 }));
    expect(r).toMatchObject({ totalTax: 768_322_500, reasons: "temporary_two_house" });
  });

  it("E8-3 사전-2021-법령해석재산-1728 구조 — 조정→조정 1년 기한 경과 · 3년 이내 → 8호 배제 684,172,500 (종전 1,141,772,500)", () => {
    const r = calc(two("2017-01-01", "2020-03-01", "2022-03-02", { residencePeriodMonths: 24 }));
    expect(r).toMatchObject({ totalTax: 684_172_500, reasons: "temporary_two_house" });
  });

  it("E8-W 「3년이 지나지 아니한」 경계 — 신규 2019-03-04 → 2022-03-04 배제 701,002,500 · 03-05 중과", () => {
    expect(calc(two("2018-01-01", "2019-03-04", "2022-03-04"))).toMatchObject({
      totalTax: 701_002_500,
      reasons: "temporary_two_house",
    });
    expect(calc(two("2018-01-01", "2019-03-04", "2022-03-05"))).toMatchObject({
      totalTax: SURCHARGED_2022,
      reasons: "",
      surchargeType: "multi_house_2",
    });
  });

  it("E8-⑱ 3년 경과 + §155⑱ 사유(경매) → 8호 괄호로 배제 174,416,000 (종전과 같다)", () => {
    const r = calc(
      two("2016-01-01", "2018-06-01", "2022-03-02", {
        residencePeriodMonths: 24,
        temporaryTwoHouse: tt("2016-01-01", "2018-06-01", { disposalDelayReason: "auction" }),
      }),
    );
    expect(r).toMatchObject({ totalTax: 174_416_000, reasons: "temporary_two_house" });
    expect(r.detail).toContain(MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS_OLD);
  });

  it("E8-⑯ 기획재정부 재산세제과-129 — §155⑯ 세대는 5년: 3년 9개월 양도 배제 174,416,000 (종전과 같다)", () => {
    const r = calc(
      two("2016-01-01", "2018-06-01", "2022-03-02", {
        residencePeriodMonths: 24,
        temporaryTwoHouse: tt("2016-01-01", "2018-06-01", { publicInstitutionRelocation: true }),
      }),
    );
    expect(r).toMatchObject({ totalTax: 174_416_000, reasons: "temporary_two_house" });
    expect(r.detail).toContain(MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS_OLD);
  });

  it("E8-⑯w 5년 경계 — 신규 2017-03-02 → 2022-03-02 배제 · 03-03 중과", () => {
    const at = (t: string) =>
      calc(
        two("2015-01-01", "2017-03-02", t, {
          residencePeriodMonths: 24,
          temporaryTwoHouse: tt("2015-01-01", "2017-03-02", { publicInstitutionRelocation: true }),
        }),
      );
    expect(at("2022-03-02").reasons).toBe("temporary_two_house");
    expect(at("2022-03-03")).toMatchObject({ reasons: "", surchargeType: "multi_house_2" });
  });

  it("E8-n1 조심2021중1803 — 지방 저가주택(1호 · 중과 주택 수 불산입)까지 실제 3주택 → 8호 아님 · 중과 1,141,772,500", () => {
    const low = h("l", "2010-01-01", {
      region: "non_capital",
      regionCriteria: "VALUE",
      officialPrice: 100_000_000,
      transferOfficialPrice: 100_000_000,
      regionCode: "4311110100",
    } as Partial<HouseInfo>);
    const r = calc(
      two("2019-06-01", "2020-03-01", "2022-03-02", {
        residencePeriodMonths: 24,
        householdHousingCount: 3,
        houses: [h("selling", "2019-06-01"), h("n", "2020-03-01"), low],
      }),
    );
    expect(r).toMatchObject({ totalTax: SURCHARGED_2022, reasons: "", surchargeType: "multi_house_2" });
  });

  it("E8-n2 같은 날 취득(「그 주택을 양도하기 전에 다른 주택을 취득」 순서 불명 — 확인 필요) → 8호 아님 · 중과 (종전과 같다)", () => {
    const r = calc(two("2019-06-01", "2019-06-01", "2022-03-02", { residencePeriodMonths: 24 }));
    expect(r).toMatchObject({ totalTax: SURCHARGED_2022, reasons: "" });
  });

  it("E8-B 2023.2.27./28. 경계(보유 2년 미만 — 유예 비해당) — 27일 8호 배제 1,120,350,000(종전 1,141,178,500) · 28일 15호는 §154① 요구 → 중과", () => {
    expect(calc(two("2021-06-01", "2022-07-01", "2023-02-27"))).toMatchObject({
      totalTax: 1_120_350_000,
      reasons: "temporary_two_house",
    });
    expect(calc(two("2021-06-01", "2022-07-01", "2023-02-28"))).toMatchObject({
      totalTax: 1_141_178_500,
      reasons: "",
      surchargeType: "multi_house_2",
    });
  });

  it("E8-pre22 2022.1.1. 전 양도분은 정밀 중과 판정을 타지 않는다(주택 수 규칙 effective 2022-01-01) — 원시 플래그 중과 그대로", () => {
    const r = calc(two("2019-06-01", "2020-03-01", "2021-12-31", { residencePeriodMonths: 24 }));
    expect(r).toMatchObject({ totalTax: SURCHARGED_2022, reasons: "", surchargeType: undefined });
  });
});

describe("E-14f 구 §167의11①1호 — 「제156조의2제3항부터 제5항까지 … 에 따라 … 양도소득세가 과세되는 주택」", () => {
  it("F1-1 주택 1 + 조합원입주권 1(§156의2③) · §154① 미충족 → 구 1호 배제 768,322,500 (종전 1,141,772,500)", () => {
    const r = calc(oneRight("2019-06-01", "2021-01-01", "2022-03-02"));
    expect(r).toMatchObject({ totalTax: 768_322_500, reasons: "right_holding_one_house", surchargeType: "none" });
    expect(r.detail).toContain(MULTI_HOUSE.HOUSE_RIGHT_ONE_EACH_DEEMED_BASIS_OLD);
    expect(r.detail).toContain("§156의2 ③");
  });

  it("F1-2 §154① 충족 짝 → 구 1호 배제 274,065,000 (종전 423,115,000 — 그 기간 1+1은 배제 호가 없었다)", () => {
    const r = calc(oneRight("2019-06-01", "2021-01-01", "2022-03-02", { residencePeriodMonths: 24 }));
    expect(r).toMatchObject({ totalTax: 274_065_000, reasons: "right_holding_one_house" });
  });

  it("F1-n §156의2③ 1년 요건 미충족(권리 취득이 주택 취득 후 6개월) → 의제 없음 · 중과 1,141,772,500", () => {
    const r = calc(oneRight("2019-06-01", "2019-12-01", "2022-03-02"));
    expect(r).toMatchObject({ totalTax: SURCHARGED_2022, reasons: "", surchargeType: "multi_house_2" });
  });

  it("F1-n2 §156의2⑩ 준용 경로(문화재주택 + 일반주택 + 입주권 · 문화재주택은 지방 저가라 중과 주택 수 불산입) → 구 1호 인용 밖(확인 필요) · 중과", () => {
    const heritage = h("c", "2010-01-01", {
      region: "non_capital",
      regionCriteria: "VALUE",
      officialPrice: 100_000_000,
      transferOfficialPrice: 100_000_000,
      regionCode: "4311110100",
    } as Partial<HouseInfo>);
    const r = calc(
      oneRight("2019-06-01", "2021-01-01", "2022-03-02", {
        householdHousingCount: 2,
        houses: [h("selling", "2019-06-01"), heritage],
        culturalHeritageHouse: true,
      }),
    );
    expect(r).toMatchObject({ reasons: "", surchargeType: "multi_house_2" });
  });

  it("F1-B 2023.2.27./28. 경계 — 27일 구 1호 배제 1,120,350,000(종전 1,141,178,500) · 28일 13호는 §154① 요구 → 중과", () => {
    expect(calc(oneRight("2021-06-01", "2022-07-01", "2023-02-27"))).toMatchObject({
      totalTax: 1_120_350_000,
      reasons: "right_holding_one_house",
    });
    expect(calc(oneRight("2021-06-01", "2022-07-01", "2023-02-28"))).toMatchObject({
      totalTax: 1_141_178_500,
      reasons: "",
    });
  });
});

describe("E-14f 구 §167의11①6호(동거봉양 10년)·7호(혼인 5년) — 합침으로써 주택 1 + 권리 1", () => {
  const marriage = (d: string) => ({ wasRegulatedAtAcquisition: false, marriageMerge: { marriageDate: D(d) } });

  it("F2-1 7호 — 혼인 전 각자 주택·입주권 · 혼인 후 1년 10개월 양도 → 배제 236,365,800 (종전 423,115,000)", () => {
    const r = calc(oneRight("2016-01-01", "2019-01-01", "2022-03-02", marriage("2020-05-01")));
    expect(r).toMatchObject({ totalTax: 236_365_800, reasons: "marriage_merge", surchargeType: "none" });
    expect(r.detail).toContain(MULTI_HOUSE.HOUSE_RIGHT_MARRIAGE_MERGE_BASIS_OLD);
  });

  it("F2-2 6호 — 동거봉양 합가 8년 후 양도 → 배제 211,233,000 (종전 274,065,000)", () => {
    const r = calc(
      oneRight("2012-01-01", "2013-06-01", "2022-03-02", {
        wasRegulatedAtAcquisition: false,
        parentalCareMerge: { mergeDate: D("2014-01-01") },
      }),
    );
    expect(r).toMatchObject({ totalTax: 211_233_000, reasons: "parental_care_merge" });
    expect(r.detail).toContain(MULTI_HOUSE.HOUSE_RIGHT_PARENTAL_CARE_MERGE_BASIS_OLD);
  });

  it("F2-n1 입주권을 혼인 뒤 취득 → 「합침으로써」 아님 · 중과 423,115,000", () => {
    expect(calc(oneRight("2016-01-01", "2021-01-01", "2022-03-02", marriage("2020-05-01")))).toMatchObject({
      totalTax: 423_115_000,
      reasons: "",
      surchargeType: "multi_house_2",
    });
  });

  it("F2-n2 양도 주택을 혼인 뒤 취득 → 7호 아님 · 중과 1,141,772,500", () => {
    expect(calc(oneRight("2020-06-01", "2019-01-01", "2022-03-02", marriage("2020-05-01")))).toMatchObject({
      totalTax: SURCHARGED_2022,
      reasons: "",
    });
  });

  it("F2-W 「혼인한 날부터 5년이 경과하지 않은」 경계 — 혼인 2017-03-02 → 2022-03-02 배제 · 03-03 중과", () => {
    expect(calc(oneRight("2014-01-01", "2015-06-01", "2022-03-02", marriage("2017-03-02"))).reasons).toBe("marriage_merge");
    expect(calc(oneRight("2014-01-01", "2015-06-01", "2022-03-03", marriage("2017-03-02")))).toMatchObject({
      reasons: "",
      surchargeType: "multi_house_2",
    });
  });

  it("F2-B 2023.2.27./28. 경계 — 27일 7호 배제 1,120,350,000(종전 1,141,178,500) · 28일 6·7호 삭제 → 중과", () => {
    const m = { marriageMerge: { marriageDate: D("2021-09-01") } };
    expect(calc(oneRight("2021-06-01", "2021-08-01", "2023-02-27", m))).toMatchObject({
      totalTax: 1_120_350_000,
      reasons: "marriage_merge",
    });
    expect(calc(oneRight("2021-06-01", "2021-08-01", "2023-02-28", m))).toMatchObject({
      totalTax: 1_141_178_500,
      reasons: "",
    });
  });
});

/** 호 판정 leaf — `determineSurchargeExclusion`에 사실을 직접 준다(caller 판정과 분리해 관측). */
describe("구 호 leaf — 구간 · 인용 범위 · 주택·권리 수", () => {
  const ROW = { isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false };
  const house = (id: string, acq = "2010-01-01"): HouseInfo => ({
    ...ROW,
    id,
    acquisitionDate: D(acq),
    officialPrice: 500_000_000,
    region: "capital",
  });
  const right = { id: "rt", type: "redevelopment_right" as const, acquisitionDate: D("2015-01-01"), region: "capital" as const };
  const reason = (t: string, houses: number, rights: number, over: Partial<MultiHouseSurchargeInput>) => {
    const hs = Array.from({ length: houses }, (_, k) => house(k === 0 ? "selling" : `h${k}`));
    const rs = Array.from({ length: rights }, (_, k) => ({ ...right, id: `rt${k}` }));
    return determineSurchargeExclusion(
      {
        houses: hs,
        sellingHouseId: "selling",
        transferDate: D(t),
        isOneHousehold: true,
        sellingHouseMeetsOneHouseRequirements: false,
        presaleRights: rs,
        ...over,
      },
      houses + rights,
      null,
      null,
      new Set(),
      false,
      rights,
      rs,
    ).exclusionReasons[0];
  };

  it.each([
    ["2023-02-27", MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS_OLD],
    ["2023-02-28", undefined],
  ] as const)("8호 사실 + 2주택 · 양도 %s → %s", (t, basis) => {
    const r = reason(t, 2, 0, { oldClause8TemporaryTwoHouse: true });
    if (basis === undefined) expect(r).toBeUndefined();
    else expect(r?.detail).toContain(basis);
  });

  it("8호 사실이 있어도 3주택(중과 주택 수)·권리 세대에는 걸리지 않는다", () => {
    expect(reason("2022-03-02", 3, 0, { oldClause8TemporaryTwoHouse: true })).toBeUndefined();
    expect(reason("2022-03-02", 1, 1, { oldClause8TemporaryTwoHouse: true })).toBeUndefined();
  });

  it("그 기간의 §155① 의제(temporary_two_house)만으로는 받지 않는다 — 8호 사실이 정본", () => {
    expect(reason("2022-03-02", 2, 0, { deemedOneHouseBy155: "temporary_two_house", sellingHouseMeetsOneHouseRequirements: true })).toBeUndefined();
  });

  it.each([
    [true, "2023-02-27", MULTI_HOUSE.HOUSE_RIGHT_ONE_EACH_DEEMED_BASIS_OLD],
    [false, "2023-02-27", undefined], // ⑥·⑧·⑨·⑦⑩⑪ 준용 경로 — 구 1호 인용 밖(확인 필요 · 종전 동작)
    [true, "2023-02-28", undefined], // 13호는 §154① 요구(이 시료는 미충족)
  ] as const)("주택 1 + 권리 1 · §156의2③④ 직접 경로 %s · 양도 %s → %s", (cited, t, basis) => {
    const r = reason(t, 1, 1, { deemedOneHouseBy155: "house_with_redevelopment_right", rightDeemingCitedByOldClause1: cited });
    if (basis === undefined) expect(r).toBeUndefined();
    else expect(r?.detail).toContain(basis);
  });

  it("주택이 중과 주택 수에서 빠지고 권리 2개만 산입된 세대(합 2)에는 1+1 호가 걸리지 않는다", () => {
    const rs = [0, 1].map((k) => ({ ...right, id: `rt${k}` }));
    const r = determineSurchargeExclusion(
      {
        houses: [house("selling")],
        sellingHouseId: "selling",
        transferDate: D("2022-03-02"),
        isOneHousehold: true,
        deemedOneHouseBy155: "house_with_redevelopment_right",
        rightDeemingCitedByOldClause1: true,
        marriageMerge: { marriageDate: D("2016-01-01") },
        presaleRights: rs,
      },
      2,
      null,
      null,
      new Set(),
      false,
      2,
      rs,
    );
    expect(r.exclusionReasons).toEqual([]);
  });

  it("구 1호는 §156의2·§156의3 의제만 받는다 — §155 의제(농어촌)는 인용 밖", () => {
    expect(reason("2022-03-02", 1, 1, { deemedOneHouseBy155: "rural_house", rightDeemingCitedByOldClause1: true })).toBeUndefined();
  });
});

describe("구 호 leaf — 요건 술어", () => {
  const base = {
    isOneHousehold: true,
    householdHousingCount: 2,
    transferDate: D("2022-03-02"),
    temporaryTwoHouse: { previousAcquisitionDate: D("2019-06-01"), newAcquisitionDate: D("2020-03-01") },
  };
  it("8호 — 1세대 · 실제 2주택 · 종전이 먼저 · 3년(⑯ 5년) 이내", () => {
    expect(qualifiesOldClause8TemporaryTwoHouse(base)).toBe(true);
    expect(qualifiesOldClause8TemporaryTwoHouse({ ...base, isOneHousehold: false })).toBe(false);
    expect(qualifiesOldClause8TemporaryTwoHouse({ ...base, householdHousingCount: 3 })).toBe(false);
    expect(qualifiesOldClause8TemporaryTwoHouse({ ...base, temporaryTwoHouse: undefined })).toBe(false);
    expect(
      qualifiesOldClause8TemporaryTwoHouse({
        ...base,
        temporaryTwoHouse: { previousAcquisitionDate: D("2020-03-01"), newAcquisitionDate: D("2019-06-01") },
      }),
    ).toBe(false);
    expect(qualifiesOldClause8TemporaryTwoHouse({ ...base, transferDate: D("2023-03-02") })).toBe(false);
    // 3년 9개월 — ⑯이면 5년
    const late = { ...base, transferDate: D("2023-01-02"), temporaryTwoHouse: { previousAcquisitionDate: D("2016-01-01"), newAcquisitionDate: D("2019-03-04") } };
    expect(qualifiesOldClause8TemporaryTwoHouse(late)).toBe(false);
    expect(qualifiesOldClause8TemporaryTwoHouse({ ...late, publicInstitutionRelocationMet: true })).toBe(true);
    expect(
      qualifiesOldClause8TemporaryTwoHouse({ ...late, temporaryTwoHouse: { ...late.temporaryTwoHouse, disposalDelayReason: "auction" } }),
    ).toBe(true);
  });

  it("6·7호 — 권리 1개 · 주택·권리 모두 합가 전(당일 포함) · 기간 이내 · 혼인 먼저", () => {
    const p = {
      transferDate: D("2022-03-02"),
      sellingHouseAcquisitionDate: D("2016-01-01"),
      countedRightAcquisitionDates: [D("2020-05-01")],
      marriageDate: D("2020-05-01"),
    };
    expect(resolveOldMergeRightClause(p)).toMatchObject({ kind: "marriage", years: 5 });
    expect(resolveOldMergeRightClause({ ...p, countedRightAcquisitionDates: [] })).toBeUndefined();
    expect(resolveOldMergeRightClause({ ...p, countedRightAcquisitionDates: [D("2020-05-02")] })).toBeUndefined();
    expect(resolveOldMergeRightClause({ ...p, transferDate: D("2020-04-30") })).toBeUndefined();
    expect(
      resolveOldMergeRightClause({ ...p, marriageDate: undefined, parentalCareMergeDate: D("2013-01-01"), sellingHouseAcquisitionDate: D("2012-01-01"), countedRightAcquisitionDates: [D("2012-06-01")] }),
    ).toMatchObject({ kind: "parental_care", years: 10 });
  });
});

/**
 * 겸용주택 경로 — 같은 leaf(`qualifiesOldClause8TemporaryTwoHouse`)·같은 호 판정. 겸용은 2022.1.1. 이후 양도만 받는다.
 * 시료는 E-14abc MX와 같은 겸용 fixture · mock 세율(중과 규칙 포함).
 */
describe("겸용주택 — 구 8호 (E-14e)", () => {
  const sellingMixed = { ...makeHouseInfoMock("selling"), acquisitionDate: D("1997-09-12") };
  const newHouse = makeHouseInfoMock("h3", { acquisitionDate: D("2019-06-01") });
  const mixed = (raw: number) =>
    calcMixedUseTransferTax(
      3_000_000_000,
      D("2022-03-02"),
      {
        ...mixedUseCase14(),
        isOneHouseExempt: false,
        isOneHousehold: true,
        householdHousingCountForExclusion: raw,
        multiHouse: {
          houses: [sellingMixed, newHouse],
          sellingHouseId: "selling",
          presaleRights: [],
          isOneHousehold: true,
          isRegulatedArea: true,
        } as NonNullable<MixedUseAssetInput["multiHouse"]>,
        temporaryTwoHouse: { previousAcquisitionDate: D("1997-09-12"), newAcquisitionDate: D("2019-06-01") },
      } as MixedUseAssetInput,
      makeMockRatesWithHouseEngine(),
    ).multiHouseSurcharge;

  it("MX-8 겸용 + 신규(2019-06 · 3년 내) → 8호 배제 (종전 2주택 중과)", () => {
    const r = mixed(2);
    expect(r?.surchargeApplicable).toBe(false);
    expect(r?.exclusionReasons[0]?.detail).toContain(MULTI_HOUSE.TEMP_TWO_HOUSE_2HOUSE_BASIS_OLD);
  });

  it("MX-8n 실제 3주택 선언(조심2021중1803) → 8호 아님 · 2주택 중과", () => {
    const r = mixed(3);
    expect(r?.surchargeApplicable).toBe(true);
    expect(r?.surchargeType).toBe("multi_house_2");
  });
});
