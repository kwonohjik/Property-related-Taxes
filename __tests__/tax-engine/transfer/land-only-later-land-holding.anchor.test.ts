/**
 * 토지만 본인 주택 — 주택보다 나중에 취득한 부수토지 보유요건(G-3) · 다건 세율 기산 · 합가일 고지
 * (계획서 `docs/02-design/features/land-only-later-land-holding.plan.md` Q-1·Q-2·Q-3 (a)).
 *
 * 근거: 재산46014-610(2000.05.22.) — 동일세대원이 주택과 부수토지를 각각 소유해도 1세대 1주택이지만, 그 토지를 「주택부수토지로서 보유」한
 * 기간만 「소득세법 시행령」 §154① 보유요건에 든다. 기대값은 독립 정수 산식이다(엔진 출력 복사 아님). 모의 세율표 2024 누진 8구간.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE, LAND_ONLY_OTHER_HOUSEHOLD_NOTICE } from "@/lib/tax-engine/land-only-owner-household";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 10억 주택 = 토지 4억(취득 1억) : 건물 6억(취득 3억) · 주택 2014-09-01 · 토지 2023-09-01 별개 취득 · 2024-06-01 양도 · 1세대1주택 · 거주 10년 */
function house(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, acquisitionPrice: 400_000_000,
    landTransferPrice: 400_000_000, buildingTransferPrice: 600_000_000,
    landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 600_000_000,
    landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 300_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D("2023-09-01"), transferDate: D("2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    residencePeriodMonths: 120, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    ...over,
  } as Partial<TransferTaxInput>);
}
const LO = { selfOwns: "land_only", buildingOwnerSameHousehold: true } as Partial<TransferTaxInput>;
/** 20억 고가 = 토지 8억(취득 2억) : 건물 12억(취득 4억) */
const HV = {
  transferPrice: 2_000_000_000, acquisitionPrice: 600_000_000, landTransferPrice: 800_000_000, buildingTransferPrice: 1_200_000_000,
  landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 1_200_000_000, landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 400_000_000,
} as Partial<TransferTaxInput>;
/** 수도권 주거지역(2022.1.1. 이후 3배) · 정착면적 100㎡ → 한도 300㎡ · 토지 600㎡ = 초과 50% */
const EXCESS = { appurtenantLandZone: "metropolitan_residential", buildingFootprintArea: 100, acquisitionArea: 600 } as Partial<TransferTaxInput>;
const RENTAL_A = {
  applyException: true, scenario: "A",
  rentalUnits: [{
    businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general", rentalAcquisitionType: "purchase",
    isApartment: false, region: "non-metro", isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false,
    rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
  }],
} as unknown as TransferTaxInput["rentalHousingException"];
const expropriation = (businessApprovalDate: string) =>
  ({ oneHouseExemptionProviso: { reason: "expropriation", businessApprovalDate: D(businessApprovalDate), expropriationDate: D("2024-05-01") } }) as Partial<TransferTaxInput>;

const calc = (over: Partial<TransferTaxInput>) => calculateTransferTax(house(over), rates);
const excludedStep = (r: { steps: { label: string }[] }) => r.steps.some((s) => s.label.startsWith("부수토지 비과세 제외"));
const mergeNotice = (r: { warnings?: string[] }) => (r.warnings ?? []).includes(LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE);
const agg = (input: TransferTaxInput) =>
  calculateTransferTaxAggregate(
    { taxYear: input.transferDate.getFullYear(), properties: [{ ...input, propertyId: "p1", propertyLabel: "p1" } as unknown as TransferTaxItemInput], annualBasicDeductionUsed: 0 },
    rates,
  );

