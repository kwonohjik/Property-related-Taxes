/**
 * anchor — 일반건물 **지분 분할 취득(축 B) × 부담부증여** §159 지원 (PR-3 · 계획서 `docs/00-pm/gb-burdened-gift-silent-drop.plan.md` §2.1·§4 (A))
 *
 * ## 결함
 * route 5-0(`generalBuildingShares`)이 `burdenedGiftInfo`를 넘기지 않았다. ④는 `transferPrice`에 **채무 전액**을 실었고 5-0이 그것을 «총양도가»로 읽어
 * 지분 카드가 일반 양도로 계산됐다(취득가액 0 · 개산공제 0 · 양도차익 = 채무 전부). 응답에 §159·증여세 명세도 없었다.
 * 실측 K-5 60/40: 총납부 141,966,000(정상 57,552,880).
 *
 * ## 이 anchor 가 지키는 것
 * 1. **지분 합 = 단건 100%** (같은 취득일) — K-5/K-4/K-6/K-7/STD. 저장소 축 B 규약(채무는 지분 안분 → B/C 보존, 평가액은 엔진이 지분 축소).
 *    법문(소령 §159)이 정하는 것은 증여계약 단위 B/C 뿐이라 이 규약은 **저장소 설계 전제**다(계획서 §3).
 * 2. 취득일이 다른 지분(2009/2015) · 지분별 취득시 기준시가가 다른 지분 — 카드 양도차익이 «그 지분 자기 값 × 지분율»이다.
 * 3. 결과에 증여세·§159 명세(`transferBurdenedGiftBreakdown`)가 실리고 카드 합과 일치한다(Q-6).
 * 4. `contractTotalPrice`(총 양도가액 입력)와 무관하다 — 부담부증여의 양도가액은 §159가 정한다.
 * 5. ⑫: 지분이 부담부증여인데 지분별 `burdenedGiftInfo`가 없으면 400(옛 클라이언트 침묵 무시 금지).
 * 6. §114조의2 본인 신축 — base 가 지분율만큼 줄어든다(비부담부증여 지분 선례 `gb-card-built-penalty` SH1: 60% 지분 base 150,000,000 / 7,500,000 과 같은 규약).
 * 7. 회귀 0: 비부담부증여 GB 지분 · 컴패니언(PR-2 값) · 단건 GB 부담부증여 불변.
 *
 * 수치는 mock 세율표 실측값이다(전후 대조가 목적).
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
import { GB_BG_ACTUAL_PATH_REQUIRED_MESSAGE } from "@/lib/api/transfer-tax-schema-gb-bg-refines";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

// ── 픽스처 ────────────────────────────────────────────────────────────
function gb(id: number, over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(id),
    addressJibun: "서울 강남구 테스트동 1-1",
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

/** 축 B — 자산 1 = 입력 전부(60%) · 자산 2 = 지분 카드(② 숨김 → transferType 기본 «일반», 취득 정보만) */
function shares(bg: object, o: { d1?: string; d2?: string; s1?: object; s2?: object; ctp?: string } = {}): TransferFormData {
  const a1 = gb(1, { ...bg, ownershipNumerator: "60", ownershipDenominator: "100", acquisitionDate: o.d1 ?? "2015-03-01", ...o.s1 });
  const a2 = {
    ...makeDefaultAsset(2), assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: o.d2 ?? "2015-03-01",
    ownershipNumerator: "40", ownershipDenominator: "100", gbBuildingAcquisitionCause: "purchase",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", ...o.s2,
  } as AssetForm;
  return {
    transferDate: "2026-03-01", filingDate: "2026-05-31", assets: [a1, a2], houses: [], presaleRights: [],
    contractTotalPrice: o.ctp ?? "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
    assetSplitMode: "fractional",
  } as unknown as TransferFormData;
}
const single = (bg: object, over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: "2026-03-01", filingDate: "2026-05-31", assets: [gb(1, { ...bg, ...over })], houses: [], presaleRights: [],
    contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
  }) as unknown as TransferFormData;

