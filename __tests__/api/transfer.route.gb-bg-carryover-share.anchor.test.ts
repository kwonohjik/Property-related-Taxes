/**
 * anchor — 일반건물 부담부증여 × 배우자등 이월과세 × **지분 분할 취득(축 B)** — §97의2②3호 신고단위 비교 배선 (PR-2)
 *
 * 계획서 `docs/00-pm/gb-bg-carryover-share-bundled.plan.md` §1.1·§4.3. 수정 前: ⑧·⑫ 가 「단건으로 계산하세요」로 막았고(PR-3),
 * 그 전에는 지분 카드가 이월과세를 읽지 않아 양도인 기준(B) 97,800,000 만 냈다. 계획서 실측(일회성 probe): P1 AA 109,326,000(= 단건 A) ·
 * P3 102,338,000 · P4 104,646,000 · P2 B 유지 97,800,000. 비교 단위 = 지분 하나(Q-1 a) · 증여세 = 지분마다 자기 입력(Q-2 a).
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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { sameDayBuildingDonorDate } from "./_helpers/gb-bg-building-donor-date";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

const TRANSFER_DATE = "2026-03-01";
const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;

/** 일반건물 · 부담부증여 K-5 · 이월과세(당초 증여자 취득 시 기준시가 토지 1천만·건물 4천만 → A 채택) · 지분 50%. `co`/`over` 로 한 칸씩 바꾼다. */
function gbShare(over: Partial<AssetForm> = {}, co: Record<string, unknown> = {}): AssetForm {
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
    ...half,
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000",
      giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no",
      ...co,
    },
    ...over,
  } as AssetForm);
}
/** 둘째 지분 — 카드 id·라벨만 다르다(화면은 자산마다 「자산 n」). */
const second = (a: AssetForm) => ({ ...a, assetId: "a2", assetLabel: "자산 2" }) as AssetForm;
const gift = { acquisitionCause: "gift" } as Partial<AssetForm>;
const shares = (a: AssetForm, b: AssetForm, over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE, filingDate: "2026-05-31", assets: [{ ...a, assetLabel: "자산 1" }, second(b)], houses: [], presaleRights: [],
    contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, assetSplitMode: "fractional", ...over,
  }) as unknown as TransferFormData;
const single = (a: AssetForm): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE, filingDate: "2026-05-31", assets: [{ ...a, ownershipNumerator: makeDefaultAsset(1).ownershipNumerator, ownershipDenominator: makeDefaultAsset(1).ownershipDenominator }], houses: [], presaleRights: [],
    contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
  }) as unknown as TransferFormData;
const K7 = {
  bgAcquisitionMethod: "appraisal", bgCoDonorPresumedAcquisitionLand: "100,000,000", bgCoDonorPresumedAcquisitionBuilding: "200,000,000",
  bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000",
} as Partial<AssetForm>;

interface Run { status: number; det?: number; message?: string; fieldErrors: string[]; a?: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
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
  const json = (await res.json()) as { data?: { aggregated?: Record<string, any> }; error?: { message?: string; fieldErrors?: Record<string, string[]> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = json.data?.aggregated;
  return { status: res.status, det: a?.determinedTax, message: json.error?.message, fieldErrors: Object.keys(json.error?.fieldErrors ?? {}), a };
}
const run = async (f: TransferFormData): Promise<Run> => post(await bodyOf(f));
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));
const ok = async (f: TransferFormData) => {
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, r.message).toBe(200);
  return r.a!;
};
const acqOf = (u: { parts: { acquisitionPrice: number }[] }) => u.parts.map((p) => p.acquisitionPrice);
const propsAcq = (a: Record<string, any>) => a.properties.map((p: { acquisitionPrice: number }) => p.acquisitionPrice); // eslint-disable-line @typescript-eslint/no-explicit-any
const unitsOf = (a: Record<string, any>) => // eslint-disable-line @typescript-eslint/no-explicit-any
  Object.fromEntries(Object.entries(a.burdenedGiftCarryoverUnits ?? {}).map(([k, v]: [string, any]) => [k, [v.adoptedScenario, v.determinedTaxA, v.determinedTaxB]])); // eslint-disable-line @typescript-eslint/no-explicit-any

