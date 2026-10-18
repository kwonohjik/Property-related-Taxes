/**
 * anchor: §155⑳ 거주주택 특례 경로의 **배율 초과 부수토지 파트**에도 8호 중과 유예(양도 2009.3.16.~2015.12.31.)의
 * «지정지역 확인 필요» 고지와 유예 사유 echo가 일반 경로와 같이 붙는다.
 *
 * 계획서: `docs/00-pm/transfer-nbl-deferral-derived-followups.plan.md` F-2
 *
 * [결함 — 실측 2026-10-18] 지정지역 선언 값은 특례 경로에도 닿아 세액은 맞았다(«아님» 선언 시 유예). 그러나
 *  ⓐ 미선언이어도 «확인 필요» 고지가 0건이었다 — STEP 2.5가 특례 결과를 그대로 조기 반환해(`transfer-tax.ts`)
 *     일반 경로가 붙이는 고지(#2232 — `splitDetail.nonBusinessLandPart`가 있으면 비사업용으로 본다)를 지나지 않았다.
 *  ⓑ 유예 사유 `nblSurchargeExcluded`·`nblSurchargeExcludedBy`가 결과에 없었다 — 특례 결과 조립이 `surchargeType`만 실었다.
 *
 * [시료] 토지 2000-07-01 · 건물 2006-09-01 · 양도 2012-09-01 · 정착 60㎡ · 토지 1,500㎡ · 도시지역 밖(배율 10 → 한도 600㎡ · 초과 900㎡).
 *   저가(8억)는 주택분이 전액 비과세(RH-A1)라 초과분만 과세 — 8호가 세액을 가른다.
 *   고가(20억 · 토지 660㎡)는 합산 누진세액이 파트별 합계보다 커서(§104⑤) 8호가 세액을 가르지 않는다 — 고지하지 않는 것이 규약이다.
 * 세액은 mock 세율표 값(구조 증거)이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const NOTICE = "지정지역 여부를 선언하지 않아";

const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2005-06-01"),
      rentalRegistrationDate: D("2005-06-01"),
      rentalCategory: "long_general" as const,
      rentalAcquisitionType: "purchase" as const,
      isApartment: false,
      region: "non-metro" as const,
      isExcluded918Rule: false,
      standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false,
      rentalMonths: 96,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
};

const house = (o: { rhe: boolean; high?: boolean; ida?: boolean; td?: string }): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: o.high ? 2_000_000_000 : 800_000_000,
    acquisitionPrice: 300_000_000,
    landTransferPrice: o.high ? 1_600_000_000 : 640_000_000,
    buildingTransferPrice: o.high ? 400_000_000 : 160_000_000,
    landStandardPriceAtTransfer: o.high ? 1_600_000_000 : 640_000_000,
    buildingStandardPriceAtTransfer: o.high ? 400_000_000 : 160_000_000,
    landAcquisitionPrice: 200_000_000,
    buildingAcquisitionPrice: 100_000_000,
    acquisitionDate: D("2006-09-01"),
    landAcquisitionDate: D("2000-07-01"),
    transferDate: D(o.td ?? "2012-09-01"),
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    buildingFootprintArea: 60,
    acquisitionArea: o.high ? 660 : 1500,
    appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: 60,
    isOneHousehold: true,
    householdHousingCount: 1,
    expenses: 0,
    annualBasicDeductionUsed: 0,
    ...(o.rhe ? { rentalHousingException: rentalException } : {}),
    ...(o.ida !== undefined ? { isDesignatedArea: o.ida } : {}),
  });
const notices = (r: ReturnType<typeof calculateTransferTax>) => (r.warnings ?? []).filter((w) => w.includes(NOTICE)).length;

describe("§155⑳ 특례 + 배율 초과 파트 — 8호 유예 고지·사유 (RH-A1: 주택분 비과세 · 초과분만 과세)", () => {
  it("게이트 — 특례가 실제로 적용되고 배율 초과 파트가 갈린다", () => {
    const r = calculateTransferTax(house({ rhe: true }), rates);
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.rentalHousingExceptionDetail?.scenarioId).toBe("RH-A1");
    expect(r.splitDetail?.nonBusinessLandPart?.excessArea).toBe(900);
  });
  it("🔑 미선언 → 중과 유지(82,683,920) + «확인 필요» 고지 1건 (수정 전: 0건)", () => {
    const r = calculateTransferTax(house({ rhe: true }), rates);
    expect(r.totalTax).toBe(82_683_920);
    expect(r.surchargeType).toBe("non_business_land");
    expect(notices(r)).toBe(1);
  });
  it("🔑 «아님» → 유예(60,888,520) · 사유 transfer_deferral · nblSurchargeExcluded (수정 전: 사유 없음) · 고지 없음", () => {
    const r = calculateTransferTax(house({ rhe: true, ida: false }), rates);
    expect(r.totalTax).toBe(60_888_520);
    expect(r.nblSurchargeExcluded).toBe(true);
    expect(r.nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(notices(r)).toBe(0);
  });
  it("«지정지역» → 중과 유지 · 고지 없음 · 사유 없음", () => {
    const r = calculateTransferTax(house({ rhe: true, ida: true }), rates);
    expect(r.totalTax).toBe(82_683_920);
    expect(r.nblSurchargeExcludedBy).toBeUndefined();
    expect(notices(r)).toBe(0);
  });
  it("유예 기간 밖(2016-01-04) — 미선언이어도 고지 없음", () => {
    expect(notices(calculateTransferTax(house({ rhe: true, td: "2016-01-04" }), rates))).toBe(0);
  });
  it("패리티 — 같은 사실의 특례 off(일반 경로)와 세액·고지 수·사유가 같다", () => {
    for (const ida of [undefined, false, true] as const) {
      const on = calculateTransferTax(house({ rhe: true, ida }), rates);
      const off = calculateTransferTax(house({ rhe: false, ida }), rates);
      expect(on.totalTax).toBe(off.totalTax);
      expect(notices(on)).toBe(notices(off));
      expect(on.nblSurchargeExcludedBy).toBe(off.nblSurchargeExcludedBy);
    }
  });
});

describe("§155⑳ 특례 + 배율 초과 파트 — 고가(RH-A2): 합산 누진세액이 이겨 8호가 세액을 가르지 않는다", () => {
  it("미선언이어도 고지 0건 · «아님»과 총세액 같다 (현행 규약 유지)", () => {
    const und = calculateTransferTax(house({ rhe: true, high: true }), rates);
    const no = calculateTransferTax(house({ rhe: true, high: true, ida: false }), rates);
    expect(und.rentalHousingExceptionDetail?.scenarioId).toBe("RH-A2");
    expect(notices(und)).toBe(0);
    expect(no.totalTax).toBe(und.totalTax);
  });
});

describe("다건 — §155⑳ 특례 주택(RH-A1) + 같은 해 토지 1건", () => {
  const land = baseTransferInput({
    propertyType: "land", transferPrice: 300_000_000, acquisitionPrice: 100_000_000,
    acquisitionDate: D("2005-01-10"), transferDate: D("2012-05-01"), expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
  const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
  const agg = (ida?: boolean) =>
    calculateTransferTaxAggregate({ taxYear: 2012, properties: [asItem(house({ rhe: true, ida }), "p1"), asItem(land, "p2")], annualBasicDeductionUsed: 0 }, rates);
  type Row = { propertyId: string; rateGroup?: string; nblSurchargeExcludedBy?: string };
  const p1 = (a: ReturnType<typeof agg>) => a.properties.find((p) => p.propertyId === "p1") as unknown as Row;
  const aggNotices = (a: ReturnType<typeof agg>) => (a.warnings ?? []).filter((w) => w.includes(NOTICE)).length;

  it("🔑 미선언 → 합산 고지 1건 (수정 전: 0건) · 세율군 non_business_land", () => {
    const a = agg();
    expect(aggNotices(a)).toBe(1);
    expect(p1(a).rateGroup).toBe("non_business_land");
  });
  it("🔑 «아님» → 사유 transfer_deferral echo (수정 전: 없음) · 세율군 progressive(1호 버킷) — 세율군은 수정 전과 같다", () => {
    const a = agg(false);
    expect(p1(a).nblSurchargeExcludedBy).toBe("transfer_deferral");
    expect(p1(a).rateGroup).toBe("progressive");
    expect(aggNotices(a)).toBe(0);
  });
  it("세액 불변 — 총세액 134,327,600은 수정 전과 같다(echo·고지만 추가). 이 시료는 선언값과 무관하게 같다", () => {
    for (const ida of [undefined, false, true] as const) expect(agg(ida).totalTax).toBe(134_327_600);
  });
});
