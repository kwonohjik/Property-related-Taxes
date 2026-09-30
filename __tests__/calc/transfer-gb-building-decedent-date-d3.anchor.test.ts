/**
 * anchor — D3: 일반건물 **건물만 상속** — 건물의 피상속인 취득일 (2026-09-30 · 계획서
 * `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.1).
 *
 * ## 결함 (base `6f2f73c25` 실측)
 *
 * 분리 ON · 토지 매매(실가) · 건물 상속(실가)에서 건물의 피상속인 취득일을 받을 **칸이 없었다**
 * (토지 카드의 `CompanionAcqInheritanceBlock`은 토지가 상속일 때만 뜬다). 게다가 실가 경로
 * (`general-building-route-actual.ts`)는 API로 `buildingDecedentAcquisitionDate`를 보내도 **읽지 않고**
 * 토지의 `decedentAcquisitionDate`만 읽었다 — 환산 경로(`general-building-valuation.ts`)는 이미
 * `buildingDecedent ?? decedent`였다.
 *
 *   | 입력 | base | 수정 후 |
 *   |---|---|---|
 *   | 건물 피상속인 취득일 2000-01-01 (API) | 126,269,000 (무시 — 상속개시일 2023-06 기산 단기세율) | 94,061,000 |
 *   | 화면 입력 | 칸 없음 | ④가 싣는다 → 94,061,000 |
 *   | 비움 | ⑧ 통과 · 200 126,269,000 | ⑧ 차단 · ⑫ 400 + 경로 |
 *
 * ⚠️ 세액은 mock 세율표 실측값이다(정본 세액 아님).
 */
import { describe, it, expect, vi } from "vitest";
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Body = Record<string, unknown>;

/** 분리 ON · 토지 매매(실가 2억) · 건물 상속(2023-06, 평가액 9천만) · 양도 2024-03 */
const buildingOnly = (over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    addressJibun: "서울 강남구 역삼동 1",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2008-01-01",
    acquisitionDate: "2023-06-01",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "inheritance",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "200000000",
    gbBuildingInheritedValue: "90000000",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2000000",
    gbTransferBuildingValue: "200000000",
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: "100000000",
    gbZoneType: "general_residential",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    ...over,
  }) as AssetForm;

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "600000000",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

const issues = (a: AssetForm) => collectStepIssues(0, form(a)).map((i) => i.message);

async function uiBody(a: AssetForm): Promise<Body> {
  const cap: { body?: Body } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form(a));
  vi.unstubAllGlobals();
  return cap.body!;
}

type Json = { data?: { aggregated?: { totalTax?: number } }; error?: { fieldErrors?: Record<string, string[]> } };
async function post(body: Body) {
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
        ...body,
        isOneHousehold: false,
        householdHousingCount: 0,
        residencePeriodMonths: 0,
      }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
const gbv = (b: Body) => b.generalBuildingValuation as Body;
const withGb = (b: Body, patch: Body, ...drop: string[]) => {
  const g: Body = { ...gbv(b), ...patch };
  for (const k of drop) delete g[k];
  return { ...b, generalBuildingValuation: g };
};

const DECEDENT = "2000-01-01";

describe("D3 ⑤④⑭ — 건물 피상속인 취득일이 화면에서 엔진까지 간다", () => {
  it("④ 화면 입력을 `buildingDecedentAcquisitionDate`로 싣는다", async () => {
    const a = buildingOnly({ gbBuildingDecedentAcquisitionDate: DECEDENT });
    expect(issues(a)).toEqual([]);
    const b = await uiBody(a);
    expect(gbv(b).buildingDecedentAcquisitionDate).toBe(DECEDENT);
  });

  it("🔴 ⑭ 실가 경로가 그 값으로 건물 보유기간을 통산한다 — 94,061,000 (base 126,269,000 · 무시)", async () => {
    const b = await uiBody(buildingOnly({ gbBuildingDecedentAcquisitionDate: DECEDENT }));
    const r = await post(b);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(r.json.data?.aggregated?.totalTax).toBe(94_061_000);
  });

  it("🔴 환산 경로(토지 환산·건물 상속 실가)도 화면 입력이 닿는다 — 108,042,000 (칸이 없던 base 136,757,500)", async () => {
    const a = buildingOnly({
      landAcqMode: "estimated",
      landAcquisitionPrice: "",
      gbBuildingDecedentAcquisitionDate: DECEDENT,
    });
    expect(issues(a)).toEqual([]);
    const r = await post(await uiBody(a));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(r.json.data?.aggregated?.totalTax).toBe(108_042_000);
  });
});

describe("D3 ⑧·⑫ — 비우면 막는다 (종전 ⑧ 통과 · 200 + 단기세율)", () => {
  it("🔴 ⑧ — 건물 피상속인 취득일을 요구한다", () => {
    expect(issues(buildingOnly()).join()).toMatch(/건물 피상속인 취득일을 입력하세요/);
  });

  it("🔴 ⑫ — 비우면 400 + 정확한 경로", async () => {
    const b = await uiBody(buildingOnly({ gbBuildingDecedentAcquisitionDate: DECEDENT }));
    const r = await post(withGb(b, {}, "buildingDecedentAcquisitionDate"));
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain(
      "generalBuildingValuation.buildingDecedentAcquisitionDate",
    );
  });

  it("🟢 토지도 상속이면 토지의 피상속인 취득일로 충분하다 (엔진 fallback과 같은 규칙 — 3 layer)", async () => {
    const a = buildingOnly({
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: DECEDENT,
      publishedValueAtInheritance: "200000000",
      landAcquisitionPrice: "",
    });
    expect(issues(a)).toEqual([]);
    const b = await uiBody(a);
    expect(gbv(b).buildingDecedentAcquisitionDate).toBeUndefined();
    const r = await post(b);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});

describe("D3 stale — 화면에 칸이 없는 상태의 남은 값은 싣지 않는다", () => {
  it("분리 OFF로 되돌리면(칸이 사라짐) 남은 건물 값을 싣지 않는다", () => {
    const p = buildGeneralBuildingValuation(
      buildingOnly({
        hasSeperateLandAcquisitionDate: false,
        acquisitionCause: "inheritance",
        decedentAcquisitionDate: "1995-01-01",
        publishedValueAtInheritance: "200000000",
        gbBuildingDecedentAcquisitionDate: DECEDENT,
      }),
    ) as Body;
    expect(p.buildingDecedentAcquisitionDate).toBeUndefined();
    expect(p.decedentAcquisitionDate).toBe("1995-01-01");
  });

  it("건물 취득원인을 상속에서 바꾸면 남은 값을 싣지 않는다", () => {
    const p = buildGeneralBuildingValuation(
      buildingOnly({ gbBuildingAcquisitionCause: "purchase", buildingAcquisitionPrice: "90000000", gbBuildingDecedentAcquisitionDate: DECEDENT }),
    ) as Body;
    expect(p.buildingDecedentAcquisitionDate).toBeUndefined();
  });

  it("구 세션(필드 자체가 없음)에서도 ④·⑧이 깨지지 않는다", () => {
    const a = buildingOnly();
    delete (a as Partial<AssetForm>).gbBuildingDecedentAcquisitionDate;
    expect(() => buildGeneralBuildingValuation(a)).not.toThrow();
    expect(issues(a).join()).toMatch(/건물 피상속인 취득일을 입력하세요/);
  });
});
