/**
 * NBL2611-D1 (R20) — 화면 경로 anchor: 주택부수토지 배율 초과분 유예(Q-3a (나)) · 당해 사업개시일(Q-4 (나) DM-01).
 * 엔진 단위 anchor는 `__tests__/tax-engine/non-business-land/nbl2611-d1-period-followup.anchor.test.ts`.
 *
 * 입력은 화면 폼 → ⑧(`collectStepIssues`) → ④(`callTransferTaxAPI`) → 실제 route(⑫⑭) → 엔진이다.
 * 금액은 mock 세율표(`makeMockRates`) 실측이다 — 차이의 유무·방향·규모만 유효하다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const T = "2024-06-03";

/** 토지 1,000㎡ · 취득가 4억 · 양도가 10억 — 정밀판정 ON. 지목·용도지역은 각 블록이 채운다. */
const LAND = {
  assetKind: "land",
  acquisitionCause: "purchase",
  acquisitionDate: "2013-06-01",
  acquisitionArea: "1000",
  transferArea: "1000",
  addressJibun: "서울 강남구 테스트동 1",
  fixedAcquisitionPrice: "400000000",
  standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true,
  nblUseDetailedJudgment: true,
  // NBL-STATE-HISTORY-U1 픽스처 보정 — 기타토지는 「소유기간 중 건축물 이력」 질문에 답해야 ⑧을 통과한다(미선택 `""`은 ⑧ #1이 막는다). 이 파일의 주제와 무관해 «바뀐 적 없음»으로 둔다.
  nblOtherStateHistoryMode: "unchanged",
} as Partial<AssetForm>;

function form(...parts: Array<Partial<AssetForm>>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = T;
  f.filingDate = "2024-08-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [Object.assign({ ...makeDefaultAsset(1) }, LAND, ...parts) as AssetForm];
  return f;
}

async function bodyOf(f: TransferFormData): Promise<Loose> {
  const cap: { body?: Loose } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } catch { /* body만 필요하다 */ }
  vi.unstubAllGlobals();
  return cap.body!;
}

async function post(body: Loose) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = (await res.json()) as Loose;
  return { status: res.status, json, result: json?.data?.result as Loose | undefined };
}

/** ⑧ 이슈(전 단계) */
const issuesOf = (f: TransferFormData) =>
  [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f)).map((i) => ({ field: i.field as string | undefined, message: i.message }));

/** ⑧을 우회해 ④→route만 */
async function viaRoute(f: TransferFormData) {
  const body = await bodyOf(f);
  const r = await post(body);
  return { ...r, body, total: r.result?.totalTax as number | undefined, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}


describe("Q-3a (나) — 주택부수토지 배율 초과분 + 유예 (화면 경로)", () => {
  const HOUSING = {
    nblLandType: "housing_site",
    nblZoneType: "general_residential",
    nblIsMetropolitanArea: "no",
    nblHousingFootprint: "100", // 도시지역 수도권 밖 5배 → 허용 500㎡ · 토지 2,500㎡ → 초과 2,000㎡(비율 0.8)
    acquisitionArea: "2500",
    transferArea: "2500",
  } as Partial<AssetForm>;
  const GRACE_ALL = { nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "2013-06-02", endDate: T }] } as Partial<AssetForm>;

  it("H0 기준 — 유예 없음: 초과 2,000㎡ → 비율 0.8 비사업용 · 총세액 195,063,000(모의 세율)", async () => {
    const r = await viaRoute(form(HOUSING));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.nbl?.surcharge?.nonBusinessAreaRatio).toBe(0.8);
    expect(r.total).toBe(195_063_000);
  });

  it("H1 유예 전 기간 → ⑧ 통과 · 초과분이 사업용으로 돌아 전량 사업용 (정정 전: 비율 0.8 · 195,063,000)", async () => {
    const f = form(HOUSING, GRACE_ALL);
    expect(issuesOf(f)).toEqual([]);
    const r = await viaRoute(f);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.nbl?.isNonBusinessLand).toBe(false);
    expect(r.nbl?.periodEvaluation?.graceJudged?.meets).toBe(true);
    expect(r.total).toBe(176_286_000); // 전량 사업용 세액 — 같은 거래에서 배율 이내(정착면적 500㎡)로 넣은 대조와 같다
    expect((await viaRoute(form(HOUSING, { nblHousingFootprint: "500" }))).total).toBe(176_286_000);
  });
});

describe("Q-4 (나) DM-01 — 당해 사업개시일 (화면 경로)", () => {
  const OTHER = {
    nblLandType: "other_land",
    nblZoneType: "commercial",
    nblOtherPropertyTaxType: "comprehensive",
    nblRevenueBusinessType: "parking_operation",
    nblRevenueCurrentRevenue: "20,000,000",
    nblRevenueCurrentLandValue: "100,000,000",
  } as Partial<AssetForm>;
  const START = (d: string) => ({ nblRevenueCurrentBusinessStartDate: d }) as Partial<AssetForm>;

  it("S0 기준 — 개시일 미입력: 수입금액비율 충족 → 사업용", async () => {
    const r = await viaRoute(form(OTHER));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.nbl?.isNonBusinessLand).toBe(false);
  });

  it("S1 개시일 입력(양도일 3개월 전) → ④가 개시일을 싣고 엔진이 사업 구간 [개시일, 양도일]로 판정 → 비사업용 (정정 전: 사업용)", async () => {
    const f = form(OTHER, START("2024-03-01"));
    expect(issuesOf(f)).toEqual([]);
    const r = await viaRoute(f);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.body.nonBusinessLandRaw.nblRevenueCurrentBusinessStartDate).toBe("2024-03-01");
    expect(r.nbl?.isNonBusinessLand).toBe(true);
    expect(r.nbl?.revenueTestDetail?.businessStartJudged).toMatchObject({ startDate: "2024-03-01", meets: false });
  });

  it("S2 ⑧ — 개시일이 양도일보다 늦으면 그 칸으로 막는다", () => {
    const hit = issuesOf(form(OTHER, START("2024-06-04")));
    expect(hit[0]?.field, JSON.stringify(hit)).toBe("nblRevenueCurrentBusinessStartDate");
    expect(hit[0]?.message).toContain("양도일보다 늦습니다");
  });

  it("S3 경계 — 개시일 = 양도일은 막지 않는다(영위일수 1일)", () => {
    expect(issuesOf(form(OTHER, START(T)))).toEqual([]);
  });

  it("S4 ⑫ — 개시일이 양도일보다 늦은 직접 호출은 400", async () => {
    const ok = await bodyOf(form(OTHER, START("2024-03-01")));
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblRevenueCurrentBusinessStartDate = "2024-06-04";
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblRevenueCurrentBusinessStartDate");
  });

  it("S5 업종 미선택이면 stale 개시일은 막지 않는다(과차단 방지 · ⑧·⑫ 같은 게이트)", () => {
    expect(issuesOf(form({ nblLandType: "other_land", nblZoneType: "commercial", nblOtherPropertyTaxType: "comprehensive" }, START("2024-06-04")))).toEqual([]);
  });
});