interface Prop { propertyId: string; transferPrice: number; acquisitionPrice: number; necessaryExpense: number; transferGain: number; penaltyTax?: number; penaltyBase?: number }
interface PA { transferPrice: number; acquisitionPrice: number; estimatedDeduction: number }
interface Out {
  status: number; error?: { fieldErrors?: Record<string, unknown> }; body: Record<string, unknown>;
  totalTax: number; determinedTax: number; totalGain: number; penaltyTax: number; props: Prop[]; warnings: string[];
  whole?: { assumedDebtAmount: number; debtRatio: number; sangjeungbeopValuation?: unknown; perAsset: { land: PA; building: PA }; giftTax?: { finalTax: number } };
}
async function post(body: Record<string, unknown>): Promise<Omit<Out, "body">> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
      annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    }),
  }));
  const json = (await res.json()) as { data?: { aggregated?: Record<string, unknown>; transferBurdenedGiftBreakdown?: Out["whole"] }; error?: Out["error"] };
  const a = (json.data?.aggregated ?? {}) as Record<string, unknown>;
  return {
    status: res.status, error: json.error,
    totalTax: a.totalTax as number, determinedTax: a.determinedTax as number, totalGain: a.totalTransferGain as number,
    penaltyTax: (a.penaltyTax as number) ?? 0, props: (a.properties as Prop[]) ?? [], warnings: (a.warnings as string[]) ?? [],
    whole: json.data?.transferBurdenedGiftBreakdown,
  };
}
async function bodyOf(f: TransferFormData): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  return cap.body!;
}
async function run(f: TransferFormData): Promise<Out> {
  const body = await bodyOf(f);
  return { ...(await post(body)), body };
}
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));
const card = (r: Out, id: string) => r.props.find((p) => p.propertyId === id)!;

// ─────────────────────────────────────────────────────────────────────
describe("GS-1 지분 합 = 단건 100% (같은 취득일 · 60/40)", () => {
  it.each([
    ["K-5 환산", K5, {}, 57_552_880],
    ["K-4 실지", K4, {}, 91_135_000],
    ["K-6 매매사례", K6, { bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionLand: "200,000,000", bgPresumedAcquisitionBuilding: "300,000,000" }, 57_552_880],
    ["K-7 감정", K7, { bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionLand: "200,000,000", bgPresumedAcquisitionBuilding: "300,000,000" }, 57_552_880],
    ["STD 기준시가", STD, {}, 12_978_240],
  ])("%s", async (_n, bg, s2, tax) => {
    const f = shares(bg, { s2 });
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(tax);
    // 단건 100%와 같은 입력의 대조 — 같은 값이어야 «지분 합 = 단건»
    const one = await run(single(bg));
    expect(one.totalTax).toBe(tax);
    expect(r.totalGain).toBe(one.totalGain);
    expect(r.props.length).toBe(4);
    for (const p of r.props) expect(p.acquisitionPrice).toBeGreaterThan(0);
  });

  it("총 양도가액 입력(contractTotalPrice)과 무관하다 — 양도가액은 §159가 정한다", async () => {
    const a = await run(shares(K5, { ctp: "1,000,000,000" }));
    const b = await run(shares(K5, { ctp: "300,000,000" }));
    expect(b.totalTax).toBe(a.totalTax);
    expect(a.totalTax).toBe(57_552_880);
  });
});

