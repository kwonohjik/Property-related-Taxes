/**
 * 상속인이 아닌 수유자(유증·사인증여) — 조특법 상속 특례 두 갈래 (계획서 `docs/00-pm/sp69-77-non-heir-bequest.plan.md`)
 *
 * ① §69 자경농지 — 조특령 §66⑪·⑫ 피상속인 경작기간 합산은 「상속인이」 상속받은 농지에 한정한다.
 *    수유자에게는 합산하지 않는다(조심2021구1132 · 조심2023중10792). 상속인 유증은 합산한다(부동산거래관리과-370 — 플래그 없음).
 * ② §77⑨ · §77의3③ — 「상속받은」 토지등의 피상속인 취득일 소급을 수유자에게는 하지 않는다(사용자 결정 Q-1 (b)).
 *    정면 해석이 없어 불성립 사유에 `NON_HEIR_BEQUEST_77_NOTE`(확인 필요)를 붙인다.
 *
 * 종전에는 두 갈래 모두 수유자를 상속인과 똑같이 처리했다(§69 감면 100,000,000 · §77 감면 25,959,000).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calcReductions } from "@/lib/tax-engine/transfer-tax-reductions-calc";
import { NON_HEIR_BEQUEST_77_NOTE } from "@/lib/tax-engine/public-expropriation-reduction";
import { buildPublicExpropriationParts } from "@/lib/tax-engine/public-expropriation-reduction";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();
const NON_HEIR = { nonHeirBequest: true };

// ── ① §69 ─────────────────────────────────────────────────────────────
// 토지 양도 10억 · 취득 4억 · 상속개시(취득일) 2019-01-01 · 양도 2026-05-01 · 본인 2년 + 피상속인 10년 · §66⑪ 1년 계속 경작
const SF = (o: Record<string, unknown> = {}) => [
  { type: "self_farming" as const, farmingYears: 2, decedentFarmingYears: 10, heirContinuedFarming1Year: true, ...o },
];
const farm = (o: Partial<TransferTaxInput> & Record<string, unknown>) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2019-01-01"), transferDate: new Date("2026-05-01"),
      acquisitionCause: "inheritance", decedentAcquisitionDate: new Date("2000-01-01"),
      reductions: SF() as never, ...o,
    } as never),
    rates,
  );

describe("① §69 — 수유자는 피상속인 경작기간을 합산하지 않는다", () => {
  it("상속인 — 합산 2 + 10 = 12년 → 감면 100,000,000(불변)", () => {
    const r = farm({});
    expect(r.reductionAmount).toBe(100_000_000);
    expect(r.determinedTax).toBe(79_730_000);
  });

  it("수유자 — 본인 2년만 → 감면 0 · 결정 179,730,000(종전 79,730,000) · 산식에 합산 제외 사유", () => {
    const r = farm(NON_HEIR);
    expect(r.reductionAmount).toBe(0);
    expect(r.determinedTax).toBe(179_730_000);
    expect(r.selfFarmingReductionDetail?.qualifies).toBe(false);
    const line = r.selfFarmingReductionDetail?.breakdown.join(" ") ?? "";
    expect(line).toContain("피상속인 10년은 상속인이 아닌 수유자(유증·사인증여)라 합산 제외");
    expect(line).toContain("조심2021구1132");
  });

  it("수유자 · §66⑫ 대체요건만 선언해도 합산하지 않는다", () => {
    const r = farm({ ...NON_HEIR, reductions: SF({ heirContinuedFarming1Year: false, meetsDecedentAggregationAlt: true }) as never });
    expect(r.reductionAmount).toBe(0);
  });

  it("수유자 · 본인 자경 8년 → 합산이 필요 없어 감면 100,000,000(불변)", () => {
    const r = farm({ ...NON_HEIR, reductions: SF({ farmingYears: 8 }) as never });
    expect(r.reductionAmount).toBe(100_000_000);
  });

  it("레거시 경로(양도일 등 미전달)도 같은 축 — 수유자면 합산하지 않는다", () => {
    const rules = { conditions: { minFarmingYears: 8 }, maxAmount: 100_000_000, maxRate: 1 } as never;
    const args = [50_000_000, SF() as never, rules] as const;
    const pad = Array(15).fill(undefined) as undefined[]; // 4번째~18번째 인자 · 19번째 = nonHeirBequest
    expect(calcReductions(...args).reductionAmount).toBe(50_000_000);
    expect(
      (calcReductions as (...a: unknown[]) => { reductionAmount: number })(...args, ...pad, true).reductionAmount,
    ).toBe(0);
  });
});

// ── ② §77⑨ · §77의3③ ─────────────────────────────────────────────────
// 토지 양도 8억 · 취득 3억 · 상속개시 2024-01-10 · 피상속인 2000 취득 · 양도 2026-06-30 · 사업인정고시 2025-06-01
const PE = [{ type: "public_expropriation", cashCompensation: 800_000_000, bondCompensation: 0, bondHoldingYears: null, businessApprovalDate: new Date("2025-06-01") }];
const GB = [{ type: "gb_designated_land", branch: "in_zone", purchaseRoute: "negotiated", designationDate: new Date("2005-01-01"), triggerDate: new Date("2026-03-01"), residedFromAcqToTrigger: true }];
const land = (o: Partial<TransferTaxInput> & Record<string, unknown>) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "land", transferPrice: 800_000_000, transferDate: new Date("2026-06-30"),
      acquisitionDate: new Date("2024-01-10"), acquisitionPrice: 300_000_000, isOneHousehold: false,
      householdHousingCount: 0, residencePeriodMonths: 0, useEstimatedAcquisition: false,
      transferCause: "public_expropriation", reductions: PE, acquisitionCause: "inheritance",
      decedentAcquisitionDate: new Date("2000-01-01"), ...o,
    } as never),
    rates,
  );

describe("② §77⑨ — 수유자는 피상속인 취득일로 소급하지 않는다", () => {
  it("상속인 — 피상속인 2000 취득 → 감면 25,959,000(불변)", () => {
    const r = land({});
    expect(r.publicExpropriationDetail?.isEligible).toBe(true);
    expect(r.reductionAmount).toBe(25_959_000);
    expect(r.publicExpropriationDetail?.notEligibleReason).toBeUndefined();
  });

  it("수유자 — 상속개시일(2024-01-10)로 판정 → 불성립 · 결정 173,060,000(종전 147,101,000) · 사유에 확인 필요 고지", () => {
    const r = land(NON_HEIR);
    expect(r.publicExpropriationDetail?.isEligible).toBe(false);
    expect(r.reductionAmount).toBe(0);
    expect(r.determinedTax).toBe(173_060_000);
    expect(r.publicExpropriationDetail?.notEligibleReason).toBe(
      `사업인정고시일부터 소급 2년 이전에 취득한 토지등이 아닙니다(조특법 §77①) — ${NON_HEIR_BEQUEST_77_NOTE}`,
    );
  });

  it("수유자라도 상속개시일 자체가 소급 2년 이전이면 성립 — 고지 없음", () => {
    const r = land({ ...NON_HEIR, acquisitionDate: new Date("2020-01-10") });
    expect(r.publicExpropriationDetail?.isEligible).toBe(true);
    expect(r.reductionAmount).toBeGreaterThan(0);
    expect(r.publicExpropriationDetail?.notEligibleReason).toBeUndefined();
  });

  it("다필지 경로 — 수유자 → 0 + 고지(상속인 25,959,000)", () => {
    const parcel = (id: string) => ({ id, transferArea: 100, acquisitionArea: 100, acquisitionDate: new Date("2024-01-10"),
      acquisitionMethod: "actual" as const, acquisitionPrice: 150_000_000, standardPricePerSqmAtTransfer: 4_000_000 });
    const mp = (o: object) => land({ acquisitionPrice: 0, parcels: [parcel("a"), parcel("b")], ...o });
    expect(mp({}).reductionAmount).toBe(25_959_000);
    const r = mp(NON_HEIR);
    expect(r.reductionAmount).toBe(0);
    expect(r.publicExpropriationDetail?.notEligibleReason).toContain(NON_HEIR_BEQUEST_77_NOTE);
  });
});

describe("② §77의3③ — 개발제한구역 매수대상 토지도 같은 축", () => {
  it("상속인 — 피상속인 2000 취득(지정일 2005 이전) → 1호 40% 69,224,000(불변)", () => {
    const r = land({ reductions: GB as never, transferCause: undefined });
    expect(r.gbDesignatedLandDetail?.isEligible).toBe(true);
    expect(r.reductionAmount).toBe(69_224_000);
  });

  it("수유자 — 상속개시일 2024 기준 → 불성립 + 고지", () => {
    const r = land({ reductions: GB as never, transferCause: undefined, ...NON_HEIR });
    expect(r.gbDesignatedLandDetail?.isEligible).toBe(false);
    expect(r.reductionAmount).toBe(0);
    expect(r.gbDesignatedLandDetail?.notEligibleReason).toContain(NON_HEIR_BEQUEST_77_NOTE);
  });
});

describe("② 재개발 · §155⑳ 임대주택 특례 경로도 같은 축", () => {
  const PE2 = (notice: string) => ({ type: "public_expropriation" as const, cashCompensation: 1_500_000_000, bondCompensation: 0, businessApprovalDate: new Date(notice) });
  const inherit = (decedent: string) => ({ acquisitionCause: "inheritance" as const, decedentAcquisitionDate: new Date(decedent) });

  it("재개발 — 상속인 12,224,782(불변) · 수유자 0 + 고지", () => {
    const redev = (o: Partial<TransferTaxInput> & Record<string, unknown>) =>
      calculateTransferTax(
        baseTransferInput({
          propertyType: "redevelopment_apt", transferPrice: 525_000_000, transferDate: new Date("2026-02-16"),
          acquisitionDate: new Date("2024-01-10"), acquisitionPrice: 0, expenses: 0, useEstimatedAcquisition: true,
          isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
          redevelopment: case44RedevelopmentInfo(), reductions: [PE2("2025-06-01")], ...o,
        } as never),
        rates,
      );
    expect(redev(inherit("2005-04-09")).reductionAmount).toBe(12_224_782);
    const r = redev({ ...inherit("2005-04-09"), ...NON_HEIR });
    expect(r.reductionAmount).toBe(0);
    expect(r.publicExpropriationDetail?.notEligibleReason).toContain(NON_HEIR_BEQUEST_77_NOTE);
  });

  it("§155⑳ 임대주택 특례 — 상속인 316,500(불변) · 수유자 0 + 고지", () => {
    const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
      applyException: true,
      scenario: "A",
      rentalUnits: [
        {
          businessRegistrationDate: new Date("2018-06-01"), rentalRegistrationDate: new Date("2018-06-01"),
          rentalCategory: "long_general", rentalAcquisitionType: "purchase", isApartment: false, region: "non-metro",
          isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 96,
          rentalAutoTermination: false, requirementsConfirmed: true,
        },
      ],
    };
    const rent = (o: Partial<TransferTaxInput> & Record<string, unknown>) =>
      calculateTransferTax(
        baseTransferInput({
          propertyType: "housing", transferPrice: 1_500_000_000, acquisitionPrice: 1_100_000_000,
          acquisitionDate: new Date("2014-06-01"), transferDate: new Date("2024-06-01"), residencePeriodMonths: 60,
          isOneHousehold: true, householdHousingCount: 1, expenses: 0, reductions: [PE2("2015-06-01")],
          rentalHousingException: rentalException, ...o,
        } as never),
        rates,
      );
    expect(rent(inherit("2010-01-01")).reductionAmount).toBe(316_500);
    const r = rent({ ...inherit("2010-01-01"), ...NON_HEIR });
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.reductionAmount).toBe(0);
    expect(r.publicExpropriationDetail?.notEligibleReason).toContain(NON_HEIR_BEQUEST_77_NOTE);
  });
});

describe("② 5B 파트별 취득일 — 토지 파트도 같은 함수", () => {
  const part = { gain: 100, longTermDeduction: 0 } as never;
  const parts = (o: Record<string, unknown>) =>
    buildPublicExpropriationParts(
      {
        isSeparateAcquisition: true, landAcquisitionDate: new Date("2024-01-10"), acquisitionDate: new Date("2024-01-10"),
        acquisitionCause: "inheritance", decedentAcquisitionDate: new Date("2000-01-01"), transferDate: new Date("2026-06-30"),
        ...o,
      } as never,
      { land: part, building: part } as never,
    )!;

  it("상속인 — 토지·건물 파트 모두 피상속인 취득일(2000-01-01)", () => {
    const p = parts({});
    expect([p.land.acquisitionDate, p.building.acquisitionDate]).toEqual([new Date("2000-01-01"), new Date("2000-01-01")]);
  });

  it("수유자 — 두 파트 모두 상속개시일(2024-01-10)", () => {
    const p = parts(NON_HEIR);
    expect([p.land.acquisitionDate, p.building.acquisitionDate]).toEqual([new Date("2024-01-10"), new Date("2024-01-10")]);
  });
});

