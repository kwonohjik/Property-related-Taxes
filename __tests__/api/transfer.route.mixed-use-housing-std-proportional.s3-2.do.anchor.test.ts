/**
 * S3-2 Do anchor — 겸용주택 주택분 기준시가 토지·건물 분할(가목:나목 비례)의 **엔진·⑫·⑭ 배선** 고정.
 *
 * 설계 `docs/02-design/features/housing-std-split-proportional-s3-2.engine.design.md` §10 「Do 결과」.
 * Pre-Do anchor(`…s3-2.predo.anchor.test.ts`)가 값(산출세액·분배)을 고정하고, 이 파일은 그 밖을 고정한다.
 *
 * - (L) leaf — 필수 술어 진리표 · 분할 함수 3경로(proportional / B0 / raw_ratio) · BigInt 대조
 * - (E) 엔진 — echo `housingStdSplit` 모양 · PHD·상가→주택 경로의 나목 불요 · Q-B × B0 상호작용 ·
 *       오류 메시지에 미확인 조문 인용 없음 · 뺄셈 fallback 없음
 * - (R) Route — Q-B(H 없음) 200 · PHD·상가→주택 나목 불요 200 · echo가 응답 JSON에 도달 · 컴패니언 겸용(⑫ 공유·⑭ spread)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import {
  isHousingBuildingStdAtAcqRequired,
  isHousingBuildingStdAtTransferRequired,
  isHousingPriceAtAcqRequired,
  isHousingPriceAtTransferRequired,
  splitMixedUseHousingStd,
} from "@/lib/tax-engine/mixed-use-housing-std";
import { makeMockRates, makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const TD = D("2024-08-20");
const P = 3_000_000_000;
const bigProp = (H: number, L: number, N: number) => Number((BigInt(H) * BigInt(L)) / BigInt(L + N));

/** 취득 H 400M · L 120M · N 380M / 양도 H_T 1.6B · L_T 1.2B · N_T 800M (predo anchor와 같은 가상 fixture) */
function base(over: Record<string, unknown> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2010-03-15"),
    buildingAcquisitionDate: D("2010-03-15"),
    transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
    acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 380_000_000 },
    residencePeriodYears: 0,
    isMetropolitanArea: true,
    zoneType: "general_residential",
    isOneHouseExempt: false,
    ...over,
  } as unknown as MixedUseAssetInput;
}
const calc = (asset: MixedUseAssetInput) => calcMixedUseTransferTax(P, TD, asset, rates);

// ── (L) leaf ─────────────────────────────────────────────────────────────
describe("(L) leaf — 필수 술어 진리표 (엔진·⑫·UI 어댑터가 공유하는 단일 소스)", () => {
  it("양도시 나목: PHD 켬만 불요 (용도변경 방향과 무관)", () => {
    expect(isHousingBuildingStdAtTransferRequired({})).toBe(true);
    expect(isHousingBuildingStdAtTransferRequired({ usePhd: false })).toBe(true);
    expect(isHousingBuildingStdAtTransferRequired({ usePhd: true })).toBe(false);
    expect(isHousingBuildingStdAtTransferRequired({ partialDirection: "commercial_to_house" })).toBe(true);
    expect(isHousingBuildingStdAtTransferRequired({ partialDirection: "house_to_commercial" })).toBe(true);
  });
  it("취득시 나목: PHD 켬·상가→주택 용도변경은 불요 / 주택→상가는 필요", () => {
    expect(isHousingBuildingStdAtAcqRequired({})).toBe(true);
    expect(isHousingBuildingStdAtAcqRequired({ usePhd: true })).toBe(false);
    expect(isHousingBuildingStdAtAcqRequired({ partialDirection: "commercial_to_house" })).toBe(false);
    expect(isHousingBuildingStdAtAcqRequired({ partialDirection: "house_to_commercial" })).toBe(true);
    expect(isHousingBuildingStdAtAcqRequired({ usePhd: true, partialDirection: "house_to_commercial" })).toBe(false);
  });
});

