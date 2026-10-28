/**
 * anchor — 이월과세 × 당초 증여 채무 부분(매입분) PR-2: 일반건물 파트(E2) · **폼 → ④ → ⑧ → ⑫ → route → 엔진** 전 구간.
 * 설계서 `docs/02-design/features/carryover-gift-debt-purchased-part-parts.engine.design.md` §3~§6·§9.
 * 엔진 레벨은 `__tests__/tax-engine/transfer-tax/gb-carryover-debt-parts.anchor.test.ts`, 경로 2(토지 파트 2-way 환산)는 `transfer.route.carryover-gift-tax-numerator-net.anchor.test.ts`.
 *
 *  · CDP-1 건물만 이월과세(R1·R3) — 토지 파트와 대칭이라 같은 141,690,000(손계산)
 *  · CDP-2 지분 40% × 채무 — 꼬리 id `land__purchased#1`(R4) · 지분 스케일 후 r 불변 · 카드 수준 손계산
 *  · CDP-3 함께 양도 컴패니언 — 꼬리 id `land__purchased#gb2`
 *  · CDP-4 ⑧ ↔ ⑫ 격자 — ⑧이 통과하면 route는 200, ⑧이 막는 칸은 ⑫가 같은 사유로 필드 위치에서 막는다(V-10)
 *  · CDP-5 ⑫ 단독 차단(API 직접 호출만 닿는 조합) · 엔진 방어선(지분·컴패니언 감면) · 카드 상한 400
 * 세액은 `makeMockRates()` 기준이다.
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
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { shareIndexOf, cardSuffixOf, isSameShare } from "@/lib/tax-engine/general-building-share-id";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Run { status: number; body: Body; det?: number; message?: string; fieldErrors: string[]; props: Body[]; issues: string[] }

const formOf = (assets: unknown[], over: Record<string, unknown> = {}): TransferFormData =>
  ({ ...createDefaultTransferFormData(), assets, transferDate: "2026-03-01", filingDate: "2026-05-31", contractTotalPrice: "1,000,000,000", householdHousingCount: "2", isOneHousehold: false, ...over }) as unknown as TransferFormData;

async function bodyOf(f: TransferFormData): Promise<Body> {
  let captured: Body = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try { await callTransferTaxAPI(f); } catch { /* body 만 필요하다 */ }
  global.fetch = orig;
  return captured;
}
async function post(captured: Body): Promise<Omit<Run, "issues" | "body">> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...captured, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: { aggregated?: Body }; error?: { message?: string; fieldErrors?: Record<string, string[]> } };
  const a = json.data?.aggregated;
  return { status: res.status, det: a?.determinedTax, message: json.error?.message, fieldErrors: Object.keys(json.error?.fieldErrors ?? {}), props: (a?.properties as Body[]) ?? [] };
}
const issuesOf = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)) as Array<{ field?: string; message?: string }>;
async function run(f: TransferFormData): Promise<Run> {
  const body = await bodyOf(f);
  return { body, ...(await post(body)), issues: issuesOf(f).map((i) => i.field ?? "") };
}
const row = (r: Run, id: string) => r.props.find((p) => p.propertyId === id)!;
const splitOf = (r: Run, id: string) => row(r, id).carryoverTaxationDetail.scenarioA.purchasedPartSplit as Body;

// ─── 픽스처 ─── 환산 · 토지 100㎡ × 2,000,000 = 2억 · 건물 2억 · 총 양도가 10억(토지 5억 : 건물 5억) · 양도 2026-03-01 · 취득(현 소유자) 2021-03-01
const gbBase = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building",
    acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2021-03-01",
    useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", ...over,
  }) as AssetForm;
/** 이월과세 서브폼 — 증여 2021-03-01 · 증여자 2005-06-15 취득 1.5억 · 평가액 4억 · 산출세액 3천만 · 과세가액 10억 · 인수채무 1억(r = 0.25). */
const co = (o: Record<string, unknown> = {}) =>
  ({ ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150,000,000", giftDateValuation: "400,000,000",
    giftTaxCalculated: "30,000,000", giftTaxBase: "1,000,000,000", donorRelation: "lineal", donorSameHousehold: "no", giftDebtAssumed: true, giftAssumedDebt: "100,000,000", ...o }) as never;
