/**
 * anchor — 일반건물 **부담부증여 × 이월과세 × 증여자 신축·증축** §114조의2 · **폼 → ④ → ⑧ → ⑫ → route → 엔진 전 구간** (PR-5c · 계획서 §3.4·§6)
 *
 * 숨긴 입력 = ④ 미전송 = ⑧ 미요구 (3중 패턴) — 세 곳이 같은 술어(`donorBuiltBgApplicable`/`donorBuiltBgActive`)를 읽는다.
 *  · PL-1 켜진 입력이 body(`burdenedGiftInfo.carryoverDonorBasis.donorBuilt`)에 실려 route 가 가산세를 낸다 — 토지 카드에는 붙지 않는다
 *  · PL-2 범위 밖(K-6 매매사례·건물 본인 신축·토글 OFF)에서 켜 둔 stale 토글은 보내지도 요구하지도 않는다 (K-7 감정은 PR-2 에서 범위 안)
 *  · PL-3 ⑧ 차단 사유(구분·신축일·범위·증축 칸)와 필드 앵커
 *  · PL-4 ⑧ ↔ ⑫ 격자 전수 — ⑧ 이 통과시킨 입력은 route(⑫·엔진)도 200
 *  · PL-5 지분 분할 취득(축 B)·함께 부담부증여(컴패니언) — 이월과세는 계산하고(묶음 PR-1 · 지분 PR-2), 증여자 신축 토글만 ⑧ 이 끄라고 알리고 켜진 채 body 에 실리면 ⑫ 가 거부한다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { donorBuiltBgActive, donorBuiltBgApplicable } from "@/lib/calc/donor-built-bg-scope";
import { buildDonorBuiltBgPayload } from "@/lib/calc/transfer-tax-api-donor-built-bg";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { sameDayBuildingDonorDate } from "./_helpers/gb-bg-building-donor-date";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

const TRANSFER_DATE = "2026-03-01";

/** 일반건물 · 부담부증여 K-5 · 이월과세(당초 증여자 취득 시 기준시가 토지 1천만·건물 4천만 → A 채택) · 증여자 신축 ON. `co`/`over` 로 한 칸씩 바꾼다. */
function gbAsset(over: Partial<AssetForm> = {}, co: Record<string, unknown> = {}): AssetForm {
  return sameDayBuildingDonorDate({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "general_building",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2024-05-01",
    gbBuildingAcquisitionCause: "purchase",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
    bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000",
      giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no",
      donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10",
      ...co,
    },
    ...over,
  } as AssetForm);
}
const formOf = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE, filingDate: "2026-05-31", assets, houses: [], presaleRights: [],
    contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;

interface Run { status: number; body: Record<string, any>; pen: number; total: number; props: Array<{ propertyId: string; penaltyTax?: number; penaltyBase?: number }>; fieldErrors: string[]; echo?: { applied: boolean } } // eslint-disable-line @typescript-eslint/no-explicit-any
async function bodyOf(f: TransferFormData): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let captured: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) } as Response;
  }));
  try { await callTransferTaxAPI(f); } catch { /* body 만 필요하다 */ }
  vi.unstubAllGlobals();
  return captured;
}
async function post(body: Record<string, any>): Promise<Run> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: { aggregated?: Record<string, any> }; error?: { fieldErrors?: Record<string, string[]> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = json.data?.aggregated ?? {};
  return { status: res.status, body, pen: a.penaltyTax ?? 0, total: a.totalTax, props: a.properties ?? [], fieldErrors: Object.keys(json.error?.fieldErrors ?? {}), echo: a.donorBuiltPenalty };
}
const run = async (f: TransferFormData): Promise<Run> => post(await bodyOf(f));
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));
const msgs = (f: TransferFormData) => issues(f).map((i) => i.message).join("\n");
const donorOf = (r: Run) => r.body.burdenedGiftInfo?.carryoverDonorBasis?.donorBuilt;

// ─────────────────────────────────────────────────────────────────────
describe("PL-1 폼 → body → route", () => {
  it("K-5 신축: donorBuilt 가 burdenedGiftInfo.carryoverDonorBasis 에 실리고 건물 2,500,000 · 토지 0", async () => {
    const f = formOf([gbAsset()]);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    expect(donorOf(r)).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect(r.body.carryoverTaxation?.donorBuilt).toBeUndefined(); // 이월과세 서브객체로는 보내지 않는다(부담부증여 규약)
    expect(r.props.find((p) => p.propertyId === "building")?.penaltyBase).toBe(50_000_000);
    expect(r.pen).toBe(2_500_000);
    expect(r.props.find((p) => p.propertyId === "land")?.penaltyTax ?? 0).toBe(0);
    expect(r.echo?.applied).toBe(true);
  });

  it("토글 OFF 면 미전송 · 가산세 0 · echo 없음", async () => {
    const r = await run(formOf([gbAsset({}, { donorBuilt: false })]));
    expect(donorOf(r)).toBeUndefined();
    expect(r.status).toBe(200);
    expect(r.pen).toBe(0);
    expect(r.echo).toBeUndefined();
  });

  it("증축: 바닥면적·증축 부분 기준시가가 실린다 · 90㎡ → 1,250,000", async () => {
    const f = formOf([gbAsset({}, { donorBuiltType: "extension", donorBuiltExtensionArea: "90", donorBuiltExtensionStdPrice: "20,000,000" })]);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(donorOf(r)).toEqual({ buildingType: "extension", constructionDate: "2022-01-10", extensionFloorArea: 90, extensionStdPriceAtAcquisition: 20_000_000 });
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    expect(r.pen).toBe(1_250_000);
  });
});