describe("(L) 분할 함수 — splitMixedUseHousingStd", () => {
  it("proportional: floor 먼저 · 건물분 잔액 흡수 · 합 = H — 안전 정수 초과(곱 4.5e19)도 BigInt 일치", () => {
    const cases: [number, number, number][] = [
      [400_000_000, 120_000_000, 380_000_000],
      [1_000_000_007, 333_333_333, 700_000_001],
      [9_000_000_000, 5_000_000_000, 7_000_000_000],
    ];
    for (const [H, L, N] of cases) {
      const r = splitMixedUseHousingStd({ housingTotal: H, landStd: L, buildingStd: N });
      expect(r.kind).toBe("proportional");
      expect(r.landBasis).toBe(bigProp(H, L, N));
      expect(r.landBasis + r.buildingBasis).toBe(H);
      expect(r).toMatchObject({ housingTotal: H, landStd: L, buildingStd: N });
    }
  });
  it("B0(landStdAtBuildingDay) — Q-A γ1(집행기준 99-164-9): 취득당시 주택가격 P = floor(H×(가목_토지일+나목)/(가목_건물일+나목)) → 토지분 = floor(P×가목_토지일/(가목_토지일+나목)) · 건물분 = P − 토지분", () => {
    const r = splitMixedUseHousingStd({
      housingTotal: 400_000_000,
      landStd: 120_000_000,
      buildingStd: 320_000_000,
      landStdAtBuildingDay: 180_000_000,
    });
    // P = 400M × (120M + 320M) ÷ (180M + 320M) = 352M · 토지 = 352M × 120 ÷ 440 = 96M · 건물 = 256M
    expect(r).toEqual({
      housingTotal: 400_000_000,
      landStd: 180_000_000, // 건물 취득일 가목(P 산정 분모)
      buildingStd: 320_000_000,
      landStdAtLandAcq: 120_000_000, // 토지 취득일 가목
      convertedHousingTotal: 352_000_000,
      landBasis: 96_000_000,
      buildingBasis: 256_000_000,
      kind: "separate_date_converted",
    });
    expect(r.landBasis + r.buildingBasis).toBe(r.convertedHousingTotal);
  });
  it("B0 γ1 항등: H = 가목_건물일 + 나목이면 토지분 = 토지일 가목 원값(종전 B0·β와 1원 동일)", () => {
    const r = splitMixedUseHousingStd({
      housingTotal: 400_000_000,
      landStd: 120_000_000,
      buildingStd: 220_000_000,
      landStdAtBuildingDay: 180_000_000,
    });
    expect(r.convertedHousingTotal).toBe(340_000_000);
    expect(r.landBasis).toBe(120_000_000);
    expect(r.buildingBasis).toBe(220_000_000);
  });
  it("raw_ratio(H 없음 — Q-B): `allowRawRatio`일 때만 가목·나목 원값 그대로 — 아니면 throw(자동 안분 fallback 금지)", () => {
    for (const H of [0, -1, Number.NaN]) {
      expect(splitMixedUseHousingStd({ housingTotal: H, landStd: 120_000_000, buildingStd: 380_000_000, allowRawRatio: true })).toEqual({
        housingTotal: 0,
        landStd: 120_000_000,
        buildingStd: 380_000_000,
        landBasis: 120_000_000,
        buildingBasis: 380_000_000,
        kind: "raw_ratio",
      });
      expect(() => splitMixedUseHousingStd({ housingTotal: H, landStd: 120_000_000, buildingStd: 380_000_000 })).toThrow(/개별주택가격/);
      expect(() => splitMixedUseHousingStd({ housingTotal: H, landStd: 120_000_000, buildingStd: 380_000_000, allowRawRatio: false })).toThrow(/개별주택가격/);
    }
    // H가 있으면 allowRawRatio는 무시된다(비례)
    expect(splitMixedUseHousingStd({ housingTotal: 400_000_000, landStd: 120_000_000, buildingStd: 380_000_000, allowRawRatio: true }).kind).toBe("proportional");
  });

  it("개별주택가격 필수 술어 — 양도시는 PHD만 면제 · 취득시는 PHD·상가→주택·상속·증여가 면제", () => {
    expect(isHousingPriceAtTransferRequired({})).toBe(true);
    expect(isHousingPriceAtTransferRequired({ usePhd: true })).toBe(false);
    expect(isHousingPriceAtTransferRequired({ partialDirection: "commercial_to_house", byInheritanceOrGift: true })).toBe(true);
    expect(isHousingPriceAtAcqRequired({})).toBe(true);
    expect(isHousingPriceAtAcqRequired({ usePhd: true })).toBe(false);
    expect(isHousingPriceAtAcqRequired({ partialDirection: "commercial_to_house" })).toBe(false);
    expect(isHousingPriceAtAcqRequired({ partialDirection: "house_to_commercial" })).toBe(true);
    expect(isHousingPriceAtAcqRequired({ byInheritanceOrGift: true })).toBe(false);
    // 나목 술어는 byInheritanceOrGift를 보지 않는다 — 상속·증여도 나목은 필수
    expect(isHousingBuildingStdAtAcqRequired({ byInheritanceOrGift: true })).toBe(true);
  });
});