const buildingOnly = (o: Record<string, unknown> = {}, a: Partial<AssetForm> = {}) =>
  gbBase({ gbBuildingAcquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS }, buildingCarryover: co(o), ...a });
const landOnly = (o: Record<string, unknown> = {}, a: Partial<AssetForm> = {}) => gbBase({ acquisitionCause: "carryover_gift", carryover: co(o), ...a });

describe("CDP-1 건물만 이월과세(R1·R3) — 토지 파트와 대칭", () => {
  /**
   * 건물 평가액 4억 · 채무 1억(r = 0.25) · 상당액 3천만 × (4억 − 1억) ÷ 10억 = 9,000,000. 토지는 이월과세가 아니다(양도가 5억 − 취득 2.5억 − 개산공제 300만 = 2.47억 · 5년 10%).
   *   건물 증여분 = 양도가 5억 × 0.75 = 375,000,000 · 취득 1.5억 × 0.75 = 112,500,000 · 상당액 9,000,000 → 차익 253,500,000 · 장특(증여자 취득 20년) 30% → 177,450,000
   *   건물 매입분 = 125,000,000 − 채무 100,000,000 − (개산공제 3,000,000 − floor(3,000,000 × 0.75) = 750,000) = 24,250,000 · 장특(5년) 10% → 21,825,000
   *   토지 247,000,000 × 90% = 222,300,000 → 합 421,575,000 − 2,500,000 = 419,075,000 × 40% − 25,940,000 = 141,690,000 (B 미적용은 이보다 작아 A 채택)
   */
  it("OFF 156,620,000 → 채무 1억 141,690,000 · 건물 증여분 + 매입분 꼬리 · 와이어는 건물 파트의 채무", async () => {
    const off = await run(formOf([buildingOnly({ giftDebtAssumed: false })]));
    expect([off.status, off.det]).toEqual([200, 156_620_000]);
    expect(off.props.map((p) => p.propertyId)).toEqual(["land", "building"]);
    const f = formOf([buildingOnly()]);
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.body.generalBuildingValuation.buildingCarryoverPart).toMatchObject({ giftDateAssetValue: 400_000_000, giftAssumedDebt: 100_000_000 });
    expect(r.body.generalBuildingValuation.landCarryoverPart).toBeUndefined();
    expect([r.status, r.det]).toEqual([200, 141_690_000]);
    expect(r.props.map((p) => p.propertyId)).toEqual(["land", "building", "building__purchased"]);
    expect([row(r, "building").transferPrice, row(r, "building").acquisitionPrice]).toEqual([375_000_000, 112_500_000]);
    expect([row(r, "building__purchased").transferPrice, row(r, "building__purchased").acquisitionPrice, row(r, "building__purchased").necessaryExpense]).toEqual([125_000_000, 100_000_000, 750_000]);
    // 토지 카드는 이월과세가 아니라 echo가 없고, 건물(증여분) 부모 카드에 붙는다
    expect(row(r, "land").carryoverTaxationDetail).toBeUndefined();
    const s = splitOf(r, "building");
    expect(s).toMatchObject({ debtAmount: 100_000_000, giftValuation: 400_000_000, transferPrice: 500_000_000, donorAcquisitionPrice: 150_000_000 });
    expect(s.purchased).toMatchObject({ propertyId: "building__purchased", acquisitionPrice: 100_000_000, acquisitionDate: "2021-03-01" });
    expect(s.gift).toMatchObject({ propertyId: "building", acquisitionDate: "2005-06-15" });
  });

  it("토지·건물 둘 다 이월과세(각 파트 채무) → 부모 카드 2장 각각 echo · 꼬리 2장", async () => {
    const a = gbBase({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: co(), buildingCarryover: co() });
    const f = formOf([a]);
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.props.map((p) => p.propertyId)).toEqual(["land", "building", "land__purchased", "building__purchased"]);
    expect(splitOf(r, "land").debtAmount).toBe(100_000_000);
    expect(splitOf(r, "building").debtAmount).toBe(100_000_000);
  });
});

