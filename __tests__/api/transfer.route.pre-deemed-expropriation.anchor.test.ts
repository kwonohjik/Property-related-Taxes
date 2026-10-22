/**
 * 의제취득일(1985.1.1.) 전 상속 ③ × 영 §164⑨ 공익수용 — 입력 경로(⑤⑧⑫)와 엔진 도달 (계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §14 · Q-10 A).
 *
 * 상속 자산에는 환산 토글이 없어(`useEstimatedAcquisition` 기본 false) 종전에는 보상액 칸·필수 게이트가 열리지 않았다.
 * 이제 ③이 비교 후보면(④가 pre-deemed `inheritedAcquisition` + ③ 분자를 싣는다) 열린다. ⑧(폼 → ④ 빌더)과 ⑫(본문)는
 * 같은 판정 함수(`isPreDeemedConversionCandidate`)를 쓴다.
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

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

type Form = ReturnType<typeof createDefaultTransferFormData>;
type Json = {
  data?: { result?: { estimatedBase?: number; inheritedAcquisitionDetail?: { preDeemedBreakdown?: { selectedMethod: string; convertedAmount: number } } } };
  error?: { fieldErrors?: Record<string, unknown> };
};

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

function form(asset: Record<string, unknown>): Form {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], residenceInputMode: "direct", residencePeriods: [], ...asset } as Form["assets"][number];
  Object.assign(f, { transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "1,000,000,000", householdHousingCount: "0" });
  return f;
}
const issues = (f: Form) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));
async function bodyOf(f: Form): Promise<Record<string, unknown>> {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ data: {} }), { status: 200 });
  }));
  try {
    await callTransferTaxAPI(f).catch(() => undefined);
  } finally {
    vi.unstubAllGlobals();
  }
  return body as Record<string, unknown>;
}
async function single(body: unknown) {
  const res = await SINGLE(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Json };
}

/**
 * 토지 · 1980 상속(가목 확인 불가 선언 → ③만) · 환산 토글 OFF(화면 기본값) · 양도 10억 · ③ 분자 1천만 · 양도시 기준시가 2억(1,000,000/㎡ × 200㎡)
 * 수용 보상 600,000/㎡가 가장 작다 → 분모 1.2억 · ③ = 10억 × 1천만 ÷ 1.2억 = 83,333,333
 */
const LAND = {
  assetKind: "land",
  addressJibun: "서울 강남구 테스트동 1-1",
  landNature: "independent_bare_land",
  acquisitionCause: "inheritance",
  acquisitionDate: "1980-03-01",
  decedentAcquisitionDate: "1970-01-01",
  inheritanceAssetKind: "land",
  useEstimatedAcquisition: false,
  standardPriceAtAcq: "10,000,000",
  standardPriceAtTransfer: "200,000,000",
  preDeemedClauseAUnconfirmed: true,
  transferCause: "public_expropriation",
  standardPricePerSqmAtTransfer: "1,000,000",
  acquisitionArea: "200",
  transferArea: "200",
};
const COMP = { compensationPerSqm: "600,000", compensationBasisStdPrice: "800,000" };
const COMP_MSG = /보상가액\(원\/㎡\)/;