describe("D-1 토지만 본인 × 같은 세대 × 나중 취득 토지 — 보유요건 미달분은 비과세 제외(재산46014-610)", () => {
  it("A-1 토지 9개월 — 토지 양도차익 3억 전액 과세: 297,500,000 × 70% = 208,250,000(수정 전 0)", () => {
    const r = calc(LO);
    expect([r.isExempt, r.taxableGain, r.longTermHoldingDeduction, r.calculatedTax]).toEqual([false, 300_000_000, 0, 208_250_000]);
    expect(excludedStep(r)).toBe(true);
  });

  it("A-2 토지 1년 5개월 — × 60% = 178,500,000", () => {
    expect(calc({ ...LO, landAcquisitionDate: D("2023-01-01") }).calculatedTax).toBe(178_500_000);
  });

  it("A-3 토지 2년 5개월 — 보유요건 충족 · 비과세 0", () => {
    const r = calc({ ...LO, landAcquisitionDate: D("2022-01-01") });
    expect([r.isExempt, r.calculatedTax]).toEqual([true, 0]);
  });

  it("A-4 20억 고가 · 토지 9개월 — 12억 안분 없이 토지 6억 전액: 597,500,000 × 70% = 418,250,000(수정 전 166,250,000)", () => {
    const r = calc({ ...HV, ...LO });
    expect([r.taxableGain, r.calculatedTax]).toEqual([600_000_000, 418_250_000]);
  });

  it("A-5 초과분 50% — 2호: 이내분 147,500,000 × 70% = 103,250,000 + 초과분 150,000,000 × 50% = 75,000,000 = 178,250,000 > 1호 93,110,000", () => {
    const r = calc({ ...LO, ...EXCESS });
    expect([r.splitDetail?.nonBusinessLandPart?.gain, r.taxableGain, r.calculatedTax]).toEqual([150_000_000, 300_000_000, 178_250_000]);
    expect(calc(EXCESS).calculatedTax).toBe(178_250_000); // 소유자 같음과 같은 값
  });

  it("A-6 고가 + 초과분 — 이내분 297,500,000 × 70% = 208,250,000 + 초과분 300,000,000 × 50% = 150,000,000 = 358,250,000 > 1호 215,010,000", () => {
    const r = calc({ ...HV, ...LO, ...EXCESS });
    expect([r.splitDetail?.nonBusinessLandPart?.gain, r.calculatedTax]).toEqual([300_000_000, 358_250_000]);
  });

  it("A-9 수용 단서 — 고시일(2024-01-01) 전 취득 토지는 보유요건을 받지 않아 비과세 · 고시일(2023-06-01) 뒤 취득은 208,250,000", () => {
    const covered = calc({ ...LO, ...expropriation("2024-01-01") });
    expect([covered.isExempt, covered.calculatedTax]).toEqual([true, 0]);
    expect((covered.warnings ?? []).some((w) => w.startsWith("주택보다 나중에 취득한 부수토지는 보유기간이"))).toBe(true);
    expect(calc({ ...LO, ...expropriation("2023-06-01") }).calculatedTax).toBe(208_250_000);
  });

  it("A-10 다른 세대 · 건물만 본인 — 일반 토지 1년 미만 50%: 297,500,000 × 50% = 148,750,000(주택 70% 아님 — `land-only-lthd-rate-basis` Q-3 a) · 건물만 본인 0", () => {
    const other = calc({ selfOwns: "land_only", buildingOwnerSameHousehold: false });
    expect(other.calculatedTax).toBe(148_750_000);
    expect(other.warnings).toContain(LAND_ONLY_OTHER_HOUSEHOLD_NOTICE);
    expect(calc({ selfOwns: "building_only" }).calculatedTax).toBe(0);
  });
});

