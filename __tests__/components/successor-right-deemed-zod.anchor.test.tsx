/**
 * anchor — ⑫ 상속·증여 승계 입주권: §163⑨ 평가액 채널 없이 승계취득가액 칸만 오면 400. 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §9.
 *
 *   단건 주 자산 — `inheritedAcquisition.reportedValue` 없이 `acquisitionPrice`만 오면 엔진이 그 값을 취득가액으로 썼다(9억 133,060,000 · 1억 472,935,000 ↔ 평가액 3억 383,010,000).
 *   컴패니언 상속 — `inheritanceValuation` 없이 `fixedAcquisitionPrice`(구 계약)만 오면 그 값을 썼다(1억 418,035,000 ↔ 331,770,000).
 *   다건·컴패니언 증여는 그 칸이 평가액이라 걸지 않는다.
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
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { propertyItemSchema } from "@/lib/api/transfer-tax-schema";
import { refineDeemedSuccessorRightPrimary, refineDeemedSuccessorRightCompanion } from "@/lib/api/transfer-tax-schema-successor-deemed";
import type { z } from "zod";

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
const CAUSES: [string, A][] = [["증여", GIFT], ["상속", INH]];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clone = (b: any) => JSON.parse(JSON.stringify(b));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paths = (r: { error?: any }) => JSON.stringify(r.error ?? null);

describe.each(CAUSES)("%s 승계 입주권 — 단건 주 자산", (_n, C) => {
  it("화면 경로(평가액 페이로드) → 200 · 383,010,000", async () => {
    const r = await check(single(C));
    expect(r.status).toBe(200);
    expect(r.res.determinedTax).toBe(383_010_000);
  });
  it.each([900_000_000, 100_000_000])("평가액 페이로드 없이 acquisitionPrice %d → 400(종전 그 값으로 계산)", async (v) => {
    const b = clone((await check(single(C))).body);
    delete b.inheritedAcquisition;
    b.acquisitionPrice = v;
    const r = await postBody(b);
    expect(r.status).toBe(400);
    expect(paths(r)).toContain("§163⑨");
  });
  it("평가액 페이로드가 있으면 acquisitionPrice는 그대로 받는다(엔진은 평가액 · 383,010,000)", async () => {
    const b = clone((await check(single(C))).body);
    b.acquisitionPrice = 900_000_000;
    const r = await postBody(b);
    expect(r.status).toBe(200);
    expect(r.data.result.determinedTax).toBe(383_010_000);
  });
});

describe("함께 양도 컴패니언", () => {
  it("상속 — 화면 경로 200 · 상속개시일 평가액 없이 fixedAcquisitionPrice 100,000,000 → 400(종전 418,035,000)", async () => {
    const ok = await check(bundle(INH));
    expect(ok.status).toBe(200);
    expect(companionTax(ok)).toBe(331_770_000);
    const b = clone(ok.body);
    delete b.companionAssets[0].inheritanceValuation;
    b.companionAssets[0].fixedAcquisitionPrice = 100_000_000;
    const r = await postBody(b);
    expect(r.status).toBe(400);
    expect(paths(r)).toContain("inheritanceValuation");
  });
  it("증여 — fixedAcquisitionPrice가 증여 신고가액이다(걸지 않는다 · 200)", async () => {
    const ok = await check(bundle(GIFT));
    expect(ok.status).toBe(200);
    expect(companionTax(ok)).toBe(331_770_000);
  });
});

describe("가드", () => {
  it("매매 승계 입주권은 평가액 페이로드 없이 200", async () => {
    const r = await check(single(PUR));
    expect(r.body.inheritedAcquisition).toBeUndefined();
    expect(r.status).toBe(200);
  });
  it.each(CAUSES)("다건(%s) — acquisitionPrice가 평가액이라 이 규칙에 걸리지 않는다", (_n, C) => {
    const p = propertyItemSchema.safeParse(buildPropertyPayload(single(C)));
    const issues = p.success ? [] : p.error.issues.map((x) => x.path.join("."));
    expect(issues.filter((x) => x.startsWith("inheritedAcquisition"))).toEqual([]);
  });
  it("leaf — 부담부증여·이월과세·매매·원조합원은 대상 아님 · 평가액 있으면 통과", () => {
    const run = (d: Record<string, unknown>) => {
      const issues: unknown[] = [];
      refineDeemedSuccessorRightPrimary(d, { addIssue: (x: unknown) => issues.push(x) } as unknown as z.RefinementCtx);
      return issues.length;
    };
    const base = { isSuccessorRightToMoveIn: true, acquisitionCause: "gift", transferType: "general" };
    expect(run(base)).toBe(1);
    expect(run({ ...base, acquisitionCause: "inheritance" })).toBe(1);
    expect(run({ ...base, inheritedAcquisition: { reportedValue: 300_000_000 } })).toBe(0);
    expect(run({ ...base, inheritedAcquisition: { reportedValue: 0 } })).toBe(1);
    expect(run({ ...base, transferType: "burdened_gift" })).toBe(0);
    expect(run({ ...base, burdenedGiftInfo: {} })).toBe(0);
    expect(run({ ...base, acquisitionCause: "carryover_gift" })).toBe(0);
    expect(run({ ...base, acquisitionCause: "purchase" })).toBe(0);
    expect(run({ ...base, isSuccessorRightToMoveIn: false })).toBe(0);
    const runC = (d: Record<string, unknown>) => {
      const issues: unknown[] = [];
      refineDeemedSuccessorRightCompanion(d, { addIssue: (x: unknown) => issues.push(x) } as unknown as z.RefinementCtx, ["companionAssets", 0]);
      return issues.length;
    };
    expect(runC({ ...base, acquisitionCause: "inheritance" })).toBe(1);
    expect(runC({ ...base, acquisitionCause: "inheritance", inheritanceValuation: { publishedValueAtInheritance: 1 } })).toBe(0);
    expect(runC(base)).toBe(0);
    expect(runC({ ...base, acquisitionCause: "inheritance", transferType: "burdened_gift" })).toBe(0);
  });
});