describe("CDP-2 지분 40% × 채무 — 꼬리 id 규약(R4)", () => {
  /**
   * 지분 A 60%(2009 매매) · 지분 B 40% 토지만 이월과세. 100% 기준 입력: 증여자 취득 3억 · 자본적지출 4천만 · 평가액 6억 · 채무 1.5억 · 산출세액 8천만 · 과세가액 12억.
   * ④가 × 0.4: 취득 1.2억 · 자본적지출 1,600만 · 평가액 2.4억 · 채무 6천만(r = 0.25 불변). 상당액 8천만 × (2.4억 − 6천만) ÷ 12억 = 12,000,000.
   * 지분 B 토지 양도가 5억 × 40% = 2억 → 증여분 150,000,000 / 매입분 50,000,000. 증여분 취득 1.2억 × 0.75 = 90,000,000 · 필요경비 = 자본적지출 16,000,000(전액) + 상당액 12,000,000 = 28,000,000.
   * 손계산(카드 수준 입력 → 신고 단위): 지분 A 토지·건물 각 148,200,000 × 70% = 103,740,000 · 지분 B 토지 증여분 32,000,000 × 70% = 22,400,000 · 매입분 −10,300,000 · 지분 B 건물 88,920,000
   *   합 306,000,000 − 2,500,000 아닌 합계에 기본공제: 103,740,000 × 2 + 22,400,000 + 88,920,000 − 10,300,000 = 308,500,000 − 2,500,000 = 306,000,000 × 40% − 25,940,000 = 96,460,000.
   */
  const share = (id: string, num: string, over: Partial<AssetForm> = {}) => gbBase({ assetId: id, ownershipNumerator: num, ownershipDenominator: "100", acquisitionDate: "2009-03-01", ...over });
  const shareB = (o: Record<string, unknown> = {}, a: Partial<AssetForm> = {}) =>
    share("share-b", "40", { acquisitionDate: "2021-03-01", acquisitionCause: "carryover_gift",
      carryover: co({ donorAcquisitionPrice: "300,000,000", donorCapitalExpenditure: "40,000,000", giftDateValuation: "600,000,000", giftTaxCalculated: "80,000,000", giftTaxBase: "1,200,000,000", giftAssumedDebt: "150,000,000", ...o }), ...a });

  it("OFF 105,060,000 → 채무 96,460,000 · ④ 스케일 · 꼬리 land__purchased#1 · 지분 짝 찾기", async () => {
    const off = await run(formOf([share("share-a", "60"), shareB({ giftDebtAssumed: false })]));
    expect([off.status, off.det]).toEqual([200, 105_060_000]);
    const f = formOf([share("share-a", "60"), shareB()]);
    expect(issuesOf(f)).toEqual([]);
    const r = await run(f);
    expect(r.body.generalBuildingShares[1].valuation.landCarryoverPart).toMatchObject({ donorAcquisitionPrice: 120_000_000, donorCapitalExpenditure: 16_000_000, giftDateAssetValue: 240_000_000, giftAssumedDebt: 60_000_000 });
    expect([r.status, r.det]).toEqual([200, 96_460_000]);
    expect(r.props.map((p) => p.propertyId)).toEqual(["land#0", "building#0", "land#1", "building#1", "land__purchased#1"]);
    const g = row(r, "land#1"), p = row(r, "land__purchased#1");
    expect([g.transferPrice, g.acquisitionPrice, g.necessaryExpense, g.transferGain]).toEqual([150_000_000, 90_000_000, 28_000_000, 32_000_000]);
    expect([p.transferPrice, p.acquisitionPrice, p.necessaryExpense, p.transferGain]).toEqual([50_000_000, 60_000_000, 300_000, -10_300_000]);
    const s = splitOf(r, "land#1");
    expect(s).toMatchObject({ debtAmount: 60_000_000, giftValuation: 240_000_000 });
    expect(s.purchased.propertyId).toBe("land__purchased#1");
    // 지분 규약 — 꼬리가 지분 B에 속한다
    expect(shareIndexOf("land__purchased#1")).toBe(1);
    expect(isSameShare("land#1", "land__purchased#1")).toBe(true);
    expect(isSameShare("building#0", "land__purchased#1")).toBe(false);
    // 지분 A·건물 카드는 echo가 없다(채무가 없다)
    expect(row(r, "land#0").carryoverTaxationDetail?.scenarioA?.purchasedPartSplit).toBeUndefined();
  });
});

