/**
 * anchor — 함께 양도(컴패니언) **일반건물 × 부담부증여** §159 지원 (PR-2 · 계획서 `docs/00-pm/gb-burdened-gift-silent-drop.plan.md` §2.2·§4 (A))
 *
 * ## 결함
 * 컴패니언 일반건물은 `buildGbCompanionItems`가 토지·건물 **카드로 펼쳐지는데** 그 빌더가 `burdenedGiftInfo`를 받지 않았다.
 * 그래서 카드가 일반 양도로 계산됐다(취득가액 0 · 개산공제 0 · 양도차익 = 채무액 전부). 같은 응답의 `aggregated.burdenedGift`(증여세·§159 명세)는
 * 정상이라 **한 화면에서 증여세 카드와 양도세 카드가 서로 모순**이었다(실측 GB+GB K-5 319,671,000 → 정상 139,906,800).
 *
 * ## 이 anchor 가 지키는 것
 * 1. GB+GB(전 자산 부담부증여) K-5/K-4/K-6/K-7/STD, 주택(주)+GB, GB(주)+주택 — §159 반영 세액.
 *    GB+GB STD 는 주택+주택 대조(40,311,700)와 같다.
 * 2. 양도세 카드(Σ 자산별) ↔ 증여세 카드(`burdenedGift` 물건 단위 §159 명세) 정합: 양도가액·취득가액·개산공제 합이 일치한다.
 * 3. 회귀 0: 비부담부증여 컴패니언 GB · 주택 컴패니언 부담부증여 · 단건 GB 부담부증여 불변, 혼합 묶음(일반 양도 + 부담부증여)은 ⑧ 이 계속 차단.
 * 4. §114조의2 본인 신축 신호(PR-5b)가 컴패니언 카드에도 붙는다.
 *
 * 수치는 mock 세율표 실측값이다(전후 대조가 목적).
 * 픽스처: 토지 100㎡×2,000,000(양도시 2억)·건물 양도시 2억 · 취득시 토지 1억·건물 1억 · 시가 10억 · 채무 5억 · 양도 2026-03-01 · 취득 2015-03-01.
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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

// ── 픽스처 ────────────────────────────────────────────────────────────
function gb(id: number, over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(id),
    addressJibun: `서울 강남구 테스트동 ${id}-${id}`,
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    gbBuildingAcquisitionCause: "purchase",
    ...over,
  } as AssetForm;
}
function housingBg(id: number, over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(id), addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-03-01",
    transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "100,000,000", bgMortgageDebtAmount: "100,000,000", standardPriceAtTransfer: "1,000,000,000", standardPriceAtAcq: "500,000,000", ...over,
  } as AssetForm;
}
const MARKET = {
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000",
};
const K5 = { ...MARKET, bgAcquisitionMethod: "converted" };
const K4 = { ...MARKET, bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "150,000,000", bgActualAcquisitionBuilding: "150,000,000" };
const K6 = { ...MARKET, bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionLand: "200,000,000", bgPresumedAcquisitionBuilding: "300,000,000" };
const K7 = { ...K6, bgAcquisitionMethod: "appraisal" };
const STD = {
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_standard",
  bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "200,000,000",
};

const CO = { assetSplitMode: "companion", contractTotalPrice: "" };
const form = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: "2026-03-01", filingDate: "2026-05-31", assets, houses: [], presaleRights: [],
    totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...CO, ...over,
  }) as unknown as TransferFormData;

interface Prop { propertyId: string; transferPrice: number; acquisitionPrice: number; necessaryExpense: number; transferGain: number; penaltyTax?: number; penaltyBase?: number }
interface Out {
  status: number; error?: unknown; mode?: string; totalTax: number; determinedTax: number; totalGain: number; penaltyTax: number;
  props: Prop[]; warnings: string[];
  whole?: { assumedDebtAmount: number; debtRatio: number; perAsset: { land: PA; building: PA } };
}
interface PA { transferPrice: number; acquisitionPrice: number; estimatedDeduction: number }
async function run(f: TransferFormData): Promise<Out> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
      annualBasicDeductionUsed: 0, ...cap.body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    }),
  }));
  const json = (await res.json()) as { data?: { mode?: string; aggregated?: Record<string, unknown>; transferBurdenedGiftBreakdown?: Out["whole"] }; error?: unknown };
  const a = (json.data?.aggregated ?? {}) as Record<string, unknown>;
  return {
    status: res.status, error: json.error, mode: json.data?.mode,
    totalTax: a.totalTax as number, determinedTax: a.determinedTax as number, totalGain: a.totalTransferGain as number,
    penaltyTax: (a.penaltyTax as number) ?? 0, props: (a.properties as Prop[]) ?? [], warnings: (a.warnings as string[]) ?? [],
    whole: json.data?.transferBurdenedGiftBreakdown,
  };
}
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));

// ─────────────────────────────────────────────────────────────────────
describe("GC-1 GB+GB 전 자산 부담부증여 — §159 반영", () => {
  it.each([
    ["K-5 환산", K5, 139_906_800, 494_000_000],
    ["K-4 실지", K4, 211_563_000, 700_000_000],
    ["K-6 매매사례", K6, 139_906_800, 494_000_000],
    ["K-7 감정", K7, 139_906_800, 494_000_000],
    ["STD 기준시가", STD, 40_311_700, 194_000_000],
  ])("%s", async (_n, bg, tax, gain) => {
    const f = form([gb(1, bg), gb(2, bg)]);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(tax);
    expect(r.totalGain).toBe(gain);
    // 모든 카드가 취득가액을 갖는다 — 종전엔 0
    expect(r.props.length).toBe(4);
    for (const p of r.props) expect(p.acquisitionPrice).toBeGreaterThan(0);
  });

  it("STD: 주택+주택 전 자산 부담부증여 대조와 같은 세액(40,311,700)", async () => {
    const r = await run(form([housingBg(1), housingBg(2)]));
    expect(r.totalTax).toBe(40_311_700);
  });
});

describe("GC-2 주택·GB 혼합(전 자산 부담부증여)", () => {
  it("주택(주)+GB(컴패니언) K-5", async () => {
    const f = form([housingBg(1), gb(2, K5)]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(88_738_606);
    expect(r.totalGain).toBe(342_650_000);
  });
  it("GB(주)+주택(컴패니언) K-5", async () => {
    const r = await run(form([gb(1, K5), housingBg(2)]));
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(88_738_606);
    expect(r.totalGain).toBe(342_650_000);
  });
});

// ⚠️ K-4/K-6/K-7 은 대조하지 않는다 — 물건 단위 명세(`buildCompanionBurdenedGiftWholeInfo`)가 «실지/매매사례/감정 취득가액»을 주 자산 값 그대로 두고
//    합산하지 않아 **비-GB 컴패니언(주택 K-4)에서도** 명세의 취득가액이 카드 합의 1/2 이다(표시 전용 · 세액 무관 · 계획서 §10 V-9, 이 PR 범위 밖).
describe("GC-3 양도세 카드 ↔ 증여세 카드(물건 단위 §159 명세) 정합 — 한 화면 모순 해소", () => {
  it.each([["K-5", K5], ["STD", STD]] as const)("%s: Σ 카드 양도가액·취득가액·필요경비 = burdenedGift.perAsset 합", async (_n, bg) => {
    const r = await run(form([gb(1, bg), gb(2, bg)]));
    expect(r.whole).toBeDefined();
    const w = r.whole!;
    const sum = (k: keyof Prop) => r.props.reduce((s, p) => s + (p[k] as number), 0);
    expect(sum("transferPrice")).toBe(w.perAsset.land.transferPrice + w.perAsset.building.transferPrice);
    expect(sum("transferPrice")).toBe(w.assumedDebtAmount);
    expect(sum("acquisitionPrice")).toBe(w.perAsset.land.acquisitionPrice + w.perAsset.building.acquisitionPrice);
    expect(sum("necessaryExpense")).toBe(w.perAsset.land.estimatedDeduction + w.perAsset.building.estimatedDeduction);
  });
});

describe("GC-4 회귀 0 (값은 수정 전 실측)", () => {
  it("비부담부증여 컴패니언 GB+GB (실가 모드) — 141,966,000", async () => {
    const reg = (id: number) => gb(id, { fixedAcquisitionPrice: "250,000,000", actualSalePrice: "500,000,000", standardPriceAtTransfer: "400,000,000" });
    const f = form([reg(1), reg(2)], { bundledSaleMode: "actual", contractTotalPrice: "1,000,000,000" });
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.totalTax).toBe(141_966_000);
    expect(r.whole).toBeUndefined();
  });
  it("주택+주택 컴패니언 부담부증여 — 40,311,700", async () => {
    const r = await run(form([housingBg(1), housingBg(2)]));
    expect(r.totalTax).toBe(40_311_700);
  });
  it("단건 GB 부담부증여 — K-5 57,552,880 · K-4 91,135,000", async () => {
    for (const [bg, tax] of [[K5, 57_552_880], [K4, 91_135_000]] as const) {
      const r = await run(form([gb(1, bg)], { assetSplitMode: undefined, contractTotalPrice: "1,000,000,000" }));
      expect(r.totalTax).toBe(tax);
    }
  });
  it("혼합 묶음(GB 일반 양도 + 주택 부담부증여) — ⑧ 이 계속 차단", () => {
    const reg = gb(1, { fixedAcquisitionPrice: "250,000,000", actualSalePrice: "500,000,000", standardPriceAtTransfer: "400,000,000" });
    const f = form([reg, housingBg(2)], { bundledSaleMode: "actual", contractTotalPrice: "1,000,000,000" });
    expect(issues(f).map((i) => i.message).join("\n")).toContain("일반 양도 자산과 부담부증여 자산은 함께 양도로 계산할 수 없습니다");
  });
});

// ── §114조의2 본인 신축 신호(PR-5b)가 컴패니언 카드에도 붙는다 ─────────────────────
describe("GC-5 §114조의2 × 컴패니언 GB 부담부증여 (K-5 건물 환산취득가 125,000,000×5% · K-7 감정 150,000,000×5%)", () => {
  const SELF = { gbBuildingAcquisitionCause: "newConstruction", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", acquisitionDate: "2022-01-10", buildingAcquisitionDate: "2022-01-10" };
  const NOTICE = "일반건물 부담부증여에서 양도인 본인이 신축한 건물";
  const bld = (r: Out) => r.props.filter((p) => p.propertyId.startsWith("building"));

  it("단건 대조 — K-5 71,655,100 (가산세 6,250,000 · 고지 있음)", async () => {
    const r = await run(form([gb(1, { ...K5, ...SELF })], { assetSplitMode: undefined, contractTotalPrice: "1,000,000,000" }));
    expect(r.totalTax).toBe(71_655_100);
    expect(r.penaltyTax).toBe(6_250_000);
    expect(r.warnings.join("\n")).toContain(NOTICE);
  });
  it.each([
    ["K-5", K5, 168_872_000, 12_500_000, 125_000_000],
    ["K-7", K7, 168_542_000, 15_000_000, 150_000_000],
  ])("두 자산 모두 신축 · %s — 건물 카드마다 base×5%, 고지 1회", async (_n, bg, tax, pen, base) => {
    const r = await run(form([gb(1, { ...bg, ...SELF }), gb(2, { ...bg, ...SELF })]));
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(tax);
    expect(r.penaltyTax).toBe(pen);
    expect(bld(r).map((p) => p.penaltyBase)).toEqual([base, base]);
    expect(r.props.filter((p) => p.propertyId.startsWith("land")).every((p) => !p.penaltyTax)).toBe(true); // 토지 카드엔 안 붙는다(D4)
    expect(r.warnings.filter((w) => w.includes(NOTICE)).length).toBe(1);
  });
  it("컴패니언만 신축 — 그 자산 건물 카드에만 붙는다", async () => {
    const r = await run(form([gb(1, K5), gb(2, { ...K5, ...SELF })]));
    expect(r.penaltyTax).toBe(6_250_000);
    expect(bld(r).map((p) => p.penaltyTax ?? 0)).toEqual([0, 6_250_000]);
  });
  it("[회귀 0] 신축이 아니면(매매) 가산세·고지 없음", async () => {
    const r = await run(form([gb(1, K5), gb(2, K5)]));
    expect(r.penaltyTax).toBe(0);
    expect(r.warnings.join("\n")).not.toContain(NOTICE);
  });
});

describe("GC-6 카드 빌더 직접 — 부담부증여 + 비-실가 payload 는 던진다 (침묵 무시 금지)", () => {
  it("buildGbCompanionItems: transferType burdened_gift + actualPriceMode 아님 → INVALID_INPUT", async () => {
    const { buildGbCompanionItems } = await import("@/app/api/calc/transfer/general-building-part-cards");
    const gbv = { landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000, zoneType: "general_residential", acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000, buildingAcquisitionCause: "purchase" };
    const info = { valuationMode: "sangjeungbeop_market", acquisitionMethod: "converted", marketValueAtTransfer: 1_000_000_000, lendingDepositTotal: 0, mortgageDebtAmount: 500_000_000, annualRentTotal: 0, landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000 };
    const engine = { transferPrice: 500_000_000, transferDate: new Date("2026-03-01"), acquisitionDate: new Date("2015-03-01"), acquisitionPrice: 0, expenses: 0, reductions: [], transferType: "burdened_gift", burdenedGiftInfo: info } as never;
    expect(() => buildGbCompanionItems({ ...gbv, actualPriceMode: false }, engine, { assetId: "a", assetLabel: "A" })).toThrow(/실지 경로로만/);
    expect(() => buildGbCompanionItems({ ...gbv, actualPriceMode: true }, engine, { assetId: "a", assetLabel: "A" })).not.toThrow();
  });

  const gbvActual = { landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000, zoneType: "general_residential", acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000, buildingAcquisitionCause: "purchase", actualPriceMode: true };
  const info = { valuationMode: "sangjeungbeop_market", acquisitionMethod: "converted", marketValueAtTransfer: 1_000_000_000, lendingDepositTotal: 0, mortgageDebtAmount: 500_000_000, annualRentTotal: 0, landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000 };
  const engineOf = (over: object) => ({ transferPrice: 500_000_000, transferDate: new Date("2026-03-01"), acquisitionDate: new Date("2015-03-01"), acquisitionPrice: 0, expenses: 0, reductions: [], ...over }) as never;

  it("부담부증여 표지(transferType)가 없으면 info 가 있어도 카드 빌더는 §159를 소비하지 않는다 (엔진 STEP 0.48 의 게이트와 같다)", async () => {
    const { buildGbCompanionItems } = await import("@/app/api/calc/transfer/general-building-part-cards");
    const src = { assetId: "a", assetLabel: "A" };
    const plain = buildGbCompanionItems({ ...gbvActual }, engineOf({}), src);
    const withInfoNoMarker = buildGbCompanionItems({ ...gbvActual }, engineOf({ burdenedGiftInfo: info }), src);
    const marked = buildGbCompanionItems({ ...gbvActual }, engineOf({ burdenedGiftInfo: info, transferType: "burdened_gift" }), src);
    expect(withInfoNoMarker).toEqual(plain);
    expect(marked).not.toEqual(plain);
  });

  it("부담부증여는 의제취득일 전 상속·증여 재선택(PR-4)을 타지 않는다 — §159가 취득가액을 정한다 (단건과 같다)", async () => {
    const { buildGbCompanionItems } = await import("@/app/api/calc/transfer/general-building-part-cards");
    const src = { assetId: "a", assetLabel: "A" };
    const eng = engineOf({ burdenedGiftInfo: info, transferType: "burdened_gift" });
    const base = buildGbCompanionItems({ ...gbvActual }, eng, src);
    // ③(환산)이 이기게 만드는 ①②(신고가·§164)가 있어도 — 재선택하면 환산 payload 가 되어 가드가 던진다
    const withClause = buildGbCompanionItems({ ...gbvActual, landPreDeemedClauseA: { reported: 1, sec164: 1 } }, eng, src);
    // 카드 항목(세액 입력)은 같다. 카드에 붙는 자산 명세(`gbAssetBurdenedGift` — 표시 전용, 부담부증여 묶음은 언제나 싣는다)는 §159 의제 규칙(PR-7a)을 따로 읽으므로 비교에서 뺀다.
    const taxItems = (items: typeof base) => items.map(({ gbAssetBurdenedGift: _g, ...rest }) => rest);
    expect(base.every((it) => it.gbAssetBurdenedGift !== undefined)).toBe(true);
    expect(taxItems(withClause)).toEqual(taxItems(base));
  });
});

describe("GC-5e [회귀 0] 비부담부증여 신축 감정 컴패니언은 §114조의2 부담부증여 고지를 받지 않는다", () => {
  it("일반 양도 GB 2건(본인 신축 · 감정가액) — 가산세가 붙어도 부담부증여 고지는 없다", async () => {
    const SELF = { gbBuildingAcquisitionCause: "newConstruction", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", acquisitionDate: "2022-01-10", buildingAcquisitionDate: "2022-01-10", isAppraisalAcquisition: true, landAcquisitionPrice: "200,000,000", buildingAcquisitionPrice: "300,000,000" };
    const reg = (id: number) => gb(id, { ...SELF, actualSalePrice: "500,000,000", standardPriceAtTransfer: "400,000,000" });
    const f = form([reg(1), reg(2)], { bundledSaleMode: "actual", contractTotalPrice: "1,000,000,000" });
    const r = await run(f);
    expect(issues(f)).toEqual([]);
    expect(r.status).toBe(200);
    // 판별력 — 감정 카드는 `penaltyAxis`를 싣고 가산세가 실제로 붙는다(그래도 «부담부증여» 고지는 없어야 한다)
    expect(r.penaltyTax).toBeGreaterThan(0);
    expect(r.warnings.join("\n")).not.toContain("일반건물 부담부증여에서 양도인 본인이 신축한 건물");
  });
});
