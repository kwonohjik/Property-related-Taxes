/**
 * anchor — 일반건물 건물 파트 이월과세 × 증여자 신축·증축 §114조의2 · **폼 → ④ → ⑧ → ⑫ → route → 엔진 전 구간** (PR-5a · 계획서 §6 격자)
 *
 * 숨긴 입력 = ④ 미전송 = ⑧ 미요구 (3중 패턴) — 세 곳이 같은 술어(`donorBuiltGbApplicable`)를 읽는다.
 *  · PL-1 켜진 입력이 body 에 실려(신규 파트 모양·엔진 모양 두 갈래) route 가 가산세를 낸다 — 토지 파트에는 실리지 않는다
 *  · PL-2 범위 밖(환산 OFF·증축 3-way·부담부증여·PHD 모드)에서 켜 둔 stale 토글은 보내지도 요구하지도 않는다
 *  · PL-3 ⑧ 차단 사유(구분·신축일·범위·증축 칸)와 앵커 / 차단되지 않는 입력은 ⑫(route)도 통과한다 — UI 통과 ⇒ 200
 *  · PL-4 지분(축 B)·함께 양도(컴패니언)
 *  · PL-5 ⑧ ↔ ⑫ 격자 전수
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
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { buildGeneralBuildingShares } from "@/lib/calc/transfer-tax-api-gb-shares";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { donorBuiltGbActive, donorBuiltGbApplicable } from "@/lib/calc/donor-built-gb-scope";
import { previewGeneralBuildingEstimated } from "@/lib/calc/transfer-estimated-preview";
import { coerceGeneralBuildingPayload } from "@/lib/tax-engine/general-building-entry";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

const TRANSFER_DATE = "2026-03-01";

/** 건물 서브폼 — 환산(일반) + 증여자 신축 ON. `over` 로 한 칸씩 바꾼다. */
const bcf = (over: object = {}) => ({
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", giftDateValuation: "800,000,000",
  useEstimatedAcquisition: true, estimationMode: "general" as const, donorStandardPriceAtAcquisition: "100,000,000",
  donorBuilt: true, donorBuiltType: "new" as const, donorBuiltDate: "2022-01-10",
  ...over,
});

function gbAsset(over: Partial<AssetForm> = {}, carryoverOver: object = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "carryover_gift",
    acquisitionDate: "2024-05-01",
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    buildingCarryover: bcf(carryoverOver) as never,
    ...over,
  } as AssetForm;
}

const formOf = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData =>
  ({
    ...createDefaultTransferFormData(),
    assets, transferDate: TRANSFER_DATE, filingDate: "2026-05-31", contractTotalPrice: "1,000,000,000",
    householdHousingCount: "2", isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;

interface Prop { propertyId: string; penaltyTax?: number; penaltyBase?: number; carryoverTaxationDetail?: { donorBuiltPenalty?: { applied: boolean; notAppliedReason?: string } } }
interface Run { status: number; body: Record<string, unknown>; props: Prop[]; penaltyTax: number; totalTax: number; error?: unknown }
/** 폼 → callTransferTaxAPI 가 만든 요청 body 를 가로채 그대로 route 에 POST. */
async function run(f: TransferFormData): Promise<Run> {
  let captured: Record<string, unknown> = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try { await callTransferTaxAPI(f); } catch { /* body 만 필요하다 */ }
  global.fetch = orig;
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...captured, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: { aggregated?: Record<string, unknown> }; error?: unknown };
  const a = (json.data?.aggregated ?? {}) as Record<string, unknown>;
  return { status: res.status, body: captured, props: (a.properties as Prop[]) ?? [], penaltyTax: (a.penaltyTax as number) ?? 0, totalTax: a.totalTax as number, error: json.error };
}
const gbv = (r: Run) => (r.body.generalBuildingValuation ?? {}) as Record<string, Record<string, unknown> | undefined>;
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));
const msgs = (f: TransferFormData) => issues(f).map((i) => i.message).join("\n");
const donorBuiltOf2 = (r: Run) => gbv(r).buildingCarryoverTaxation?.donorBuilt ?? gbv(r).buildingCarryoverPart?.donorBuilt;
const bld = (r: Run) => r.props.find((p) => p.propertyId === "building")!;