describe("지분 분할 50/50 × 이월과세 — 지분마다 A/B를 신고 단위 결정세액으로 비교한다(수정 前: ⑧·⑫ 400 「단건으로 계산하세요」)", () => {
  it("P1 같은 사실 50/50 → AA 109,326,000 = 단건 A · 단위 키 = 카드 접미사 · 한 지분만 A(AB·BA)는 93,186,350", async () => {
    const a = await ok(shares(gbShare(), gbShare()));
    expect(a.determinedTax).toBe(109_326_000);
    expect(unitsOf(a)).toEqual({ "0": ["A", 109_326_000, 93_186_350], "1": ["A", 109_326_000, 93_186_350] });
    // 채택된 A 카드가 신고 카드다 — 지분 몫(당초 증여자 기준시가 × 지분 50% × 채무비율 0.5) · 산식 재료도 A 카드
    expect(propsAcq(a)).toEqual([6_250_000, 25_000_000, 6_250_000, 25_000_000]);
    expect(a.generalBuildingValuationDetail.assetCards.map((c: { acquisitionPrice: number }) => c.acquisitionPrice)).toEqual([6_250_000, 25_000_000, 6_250_000, 25_000_000]);
    const u = a.burdenedGiftCarryoverUnits["1"];
    expect(u).toMatchObject({ assetLabel: "자산 2", applicablePeriodYears: 10, giftTaxAmount: 0 });
    expect(acqOf(u.scenarioA)).toEqual([6_250_000, 25_000_000]);
    expect(acqOf(u.scenarioB)).toEqual([62_500_000, 62_500_000]);
    expect([u.scenarioA.landHoldingStartDate, u.scenarioB.landHoldingStartDate]).toEqual(["2015-01-01", "2024-05-01"]);
  });

  it("단건 등식 — 같은 사실 50/50 지분 = 단건 F27(A 109,326,000 · B 97,800,000) · 파트 취득가액 합도 같다", async () => {
    const one = await ok(single(gbShare()));
    expect(one.determinedTax).toBe(109_326_000);
    expect(propsAcq(one)).toEqual([12_500_000, 50_000_000]);
    const bb = await ok(shares(gbShare(gift), gbShare(gift)));
    const oneB = await ok(single(gbShare(gift)));
    expect([bb.determinedTax, oneB.determinedTax]).toEqual([97_800_000, 97_800_000]);
  });

  it("P3 당초 증여자 취득일 지분별 2015/2010 → AA 102,338,000 (첫 지분만 B = 86,547,750 · 둘째만 B = 93,186,350)", async () => {
    const a = await ok(shares(gbShare(), gbShare({}, { donorAcquisitionDate: "2010-01-01" })));
    expect(a.determinedTax).toBe(102_338_000);
    expect(unitsOf(a)).toEqual({ "0": ["A", 102_338_000, 86_547_750], "1": ["A", 102_338_000, 93_186_350] });
    expect(a.burdenedGiftCarryoverUnits["1"].scenarioA.landHoldingStartDate).toBe("2010-01-01");
  });

  it("P4 증여세 지분별 1,500만 → 104,646,000 = 단건 증여세 3천만의 A (Q-2 a — 지분마다 자기 입력값)", async () => {
    const a = await ok(shares(gbShare({}, { giftTaxAmount: "15,000,000" }), gbShare({}, { giftTaxAmount: "15,000,000" })));
    expect(a.determinedTax).toBe(104_646_000);
    expect(a.burdenedGiftCarryoverUnits["0"].giftTaxAmount).toBe(15_000_000);
    expect((await ok(single(gbShare({}, { giftTaxAmount: "30,000,000" })))).determinedTax).toBe(104_646_000);
  });

  it("P2 둘째 지분만 이월과세(첫 지분은 증여) → B 유지 97,800,000 · 단위는 둘째 지분 하나(A 93,186,350 < B)", async () => {
    const f = shares(gbShare(gift), gbShare());
    const body = await bodyOf(f);
    expect(body.carryoverTaxation).toBeUndefined();
    expect(body.generalBuildingShares.map((s: { carryoverTaxation?: unknown }) => s.carryoverTaxation !== undefined)).toEqual([false, true]);
    const a = await ok(f);
    expect(a.determinedTax).toBe(97_800_000);
    expect(unitsOf(a)).toEqual({ "1": ["B", 93_186_350, 97_800_000] });
    expect(propsAcq(a)).toEqual([62_500_000, 62_500_000, 62_500_000, 62_500_000]);
  });

  it("K-7 감정가액 50/50 → 82,627,700 = 단건 K-7 — B는 증여일 평가액(소령 §163⑨), A는 당초 증여자 감정가액", async () => {
    const a = await ok(shares(gbShare(K7), gbShare(K7)));
    expect(a.determinedTax).toBe(82_627_700);
    expect(unitsOf(a)["0"]).toEqual(["A", 82_627_700, 71_232_625]);
    expect(acqOf(a.burdenedGiftCarryoverUnits["0"].scenarioA)).toEqual([25_000_000, 50_000_000]);
    expect(acqOf(a.burdenedGiftCarryoverUnits["0"].scenarioB)).toEqual([75_000_000, 75_000_000]);
    expect((await ok(single(gbShare(K7)))).determinedTax).toBe(82_627_700);
  });

  it("②3호 — A가 적으면 B: 당초 증여자 기준시가가 양도인과 같으면 A 56,286,880 < B ⇒ 97,800,000 · 신고 카드·산식 재료·명세는 B 그대로", async () => {
    const same = { bgCoDonorLandStdPriceAtAcq: "180,000,000", bgCoDonorBuildingStdPriceAtAcq: "100,000,000" } as Partial<AssetForm>;
    const a = await ok(shares(gbShare(same), gbShare(same)));
    expect(a.determinedTax).toBe(97_800_000);
    expect(unitsOf(a)).toEqual({ "0": ["B", 56_286_880, 97_800_000], "1": ["B", 56_286_880, 97_800_000] });
    // 미채택 [A] 요약은 반사실 실행(이 단위만 A)에서 — 최종(B) 카드를 다시 쓰면 두 열이 같아진다
    expect(acqOf(a.burdenedGiftCarryoverUnits["0"].scenarioA)).toEqual([112_500_000, 62_500_000]);
    expect(a.generalBuildingValuationDetail.assetCards.map((c: { acquisitionPrice: number }) => c.acquisitionPrice)).toEqual([62_500_000, 62_500_000, 62_500_000, 62_500_000]);
    expect(a.burdenedGift.cards).toBeUndefined();
  });

  it("V-1 — A의 물건 사건 前/後 판정은 당초 증여자 취득일로: 첫 지분(2019 증여) 뒤·둘째 지분(2024 증여) 전 용도변경이 둘째 지분 A에만 걸린다", async () => {
    const first = gbShare({ ...gift, acquisitionDate: "2019-01-01" });
    const conv = { gbHouseToCommercialConversion: true, gbConversionDate: "2020-06-01", gbWasMultiHouseAtConversion: true } as Partial<AssetForm>;
    const base = await ok(shares(first, gbShare()));
    expect(unitsOf(base)).toEqual({ "1": ["A", 84_196_150, 70_133_500] });
    const a = await ok(shares({ ...first, ...conv } as AssetForm, gbShare()));
    expect(unitsOf(a)).toEqual({ "1": ["A", 96_135_000, 71_862_500] });
  });
});

