/**
 * anchor — 일반건물 **파트별 감정가액·매매사례가액 (Phase A1 — 엔진·④ 측)**
 *
 * 설계: `docs/02-design/features/gb-part-appraisal-salescase.engine.design.md` · 계획서 §4 「A-통합」
 * Pre-Do: `transfer.route.gb-part-appraisal-salescase.predo.anchor.test.ts` (X1~X5 — 같은 수치)
 *
 * ## 이 파일이 잡는 것 (Pre-Do는 Route 직접 body, 여기는 **폼 → ④ → Route**)
 *
 *   P1~P4  폼에서 만든 body가 Route를 통과해 개산공제·안분·매매사례 값이 도달한다 (④·⑫·⑭ 배관)
 *   E3     분리 ON + stale 감정 플래그 → 200 (최상위 `acquisitionMethod`·`appraisalValue` 고정)
 *   S1     분리 OFF + stale 파트 모드 → 레거시 3플래그로 통일 (거동 변경 기록 — Q-A2 「전면」)
 *   QA3    증축 × 자산 단위 감정·매매사례 → 400 + 지정 문구, 분리 ON 파트 값은 통과(대조군)
 *   F7     지분 스케일에 `*SalesCaseValue` 포함
 *   E1     카드 `acquisitionMode` echo 4종
 *   PEN    §114조의2 — 감정 ≥2020 적용 · 감정 2019 미적용 · 매매사례 미적용 · 손실 경로 포함
 *   GUARD  부담부증여 stale 감정 플래그 → 실가 경로 유지
 *   LEAF   `gbPartModes`·`buildingPenaltyMethodApplies`
 *
 * 짝 파일 `transfer.route.gb-part-appraisal-salescase.a1b.anchor.test.ts` — SYNC(④⑧⑫ 술어 일치) · `partNeedsOwnAcqStd`
 * 동결 사본 대조 · 엔진 일괄 안분 · 이월과세. 800줄 정책으로 분리했다.
 *
 * 지정값은 ±0 동등성 단언(범위 금지). oracle = 「실가 경로 + 파트 직접귀속 필요경비 X」(Pre-Do 머리말).
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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { applyShareScale, buildGeneralBuildingShares } from "@/lib/calc/transfer-tax-api-gb-shares";
import { gbPartModes } from "@/lib/calc/transfer-tax-split-acq-mode";
import { buildingPenaltyMethodApplies } from "@/lib/tax-engine/transfer-tax-building-penalty";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

// ── 픽스처 — Pre-Do와 같은 시드(양도 20억 · 토지 1999-05-24 · 건물 2015-03-01) ─────────────────
const LAND_DEDUCTION = 3_825_000; // 1,500,000 × 85 × 3%
const BUILDING_DEDUCTION = 844_341; // 28,144,700 × 3%
const MSG_Q_A3 =
  "증축분이 있으면 원건물 취득가액을 감정가액·매매사례가액으로 산정할 수 없습니다. 「실거래가」 또는 「환산취득가」를 선택하세요.";

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

const form = (assets: AssetForm[], transferDate = "2026-02-16"): TransferFormData =>
  ({
    transferDate,
    filingDate: "2026-05-31",
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice: "2000000000",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

interface Card {
  propertyId: string;
  acquisitionPrice: number;
  expenses: number;
  acquisitionMode?: string;
  usedEstimatedAcquisition: boolean;
}
interface Prop {
  propertyId: string;
  acquisitionPrice: number;
  necessaryExpense: number;
  penaltyTax: number;
  penaltyBase: number;
}
interface Json {
  data?: {
    aggregated?: {
      determinedTax: number;
      properties: Prop[];
      generalBuildingValuationDetail?: { assetCards: Card[] };
    };
  };
  error?: { code: string; message: string; fieldErrors?: Record<string, string[]> };
}

/** 폼 → ④(`callTransferTaxAPI` body 캡처) → Route. 「화면에서 만든 body」가 서버에 도달하는 전 구간. */
async function run(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        annualBasicDeductionUsed: 0,
        ...cap.body,
        isOneHousehold: false,
        householdHousingCount: 0,
        residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as Json;
  return { status: res.status, body: cap.body!, json };
}
const agg = (r: { status: number; json: Json }) => {
  expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  return r.json.data!.aggregated!;
};
const prop = (r: { status: number; json: Json }, id: string) =>
  agg(r).properties.find((p) => p.propertyId === id)!;
