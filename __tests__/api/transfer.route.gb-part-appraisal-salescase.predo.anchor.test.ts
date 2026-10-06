/**
 * Pre-Do anchor — 일반건물 **파트별 감정가액·매매사례가액** (Phase A / G-2) — **A1 완료본**
 *
 * 설계서: `docs/02-design/features/gb-part-appraisal-salescase.engine.design.md` §2
 * 계획서: `docs/00-pm/transfer-split-acq-per-part-method.plan.md` §2.2 G-2 · §4 A1
 *
 * ## 이력
 *
 * - Pre-Do(2026-10-06 · base c47885ccd): 현행 결함을 **특성화**했다(A2·A3 = 「토지/건물 감정」 결정세액이
 *   「둘 다 실가」와 같은 300,333,515 · A4·A5 400 · A6 가산세 0)하고 기대 동작은 `it.skip`(X1~X5)으로 남겼다.
 * - **A1(엔진·API 측) 완료**: 결함 특성화 5건을 **반전**해 X1~X5로 켰다. 형제 안전망 A1(둘 다 실가 = 300,333,515)·
 *   O1·O2(oracle)는 그대로 남긴다 — 라우팅이 바뀌어도 「둘 다 실가」 경로는 불변이어야 한다.
 *
 * ## 기대값의 손계산 근거
 *
 * 「소득세법」 §97②2호 본문(그 밖의 경우) = 제1항제1호 **나목**(매매사례가액·감정가액·환산취득가액)의 금액
 * + 자산별 대통령령 금액. 「소득세법 시행령」 §163⑥ — 1호 토지 = 취득당시 개별공시지가 × 3/100,
 * 2호 나목 건물 = 취득당시 나목 가액 × 3/100 (미등기 3/1000). (KoreanLaw MST 290841·280405, 2026-10-06 본문 확인)
 *
 *   · 토지 개산공제 = 1,500,000원/㎡ × 85㎡ × 3% = 127,500,000 × 0.03 = **3,825,000**
 *   · 건물 개산공제 = 28,144,700 × 3%           = **844,341**
 *   · 감정·매매사례 파트는 자본적지출·양도비를 가산하지 않는다(§97②2호 본문 — 가산은 같은 항 1호 실지거래가액 갈래).
 *
 * ## 독립 oracle
 *
 * 「개산공제 X원」은 실가 경로의 **파트 직접 귀속 필요경비**(`landDirectExpenses` — P5, 이미 검증됨)로 X원을
 * 넣은 것과 세액 수학이 같다(양도차익에서 X를 더 빼는 것뿐). 그래서 oracle = 「실가 경로 + 직접귀속 X원」이다.
 * 기대값 테스트는 이 oracle의 결정세액과 **±0원 동등**을 단언한다(범위 단언 금지) + 손계산 절대값을 함께 고정한다.
 *
 * 경로: Route Handler `POST`를 직접 부른다 — ⑫ Zod(`generalBuildingValuationSchema`)를 거치므로 「Zod가 조용히
 * strip하는 필드」(매매사례 파트 값)도 잡힌다(메모리 `feedback_leaf_anchor_skips_zod_layer`).
 * 폼 → ④ → Route 전 구간은 `transfer.route.gb-part-appraisal-salescase.a1.anchor.test.ts`.
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

// ── 픽스처 — 감사 시드(양도 20억 · 토지 1999-05-24 · 건물 2015-03-01) ─────────────────────────
const LAND_STD_PER_SQM = 1_500_000;
const LAND_AREA = 85;
const BUILDING_ACQ_STD = 28_144_700;
const LAND_DEDUCTION = 3_825_000; // 1,500,000 × 85 × 3%
const BUILDING_DEDUCTION = 844_341; // 28,144,700 × 3%

interface GbPartOver {
  landAcqMode?: string;
  buildingAcqMode?: string;
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  landSalesCaseValue?: number;
  buildingSalesCaseValue?: number;
  landDirectExpenses?: number;
  buildingDirectExpenses?: number;
  /** 분리 OFF 자산 단위 감정·매매사례 총액 — ④가 `bundledAcquisitionPrice`로 싣는다(A1 F-2). */
  bundledAcquisitionPrice?: number;
  buildingAcquisitionCause?: string;
  buildingAcquisitionDate?: string;
}

