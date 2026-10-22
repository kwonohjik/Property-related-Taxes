/**
 * 일반건물 의제취득일(1985.1.1.) 전 상속·증여 3자 max — 폼 → ⑧ → ④ → ⑫ Zod → ⑭ Route 전 구간 (PR-4).
 *
 * - ①② 필드(`landPreDeemedClauseA`·`buildingPreDeemedClauseA`)가 Zod에서 지워지지 않고 엔진에 닿는다(echo가 그 증거).
 * - 함께 양도 카드도 같은 재선택을 거친다(`buildGbPartCards`).
 * - ③ 분자(취득시 기준시가)가 빠진 직접 호출은 ⑫가 칸을 지목해 막는다 — ⑧은 같은 값을 영 §163⑨ 단서 ②로 이미 요구한다.
 *
 * 계획서: docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §15 · mock 세율.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { GB_PRE_DEEMED_NUMERATOR_MESSAGE } from "@/lib/tax-engine/general-building-pre-deemed";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

const T = 1_620_000_000;

/** 1980 상속 일반건물(분리 OFF) — 엔진 anchor `gb-pre-deemed-3way-max.anchor.test.ts`와 같은 시료. */
const INH: Partial<AssetForm> = {
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 1",
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  hasSeperateLandAcquisitionDate: false,
  landAcquisitionDate: "1980-05-01",
  acquisitionDate: "1980-05-01",
  decedentAcquisitionDate: "1970-01-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  publishedValueAtInheritance: "50000000",
  gbBuildingInheritedValue: "20000000",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "150000000",
  gbLandArea: "205",
  gbBuildingArea: "300",
  gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000",
  gbTransferBuildingValue: "259072400",
  actualSalePrice: String(T),
  ownershipNumerator: "100",
  ownershipDenominator: "100",
};

const LAND: Partial<AssetForm> = {
  assetKind: "land",
  addressJibun: "강원 홍천군 테스트리 1",
  acquisitionArea: "300",
  transferArea: "300",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "100000000",
  standardPriceAtTransfer: "150000000",
  actualSalePrice: "300000000",
};

const asset = (n: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;

const baseForm = (contract: number) => {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(contract);
  return f;
};

function single(...over: Partial<AssetForm>[]): TransferFormData {
  const f = baseForm(T);
  f.assets = [asset(1, INH, ...over)];
  return f;
}

/** 함께 양도 — 토지(매매) + 일반건물(1980 상속). */
function companion(): TransferFormData {
  const f = baseForm(T + 300_000_000);
  f.assetSplitMode = "companion" as never;
  f.bundledSaleMode = "actual";
  f.assets = [asset(1, LAND), asset(2, INH)];
  return f;
}

type Detail = {
  preDeemedAcquisition?: Record<string, { converted: number; adopted: string }>;
  assetCards?: { propertyType: string; acquisitionPrice: number; usedEstimatedAcquisition: boolean }[];
};
type Prop = { propertyId: string; acquisitionPrice: number; necessaryExpense: number };

async function capture(f: TransferFormData): Promise<Record<string, unknown>> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  return body as Record<string, unknown>;
}

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  return {
    status: res.status,
    error: json.error as { message: string; fieldErrors?: Record<string, string[]> } | undefined,
    detail: json.data?.aggregated?.generalBuildingValuationDetail as Detail | undefined,
    props: (json.data?.aggregated?.properties ?? []) as Prop[],
    tax: json.data?.aggregated?.calculatedTax as number | undefined,
  };
}