// ─────────────────────────────────────────────────────────────────────
describe("PL-1 폼 → body → route", () => {
  it("엔진 모양(증여세 칸 비움): buildingCarryoverTaxation.donorBuilt 가 실리고 토지 쪽에는 없다 · 건물 12,500,000", async () => {
    const f = formOf([gbAsset()]);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(gbv(r).buildingCarryoverTaxation?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect(gbv(r).landCarryoverTaxation).toBeUndefined();
    expect(bld(r).penaltyBase).toBe(250_000_000);
    expect(bld(r).penaltyTax).toBe(12_500_000);
    for (const p of r.props.filter((x) => x.propertyId !== "building")) expect(p.penaltyTax ?? 0).toBe(0);
  });

  it("신규 파트 모양(증여세 산출세액·과세가액 입력): buildingCarryoverPart.donorBuilt — 같은 12,500,000", async () => {
    const f = formOf([gbAsset({}, { giftTaxCalculated: "0", giftTaxBase: "800,000,000" })]);
    // 산출세액 0 이면 신규 파트 모양이 아니다(두 칸이 모두 양수일 때만) — 아래 값은 양수
    const g = formOf([gbAsset({}, { giftTaxCalculated: "30,000,000", giftTaxBase: "800,000,000" })]);
    expect(issues(f)).toEqual([]);
    expect(issues(g)).toEqual([]);
    const rf = await run(f);
    expect(gbv(rf).buildingCarryoverPart).toBeUndefined();
    const r = await run(g);
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(gbv(r).buildingCarryoverPart?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect(gbv(r).buildingCarryoverTaxation).toBeUndefined();
    expect(bld(r).penaltyBase).toBe(250_000_000);
    expect(bld(r).penaltyTax).toBe(12_500_000);
  });

  it("증여자 증축(2-way 건물): 바닥면적·증축 부분 기준시가가 실린다 · 85.01㎡ → 6,250,000", async () => {
    const f = formOf([gbAsset({}, { donorBuiltType: "extension", donorBuiltExtensionArea: "85.01", donorBuiltExtensionStdPrice: "50,000,000" })]);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    expect(gbv(r).buildingCarryoverTaxation?.donorBuilt).toEqual({ buildingType: "extension", constructionDate: "2022-01-10", extensionFloorArea: 85.01, extensionStdPriceAtAcquisition: 50_000_000 });
    expect(bld(r).penaltyBase).toBe(125_000_000);
    expect(bld(r).penaltyTax).toBe(6_250_000);
  });

  it("토글 OFF: 키가 실리지 않고 가산세 0 (donorBuilt 미입력 회귀)", async () => {
    const f = formOf([gbAsset({}, { donorBuilt: false })]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(gbv(r).buildingCarryoverTaxation).toBeDefined();
    expect("donorBuilt" in (gbv(r).buildingCarryoverTaxation as object)).toBe(false);
    expect(r.penaltyTax).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("PL-2 범위 밖 stale 토글 — ⑤ 비노출 = ④ 미전송 = ⑧ 미요구", () => {
  const stale: Array<[string, Partial<AssetForm>, object]> = [
    ["환산 OFF(실지거래가액 승계)", {}, { useEstimatedAcquisition: false, estimationMode: null, donorAcquisitionPrice: "200,000,000" }],
    ["환산 OFF 인데 환산 방식만 남은 잔재", {}, { useEstimatedAcquisition: false, estimationMode: "general", donorAcquisitionPrice: "200,000,000" }],
    ["PHD 모드(일반건물 미지원)", {}, { estimationMode: "phd" }],
    ["자산 종류가 일반건물이 아님(취득원인 값만 남은 잔재)", { assetKind: "housing" } as Partial<AssetForm>, {}],
    ["증축(3-way)", { gbHasExtension: true, gbExtensionDate: "2022-06-01", gbExtensionArea: "100", gbExtensionFloorArea85: "100", gbExtensionAcquisitionCause: "newConstruction", gbExtensionAcquisitionMode: "estimated", gbTransferExtensionBuildingStdPrice: "50,000,000", gbAcquisitionExtensionBuildingStdPrice: "20,000,000" } as Partial<AssetForm>, {}],
    ["건물 취득원인이 매매", { gbBuildingAcquisitionCause: "purchase" }, {}],
    ["부담부증여", { transferType: "burdened_gift" } as Partial<AssetForm>, {}],
  ];
  for (const [name, assetOver, cOver] of stale) {
    it(`${name}: 술어 false · payload 에 donorBuilt 없음 · ⑧ 이 신축 칸을 요구하지 않는다`, () => {
      // 토글은 켜져 있지만 구분·신축일이 비어 있는 stale 상태 — 요구하면 막다른 길이다
      const a = gbAsset(assetOver, { donorBuiltType: "", donorBuiltDate: "", ...cOver });
      expect(donorBuiltGbApplicable(a)).toBe(false);
      expect(donorBuiltGbActive(a)).toBe(false);
      if (a.assetKind === "general_building") {
        const raw = JSON.stringify(buildGeneralBuildingValuation(a, TRANSFER_DATE) ?? {});
        expect(raw).not.toContain("donorBuilt");
      }
      expect(msgs(formOf([a]))).not.toContain("증여자가 신축한 건물인지");
      expect(msgs(formOf([a]))).not.toContain("증여자의 신축 취득일");
    });
  }

  it("토지만 이월과세(건물은 매매): 건물 서브폼에 켜 둔 토글은 무시", () => {
    const a = gbAsset({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "purchase", carryover: bcf() as never });
    expect(donorBuiltGbApplicable(a)).toBe(false);
    expect(JSON.stringify(buildGeneralBuildingValuation(a, TRANSFER_DATE) ?? {})).not.toContain("donorBuilt");
  });

  it("범위 안에서 켜 둔 값은 전송된다(대조) — 위 stale 케이스와 같은 폼에서 한 가지만 다르다", () => {
    const a = gbAsset();
    expect(donorBuiltGbApplicable(a)).toBe(true);
    expect(JSON.stringify(buildGeneralBuildingValuation(a, TRANSFER_DATE))).toContain("donorBuilt");
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("PL-3 ⑧ 차단 사유 · 앵커", () => {
  const block = (carryoverOver: object, assetOver: Partial<AssetForm> = {}) => issues(formOf([gbAsset(assetOver, carryoverOver)]));
  it("구분 미선택 → buildingCarryover.donorBuiltType", () => {
    const i = block({ donorBuiltType: "" });
    expect(i.some((x) => x.field === "buildingCarryover.donorBuiltType" && x.message.includes("신축한 건물인지 증축한 건물인지"))).toBe(true);
  });
  it("신축일 미입력 → 증여자 취득일로 대신 채우지 않는다", () => {
    const i = block({ donorBuiltDate: "" });
    expect(i.some((x) => x.field === "buildingCarryover.donorBuiltDate" && x.message.includes("대신 채우지 않습니다"))).toBe(true);
    // 건물 파트 검증이다 — 토지 파트 라벨로 두 번 말하지 않는다(토지 파트는 가산세 대상이 아니다, D4)
    expect(i.filter((x) => x.field === "buildingCarryover.donorBuiltDate").every((x) => x.message.includes(" 건물: 증여자의"))).toBe(true);
  });
  it("토지·건물 모두 이월과세여도 신축일 안내는 건물 파트 한 번만 — 토지 파트로 말하지 않는다 (D4)", () => {
    const a = gbAsset({ acquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", giftDateValuation: "400,000,000", useEstimatedAcquisition: true, estimationMode: "general" as const, donorStandardPriceAtAcquisition: "50,000,000" } as never }, { donorBuiltDate: "" });
    const msg = issues(formOf([a])).filter((x) => /donorBuilt/.test(x.field ?? "")).map((x) => x.message);
    expect(msg.length).toBe(1);
    expect(msg[0]).toContain(" 건물: 증여자의");
  });
  it("신축일이 증여자 취득일 이전 / 증여 등기접수일 이후", () => {
    expect(block({ donorBuiltDate: "2014-12-31" }).some((x) => x.field === "buildingCarryover.donorBuiltDate" && x.message.includes("증여자 취득일"))).toBe(true);
    expect(block({ donorBuiltDate: "2024-06-01" }).some((x) => x.field === "buildingCarryover.donorBuiltDate" && x.message.includes("증여 등기접수일"))).toBe(true);
  });
  it("증축: 바닥면적 / 증축 부분 기준시가 누락", () => {
    expect(block({ donorBuiltType: "extension", donorBuiltExtensionArea: "", donorBuiltExtensionStdPrice: "50,000,000" }).some((x) => x.field === "buildingCarryover.donorBuiltExtensionArea")).toBe(true);
    expect(block({ donorBuiltType: "extension", donorBuiltExtensionArea: "90", donorBuiltExtensionStdPrice: "" }).some((x) => x.field === "buildingCarryover.donorBuiltExtensionStdPrice")).toBe(true);
  });
  it("엔진 모양에서 건물 서브폼이 자기 등기접수일을 쓴다 — 신규 파트 모양이면 사건 출처의 값으로 판정(④와 같은 분기)", () => {
    // 신규 파트 모양(산출세액·과세가액 양수): 사건 출처 = 건물만 이월과세이므로 buildingCarryover 자신 → 같은 값. 신축일 2024-06-01 은 등기접수일(2024-05-01) 이후
    const i = block({ donorBuiltDate: "2024-06-01", giftTaxCalculated: "30,000,000", giftTaxBase: "800,000,000" });
    expect(i.some((x) => x.message.includes("증여 등기접수일(2024-05-01)"))).toBe(true);
  });
  describe("증여 등기접수일의 출처 — ④가 보내는 모양을 ⑧이 그대로 따른다(토지·건물 서브폼이 서로 다른 등기접수일을 가진 입력)", () => {
    /** 토지 블록(사건 출처)에 증여세 산출세액·과세가액이 있으면 신규 파트 모양 → 사건 등기접수일(2024-05-01)이 상한. 없으면 엔진 모양 → 건물 서브폼 자기 값(2023-01-01). */
    const landForm = (gift: object) => ({ ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", giftDateValuation: "400,000,000", useEstimatedAcquisition: true, estimationMode: "general" as const, donorStandardPriceAtAcquisition: "50,000,000", ...gift });
    const two = (gift: object) => gbAsset({ acquisitionCause: "carryover_gift", carryover: landForm(gift) as never }, { giftRegistryDate: "2023-01-01", donorBuiltDate: "2023-06-01" });
    it("신규 파트 모양: 건물 서브폼의 등기접수일(2023-01-01)이 아니라 사건 출처(2024-05-01)가 상한 — ⑧ 통과 · route 200 · 가산세 붙는다", async () => {
      const f = formOf([two({ giftTaxCalculated: "30,000,000", giftTaxBase: "1,200,000,000" })]);
      expect(issues(f).filter((i) => /donorBuilt/.test(i.field ?? ""))).toEqual([]);
      const r = await run(f);
      expect(r.status, JSON.stringify(r.error)).toBe(200);
      expect(gbv(r).buildingCarryoverPart?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2023-06-01" });
      expect(bld(r).penaltyTax).toBeGreaterThan(0);
    });
    it("엔진 모양: 건물 서브폼 자기 등기접수일(2023-01-01)이 상한 — ⑧ 차단(⑫ 도 같은 이유로 거부)", async () => {
      const f = formOf([two({})]);
      expect(issues(f).some((i) => i.field === "buildingCarryover.donorBuiltDate" && i.message.includes("증여 등기접수일(2023-01-01)"))).toBe(true);
      const r = await run(f);
      expect(r.status).toBe(400);
    });
  });
  it("토지·건물 모두 이월과세(분리 OFF): 엔진 모양·신규 파트 모양 모두 토지 쪽에는 donorBuilt 가 실리지 않는다 · route 200 · 가산세는 건물만", async () => {
    for (const gift of [{}, { giftTaxCalculated: "30,000,000", giftTaxBase: "1,200,000,000" }]) {
      const a = gbAsset({ acquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", giftDateValuation: "400,000,000", useEstimatedAcquisition: true, estimationMode: "general" as const, donorStandardPriceAtAcquisition: "50,000,000", ...gift } as never });
      const f = formOf([a]);
      expect(issues(f)).toEqual([]);
      const r = await run(f);
      expect(r.status, JSON.stringify(r.error)).toBe(200);
      const v = gbv(r);
      expect(v.landCarryoverTaxation?.donorBuilt).toBeUndefined();
      expect(v.landCarryoverPart?.donorBuilt).toBeUndefined();
      expect(donorBuiltOf2(r)).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
      expect(r.props.filter((p) => (p.penaltyTax ?? 0) > 0).map((p) => p.propertyId)).toEqual(["building"]);
    }
  });
  it("차단되지 않는 입력은 route(⑫·엔진)도 통과한다", async () => {
    const r = await run(formOf([gbAsset({}, { donorBuiltType: "extension", donorBuiltExtensionArea: "85", donorBuiltExtensionStdPrice: "50,000,000" })]));
    expect(r.status, JSON.stringify(r.error)).toBe(200); // 85㎡ 는 요건 미충족 → 가산세 0 이지만 입력은 유효
    expect(bld(r).penaltyTax ?? 0).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("PL-4 지분(축 B) · 함께 양도(컴패니언)", () => {
  const share = (id: string, num: string, over: Partial<AssetForm> = {}, carryoverOver?: object): AssetForm =>
    gbAsset({ assetId: id, ownershipNumerator: num, ownershipDenominator: "100", gbBuildingAcquisitionCause: "purchase", ...over }, carryoverOver);

  it("④ 지분 B(40%)만 건물 이월과세: 지분 valuation 에 donorBuilt 가 실리고 지분율로 스케일되지 않는다", () => {
    const sB = share("b", "40", { gbBuildingAcquisitionCause: "carryover_gift", acquisitionDate: "2024-05-01" }, { giftDateValuation: "800,000,000" });
    const sA = share("a", "60", { acquisitionDate: "2009-03-01", buildingCarryover: undefined as never });
    const out = buildGeneralBuildingShares([sA, sB], TRANSFER_DATE);
    expect(out).toBeDefined();
    const vB = out![1].valuation as Record<string, Record<string, unknown>>;
    expect(vB.buildingCarryoverTaxation.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect(vB.buildingCarryoverTaxation.donorStandardPriceAtAcquisition).toBe(100_000_000);
    expect((out![0].valuation as Record<string, unknown>).buildingCarryoverTaxation).toBeUndefined();
  });

  it("route: 지분 B 건물만 가산세 — 건물 base = 건물 양도가 2억 × 1억/2억 = 100,000,000 → 5,000,000", async () => {
    const sB = share("b", "40", { gbBuildingAcquisitionCause: "carryover_gift", acquisitionDate: "2024-05-01" }, { giftDateValuation: "800,000,000" });
    const sA = share("a", "60", { acquisitionDate: "2009-03-01", buildingCarryover: undefined as never });
    const f = formOf([sA, sB]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    const pen = r.props.filter((p) => (p.penaltyTax ?? 0) > 0);
    expect(pen.map((p) => p.propertyId)).toEqual(["building#1"]);
    expect(pen[0].penaltyBase).toBe(100_000_000);
    expect(pen[0].penaltyTax).toBe(5_000_000);
  });

  it("함께 양도(컴패니언) 일반건물: 컴패니언 payload 의 generalBuildingValuation 에 donorBuilt 가 실려 건물 카드 가산세가 붙는다", async () => {
    const housing = {
      ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-03-01",
      useEstimatedAcquisition: false, fixedAcquisitionPrice: "300,000,000", actualSalePrice: "600,000,000", standardPriceAtTransfer: "500,000,000", standardPriceAtAcq: "250,000,000",
    } as unknown as AssetForm;
    const gb = gbAsset({ assetId: "gb2", addressJibun: "서울 강남구 테스트동 2-2", standardPriceAtTransfer: "500,000,000" } as Partial<AssetForm>);
    const f = formOf([housing, gb], { assetSplitMode: "companion", contractTotalPrice: "1,200,000,000" });
    const r = await run(f);
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    const co = (r.body.companionAssets as Array<{ generalBuildingValuation?: Record<string, Record<string, unknown> | undefined> }> | undefined)?.[0];
    expect(co?.generalBuildingValuation?.buildingCarryoverTaxation?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    const penal = r.props.filter((p) => (p.penaltyTax ?? 0) > 0);
    expect(penal.length).toBe(1);
    expect(penal[0].propertyId).toMatch(/building/);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("PL-5 ⑧ ↔ ⑫ 격자 — UI 통과(⑧ 오류 없음)이면 route 는 항상 200, 차단 사유는 ⑧ 이 먼저 말한다", () => {
  type Cell = { name: string; asset: Partial<AssetForm>; c: object; shown: boolean; blocked: boolean };
  const cells: Cell[] = [
    { name: "정상 신축", asset: {}, c: {}, shown: true, blocked: false },
    { name: "구분 미선택", asset: {}, c: { donorBuiltType: "" }, shown: true, blocked: true },
    { name: "신축일 미입력", asset: {}, c: { donorBuiltDate: "" }, shown: true, blocked: true },
    { name: "신축일 < 증여자 취득일", asset: {}, c: { donorBuiltDate: "2014-12-31" }, shown: true, blocked: true },
    { name: "신축일 > 증여 등기접수일", asset: {}, c: { donorBuiltDate: "2024-06-01" }, shown: true, blocked: true },
    { name: "신축일 = 증여자 취득일(경계)", asset: {}, c: { donorBuiltDate: "2015-01-01" }, shown: true, blocked: false },
    { name: "신축일 = 증여 등기접수일(경계)", asset: {}, c: { donorBuiltDate: "2024-05-01" }, shown: true, blocked: false },
    { name: "증축 정상 90㎡", asset: {}, c: { donorBuiltType: "extension", donorBuiltExtensionArea: "90", donorBuiltExtensionStdPrice: "50,000,000" }, shown: true, blocked: false },
    { name: "증축 바닥면적 누락", asset: {}, c: { donorBuiltType: "extension", donorBuiltExtensionArea: "", donorBuiltExtensionStdPrice: "50,000,000" }, shown: true, blocked: true },
    { name: "증축 기준시가 누락", asset: {}, c: { donorBuiltType: "extension", donorBuiltExtensionArea: "90", donorBuiltExtensionStdPrice: "" }, shown: true, blocked: true },
    { name: "환산 OFF + 토글 ON(stale)", asset: {}, c: { useEstimatedAcquisition: false, estimationMode: null, donorAcquisitionPrice: "200,000,000", donorStandardPriceAtAcquisition: "" }, shown: false, blocked: false },
    { name: "건물 취득원인 매매 + 토글 ON(stale)", asset: { gbBuildingAcquisitionCause: "purchase" }, c: {}, shown: false, blocked: false },
    { name: "부담부증여 + 토글 ON(stale)", asset: { transferType: "burdened_gift" } as Partial<AssetForm>, c: {}, shown: false, blocked: false },
  ];
  for (const cell of cells) {
    it(cell.name, async () => {
      const a = gbAsset(cell.asset, cell.c);
      const f = formOf([a]);
      expect(donorBuiltGbApplicable(a)).toBe(cell.shown);
      const mine = issues(f).filter((i) => /buildingCarryover\.donorBuilt/.test(i.field ?? ""));
      expect(mine.length > 0, JSON.stringify(mine)).toBe(cell.blocked);
      if (!cell.blocked && !issues(f).length) {
        const r = await run(f);
        // 부담부증여 stale 셀은 §159 경로가 별도 필수 칸을 요구하므로 ⑧ 전체 통과가 아니다 — 위 조건(`!issues.length`)이 걸러낸다
        expect(r.status, JSON.stringify(r.error)).toBe(200);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
describe("PL-6 입력 도중(토글 ON · 신축일 비어 있음) — 클라이언트 사이드바 프리뷰가 던지지 않는다 (E2E 실측 결함)", () => {
  /**
   * 사이드바 환산 프리뷰(`previewGeneralBuildingEstimated`)는 ⑧이 막기 전의 미완성 폼으로 ⑭ 변환(`coerceGeneralBuildingPayload`)을 부른다.
   * 신축일을 엄격 변환하면 `Invalid date string` 으로 던져 토글을 켜는 순간 페이지가 에러 바운더리로 떨어졌다.
   */
  it("프리뷰: 토글만 켠 상태(구분·신축일 비어 있음)에서 던지지 않고 환산 값이 같다", () => {
    const on = gbAsset({}, { donorBuiltType: "", donorBuiltDate: "" });
    const off = gbAsset({}, { donorBuilt: false });
    const f = formOf([on]);
    expect(() => previewGeneralBuildingEstimated(on, f)).not.toThrow();
    expect(previewGeneralBuildingEstimated(on, f)).toEqual(previewGeneralBuildingEstimated(off, formOf([off])));
  });
  it("⑭ 변환: 신축일이 빈 donorBuilt 는 두 갈래(엔진 모양·신규 파트 모양) 모두 버리고, 채워진 값은 Date 로 바꾼다", () => {
    const raw = (db: object) => ({
      buildingAcquisitionCause: "carryover_gift",
      buildingCarryoverTaxation: { giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", useEstimatedAcquisition: true, giftTaxAmount: 0, giftDateValuation: 1, donorBuilt: db },
    });
    const rawPart = (db: object) => ({
      buildingAcquisitionCause: "carryover_gift",
      carryoverGiftEvent: { giftRegistryDate: "2024-05-01", giftTaxCalculated: 0, giftTaxBase: 1 },
      buildingCarryoverPart: { donorAcquisitionDate: "2015-01-01", giftDateAssetValue: 1, useEstimatedAcquisition: true, donorBuilt: db },
    });
    const ct = (o: Record<string, unknown>) => o.buildingCarryoverTaxation as Record<string, unknown>;
    const empty = { buildingType: "", constructionDate: "" };
    expect("donorBuilt" in ct(coerceGeneralBuildingPayload(raw(empty)))).toBe(false);
    expect("donorBuilt" in ct(coerceGeneralBuildingPayload(rawPart(empty)))).toBe(false);
    const filled = { buildingType: "new", constructionDate: "2022-01-10" };
    for (const out of [coerceGeneralBuildingPayload(raw(filled)), coerceGeneralBuildingPayload(rawPart(filled))]) {
      const db = ct(out).donorBuilt as { constructionDate: unknown };
      expect(db.constructionDate).toBeInstanceOf(Date);
      expect((db.constructionDate as Date).toISOString().slice(0, 10)).toBe("2022-01-10");
    }
  });
});