/** 분리 ON(토지·건물 취득일 다름) 일반건물 body — UI 변환(④)이 만드는 모양. */
function splitBody(part: GbPartOver, top: Record<string, unknown> = {}) {
  const buildingDate = part.buildingAcquisitionDate ?? "2015-03-01";
  // A1 D-1 — ④는 하나라도 `actual`이 아니면 `actualPriceMode`를 싣지 않는다(환산 경로 = 개산공제 구조를 가진 유일한 경로).
  const allActual = (part.landAcqMode ?? "actual") === "actual" && (part.buildingAcqMode ?? "actual") === "actual";
  return {
    propertyType: "general_building",
    transferPrice: 2_000_000_000,
    transferDate: "2026-02-16",
    acquisitionPrice: 0,
    acquisitionDate: buildingDate,
    expenses: 0,
    useEstimatedAcquisition: false,
    transferCause: "general",
    acquisitionMethod: "actual",
    landAcquisitionDate: "1999-05-24",
    saleSplitMode: "apportioned",
    isSeparateAcquisition: true,
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
    ...top,
    generalBuildingValuation: {
      transferLandPricePerSqm: 10_830_000,
      transferBuildingStdPrice: 20_629_440,
      landArea: LAND_AREA,
      buildingFootprintArea: 90.48,
      ...(allActual ? { actualPriceMode: true } : {}),
      buildingAcquisitionDate: buildingDate,
      landAcquisitionDate: "1999-05-24",
      buildingAcquisitionCause: part.buildingAcquisitionCause ?? "purchase",
      isSelfBuilt: part.buildingAcquisitionCause === "newConstruction",
      acquisitionLandPricePerSqm: LAND_STD_PER_SQM,
      acquisitionBuildingStdPrice: BUILDING_ACQ_STD,
      landAcquisitionCause: "purchase",
      zoneType: "commercial",
      isMetropolitan: false,
      unapprovedBuilding: false,
      unregisteredLand: false,
      unregisteredBuilding: false,
      landAcqMode: part.landAcqMode ?? "actual",
      buildingAcqMode: part.buildingAcqMode ?? "actual",
      ...(part.landAcquisitionPrice !== undefined ? { landAcquisitionPrice: part.landAcquisitionPrice } : {}),
      ...(part.buildingAcquisitionPrice !== undefined ? { buildingAcquisitionPrice: part.buildingAcquisitionPrice } : {}),
      ...(part.bundledAcquisitionPrice !== undefined ? { bundledAcquisitionPrice: part.bundledAcquisitionPrice } : {}),
      ...(part.landSalesCaseValue !== undefined ? { landSalesCaseValue: part.landSalesCaseValue } : {}),
      ...(part.buildingSalesCaseValue !== undefined ? { buildingSalesCaseValue: part.buildingSalesCaseValue } : {}),
      ...(part.landDirectExpenses !== undefined ? { landDirectExpenses: part.landDirectExpenses } : {}),
      ...(part.buildingDirectExpenses !== undefined ? { buildingDirectExpenses: part.buildingDirectExpenses } : {}),
    },
  };
}

interface Prop {
  propertyId: string;
  acquisitionPrice: number;
  necessaryExpense: number;
  penaltyTax: number;
  penaltyBase: number;
}
interface Json {
  data?: { aggregated?: { determinedTax: number; totalTax: number; properties: Prop[] } };
  error?: { code: string; message: string; fieldErrors?: Record<string, string[]> };
}
async function post(body: object): Promise<{ status: number; json: Json }> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
function agg(r: { status: number; json: Json }) {
  expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  return r.json.data!.aggregated!;
}
const prop = (r: { status: number; json: Json }, id: string) =>
  agg(r).properties.find((p) => p.propertyId === id)!;

const ACTUAL_ACTUAL = { landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 400_000_000 };