describe("GS-2 취득일·취득시 기준시가가 다른 지분", () => {
  it("취득일 2009/2015 · K-5 — 52,597,072 (지분별 보유기간이 다르므로 단건과 같지 않다)", async () => {
    const r = await run(shares(K5, { d1: "2009-03-01", d2: "2015-03-01" }));
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(52_597_072);
    expect(r.totalGain).toBe(247_000_000);
  });

  it("지분별 취득시 기준시가 상이(지분2: 토지 1,500,000/㎡ · 건물 150,000,000) · K-5 — 카드 양도차익 = 그 지분 자기 값 × 지분율", async () => {
    const S2 = { gbAcqLandPricePerSqm: "1,500,000", gbAcqBuildingValue: "150,000,000" };
    const r = await run(shares(K5, { d2: "2018-03-01", s2: S2 }));
    expect(r.status).toBe(200);
    // 독립 기대값 — 단건 100%를 각 지분 자기 입력으로 돌린 카드 양도차익 × 지분율 (정수 절사 ±1)
    const one1 = await run(single(K5));
    const one2 = await run(single(K5, { acquisitionDate: "2018-03-01", ...S2 }));
    const g = (o: Out, id: string) => card(o, id).transferGain;
    expect(Math.abs(card(r, "land#0").transferGain - Math.round(g(one1, "land") * 0.6))).toBeLessThanOrEqual(1);
    expect(Math.abs(card(r, "building#0").transferGain - Math.round(g(one1, "building") * 0.6))).toBeLessThanOrEqual(1);
    expect(Math.abs(card(r, "land#1").transferGain - Math.round(g(one2, "land") * 0.4))).toBeLessThanOrEqual(1);
    expect(Math.abs(card(r, "building#1").transferGain - Math.round(g(one2, "building") * 0.4))).toBeLessThanOrEqual(1);
    // 두 지분 값이 실제로 다르다 — 복제(전 지분 같은 값)가 아니다
    expect(card(r, "land#1").acquisitionPrice / 0.4).not.toBe(card(r, "land#0").acquisitionPrice / 0.6);
  });

  it("지분별 감정가액 상이(K-7 · 지분2 토지 3억 + 건물 4억 · 2018 취득) — 카드 취득가액 = 그 지분 자기 감정가액 × 채무비율 × 지분율", async () => {
    const r = await run(shares(K7, { d2: "2018-03-01", s2: { bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionLand: "300,000,000", bgPresumedAcquisitionBuilding: "400,000,000" } }));
    expect(r.status).toBe(200);
    // 채무비율 0.5 × 지분율: 지분1 토지 2억×0.5×0.6 = 60,000,000 / 지분2 토지 3억×0.5×0.4 = 60,000,000
    expect(card(r, "land#0").acquisitionPrice).toBe(60_000_000);
    expect(card(r, "building#0").acquisitionPrice).toBe(90_000_000);
    expect(card(r, "land#1").acquisitionPrice).toBe(60_000_000);
    expect(card(r, "building#1").acquisitionPrice).toBe(80_000_000);
  });
});