describe("자산 단위 — 의제취득일 전 상속 ③ 후보면 보상액이 필요하다", () => {
  it("보상액 비움 → ⑧ 차단 ∧ ④ 본문은 ⑫ 400(compensationPerSqm) — 같은 판정", async () => {
    const f = form(LAND);
    expect(issues(f).join(" ")).toMatch(COMP_MSG);
    const r = await single(await bodyOf(f));
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain("compensationPerSqm");
  });

  it("보상액 입력 → ⑧ 통과 ∧ 200 · ③ = 특례 분모 환산 83,333,333 = 양도차익의 취득가액", async () => {
    const f = form({ ...LAND, ...COMP });
    expect(issues(f)).toEqual([]);
    const r = await single(await bodyOf(f));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(r.json.data?.result?.inheritedAcquisitionDetail?.preDeemedBreakdown).toMatchObject({ selectedMethod: "converted", convertedAmount: 83_333_333 });
    expect(r.json.data?.result?.estimatedBase).toBe(83_333_333);
  });

  it("③ 분자가 없으면(① 평가액만) ③이 계산되지 않아 보상액을 요구하지 않는다 — ⑧·⑫ 모두", async () => {
    const f = form({ ...LAND, standardPriceAtAcq: "", preDeemedClauseAUnconfirmed: false, publishedValueAtInheritance: "50,000,000" });
    expect(issues(f).join(" ")).not.toMatch(COMP_MSG);
    const r = await single(await bodyOf(f));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("의제취득일 뒤(1990) 상속은 ③이 없다 — 보상액을 요구하지 않는다", async () => {
    const f = form({ ...LAND, acquisitionDate: "1990-03-01", standardPriceAtAcq: "", preDeemedClauseAUnconfirmed: false, publishedValueAtInheritance: "50,000,000" });
    expect(issues(f).join(" ")).not.toMatch(COMP_MSG);
    const r = await single(await bodyOf(f));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});

/** 분리 계산 D1 — 건물 2018 매매 + 토지 1980 상속(PR-3 시드). 토지 보상 3.5억 · 보상기초 3.8억 */
const D1 = {
  addressJibun: "서울 강남구 테스트동 1-1",
  acquisitionCause: "purchase",
  acquisitionDate: "2018-03-02",
  landAcquisitionCause: "inheritance",
  landCauseHost: "purchase",
  landAcquisitionDate: "1980-05-01",
  landDecedentAcquisitionDate: "1960-01-01",
  hasSeperateLandAcquisitionDate: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "300,000,000",
  buildingAcquisitionPrice: "400,000,000",
  acquisitionArea: "100",
  transferArea: "100",
  pre1990GradeMode: "value",
  pre1990Grade_current: "50000",
  pre1990Grade_prev: "40000",
  pre1990Grade_atAcq: "22500",
  pre1990PricePerSqm_1990: "7000000",
  actualSalePrice: "1,200,000,000",
  saleSplitMode: "actual",
  landTransferPrice: "700,000,000",
  buildingTransferPrice: "500,000,000",
  landStandardPriceAtTransfer: "400,000,000",
  buildingStandardPriceAtTransfer: "300,000,000",
  transferCause: "public_expropriation",
};
const SPLIT_COMP = { splitLandCompensationTotal: "350,000,000", splitLandCompensationBasisTotal: "380,000,000" };
const SPLIT_MSG = /토지분 보상액 총액/;
const d1Form = (asset: Record<string, unknown>) => {
  const f = form(asset);
  Object.assign(f, { transferDate: "2026-06-30", filingDate: "2026-08-31", contractTotalPrice: "1,200,000,000", householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true });
  return f;
};

describe("분리 계산 D1 — 1985 전 토지 파트 ③ 후보", () => {
  it("일반건물(building): 토지분 보상 비움 → ⑧ 차단 ∧ ⑫ 400(splitLandCompensationTotal)", async () => {
    const f = d1Form({ ...D1, assetKind: "building" });
    expect(issues(f).join(" ")).toMatch(SPLIT_MSG);
    const r = await single(await bodyOf(f));
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain("splitLandCompensationTotal");
  });

  it("주택 D1은 엔진이 split 특례를 걸지 않아(비교·적용 모두 원값 분모) 게이트를 열지 않는다 — 「미지원」 막다른 길 없음", async () => {
    const f = d1Form({ ...D1, assetKind: "housing" });
    expect(issues(f).join(" ")).not.toMatch(/§164⑨ 특례를 적용할 수 없습니다|토지분 보상액 총액/);
    const r = await single(await bodyOf(f));
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).not.toContain("splitLandCompensationTotal");
  });
});

describe("원/㎡ 트랙 — 양도시 ㎡당 공시지가·면적도 필요하다 (엔진은 둘 다 있어야 특례를 건다 · 면적은 기본정보 칸이 원천)", () => {
  it("㎡당 공시지가 비움 → ⑧ 차단 ∧ ⑫ 400(standardPricePerSqmAtTransfer) — 종전엔 보상액만 받고 특례가 조용히 꺼졌다", async () => {
    const f = form({ ...LAND, ...COMP, standardPricePerSqmAtTransfer: "" });
    expect(issues(f).join(" ")).toMatch(/양도시 ㎡당 공시지가/);
    const r = await single(await bodyOf(f));
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain("standardPricePerSqmAtTransfer");
  });
  it("면적 비움 → ⑧ 차단(기본정보 면적 칸 앵커 acquisitionArea) ∧ ⑫ 400(transferArea)", async () => {
    const f = form({ ...LAND, ...COMP, acquisitionArea: "", transferArea: "" });
    const fe8 = [0, 1, 2, 3].flatMap((st) => collectStepIssues(st, f));
    expect(fe8.find((i) => /양도 당시 면적/.test(i.message))?.field).toBe("acquisitionArea");
    const r = await single(await bodyOf(f));
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain("transferArea");
  });
  it("양도시 기준시가 총액 ≠ ㎡당 × 면적 → ⑧·⑫ 모두 standardPriceAtTransfer로 차단 (두 원천이 갈리지 않게)", async () => {
    const f = form({ ...LAND, ...COMP, standardPriceAtTransfer: "250,000,000" });
    const fe8 = [0, 1, 2, 3].flatMap((st) => collectStepIssues(st, f));
    expect(fe8.find((i) => /㎡당 공시지가 × 면적/.test(i.message))?.field).toBe("standardPriceAtTransfer");
    const r = await single(await bodyOf(f));
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain("standardPriceAtTransfer");
  });
  it("토지가 아닌 ③ 후보(건물)는 원/㎡ 트랙을 열지 않는다 — 면적 원천이 달라 ⑧·⑫ 모두 요구하지 않고 ④도 싣지 않는다", async () => {
    const f = form({ ...LAND, ...COMP, assetKind: "building" });
    expect(issues(f).join(" ")).not.toMatch(/공익수용 환산 특례/);
    const b = await bodyOf(f);
    expect(b.compensationPerSqm).toBeUndefined();
  });
});

describe("④ — 숨은 칸의 보상액은 싣지 않는다(⑤ 노출 조건과 같은 게이트)", () => {
  it("의제취득일 뒤 상속(칸 숨김)에 남은 보상액 → body에 없다 / 대조: ③ 후보면 싣는다", async () => {
    const hidden = await bodyOf(form({ ...LAND, ...COMP, acquisitionDate: "1990-03-01", standardPriceAtAcq: "", preDeemedClauseAUnconfirmed: false, publishedValueAtInheritance: "50,000,000" }));
    expect(hidden.compensationPerSqm).toBeUndefined();
    expect(hidden.compensationBasisStdPrice).toBeUndefined();
    const shown = await bodyOf(form({ ...LAND, ...COMP }));
    expect(shown).toMatchObject({ compensationPerSqm: 600_000, compensationBasisStdPrice: 800_000 });
  });
});

describe("함께양도 D1(일반건물) × 수용 — 차단 유지 · 안내는 「첫 번째로 옮기기」만(Q-12)", () => {
  it("둘째 자산이 D1 일반건물 + 수용 → ⑧ 차단 문구에 취득일 분리 해제 안내가 없다", () => {
    const f = d1Form({ assetKind: "land", addressJibun: "서울 강남구 테스트동 2-2", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", actualSalePrice: "300,000,000" });
    f.assets[1] = { ...f.assets[0], assetId: "a2", ...D1, assetKind: "building" } as Form["assets"][number];
    const msg = issues(f).join(" ");
    expect(msg).toMatch(/1985\.1\.1\. 전에 상속·증여받은 토지 파트는 취득일 분리를 해제할 수 없습니다/);
    expect(msg).not.toMatch(/취득일 분리를 해제하세요/);
  });
});
