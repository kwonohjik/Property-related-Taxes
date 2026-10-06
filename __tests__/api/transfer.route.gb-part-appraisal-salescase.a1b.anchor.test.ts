/**
 * anchor — 일반건물 **파트별 감정가액·매매사례가액 (Phase A1) — ④·⑧·⑫ 동기화 · leaf · 엔진 안분 · 이월과세**
 *
 * 짝 파일: `transfer.route.gb-part-appraisal-salescase.a1.anchor.test.ts`(폼 → ④ → Route 전 구간) —
 * 800줄 정책으로 분리했다. 이 파일은 같은 시드·같은 수치를 쓴다(양도 20억 · 토지 1999-05-24 · 건물 2015-03-01).
 *
 *   SYNC   비-actual 파트의 취득시 기준시가 요구 — ④·⑧·⑫가 같은 술어(`partNeedsOwnAcqStd`)를 쓴다 (정책 #3)
 *   LEAF   `requiresAcqStdPricePart` 리팩터 전후 주택 split 거동 동일성(동결 사본 전수 대조)
 *   ENGINE 분리 OFF 일괄 감정·매매사례 총액 안분(`applyPartAcqModes` bundled) · 술어 진리표
 *   CARRY  이월과세 파트 × 감정·매매사례 — 모드와 무관함을 고정(서버 가드 불필요 판정의 근거)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { requiresAcqStdPricePart } from "@/lib/calc/transfer-tax-split-acq-mode";
import { partNeedsOwnAcqStd } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import { applyPartAcqModes } from "@/lib/tax-engine/general-building-part-acq";
import { usesBundledPartAcquisition } from "@/lib/tax-engine/general-building-part-acq";
import { generalBuildingValuationSchema } from "@/lib/api/transfer-tax-building-schemas";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const LAND_DEDUCTION = 3_825_000; // 1,500,000 × 85 × 3%
const BUILDING_DEDUCTION = 844_341; // 28,144,700 × 3%

function gb(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    landAcquisitionDate: "1999-05-24",
    hasSeperateLandAcquisitionDate: true,
    gbBuildingAcquisitionCause: "purchase",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "90.48",
    gbZoneType: "commercial",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "1500000",
    gbAcqBuildingValue: "28144700",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "400000000",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    ...over,
  } as AssetForm;
}

interface Json {
  data?: { aggregated?: { determinedTax: number; properties: { propertyId: string; necessaryExpense: number }[] } };
  error?: { code: string; message: string };
}

// ═══════════════════════════════════════════════════════════════════════
// SYNC — ④ · ⑧ · ⑫ 가 같은 술어를 쓴다 (정책 #3)
// ═══════════════════════════════════════════════════════════════════════
describe("SYNC 비-actual 파트의 취득시 기준시가 요구 — ④·⑧·⑫ 일치", () => {
  const noStd = { gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" } as Partial<AssetForm>;

  it("⑧ 감정 파트 + 취득시 기준시가 미입력 → 차단 (종전: 통과 후 ④가 payload를 통째로 undefined로 drop)", () => {
    const a = gb({ landAcqMode: "appraisal", ...noStd });
    const msg = validateGeneralBuildingAsset(a, "자산 1", "2026-02-16");
    expect(msg).toMatch(/취득시 토지 공시지가/);
    // ④는 같은 조건에서 undefined — ⑧이 먼저 막아야 하는 이유
    expect(buildGeneralBuildingValuation(a, "2026-02-16")).toBeUndefined();
  });

  it("⑧ 둘 다 실가는 요구하지 않는다(회귀 0)", () => {
    expect(validateGeneralBuildingAsset(gb({ ...noStd }), "자산 1", "2026-02-16")).toBeNull();
  });

  it("⑫ Zod — 환산 경로 payload의 감정 파트는 취득시 기준시가를 요구한다", () => {
    const base = buildGeneralBuildingValuation(gb({ landAcqMode: "appraisal" }), "2026-02-16") as Record<string, unknown>;
    expect(generalBuildingValuationSchema.safeParse(base).success).toBe(true);
    const bad = { ...base, acquisitionLandPricePerSqm: undefined };
    const r = generalBuildingValuationSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });

  it("⑫ Zod — `*SalesCaseValue`가 strip되지 않는다", () => {
    const base = buildGeneralBuildingValuation(
      gb({ landAcqMode: "salesCase", landSalesCaseValue: "350000000", landAcquisitionPrice: "" }),
      "2026-02-16",
    ) as Record<string, unknown>;
    const r = generalBuildingValuationSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>).landSalesCaseValue).toBe(350_000_000);
  });

  it("⑫ I2 — 매매사례 파트는 `landSalesCaseValue`를 요구한다(종전: 「이 칸을 읽지 않는다」며 제외)", () => {
    const base = buildGeneralBuildingValuation(
      gb({ landAcqMode: "salesCase", landSalesCaseValue: "350000000", landAcquisitionPrice: "" }),
      "2026-02-16",
    ) as Record<string, unknown>;
    const r = generalBuildingValuationSchema.safeParse({ ...base, landSalesCaseValue: undefined });
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// LEAF — partNeedsOwnAcqStd 리팩터 전후 주택 split 거동 동일
// ═══════════════════════════════════════════════════════════════════════
describe("LEAF partNeedsOwnAcqStd — requiresAcqStdPricePart 거동 동일성", () => {
  const MODES: PartAcqMode[] = ["actual", "estimated", "appraisal", "salesCase"];

  /** 리팩터 **전** 구현(동결 사본): 1절 `mode !== "actual"` + `needsApportionRatio`. */
  function legacy(
    part: "land" | "building",
    a: { landAcquisitionPrice?: string; buildingAcquisitionPrice?: string; expenses?: number; landDirectExpenses?: string; buildingDirectExpenses?: string },
    ctx: { landMode: PartAcqMode; buildingMode: PartAcqMode; isSeparate: boolean },
  ): boolean {
    const mode = part === "land" ? ctx.landMode : ctx.buildingMode;
    if (mode !== "actual") return true;
    const empty = (v?: string) => !v || v === "0";
    if (!ctx.isSeparate && empty(a.landAcquisitionPrice) && empty(a.buildingAcquisitionPrice)) return true;
    if ((a.expenses ?? 0) > 0 && empty(a.landDirectExpenses) && empty(a.buildingDirectExpenses)) return true;
    return false;
  }

  it("모드 4×4 × 별개취득 2 × 파트값 유무 2 × 비용 유무 2 전 조합이 리팩터 전 구현과 같다", () => {
    let n = 0;
    for (const landMode of MODES)
      for (const buildingMode of MODES)
        for (const isSeparate of [true, false])
          for (const hasPrice of [true, false])
            for (const hasExp of [true, false]) {
              const a = {
                landAcquisitionPrice: hasPrice ? "100" : "",
                buildingAcquisitionPrice: hasPrice ? "100" : "",
                expenses: hasExp ? 10 : 0,
                landDirectExpenses: "",
                buildingDirectExpenses: "",
              };
              for (const part of ["land", "building"] as const) {
                expect(requiresAcqStdPricePart(part, a, { landMode, buildingMode, isSeparate })).toBe(
                  legacy(part, a, { landMode, buildingMode, isSeparate }),
                );
                n++;
              }
            }
    expect(n).toBe(4 * 4 * 2 * 2 * 2 * 2);
  });

  it("leaf 자체 — actual만 거짓", () => {
    expect(MODES.map(partNeedsOwnAcqStd)).toEqual([false, true, true, true]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ENGINE — 일괄 총액 안분 (`applyPartAcqModes` bundled)
// ═══════════════════════════════════════════════════════════════════════
describe("ENGINE 분리 OFF 일괄 감정·매매사례 총액 안분", () => {
  const base = {
    acquisitionLandPricePerSqm: 1_500_000,
    landArea: 85,
    acquisitionBuildingStdPrice: 28_144_700,
  };
  const conv = { land: 111, building: 222 }; // 환산값 — 쓰이지 않아야 한다
  const ded = { land: LAND_DEDUCTION, building: BUILDING_DEDUCTION };

  it("감정 7억 → 573,421,388 / 126,578,612 · 개산공제 보존 · echo", () => {
    const r = applyPartAcqModes(
      { ...base, landAcqMode: "appraisal", buildingAcqMode: "appraisal", bundledAcquisitionPrice: 700_000_000 },
      conv,
      ded,
    );
    expect(r.acquisition).toEqual({ land: 573_421_388, building: 126_578_612 });
    expect(r.acquisition.land + r.acquisition.building).toBe(700_000_000);
    expect(r.estimatedDeduction).toEqual(ded);
    expect([r.landMode, r.buildingMode]).toEqual(["appraisal", "appraisal"]);
    expect(r.missingParts).toEqual([]);
  });

  it("매매사례 7억도 같은 안분", () => {
    const r = applyPartAcqModes(
      { ...base, landAcqMode: "salesCase", buildingAcqMode: "salesCase", bundledAcquisitionPrice: 700_000_000 },
      conv,
      ded,
    );
    expect(r.acquisition).toEqual({ land: 573_421_388, building: 126_578_612 });
  });

  it("2^53 초과 중간곱 — 총액 9조 × 토지 기준시가 8천억: BigInt 기준값과 ±0 동일", () => {
    const total = 9_000_000_000_000;
    const landStd = 800_000_000_000; // 8,000,000 원/㎡ × 100,000㎡
    const r = applyPartAcqModes(
      {
        acquisitionLandPricePerSqm: 8_000_000,
        landArea: 100_000,
        acquisitionBuildingStdPrice: 200_000_000_000,
        landAcqMode: "appraisal",
        buildingAcqMode: "appraisal",
        bundledAcquisitionPrice: total,
      },
      conv,
      ded,
    );
    const expectedLand = Number((BigInt(total) * BigInt(landStd)) / BigInt(landStd + 200_000_000_000));
    expect(r.acquisition.land).toBe(expectedLand);
    expect(r.acquisition.building).toBe(total - expectedLand);
  });

  it("취득시 기준시가가 0이면 조용히 0으로 메우지 않고 던진다(자동 안분 fallback 금지)", () => {
    expect(() =>
      applyPartAcqModes(
        { ...base, acquisitionBuildingStdPrice: 0, landAcqMode: "appraisal", buildingAcqMode: "appraisal", bundledAcquisitionPrice: 700_000_000 },
        conv,
        ded,
      ),
    ).toThrow(/나눌 수 없습니다/);
  });

  it("파트 값이 한쪽만 있으면 총액으로 메우지 않는다 — 반대 파트가 missingParts", () => {
    const r = applyPartAcqModes(
      { ...base, landAcqMode: "appraisal", buildingAcqMode: "appraisal", landAcquisitionPrice: 300_000_000, bundledAcquisitionPrice: 700_000_000 },
      conv,
      ded,
    );
    expect(r.missingParts).toEqual(["건물"]);
  });

  it("술어 진리표 — 증축·모드 불일치·실가/환산·파트 값 존재·총액 0은 모두 거짓", () => {
    const ok = { landAcqMode: "appraisal", buildingAcqMode: "appraisal", bundledAcquisitionPrice: 1 } as const;
    expect(usesBundledPartAcquisition(ok)).toBe(true);
    expect(usesBundledPartAcquisition({ ...ok, extensionInfo: {} })).toBe(false);
    expect(usesBundledPartAcquisition({ ...ok, buildingAcqMode: "salesCase" })).toBe(false);
    expect(usesBundledPartAcquisition({ ...ok, landAcqMode: "actual", buildingAcqMode: "actual" })).toBe(false);
    expect(usesBundledPartAcquisition({ ...ok, landAcqMode: "estimated", buildingAcqMode: "estimated" })).toBe(false);
    expect(usesBundledPartAcquisition({ ...ok, landAcquisitionPrice: 1 })).toBe(false);
    expect(usesBundledPartAcquisition({ ...ok, bundledAcquisitionPrice: 0 })).toBe(false);
    // 매매사례는 `*SalesCaseValue` 슬롯을 본다 — 감정 슬롯 값은 무관
    const sc = { landAcqMode: "salesCase", buildingAcqMode: "salesCase", bundledAcquisitionPrice: 1 } as const;
    expect(usesBundledPartAcquisition({ ...sc, landAcquisitionPrice: 5 })).toBe(true);
    expect(usesBundledPartAcquisition({ ...sc, landSalesCaseValue: 5 })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CARRY — 이월과세(§97의2) 파트 × 감정·매매사례 (Q-A 결정: 현행 유지 · 엔진 도달 시 거동 확인)
// ═══════════════════════════════════════════════════════════════════════
describe("CARRY 이월과세 토지 파트는 취득 모드와 무관하다 — 침묵 오계산 없음(서버 가드 불필요)", () => {
  /**
   * 이월과세 파트의 취득가액·필요경비는 시나리오 A(증여자 취득가액)·B(증여 당시 평가액)가 **통째로 교체**한다.
   * 따라서 그 파트에 감정·매매사례 모드가 도달해도 결과는 「환산」·「모드 없음」과 **원 단위로 같다** —
   * 사용자가 적은 감정가액이 조용히 다른 값으로 쓰이는 것이 아니라 **애초에 어느 경로에서도 읽히지 않는다**
   * (⑧ R8 — A2 — 이 UI에서 선택지를 숨기는 이유). 이 단언이 깨지면 이월과세 파트의 모드가 의미를 얻은 것이므로
   * 서버 가드(400) 여부를 다시 판정한다.
   */
  const carryBody = (extra: Record<string, unknown>) => ({
    propertyType: "general_building",
    transferDate: "2024-03-01",
    transferPrice: 1_000_000_000,
    acquisitionDate: "2021-03-01",
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    householdHousingCount: 2,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [],
    annualBasicDeductionUsed: 0,
    residencePeriodMonths: 0,
    generalBuildingValuation: {
      landArea: 100,
      buildingArea: 200,
      buildingFootprintArea: 50,
      transferLandPricePerSqm: 2_000_000,
      transferBuildingStdPrice: 200_000_000,
      zoneType: "general_residential",
      acquisitionLandPricePerSqm: 1_000_000,
      acquisitionBuildingStdPrice: 100_000_000,
      buildingAcquisitionCause: "purchase",
      landAcquisitionCause: "carryover_gift",
      landCarryoverTaxation: {
        giftRegistryDate: "2021-03-01",
        donorAcquisitionDate: "2005-06-15",
        donorAcquisitionPrice: 150_000_000,
        useEstimatedAcquisition: false,
        giftTaxAmount: 30_000_000,
        giftDateValuation: 400_000_000,
      },
      buildingAcqMode: "estimated",
      ...extra,
    },
  });
  async function call(extra: Record<string, unknown>) {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(carryBody(extra)),
      }),
    );
    const j = (await res.json()) as Json;
    return { status: res.status, tax: j.data?.aggregated?.determinedTax, land: j.data?.aggregated?.properties.find((p) => p.propertyId === "land") };
  }

  it("토지 파트 appraisal·salesCase = estimated — 결정세액·필요경비가 원 단위로 같다", async () => {
    const est = await call({ landAcqMode: "estimated" });
    const apr = await call({ landAcqMode: "appraisal", landAcquisitionPrice: 400_000_000 });
    const sal = await call({ landAcqMode: "salesCase", landSalesCaseValue: 400_000_000 });
    expect(est.status).toBe(200);
    expect(est.tax).toBe(155_532_000);
    expect(apr.status).toBe(200);
    expect(sal.status).toBe(200);
    expect(apr.tax).toBe(est.tax);
    expect(sal.tax).toBe(est.tax);
    expect(apr.land?.necessaryExpense).toBe(est.land?.necessaryExpense);
    expect(sal.land?.necessaryExpense).toBe(est.land?.necessaryExpense);
  });
});
