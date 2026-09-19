/**
 * anchor — F-7 · 컴패니언 일반건물의 미등기(§104③)는 **토지·건물 2축**으로 엔진에 도달한다.
 *
 * ## 결함 (재현 2026-09-19)
 *
 * 컴패니언 ① 기본정보는 종류와 무관하게 단일 「미등기 양도」 토글(`asset.isUnregistered`)을
 * 띄웠다. 그런데 route GB 분기(`bundled-split-helpers.ts`)는 `generalBuildingValuation`의
 * `unregisteredLand`·`unregisteredBuilding`만 `buildProperties`에 넘긴다 — 단일 값은 읽히지 않는다.
 *
 * | 입력 | 총결정세액 |
 * |---|---|
 * | 끔 | 184,140,000 |
 * | 단일 토글 켬(종전 UI) | **184,140,000** ← 끈 것과 같다 |
 * | 토지·건물 2축 켬 | 310,271,500 |
 *
 * ## 수정
 * ⑤ 일반건물 컴패니언은 토지·건물 2축 토글을 받는다(주 자산 `SpecialSituationSection`과 같은 축).
 * 옛 기록에 남은 단일 값은 ⑧(`validateAssetEntry`)·⑩(`refineCompanionGbUnregisteredAxis`)이 막는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { baseCardId } from "@/lib/tax-engine/general-building-share-id";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Prop = { propertyId: string; appliedRate?: number; longTermHoldingDeduction?: number };
type Agg = { totalTax?: number; properties?: Prop[] };

async function pipeline(form: TransferFormData) {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(captured),
      headers: { "content-type": "application/json" },
    }),
  );
  const json = (await res.json()) as { data?: { aggregated?: Agg }; error?: unknown };
  return { status: res.status, json, agg: json.data?.aggregated ?? {} };
}

/** 일반건물 — 환산 경로. `transfer.route.companion-general-building.anchor.test.ts`와 같은 고정값. */
const GB_FIELDS = {
  assetKind: "general_building",
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  buildingAcqMode: "estimated",
  gbLandArea: "200",
  gbBuildingFootprintArea: "100",
  gbZoneType: "commercial",
  gbBuildingArea: "300",
  gbTransferLandPricePerSqm: "1500000",
  gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "750000",
  gbAcqBuildingValue: "100000000",
};

function asset(i: number, over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-1`,
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

/** primary 주택 + companion 일반건물(over로 미등기 축을 바꾼다). */
function bundledForm(companionOver: Record<string, unknown> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [asset(1), asset(2, { ...GB_FIELDS, standardPriceAtTransfer: "500000000", ...companionOver })],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as TransferFormData;
}

function gbCard(agg: Agg, base: "land" | "building") {
  const c = (agg.properties ?? []).find((p) => p.propertyId !== "primary" && baseCardId(p.propertyId) === base);
  expect(c, `GB ${base} 카드가 없다 — 파트 확장 미실행`).toBeDefined();
  return c!;
}

const F7_MSG = /일반건물은 토지·건물의 미등기를 따로 고릅니다/;

describe("F-7 컴패니언 일반건물 미등기 2축", () => {
  it("F7-1 대조군 — 미등기 없음 184,140,000 · 두 파트 모두 일반세율", async () => {
    const r = await pipeline(bundledForm());
    expect(r.status).toBe(200);
    expect(r.agg.totalTax).toBe(184_140_000);
    expect(gbCard(r.agg, "land").appliedRate).toBe(0.35);
    expect(gbCard(r.agg, "building").appliedRate).toBe(0.35);
  });

  it("F7-2 토지만 미등기 — 토지 카드만 70%·장기보유공제 0, 건물 카드는 그대로", async () => {
    const r = await pipeline(bundledForm({ gbLandUnregistered: true }));
    expect(r.status).toBe(200);
    const land = gbCard(r.agg, "land");
    const bld = gbCard(r.agg, "building");
    expect(land.appliedRate).toBe(0.7);
    expect(land.longTermHoldingDeduction).toBe(0);
    expect(bld.appliedRate).not.toBe(0.7);
    expect(bld.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("F7-3 토지·건물 모두 미등기 — 310,271,500 (대조군과 다르다)", async () => {
    const r = await pipeline(bundledForm({ gbLandUnregistered: true, gbBuildingUnregistered: true }));
    expect(r.status).toBe(200);
    expect(r.agg.totalTax).toBe(310_271_500);
    expect(gbCard(r.agg, "land").appliedRate).toBe(0.7);
    expect(gbCard(r.agg, "building").appliedRate).toBe(0.7);
  });

  it("F7-4 옛 단일 값 — ⑧이 막고, 그대로 보내면 ⑩이 400으로 거부한다(조용히 빠지지 않는다)", async () => {
    const form = bundledForm({ isUnregistered: true });
    const msgs = collectStepIssues(0, form).map((i) => i.message);
    expect(msgs.some((m) => F7_MSG.test(m)), JSON.stringify(msgs)).toBe(true);
    const r = await pipeline(form);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toMatch(/unregisteredLand·unregisteredBuilding/);
  });

  it("F7-5 (긍정 짝) 일반건물이 아닌 컴패니언은 단일 값이 그대로 70%로 도달한다", async () => {
    const plain = (over: Record<string, unknown>) =>
      ({
        ...createDefaultTransferFormData(),
        assets: [asset(1), asset(2, over)],
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1200000000",
        householdHousingCount: "2",
      }) as TransferFormData;
    const on = plain({ isUnregistered: true });
    expect(collectStepIssues(0, on).map((i) => i.message).some((m) => F7_MSG.test(m))).toBe(false);
    const r = await pipeline(on);
    expect(r.status).toBe(200);
    const companion = (r.agg.properties ?? []).find((p) => p.propertyId !== "primary");
    expect(companion?.appliedRate).toBe(0.7);
  });

  it("F7-6 지분 분할(축 B)은 ⑧이 보지 않는다 — 그 컴패니언은 ① 기본정보가 숨겨져 해소 경로가 없다", () => {
    const form = bundledForm({ isUnregistered: true, ownershipNumerator: "40", ownershipDenominator: "100" });
    form.assets[0] = { ...form.assets[0], ...GB_FIELDS, ownershipNumerator: "60", ownershipDenominator: "100" } as never;
    const msgs = collectStepIssues(0, form).map((i) => i.message);
    expect(msgs.some((m) => F7_MSG.test(m)), JSON.stringify(msgs)).toBe(false);
  });

  it("F7-7 주 자산 일반건물의 자산-수준 값은 ⑧이 보지 않는다 — 주 자산은 Step4 2축이 정본", () => {
    const form = bundledForm();
    form.assets = [
      { ...asset(1, { ...GB_FIELDS }), isUnregistered: true } as never,
      asset(2) as never,
    ];
    const msgs = collectStepIssues(0, form).map((i) => i.message);
    expect(msgs.some((m) => F7_MSG.test(m)), JSON.stringify(msgs)).toBe(false);
  });
});