// ── (E) 엔진 ─────────────────────────────────────────────────────────────
describe("(E) 엔진 — echo·경로별 나목 요구", () => {
  it("E-1 같은 취득일: echo acq/transfer 모두 proportional · 결과 JSON 직렬화 가능(왕복 동일)", () => {
    const h = calc(base()).housingPart;
    expect(h.housingStdSplit).toEqual({
      acq: { housingTotal: 400_000_000, landStd: 120_000_000, buildingStd: 380_000_000, landBasis: 96_000_000, buildingBasis: 304_000_000, kind: "proportional" },
      transfer: { housingTotal: 1_600_000_000, landStd: 1_200_000_000, buildingStd: 800_000_000, landBasis: 960_000_000, buildingBasis: 640_000_000, kind: "proportional" },
    });
    expect(JSON.parse(JSON.stringify(h.housingStdSplit))).toEqual(h.housingStdSplit);
    // echo는 계산값과 같다 — 표시가 계산을 재도출하지 않는다
    expect([h.landStdPriceAtAcq, h.buildingStdPriceAtAcq]).toEqual([96_000_000, 304_000_000]);
  });

  it("E-2 B0: echo acq = separate_date_converted (landStd·buildingStd는 건물일 값, 토지분은 취득당시 주택가격의 토지일 가목 비례 몫)", () => {
    const sep = base({
      landAcquisitionDate: D("2005-06-10"),
      buildingAcquisitionDate: D("2010-03-15"),
      acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, landPricePerSqmAtBuildingAcq: 1_800_000, housingBuildingPrice: 320_000_000 },
    });
    expect(calc(sep).housingPart.housingStdSplit?.acq).toEqual({
      housingTotal: 400_000_000,
      landStd: 180_000_000,
      buildingStd: 320_000_000,
      landStdAtLandAcq: 120_000_000,
      convertedHousingTotal: 352_000_000,
      landBasis: 96_000_000,
      buildingBasis: 256_000_000,
      kind: "separate_date_converted",
    });
  });

  it("E-3 PHD: 나목 없이 계산되고 echo는 없다(PHD 자체 3시점 분할)", () => {
    const phd = base({
      usePreHousingDisclosure: true,
      landAcquisitionDate: D("2000-01-01"),
      buildingAcquisitionDate: D("2000-01-01"),
      acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 30_000_000, landPricePerSqm: 600_000 },
      transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000 },
      preHousingDisclosure: {
        firstDisclosureDate: D("2005-04-30"),
        firstDisclosureHousingPrice: 200_000_000,
        landPricePerSqmAtAcquisition: 600_000,
        buildingStdPriceAtAcquisition: 50_000_000,
        landPricePerSqmAtFirstDisclosure: 900_000,
        buildingStdPriceAtFirstDisclosure: 70_000_000,
        transferHousingPrice: 1_600_000_000,
        landPricePerSqmAtTransfer: 12_000_000,
        buildingStdPriceAtTransfer: 800_000_000,
      },
    });
    const r = calc(phd);
    expect(r.housingPart.housingStdSplit).toBeUndefined();
    expect(r.total.transferTax).toBe(801_651_505);
  });

  it("E-4 상가→주택: 양도시 나목만 필요 — 취득시 나목 없이 계산되고 echo.acq는 없다 · 양도시 나목이 없으면 차단", () => {
    const c2h = base({
      acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 200_000_000, landPricePerSqm: 1_200_000 },
      partialUsageChange: { direction: "commercial_to_house", usageChangeDate: D("2018-01-01") },
    });
    const r = calc(c2h).housingPart;
    expect([r.landStdPriceAtAcq, r.buildingStdPriceAtAcq]).toEqual([132_000_000, 88_000_000]);
    expect(r.housingStdSplit?.acq).toBeUndefined();
    expect(r.housingStdSplit?.transfer?.kind).toBe("proportional");
    expect(() =>
      calc({ ...c2h, transferStandardPrice: { ...c2h.transferStandardPrice, housingBuildingPrice: undefined } } as MixedUseAssetInput),
    ).toThrow(/나목/);
  });

  it("E-5 주택→상가: 취득시 나목이 필요하다(주택부분에 쓰이는 취득시 가목:나목)", () => {
    const h2c = base({
      partialUsageChange: { direction: "house_to_commercial", acqResidentialArea: 200, acqCommercialArea: 0, usageChangeDate: D("2018-01-01") },
      acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000 },
    });
    expect(() => calc(h2c)).toThrow(/나목/);
  });

  it("E-6 Q-B × B0: 상속 신고가액만(H 없음) + 취득일 상이 → B0 비활성(가목_b 불요) — 토지일 가목 : 건물일 나목 원값 비율(raw_ratio)", () => {
    const inh = base({
      landAcquisitionDate: D("2005-06-10"),
      buildingAcquisitionDate: D("2010-03-15"),
      acquisitionByInheritance: true,
      housingInheritedValue: 450_000_000,
      commercialInheritedValue: 100_000_000,
      acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 320_000_000 },
    });
    const h = calc(inh).housingPart;
    expect(h.housingStdSplit?.acq).toEqual({
      housingTotal: 0, landStd: 120_000_000, buildingStd: 320_000_000, landBasis: 120_000_000, buildingBasis: 320_000_000, kind: "raw_ratio",
    });
    const land = bigProp(450_000_000, 120_000_000, 320_000_000);
    expect([h.landAcqPrice, h.buildingAcqPrice]).toEqual([land, 450_000_000 - land]);
    // H가 있는 상속 + 취득일 상이는 기존 B0 규칙 그대로 — 건물일 가목이 없으면 차단
    const inhWithH = base({
      landAcquisitionDate: D("2005-06-10"),
      buildingAcquisitionDate: D("2010-03-15"),
      acquisitionByInheritance: true,
      housingInheritedValue: 450_000_000,
      commercialInheritedValue: 100_000_000,
      acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 320_000_000 },
    });
    expect(() => calc(inhWithH)).toThrow(/건물 취득일 기준/);
  });

  it("E-7 오류 메시지 — 나목 누락은 가목:나목 비례를 설명하고 미확인 조문 인용(§·법령명)을 넣지 않는다 · 뺄셈 후퇴 없음", () => {
    const noA = base({ acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000 } });
    const noT = base({ transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000 } });
    for (const [asset, field] of [[noA, "acquisitionStandardPrice.housingBuildingPrice"], [noT, "transferStandardPrice.housingBuildingPrice"]] as const) {
      let msg = "";
      try {
        calc(asset);
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toContain(field);
      expect(msg).toMatch(/가목.*나목/);
      expect(msg).not.toMatch(/§|소득세법|시행령/);
    }
  });

  it("E-8 나목 0·음수·NaN도 미입력과 같다(차단)", () => {
    for (const bad of [0, -5, Number.NaN]) {
      expect(() => calc(base({ transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: bad } }))).toThrow(/나목/);
      expect(() => calc(base({ acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: bad } }))).toThrow(/나목/);
    }
  });

  it("E-10 PHD 토글만 켜고 3시점 입력(preHousingDisclosure)이 없는 엔진 직접 입력 — PHD 분기가 아니라 일반 §97 흐름이라 나목이 필요하다(NaN으로 흘러가지 않고 차단) · ⑫는 이 입력을 400으로 막는다", () => {
    const toggleOnly = base({ usePreHousingDisclosure: true, acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000 }, transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000 } });
    expect(() => calc(toggleOnly)).toThrow(/나목/);
  });

  it("E-11 raw_ratio는 Q-B(취득시 상속·증여 + H 없음)에만 — 양도시 H_T ≤ 0 · 상속·증여 외 취득시 H ≤ 0은 throw (원값 비율 fallback 금지)", () => {
    // 양도시 H_T = 0
    expect(() =>
      calc(base({ transferStandardPrice: { housingPrice: 0, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 } })),
    ).toThrow(/양도시 개별주택가격/);
    // 취득시 H 없음 — 환산·실가·감정 어느 쪽이든 차단
    const noH = { housingPrice: undefined, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 380_000_000 };
    expect(() => calc(base({ acquisitionStandardPrice: noH }))).toThrow(/취득시 개별주택가격/);
    expect(() => calc(base({ acquisitionStandardPrice: noH, useActualAcquisition: true, acquisitionActualTotalPrice: 900_000_000 }))).toThrow(/취득시 개별주택가격/);
    expect(() => calc(base({ acquisitionStandardPrice: noH, useAppraisalSalesAcquisition: true, acquisitionActualTotalPrice: 900_000_000 }))).toThrow(/취득시 개별주택가격/);
    // 상속·증여 + H 없음은 허용(신고가액) — 상속·증여 둘 다
    for (const kind of ["acquisitionByInheritance", "acquisitionByGift"] as const) {
      const r = calc(base({ [kind]: true, housingInheritedValue: 450_000_000, commercialInheritedValue: 100_000_000, acquisitionStandardPrice: noH }));
      expect(r.housingPart.housingStdSplit?.acq?.kind).toBe("raw_ratio");
    }
    // 상속·증여 + H 없음 + 신고가액도 없음 → 기존 규칙(상속 평가액 정보 없음)이 먼저 막는다
    expect(() => calc(base({ acquisitionByInheritance: true, acquisitionStandardPrice: noH }))).toThrow(/평가액 정보가 없습니다/);
  });

  it("E-9 개산공제 합 불변 — 같은 취득일: 비례 분할분의 합 = 라목 가액(400M) × 3% (영 §163⑥2호가목은 결합가 하나에 3%)", () => {
    const h = calc(base()).housingPart;
    expect(h.landAppraisalDed + h.buildingAppraisalDed).toBe(12_000_000);
  });
});