describe("CDP-3 함께 양도(컴패니언) 일반건물 — 꼬리 id `land__purchased#gb2`", () => {
  it("컴패니언 payload에 채무 파트가 실리고, 꼬리 카드가 컴패니언 접미사(#gb2)를 유지한다", async () => {
    const housing = {
      ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-03-01",
      useEstimatedAcquisition: false, fixedAcquisitionPrice: "300,000,000", actualSalePrice: "600,000,000", standardPriceAtTransfer: "500,000,000", standardPriceAtAcq: "250,000,000",
    };
    const gb = gbBase({ assetId: "gb2", addressJibun: "서울 강남구 테스트동 2-2", standardPriceAtTransfer: "500,000,000", acquisitionCause: "carryover_gift",
      carryover: co({ donorAcquisitionPrice: "300,000,000", donorCapitalExpenditure: "40,000,000", giftDateValuation: "600,000,000", giftTaxCalculated: "80,000,000", giftTaxBase: "1,200,000,000", giftAssumedDebt: "150,000,000" }) });
    const r = await run(formOf([housing, gb], { assetSplitMode: "companion", contractTotalPrice: "1,600,000,000" }));
    expect(r.status, r.message).toBe(200);
    const comp = (r.body.companionAssets as Body[])[0];
    expect(comp.generalBuildingValuation.landCarryoverPart).toMatchObject({ giftDateAssetValue: 600_000_000, giftAssumedDebt: 150_000_000 });
    const ids = r.props.map((p) => p.propertyId);
    expect(ids).toContain("land__purchased#gb2");
    expect(ids).not.toContain("land#gb2__purchased");
    expect(cardSuffixOf("land__purchased#gb2")).toBe("gb2");
    expect(isSameShare("land#gb2", "land__purchased#gb2")).toBe(true);
    expect(splitOf(r, "land#gb2")).toMatchObject({ debtAmount: 150_000_000, giftValuation: 600_000_000 });
    // probe 고정(손계산 아님) — 카드 수준 불변식은 위, 세액은 회귀용
    expect(r.det).toBe(181_431_000);
  });
});