const issuesOf = (f: TransferFormData) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f));

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("R1 단건 — 폼 → ④ → Route", () => {
  it("⑧ 통과 · ①② 필드가 body에 실린다", async () => {
    const f = single();
    expect(issuesOf(f)).toEqual([]);
    const gbv = (await capture(f)).generalBuildingValuation as Record<string, unknown>;
    expect(gbv.landPreDeemedClauseA).toEqual({ reported: 50_000_000, sec164: 205_000_000 });
    expect(gbv.buildingPreDeemedClauseA).toEqual({ reported: 20_000_000, sec164: 150_000_000 });
  });

  it("Zod를 지나 엔진에 닿는다 — echo · ③ 채택 · 산출세액 314,470,228", async () => {
    const r = await post(await capture(single()));
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(r.detail?.preDeemedAcquisition?.land).toMatchObject({ converted: 239_016_745, adopted: "converted" });
    expect(r.detail?.preDeemedAcquisition?.building).toMatchObject({ converted: 174_890_301, adopted: "converted" });
    expect(r.detail?.assetCards?.every((c) => c.usedEstimatedAcquisition)).toBe(true);
    expect(r.tax).toBe(314_470_228);
  });

  it("1988 상속 — 필드·echo 없음(회귀 0)", async () => {
    const f = single({ landAcquisitionDate: "1988-05-01", acquisitionDate: "1988-05-01" });
    const body = await capture(f);
    expect((body.generalBuildingValuation as Record<string, unknown>).landPreDeemedClauseA).toBeUndefined();
    const r = await post(body);
    expect(r.status).toBe(200);
    expect(r.detail?.preDeemedAcquisition).toBeUndefined();
  });
});

describe("R2 함께 양도 — 일반건물 카드도 같은 재선택", () => {
  it("⑧ 통과 · 일반건물 토지 카드 취득가액 = 그 자산 몫 양도가액의 ③", async () => {
    const f = companion();
    expect(issuesOf(f)).toEqual([]);
    const r = await post(await capture(f));
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    const gbCards = r.props.filter((p) => /#/.test(p.propertyId));
    expect(gbCards.length).toBeGreaterThanOrEqual(2);
    // 상속 평가액 ① 5천만·②(205,000,000)이 아니라 ③(그 자산 양도가액 × 205,000,000 ÷ 1,389,442,400)이 들어간다
    const land = gbCards.find((p) => p.propertyId.includes("land"))!;
    expect(land.acquisitionPrice).toBe(239_016_745);
  });
});

describe("R4 지분 분할(축 B) — 비교 블록은 지분마다 달라 결과 detail에 싣지 않는다", () => {
  it("1/2 + 1/2 — 계산은 ③(지분 몫)이지만 detail.preDeemedAcquisition은 없다", async () => {
    const f = baseForm(T);
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" };
    f.assets = [asset(1, INH, half), asset(2, INH, half)];
    const r = await post(await capture(f));
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(r.detail?.preDeemedAcquisition).toBeUndefined();
    const lands = (r.detail?.assetCards ?? []).filter((c) => c.propertyType === "land");
    expect(lands).toHaveLength(2);
    expect(lands.every((c) => c.usedEstimatedAcquisition)).toBe(true);
  });
});

describe("R3 ⑫ — ③ 분자가 빠진 직접 호출은 칸을 지목해 막는다(⑧과 같은 값)", () => {
  const fieldIssue = (r: Awaited<ReturnType<typeof post>>, key: string) =>
    Object.entries(r.error?.fieldErrors ?? {}).find(([k]) => k.endsWith(key))?.[1] ?? [];

  it("토지 — acquisitionLandPricePerSqm 없음 → 400", async () => {
    const body = await capture(single());
    const gbv = { ...(body.generalBuildingValuation as Record<string, unknown>) };
    delete gbv.acquisitionLandPricePerSqm;
    const r = await post({ ...body, generalBuildingValuation: gbv });
    expect(r.status).toBe(400);
    expect(fieldIssue(r, "acquisitionLandPricePerSqm")).toContain(GB_PRE_DEEMED_NUMERATOR_MESSAGE.land);
  });

  it("건물 — acquisitionBuildingStdPrice 없음 → 400", async () => {
    const body = await capture(single());
    const gbv = { ...(body.generalBuildingValuation as Record<string, unknown>) };
    delete gbv.acquisitionBuildingStdPrice;
    const r = await post({ ...body, generalBuildingValuation: gbv });
    expect(r.status).toBe(400);
    expect(fieldIssue(r, "acquisitionBuildingStdPrice")).toContain(GB_PRE_DEEMED_NUMERATOR_MESSAGE.building);
  });

  it("⑧도 같은 두 값을 요구한다 — 화면 입력이 비면 ⑫까지 가지 않는다", () => {
    expect(issuesOf(single({ gbAcqLandPricePerSqm: "" })).map((i) => i.message).join()).toMatch(/취득시 토지 공시지가/);
    expect(issuesOf(single({ gbAcqBuildingValue: "" })).map((i) => i.message).join()).toMatch(/취득시 건물기준시가/);
  });
});