describe("Q-4 a — 「부담부증여 평가 명세」 취득 열 = 채택 시나리오의 지분별 명세 합", () => {
  it("P1 — 토지 12,500,000 · 건물 50,000,000(= 단건 명세) · 지분별 카드 2장(이월과세 적용 표지)", async () => {
    const a = await ok(shares(gbShare(), gbShare()));
    expect([a.burdenedGift.perAsset.land.acquisitionPrice, a.burdenedGift.perAsset.building.acquisitionPrice]).toEqual([12_500_000, 50_000_000]);
    expect(a.burdenedGift.cards.map((c: { propertyId: string; label: string }) => [c.propertyId, c.label])).toEqual([
      ["0", "자산 1 · 이월과세 적용(당초 증여자 기준)"],
      ["1", "자산 2 · 이월과세 적용(당초 증여자 기준)"],
    ]);
  });
  it("첫 지분 증여 · 둘째 지분 이월과세 A 채택 — 이월과세가 아닌 지분도 자기 명세 카드를 싣는다(표지 없음 · 빠지면 합을 만들 수 없다)", async () => {
    const a = await ok(shares(gbShare({ ...gift, acquisitionDate: "2019-01-01" }), gbShare()));
    expect(a.burdenedGiftCarryoverUnits["1"].adoptedScenario).toBe("A");
    expect(a.burdenedGift.cards.map((c: { label: string }) => c.label)).toEqual(["자산 1", "자산 2 · 이월과세 적용(당초 증여자 기준)"]);
  });
  it("이월과세 아님 — 명세는 물건 전체 재계산 그대로(125,000,000 · 125,000,000) · 카드 없음 · 단위 없음", async () => {
    const a = await ok(shares(gbShare(gift), gbShare(gift)));
    expect([a.burdenedGift.perAsset.land.acquisitionPrice, a.burdenedGift.perAsset.building.acquisitionPrice]).toEqual([125_000_000, 125_000_000]);
    expect(a.burdenedGift.cards).toBeUndefined();
    expect(a.burdenedGiftCarryoverUnits).toBeUndefined();
  });
});