describe("GS-1b 임대평가 승(시가 6억 < 임대평가 7억) — 지분 스케일(`ownershipRatio`)이 필요한 조합: 단건 100%와 같다", () => {
  // 시가·기준시가 모드에서는 B·A·C 가 함께 약분돼 스케일 유무가 결과를 못 바꾼다. 그러나 임대평가·담보평가 항은 «지분 인수분 절대금액»(④가 채무와 함께 × r)이라
  // 평가액을 줄이지 않으면 C 가 (시가 100% vs 임대평가 r배)로 어긋나 B/C 가 틀린다 — 이 조합이 `ownershipRatio` 전달의 판별력 있는 anchor 다.
  // 임대평가 = 보증금 100,000,000 + 연 임대료 72,000,000 ÷ 12% = 700,000,000 > 시가 600,000,000 → C = 700,000,000, 채무비율 B/C = 1/7.
  // ⚠️ K-5(환산)는 양도가액·환산 비율이 B/C 에 약분돼 스케일 유무를 못 가린다(실측) — 취득가액이 A × **B/C** 인 K-4·K-7 이 판별력이 있다.
  const RENTAL = { bgMarketValueAtTransfer: "600,000,000", bgLendingDepositTotal: "100,000,000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "", bgAnnualRentTotal: "72,000,000" };
  it.each([
    ["K-4 실지", { ...K4, ...RENTAL }, {}],
    ["K-7 감정", { ...K7, ...RENTAL }, { bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionLand: "200,000,000", bgPresumedAcquisitionBuilding: "300,000,000" }],
    ["K-5 환산", { ...K5, ...RENTAL }, {}],
  ])("%s", async (_n, bg, s2) => {
    const f = shares(bg, { s2 });
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    const one = await run(single(bg));
    expect(r.status).toBe(200);
    expect(one.status).toBe(200);
    expect(one.whole?.sangjeungbeopValuation).toBeDefined();
    expect(r.totalTax).toBe(one.totalTax);
    expect(r.totalGain).toBe(one.totalGain);
    expect(r.whole?.debtRatio).toBeCloseTo(one.whole!.debtRatio, 10);
  });
});

describe("GS-1c 담보평가 승(시가 6억 < 담보 7억) — API 직접(⑧이 막는 조합) · `ownershipRatio` 지분 축소가 판별되는 유일한 조합", () => {
  // ⑧은 «채무 > 시가»를 막으므로 폼으로는 못 만든다. 그래도 서버는 이 payload 를 받는다 — 지분 스케일이 없으면 C 가 max(시가 6억, 담보 r×7억)=6억(시가)로 남아
  // B/C = 0.7 이 되고(정답 1.0 — 담보평가 승), 취득가액이 어긋난다(실측: 지분 합 140,000,000 ≠ 단건 200,000,000). 시가·기준시가·임대(실측: 임대는 시가 모드 max 에 안 든다) 모드는 B·A·C 가 약분돼 스케일 유무가 안 보인다(GS-1b 주석).
  it("K-4 요청 · 지분 합 = 단건 100% (담보평가 승이라 취득가액은 취득시 기준시가 합 200,000,000 × B/C 1.0 — 소령 §159①1호 괄호)", async () => {
    const infoOf = (o: Record<string, unknown>, debt: number) => ({ ...o, mortgageDebtAmount: debt, mortgageSetAmount: debt });
    const base = await bodyOf(shares(K4));
    const sh = base.generalBuildingShares as { burdenedGiftInfo: Record<string, unknown>; ownershipRatio: number }[];
    const bad = {
      ...base,
      burdenedGiftInfo: infoOf({ ...(base.burdenedGiftInfo as object), marketValueAtTransfer: 600_000_000 }, 420_000_000),
      generalBuildingShares: sh.map((x, i) => ({ ...x, burdenedGiftInfo: infoOf({ ...x.burdenedGiftInfo, marketValueAtTransfer: 600_000_000 }, i === 0 ? 420_000_000 : 280_000_000) })),
    };
    const r = await post(bad);
    expect(r.status).toBe(200);
    const sb = await bodyOf(single(K4));
    const one = await post({ ...sb, burdenedGiftInfo: infoOf({ ...(sb.burdenedGiftInfo as object), marketValueAtTransfer: 600_000_000 }, 700_000_000) });
    expect(one.status).toBe(200);
    const acq = (o: { props: Prop[] }) => o.props.reduce((n, p) => n + p.acquisitionPrice, 0);
    expect(acq(one)).toBe(200_000_000); // 취득시 기준시가 합(1억+1억) × 채무비율 1.0 — 담보평가가 이기면 산정방식과 무관하게 기준시가(1h-G1-2)
    expect(acq(r)).toBe(acq(one));
    expect(r.totalTax).toBe(one.totalTax);
  });
});

describe("GS-3 증여세·§159 명세(Q-6) — 카드 합과 일치", () => {
  it.each([["K-5", K5], ["STD", STD]] as const)("%s", async (_n, bg) => {
    const r = await run(shares(bg));
    expect(r.whole).toBeDefined();
    const w = r.whole!;
    const sum = (k: keyof Prop) => r.props.reduce((s, p) => s + (p[k] as number), 0);
    expect(sum("transferPrice")).toBe(w.assumedDebtAmount);
    expect(sum("acquisitionPrice")).toBe(w.perAsset.land.acquisitionPrice + w.perAsset.building.acquisitionPrice);
    expect(sum("necessaryExpense")).toBe(w.perAsset.land.estimatedDeduction + w.perAsset.building.estimatedDeduction);
    // 증여세는 물건 단위 1회 — 단건과 같다
    const one = await run(single(bg));
    expect(w.giftTax?.finalTax).toBe(one.whole?.giftTax?.finalTax);
    expect(w.debtRatio).toBe(one.whole?.debtRatio);
  });
});

describe("GS-4 ⑫ — 지분별 burdenedGiftInfo 누락은 400 (침묵 무시 금지)", () => {
  it("정상 body 200 → 지분의 info 를 지우면 400", async () => {
    const body = await bodyOf(shares(K5));
    const sh = body.generalBuildingShares as Record<string, unknown>[];
    expect(sh.every((s) => s.burdenedGiftInfo)).toBe(true);
    expect((await post(body)).status).toBe(200);
    const bad = { ...body, generalBuildingShares: [sh[0], { ...sh[1], burdenedGiftInfo: undefined }] };
    const r = await post(bad);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.error)).toContain("generalBuildingShares.1.burdenedGiftInfo");
    expect(JSON.stringify(r.error)).toContain("부담부증여");
  });
  it("부담부증여가 아니면 지분에 info 가 없어도 정상(회귀 0)", async () => {
    const reg = (id: number, num: string) => gb(id, { ownershipNumerator: num, ownershipDenominator: "100", fixedAcquisitionPrice: "250,000,000" });
    const f = { ...shares({}), assets: [reg(1, "60"), reg(2, "40")] } as unknown as TransferFormData;
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.whole).toBeUndefined();
  });
});