/** 건물 파트 이월과세 — 환산(일반 기준시가) + 증여자 신축 ON(§114조의2). 이 조합에 채무가 붙으면 조각 규칙이 적용되지 않는다. */
const DONOR_BUILT = { useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: "100,000,000", donorAcquisitionPrice: "", donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2010-01-10" };

describe("CDP-4 ⑧ ↔ ⑫ 격자 — 토글 ON 일반건물 채무", () => {
  interface Cell { name: string; form: TransferFormData; blockedBy8?: string; field12?: string }
  const L = "generalBuildingValuation.landCarryoverPart";
  const B = "generalBuildingValuation.buildingCarryoverPart";
  const cells: Cell[] = [
    { name: "토지 파트 정상", form: formOf([landOnly()]) },
    { name: "건물 파트 정상", form: formOf([buildingOnly()]) },
    { name: "토지 r = 1 · 증여자 자본적지출 0", form: formOf([landOnly({ giftAssumedDebt: "400,000,000", donorCapitalExpenditure: "" })]) },
    { name: "토지 r = 1 · 증여자 자본적지출 > 0", form: formOf([landOnly({ giftAssumedDebt: "400,000,000", donorCapitalExpenditure: "10,000,000" })]), blockedBy8: "carryover.donorCapitalExpenditure", field12: `${L}.donorCapitalExpenditure` },
    { name: "건물 r = 1 · 증여자 자본적지출 > 0", form: formOf([buildingOnly({ giftAssumedDebt: "400,000,000", donorCapitalExpenditure: "10,000,000" })]), blockedBy8: "buildingCarryover.donorCapitalExpenditure", field12: `${B}.donorCapitalExpenditure` },
    { name: "r = 1 · 자본적지출 > 0 · 2023 양도(엔진이 2024.1.1. 전 자본적지출을 안 쓴다)", form: formOf([landOnly({ giftAssumedDebt: "400,000,000", donorCapitalExpenditure: "10,000,000" })], { transferDate: "2023-12-31" }) },
    { name: "토지 파트 채무 · 용도변경", form: formOf([landOnly({}, { gbHouseToCommercialConversion: true, gbConversionDate: "2023-01-01", gbWasMultiHouseAtConversion: false } as never)]), blockedBy8: "carryover.giftDebtAssumed", field12: `${L}.giftAssumedDebt` },
    { name: "건물 파트 채무 · 용도변경", form: formOf([buildingOnly({}, { gbHouseToCommercialConversion: true, gbConversionDate: "2023-01-01", gbWasMultiHouseAtConversion: false } as never)]), blockedBy8: "carryover.giftDebtAssumed", field12: `${B}.giftAssumedDebt` },
    { name: "건물 파트 채무 · 증여자 신축 ON", form: formOf([buildingOnly(DONOR_BUILT)]), blockedBy8: "carryover.giftDebtAssumed", field12: `${B}.giftAssumedDebt` },
    { name: "토글 OFF · 증여자 신축 ON(채무 미적용이라 막지 않는다)", form: formOf([buildingOnly({ ...DONOR_BUILT, giftDebtAssumed: false })]) },
    { name: "토지 파트만 채무 · 건물 파트 증여자 신축 ON(건물 카드에는 채무가 없다)", form: formOf([gbBase({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: co(), buildingCarryover: co({ ...DONOR_BUILT, giftDebtAssumed: true, giftAssumedDebt: "0" }) })]) },
    { name: "건물 파트 채무 · 정상 채무 0(토글 ON · 0)", form: formOf([buildingOnly({ giftAssumedDebt: "0" })]) },
  ];

  it.each(cells)("$name", async (c) => {
    const r = await run(c.form);
    const fields8 = issuesOf(c.form).map((i) => i.field);
    if (c.blockedBy8) {
      expect(fields8).toContain(c.blockedBy8);
      expect(r.status).toBe(400);
      // ⑫가 엔진 throw(경로 없는 400)보다 먼저 필드 위치로 막는다
      expect(r.fieldErrors).toContain(c.field12);
    } else {
      expect(fields8).toEqual([]);
      expect(r.status, r.message).toBe(200);
    }
  });

  /** 조특법 감면 — 감면 자체의 ⑧ 검증은 따로 있으므로 채무 차단 칸(토글)이 나오는지만 본다. ⑫는 최상위 `reductions`를 같은 사유로 막는다. */
  it("조특법 감면 + 채무 → ⑧ 토글 앵커로 차단(감면 사유) · 토글 OFF면 이 차단은 없다 · ⑫ 최상위 reductions도 필드 위치로 차단", async () => {
    const on = formOf([landOnly({}, { reductions: [EXPR_FORM] as never })]);
    const m = issuesOf(on).find((i) => i.field === "carryover.giftDebtAssumed");
    expect(m?.message).toContain("감면");
    const off = formOf([landOnly({ giftDebtAssumed: false }, { reductions: [EXPR_FORM] as never })]);
    expect(issuesOf(off).map((i) => i.field)).not.toContain("carryover.giftDebtAssumed");
    const r = await post({ ...(await bodyOf(formOf([landOnly()]))), reductions: [EXPR_WIRE] });
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toContain(`${L}.giftAssumedDebt`);
    // 토글 OFF 본문은 감면이 있어도 이 차단에 걸리지 않는다(채무 키가 없다)
    const offBody = await post({ ...(await bodyOf(formOf([landOnly({ giftDebtAssumed: false })]))), reductions: [EXPR_WIRE] });
    expect(offBody.fieldErrors).not.toContain(`${L}.giftAssumedDebt`);
  });
});

const EXPR_FORM = { type: "public_expropriation", expropriationCash: "600000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2023-01-01" };
const EXPR_WIRE = { type: "public_expropriation", cashCompensation: 600_000_000, bondCompensation: 0, businessApprovalDate: "2023-01-01" };
describe("CDP-5 ⑫ 단독 차단 · 엔진 방어선 · 카드 상한", () => {
  const valuationOf = async (f: TransferFormData) => bodyOf(f);

  it("API 직접 호출 — 건물 파트 채무 + 감가상각비 → ⑫ 필드 위치 400(화면은 이 칸을 닫아 만들 수 없다)", async () => {
    const b = await valuationOf(formOf([buildingOnly()]));
    expect(issuesOf(formOf([buildingOnly()]))).toEqual([]);
    b.generalBuildingValuation.depreciationAmount = 5_000_000;
    const r = await post(b);
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toContain("generalBuildingValuation.buildingCarryoverPart.giftAssumedDebt");
    // 토지 파트 채무 + 건물 감가상각은 카드가 달라 통과한다
    const lb = await valuationOf(formOf([landOnly()]));
    lb.generalBuildingValuation.depreciationAmount = 5_000_000;
    expect((await post(lb)).status).toBe(200);
  });

  it("API 직접 호출 — 건물 파트 채무 + 증여자 신축 → ⑫ 필드 위치 400", async () => {
    const b = await valuationOf(formOf([buildingOnly({ useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: "100,000,000", donorAcquisitionPrice: "" })]));
    b.generalBuildingValuation.buildingCarryoverPart.donorBuilt = { buildingType: "new", constructionDate: "2010-01-10" };
    const r = await post(b);
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toContain("generalBuildingValuation.buildingCarryoverPart.giftAssumedDebt");
  });

  it("지분 B 감면 + 채무 → ⑧은 막는다(토글 앵커) / ⑫는 지분 valuation에 감면이 없어 못 보지만 엔진이 400으로 막는다(침묵 통과 아님)", async () => {
    const sA = gbBase({ assetId: "share-a", ownershipNumerator: "60", ownershipDenominator: "100", acquisitionDate: "2009-03-01" });
    const sB = gbBase({ assetId: "share-b", ownershipNumerator: "40", ownershipDenominator: "100", acquisitionDate: "2021-03-01", acquisitionCause: "carryover_gift", carryover: co() });
    const body = await bodyOf(formOf([sA, sB]));
    const shares = body.generalBuildingShares as Body[];
    shares[1].reductions = [EXPR_WIRE];
    const r = await post(body);
    expect(r.status).toBe(400);
    // 엔진 방어선의 400 — 와이어에 없는 경로(`carryoverTaxation.giftAssumedDebt`)로 오지만 사유는 감면이다. V-10 잔여(지분·컴패니언 ⑫ 필드 위치 차단은 별건)
    expect(r.message).toContain("감면");
    expect(r.fieldErrors).toEqual(["carryoverTaxation.giftAssumedDebt"]);
    const b = await bodyOf(formOf([sA, { ...sB, reductions: [EXPR_FORM] as never }]));
    expect(b.generalBuildingShares[1].reductions?.length ?? 0).toBeGreaterThan(0);
    expect(issuesOf(formOf([sA, { ...sB, reductions: [EXPR_FORM] as never }])).map((i) => i.field)).toContain("carryover.giftDebtAssumed");
  });

  it("카드 상한 20 — 지분 10 × (토지 + 건물) + 매입분 꼬리는 500이 아니라 입력 오류 400", async () => {
    const shares = Array.from({ length: 10 }, (_, i) =>
      gbBase({ assetId: `s${i}`, ownershipNumerator: "10", ownershipDenominator: "100", acquisitionDate: "2021-03-01", acquisitionCause: "carryover_gift",
        carryover: co({ donorAcquisitionPrice: "300,000,000", donorCapitalExpenditure: "", giftDateValuation: "600,000,000", giftTaxCalculated: "80,000,000", giftTaxBase: "1,200,000,000", giftAssumedDebt: "150,000,000" }) }));
    const r = await run(formOf(shares));
    expect(r.status, r.message).toBe(400);
    expect(r.message).toContain("최대 20건");
  });
});
