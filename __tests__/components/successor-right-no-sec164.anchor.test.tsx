/**
 * anchor — ⑫ 승계 입주권: §163⑨ 단서 ②(§164④~⑦ 가액) 운반 키 거부. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §11·§12.
 *
 *   「소득세법 시행령」 §163⑨ 단서는 1호 토지·2호 건물만이다 — 조합원입주권(권리)은 평가액(본문)만. ④는 입주권에 그 키를 싣지 않는데
 *   직접 호출로 오면 엔진이 ②를 열었다(단건 주택 환산 383,010,000 → 290,933,077 · 1990 전 토지 환산 → 274,026,300 ·
 *   컴패니언 331,770,000 → 239,693,077). 화면 경로는 그대로 200이어야 한다(⑧↔⑫ 막다른 길 없음).
 * 결정세액은 mock 세율.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
import type { z } from "zod";
import { refineSuccessorRightNoSec164Inputs } from "@/lib/api/transfer-tax-schema-successor-deemed";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type A = Record<string, unknown>;
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1300000000", ...extra,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function postBody(body: Record<string, any>): Promise<{ status: number; data: any; error?: any }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: unknown; error?: unknown };
  return { status: res.status, data: json.data, error: json.error };
}

async function check(f: TransferFormData) {
  const issue = [0, 1, 2, 3].map((st) => validateStepDetailed(st, f)).find(Boolean) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: Record<string, any> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const r = await postBody(body);
  return { issue, body, ...r, res: r.data?.result };
}

const asset = (over: A): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionPrice: "", useEstimatedAcquisition: false,
  isSuccessorRightToMoveIn: true, redevApprovalDate: "2020-01-10", successorRightAcqPrice: "", successorRightAddedContribution: "",
  ...over,
});
const GIFT: A = { acquisitionCause: "gift", acquisitionDate: "2023-06-01", donorAcquisitionDate: "2021-01-01", fixedAcquisitionPrice: "300000000" };
const INH: A = { acquisitionCause: "inheritance", acquisitionDate: "2023-06-01", inheritanceStartDate: "2023-06-01", decedentAcquisitionDate: "2021-01-01", publishedValueAtInheritance: "300000000" };
const PUR: A = { acquisitionCause: "purchase", acquisitionDate: "2023-06-01", successorRightAcqPrice: "300000000" };
const LAND: A = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };
const single = (over: A) => mk([asset(over)]);
const bundle = (over: A) => mk([LAND, asset({ actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000", ...over })], { bundledSaleMode: "actual" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const companionTax = (r: { data: any }) => r.data?.aggregated?.totalDeterminedTax ?? r.data?.aggregated?.determinedTax;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clone = (b: any) => JSON.parse(JSON.stringify(b));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paths = (r: { error?: any }) => JSON.stringify(r.error ?? null);

const IHV = { inheritanceDate: "2000-03-01", transferDate: "2026-02-16", landArea: 200, landPricePerSqmAtTransfer: 3_000_000, landPricePerSqmAtFirstDisclosure: 1_000_000, landPricePerSqmAtInheritance: 500_000, housePriceAtTransfer: 0, housePriceAtFirstDisclosure: 900_000_000, buildingStdPriceAtFirstDisclosure: 60_000_000, buildingStdPriceAtInheritance: 50_000_000 };
const P1990 = { acquisitionDate: "1989-01-01", transferDate: "2026-02-16", areaSqm: 600, pricePerSqm_1990: 2_000_000, grade_1990_0830: 200, gradePrev_1990_0830: 190, gradeAtAcquisition: 180 };
const CIV = { exclusiveArea: 80, commonArea: 20, landArea: 30, unitPriceAtFirstDisclosure: 5_000_000, landPriceAtAcquisition: 1_000_000, landPriceAtFirstDisclosure: 2_000_000, buildingStdPriceAtAcquisition: 100_000, buildingStdPriceAtFirstDisclosure: 200_000 };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const KEYS = ["inheritedHouseValuation", "pre1990Land", "commercialInheritanceValuation"];
const MSG = "§164④~⑦ 가액과 비교하지 않습니다";
const at2000 = (b: Body) => { b.acquisitionDate = "2000-03-01"; b.decedentAcquisitionDate = "1998-01-01"; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const field = (r: { error?: any }, key: string) => (r.error?.fieldErrors?.[key] ?? []).join(" ");

describe("단건 주 자산 — 직접 호출 ② 키 → 400", () => {
  it("화면 경로 기준값: 200 · 383,010,000 · ② 키 없음", async () => {
    const r = await check(single(INH));
    expect(r.status).toBe(200);
    expect(r.res.determinedTax).toBe(383_010_000);
    expect(KEYS.filter((k) => k in r.body)).toEqual([]);
  });
  // 종전(수정 전) 200 — 공동주택 「없었음」 §164⑥ / 단독 §164⑦ 519,230,769 채택 · 290,933,077 · 토지 §164④ 559,485,000 · 274,026,300 · 상가는 엔진이 무시
  it.each([
    ["공동주택 「없었음」 + 주택 환산", "inheritedHouseValuation", (b: Body) => { at2000(b); b.inheritedAcquisition.inheritanceStartDate = "2000-03-01"; Object.assign(b.inheritedAcquisition, { apartNtsPriceExisted: false, apartFirstPriceAgency: "nts", apartFirstPriceDate: "2006-01-01" }); b.inheritedHouseValuation = IHV; }],
    ["assetKind 단독주택 + 주택 환산", "inheritedHouseValuation", (b: Body) => { at2000(b); b.inheritedAcquisition.inheritanceStartDate = "2000-03-01"; b.inheritedAcquisition.assetKind = "house_individual"; b.inheritedHouseValuation = IHV; }],
    ["assetKind 토지 + 1990 전 토지 환산", "pre1990Land", (b: Body) => { b.acquisitionDate = "1989-01-01"; b.decedentAcquisitionDate = "1987-01-01"; b.inheritedAcquisition.inheritanceStartDate = "1989-01-01"; b.inheritedAcquisition.assetKind = "land"; b.pre1990Land = P1990; }],
    ["상가 §164⑥ 환산", "commercialInheritanceValuation", (b: Body) => { at2000(b); b.inheritedAcquisition.inheritanceStartDate = "2000-03-01"; b.commercialInheritanceValuation = CIV; }],
  ] as [string, string, (b: Body) => void][])("%s → 400(%s)", async (_n, key, f) => {
    const b = clone((await check(single(INH))).body);
    f(b);
    const r = await postBody(b);
    expect(r.status).toBe(400);
    expect(field(r, key)).toContain(MSG);
  });
});

describe("단건 — 입주권이 아니면 이 규칙이 아니다", () => {
  it("propertyType 주택 + (남은) isSuccessorRightToMoveIn + 주택 환산 → 이 메시지 없음", async () => {
    const b = clone((await check(single(INH))).body);
    at2000(b);
    b.inheritedAcquisition.inheritanceStartDate = "2000-03-01";
    b.inheritedAcquisition.assetKind = "house_individual";
    b.propertyType = "housing";
    b.inheritedHouseValuation = IHV;
    const r = await postBody(b);
    expect(field(r, "inheritedHouseValuation")).not.toContain(MSG);
  });
});

describe("함께 양도 컴패니언 — 직접 호출 ② 키 → 400", () => {
  it("화면 경로 기준값 200 · 331,770,000", async () => {
    const r = await check(bundle(INH));
    expect(r.status).toBe(200);
    expect(companionTax(r)).toBe(331_770_000);
    expect(KEYS.filter((k) => k in r.body.companionAssets[0])).toEqual([]);
  });
  it("§163⑨ 페이로드(단독주택) + 주택 환산 → 400(종전 200 · 239,693,077)", async () => {
    const b = clone((await check(bundle(INH))).body);
    const c = b.companionAssets[0];
    at2000(c);
    c.inheritanceValuation.inheritanceDate = "2000-03-01";
    c.inheritedAcquisition = { mode: "post-deemed", inheritanceStartDate: "2000-03-01", assetKind: "house_individual", reportedValue: 300_000_000, reportedMethod: "supplementary", useSupplementaryHelper: true, publishedValueAtInheritance: 300_000_000 };
    c.inheritedHouseValuation = IHV;
    const r = await postBody(b);
    expect(r.status).toBe(400);
    expect(field(r, "companionAssets.0.inheritedHouseValuation")).toContain(MSG);
  });
  it("날짜만 2000년으로 바꾸면 200 · 331,770,000(규칙은 ② 키에만 반응)", async () => {
    const b = clone((await check(bundle(INH))).body);
    at2000(b.companionAssets[0]);
    b.companionAssets[0].inheritanceValuation.inheritanceDate = "2000-03-01";
    const r = await postBody(b);
    expect(r.status).toBe(200);
    expect(companionTax(r)).toBe(331_770_000);
  });
});

describe("가드 — 화면 경로는 막히지 않는다(④는 입주권에 ② 키를 싣지 않는다)", () => {
  // 주택·토지에서 남은 ② 입력(공동주택 답·주택 환산 칸·1990 토지등급·면적·상가 칸)이 남아 있어도
  const LEFT: A = {
    inhApartNtsPriceExisted: "no", inhApartFirstPriceAgency: "nts", inhApartFirstPriceDate: "2006-01-01", isApartment: true,
    inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
    inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000",
    pre1990Grade_current: "200", pre1990Grade_prev: "190", pre1990Grade_atAcq: "180", pre1990GradeMode: "number", pre1990PricePerSqm_1990: "2000000", acquisitionArea: "600",
    cbExclusiveArea: "80", cbSharedArea: "20", cbLandArea: "30", cbUnitPriceAtFirstOrAcq: "5000000", cbLandPricePerSqmAtAcq: "1000000", cbLandPricePerSqmAtFirst: "2000000", cbBuildingStdPriceAtAcq: "100000", cbBuildingStdPriceAtFirst: "200000",
  };
  const Y2K: A = { acquisitionCause: "inheritance", acquisitionDate: "2000-03-01", inheritanceStartDate: "2000-03-01", decedentAcquisitionDate: "1998-01-01", publishedValueAtInheritance: "300000000", redevApprovalDate: "1999-01-01" };
  const PRE: A = { ...Y2K, acquisitionDate: "1989-01-01", inheritanceStartDate: "1989-01-01", decedentAcquisitionDate: "1987-01-01", redevApprovalDate: "1988-01-01" };
  const G2K: A = { acquisitionCause: "gift", acquisitionDate: "2000-03-01", donorAcquisitionDate: "1998-01-01", fixedAcquisitionPrice: "300000000", redevApprovalDate: "1999-01-01" };
  it.each([["매매", PUR], ["증여 2023", GIFT], ["상속 2023", INH], ["상속 2000", Y2K], ["상속 1989", PRE], ["증여 2000", G2K]] as [string, A][])(
    "%s + 남은 ② 칸 — ⑧ 통과 · ② 키 없음 · 200",
    async (_n, C) => {
      const r = await check(single({ ...C, ...LEFT }));
      expect(r.issue).toBeNull();
      expect(KEYS.filter((k) => k in r.body)).toEqual([]);
      expect(r.status, paths(r)).toBe(200);
    },
  );
  it("컴패니언 상속 2000 + 남은 ② 칸 — ② 키 없음 · 200", async () => {
    const r = await check(bundle({ ...Y2K, ...LEFT }));
    expect(r.issue).toBeNull();
    expect(KEYS.filter((k) => k in r.body.companionAssets[0])).toEqual([]);
    expect(r.status, paths(r)).toBe(200);
  });
  it("leaf — 원조합원 입주권·입주권 아닌 자산은 대상이 아니다", () => {
    const run = (d: Record<string, unknown>, isRight: boolean) => {
      const issues: unknown[] = [];
      refineSuccessorRightNoSec164Inputs(d, isRight, { addIssue: (x: unknown) => issues.push(x) } as unknown as z.RefinementCtx);
      return issues.length;
    };
    const all = { inheritedHouseValuation: IHV, pre1990Land: P1990, commercialInheritanceValuation: CIV };
    expect(run({ isSuccessorRightToMoveIn: true, ...all }, true)).toBe(3);
    expect(run({ isSuccessorRightToMoveIn: false, ...all }, true)).toBe(0);
    expect(run({ ...all }, true)).toBe(0);
    expect(run({ isSuccessorRightToMoveIn: true, ...all }, false)).toBe(0);
    expect(run({ isSuccessorRightToMoveIn: true }, true)).toBe(0);
  });
});