describe("GS-5 §114조의2 본인 신축 × 지분 부담부증여 — base 가 지분율만큼 줄어든다", () => {
  const SELF = { gbBuildingAcquisitionCause: "newConstruction", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", acquisitionDate: "2022-01-10", buildingAcquisitionDate: "2022-01-10" };
  const SELF2 = { ...SELF, gbBuildingAcquisitionCause: "newConstruction" };
  const NOTICE = "일반건물 부담부증여에서 양도인 본인이 신축한 건물";
  const bld = (r: Out) => r.props.filter((p) => p.propertyId.startsWith("building"));

  it("두 지분 모두 신축 · K-5 — 건물 카드 base 75,000,000 / 50,000,000 (= 125,000,000 × 지분율) · 합 6,250,000 = 단건", async () => {
    const r = await run(shares(K5, { d1: "2022-01-10", s1: SELF, d2: "2022-01-10", s2: SELF2 }));
    expect(r.status).toBe(200);
    expect(bld(r).map((p) => p.penaltyBase)).toEqual([75_000_000, 50_000_000]);
    expect(bld(r).map((p) => p.penaltyTax)).toEqual([3_750_000, 2_500_000]);
    expect(r.penaltyTax).toBe(6_250_000);
    const one = await run(single(K5, SELF));
    expect(one.penaltyTax).toBe(6_250_000);
    expect(r.totalTax).toBe(one.totalTax);
    expect(r.warnings.filter((w) => w.includes(NOTICE)).length).toBe(1);
  });
  it("지분 60%만 신축 · K-7 — 건물#0 감정가액 150,000,000×0.6 = 90,000,000 × 5% = 4,500,000 (비부담부증여 SH1 선례와 같은 규약: 지분율만큼)", async () => {
    const f = shares(K7, { d1: "2022-01-10", s1: SELF, s2: { bgPresumedAcquisitionLand: "200,000,000", bgPresumedAcquisitionBuilding: "300,000,000" } });
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(bld(r).map((p) => p.penaltyBase ?? 0)).toEqual([90_000_000, 0]);
    expect(r.penaltyTax).toBe(4_500_000);
  });
  it("[회귀 0] 비부담부증여 지분 신축(감정가액)은 가산세가 붙어도 부담부증여 고지가 없다", async () => {
    const APPR = { isAppraisalAcquisition: true, landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "300,000,000" };
    const reg = (id: number, num: string) => gb(id, { ...SELF, ownershipNumerator: num, ownershipDenominator: "100", ...APPR });
    const f = { ...shares({}), assets: [reg(1, "60"), reg(2, "40")] } as unknown as TransferFormData;
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.penaltyTax).toBeGreaterThan(0); // 판별력 — 감정 신축은 가산세가 실제로 붙는다
    expect(r.warnings.join("\n")).not.toContain(NOTICE);
  });
  it("[회귀 0] 신축이 아니면 가산세·고지 없음", async () => {
    const r = await run(shares(K5));
    expect(r.penaltyTax).toBe(0);
    expect(r.warnings.join("\n")).not.toContain(NOTICE);
  });
});