describe("D-1 §155⑳ 거주주택 특례 경로 — 특례 on = off(특례는 주택 수만 의제한다)", () => {
  it("A-7 A1(10억) · 토지 9개월 — 208,250,000 = A-1(토지 취득일로 세율 판정 · 수정 전 0)", () => {
    const r = calc({ ...LO, rentalHousingException: RENTAL_A });
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect([r.taxableGain, r.calculatedTax]).toEqual([300_000_000, 208_250_000]);
  });

  it("A-8 A2(20억) · 토지 9개월 — 건물분은 본인 자산이 아니다: 과세 600,000,000 · 418,250,000 = A-4", () => {
    const r = calc({ ...HV, ...LO, rentalHousingException: RENTAL_A });
    expect([r.taxableGain, r.calculatedTax]).toEqual([600_000_000, 418_250_000]);
  });

  it("A-11 G-3 격자(양도일 2020·2024 × 양도가 6종 × 토지 보유 2년 미만 3종 × 배율 이내·초과) — on = off · 다건 = 단건", () => {
    const LD: Record<string, string[]> = { "2020-06-01": ["2020-01-01", "2019-06-01", "2018-10-01"], "2024-06-01": ["2024-01-01", "2023-06-01", "2022-10-01"] };
    const bad: string[] = [];
    let cells = 0;
    for (const T of Object.keys(LD)) {
      const H = T < "2021-12-08" ? 900_000_000 : 1_200_000_000;
      for (const S of [800_000_000, H, H + 1, Math.floor(H * 1.5), H * 2, 3_000_000_000]) {
        for (const landAcq of LD[T]) {
          for (const area of [300, 660]) {
            const landT = Math.floor(S * 0.8);
            const over = {
              ...LO, transferPrice: S, acquisitionPrice: 300_000_000, landTransferPrice: landT, buildingTransferPrice: S - landT,
              landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: S - landT, landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 100_000_000,
              landAcquisitionDate: D(landAcq), transferDate: D(T), residencePeriodMonths: 60,
              buildingFootprintArea: 60, acquisitionArea: area, appurtenantLandZone: "non_urban",
            } as Partial<TransferTaxInput>;
            const off = calc(over);
            const on = calc({ ...over, rentalHousingException: RENTAL_A });
            cells++;
            if (!on.rentalHousingExceptionDetail?.applied || !on.splitDetail?.laterLandPart) bad.push(`${T} ${S} ${landAcq} ${area} 특례·G-3 미성립`);
            if (on.totalTax !== off.totalTax) bad.push(`${T} ${S} ${landAcq} ${area} on ${on.totalTax} off ${off.totalTax}`);
            const a = agg(house({ ...over, rentalHousingException: RENTAL_A })).totalTax;
            if (a !== on.totalTax) bad.push(`${T} ${S} ${landAcq} ${area} 다건 ${a} 단건 ${on.totalTax}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
    expect(cells).toBe(72);
  });
});

describe("D-2 다건 엔진 — 토지만 본인의 세율 기산(Q-2 a)", () => {
  it("A-12 다건 1건 = 단건 — 토지 9개월(208,250,000 × 1.1) · 고가(418,250,000 × 1.1)", () => {
    expect(agg(house(LO)).totalTax).toBe(229_075_000);
    expect(agg(house({ ...HV, ...LO })).totalTax).toBe(460_075_000);
  });

  it("A-13 토지를 먼저 산 경우(토지 2010 · 주택 2023-09 · 거주 9개월)는 다건이 종전대로 주택 취득일 기산 — (300,000,000 − 장특 84,000,000 − 2,500,000) × 70% × 1.1 = 164,395,000", () => {
    const early = house({ ...LO, acquisitionDate: D("2023-09-01"), landAcquisitionDate: D("2010-01-01"), residencePeriodMonths: 9 });
    expect(agg(early).totalTax).toBe(164_395_000);
  });
});

describe("Q-3 a 합가일 고지 — 토지만 본인 × 같은 세대 × 비과세 판정 × G-3 아님", () => {
  it("A-14 토지 2년 5개월(비과세)에만 — G-3 과세 · 소유자 같음 · 다른 세대 · 수용 단서(보유요건 면제)에는 없다", () => {
    expect(mergeNotice(calc({ ...LO, landAcquisitionDate: D("2022-01-01") }))).toBe(true);
    expect(mergeNotice(calc({ ...LO, landAcquisitionDate: D("2010-01-01") }))).toBe(true);
    expect(mergeNotice(calc(LO))).toBe(false);
    expect(mergeNotice(calc({ landAcquisitionDate: D("2022-01-01") }))).toBe(false);
    expect(mergeNotice(calc({ selfOwns: "land_only", buildingOwnerSameHousehold: false, landAcquisitionDate: D("2022-01-01") }))).toBe(false);
    expect(mergeNotice(calc({ ...LO, ...expropriation("2024-01-01") }))).toBe(false);
    expect(LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE).not.toMatch(/유리|불리|절감|절세/);
  });

  it("§155⑳ 선언이면 판정이 과세여도 단다 — 특례 경로도 같은 세대 토지를 그 주택의 부수토지로 본다", () => {
    expect(mergeNotice(calc({ ...LO, landAcquisitionDate: D("2022-01-01"), householdHousingCount: 2, isOneHousehold: false, rentalHousingException: RENTAL_A }))).toBe(true);
  });
});