// ═══════════════════════════════════════════════════════════════════════
// A. 현행 특성화 (활성) — base c47885ccd
// ═══════════════════════════════════════════════════════════════════════
describe("G-2 안전망 — 둘 다 실가는 실가 경로 그대로 (회귀 0)", () => {
  it("A1 기준선 · 둘 다 실가 — 결정세액 300,333,515 · 토지 필요경비 0", async () => {
    const r = await post(splitBody(ACTUAL_ACTUAL));
    expect(agg(r).determinedTax).toBe(300_333_515);
    expect(agg(r).totalTax).toBe(330_366_866);
    expect(prop(r, "land").necessaryExpense).toBe(0);
    expect(prop(r, "building").necessaryExpense).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// B. oracle (활성) — 「실가 경로 + 파트 직접귀속 필요경비 X」= 「감정 파트 + 개산공제 X」의 세액 수학
// ═══════════════════════════════════════════════════════════════════════
describe("oracle — 직접귀속 필요경비로 만든 기대 세액", () => {
  it("O1 토지 3,825,000 직접귀속 — 토지 필요경비 3,825,000 · 결정세액이 A1보다 작다", async () => {
    const r = await post(splitBody({ ...ACTUAL_ACTUAL, landDirectExpenses: LAND_DEDUCTION, buildingDirectExpenses: 0 }));
    expect(prop(r, "land").necessaryExpense).toBe(LAND_DEDUCTION);
    // 손계산: Δ소득금액 = 3,825,000 × (1 − 장특 30%) = 2,677,500 → 과세표준 800.6M대는 42% 구간(5억~10억)
    //         → Δ산출세액 = 2,677,500 × 0.42 = 1,124,550 → 300,333,515 − 1,124,550 = 299,208,965 (지정값 ±0)
    expect(agg(r).determinedTax).toBe(299_208_965);
  });

  it("O2 건물 844,341 직접귀속 — 건물 필요경비 844,341", async () => {
    const r = await post(splitBody({ ...ACTUAL_ACTUAL, landDirectExpenses: 0, buildingDirectExpenses: BUILDING_DEDUCTION }));
    expect(prop(r, "building").necessaryExpense).toBe(BUILDING_DEDUCTION);
    // 손계산: 건물은 차손(−356,162,578)이라 장특이 없다 → 필요경비 844,341은 차손을 그만큼 키워 토지 소득에서
    //         통산액이 늘어난다 → Δ산출세액 = 844,341 × 0.42 = 354,623.22 → 300,333,515 − 354,623 = 299,978,892
    expect(agg(r).determinedTax).toBe(299_978_892);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// C. 기대 동작 (A1 엔진 수정으로 GREEN — 종전 `it.skip` X1~X5 해제 + 결함 특성화 A2~A6 반전)
// ═══════════════════════════════════════════════════════════════════════
describe("G-2 기대 동작 — 비-actual 파트가 개산공제와 함께 도달한다", () => {
  it("X1 토지 감정 + 건물 실가 — 토지 개산공제 3,825,000 · 결정세액 299,208,965(= oracle)", async () => {
    const oracle = await post(splitBody({ ...ACTUAL_ACTUAL, landDirectExpenses: LAND_DEDUCTION, buildingDirectExpenses: 0 }));
    const r = await post(splitBody({ ...ACTUAL_ACTUAL, landAcqMode: "appraisal" }));
    expect(prop(r, "land").necessaryExpense).toBe(LAND_DEDUCTION);
    expect(prop(r, "land").acquisitionPrice).toBe(300_000_000);
    expect(prop(r, "building").necessaryExpense).toBe(0);
    expect(agg(r).determinedTax).toBe(agg(oracle).determinedTax);
    expect(agg(r).determinedTax).toBe(299_208_965); // 손계산 — 설계서 §2.3 X1
  });

  it("X2 건물 감정 + 토지 실가 — 건물 개산공제 844,341 · 결정세액 299,978,892(= oracle)", async () => {
    const oracle = await post(splitBody({ ...ACTUAL_ACTUAL, landDirectExpenses: 0, buildingDirectExpenses: BUILDING_DEDUCTION }));
    const r = await post(splitBody({ ...ACTUAL_ACTUAL, buildingAcqMode: "appraisal" }));
    expect(prop(r, "building").necessaryExpense).toBe(BUILDING_DEDUCTION);
    expect(prop(r, "land").necessaryExpense).toBe(0);
    expect(agg(r).determinedTax).toBe(agg(oracle).determinedTax);
    expect(agg(r).determinedTax).toBe(299_978_892); // 손계산 — 설계서 §2.3 X2
  });

  it("X3 토지 매매사례 + 건물 실가 — 취득가액 = 매매사례가액 350,000,000 · 개산공제 3,825,000 · 결정세액 284,508,965", async () => {
    const oracle = await post(
      splitBody({
        landAcquisitionPrice: 350_000_000,
        buildingAcquisitionPrice: 400_000_000,
        landDirectExpenses: LAND_DEDUCTION,
        buildingDirectExpenses: 0,
      }),
    );
    const r = await post(
      splitBody({
        landAcqMode: "salesCase",
        landSalesCaseValue: 350_000_000,
        buildingAcqMode: "actual",
        buildingAcquisitionPrice: 400_000_000,
      }),
    );
    expect(prop(r, "land").acquisitionPrice).toBe(350_000_000);
    expect(prop(r, "land").necessaryExpense).toBe(LAND_DEDUCTION);
    expect(agg(r).determinedTax).toBe(agg(oracle).determinedTax);
    expect(agg(r).determinedTax).toBe(284_508_965); // 손계산 — 설계서 §4.2 X3
  });

  it("X4 자산 단위 감정(분리 OFF) — 총액 7억을 취득시 기준시가로 안분(573,421,388 / 126,578,612) + 파트별 개산공제", async () => {
    // 안분: 토지 127,500,000 : 건물 28,144,700 (취득시 기준시가 — 「소득세법」 §100② 본문 「취득 당시」).
    // oracle = 실가 경로 총액 안분(`acquisitionPrice: 7억`) + 파트 직접귀속(개산공제 두 값).
    const common = { landAcquisitionDate: "2015-03-01", isSeparateAcquisition: false };
    const oracleBody = splitBody(
      { landDirectExpenses: LAND_DEDUCTION, buildingDirectExpenses: BUILDING_DEDUCTION },
      { acquisitionPrice: 700_000_000, ...common },
    );
    (oracleBody.generalBuildingValuation as Record<string, unknown>).landAcquisitionDate = "2015-03-01";
    // ④가 만드는 분리 OFF 자산 단위 감정 모양: 두 파트 모두 appraisal · 파트 값 없음 · 일괄 총액은 서브객체 `bundledAcquisitionPrice`.
    const body = splitBody(
      { landAcqMode: "appraisal", buildingAcqMode: "appraisal", bundledAcquisitionPrice: 700_000_000 },
      { acquisitionMethod: "appraisal", appraisalValue: 700_000_000, ...common },
    );
    (body.generalBuildingValuation as Record<string, unknown>).landAcquisitionDate = "2015-03-01";
    const [r, oracle] = [await post(body), await post(oracleBody)];
    expect(prop(r, "land").acquisitionPrice).toBe(573_421_388);
    expect(prop(r, "building").acquisitionPrice).toBe(126_578_612);
    expect(prop(r, "land").necessaryExpense).toBe(LAND_DEDUCTION);
    expect(prop(r, "building").necessaryExpense).toBe(BUILDING_DEDUCTION);
    expect(agg(r).determinedTax).toBe(agg(oracle).determinedTax);
  });

  it("X5 §114조의2 — 건물 감정 + 신축 5년 이내: 가산세 20,000,000 · base = 건물 감정가액 (건물 손실 경로 포함)", async () => {
    const r = await post(
      splitBody({
        ...ACTUAL_ACTUAL,
        buildingAcqMode: "appraisal",
        buildingAcquisitionCause: "newConstruction",
        buildingAcquisitionDate: "2023-03-01",
      }),
    );
    expect(prop(r, "building").penaltyBase).toBe(400_000_000);
    expect(prop(r, "building").penaltyTax).toBe(20_000_000);
  });
});