describe("GS-6 회귀 0 (값은 수정 전 실측 — 계획서 §2.4의 141,966,000 은 양도 5억 입력의 값이라 이 픽스처와 다르다)", () => {
  it("비부담부증여 GB 지분 60/40(실가 · 양도 10억 · 취득 2.5억) — 229,581,000 = 단건 100%", async () => {
    const reg = (id: number, num: string) => gb(id, { ownershipNumerator: num, ownershipDenominator: "100", fixedAcquisitionPrice: "250,000,000" });
    const f = { ...shares({}), assets: [reg(1, "60"), reg(2, "40")] } as unknown as TransferFormData;
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    // 지분 합 = 단건 실가(양도 10억 · 취득 2.5억): 단건과 같은 입력의 대조
    const one = await run(single({}, { fixedAcquisitionPrice: "250,000,000" }));
    expect(r.totalTax).toBe(one.totalTax);
    expect(r.totalTax).toBe(229_581_000);
  });
  it("컴패니언 GB+GB 부담부증여(PR-2) — 139,906,800 · 단건 GB 부담부증여 — 57,552,880", async () => {
    const co = {
      transferDate: "2026-03-01", filingDate: "2026-05-31", assets: [gb(1, K5), gb(2, { ...K5, addressJibun: "서울 강남구 테스트동 2-2" })], houses: [], presaleRights: [],
      contractTotalPrice: "", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, assetSplitMode: "companion",
    } as unknown as TransferFormData;
    expect((await run(co)).totalTax).toBe(139_906_800);
    expect((await run(single(K5))).totalTax).toBe(57_552_880);
  });
});

describe("GS-7 ⑥ 사이드바 — 지분 부담부증여 행이 §159 값을 읽는다 (계산 후 «계산 후 표시»에 갇히지 않는다)", () => {
  it("계산 전 pending → 계산 후 지분별 양도가액 300,000,000 / 200,000,000 · 취득가액 150,000,000 / 100,000,000 · 필요경비(개산공제) 1,800,000 / 1,200,000", async () => {
    const f = shares(K5);
    const before = computeTransferPerAssetSummary(f, null).rows;
    expect(before.map((r) => r.salePending)).toEqual([true, true]);
    const body = await bodyOf(f);
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
    }));
    const data = (await res.json()).data;
    const after = computeTransferPerAssetSummary(f, data).rows;
    expect(after.map((r) => [r.salePending, r.acqPending, r.expensePending])).toEqual([[false, false, false], [false, false, false]]);
    expect(after.map((r) => r.salePrice)).toEqual([300_000_000, 200_000_000]);
    expect(after.map((r) => r.acqPrice)).toEqual([150_000_000, 100_000_000]);
    expect(after.map((r) => r.expense)).toEqual([1_800_000, 1_200_000]);
    // 합 = §159 채무액 · 물건 단위 명세의 취득가액
    expect(after.reduce((n, r) => n + r.salePrice, 0)).toBe(data.transferBurdenedGiftBreakdown.assumedDebtAmount);
  });
  it("[회귀 0] 비부담부증여 지분 행은 종전 그대로 — 계산 전·후 모두 총 양도가액 × 지분율", async () => {
    const reg = (id: number, num: string) => gb(id, { ownershipNumerator: num, ownershipDenominator: "100", fixedAcquisitionPrice: "250,000,000", capitalExpenditure: "30,000,000" });
    const f = { ...shares({}), assets: [reg(1, "60"), reg(2, "40")] } as unknown as TransferFormData;
    expect(computeTransferPerAssetSummary(f, null).rows.map((r) => r.salePrice)).toEqual([600_000_000, 400_000_000]);
    const data = (await (await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...(await bodyOf(f)), isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
    }))).json()).data;
    const rows = computeTransferPerAssetSummary(f, data).rows;
    expect(rows.map((r) => r.salePrice)).toEqual([600_000_000, 400_000_000]);
    // 취득가액·필요경비도 종전 경로(입력값 × 지분율)다 — `gbShareBgCards`가 부담부증여가 아닌 지분 행을 가로채지 않는다
    expect(rows.map((r) => r.acqPrice)).toEqual([150_000_000, 100_000_000]);
    expect(rows.map((r) => r.expense)).toEqual([18_000_000, 12_000_000]);
  });
});
