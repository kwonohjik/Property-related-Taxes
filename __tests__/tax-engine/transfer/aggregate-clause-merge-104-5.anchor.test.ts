/**
 * anchor: 누진 호 그룹을 **파트 단위 호별 합산**으로 (P12 2단계 · D-7 · D-12)
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md
 *   §D-7 · §4.11(설계)
 *
 * [예규 — 확정] 「"자산별"에서 "자산"의 의미는 동법 **제104조 각 호별로 합산한 자산**을 의미」
 *   「기획재정부 재산세제과-536」(2018.6.19.) · 국세청 「기준-2018-법령해석재산-0098」(2018.6.21.)
 *
 * 자산 하나가 **둘 이상의 호에 걸치면**(split · 부분 비사토) **파트가 곧 합산 단위**다.
 * 종전에는 그런 자산이 그룹에 있으면 `mixedTier`가 켜져 **그룹 전체가 자산별 합**으로 떨어졌고,
 * 같은 호 다른 자산의 합산까지 끊겼다 — **과소 51,000,000(D-7) · 23,400,000(D-12)**.
 *
 * ── 적용 범위를 한정한 이유 (§4.11) ────────────────────────────────────
 * `calcTax`의 `rateClause`는 **§104⑦ 후단의 승자 기준**이다(`rate-calc.ts:451`).
 * 그대로 그룹 키로 쓰면 「해당 호는 같은데 승자만 갈린」 자산이 나뉘어 **D-11(P9)이 회귀**한다.
 *
 * ⇒ **누진 호 그룹 분기에만** 적용한다. 그 그룹은 `classifyRateGroup:72`가 2년 미만을 전부
 *   `short_term`으로 보내 **2년 이상만** 남으므로 §104⑦ 후단이 발동하지 않는다(승패 오염 없음).
 *   `short_term` 분기는 **손대지 않는다** — D-11(`sameRateClause`)이 거기 있다.
 *   합산은 **누진 호**(`PROGRESSIVE_RATE_CLAUSES`)끼리만 — 단일세율 호는 floor 차이뿐이다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

function item(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D("2026-06-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}

/**
 * split 자산 — 자산 단위 취득일은 **장기**(→`progressive` 그룹)인데 **토지 파트만 단기**.
 * 주택은 기산일이 `max(토지, 건물)`이라 토지를 **나중에** 취득해야 파트 호가 갈린다.
 *   · 건물 파트 2010-01-01 → §104①1호 누진 · 과세표준 210,000,000
 *   · 토지 파트 2025-08-01 → §104①3호 70%   · 과세표준 300,000,000
 */
const splitAsset = (id: string) =>
  item(id, {
    propertyType: "housing",
    acquisitionDate: D("2010-01-01"),
    landAcquisitionDate: D("2025-08-01"),
    transferPrice: 1_000_000_000,
    acquisitionPrice: 400_000_000,
    landTransferPrice: 600_000_000,
    buildingTransferPrice: 400_000_000,
    // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
    //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
    landStandardPriceAtTransfer: 600_000_000,
    buildingStandardPriceAtTransfer: 400_000_000,
    landAcquisitionPrice: 300_000_000,
    buildingAcquisitionPrice: 100_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
  } as Partial<TransferTaxItemInput>);

/** 사업용 토지 — `progressive` 그룹, LTHD 22%(11년) → 과세표준 = gross × 0.78 */
const plain = (id: string, gross: number) =>
  item(id, {
    propertyType: "land",
    acquisitionDate: D("2015-01-01"),
    acquisitionPrice: 0,
    transferPrice: gross,
    isNonBusinessLand: false,
  });

/** 한 필지 중 절반만 비사업용 — 파트가 §104①8호 / §104①1호로 갈린다 */
const partialNbl = (id: string, gross: number) =>
  item(id, {
    propertyType: "land",
    acquisitionDate: D("2015-01-01"),
    acquisitionPrice: 0,
    transferPrice: gross,
    isNonBusinessLand: true,
    nonBusinessLandDetails: {
      landType: "housing_site" as const,
      landArea: 600,
      zoneType: "general_residential" as const,
      acquisitionDate: D("2015-01-01"),
      transferDate: D("2026-06-01"),
      housingFootprint: 100,
      isMetropolitanArea: true,
      businessUsePeriods: [],
      gracePeriods: [],
    },
  } as Partial<TransferTaxItemInput>);

function agg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