// ── (R) Route ────────────────────────────────────────────────────────────
function body(mu: Record<string, unknown> = {}) {
  return {
    transferPrice: P,
    acquisitionPrice: 900_000_000,
    acquisitionDate: "2010-03-15",
    transferDate: "2024-08-20",
    expenses: 0,
    useEstimatedAcquisition: true,
    householdHousingCount: 1,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    residencePeriodMonths: 0,
    propertyType: "mixed-use-house" as const,
    mixedUse: {
      isMixedUseHouse: true as const,
      residentialFloorArea: 100,
      nonResidentialFloorArea: 100,
      buildingFootprintArea: 100,
      totalLandArea: 200,
      landAcquisitionDate: "2010-03-15",
      buildingAcquisitionDate: "2010-03-15",
      transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
      acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 380_000_000 },
      residencePeriodYears: 0,
      isOneHouseExempt: false,
      isMetropolitanArea: true,
      zoneType: "general_residential" as const,
      ...mu,
    },
  };
}
type RouteJson = {
  status: number;
  json: {
    data?: { result: { housingPart: { housingStdSplit?: { acq?: Record<string, unknown>; transfer?: Record<string, unknown> }; landAcqPrice: number; buildingAcqPrice: number; buildingStdPriceAtAcq: number } } };
    error?: unknown;
  };
};
async function post(payload: unknown): Promise<RouteJson> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return { status: res.status, json: await res.json() };
}

