/**
 * #17-2b — 고가주택(12억 초과 부분과세) + 배율 초과 부수토지 — 기획재정부 재산세제과-915(2011.10.27.) 회신 방식을 **옛 산식이 남아 있던 세 경로**에 맞춘다.
 *
 * 회신 방식(단일 주택은 #17-2 `dec17-2-high-value-excess-915.anchor.test.ts`가 이미 고정):
 *   기준면적 이내 토지분 과세 양도차익 = max(0, 전체 부수토지 양도차익의 안분값 − 배율 초과분 양도차익(안분 전 전액))
 *   건물분 = 건물 양도차익의 안분값 · 초과분은 비사업용 토지로 전액 과세
 * 옛 산식(수정 전)은 초과분을 안분 전에 떼어낸 «나머지»만 다시 안분해 초과분이 이중으로 빠졌다.
 *
 * | 경로 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | ① §155⑳ A2 (20억 · 토지 660㎡ 비도시) 특례 on 총세액 | 131,357,999 | 116,574,000 |
 * | ① 같은 30억 시료 | 328,911,000 | 312,648,600 |
 * | ② 겸용주택 80억(주택분 23.4억) 주택분 과세 양도차익 | 524,861,872 | 389,493,372 |
 * | ② 겸용주택 120억 | 1,064,612,397 | 788,905,159 |
 * | ③ 일괄양도 주택 8억 + 토지 12억(700㎡) 총세액 | 137,823,712 | 124,887,713 (단일 주택 입력 124,887,712) |
 * | ③ 일괄양도 주택 10억 + 토지 15억(500㎡) 총세액 | 157,792,800 | 134,046,000 (단일 주택 입력과 같다) |
 *
 * 기대값은 엔진 출력을 베끼지 않고 BigInt로 독립 도출한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { baseTransferInput, makeMockRates, makeMockRatesWithHouseEngine } from "../../tax-engine/_helpers/mock-rates";
import { calcMixedUseTransferTaxIdN as calcMixedUse, withIdentityHousingBuildingStd } from "../../tax-engine/_helpers/mixed-use-identity-std";
import { mixedUseCase14, mixedUseExcessLand, CASE14_TRANSFER_DATE } from "../../tax-engine/_helpers/mixed-use-fixture";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildMixedUsePartCards } from "@/app/api/calc/transfer/mixed-use-part-cards";
import { fourPartFinancials } from "@/components/calc/results/transfer/FilingFormTableFinancials";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import {
  allocateUnitExcessShares,
  highValueExcessLandTaxableGain,
} from "@/lib/tax-engine/high-value-excess-land";
import { resolveUnitExcessShares, type OneHouseUnit } from "@/lib/tax-engine/transfer-tax-one-house-unit";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 영 §160① 고가주택 안분 — 곱셈 먼저 · 나눗셈 나중(BigInt 독립 도출). `threshold`는 양도일 연혁(6·9·12억). */
const prorateOf = (price: number, threshold = 1_200_000_000) => (gain: number): number =>
  gain <= 0 ? 0 : Number((BigInt(gain) * BigInt(price - threshold)) / BigInt(price));

// ══════════════════════════════════════════════════════════════════════
// 0. leaf — 세 경로가 공유하는 단일 소스
// ══════════════════════════════════════════════════════════════════════