describe("PL-2 범위 밖 stale 토글 — 보내지도 요구하지도 않는다", () => {
  it("술어: K-5·K-7(PR-2) · 건물 본인 신축 아님 · 이월과세 · 부담부증여", () => {
    expect(donorBuiltBgApplicable(gbAsset())).toBe(true);
    expect(donorBuiltBgApplicable(gbAsset({ bgAcquisitionMethod: "appraisal" }))).toBe(true); // K-7 은 PR-2(`gb-bg-carryover-presumed-scenario-b.plan.md`)에서 열었다 — 매매사례(K-6)는 §114조의2 대상이 아니다
    expect(donorBuiltBgApplicable(gbAsset({ bgAcquisitionMethod: "salesCase" }))).toBe(false);
    expect(donorBuiltBgApplicable(gbAsset({ bgAcquisitionMethod: "actual" }))).toBe(false);
    expect(donorBuiltBgApplicable(gbAsset({ gbBuildingAcquisitionCause: "newConstruction" }))).toBe(false);
    expect(donorBuiltBgApplicable(gbAsset({ acquisitionCause: "purchase" }))).toBe(false);
    expect(donorBuiltBgApplicable(gbAsset({ transferType: "regular" }))).toBe(false);
    expect(donorBuiltBgActive(gbAsset({}, { donorBuilt: false }))).toBe(false);
  });

  it.each([
    ["K-6 매매사례", { bgAcquisitionMethod: "salesCase", bgCoDonorPresumedAcquisitionLand: "100,000,000", bgCoDonorPresumedAcquisitionBuilding: "200,000,000", bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000" }],
    ["K-4 실지", { bgAcquisitionMethod: "actual", bgCoDonorActualAcquisitionLand: "100,000,000", bgCoDonorActualAcquisitionBuilding: "100,000,000", bgActualAcquisitionLand: "100,000,000", bgActualAcquisitionBuilding: "100,000,000" }],
    ["건물 본인 신축", { gbBuildingAcquisitionCause: "newConstruction", gbBuildingAcquisitionDate: "2022-01-10" }],
  ])("%s — 토글이 켜져 있어도 ④ 미전송 · ⑧ 이 신축일 칸을 요구하지 않는다", async (_n, over) => {
    const f = formOf([gbAsset(over as Partial<AssetForm>, { donorBuiltDate: "" })]); // 신축일이 비어 있어도(범위 밖이라) 막지 않는다
    expect(buildDonorBuiltBgPayload(f.assets[0])).toBeUndefined();
    expect(msgs(f)).not.toContain("신축");
    const r = await run(f);
    expect(donorOf(r)).toBeUndefined();
  });
});

describe("PL-3 ⑧ 차단 사유와 필드 앵커", () => {
  const blocked = (co: Record<string, unknown>) => {
    const f = formOf([gbAsset({}, co)]);
    return { text: msgs(f), fields: issues(f).map((i) => (i as { fieldPath?: string; field?: string }).fieldPath ?? (i as { field?: string }).field) };
  };
  it("구분 미선택", () => expect(blocked({ donorBuiltType: "" }).text).toContain("구분을 선택"));
  it("신축일 미입력 — 증여자 취득일로 대신 채우지 않는다", () => expect(blocked({ donorBuiltDate: "" }).text).toContain("대신 채우지 않습니다"));
  it("신축일이 증여자 취득일 전", () => expect(blocked({ donorBuiltDate: "2014-12-31" }).text).toContain("취득일"));
  it("신축일이 증여 등기접수일 후", () => expect(blocked({ donorBuiltDate: "2024-05-02" }).text).toContain("등기접수일"));
  it("증축 바닥면적 없음", () => expect(blocked({ donorBuiltType: "extension", donorBuiltExtensionStdPrice: "20,000,000" }).text).toContain("바닥면적"));
  it("증축 부분 기준시가 없음(K-5)", () => expect(blocked({ donorBuiltType: "extension", donorBuiltExtensionArea: "90" }).text).toContain("기준시가"));
});

describe("PL-4 ⑧ ↔ ⑫ 격자 전수 — ⑧ 이 통과시키면 route 도 200, ⑧ 이 막으면 route(⑫)도 400", () => {
  const types = ["new", "extension", ""] as const;
  const dates = ["2022-01-10", "2014-12-31", "2024-05-02", ""] as const;
  const areas = ["90", "", "0"] as const;
  const stds = ["20,000,000", "", "0"] as const;
  for (const t of types) for (const d of dates) for (const a of areas) for (const s of stds) {
    // 신축은 면적·증축 기준시가를 쓰지 않으므로 증축 칸 조합을 한 번만 돈다
    if (t !== "extension" && (a !== "90" || s !== "20,000,000")) continue;
    it(`구분=${t || "∅"} · 신축일=${d || "∅"} · 면적=${a || "∅"} · 증축기준시가=${s || "∅"}`, async () => {
      const f = formOf([gbAsset({}, { donorBuiltType: t, donorBuiltDate: d, donorBuiltExtensionArea: a, donorBuiltExtensionStdPrice: s })]);
      const blockedBy8 = issues(f).length > 0;
      const r = await run(f);
      if (blockedBy8) expect(r.status, "⑧ 이 막은 입력은 ⑫(또는 엔진)도 400 이어야 한다 — 서버가 받아 가산세를 침묵 처리하면 안 된다").toBe(400);
      else expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    });
  }
});

describe("PL-5 지분 분할 취득(축 B)·함께 부담부증여(컴패니언)", () => {
  const share2 = {
    ...makeDefaultAsset(2), assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: "2015-03-01",
    ownershipNumerator: "40", ownershipDenominator: "100", gbBuildingAcquisitionCause: "purchase", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
  } as AssetForm;

  // 지분 분할 취득은 PR-2(`gb-bg-carryover-share-bundled.plan.md`)부터, 함께 부담부증여 묶음은 PR-1부터 이월과세를 계산한다 — donorBuilt 거부(PR-5c)만 남는다.
  const BUNDLED = "지분 분할 취득에서 아직 계산하지 못합니다";
  const DONOR_BUILT = "당초 증여자 신축·증축 가산세(소득세법 §114조의2)를 아직 지원하지 않습니다";
  it("지분 분할 취득: 이월과세는 계산된다(PR-2) · 켜진 donorBuilt 만 ⑧ «토글을 끄세요» · ⑫ 지분 §159 정보·지분 이월과세 두 경로 모두 별도 필드로 거부", async () => {
    const f = formOf([gbAsset({ ownershipNumerator: "60", ownershipDenominator: "100" }), share2], { assetSplitMode: "fractional" });
    expect(msgs(f)).toContain(DONOR_BUILT);
    const off = formOf([gbAsset({ ownershipNumerator: "60", ownershipDenominator: "100" }, { donorBuilt: false }), share2], { assetSplitMode: "fractional" });
    expect(msgs(off)).not.toContain(BUNDLED);
    expect(issues(off)).toEqual([]);
    const body = await bodyOf(off);
    expect(body.generalBuildingShares?.length).toBeGreaterThan(1);
    const control = await post(body);
    expect(control.status, JSON.stringify(control.fieldErrors)).toBe(200);
    const forced = JSON.parse(JSON.stringify(body));
    forced.generalBuildingShares[0].burdenedGiftInfo.carryoverDonorBasis = { ...(forced.generalBuildingShares[0].burdenedGiftInfo.carryoverDonorBasis ?? {}), donorBuilt: { buildingType: "new", constructionDate: "2022-01-10" } };
    const r = await post(forced);
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toContain("generalBuildingShares.0.burdenedGiftInfo.carryoverDonorBasis.donorBuilt");
    const viaCt = JSON.parse(JSON.stringify(body));
    viaCt.generalBuildingShares[0].carryoverTaxation.donorBuilt = { buildingType: "new", constructionDate: "2022-01-10" };
    const r2 = await post(viaCt);
    expect(r2.status).toBe(400);
    expect(r2.fieldErrors).toContain("generalBuildingShares.0.carryoverTaxation.donorBuilt");
  });

  it("함께 부담부증여(컴패니언): 이월과세는 계산된다(PR-1) · 켜진 donorBuilt 만 ⑧ «토글을 끄세요» · ⑫ 별도 필드로 거부", async () => {
    const companion = {
      ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-03-01",
      transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
      bgLendingDepositTotal: "100,000,000", bgMortgageDebtAmount: "100,000,000", standardPriceAtTransfer: "1,000,000,000", standardPriceAtAcq: "500,000,000",
    } as AssetForm;
    const on = formOf([gbAsset(), companion], { assetSplitMode: "companion", contractTotalPrice: "" });
    expect(msgs(on)).toContain("당초 증여자 신축·증축 가산세(소득세법 §114조의2)를 아직 지원하지 않습니다");
    const off = formOf([gbAsset({}, { donorBuilt: false }), companion], { assetSplitMode: "companion", contractTotalPrice: "" });
    expect(msgs(off)).not.toContain(BUNDLED);
    const body = await bodyOf(off);
    expect(body.companionAssets?.length).toBe(1);
    const control = await post(body);
    expect(control.status, JSON.stringify(control.fieldErrors)).toBe(200);
    const forced = JSON.parse(JSON.stringify(body));
    forced.burdenedGiftInfo.carryoverDonorBasis = { ...forced.burdenedGiftInfo.carryoverDonorBasis, donorBuilt: { buildingType: "new", constructionDate: "2022-01-10" } };
    const r = await post(forced);
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toContain("burdenedGiftInfo.carryoverDonorBasis.donorBuilt");
  });
});