describe("(R) Route — ⑫ 통과·⑭ 도달", () => {
  it("R-1 echo `housingStdSplit`이 응답 JSON에 그대로 도달한다 (acq·transfer 둘 다)", async () => {
    const r = await post(body());
    expect(r.status).toBe(200);
    expect(r.json.data!.result.housingPart.housingStdSplit).toEqual({
      acq: { housingTotal: 400_000_000, landStd: 120_000_000, buildingStd: 380_000_000, landBasis: 96_000_000, buildingBasis: 304_000_000, kind: "proportional" },
      transfer: { housingTotal: 1_600_000_000, landStd: 1_200_000_000, buildingStd: 800_000_000, landBasis: 960_000_000, buildingBasis: 640_000_000, kind: "proportional" },
    });
  });

  it("R-2 Q-B: 상속 신고가액만(acquisitionStandardPrice.housingPrice 없음) + 나목 → 200 · raw_ratio · 108M/342M — H를 요구하지 않는다", async () => {
    const mu = {
      acquisitionByInheritance: true,
      housingInheritedValue: 450_000_000,
      commercialInheritedValue: 100_000_000,
      acquisitionStandardPrice: { commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 380_000_000 },
    };
    const r = await post(body(mu));
    expect(r.status).toBe(200);
    const h = r.json.data!.result.housingPart;
    expect([h.landAcqPrice, h.buildingAcqPrice]).toEqual([108_000_000, 342_000_000]);
    expect(h.housingStdSplit?.acq).toMatchObject({ housingTotal: 0, landBasis: 120_000_000, buildingBasis: 380_000_000, kind: "raw_ratio" });
    // 나목이 없으면 400 — 지목 필드는 acquisitionStandardPrice.housingBuildingPrice
    const noN = await post(body({ ...mu, acquisitionStandardPrice: { commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000 } }));
    expect(noN.status).toBe(400);
    expect(JSON.stringify(noN.json)).toContain("housingBuildingPrice");
  });

  it("R-3 PHD 켬: 나목 없이 200 (⑫가 요구하지 않는다 — 엔진 도달 안 함)", async () => {
    const phdBody = body({
        usePreHousingDisclosure: true,
        landAcquisitionDate: "2000-01-01",
        buildingAcquisitionDate: "2000-01-01",
        transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000 },
        acquisitionStandardPrice: { commercialBuildingPrice: 30_000_000, landPricePerSqm: 600_000 },
        preHousingDisclosure: {
          firstDisclosureDate: "2005-04-30",
          firstDisclosureHousingPrice: 200_000_000,
          landPricePerSqmAtAcquisition: 600_000,
          buildingStdPriceAtAcquisition: 50_000_000,
          landPricePerSqmAtFirstDisclosure: 900_000,
          buildingStdPriceAtFirstDisclosure: 70_000_000,
          transferHousingPrice: 1_600_000_000,
          landPricePerSqmAtTransfer: 12_000_000,
          buildingStdPriceAtTransfer: 800_000_000,
        },
      });
    // PHD(§164⑦)는 취득일이 최초 고시일 이전이어야 한다 — 자산 취득일도 맞춘다
    const r = await post({ ...phdBody, acquisitionDate: "2000-01-01" });
    expect(r.status).toBe(200);
  });

  it("R-4 상가→주택: 취득시 나목 없이 200 / 양도시 나목 없으면 400(transferStandardPrice 지목)", async () => {
    const c2h = {
      acquisitionStandardPrice: { commercialBuildingPrice: 200_000_000, landPricePerSqm: 1_200_000 },
      partialUsageChange: { direction: "commercial_to_house" as const, usageChangeDate: "2018-01-01" },
    };
    const ok = await post(body(c2h));
    expect(ok.status).toBe(200);
    expect(ok.json.data!.result.housingPart.housingStdSplit?.acq).toBeUndefined();
    const noT = await post(
      body({ ...c2h, transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000 } }),
    );
    expect(noT.status).toBe(400);
    expect(JSON.stringify(noT.json)).toContain("transferStandardPrice");
  });

  it("R-5 나목 값이 엔진에 도달한다(strip 아님) — 값을 바꾸면 분할·세액이 바뀐다", async () => {
    const a = await post(body());
    const b = await post(body({ acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 120_000_000 } }));
    expect(a.json.data!.result.housingPart.buildingStdPriceAtAcq).toBe(304_000_000);
    expect(b.json.data!.result.housingPart.buildingStdPriceAtAcq).toBe(200_000_000); // 400M × 120/240 → 건물 200M
  });
});