describe("P12 2단계 — 파트가 자기 호로 합산된다", () => {
  it("B-43 (D-7): split 자산의 **건물 파트**가 같은 ①1호 자산들과 합산된다", () => {
    const r = agg([splitAsset("S"), plain("P1", 300_000_000), plain("P2", 300_000_000)]);
    const g = r.groupTaxes.find((x) => x.group === "progressive")!;
    expect(g.groupTaxBase).toBe(978_000_000); // 그룹 과세표준 자체는 불변
    // §104①1호: S건물 210,000,000 + P1·P2 468,000,000 = 678,000,000 → 42% − 35,940,000
    //            = 248,820,000
    // §104①3호: S토지 300,000,000 × 70% = 210,000,000 (단일세율 → 개별)
    // 종전: 269,860,000 + 68,980,000 × 2 = 407,820,000 (그룹 전체가 자산별 합)
    expect(g.groupCalculatedTax).toBe(458_820_000);
    expect(r.calculatedTax).toBe(458_820_000); // 1호(978,000,000 누진) 374,820,000보다 크다
  });

  it("B-44 (D-12): 부분 비사토 2건 — ①8호끼리 · ①1호끼리 합산", () => {
    const r = agg([partialNbl("L1", 300_000_000), partialNbl("L2", 300_000_000)]);
    const g = r.groupTaxes.find((x) => x.group === "non_business_land")!;
    expect(g.groupTaxBase).toBe(468_000_000);
    // §104①8호: 117,000,000 × 2 = 234,000,000 → 누진 68,980,000 + 10% 23,400,000 = 92,380,000
    // §104①1호: 117,000,000 × 2 = 234,000,000 → 68,980,000
    // 종전(자산별 합): 137,960,000 — P10이 모델 A(184,660,000)를 지나쳐 과소로 착지했다
    expect(g.groupCalculatedTax).toBe(161_360_000);
  });
});

/**
 * ⚠️ **GREEN 조건** — 2단계는 세액을 바꾸는 단계다. 새 anchor가 통과하는 것만으로는 부족하고,
 * **이 프로젝트가 이미 재현해 둔 authoritative 사례**가 함께 살아 있어야 한다.
 * (§4.9-R 교훈 — P11은 새 anchor만 GREEN인 채로 머지됐다가 되돌렸다.)
 */
describe("P12 2단계 GREEN 조건 — authoritative 사례 불변", () => {
  it("B-45: 교재 사례1 구조 — ⑦3호 2건(파트 없음)은 자산이 곧 파트라 합산 8억 유지", () => {
    const house = (id: string, gain: number) =>
      item(id, {
        propertyType: "housing",
        acquisitionDate: D("2015-01-01"),
        acquisitionPrice: 0,
        transferPrice: gain,
        householdHousingCount: 3,
        isRegulatedArea: true,
      });
    const r = agg([house("B", 300_000_000), house("C", 500_000_000)]);
    const g = r.groupTaxes.find((x) => x.group === "multi_house_surcharge")!;
    expect(g.groupTaxBase).toBe(800_000_000);
    // 800,000,000 × 42% − 35,940,000 = 300,060,000 + 30% × 800,000,000 = 240,000,000
    expect(g.groupCalculatedTax).toBe(540_060_000);
  });

  it("B-46: R7 회귀 — **호가 다르면**(⑦1호 +20%p / ⑦3호 +30%p) 합산하지 않는다", () => {
    const house = (id: string, gain: number, count: number) =>
      item(id, {
        propertyType: "housing",
        acquisitionDate: D("2015-01-01"),
        acquisitionPrice: 0,
        transferPrice: gain,
        householdHousingCount: count,
        isRegulatedArea: true,
      });
    const r = agg([house("B", 300_000_000, 2), house("C", 500_000_000, 3)]);
    const g = r.groupTaxes.find((x) => x.group === "multi_house_surcharge")!;
    // 3억: 94,060,000 + 20% 60,000,000 / 5억: 174,060,000 + 30% 150,000,000
    expect(g.groupCalculatedTax).toBe(478_120_000);
  });

  it("B-47: 파트 없는 누진 호 자산 2건은 종전대로 합산 1회 (예규 본문)", () => {
    const r = agg([plain("P1", 300_000_000), plain("P2", 300_000_000)]);
    const g = r.groupTaxes.find((x) => x.group === "progressive")!;
    expect(g.groupCalculatedTax).toBe(161_260_000); // 468,000,000 × 40% − 25,940,000
  });
});