describe("⑧ ↔ ⑫ — 둘째 지분의 당초 증여자 값 · 짝 강제", () => {
  it("둘째 지분 당초 증여자 기준시가가 비면 ⑧ 이 그 지분에서 막는다(엔진 throw 전) · API 도 400", async () => {
    const f = shares(gbShare(), gbShare({ bgCoDonorLandStdPriceAtAcq: "", bgCoDonorBuildingStdPriceAtAcq: "" }));
    expect(issues(f).map((i) => i.message).join("\n")).toContain("자산 2: 이월과세가 적용되므로 「당초 증여자」");
    expect((await run(f)).status).toBe(400);
  });
  it("V-3 이월과세 환산 토글 → ⑧ 이 단건과 같은 문구로 먼저 막는다", async () => {
    const f = shares(gbShare(), gbShare({}, { useEstimatedAcquisition: true, estimationMode: "general" }));
    expect(issues(f).map((i) => i.message).join("\n")).toContain("이월과세 취득가액을 환산으로 구할 수 없습니다");
    expect((await run(f)).status).toBe(400);
  });
  it("⑫ 짝 강제 — 지분 이월과세만 / 당초 증여자 값만 보내면 400(받아 놓고 무시 · A 재료 없음 둘 다 막는다)", async () => {
    const body = await bodyOf(shares(gbShare(), gbShare()));
    const noBasis = JSON.parse(JSON.stringify(body));
    delete noBasis.generalBuildingShares[1].burdenedGiftInfo.carryoverDonorBasis;
    const r1 = await post(noBasis);
    expect(r1.status).toBe(400);
    expect(r1.fieldErrors).toContain("generalBuildingShares.1.burdenedGiftInfo.carryoverDonorBasis");
    const noCt = JSON.parse(JSON.stringify(body));
    delete noCt.generalBuildingShares[1].carryoverTaxation;
    const r2 = await post(noCt);
    expect(r2.status).toBe(400);
    expect(r2.fieldErrors).toContain("generalBuildingShares.1.carryoverTaxation");
  });
});
