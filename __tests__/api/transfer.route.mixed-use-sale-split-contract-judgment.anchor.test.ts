/**
 * 공유지분 겸용주택 §100③ — 계약서(100%) 금액으로 판정하고 결론만 지분에 적용 (2026-10-23)
 *
 * 계획서: `docs/00-pm/sale-split-100-3-share-scale-judgment.plan.md` PR-3 (Q-1 a · Q-2 a · Q-3 a).
 * ④(`buildMixedSaleSplitFields`) → route POST(⑫ strip·⑭ 도달) → 엔진(`resolveMixedSaleSplit`).
 *
 * 시료: 교재 p.772 겸용(`transfer.route.mixed-use-sale-split-basis` R-0) · 총 2억 · 양도시 기준시가 토지 1억 / 건물 90,000,003
 * (상가건물 63,000,003 — 원래 63,000,000에서도 갈린다). 100% 안분 건물 94,736,844 → +30% 경계 근처 계약서.
 *   A. 1/3 · 토지 76,842,102 / 건물 123,157,898 — 100% 「불분명」, 종전 지분 판정 「구분 기재 적용」
 *   B. 2/3 · 토지 76,842,103 / 건물 123,157,897 — 100% 「구분 기재 적용」, 종전 지분 판정 「불분명」
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

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
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { resolveMixedSaleSplit } from "@/lib/tax-engine/mixed-use-sale-split";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedSaleSplitResult } from "@/lib/tax-engine/types/transfer-mixed-use-sale-split.types";

const T = 200_000_000;
const A = { r: 1 / 3, land: 76_842_102, building: 123_157_898 };
const B = { r: 2 / 3, land: 76_842_103, building: 123_157_897 };

function body(r: number, extra: Record<string, unknown> = {}) {
  return {
    transferPrice: applyRatio(T, r),
    ...(r < 1 ? { ownershipRatio: r, totalPropertyTransferPrice: T } : {}),
    acquisitionPrice: 120_000_000,
    acquisitionDate: "2023-03-20",
    transferDate: "2026-07-01",
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    residencePeriodMonths: 36,
    propertyType: "mixed-use-house" as const,
    mixedUse: {
      isMixedUseHouse: true as const,
      residentialFloorArea: 30,
      nonResidentialFloorArea: 70,
      buildingFootprintArea: 100,
      totalLandArea: 400,
      landAcquisitionDate: "2020-12-01",
      buildingAcquisitionDate: "2023-03-20",
      transferStandardPrice: { housingPrice: 57_000_000, housingBuildingPrice: 27_000_000, commercialBuildingPrice: 63_000_003, landPricePerSqm: 250_000 },
      acquisitionStandardPrice: {
        housingBuildingPrice: 18_000_000, commercialBuildingPrice: 42_000_000, landPricePerSqm: 100_000, landPricePerSqmAtBuildingAcq: 100_000,
      },
      separateAcquisition: { landMode: "actual", buildingMode: "actual", landAcquisitionPrice: 50_000_000, buildingAcquisitionPrice: 70_000_000 },
      residencePeriodYears: 3,
      isOneHouseExempt: true,
      isMetropolitanArea: false,
      zoneType: "agriculture_forest" as const,
      ...extra,
    },
  };
}

/** ④가 만드는 지분 와이어 — 토지 지분 몫 · 건물 잔액 · 계약서(100%) 금액. `contract: false`면 종전 와이어. */
function declared(s: { r: number; land: number; building: number }, contract = true) {
  const land = applyRatio(s.land, s.r);
  return {
    landTransferPrice: land,
    buildingTransferPrice: applyRatio(T, s.r) - land,
    ...(contract ? { contractLandTransferPrice: s.land, contractBuildingTransferPrice: s.building } : {}),
  };
}

