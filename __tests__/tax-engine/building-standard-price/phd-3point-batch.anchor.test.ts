/**
 * Pre-Do 특성화 anchor — PHD 3시점 건물기준시가 일괄 계산 접근 확정
 * 계획서: docs/02-design/features/phd-building-stdprice-3point-batch-calculator.plan.md §3.1·§5
 *
 * 확정 목표:
 *  A1. 취득·양도 2시점은 transfer 1콜로 산출(.acquisition/.transfer.standardPrice)
 *  A2. 최초공시(≥2001) plain 값 = 별도 transfer 콜의 acquisitionYear=최초공시연도 acquisition
 *      과 valuation(inheritance) 콜의 valuation 이 동일(경로 등가) → 오케스트레이션 = transfer 2콜
 *  A3. ≤2000 최초공시(공동주택 1993): valuation(plain) throw → 계산 미지원(수동) 정당화.
 *      단, transfer acquisition 경로는 ≤2000에 acqBase 값 반환(throw 아님) → 최초공시엔 부적절
 */
import { describe, it, expect } from "vitest";
import {
  calcBuildingStandardPrice,
  type BuildingStandardPriceInput,
} from "../../../lib/tax-engine/building-standard-price";
import {
  hasUsageIndexYear,
  hasLocationIndexYear,
} from "@/lib/tax-engine/data/building-standard-price";
import { computePhdThreePointStdPrice } from "@/lib/calc/phd-building-std-batch";

const bldg = { structureKey: "rc", usageNo: 1 } as const; // 철근콘크리트조 · 아파트용도

describe("PHD 3시점 일괄 계산 — 접근 특성화 anchor", () => {
  it("A1: 취득 2014 / 양도 2025 — transfer 1콜로 2시점 산출", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "transfer",
      floorArea: 100,
      builtYear: 2010,
      acquisitionYear: 2014,
      transferYear: 2025,
      acquisition: { ...bldg, landPricePerM2: 2_369_000 },
      transfer: { ...bldg, landPricePerM2: 3_486_000 },
    };
    const r = calcBuildingStandardPrice(input);
    // 실측값 캡처(≥2001이므로 plain, acqBase 미적용)
    expect(r.acquisition?.standardPrice).toBeGreaterThan(0);
    expect(r.transfer?.standardPrice).toBeGreaterThan(0);
    expect(r.acquisition?.acqBaseRate).toBeUndefined(); // 2014≥2001 → 산정기준율 미적용
    expect(r.acquisition?.appliedLandPriceYear).toBe(2014);
  });

  it("A2: 최초공시 2005(≥2001) plain — transfer(acqYear=2005) == valuation(2005) 경로 등가", () => {
    // 경로 X: transfer 콜의 acquisition(2005) — transferYear는 sameYear(§164⑧) 회피 위해 다른 연도
    const viaTransfer = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: 100,
      builtYear: 2010,
      acquisitionYear: 2005,
      transferYear: 2025,
      acquisition: { ...bldg, landPricePerM2: 2_369_000 },
      transfer: { ...bldg, landPricePerM2: 3_486_000 },
    });
    // 경로 Y: valuation(inheritance) 단일시점(2005), 조정율 미지정(=1)
    const viaValuation = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 100,
      builtYear: 2010,
      valuationYear: 2005,
      valuation: { ...bldg, landPricePerM2: 2_369_000 },
    });
    expect(viaTransfer.acquisition?.standardPrice).toBeGreaterThan(0);
    expect(viaTransfer.acquisition?.acqBaseRate).toBeUndefined(); // 2005≥2001 plain
    // 두 경로가 같은 plain 값을 내면 최초공시 산출에 transfer.acquisition 경로 재사용 가능
    expect(viaTransfer.acquisition?.standardPrice).toBe(viaValuation.valuation?.standardPrice);
  });

  it("A3: 공동주택 최초고시 1993(≤2000) — valuation(plain) throw / transfer.acquisition은 acqBase 값", () => {
    // valuation 단일시점 ≤2000 → calcPointBreakdown 직접 → 신축가격기준액 미수록 throw
    expect(() =>
      calcBuildingStandardPrice({
        taxType: "inheritance_gift",
        floorArea: 100,
        builtYear: 1990,
        valuationYear: 1993,
        valuation: { ...bldg, landPricePerM2: 1_000_000 },
      }),
    ).toThrow();

    // transfer.acquisition ≤2000 → acqBase(2001×산정기준율) 값 반환(throw 아님) → 최초공시엔 부적절
    const r = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: 100,
      builtYear: 1990,
      acquisitionYear: 1993,
      transferYear: 2025,
      acquisition: { ...bldg, landPricePerM2: 1_000_000 },
      transfer: { ...bldg, landPricePerM2: 3_486_000 },
    });
    expect(r.acquisition?.acqBaseRate).toBeGreaterThan(0); // acqBase 적용됨(= 취득 semantics)
    expect(r.acquisition?.appliedLandPriceYear).toBe(2001);
  });
});