describe("(R) 개별주택가격 필수 — ⑫가 엔진과 같은 조건으로 막는다", () => {
  it("R-7 양도시 H_T = 0(비-PHD) → 400(transferStandardPrice.housingPrice 지목) · 취득시 H 없음(환산) → 400 · 상속·증여는 200", async () => {
    const zeroT = await post(body({ transferStandardPrice: { housingPrice: 0, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 } }));
    expect(zeroT.status).toBe(400);
    expect(JSON.stringify(zeroT.json)).toContain("transferStandardPrice");
    expect(JSON.stringify(zeroT.json)).toContain("housingPrice");
    const noA = await post(body({ acquisitionStandardPrice: { commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 380_000_000 } }));
    expect(noA.status).toBe(400);
    expect(JSON.stringify(noA.json)).toContain("acquisitionStandardPrice");
    for (const kind of ["acquisitionByInheritance", "acquisitionByGift"]) {
      const ok = await post(body({ [kind]: true, housingInheritedValue: 450_000_000, commercialInheritedValue: 100_000_000, acquisitionStandardPrice: { commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 380_000_000 } }));
      expect(ok.status).toBe(200);
    }
  });

  it("R-8 격자 — 엔진이 취득시 H 부재로 throw하면 ⑫도 400이다(⑫ ⊇ 엔진): PHD·상가→주택·상속증여·환산·실가·감정 조합", async () => {
    const noH = { commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 380_000_000 };
    const cases: [string, Record<string, unknown>, boolean][] = [
      // [이름, mixedUse 덮어쓰기, H 부재로 차단되어야 하는가]
      ["환산", {}, true],
      ["실가", { useActualAcquisition: true, acquisitionActualTotalPrice: 900_000_000 }, true],
      ["감정", { useAppraisalSalesAcquisition: true, acquisitionActualTotalPrice: 900_000_000 }, true],
      ["상속(신고가액)", { acquisitionByInheritance: true, housingInheritedValue: 450_000_000, commercialInheritedValue: 100_000_000 }, false],
      ["증여(신고가액)", { acquisitionByGift: true, housingInheritedValue: 450_000_000, commercialInheritedValue: 100_000_000 }, false],
      ["상가→주택", { partialUsageChange: { direction: "commercial_to_house", usageChangeDate: "2018-01-01" } }, false],
    ];
    for (const [name, over, blocked] of cases) {
      const r = await post(body({ acquisitionStandardPrice: noH, ...over }));
      expect(r.status, name).toBe(blocked ? 400 : 200);
    }
  });
});

