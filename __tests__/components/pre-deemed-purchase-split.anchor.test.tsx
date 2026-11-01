/**
 * anchor — 의제취득일 전 «매수» 토지·건물 취득일 분리 영 §176조의2④ (PR-3d · 경로 B · 계획서 §12.8)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §12.8
 *
 * 한 파트만 1985 전이면 그 파트만 비교한다(실가 파트 ② · 추계 파트 ①/②). 두 파트 모두 1985 전이면 비교 없이 안내.
 * 오라클: ②를 그 파트 실가로 직접 넣은 세액(mock 세율). 토지 1984.6. 실가 1억 → ② 101,411,574.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { NextRequest } from "next/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { preDeemedPurchaseOutOfScopeReason, runPreDeemedPurchaseStep } from "@/lib/tax-engine/transfer-pre-deemed-purchase";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { PreDeemedPurchaseCard } from "@/components/calc/transfer/PreDeemedPurchaseCard";
import { isPreDeemedPurchaseAsset, preDeemedPurchaseNotCompared } from "@/lib/calc/transfer-pre-deemed-purchase-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type A = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>;
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1000000000",
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
    ...extra,
  }) as TransferFormData;

async function check(f: TransferFormData) {
  const issue = [0, 1, 2, 3].map((st) => validateStepDetailed(st, f)).find(Boolean) ?? null;
  let body: Body = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "bundled", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: Body; error?: Body };
  return { issue, body, status: res.status, data: json.data ?? {}, error: json.error };
}
const asset = (o: A) => ({ ...makeDefaultAsset(1), ...o }) as AssetForm;

const HOUSE = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 5-1", assetKind: "housing", acquisitionCause: "purchase", transferType: "regular", hasSeperateLandAcquisitionDate: true, usePreHousingDisclosure: false,
  landAcquisitionDate: "1985-01-01", acquisitionDate: "1990-03-01", preDeemedOriginalLandAcquisitionDate: "1984-06-01",
  actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", landTransferPrice: "500,000,000", buildingTransferPrice: "500,000,000", saleSplitMode: "actual",
  landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "400,000,000",
  acquisitionArea: "200", transferArea: "200", houseSizeType: "regular", standardPriceAtTransfer: "500000000", landStandardPriceAtTransfer: "250000000", buildingStandardPriceAtTransfer: "250000000", ...o,
});
const res = (d: Body) => (d.result ?? d) as Body;

describe("한 파트만 1985 전 — 추계 파트 ①/②", () => {
  // 토지 환산: 파트 양도 5억 × 취득시 ㎡당 ÷ 양도시 — 1985 토지라 §164④ 등급 칸(1990.1.1. ㎡당 500,000 × 비율 1 × 200㎡ = 1억) · 양도시 2.5억 → ① 2억
  const EST: A = { landAcqMode: "estimated", landAcquisitionPrice: "", pre1990Enabled: true, pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "100000", pre1990PricePerSqm_1990: "500000", standardPricePerSqmAtAcq: "500000", standardPricePerSqmAtTransfer: "1250000" };
  it("함께 견줄 실가 3억 → ② 304,234,724 > ① · 토지 파트만 실가 · 개산공제 없음", async () => {
    const r = await check(mk([HOUSE({ ...EST, preDeemedActualPrice: "300,000,000" })]));
    expect(r.issue, JSON.stringify(r.issue)).toBeNull();
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    const d = res(r.data).preDeemedPurchaseDetail;
    expect(d.part).toBe("land");
    expect(d.clause1Method).toBe("estimated");
    expect(d.clause1Amount).toBeGreaterThan(0);
    expect(d.clause2Amount).toBe(304_234_724);
    expect(d.selected).toBe("clause2");
    const land = res(r.data).splitDetail.land;
    expect(land.acquisitionPrice).toBe(304_234_724);
    expect(land.appraisalDeduction).toBe(0);
    expect(res(r.data).splitDetail.building.acquisitionPrice).toBe(400_000_000);
  });
  it("함께 견줄 실가 1천만 → ① 채택 · 값 불변", async () => {
    const r = await check(mk([HOUSE({ ...EST, preDeemedActualPrice: "10,000,000" })]));
    const d = res(r.data).preDeemedPurchaseDetail;
    expect(d.selected).toBe("clause1");
    expect(res(r.data).splitDetail.land.acquisitionPrice).toBe(d.clause1Amount);
    const plain = await check(mk([HOUSE({ ...EST })]));
    expect(res(r.data).determinedTax).toBe(res(plain.data).determinedTax);
  });
});

describe("엔진 직접 호출 — 범위 방어선(값 불변 + 경고)", () => {
  const base = (o: A = {}) => baseTransferInput({
    propertyType: "building", transferPrice: 1_000_000_000, transferDate: new Date("2026-02-16"), acquisitionPrice: 500_000_000,
    acquisitionCause: "purchase", acquisitionDate: new Date("1990-03-01"), landAcquisitionDate: new Date("1985-01-01"), isSeparateAcquisition: true,
    landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 400_000_000,
    acquisitionArea: 200, transferArea: 200, standardPricePerSqmAtTransfer: 1_250_000, standardPricePerSqmAtAcquisition: 500_000,
    standardPriceAtTransfer: 500_000_000, buildingStandardPriceAtAcquisition: 100_000_000, buildingStandardPriceAtTransfer: 250_000_000,
    preDeemedPurchase: { part: "land", originalAcquisitionDate: new Date("1984-06-01") }, ...o,
  } as never) as TransferTaxInput;
  it("범위 안 — 사유 없음", () => {
    expect(preDeemedPurchaseOutOfScopeReason(base())).toBeUndefined();
  });
  it.each([
    ["두 칸 같은 날", { acquisitionDate: new Date("1985-01-01") }],
    ["그 파트 날짜가 의제취득일 아님", { landAcquisitionDate: new Date("1986-01-01") }],
    ["토지 원인 혼합", { landAcquisitionCause: "inheritance" }],
    ["소유자 분리", { selfOwns: "building_only" }],
    ["상가", { propertyType: "commercial_building" }],
  ] as [string, A][])("%s → 비교 없음 · 경고", (_n, o) => {
    const i = base(o);
    const out = preDeemedPurchaseOutOfScopeReason(i);
    expect(out).toBeTruthy();
    expect(runPreDeemedPurchaseStep(i, false)).toMatchObject({ applied: false });
  });
});

describe("한 파트만 1985 전", () => {
  it("토지 실가 1억 · 1984.6. — part land · ② 101,411,574 · 세액 = 토지 실가 ② 직접 입력", async () => {
    const r = await check(mk([HOUSE()]));
    expect(r.issue).toBeNull();
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(r.body.preDeemedPurchase).toEqual({ part: "land", originalAcquisitionDate: "1984-06-01" });
    const d = res(r.data).preDeemedPurchaseDetail;
    expect(d).toMatchObject({ part: "land", clause2Amount: 101_411_574, actualBase: 100_000_000, selected: "clause2" });
    expect(res(r.data).splitDetail.land.acquisitionPrice).toBe(101_411_574);
    expect(res(r.data).splitDetail.building.acquisitionPrice).toBe(400_000_000);
    const manual = await check(mk([HOUSE({ landAcquisitionPrice: "101,411,574", preDeemedOriginalLandAcquisitionDate: "1985-01-01" })]));
    expect(res(manual.data).preDeemedPurchaseDetail).toBeUndefined();
    expect(res(r.data).determinedTax).toBe(res(manual.data).determinedTax);
  });
  it("건물 실가 4억 · 1984.6. · 토지 1990 — part building", async () => {
    const r = await check(mk([HOUSE({ landAcquisitionDate: "1990-03-01", acquisitionDate: "1985-01-01", preDeemedOriginalLandAcquisitionDate: "", preDeemedOriginalAcquisitionDate: "1984-06-01" })]));
    expect(r.issue).toBeNull();
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(res(r.data).preDeemedPurchaseDetail).toMatchObject({ part: "building", clause2Amount: 405_646_299 });
    expect(res(r.data).splitDetail.building.acquisitionPrice).toBe(405_646_299);
    expect(res(r.data).splitDetail.land.acquisitionPrice).toBe(100_000_000);
  });
  it("건물 파트 감정 + 함께 견줄 실가 — 그 파트만 실가로 전환 · 개산공제 없음", async () => {
    const r = await check(mk([HOUSE({ landAcquisitionDate: "1990-03-01", acquisitionDate: "1985-01-01", preDeemedOriginalLandAcquisitionDate: "", preDeemedOriginalAcquisitionDate: "1984-06-01", buildingAcqMode: "appraisal", buildingAcquisitionPrice: "200,000,000", preDeemedActualPrice: "400,000,000", buildingStandardPriceAtAcq: "100000000", standardPricePerSqmAtAcq: "500000", standardPricePerSqmAtTransfer: "1250000" })]));
    expect(r.issue, JSON.stringify(r.issue)).toBeNull();
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(res(r.data).preDeemedPurchaseDetail).toMatchObject({ part: "building", clause1Amount: 200_000_000, clause1Method: "appraisal", clause2Amount: 405_646_299, selected: "clause2" });
    expect(res(r.data).splitDetail.building.acquisitionPrice).toBe(405_646_299);
    expect(res(r.data).splitDetail.building.appraisalDeduction).toBe(0);
  });
  it("실제 취득일 빈칸 → ⑧ 차단(토지 칸 field)", async () => {
    const r = await check(mk([HOUSE({ preDeemedOriginalLandAcquisitionDate: "" })]));
    expect(String((r.issue as { field?: string; message?: string }).message)).toContain("실제 취득일을 입력하세요");
  });
});

describe("함께 양도", () => {
  it("컴패니언 주택 토지 1984.6. — 요청 part land · 비교 내역", async () => {
    const LANDA: A = { addressJibun: "서울 강남구 테스트동 9-1", assetKind: "land", landNature: "standalone", acquisitionArea: "200", transferArea: "200", acquisitionCause: "purchase", actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", transferType: "regular", acquisitionDate: "2015-06-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "250000000" };
    const r = await check(mk([LANDA, HOUSE()], { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1500000000" }));
    expect(r.issue, JSON.stringify(r.issue)).toBeNull();
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(r.body.companionAssets[0].preDeemedPurchase).toEqual({ part: "land", originalAcquisitionDate: "1984-06-01" });
    expect(JSON.stringify(r.data)).toContain('"clause2Amount":101411574');
  });
});

describe("두 파트 모두 1985 전 · PHD", () => {
  const both: A = { landAcquisitionDate: "1985-01-01", acquisitionDate: "1985-01-01", preDeemedOriginalLandAcquisitionDate: "1980-03-01", preDeemedOriginalAcquisitionDate: "1984-06-01", landAcquisitionPrice: "", buildingAcquisitionPrice: "", fixedAcquisitionPrice: "500,000,000" };
  it.each([
    ["분리 ON 두 파트", both, false, true],
    ["분리 ON 두 파트 같은 달", { ...both, preDeemedOriginalLandAcquisitionDate: "1984-06-15" }, false, true],
    ["PHD 두 칸 취득월 다름", { ...both, usePreHousingDisclosure: true }, false, true],
    ["PHD 두 칸 같은 달", { ...both, usePreHousingDisclosure: true, preDeemedOriginalLandAcquisitionDate: "1984-06-15" }, true, false],
    ["PHD 토지 원값 없음(옛 저장값)", { ...both, usePreHousingDisclosure: true, preDeemedOriginalLandAcquisitionDate: "" }, true, false],
    ["토지 원인 혼합", { landCauseHost: "purchase", landAcquisitionCause: "inheritance" }, false, false],
    ["소유자 분리", { selfOwns: "building_only" }, false, false],
    ["상가", { assetKind: "commercial_building" }, false, false],
    ["겸용", { isMixedUseHouse: true }, false, false],
    ["부담부증여", { transferType: "burdened_gift" }, false, false],
    ["토지 1984 미덮어쓰기(칸 원값)", { landAcquisitionDate: "1984-06-01" }, false, false],
  ] as [string, A, boolean, boolean][])("%s → 카드 %s · 안내 %s", (_n, o, open, note) => {
    const a = asset(HOUSE(o));
    expect(isPreDeemedPurchaseAsset(a)).toBe(open);
    expect(preDeemedPurchaseNotCompared(a)).toBe(note);
  });
  it("분리 ON 두 파트 — 요청에 없음 · ⑧ 통과 · 안내 카드", async () => {
    const f = mk([HOUSE(both)]);
    const r = await check(f);
    expect(r.body.preDeemedPurchase).toBeUndefined();
    render(<PreDeemedPurchaseCard asset={f.assets[0]} onAssetChange={() => {}} />);
    expect(screen.getByTestId("pre-deemed-purchase-gb-not-compared").textContent).toContain("모두 1985.1.1. 전");
  });
});

describe("⑤ 카드 · ⑥ 사이드바", () => {
  it("토지 파트 — 라벨 · 토지 원값", () => {
    render(<PreDeemedPurchaseCard asset={asset(HOUSE())} onAssetChange={() => {}} />);
    const c = screen.getByTestId("pre-deemed-purchase-card");
    expect(c.textContent).toContain("토지 실제 취득일");
    expect(c.querySelector('[data-field="preDeemedOriginalLandAcquisitionDate"]')).toBeTruthy();
  });
  it("추계 토지 파트 — 함께 견줄 실가 칸", () => {
    render(<PreDeemedPurchaseCard asset={asset(HOUSE({ landAcqMode: "estimated" }))} onAssetChange={() => {}} />);
    expect(screen.getByTestId("pre-deemed-purchase-actual-price")).toBeTruthy();
  });
  it("사이드바 — 계산 전 계산 후 확정 · 계산 후 파트 합(② 단일 금액 아님)", async () => {
    const f = mk([HOUSE()]);
    expect(computeTransferPerAssetSummary(f, null).rows[0].acqPending).toBe(true);
    const r = await check(f);
    const after = computeTransferPerAssetSummary(f, { mode: "single", result: res(r.data) } as never).rows[0];
    expect(after.acqPending).toBe(false);
    expect(after.acqPrice).toBe(501_411_574);
  });
});

describe("일반건물 분리 ON — 파트 실가", () => {
  const GB2 = (o: A = {}): A => ({
    addressJibun: "서울 강남구 테스트동 3-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular", hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "1985-01-01", acquisitionDate: "1995-03-01", preDeemedOriginalLandAcquisitionDate: "1984-06-01", landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", gbLandArea: "205", gbBuildingArea: "200", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", ...o,
  });
  const det = (d: Body) => (d.aggregated ?? d.result?.aggregated ?? d.result)?.generalBuildingValuationDetail as Body;
  it("토지 1984.6. — 서브객체 part land · 토지 카드 ② · 건물 카드 그대로", async () => {
    const r = await check(mk([GB2()]));
    expect(r.issue).toBeNull();
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(r.body.generalBuildingValuation.preDeemedPurchase).toEqual({ part: "land", originalAcquisitionDate: "1984-06-01" });
    const d = det(r.data);
    expect(d.preDeemedPurchase).toMatchObject({ part: "land", clause2Amount: 101_411_574 });
    expect((d.assetCards as Body[]).reduce((s, c) => s + c.acquisitionPrice, 0)).toBe(501_411_574);
  });
  it("건물 1984.6. · 토지 1995 — part building", async () => {
    const r = await check(mk([GB2({ landAcquisitionDate: "1995-03-01", acquisitionDate: "1985-01-01", preDeemedOriginalLandAcquisitionDate: "", preDeemedOriginalAcquisitionDate: "1984-06-01" })]));
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(det(r.data).preDeemedPurchase).toMatchObject({ part: "building", clause2Amount: 405_646_299 });
    expect((det(r.data).assetCards as Body[]).reduce((s, c) => s + c.acquisitionPrice, 0)).toBe(505_646_299);
  });
  it("직접 호출 — part가 있는데 파트 실가 없이 일괄이면 총액을 바꾸지 않는다", async () => {
    const b = (await check(mk([GB2()]))).body;
    const { landAcquisitionPrice: _l, buildingAcquisitionPrice: _b, ...gbv } = b.generalBuildingValuation;
    const res2 = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...b, residencePeriodMonths: 0, acquisitionPrice: 500_000_000, generalBuildingValuation: gbv }),
    }));
    const j = (await res2.json()) as { data?: Body };
    if (res2.status === 200) {
      expect(det(j.data!).preDeemedPurchase).toBeUndefined();
      expect((det(j.data!).assetCards as Body[]).reduce((s, c) => s + c.acquisitionPrice, 0)).toBe(500_000_000);
    } else {
      expect(res2.status).toBe(400); // ⑫가 먼저 막아도 침묵 ②는 없다
    }
  });
  it("파트 환산 — 비교 안 함 · 안내", () => {
    const a = asset(GB2({ landAcqMode: "estimated" }));
    expect(isPreDeemedPurchaseAsset(a)).toBe(false);
    expect(preDeemedPurchaseNotCompared(a)).toBe(true);
  });
});