describe("#17-2b leaf — highValueExcessLandTaxableGain · allocateUnitExcessShares", () => {
  const p40 = (g: number) => Math.floor(g * 0.4);

  it("L'>X · L'=X(경계) · L'<X(0 하한) · 음수 입력", () => {
    // 전체 부수토지 1,000 · 안분 비율 0.4 → 안분값 400
    expect(highValueExcessLandTaxableGain({ landGain: 1000, excessGain: 300, prorate: p40 })).toBe(100); // L'>X
    expect(highValueExcessLandTaxableGain({ landGain: 1000, excessGain: 400, prorate: p40 })).toBe(0); // 정확히 경계
    expect(highValueExcessLandTaxableGain({ landGain: 1000, excessGain: 401, prorate: p40 })).toBe(0); // 음수 → 0
    // 토지 차손 — 부호 대칭(사용자 결정 2026-10-20 A안 · 조심2016부0323): min(0, 안분값 − 초과분)
    expect(highValueExcessLandTaxableGain({ landGain: -500, excessGain: 0, prorate: p40 })).toBe(-200);
    expect(highValueExcessLandTaxableGain({ landGain: -1000, excessGain: -300, prorate: p40 })).toBe(-100); // −400 − (−300)
    expect(highValueExcessLandTaxableGain({ landGain: -1000, excessGain: -401, prorate: p40 })).toBe(0); // 초과분 차손이 더 크면 이내분 0
    expect(highValueExcessLandTaxableGain({ landGain: 1000, excessGain: -50, prorate: p40 })).toBe(400); // 음수 초과분은 0으로 본다
  });

  it("몫 배분 — Σ몫 = X(잔액 흡수) · 한 조각이면 몫 = X · 조각 없음/초과분 없음은 0", () => {
    const s = allocateUnitExcessShares([100, 200, 300], 1000);
    expect(s.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(s).toEqual([166, 333, 501]); // floor 안분 + 마지막 양수 조각이 잔액 1을 흡수
    expect(allocateUnitExcessShares([777], 123)).toEqual([123]);
    expect(allocateUnitExcessShares([0, 0], 100)).toEqual([0, 0]);
    expect(allocateUnitExcessShares([100], 0)).toEqual([0]);
    expect(allocateUnitExcessShares([0, 50], 7)).toEqual([0, 7]);
  });
});

// ══════════════════════════════════════════════════════════════════════
// ② 겸용주택
// ══════════════════════════════════════════════════════════════════════

describe("#17-2b ② 겸용주택 — buildHousingPart", () => {
  const std = (housingPrice: number) => ({ housingPrice, commercialBuildingPrice: 50_000_000, landPricePerSqm: 6_100_000 });
  const calcAt = (price: number, hp: number, over: Partial<MixedUseAssetInput> = {}) =>
    calcMixedUse(price, CASE14_TRANSFER_DATE, mixedUseExcessLand({ transferStandardPrice: std(hp), ...over }), rates);

  /** 회신 방식 기대값 — 주택분 안분 분모는 엔진이 쓴 `highValueBase`가 아니라 apportionment에서 독립으로 읽는다. */
  function expected915(b: ReturnType<typeof calcAt>) {
    const h = b.housingPart;
    const base = b.apportionment.wholeHousingTransferPrice ?? b.apportionment.housingTransferPrice;
    const p = prorateOf(base);
    const land = Math.max(0, p(h.landTransferGain) - h.nonBusinessTransferredGain);
    const building = p(h.buildingTransferGain);
    return { p, land, building, total: land + building };
  }

  it("80억(주택분 23.4억 · L'<X) — 한도 내 토지분 0 · 주택분 과세 양도차익 389,493,372 (수정 전 524,861,872)", () => {
    const b = calcAt(8_000_000_000, 2_000_000_000);
    const h = b.housingPart;
    const e = expected915(b);
    expect(h.isExempt).toBe(false);
    expect(e.p(h.landTransferGain)).toBeLessThan(h.nonBusinessTransferredGain); // 0 하한이 걸리는 시료임을 고정
    expect(h.highValueExcessRuling!.landTaxableGain).toBe(0);
    // 겸용 안분은 부동소수 비율 절사(종전 규약 — 값 불변)라 BigInt와 최대 1원 차이
    expect(Math.abs(h.proratedTaxableGain - e.total)).toBeLessThanOrEqual(1);
    expect(h.proratedTaxableGain).toBe(389_493_372);
    expect(h.longTermDeductionAmount).toBe(311_594_697);
    expect(h.incomeAmount).toBe(77_898_675);
    // 파트 정합 — Σ파트 장특 = 주택분 장특 · 건물분 과세 양도차익 + 토지분 = 주택분 과세 양도차익
    const r = h.highValueExcessRuling!;
    expect(r.landTaxableGain + r.buildingTaxableGain).toBe(h.proratedTaxableGain);
    expect(r.landLongTermDeduction + r.buildingLongTermDeduction).toBe(h.longTermDeductionAmount);
    expect(r.wholeLandGain).toBe(h.landTransferGain);
  });

  it("120억(주택분 35.1억 · L'<X) — 788,905,159 (수정 전 1,064,612,397)", () => {
    const b = calcAt(12_000_000_000, 2_000_000_000);
    expect(b.housingPart.highValueExcessRuling!.landTaxableGain).toBe(0);
    expect(b.housingPart.proratedTaxableGain).toBe(788_905_159);
    expect(Math.abs(b.housingPart.proratedTaxableGain - expected915(b).total)).toBeLessThanOrEqual(1);
  });

  it("120억(주택분 60.7억 · 안분값 > X) — 한도 내 토지분 = 안분값 770,604,243 − 초과분 672,339,090 = 98,265,153", () => {
    const b = calcAt(12_000_000_000, 5_000_000_000, { transferStandardPrice: { housingPrice: 5_000_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 6_100_000 } });
    const h = b.housingPart;
    const e = expected915(b);
    expect(e.land).toBeGreaterThan(0);
    expect(h.highValueExcessRuling!.wholeLandProrated).toBe(770_604_243);
    expect(h.highValueExcessRuling!.landTaxableGain).toBe(98_265_153);
    expect(Math.abs(h.highValueExcessRuling!.landTaxableGain - e.land)).toBeLessThanOrEqual(1);
    expect(Math.abs(h.proratedTaxableGain - e.total)).toBeLessThanOrEqual(1);
    // 총 과세 양도차익(주택분 + 초과분) = 전체(토지 + 건물) 안분값 근처 — X가 두 번 반영되지 않는다(수정 전은 X(1−r) 만큼 더 컸다)
    const whole = e.p(h.landTransferGain + h.buildingTransferGain);
    expect(Math.abs(h.proratedTaxableGain + h.nonBusinessTransferredGain - whole)).toBeLessThanOrEqual(2);
  });

  it("고지 — 회신 방식·근거 수준을 사실로 서술 · 유불리 표현 없음", () => {
    const b = calcAt(8_000_000_000, 2_000_000_000);
    const w = (b.warnings ?? []).find((x) => x.includes("재산세제과-915"));
    expect(w).toBeDefined();
    expect(w).toContain("2011.10.27.");
    expect(w).toContain("법령이 아니라");
    expect(w).not.toMatch(/유리|불리|절감|절세/);
    expect(w).toContain("12억 안분"); // 겸용은 2022-01-01 이후 양도만 도달 — 12억 시대
  });

  it("⑤ 신고서 4열 — 엔진 echo를 읽는다: 열 과세 양도차익 합 = 주택분 + 비사토, 열 장특 합 = 주택분 + 비사토 장특", () => {
    const b = calcAt(10_000_000_000, 5_000_000_000, { transferStandardPrice: { housingPrice: 5_000_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 6_100_000 } });
    const h = b.housingPart;
    const nb = b.nonBusinessLandPart!;
    const got = new Map<string, number | null>();
    fourPartFinancials(h, b.commercialPart, nb, (row, col, n) => got.set(`${row}:${col}`, n));
    const g = (k: string) => got.get(k) ?? 0;
    expect(g("taxableGain:housingLand")).toBe(h.highValueExcessRuling!.landTaxableGain + h.nonBusinessTransferredGain);
    expect(g("taxableGain:housingBuilding")).toBe(h.highValueExcessRuling!.buildingTaxableGain);
    expect(g("taxableGain:housingLand") + g("taxableGain:housingBuilding")).toBe(h.proratedTaxableGain + nb.transferGain);
    expect(g("ltDeduction:housingLand") + g("ltDeduction:housingBuilding")).toBe(h.longTermDeductionAmount + nb.longTermDeductionAmount);
    expect(g("incomeAmount:housingLand") + g("incomeAmount:housingBuilding")).toBe(h.incomeAmount + nb.incomeAmount);
    // 비과세 양도차익 열 = 전체 양도차익 − 과세 (옛 안분 비율 재구성이 아니다)
    expect(g("exemptGain:housingLand")).toBe(h.landTransferGain - g("taxableGain:housingLand"));
    expect(g("exemptGain:housingBuilding")).toBe(h.buildingTransferGain - g("taxableGain:housingBuilding"));
  });

  describe("③ 불변 — 이 산식이 닿지 않는 경로", () => {
    it("12억 이하(전액 비과세) + 초과분 — 과세 양도차익 0 · 회신 echo·고지 없음", () => {
      const b = calcMixedUse(2_300_000_000, CASE14_TRANSFER_DATE, mixedUseExcessLand(), rates);
      expect(b.housingPart.isExempt).toBe(true);
      expect(b.housingPart.nonBusinessTransferredGain).toBe(90_209_999);
      expect(b.housingPart.proratedTaxableGain).toBe(0);
      expect(b.housingPart.highValueExcessRuling).toBeUndefined();
      expect((b.warnings ?? []).some((w) => w.includes("재산세제과-915"))).toBe(false);
    });

    it("비과세 아님(isOneHouseExempt false) — 안분 없이 (토지 − 초과분) + 건물 = 1,076,454,867 · 회신 echo·고지 없음", () => {
      const b = calcAt(8_000_000_000, 2_000_000_000, { isOneHouseExempt: false });
      const h = b.housingPart;
      expect(h.proratedTaxableGain).toBe(h.landTransferGain - h.nonBusinessTransferredGain + h.buildingTransferGain);
      expect(h.proratedTaxableGain).toBe(1_076_454_867);
      expect(h.highValueExcessRuling).toBeUndefined();
      expect((b.warnings ?? []).some((w) => w.includes("재산세제과-915"))).toBe(false);
    });

    it("초과분 없음 — 종전 안분(토지 + 건물 각각 안분)이며 회신 echo가 없다", () => {
      const b = calcMixedUse(
        8_000_000_000,
        CASE14_TRANSFER_DATE,
        { ...mixedUseCase14(), transferStandardPrice: std(2_000_000_000) },
        rates,
      );
      const h = b.housingPart;
      expect(h.nonBusinessTransferredGain).toBe(0);
      expect(h.highValueExcessRuling).toBeUndefined();
      const p = prorateOf(b.apportionment.housingTransferPrice);
      expect(Math.abs(h.proratedTaxableGain - (p(h.landTransferGain) + p(h.buildingTransferGain)))).toBeLessThanOrEqual(1);
      expect(h.proratedTaxableGain).toBe(4_211_911_847);
    });

    it("G-3(나중 취득 토지 보유요건 미달) + 초과분 + 고가 — 토지분 전체 안분 없이 전액 과세, 건물만 안분: 종전과 같고 회신 방식을 쓰지 않았다고 밝힌다", () => {
      const TD = D("2024-06-01");
      const later: MixedUseAssetInput = {
        isMixedUseHouse: true, residentialFloorArea: 150, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 700,
        landAcquisitionDate: D("2023-10-01"), buildingAcquisitionDate: D("2021-06-01"),
        transferStandardPrice: { housingPrice: 2_500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
        acquisitionStandardPrice: { housingPrice: 350_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_500_000, landPricePerSqmAtBuildingAcq: 1_400_000 },
        residencePeriodYears: 3, isMetropolitanArea: true, zoneType: "residential", isOneHouseExempt: true,
      };
      const b = calcMixedUse(3_000_000_000, TD, later, rates);
      const h = b.housingPart;
      expect(h.laterLandExemptExcluded).toBe(true);
      expect(h.highValueExcessRuling).toBeUndefined();
      const p = prorateOf(b.apportionment.housingTransferPrice);
      // 토지분(초과분 제외) 전액 + 건물분 안분 = 963,523,237
      expect(Math.abs(h.proratedTaxableGain - (h.landTransferGain - h.nonBusinessTransferredGain + p(h.buildingTransferGain)))).toBeLessThanOrEqual(1);
      expect(h.proratedTaxableGain).toBe(963_523_237);
      const w = (b.warnings ?? []).find((x) => x.includes("고가주택에 배율 초과 부수토지"));
      expect(w).toContain("나중에 취득한 부수토지");
      expect(w).toContain("적용하지 않았습니다");
    });
  });

  describe("⑥ 겸용 컴패니언 파트 카드 ≡ 단건 겸용 (0 하한 · 한도 내 > 0)", () => {
    const ratesH = makeMockRatesWithHouseEngine();
    const TDC = D("2026-06-01");
    const companionBase = (): TransferTaxItemInput =>
      ({
        propertyId: "c1", propertyLabel: "자산 2", propertyType: "housing", transferPrice: 0, acquisitionPrice: 0, expenses: 0,
        transferDate: TDC, acquisitionDate: D("1997-09-12"), isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 25 * 12,
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, useEstimatedAcquisition: false, isNonBusinessLand: false, reductions: [],
      }) as TransferTaxItemInput;

    it.each([
      ["80억·주택분 23.4억(0 하한)", 8_000_000_000, 2_000_000_000, 50_000_000],
      ["120억·주택분 60.7억(한도 내 > 0)", 12_000_000_000, 5_000_000_000, 100_000_000],
    ])("%s — 카드 합산 과세표준 = 단건 겸용 과세표준 (옛 산식이면 카드 쪽이 초과분만큼 더 컸다)", (_n, price, hp, comm) => {
      const asset: MixedUseAssetInput = {
        ...mixedUseExcessLand(), isOneHouseExempt: true,
        transferStandardPrice: { housingPrice: hp, commercialBuildingPrice: comm, landPricePerSqm: 6_100_000 },
      };
      const single = calcMixedUse(price, TDC, asset, ratesH);
      expect(single.housingPart.highValueExcessRuling).toBeDefined();
      const cards = buildMixedUsePartCards(companionBase(), withIdentityHousingBuildingStd(asset), price, TDC, ratesH, "c1", "자산 2");
      // 주택 토지 카드만 몫을 받는다
      const landCard = cards.find((c) => c.propertyId.startsWith("mu-house-land#"))!;
      expect(landCard.highValueExcessShare).toBe(single.housingPart.nonBusinessTransferredGain);
      expect(cards.filter((c) => c.highValueExcessShare !== undefined)).toHaveLength(1);
      const agg = calculateTransferTaxAggregate({ taxYear: 2026, properties: cards, annualBasicDeductionUsed: 0 }, ratesH);
      expect(agg.taxBase).toBe(single.total.taxBase);
      expect(agg.totalTax).toBe(Math.floor(single.total.transferTax * 1.1));
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// ① §155⑳ 임대주택 거주주택 특례 A2
// ══════════════════════════════════════════════════════════════════════

const rentalA: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general" as const,
      rentalAcquisitionType: "purchase" as const, isApartment: false, region: "non-metro" as const, isExcluded918Rule: false,
      standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
    },
  ],
};
const rentalAseoul: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  ...rentalA,
  rentalUnits: [{ ...rentalA.rentalUnits[0], region: "seoul-metro" as const }],
};

/** dec17-2 anchor와 같은 같은 날 취득 주택 — 경로 고유 차이(토지·건물 보유연수)가 없다. */
const sameDay = {
  propertyType: "housing" as const, transferDate: D("2026-02-16"),
  acquisitionDate: D("2012-01-02"), acquisitionPrice: 500_000_000, expenses: 0, useEstimatedAcquisition: false,
  isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
  buildingFootprintArea: 100, acquisitionArea: 500, appurtenantLandZone: "metropolitan_residential" as const,
  landAcquisitionDate: D("2012-01-02"),
  standardPriceAtAcquisition: 300_000_000, standardPricePerSqmAtAcquisition: 400_000, buildingStandardPriceAtAcquisition: 150_000_000,
  landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 800_000_000, annualBasicDeductionUsed: 0,
};
const sameDayInput = (price: number, rhe: boolean, over: Record<string, unknown> = {}) =>
  baseTransferInput({ ...sameDay, transferPrice: price, ...(rhe ? { rentalHousingException: rentalAseoul } : {}), ...over } as never);

/** RH-EX 시료(조심 2024인3140 구조) — 토지 2008 · 건물 2014 (보유연수 상이) */
const sepInput = (price: number, landT: number, bldT: number, rhe: boolean, over: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "housing", transferPrice: price, acquisitionPrice: 300_000_000,
    landTransferPrice: landT, buildingTransferPrice: bldT, landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: bldT,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 100_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D("2008-07-01"), transferDate: D("2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 60, acquisitionArea: 660, appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    ...(rhe ? { rentalHousingException: rentalA } : {}),
    ...over,
  } as never);

describe("#17-2b ① §155⑳ A2 — 거주주택 특례 + 배율 초과 부수토지", () => {
  it("20억 시료 — 주택분 과세대상 양도소득금액 243,200,001 (수정 전 276,800,000) · 총세액 116,574,000 (수정 전 131,357,999)", () => {
    const r = calculateTransferTax(sepInput(2_000_000_000, 1_600_000_000, 400_000_000, true), rates);
    expect(r.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A2");
    // 독립 도출 — 토지 양도차익 1,400,000,000 · 초과 60/660 → X · 건물 300,000,000 · 안분 비율 8/20
    const p = prorateOf(2_000_000_000);
    const L = 1_400_000_000;
    const X = Math.floor((L * 60) / 660);
    expect(X).toBe(127_272_727);
    const landT = Math.max(0, p(L) - X);
    const bldT = p(300_000_000);
    expect(landT).toBe(432_727_273);
    const T = landT + bldT;
    const income = Number(BigInt(T) - (BigInt(T) * 56n) / 100n); // 표2: 보유 9년 36% + 거주 5년 20%
    expect(r.rentalHousingExceptionDetail!.formulaTrace.highValueExcessRuling).toMatchObject({
      wholeLandGain: L, wholeLandProrated: 560_000_000, excessGain: X, landTaxableGain: landT, buildingTaxableGain: bldT, taxableBeforeLthd: T,
    });
    expect(r.rentalHousingExceptionDetail!.taxableGain).toBe(income);
    expect(income).toBe(243_200_001);
    expect(r.taxableGain).toBe(income + 89_090_909); // + 비사업용 토지분(표1 30%)
    expect(r.taxBase).toBe(329_790_910);
    expect(r.calculatedTax).toBe(105_976_364);
    expect(r.totalTax).toBe(116_574_000);
  });

  it("30억 시료(L'>X) — 과세대상 양도소득금액 624,800,000 · 총세액 312,648,600 (수정 전 328,911,000)", () => {
    const r = calculateTransferTax(sepInput(3_000_000_000, 2_400_000_000, 600_000_000, true), rates);
    const p = prorateOf(3_000_000_000);
    const L = 2_200_000_000;
    const X = Math.floor((L * 60) / 660);
    expect(p(L)).toBeGreaterThan(X);
    const T = p(L) - X + p(500_000_000);
    expect(T).toBe(1_420_000_000);
    expect(r.rentalHousingExceptionDetail!.taxableGain).toBe(T - Math.floor((T * 56) / 100));
    expect(r.rentalHousingExceptionDetail!.taxableGain).toBe(624_800_000);
    expect(r.totalTax).toBe(312_648_600);
  });

  it("④ 동치 — 같은 날 취득이면 특례 경로 총세액 = 일반 경로(단일 주택 새 산식) 총세액 (12.5억·15억·20억·30억)", () => {
    for (const [price, tax] of [[1_250_000_000, 20_938_500], [1_500_000_000, 41_870_714], [2_000_000_000, 89_283_857], [3_000_000_000, 214_599_000]] as const) {
      const on = calculateTransferTax(sameDayInput(price, true), rates);
      const off = calculateTransferTax(sameDayInput(price, false), rates);
      expect(on.rentalHousingExceptionDetail?.applied).toBe(true);
      expect(on.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A2");
      expect(on.totalTax, `${price}`).toBe(off.totalTax);
      expect(on.totalTax).toBe(tax);
      // 과세표준은 장특 절사 단위(파트별 vs 합산) 때문에 최대 1원 차이
      expect(Math.abs(on.taxBase - off.taxBase)).toBeLessThanOrEqual(1);
    }
  });

  it("② 0 하한·경계·L'>X 분류 — 12.5억·15억(L'<X) · 20억(안분 비율 = X 비율 경계) · 30억(L'>X)", () => {
    const cls = (price: number) => {
      const r = calculateTransferTax(sameDayInput(price, true), rates);
      const t = r.rentalHousingExceptionDetail!.formulaTrace.highValueExcessRuling!;
      return { ...t, p: t.wholeLandProrated - t.excessGain };
    };
    expect(cls(1_250_000_000).p).toBeLessThan(0);
    expect(cls(1_250_000_000).landTaxableGain).toBe(0);
    expect(cls(1_500_000_000).landTaxableGain).toBe(0);
    expect(cls(2_000_000_000).p).toBe(0); // 안분값이 초과분과 정확히 같다(0.4 = 200/500)
    expect(cls(2_000_000_000).landTaxableGain).toBe(0);
    expect(cls(3_000_000_000).p).toBeGreaterThan(0);
    expect(cls(3_000_000_000).landTaxableGain).toBe(cls(3_000_000_000).p);
  });

  it("토지·건물 취득일이 달라도 특례 경로 = 일반 경로 — 파트별 보유연수 + 기본통칙 95-0…1 (종전: 건물 취득일 단일 보유연수라 7,616,001 갈렸다)", () => {
    // 같은 날(건물 취득일에 맞춤): 20억 · 30억 모두 일치
    for (const [price, land, bld, tax] of [[2_000_000_000, 1_600_000_000, 400_000_000, 123_294_000], [3_000_000_000, 2_400_000_000, 600_000_000, 323_736_600]] as const) {
      const over = { landAcquisitionDate: D("2014-09-01") };
      const on = calculateTransferTax(sepInput(price, land, bld, true, over), rates);
      const off = calculateTransferTax(sepInput(price, land, bld, false, over), rates);
      expect(on.totalTax).toBe(off.totalTax);
      expect(on.totalTax).toBe(tax);
    }
    // 토지 2008 · 건물 2014 — 두 경로 모두 토지분 = max(표1 토지 15년 30%, 표2 건물 9년 36% + 거주 5년 20% = 56%) = 56%, 건물분 56%.
    //   종전: 일반 경로는 토지 자신의 15년 표2(40% + 20% = 60%)라 off 108,957,999 · on 116,574,000(차이 7,616,001).
    const on = calculateTransferTax(sepInput(2_000_000_000, 1_600_000_000, 400_000_000, true), rates);
    const off = calculateTransferTax(sepInput(2_000_000_000, 1_600_000_000, 400_000_000, false), rates);
    expect(on.totalTax).toBe(116_574_000); // 특례 경로 값은 그대로(건물 9년 56%가 토지분에도 같아 단일 산식과 같다)
    expect(off.totalTax).toBe(116_574_000); // 일반 경로 값이 올라 특례 경로와 일치한다(종전 108,957,999)
    expect(on.totalTax - off.totalTax).toBe(0);
  });

  it("⑦ 양도일 연혁 — 9억 시대(2020-06-01) 양도: 기준금액 9억으로 안분 · 고지에 «9억» · 특례 총세액 = 일반 경로", () => {
    // 2022-01-01 전 양도분은 도시지역 일률 5배(한도 500㎡) — 초과분이 생기도록 토지 700㎡
    const over = { transferDate: D("2020-06-01"), acquisitionArea: 700 };
    const on = calculateTransferTax(sameDayInput(1_500_000_000, true, over), rates);
    const off = calculateTransferTax(sameDayInput(1_500_000_000, false, over), rates);
    const t = on.rentalHousingExceptionDetail!.formulaTrace;
    expect(t.highValueThreshold).toBe(900_000_000);
    const p = prorateOf(1_500_000_000, 900_000_000);
    expect(t.highValueExcessRuling!.wholeLandProrated).toBe(p(t.highValueExcessRuling!.wholeLandGain));
    expect(on.totalTax).toBe(off.totalTax);
    const w = (on.warnings ?? []).find((x) => x.includes("재산세제과-915"))!;
    expect(w).toContain("9억 안분");
    expect(w).not.toContain("12억");
  });

  it("③ 불변 — A1(12억 이하 전액 비과세)은 초과분만 과세 · B1(§161 안분 · 12억 이하)은 기존 anchor 값 그대로", () => {
    // A1: 주택분 0 — 총 과세 = 비사업용 토지분 (일반 경로와 같다)
    const on = calculateTransferTax(sameDayInput(1_000_000_000, true), rates);
    const off = calculateTransferTax(sameDayInput(1_000_000_000, false), rates);
    expect(on.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A1");
    expect(on.rentalHousingExceptionDetail!.formulaTrace.highValueExcessRuling).toBeUndefined();
    expect(on.rentalHousingExceptionDetail!.taxableGain).toBe(0);
    expect(on.totalTax).toBe(off.totalTax);
    expect((on.warnings ?? []).some((w) => w.includes("재산세제과-915"))).toBe(false);
  });

  it("③ 불변 — B2(§161②, 12억 초과): 종전 계산 유지(주택분 스칼라 = 양도차익 − 초과분) · 회신 방식을 적용하지 않았다는 고지", () => {
    const rentalB: NonNullable<TransferTaxInput["rentalHousingException"]> = {
      ...rentalA, scenario: "B",
      rentalUnits: [{ ...rentalA.rentalUnits[0], businessRegistrationDate: D("2014-01-01"), rentalRegistrationDate: D("2014-01-01"), isApartment: true, region: "seoul-metro" as const, standardPriceAtRentalStart: 500_000_000 }],
      priorResidenceTransferDate: D("2016-08-25"),
      standardPriceAtAcquisition: 300_000_000, standardPriceAtPriorTransfer: 450_000_000, standardPriceAtTransfer: 800_000_000,
      postRegistrationResidenceMonths: 30,
    };
    const r = calculateTransferTax(
      sepInput(2_000_000_000, 1_600_000_000, 400_000_000, false, { rentalHousingException: rentalB, residencePeriodMonths: 30 }),
      rates,
    );
    const d = r.rentalHousingExceptionDetail!;
    expect(d.scenarioId).toBe("RH-B2");
    expect(d.formulaTrace.highValueExcessRuling).toBeUndefined();
    // 종전 흐름 그대로 — 주택분 스칼라 = 토지·건물 양도차익 합 − 초과분(127,272,727)
    const housingGain = 1_400_000_000 + 300_000_000 - 127_272_727;
    // 🔁 표1 장특만 파트별 보유연수로 바꿨다(§95④): 토지분(초과분 제외) 1,272,727,273 × 토지 15년 30% + 건물 300,000,000 × 건물 9년 18%
    //    (종전: 주택분 전체에 건물 9년 18% 하나 — gain95Table1 1,289,636,364였다 → 1,136,909,092)
    const ltc1 = Math.floor((1_272_727_273 * 30) / 100) + Math.floor((300_000_000 * 18) / 100);
    expect(d.formulaTrace.gain95Table1).toBe(housingGain - ltc1);
    expect(d.formulaTrace.gain95Table1).toBe(1_136_909_092);
    const w = (r.warnings ?? []).find((x) => x.includes("회신 방식을 적용하지 않았습니다"));
    expect(w).toBeDefined();
    expect(w).toContain("합치는 순서를 정할 근거를 확인하지 못해, 배율 초과분을 안분 전에 떼어낸 주택분에 §161②를 적용하는 방식으로 계산했습니다 — 확인이 필요합니다");
    expect(w).not.toContain("종전");
    expect(w).not.toContain("다루지 않았습니다"); // 회신 본문을 직접 확인하지 못한 채 단정하는 서술 금지
    expect(w).not.toMatch(/유리|불리|절감|절세/);
  });

  it("③ A2 + G-3(나중 취득 토지 보유요건 미달): 나중 취득 토지분은 비과세에서 빠져 전액 과세 — 회신 방식을 쓰지 않고, 총세액 1,055,678,199 = 특례 off (종전 288,684,598)", () => {
    // 건물 2014-09 · 토지 2023-10 · 양도 2024-06-01(토지 보유 8개월 < 2년) · 20억 · 660㎡ 비도시
    const over = { landAcquisitionDate: D("2023-10-01") };
    const r = calculateTransferTax(sepInput(2_000_000_000, 1_600_000_000, 400_000_000, true, over), rates);
    const off = calculateTransferTax(sepInput(2_000_000_000, 1_600_000_000, 400_000_000, false, over), rates);
    const d = r.rentalHousingExceptionDetail!;
    expect(d.scenarioId).toBe("RH-A2");
    expect(d.formulaTrace.highValueExcessRuling).toBeUndefined();
    // 🔁 §155⑳은 주택 수만 의제하고 비과세 범위는 영 §154①이 정한다 — 일반 경로(`applyHousingLandExclusions`)와 같은 술어로 나중 취득 토지분을 뗀다.
    //    종전 288,684,598은 이 토지분(비과세에서 제외됐어야 할 1,272,727,273)에도 12억 초과 비율 안분을 적용해 off(1,055,678,199)보다 작았다.
    //    독립 도출: 토지 양도차익 1,400,000,000 · 초과 60/660 → X = 127,272,727(비사업용) · 나중 취득 토지분 = 1,400,000,000 − X = 1,272,727,273(전액 과세, 보유 0년 장특 0)
    //    특례 대상 주택분 = 건물 300,000,000 → 장특 = floor(300,000,000 × 56%) = 168,000,000 → gain95(표2) 132,000,000 → 과세 = × (20억−12억)/20억 = 52,800,000
    const X = Math.floor((1_400_000_000 * 60) / 660);
    expect(X).toBe(127_272_727);
    expect(d.formulaTrace.gain95Table2).toBe(300_000_000 - 168_000_000);
    expect(d.taxableGain).toBe(Math.floor((132_000_000 * 8) / 20));
    expect(d.taxableGain).toBe(52_800_000);
    expect(r.taxableGain).toBe(52_800_000 + 1_272_727_273 + X);
    expect(r.splitDetail!.land.longTermDeduction).toBe(0);
    expect(r.splitDetail!.building.longTermDeduction).toBe(168_000_000);
    expect(r.splitDetail!.laterLandPart).toMatchObject({ gain: 1_272_727_273, holdingYears: 0, longTermDeduction: 0 });
    expect(r.totalTax).toBe(1_055_678_199);
    expect(r.totalTax).toBe(off.totalTax);
    expect(r.calculatedTax).toBe(off.calculatedTax);
    expect(r.taxBase).toBe(off.taxBase);
    expect(r.steps.some((st) => st.label.includes("재산세제과-915"))).toBe(false);
    expect(r.steps.find((st) => st.label.startsWith("부수토지 비과세 제외"))!.formula).toContain("보유요건 미충족");
    // 종전의 «일반 경로처럼 제외하지 않고 … 계산했다» 고지는 더는 사실이 아니므로 없다
    expect((r.warnings ?? []).some((x) => x.includes("나중에 취득한 부수토지분을 일반 경로처럼"))).toBe(false);
    // 같은 사실의 회신 적용 여부는 G-3 술어 하나로 갈린다 — G-3가 아니면(토지를 주택보다 먼저 취득) 회신 방식을 적용한다
    const ok = calculateTransferTax(sepInput(2_000_000_000, 1_600_000_000, 400_000_000, true), rates);
    expect(ok.rentalHousingExceptionDetail!.formulaTrace.highValueExcessRuling).toBeDefined();
    // 9억 시대 양도일에도 특례 on = off 이다(기준금액은 양도일 연혁)
    const oldOver = { landAcquisitionDate: D("2019-11-01"), transferDate: D("2020-06-01"), acquisitionDate: D("2014-09-01"), acquisitionArea: 900 };
    const old = calculateTransferTax(sepInput(1_500_000_000, 1_200_000_000, 300_000_000, true, oldOver), rates);
    const oldOff = calculateTransferTax(sepInput(1_500_000_000, 1_200_000_000, 300_000_000, false, oldOver), rates);
    expect(old.totalTax).toBe(oldOff.totalTax);
  });

  it("⑥ 다건 합산(aggregate) 경로도 단건과 같은 세액 — 특례 경로의 income은 장특·안분이 끝난 값이라 이중 차감하지 않는다", () => {
    const item = { ...sameDayInput(2_000_000_000, true), propertyId: "p1", propertyLabel: "p1" } as unknown as TransferTaxItemInput;
    const single = calculateTransferTax(sameDayInput(2_000_000_000, true), rates);
    const agg = calculateTransferTaxAggregate({ taxYear: 2026, properties: [item], annualBasicDeductionUsed: 0 }, rates);
    expect(agg.totalTax).toBe(single.totalTax);
  });

  it("고지·계산 단계 — A2 회신 방식 고지(12억 안분 · 법령 아닌 해석 회신) + 계산 단계에 안분값·초과분·0 표기", () => {
    const r = calculateTransferTax(sameDayInput(1_500_000_000, true), rates);
    const w = (r.warnings ?? []).find((x) => x.includes("재산세제과-915"))!;
    expect(w).toContain("법령이 아니라");
    expect(w).not.toMatch(/유리|불리|절감|절세/);
    const st = r.steps.find((s) => s.label.includes("재산세제과-915"))!;
    expect(st.formula).toContain("음수여서 0");
    expect(st.amount).toBe(r.rentalHousingExceptionDetail!.taxableGain);
  });
});

// ══════════════════════════════════════════════════════════════════════
// ③ 일괄양도(함께 양도) 부수토지 카드
// ══════════════════════════════════════════════════════════════════════

describe("#17-2b ③ 일괄양도 — 주택 카드 + 한도 내 부수토지 카드 + 배율 초과 카드", () => {
  const TD = "2026-02-16";
  const ratesRoute = loadFallbackTransferRates(new Date(TD));

  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(ratesRoute as never);
  });

  /** 1세대1주택 · 2014 취득 · 거주 5년 · 수도권 주거지역(배율 3배) · 정착면적 100㎡ → 한도 300㎡ */
  const primary = (house: number, land: number, over: object = {}) => ({
    propertyType: "housing", transferPrice: house, transferDate: TD, acquisitionPrice: house / 2, acquisitionDate: "2014-01-01", acquisitionCause: "purchase",
    expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, residencePeriodMonths: 60, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
    isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, reductions: [], annualBasicDeductionUsed: 0, buildingFootprintArea: 100, isUrbanArea: true,
    appurtenantLandZone: "metropolitan_residential", totalSalePrice: house + land, standardPriceAtTransferForApportion: house / 1000, ...over,
  });
  const land = (price: number, over: object = {}) => ({
    assetId: "c1", assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01",
    fixedAcquisitionPrice: price / 2, standardPriceAtTransfer: price / 1000, directExpenses: 0, isOneHousehold: true, areaM2: 200, reductions: [], ...over,
  });
  type Prop = { propertyId: string; transferGain: number; income: number; longTermHoldingDeduction: number; isExempt?: boolean; isPartialExempt?: boolean };
  type Agg = { totalTax: number; warnings?: string[]; properties: Prop[] };
  /** 자산별 과세 양도차익 = 원시 양도소득금액 + 장기보유특별공제 (집계 결과는 양도소득금액만 싣는다) */
  const tg = (q: Prop) => q.income + q.longTermHoldingDeduction;
  async function post(body: object): Promise<Agg> {
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    const json = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
    expect(res.status, JSON.stringify(json.error)).toBe(200);
    return json.data!.aggregated;
  }
  const byId = (a: Agg, id: string) => a.properties.find((p) => p.propertyId === id)!;
  const sum = (a: Agg, f: (p: Prop) => number) => a.properties.reduce((s, p) => s + f(p), 0);

  /** 같은 사실(주택 + 토지)을 단일 주택(토지·건물 구분 입력)으로 — 법령상 기대값의 기준. 같은 날 취득이라 경로 고유 차이가 없다. */
  const single = (house: number, landP: number, area: number, date = TD, r = ratesRoute, over: Record<string, unknown> = {}) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: house + landP, acquisitionPrice: (house + landP) / 2, transferDate: D(date), acquisitionDate: D("2014-01-01"), landAcquisitionDate: D("2014-01-01"),
        isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual", landTransferPrice: landP, buildingTransferPrice: house,
        landAcquisitionPrice: landP / 2, buildingAcquisitionPrice: house / 2, landStandardPriceAtTransfer: landP, buildingStandardPriceAtTransfer: house,
        buildingFootprintArea: 100, acquisitionArea: area, appurtenantLandZone: "metropolitan_residential", residencePeriodMonths: 60, isOneHousehold: true,
        householdHousingCount: 1, annualBasicDeductionUsed: 0, expenses: 0, ...over,
      } as never),
      r,
    );

  it("주택 8억 + 토지 12억(700㎡ · 한도 300㎡) — 안분값 240,000,000 < 초과분 342,857,143: 한도 내 토지 카드 과세 0 (수정 전 102,857,142) · 총세액 = 단일 주택 입력(1원 절사 차이)", async () => {
    const a = await post({ ...primary(800_000_000, 1_200_000_000), companionAssets: [land(1_200_000_000, { areaM2: 700 })] });
    const card = byId(a, "c1__appurtenant");
    const x = byId(a, "c1__excess");
    expect(card.transferGain).toBe(257_142_857);
    expect(x.transferGain).toBe(342_857_143);
    // 독립 도출 — 전체 부수토지 600,000,000 · 합계 20억 안분 비율 0.4 → 240,000,000 − 342,857,143 < 0 → 0
    const p = prorateOf(2_000_000_000);
    expect(p(card.transferGain + x.transferGain) - x.transferGain).toBeLessThan(0);
    expect(tg(card)).toBe(0);
    expect(card.longTermHoldingDeduction).toBe(0);
    expect(tg(byId(a, "primary"))).toBe(p(400_000_000));
    expect(tg(x)).toBe(342_857_143); // 초과분은 안분 전 전액
    const s = single(800_000_000, 1_200_000_000, 700);
    expect(s.splitDetail!.land.taxableGainAfterProration).toBe(0);
    // 같은 사실 — 주택 카드 단건(단일 입력)과 카드 분리 입력이 같은 세액. 초과분 카드 양도차익은 가액 분리 절사(342,857,143)라 단일 입력(342,857,142)과 1원 다르다.
    expect(Math.abs(a.totalTax - s.totalTax)).toBeLessThanOrEqual(1);
    expect(a.totalTax).toBe(124_887_713);
    // Σ카드 = 자산 단위 — 과세 양도차익·장특
    expect(Math.abs(sum(a, tg) - s.taxableGain)).toBeLessThanOrEqual(1);
    expect(Math.abs(sum(a, (q) => q.longTermHoldingDeduction) - s.longTermHoldingDeduction)).toBeLessThanOrEqual(1);
    expect((a.warnings ?? []).some((w) => w.includes("재산세제과-915"))).toBe(true);
  });

  it("주택 10억 + 토지 15억(500㎡) — L'>0: 한도 내 토지 카드 90,000,000 · 총세액 134,046,000 = 단일 주택 입력 (수정 전 157,792,800)", async () => {
    const a = await post({ ...primary(1_000_000_000, 1_500_000_000), companionAssets: [land(1_500_000_000, { areaM2: 500 })] });
    const card = byId(a, "c1__appurtenant");
    const x = byId(a, "c1__excess");
    const p = prorateOf(2_500_000_000);
    const expectedLand = p(card.transferGain + x.transferGain) - x.transferGain;
    expect(expectedLand).toBeGreaterThan(0);
    expect(tg(card)).toBe(expectedLand);
    expect(tg(card)).toBe(90_000_000);
    const s = single(1_000_000_000, 1_500_000_000, 500);
    expect(a.totalTax).toBe(s.totalTax);
    expect(a.totalTax).toBe(134_046_000);
    // ⑤ 장특 파트 정합 — 카드 장특 = 그 카드 과세 양도차익 × 표2 공제율(주택 먼저 단위의 표2) · Σ = 자산 단위
    expect(sum(a, (q) => q.longTermHoldingDeduction)).toBe(s.longTermHoldingDeduction);
    expect(sum(a, tg)).toBe(s.taxableGain);
  });

  it("경계 — 합계 28억(주택 16억 + 토지 12억 700㎡): 안분 비율 4/7 = 초과 비율 400/700 — 안분값이 초과분과 같거나 1원 작다 → 한도 내 토지 0", async () => {
    const a = await post({ ...primary(1_600_000_000, 1_200_000_000), companionAssets: [land(1_200_000_000, { areaM2: 700 })] });
    const card = byId(a, "c1__appurtenant");
    const x = byId(a, "c1__excess");
    const p = prorateOf(2_800_000_000);
    const diff = p(card.transferGain + x.transferGain) - x.transferGain;
    expect(Math.abs(diff)).toBeLessThanOrEqual(1);
    expect(tg(card)).toBe(Math.max(0, diff));
    const s = single(1_600_000_000, 1_200_000_000, 700);
    expect(Math.abs(a.totalTax - s.totalTax)).toBeLessThanOrEqual(1);
  });

  describe("③ 불변 — 이 산식이 닿지 않는 경로", () => {
    it("초과분 없음(300㎡ = 한도) — 몫이 없고 단일 주택 입력과 같다 (43,901,000)", async () => {
      const a = await post({ ...primary(800_000_000, 1_200_000_000), companionAssets: [land(1_200_000_000, { areaM2: 300 })] });
      expect(a.properties.map((q) => q.propertyId)).toEqual(["primary", "c1"]);
      expect(a.totalTax).toBe(43_901_000);
      expect(a.totalTax).toBe(single(800_000_000, 1_200_000_000, 300).totalTax);
      expect((a.warnings ?? []).some((w) => w.includes("재산세제과-915"))).toBe(false);
    });

    it("합계 12억 이하(전액 비과세) + 초과분 — 한도 내 카드·주택 카드 비과세 0, 초과 카드만 과세", async () => {
      const a = await post({ ...primary(300_000_000, 850_000_000), companionAssets: [land(850_000_000, { areaM2: 700 })] });
      expect(tg(byId(a, "primary"))).toBe(0);
      expect(tg(byId(a, "c1__appurtenant"))).toBe(0);
      expect(tg(byId(a, "c1__excess"))).toBe(byId(a, "c1__excess").transferGain);
      expect((a.warnings ?? []).some((w) => w.includes("재산세제과-915"))).toBe(false);
      const s = single(300_000_000, 850_000_000, 700);
      expect(Math.abs(a.totalTax - s.totalTax)).toBeLessThanOrEqual(1);
    });

    it("1세대1주택 아님 — 비과세 판정이 없어 안분 자체가 없다(카드 양도차익 전액 과세) · 몫 없음", async () => {
      const a = await post({
        ...primary(800_000_000, 1_200_000_000, { isOneHousehold: false, householdHousingCount: 2 }),
        companionAssets: [land(1_200_000_000, { areaM2: 700 })],
      });
      for (const q of a.properties) expect(tg(q)).toBe(q.transferGain);
      expect((a.warnings ?? []).some((w) => w.includes("재산세제과-915"))).toBe(false);
    });

    it("G-3 — 주택보다 나중에 취득해 보유 2년 미만인 부수토지 카드: 비과세 아님 · 한도 내 조각이 없어 몫 없음 (종전과 같다)", async () => {
      const a = await post({
        ...primary(800_000_000, 1_200_000_000),
        companionAssets: [land(1_200_000_000, { areaM2: 700, acquisitionDate: "2025-06-01" })],
      });
      const card = byId(a, "c1__appurtenant");
      expect(card.isExempt).toBe(false);
      expect(card.isPartialExempt).toBe(false);
      expect(tg(card)).toBe(card.transferGain); // 안분 없이 전액
      expect((a.warnings ?? []).some((w) => w.includes("재산세제과-915"))).toBe(false);
    });
  });

  it("⑦ 양도일 연혁 — 9억 시대(2020-06-01): 주택 6억 + 토지 9억(700㎡) 합계 15억, 안분 비율 (15−9)/15 = 0.4 · 고지에 «9억»", async () => {
    const date = "2020-06-01";
    const r = loadFallbackTransferRates(new Date(date));
    vi.mocked(preloadTaxRates).mockResolvedValue(r as never);
    const a = await post({ ...primary(600_000_000, 900_000_000, { transferDate: date }), companionAssets: [land(900_000_000, { areaM2: 700 })].map((c) => ({ ...c })) });
    const card = byId(a, "c1__appurtenant");
    const x = byId(a, "c1__excess");
    const p = prorateOf(1_500_000_000, 900_000_000);
    expect(tg(card)).toBe(Math.max(0, p(card.transferGain + x.transferGain) - x.transferGain));
    const s = single(600_000_000, 900_000_000, 700, date, r);
    expect(Math.abs(a.totalTax - s.totalTax)).toBeLessThanOrEqual(1);
    const w = (a.warnings ?? []).find((m) => m.includes("재산세제과-915"))!;
    expect(w).toContain("9억 안분");
    expect(w).not.toContain("12억");
  });

  it("⑤ 부수토지 두 필지(각 200㎡ · 합 400㎡ → 한도 300㎡) — 한도 내 카드 둘이 초과분 합계를 몫으로 나눠 받는다: Σ카드 = 단일 주택 입력(≤ 2원 절사 차이)", async () => {
    const a = await post({
      ...primary(800_000_000, 600_000_000),
      companionAssets: [land(300_000_000, { assetId: "c1", areaM2: 200 }), land(300_000_000, { assetId: "c2", areaM2: 200 })],
    });
    const within = a.properties.filter((q) => q.propertyId.endsWith("__appurtenant"));
    const excess = a.properties.filter((q) => q.propertyId.endsWith("__excess"));
    expect(within).toHaveLength(2);
    expect(excess).toHaveLength(2);
    const X = excess.reduce((n, q) => n + q.transferGain, 0);
    const W = within.reduce((n, q) => n + q.transferGain, 0);
    const p = prorateOf(1_400_000_000);
    const expectedTotal = Math.max(0, p(W + X) - X); // 한도 내 토지 합계 과세 양도차익(전체 부수토지 기준)
    const got = within.reduce((n, q) => n + tg(q), 0);
    expect(Math.abs(got - expectedTotal)).toBeLessThanOrEqual(2);
    // 두 카드는 같은 비율로 과세된다(모두 0이거나 모두 양수)
    expect(within.every((q) => tg(q) === 0) || within.every((q) => tg(q) > 0)).toBe(true);
    const s = single(800_000_000, 600_000_000, 400);
    expect(Math.abs(a.totalTax - s.totalTax)).toBeLessThanOrEqual(2);
    expect(Math.abs(sum(a, tg) - s.taxableGain)).toBeLessThanOrEqual(2);
  });

  it("⑤ 주택 카드가 토지·건물 가액 구분 없이 자기 토지(200㎡)를 포함하면 — 한도 내 부수토지 카드끼리만 계산하고 그 사실을 고지한다", async () => {
    const a = await post({
      ...primary(1_000_000_000, 1_000_000_000, { acquisitionArea: 200, transferArea: 200 }),
      companionAssets: [land(1_000_000_000, { areaM2: 300 })],
    });
    expect(a.warnings!.some((w) => w.includes("재산세제과-915"))).toBe(true);
    expect(a.warnings!.some((w) => w.includes("토지·건물 가액 구분 없이 자기 토지를 포함"))).toBe(true);
  });

  it("단위 몫 해소 — resolveUnitExcessShares: 주택이 부분과세가 아니면 빈 맵(카드가 부분과세여도) · 한도 내 조각이 없으면 빈 맵 · 한도 내 카드만 있으면 초과 카드 합계 전부가 그 카드 몫", () => {
    const unit = { houseIdx: 0, landIdxs: [1], valuationOnlyIdxs: [2], excessIdxs: [2], combinedTransferPrice: 0 } as OneHouseUnit;
    const items = [{}, {}, {}] as unknown as TransferTaxItemInput[];
    const res = (over: object[]) => over as never;
    // 주택이 전액 비과세(isExempt) — 카드가 부분과세라고 와도 몫은 없다(주택 판정이 정본)
    expect(resolveUnitExcessShares(items, unit, res([{ isPartialExempt: false, isExempt: true, transferGain: 1 }, { isPartialExempt: true, transferGain: 5 }, { transferGain: 7 }])).size).toBe(0);
    // 주택이 과세(부분과세 아님)
    expect(resolveUnitExcessShares(items, unit, res([{ isPartialExempt: false, isExempt: false, transferGain: 1 }, { isPartialExempt: true, transferGain: 5 }, { transferGain: 7 }])).size).toBe(0);
    // 한도 내 카드가 부분과세가 아님 — 조각 없음
    expect(resolveUnitExcessShares(items, unit, res([{ isPartialExempt: true, transferGain: 1 }, { isPartialExempt: false, transferGain: 5 }, { transferGain: 7 }])).size).toBe(0);
    const ok = resolveUnitExcessShares(items, unit, res([{ isPartialExempt: true, transferGain: 1 }, { isPartialExempt: true, transferGain: 5 }, { transferGain: 7 }]));
    expect([...ok.entries()]).toEqual([[1, 7]]);
  });

  it("단위 몫 해소 — 주택 카드의 토지분(분리 파트)도 한도 내 조각이다: 나중 취득 토지(G-3)로 제외된 주택 토지분은 조각이 아니다", () => {
    const unit = { houseIdx: 0, landIdxs: [1], valuationOnlyIdxs: [2], excessIdxs: [2], combinedTransferPrice: 0 } as OneHouseUnit;
    const houseResult = { isPartialExempt: true, transferGain: 700, splitDetail: { land: { gain: 500 }, building: { gain: 200 } } };
    const results = [houseResult, { isPartialExempt: true, transferGain: 100 }, { transferGain: 50 }] as never;
    const base = { propertyType: "housing", selfOwns: "both", isSeparateAcquisition: true, acquisitionDate: D("2014-01-01"), transferDate: D("2026-02-16") };
    // 토지를 주택보다 먼저(또는 같은 날) 취득 — 주택 토지분이 조각: 500 + 100 중 초과분 50을 비율(5:1)로 나눈다(floor 41 + 마지막 조각이 잔액 흡수 9)
    const normal = resolveUnitExcessShares([{ ...base, landAcquisitionDate: D("2014-01-01") }, {}, {}] as never, unit, results);
    expect([...normal.entries()]).toEqual([[0, 41], [1, 9]]);
    // 토지를 주택보다 나중(2025)에 취득 — 보유 2년 미만이라 주택 토지분은 비과세 대상이 아니다 → 한도 내 카드만 몫을 받는다
    const later = resolveUnitExcessShares([{ ...base, landAcquisitionDate: D("2025-06-01") }, {}, {}] as never, unit, results);
    expect([...later.entries()]).toEqual([[1, 50]]);
  });

  it("⑤ 엔진 입력 `highValueExcessShare` — 분리 파트가 있는 주택 카드는 자기 초과분이 없어도 단위 몫으로 회신 방식을 적용하고, 몫 = 자기 초과분이면 단일 입력과 같다", () => {
    const run = (over: Record<string, unknown> = {}) =>
      calculateTransferTax(baseTransferInput({ ...sameDay, transferPrice: 2_000_000_000, landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 400_000_000, ...over } as never), rates);
    // 자기 초과분(200/500㎡)이 있는 단일 입력 — 몫을 자기 초과분과 같게 주면 값이 같다
    const base = run();
    const X = base.splitDetail!.nonBusinessLandPart!.gain;
    const same = run({ highValueExcessShare: X });
    expect(same.taxableGain).toBe(base.taxableGain);
    expect(same.totalTax).toBe(base.totalTax);
    // 몫이 더 크면(다른 카드의 초과분이 더 있다) 한도 내 토지분이 줄어든다 — 안분값 − 몫, 0 하한
    const p = prorateOf(2_000_000_000);
    const L = base.splitDetail!.land.gain;
    const bigger = run({ highValueExcessShare: X + 50_000_000 });
    expect(bigger.splitDetail!.land.taxableGainAfterProration).toBe(Math.max(0, p(L - X + X + 50_000_000) - (X + 50_000_000)));
    // 자기 초과분이 없는 분리 주택(토지 250㎡ ≤ 한도 300㎡) + 몫 — 단위 몫만으로 처리한다
    const noOwn = run({ acquisitionArea: 250, highValueExcessShare: 60_000_000 });
    expect(noOwn.splitDetail!.nonBusinessLandPart).toBeUndefined();
    const L2 = noOwn.splitDetail!.land.gain;
    expect(noOwn.splitDetail!.land.taxableGainAfterProration).toBe(Math.max(0, p(L2 + 60_000_000) - 60_000_000));
    // 몫이 없으면 종전 안분(토지 전체를 그대로 안분)
    const none = run({ acquisitionArea: 250 });
    expect(none.splitDetail!.land.taxableGainAfterProration).toBe(p(none.splitDetail!.land.gain));
  });
});