// ── 컴패니언 겸용 — ⑫ 스키마 공유(`mixedUseAssetSchema`) · ⑭ `...s.mixedUse` spread ──────────────
const MIXED_FIELDS = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false,
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600",
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000",
  mixedAcqLandPricePerSqm: "1000000",
};
function companionAsset(i: number, over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(i),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "500000000",
    standardPriceAtAcq: "250000000",
    ...over,
  };
}
function companionForm(): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [companionAsset(1), companionAsset(2, { ...MIXED_FIELDS, standardPriceAtTransfer: "500000000", actualSalePrice: "600000000" })],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as unknown as TransferFormData;
}
async function captureCompanionBody() {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(companionForm());
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  return captured as { companionAssets: { mixedUse: { transferStandardPrice: Record<string, unknown>; acquisitionStandardPrice: Record<string, unknown> } }[] };
}

describe("(R) 컴패니언 겸용 — 같은 ⑫ 스키마 · ⑭ spread", () => {
  it("R-6 컴패니언 mixedUse의 나목이 ⑫를 통과해 엔진에 도달한다 · 나목 누락은 400(컴패니언 경로 지목)", async () => {
    const b = await captureCompanionBody();
    const mu = b.companionAssets[0].mixedUse;
    // 1) 누락 → 400 + 필드 지목 (④가 보내든 안 보내든 이 테스트가 두 키를 직접 지운다)
    delete mu.transferStandardPrice.housingBuildingPrice;
    delete mu.acquisitionStandardPrice.housingBuildingPrice;
    const missing = await post(b);
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.json)).toContain("housingBuildingPrice");
    // 2) 실으면 200 — 값에 따라 세액이 달라진다(strip이면 같아진다)
    const totals: number[] = [];
    for (const nA of [250_000_000, 100_000_000]) {
      mu.transferStandardPrice.housingBuildingPrice = 700_000_000;
      mu.acquisitionStandardPrice.housingBuildingPrice = nA;
      const r = await post(b);
      expect(r.status).toBe(200);
      totals.push(JSON.stringify((r.json as { data?: unknown }).data).length);
    }
    expect(totals[0]).not.toBe(totals[1]);
  });
});