/**
 * P0 — 상업용건물 「소득세법 시행령」 제164조 제6항 3시점을 배치 엔진이 산출하는가.
 *
 * 계획서: docs/02-design/features/building-std-price-modal-multipoint.plan.md §5 P0
 * 목적: 상가 §164⑥(호별 고시 전 취득)은 취득시·최초고시(2005)·양도시 3시점의 건물 기준시가를
 *       모두 요구하는데, 배치 엔진(PHD 맥락에서 출발)이 이 조합을 지원하는지 **Do 진입 전** 확인.
 *       지원하지 않으면 A안(배치 모달 범용화)의 P3 배선이 성립하지 않는다.
 *
 * 시점 구성(이미지 사례 기준 — 1994년 신축 오피스텔):
 *   취득 2000 → ≤2000이라 acqBase(2001 지수표 × 산정기준율, §164⑥ 단서 = §164⑤ 준용) 경로
 *   최초고시 2005 → ≥2001 plain valuation 경로 (국세청 상업용건물·오피스텔 호별 고시 최초일)
 *   양도 2026 → plain valuation 경로
 *
 * 용도번호는 **연도 체계별로 다르다**(2001 #21 ↔ 2005 #22 ↔ 2026 #28 = 오피스텔) — 시점마다
 * 그 연도 체계로 지정해야 한다(`PhdBatchPart`의 시점별 구조·용도 설계 근거).
 */
describe("P0 — 상가 §164⑥ 3시점 배치 산출", () => {
  const commercialInput = {
    building: {
      builtYear: 1994,
      parts: [
        {
          floorArea: 69.52, // 전용 36 + 공유 33.52
          category: "housing" as const, // 상가는 카테고리 구분이 없어 단일 슬롯 재사용(계획서 §4.3-3)
          acquisition: { structureKey: "rc", usageNo: 21 }, // 2001 체계 — 오피스텔·금융업소
          firstDisclosure: { structureKey: "rc", usageNo: 22 }, // 2005 체계
          transfer: { structureKey: "rc", usageNo: 28 }, // 2026 체계
        },
      ],
    },
    acquisition: { year: 2000, landPricePerM2: 3_978_096 }, // ≤2000 → 2001.1.1 기준 공시지가
    firstDisclosure: { year: 2005, landPricePerM2: 11_060_632 },
    transfer: { year: 2026, landPricePerM2: 15_000_000 },
  };

  it("3시점 모두 산출된다 — unsupported 0", () => {
    const r = computePhdThreePointStdPrice(commercialInput);
    expect(r.unsupported).toEqual([]);
    expect(r.acquisition?.housing).toBeGreaterThan(0);
    expect(r.firstDisclosure?.housing).toBeGreaterThan(0);
    expect(r.transfer?.housing).toBeGreaterThan(0);
  });

  it("실측값 고정 (2026-08-04 캡처) — 지수표 개정 시 이 anchor가 먼저 알린다", () => {
    const r = computePhdThreePointStdPrice(commercialInput);
    expect(r.acquisition?.housing).toBe(28_096_229);
    expect(r.firstDisclosure?.housing).toBe(35_663_760);
    expect(r.transfer?.housing).toBe(48_872_560);
  });

  it("양도 2026 지수표가 존재한다 — building-std-price-form.ts:266~268 주석('위치지수 2026 부재')은 stale", () => {
    expect(hasUsageIndexYear(2026)).toBe(true);
    expect(hasLocationIndexYear(2026)).toBe(true);
  });
});