const cardOf = (r: { status: number; json: Json }, id: string) =>
  agg(r).generalBuildingValuationDetail!.assetCards.find((c) => c.propertyId === id)!;
const gbvOf = (r: { body: Record<string, unknown> }) =>
  r.body.generalBuildingValuation as Record<string, unknown>;

// ═══════════════════════════════════════════════════════════════════════
// P — 폼 → ④ → Route 전 구간
// ═══════════════════════════════════════════════════════════════════════
describe("P 폼 → ④ → Route — 감정·매매사례 파트가 개산공제와 함께 도달한다", () => {
  it("P1 토지 감정 + 건물 실가 — 환산 경로로 라우팅(actualPriceMode 없음), 토지 개산공제 3,825,000 · 세액 = oracle", async () => {
    const oracle = await run(form([gb({ landDirectExpenses: String(LAND_DEDUCTION), buildingDirectExpenses: "0" })]));
    const r = await run(form([gb({ landAcqMode: "appraisal" })]));
    expect(gbvOf(r).actualPriceMode).toBeUndefined(); // D-1: 비-actual 파트가 있으면 실가 경로가 아니다
    expect(gbvOf(r).landAcqMode).toBe("appraisal");
    expect(prop(r, "land").necessaryExpense).toBe(LAND_DEDUCTION);
    expect(prop(r, "land").acquisitionPrice).toBe(300_000_000);
    expect(prop(r, "building").necessaryExpense).toBe(0);
    expect(agg(r).determinedTax).toBe(agg(oracle).determinedTax);
  });

  it("P2 토지 매매사례 3.5억 + 건물 실가 — `landSalesCaseValue`가 ⑫를 통과하고(strip 없음) 취득가액 350,000,000 · 개산공제 3,825,000", async () => {
    const r = await run(
      form([gb({ landAcqMode: "salesCase", landSalesCaseValue: "350000000", landAcquisitionPrice: "" })]),
    );
    expect(gbvOf(r).landSalesCaseValue).toBe(350_000_000);
    expect(prop(r, "land").acquisitionPrice).toBe(350_000_000);
    expect(prop(r, "land").necessaryExpense).toBe(LAND_DEDUCTION);
  });

  it("P3 건물 매매사례 + 토지 실가 — 대칭: 건물 취득가액 = 매매사례가액 · 개산공제 844,341", async () => {
    const r = await run(
      form([gb({ buildingAcqMode: "salesCase", buildingSalesCaseValue: "380000000", buildingAcquisitionPrice: "" })]),
    );
    expect(prop(r, "building").acquisitionPrice).toBe(380_000_000);
    expect(prop(r, "building").necessaryExpense).toBe(BUILDING_DEDUCTION);
    expect(prop(r, "land").necessaryExpense).toBe(0);
  });

  it("P4 분리 OFF 자산 단위 감정 7억 — 취득시 기준시가 비율 안분: 토지 573,421,388 / 건물 126,578,612, 개산공제 3,825,000 / 844,341", async () => {
    const r = await run(
      form([
        gb({
          hasSeperateLandAcquisitionDate: false,
          landAcquisitionDate: "2015-03-01",
          isAppraisalAcquisition: true,
          fixedAcquisitionPrice: "700000000",
          landAcqMode: "",
          buildingAcqMode: "",
          landAcquisitionPrice: "",
          buildingAcquisitionPrice: "",
        }),
      ]),
    );
    expect(gbvOf(r).bundledAcquisitionPrice).toBe(700_000_000);
    expect(gbvOf(r).landAcquisitionPrice).toBeUndefined();
    expect(prop(r, "land").acquisitionPrice).toBe(573_421_388);
    expect(prop(r, "building").acquisitionPrice).toBe(126_578_612);
    expect(prop(r, "land").necessaryExpense).toBe(LAND_DEDUCTION);
    expect(prop(r, "building").necessaryExpense).toBe(BUILDING_DEDUCTION);
  });

  it("P5 분리 OFF 자산 단위 매매사례 7억 — `similarSalesValue`가 같은 슬롯으로 안분", async () => {
    const r = await run(
      form([
        gb({
          hasSeperateLandAcquisitionDate: false,
          landAcquisitionDate: "2015-03-01",
          isSalesCaseAcquisition: true,
          similarSalesValue: "700000000",
          fixedAcquisitionPrice: "",
          landAcqMode: "",
          buildingAcqMode: "",
          landAcquisitionPrice: "",
          buildingAcquisitionPrice: "",
        }),
      ]),
    );
    expect(gbvOf(r).bundledAcquisitionPrice).toBe(700_000_000);
    expect(prop(r, "land").acquisitionPrice).toBe(573_421_388);
    expect(prop(r, "building").acquisitionPrice).toBe(126_578_612);
  });

  it("P6 둘 다 실가는 실가 경로 그대로(회귀 0) — actualPriceMode true · 개산공제 0 · 카드 echo actual", async () => {
    const r = await run(form([gb()]));
    expect(gbvOf(r).actualPriceMode).toBe(true);
    expect(prop(r, "land").necessaryExpense).toBe(0);
    expect(cardOf(r, "land").acquisitionMode).toBe("actual");
    expect(cardOf(r, "building").acquisitionMode).toBe("actual");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// E3 — 분리 ON + stale 레거시 감정 플래그 (G-3 막다른 길의 서버 방어선)
// ═══════════════════════════════════════════════════════════════════════
describe("E3 분리 ON에서 최상위 acquisitionMethod·appraisalValue를 싣지 않는다", () => {
  const stale = { isAppraisalAcquisition: true, fixedAcquisitionPrice: "" } as Partial<AssetForm>;

  it("🔴 stale `isAppraisalAcquisition` + 분리 ON(두 파트 실가) → body.acquisitionMethod = actual · appraisalValue 없음 · 200", async () => {
    const r = await run(form([gb(stale)]));
    expect(r.body.acquisitionMethod).toBe("actual");
    expect(r.body.appraisalValue).toBeUndefined();
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("🔴 stale `isSalesCaseAcquisition` + 분리 ON → similarSalesValue 없음 · 200", async () => {
    const r = await run(form([gb({ isSalesCaseAcquisition: true, similarSalesValue: "" } as Partial<AssetForm>)]));
    expect(r.body.acquisitionMethod).toBe("actual");
    expect(r.body.similarSalesValue).toBeUndefined();
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("대조군 — 분리 OFF 자산 단위 감정은 최상위 acquisitionMethod = appraisal을 그대로 싣는다(회귀 0)", async () => {
    const r = await run(
      form([
        gb({
          hasSeperateLandAcquisitionDate: false,
          landAcquisitionDate: "2015-03-01",
          isAppraisalAcquisition: true,
          fixedAcquisitionPrice: "700000000",
          landAcqMode: "",
          buildingAcqMode: "",
          landAcquisitionPrice: "",
          buildingAcquisitionPrice: "",
        }),
      ]),
    );
    expect(r.body.acquisitionMethod).toBe("appraisal");
    expect(r.body.appraisalValue).toBe(700_000_000);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// S1 — 분리 OFF의 stale 파트 모드 (Q-A2 「전면」 거동 변경 기록)
// ═══════════════════════════════════════════════════════════════════════
describe("S1 분리 OFF는 파트 라디오를 무시하고 레거시 3플래그로 통일한다", () => {
  it("🔄 분리 OFF + stale `landAcqMode:estimated` + 레거시 실가 → 환산 경로가 아니라 실가 경로 (종전: 환산 경로)", () => {
    const a = gb({
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2015-03-01",
      landAcqMode: "estimated",
      buildingAcqMode: "actual",
      fixedAcquisitionPrice: "700000000",
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
    });
    expect(gbPartModes(a)).toEqual({ land: "actual", building: "actual" });
    const p = buildGeneralBuildingValuation(a, "2026-02-16") as Record<string, unknown>;
    expect(p.actualPriceMode).toBe(true);
  });

  it("분리 ON은 종전과 같다 — explicit 우선, 비면 레거시 파생", () => {
    const on = (over: Partial<AssetForm>) => gbPartModes(gb({ hasSeperateLandAcquisitionDate: true, ...over }));
    expect(on({ landAcqMode: "appraisal", buildingAcqMode: "salesCase" })).toEqual({ land: "appraisal", building: "salesCase" });
    expect(on({ landAcqMode: "", buildingAcqMode: "", useEstimatedAcquisition: true })).toEqual({ land: "estimated", building: "estimated" });
  });

  it("분리 OFF 레거시 우선순위 — 매매사례 > 감정 > 환산 > 실가", () => {
    const off = (over: Partial<AssetForm>) => gbPartModes(gb({ hasSeperateLandAcquisitionDate: false, landAcqMode: "", buildingAcqMode: "", ...over }));
    expect(off({ isSalesCaseAcquisition: true, isAppraisalAcquisition: true, useEstimatedAcquisition: true })).toEqual({ land: "salesCase", building: "salesCase" });
    expect(off({ isAppraisalAcquisition: true, useEstimatedAcquisition: true })).toEqual({ land: "appraisal", building: "appraisal" });
    expect(off({ useEstimatedAcquisition: true })).toEqual({ land: "estimated", building: "estimated" });
    expect(off({})).toEqual({ land: "actual", building: "actual" });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// QA3 — 증축 × 자산 단위 감정·매매사례 서버 차단
// ═══════════════════════════════════════════════════════════════════════
describe("QA3 증축 × 자산 단위 감정·매매사례는 400 + 지정 문구", () => {
  /** ④가 만드는 모양 그대로(증축 spread의 `bundledAcquisitionPrice`) — 분리 OFF 자산 단위 모드. */
  function extBody(part: Record<string, unknown>) {
    return {
      propertyType: "general_building",
      transferPrice: 2_000_000_000,
      transferDate: "2026-02-16",
      acquisitionPrice: 0,
      acquisitionDate: "2015-03-01",
      expenses: 0,
      useEstimatedAcquisition: false,
      transferCause: "general",
      acquisitionMethod: "actual",
      landAcquisitionDate: "2015-03-01",
      isSeparateAcquisition: false,
      householdHousingCount: 1,
      householdRightCount: 0,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      acquisitionCause: "purchase",
      transferType: "regular",
      isOneHousehold: true,
      reductions: [],
      annualBasicDeductionUsed: 0,
      priorReductionUsage: [],
      specialHouseExclusions: [],
      generalBuildingValuation: {
        transferLandPricePerSqm: 10_830_000,
        transferBuildingStdPrice: 20_629_440,
        landArea: 85,
        buildingFootprintArea: 90.48,
        buildingAcquisitionDate: "2015-03-01",
        landAcquisitionDate: "2015-03-01",
        buildingAcquisitionCause: "purchase",
        isSelfBuilt: false,
        acquisitionLandPricePerSqm: 1_500_000,
        acquisitionBuildingStdPrice: 28_144_700,
        landAcquisitionCause: "purchase",
        zoneType: "commercial",
        isMetropolitan: false,
        unapprovedBuilding: false,
        unregisteredLand: false,
        unregisteredBuilding: false,
        bundledAcquisitionPrice: 700_000_000,
        extensionInfo: {
          extensionDate: "2020-06-01",
          extensionAcquisitionCause: "purchase",
          acquisitionMode: "actual",
          transferExtensionBuildingStdPrice: 5_000_000,
          actualAcquisitionPrice: 50_000_000,
          actualExpenses: 0,
        },
        ...part,
      },
    };
  }
  async function post(body: object) {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json()) as Json };
  }

  it("🔴 증축 + 자산 단위 감정(두 파트 appraisal · 파트 값 없음) → 400 · 지정 문구", async () => {
    const r = await post(extBody({ landAcqMode: "appraisal", buildingAcqMode: "appraisal" }));
    expect(r.status).toBe(400);
    const all = Object.values(r.json.error?.fieldErrors ?? {}).flat();
    expect(all).toContain(MSG_Q_A3);
  });

  it("🔴 증축 + 자산 단위 매매사례 → 400 · 지정 문구", async () => {
    const r = await post(extBody({ landAcqMode: "salesCase", buildingAcqMode: "salesCase" }));
    expect(r.status).toBe(400);
    expect(Object.values(r.json.error?.fieldErrors ?? {}).flat()).toContain(MSG_Q_A3);
  });

  it("대조군 1 — 증축 + 분리 ON 파트 감정(파트 값 있음)은 막지 않는다(Step 2.5가 처리)", async () => {
    const r = await post(
      extBody({
        landAcqMode: "appraisal",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 300_000_000,
        buildingAcquisitionPrice: 400_000_000,
      }),
    );
    expect(Object.values(r.json.error?.fieldErrors ?? {}).flat()).not.toContain(MSG_Q_A3);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("대조군 2 — 증축 + 실가는 막지 않는다(회귀 0)", async () => {
    const r = await post(extBody({ landAcqMode: "actual", buildingAcqMode: "actual" }));
    expect(Object.values(r.json.error?.fieldErrors ?? {}).flat()).not.toContain(MSG_Q_A3);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F7 — 지분 스케일
// ═══════════════════════════════════════════════════════════════════════
describe("F7 지분 스케일에 *SalesCaseValue 포함", () => {
  it("applyShareScale — 100% 기준 매매사례가액이 지분율만큼 축소된다", () => {
    const out = applyShareScale({ landSalesCaseValue: 350_000_000, buildingSalesCaseValue: 100_000_000 }, 0.5);
    expect(out.landSalesCaseValue).toBe(175_000_000);
    expect(out.buildingSalesCaseValue).toBe(50_000_000);
  });

  it("④ 지분 payload — 지분 50% 매매사례 파트: 취득시 기준시가·면적은 스케일하지 않는다", () => {
    const base = {
      assetKind: "general_building",
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      hasSeperateLandAcquisitionDate: true,
      acquisitionDate: "2015-03-01",
      landAcquisitionDate: "1999-05-24",
      landAcqMode: "salesCase",
      buildingAcqMode: "actual",
      landSalesCaseValue: "350000000",
      buildingAcquisitionPrice: "400000000",
      gbLandArea: "85",
      gbBuildingFootprintArea: "90.48",
      gbBuildingArea: "180.96",
      gbZoneType: "commercial",
      gbTransferLandPricePerSqm: "10830000",
      gbTransferBuildingValue: "20629440",
      gbAcqLandPricePerSqm: "1500000",
      gbAcqBuildingValue: "28144700",
    } as Partial<AssetForm>;
    const a = gb({ ...base, assetId: "a", ownershipNumerator: "50", ownershipDenominator: "100" });
    const b = gb({ ...base, assetId: "b", ownershipNumerator: "50", ownershipDenominator: "100" });
    const shares = buildGeneralBuildingShares([a, b], "2026-02-16");
    expect(shares).toBeDefined();
    expect(shares![0].valuation.landSalesCaseValue).toBe(175_000_000);
    expect(shares![0].valuation.buildingAcquisitionPrice).toBe(200_000_000);
    expect(shares![0].valuation.acquisitionLandPricePerSqm).toBe(1_500_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// E1 — 카드 acquisitionMode echo 4종
// ═══════════════════════════════════════════════════════════════════════
describe("E1 카드 acquisitionMode echo", () => {
  it("환산·감정·매매사례·실가 4종이 각 파트 카드에 실린다(환산 경로)", async () => {
    // 토지 감정 + 건물 매매사례
    const r1 = await run(
      form([
        gb({
          landAcqMode: "appraisal",
          buildingAcqMode: "salesCase",
          buildingSalesCaseValue: "380000000",
          buildingAcquisitionPrice: "",
        }),
      ]),
    );
    expect(cardOf(r1, "land").acquisitionMode).toBe("appraisal");
    expect(cardOf(r1, "building").acquisitionMode).toBe("salesCase");
    // 토지 환산 + 건물 실가
    const r2 = await run(form([gb({ landAcqMode: "estimated", landAcquisitionPrice: "" })]));
    expect(cardOf(r2, "land").acquisitionMode).toBe("estimated");
    expect(cardOf(r2, "building").acquisitionMode).toBe("actual");
    expect(cardOf(r2, "land").usedEstimatedAcquisition).toBe(true);
    // 감정 카드는 환산이 아니다(boolean 플래그만으로는 구별 불가 — echo가 필요한 이유)
    expect(cardOf(r1, "land").usedEstimatedAcquisition).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PEN — §114조의2 (Q-A5 · E-4)
// ═══════════════════════════════════════════════════════════════════════
describe("PEN §114조의2 — 건물 파트 감정가액", () => {
  const NEW_BUILD = {
    buildingAcqMode: "appraisal",
    buildingAcquisitionPrice: "400000000",
    gbBuildingAcquisitionCause: "newConstruction",
    acquisitionDate: "2023-03-01",
  } as Partial<AssetForm>;

  it("🔴 감정 + 신축 5년 이내 + 양도 ≥ 2020-01-01 → 가산세 = 건물 감정가액 × 5% = 20,000,000 (건물 손실 경로 포함)", async () => {
    const r = await run(form([gb(NEW_BUILD)]));
    expect(prop(r, "building").penaltyBase).toBe(400_000_000);
    expect(prop(r, "building").penaltyTax).toBe(20_000_000);
    // 토지 카드는 §114조의2 대상이 아니다
    expect(prop(r, "land").penaltyTax).toBe(0);
  });

  it("건물이 이익인 경우(정상 경로)도 같은 가산세 — 건물 양도시 기준시가를 키워 건물 차익을 양수로", async () => {
    const r = await run(
      form([gb({ ...NEW_BUILD, buildingAcquisitionPrice: "100000000", gbTransferBuildingValue: "900000000" })]),
    );
    expect(prop(r, "building").penaltyBase).toBe(100_000_000);
    expect(prop(r, "building").penaltyTax).toBe(5_000_000);
  });

  it("매매사례 + 신축 5년 이내 → 가산세 없음(조문 문언 「감정가액 또는 환산취득가액」)", async () => {
    const r = await run(
      form([
        gb({
          ...NEW_BUILD,
          buildingAcqMode: "salesCase",
          buildingSalesCaseValue: "400000000",
          buildingAcquisitionPrice: "",
        }),
      ]),
    );
    expect(prop(r, "building").penaltyTax).toBe(0);
    expect(prop(r, "building").penaltyBase).toBe(0);
  });

  it("감정 + 양도일 2019-12-31(감정 게이트 2020-01-01 직전) → 가산세 없음", async () => {
    const r = await run(form([gb({ ...NEW_BUILD, acquisitionDate: "2018-06-01" })], "2019-12-31"));
    expect(prop(r, "building").penaltyTax).toBe(0);
  });

  it("감정 + 양도일 2020-01-01 → 가산세 20,000,000 (경계 +1일)", async () => {
    const r = await run(form([gb({ ...NEW_BUILD, acquisitionDate: "2018-06-01" })], "2020-01-01"));
    expect(prop(r, "building").penaltyTax).toBe(20_000_000);
  });

  it("토지 감정은 가산세 대상이 아니다", async () => {
    const r = await run(form([gb({ landAcqMode: "appraisal", gbBuildingAcquisitionCause: "newConstruction", acquisitionDate: "2023-03-01" } as Partial<AssetForm>)]));
    expect(prop(r, "land").penaltyTax).toBe(0);
    expect(prop(r, "building").penaltyTax).toBe(0); // 건물은 실가
  });

  it("E-4 leaf — 환산 ≥2018-01-01 · 감정 ≥2020-01-01 · 매매사례·실가 대상 아님 (경계 ±1일)", () => {
    const d = (s: string) => new Date(s);
    expect(buildingPenaltyMethodApplies("estimated", d("2017-12-31"))).toBe(false);
    expect(buildingPenaltyMethodApplies("estimated", d("2018-01-01"))).toBe(true);
    expect(buildingPenaltyMethodApplies("appraisal", d("2019-12-31"))).toBe(false);
    expect(buildingPenaltyMethodApplies("appraisal", d("2020-01-01"))).toBe(true);
    expect(buildingPenaltyMethodApplies("salesCase", d("2026-01-01"))).toBe(false);
    expect(buildingPenaltyMethodApplies("actual", d("2026-01-01"))).toBe(false);
    expect(buildingPenaltyMethodApplies(undefined, d("2026-01-01"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GUARD — 부담부증여는 실가 경로 유지
// ═══════════════════════════════════════════════════════════════════════
describe("GUARD 부담부증여 + stale 감정 플래그 → 실가 경로(§159) 유지", () => {
  it("분리 OFF + 부담부증여 + stale 감정 → actualPriceMode true · bundledAcquisitionPrice 없음", () => {
    const a = gb({
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2015-03-01",
      transferType: "burdened_gift",
      isAppraisalAcquisition: true,
      fixedAcquisitionPrice: "700000000",
      landAcqMode: "",
      buildingAcqMode: "",
    });
    const p = buildGeneralBuildingValuation(a, "2026-02-16") as Record<string, unknown>;
    expect(p.actualPriceMode).toBe(true);
    expect(p.bundledAcquisitionPrice).toBeUndefined();
  });

  it("대조군 — 같은 입력에서 일반 매매(transferType regular)는 환산 경로", () => {
    const a = gb({
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2015-03-01",
      transferType: "regular",
      isAppraisalAcquisition: true,
      fixedAcquisitionPrice: "700000000",
      landAcqMode: "",
      buildingAcqMode: "",
    });
    const p = buildGeneralBuildingValuation(a, "2026-02-16") as Record<string, unknown>;
    expect(p.actualPriceMode).toBeUndefined();
    expect(p.bundledAcquisitionPrice).toBe(700_000_000);
  });
});