describe("(R) PHD 켬 — 양도시 housingPrice 0은 S3-2가 막지 않는다(기존 동작 유지)", () => {
  it("R-9 PHD + transferStandardPrice.housingPrice 0 → 200 그대로 (⑫ H_T 필수는 비-PHD 한정). ⚠️ 기존 별건: 이 값이 주택:상가 안분 분자라 0이면 주택 양도가액 0으로 흘러간다 — 설계서 확인 필요", async () => {
    const mk = (hp: number) => body({
      usePreHousingDisclosure: true, landAcquisitionDate: "2000-01-01", buildingAcquisitionDate: "2000-01-01",
      transferStandardPrice: { housingPrice: hp, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000 },
      acquisitionStandardPrice: { commercialBuildingPrice: 30_000_000, landPricePerSqm: 600_000 },
      preHousingDisclosure: { firstDisclosureDate: "2005-04-30", firstDisclosureHousingPrice: 200_000_000, landPricePerSqmAtAcquisition: 600_000, buildingStdPriceAtAcquisition: 50_000_000, landPricePerSqmAtFirstDisclosure: 900_000, buildingStdPriceAtFirstDisclosure: 70_000_000, transferHousingPrice: 1_600_000_000, landPricePerSqmAtTransfer: 12_000_000, buildingStdPriceAtTransfer: 800_000_000 },
    });
    const a = await post({ ...mk(0), acquisitionDate: "2000-01-01" });
    const b = await post({ ...mk(1_600_000_000), acquisitionDate: "2000-01-01" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });
});
