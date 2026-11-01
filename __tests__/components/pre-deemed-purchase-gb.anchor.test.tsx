/**
 * anchor — 의제취득일 전 «매수» 일반건물 일괄취득 영 §176조의2④ (PR-3c · 경로 A · Q-8 a · Q-15 b)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §12.2·§12.5
 *
 * 일괄취득은 취득월이 하나라 안분 전 총액에 배율 1회. 실가 모드만 비교하고(①은 미산정) 환산·감정·매매사례는 안내만 둔다.
 * 시료: 양도 10억 · 실가 5억 · 1984.6. → ② = 5억 × 50.29 ÷ 49.59 = 507,057,874 · 오라클: ②를 실가로 직접 넣은 세액(mock 세율).
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

import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { GbResultBlocks } from "@/components/calc/results/transfer/GbResultBlocks";
import { PreDeemedPurchaseCard } from "@/components/calc/transfer/PreDeemedPurchaseCard";
import { gbPreDeemedPurchaseNotCompared, isPreDeemedPurchaseAsset } from "@/lib/calc/transfer-pre-deemed-purchase-form";

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

// 일반건물 · 매매 일괄 · 양도 10억 · 실가 5억 · 취득시 토지 1,000,000 × 205㎡ = 2.05억 · 건물 1.5억(토지 비율 57.7%)
const GB = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular",
  acquisitionDate: "1985-01-01", landAcquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", fixedAcquisitionPrice: "500,000,000",
  gbLandArea: "205", gbBuildingArea: "200", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
  ...o,
});
const tax = (d: Body) => (d.aggregated ?? d.result?.aggregated ?? d.result)?.determinedTax as number;
const detail = (d: Body) => (d.aggregated ?? d.result?.aggregated ?? d.result)?.generalBuildingValuationDetail as Body;

describe("⑧ → ④ → ⑫ → ⑭ → 엔진 (단건)", () => {
  it("실가 5억 · 1984.6. — 서브객체에 실제 취득일 · ② 507,057,874 안분 · 세액 = ② 직접 입력 결과", async () => {
    const r = await check(mk([GB()]));
    expect(r.issue).toBeNull();
    expect(r.body.preDeemedPurchase).toBeUndefined();
    expect(r.body.generalBuildingValuation.preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01" });
    expect(r.status).toBe(200);
    const d = detail(r.data);
    expect(d.preDeemedPurchase.clause2Amount).toBe(507_057_874);
    expect(d.preDeemedPurchase.actualBase).toBe(500_000_000);
    expect(d.bundledActualAcquisitionPrice).toBe(507_057_874);
    const cards = d.assetCards as Body[];
    expect(cards.reduce((s, c) => s + c.acquisitionPrice, 0)).toBe(507_057_874);

    const manual = await check(mk([GB({ fixedAcquisitionPrice: "507,057,874", preDeemedOriginalAcquisitionDate: "1985-01-01" })]));
    expect(detail(manual.data).preDeemedPurchase).toBeUndefined();
    expect(tax(r.data)).toBe(tax(manual.data));
    expect(tax(r.data)).toBeGreaterThan(0);
  });
  it("1963 · 배율 3.5 — ② = 5억 × 3.5", async () => {
    const r = await check(mk([GB({ preDeemedOriginalAcquisitionDate: "1963-05-01", preDeemedPpiRatio: "3.5", actualSalePrice: "3,000,000,000", fixedSalePrice: "3,000,000,000" })]));
    expect(r.body.generalBuildingValuation.preDeemedPurchase.ppiRatio).toBe(3.5);
    expect(detail(r.data).preDeemedPurchase.clause2Amount).toBe(1_750_000_000);
  });
  it("실제 취득일 빈칸(옛 저장값) → ⑧ 차단", async () => {
    const r = await check(mk([GB({ preDeemedOriginalAcquisitionDate: "" })]));
    expect(String((r.issue as { message?: string }).message)).toContain("실제 취득일을 입력하세요");
  });
  it("⑫ — 1985 이후 실제 취득일 직접 호출 400", async () => {
    const base = await check(mk([GB()]));
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...base.body, residencePeriodMonths: 0,
        generalBuildingValuation: { ...base.body.generalBuildingValuation, preDeemedPurchase: { originalAcquisitionDate: "1986-01-01" } } }),
    }));
    expect(res.status).toBe(400);
  });
});

describe("범위 게이트 (Q-8 a · Q-15 b)", () => {
  it.each([
    ["일괄 매매 실가", GB(), true, false],
    ["환산", GB({ useEstimatedAcquisition: true }), false, true],
    ["감정", GB({ isAppraisalAcquisition: true }), false, true],
    ["매매사례", GB({ isSalesCaseAcquisition: true }), false, true],
    ["분리 ON", GB({ hasSeperateLandAcquisitionDate: true }), false, false],
    ["증축", GB({ gbHasExtension: true }), false, false],
    ["건물 신축", GB({ gbBuildingAcquisitionCause: "newConstruction" }), false, false],
    ["상속", GB({ acquisitionCause: "inheritance" }), false, false],
    ["부담부증여", GB({ transferType: "burdened_gift" }), false, false],
    ["토지 날짜만 1985-01-01 아님", GB({ landAcquisitionDate: "1984-06-01" }), false, false],
    ["취득일 1990", GB({ acquisitionDate: "1990-01-01", landAcquisitionDate: "1990-01-01" }), false, false],
  ] as [string, A, boolean, boolean][])("%s → 카드 %s · 안내 %s", (_n, o, open, note) => {
    const a = asset(o);
    expect(isPreDeemedPurchaseAsset(a)).toBe(open);
    expect(gbPreDeemedPurchaseNotCompared(a)).toBe(note);
  });
  it("⑤ 카드 — 실가는 입력 카드 · 환산은 안내만", () => {
    render(<PreDeemedPurchaseCard asset={asset(GB())} onAssetChange={() => {}} />);
    expect(screen.getByTestId("pre-deemed-purchase-card")).toBeTruthy();
    expect(screen.queryByTestId("pre-deemed-purchase-gb-not-compared")).toBeNull();
    cleanup();
    render(<PreDeemedPurchaseCard asset={asset(GB({ useEstimatedAcquisition: true }))} onAssetChange={() => {}} />);
    expect(screen.queryByTestId("pre-deemed-purchase-card")).toBeNull();
    expect(screen.getByTestId("pre-deemed-purchase-gb-not-compared")).toBeTruthy();
  });
  it("환산 — 서브객체에 싣지 않는다(비교 없음 · 세액 현행)", async () => {
    const r = await check(mk([GB({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "" })]));
    expect(r.body.generalBuildingValuation.preDeemedPurchase).toBeUndefined();
    expect(r.issue).toBeNull();
  });
});

describe("함께 양도 · 지분 분할 — 같은 빌더", () => {
  const LANDA: A = { addressJibun: "서울 강남구 테스트동 9-1", assetKind: "land", landNature: "standalone", acquisitionArea: "200", transferArea: "200", acquisitionCause: "purchase", actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", transferType: "regular", acquisitionDate: "2015-06-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "250000000" };
  it("컴패니언 일반건물 — 카드 합 = ②", async () => {
    const r = await check(mk([LANDA, GB()], { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1500000000" }));
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    expect(r.body.companionAssets[0].generalBuildingValuation.preDeemedPurchase).toEqual({ originalAcquisitionDate: "1984-06-01" });
    const props = (r.data.result?.aggregated ?? r.data.aggregated).properties as Body[];
    const gbSum = props.filter((p) => p.propertyId !== "primary").reduce((s, p) => s + p.acquisitionPrice, 0);
    expect(gbSum).toBe(507_057_874);
    expect(JSON.stringify(r.data)).toContain('"clause2Amount":507057874');
  });
});

describe("지분", () => {
  const SHARE = (n: string, o: A = {}) => GB({ ownershipNumerator: n, ownershipDenominator: "100", ...o });
  it("축 B 50% + 50% · 취득월이 다르면 지분마다 자기 배율", async () => {
    const f = mk([SHARE("50"), SHARE("50", { preDeemedOriginalAcquisitionDate: "1984-09-01" })], { assetSplitMode: "fractional", bundledSaleMode: "actual" });
    const r = await check(f);
    expect(r.issue).toBeNull();
    expect(r.status).toBe(200);
    const shares = r.body.generalBuildingShares as Body[];
    expect(shares.map((x) => x.valuation.preDeemedPurchase.originalAcquisitionDate)).toEqual(["1984-06-01", "1984-09-01"]);
    expect(JSON.stringify(r.data)).toContain('"clause2Amount":253528937'); // floor(2.5억 × 5029 ÷ 4959)
    expect(JSON.stringify(r.data)).toContain('"clause2Amount":247929402'); // floor(2.5억 × 5029 ÷ 5071)
  });
  it("단일 지분 50%(나머지 타인) — ②는 지분 금액 기준", async () => {
    const r = await check(mk([SHARE("50", { ownershipRemainderThirdParty: "yes" })]));
    expect(r.issue).toBeNull();
    expect(detail(r.data).preDeemedPurchase.actualBase).toBe(250_000_000);
    expect(detail(r.data).preDeemedPurchase.clause2Amount).toBe(253_528_937);
  });
});

describe("⑥ 사이드바 · ⑦ 결과 블록", () => {
  it("계산 전 「계산 후 확정」 · 계산 후 pending 해제 · 카드 합 ②", async () => {
    const f = mk([GB()]);
    expect(computeTransferPerAssetSummary(f, null).rows[0].acqPending).toBe(true);
    const r = await check(f);
    const after = computeTransferPerAssetSummary(f, { mode: "bundled", ...r.data } as never).rows[0];
    expect(after.acqPending).toBe(false);
    expect(after.expensePending).toBeFalsy();
    expect(after.acqPrice).toBe(507_057_874);
  });
  it("GbResultBlocks — 비교 카드", async () => {
    const r = await check(mk([GB()]));
    render(<GbResultBlocks view={{ detail: detail(r.data), asset: asset(GB()), partAcquisitionPrice: () => undefined } as never} />);
    expect(screen.getByTestId("pre-deemed-purchase-result-card").textContent).toContain("507,057,874");
  });
});