interface MixedResult {
  totalPayable: number;
  commercialPart: { landTransferPrice: number; buildingTransferPrice: number };
  saleSplit?: { basis: string; landBuilding: { land: number; building: number }; deemedUnclear?: { deemed: boolean; contract?: unknown } };
  saleSplitFallback?: { reason: string; deemedUnclear?: { deemed: boolean; contract?: unknown } };
}
async function post(payload: unknown) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }));
  return { status: res.status, json: (await res.json()) as { data?: { result: MixedResult }; error?: unknown } };
}
async function call(payload: unknown): Promise<MixedResult> {
  const { status, json } = await post(payload);
  expect(status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data!.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

describe("route — 계약서 금액으로 판정 · 금액은 지분 몫(Q-2 a)", () => {
  it("[A] 1/3 · 100% 「불분명」 → 기준시가 안분 · 세액 = 안분 모드", async () => {
    const legacy = await call(body(A.r, declared(A, false)));
    expect(legacy.saleSplit?.basis).toBe("declared"); // 종전 결함 재현

    const r = await call(body(A.r, declared(A)));
    expect(r.saleSplit).toBeUndefined();
    expect(r.saleSplitFallback?.reason).toBe("deemed_to_std");
    expect(r.saleSplitFallback?.deemedUnclear?.contract).toEqual({
      declared: { land: A.land, building: A.building },
      apportioned: { land: 105_263_156, building: 94_736_844 },
      ownershipRatio: A.r,
    });
    expect(r.totalPayable).toBe((await call(body(A.r))).totalPayable);
  });

  it("[B] 2/3 · 100% 「구분 기재 적용」 → 지분 몫 구분가액 · 세액 = 예외로 구분 기재를 강제한 값", async () => {
    const legacy = await call(body(B.r, declared(B, false)));
    expect(legacy.saleSplit).toBeUndefined(); // 종전 결함 재현 — 기준시가로 후퇴
    expect(legacy.saleSplitFallback?.reason).toBe("deemed_to_std");

    const r = await call(body(B.r, declared(B)));
    expect(r.saleSplit?.basis).toBe("declared");
    expect(r.saleSplit?.deemedUnclear?.deemed).toBe(false);
    const share = declared(B, false);
    expect(r.saleSplit?.landBuilding).toEqual({ land: share.landTransferPrice, building: share.buildingTransferPrice });
    expect(r.totalPayable).toBe((await call(body(B.r, { ...share, saleSplitExemption: "other_law" }))).totalPayable);
  });

  it("[C] 단독 소유는 계약서 금액이 와도 종전 판정(지분율 1) · 계약 echo 없음", async () => {
    const r = await call(body(1, { landTransferPrice: B.land, buildingTransferPrice: B.building, contractLandTransferPrice: B.land, contractBuildingTransferPrice: B.building }));
    expect(r.saleSplit?.basis).toBe("declared");
    expect(r.saleSplit?.deemedUnclear?.contract).toBeUndefined();
  });

  it("[⑫] 계약서 금액 한쪽만 · 지분 구분가액 없이 → 400", async () => {
    expect((await post(body(B.r, { ...declared(B), contractBuildingTransferPrice: undefined }))).status).toBe(400);
    expect((await post(body(B.r, { contractLandTransferPrice: B.land, contractBuildingTransferPrice: B.building }))).status).toBe(400);
  });
});

describe("④ — 공유지분일 때만 계약서(100%) 금액을 싣는다", () => {
  afterEach(() => vi.unstubAllGlobals());
  async function mixedUseBody(over: Partial<AssetForm>) {
    let sent: { mixedUse?: Record<string, unknown> } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "mixed-use", result: {} }) } as unknown as Response;
    }));
    const asset = {
      ...makeDefaultAsset(1), assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "purchase",
      acquisitionDate: "2023-03-20", landAcquisitionDate: "2020-12-01", hasSeperateLandAcquisitionDate: true,
      residentialFloorArea: "30", nonResidentialFloorArea: "70", buildingFootprintArea: "100", mixedUseTotalLandArea: "400",
      saleSplitMode: "actual", landTransferPrice: String(A.land), buildingTransferPrice: String(A.building), ...over,
    } as AssetForm;
    await callTransferTaxAPI({
      transferDate: "2026-07-01", assets: [asset], houses: [], presaleRights: [], contractTotalPrice: String(T), totalTransferExpense: "0",
    } as unknown as TransferFormData);
    return sent.mixedUse ?? {};
  }

  it("1/3 지분 → 지분 몫 + 계약서 금액", async () => {
    const mu = await mixedUseBody({ ownershipNumerator: "1", ownershipDenominator: "3" });
    expect(mu).toMatchObject(declared(A));
  });
  it("단독 소유 → 계약서 금액 키 없음", async () => {
    const mu = await mixedUseBody({});
    expect(mu.landTransferPrice).toBe(A.land);
    expect(mu).not.toHaveProperty("contractLandTransferPrice");
    expect(mu).not.toHaveProperty("contractBuildingTransferPrice");
  });
});

describe("엔진 — ±30% 경계 탐색: 지분 판정 = 100% 판정", () => {
  const std = { housingLand: 30_000_000, commercialLand: 70_000_000, housingBuilding: 27_000_000, commercialBuilding: 63_000_003 };
  const transferDate = new Date("2026-07-01");
  const deemed = (x: MixedSaleSplitResult) => (x.applies ? x.echo.deemedUnclear?.deemed : x.deemedUnclear?.deemed);

  it("지분 1/3·2/3·1/7·37/100", () => {
    const full = (land: number, building: number) => resolveMixedSaleSplit({ totalTransferPrice: T, transferDate, declared: { land, building }, transferStd: std });
    const apportionedBuilding = 94_736_844;
    let diverged = 0;
    for (const edge of [Math.floor((apportionedBuilding * 13) / 10), Math.floor((apportionedBuilding * 7) / 10)])
    for (const r of [1 / 3, 2 / 3, 1 / 7, 37 / 100]) {
      for (let b = edge - 20; b <= edge + 20; b++) {
        const land = T - b;
        const shareTotal = applyRatio(T, r);
        const shareLand = applyRatio(land, r);
        const share = { totalTransferPrice: shareTotal, transferDate, declared: { land: shareLand, building: shareTotal - shareLand }, transferStd: std };
        const expected = deemed(full(land, b));
        const now = resolveMixedSaleSplit({ ...share, contract: { land, building: b, ownershipRatio: r } });
        expect(deemed(now), `r=${r} b=${b}`).toBe(expected);
        if (now.applies) expect(now.echo.landBuilding).toEqual(share.declared);
        if (deemed(resolveMixedSaleSplit(share)) !== expected) diverged++;
      }
    }
    // 종전 결함이 이 구간에 실제로 있어야 의미가 있다.
    expect(diverged).toBeGreaterThan(0);
  });
});
