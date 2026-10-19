/**
 * 무조건 사업용 의제 「종중 소유」 — 선언 하나 · 근거 조문은 지목·도시지역 · 종중 취득일 = 자산 취득일 (2026-10-20)
 * 계획서: docs/00-pm/nbl-jongjoong-toggle-merge.plan.md
 *
 * 종전(master `a9c311b63` 실측 — 계획서 §3): 「종중 소유」 토글과 「도시지역 농지 — 종중 소유」(③4호 가목) 토글이 따로 있었다.
 *  - ③4호 토글은 날짜 칸이 없어 화면으로 성립시킬 수 없었다(도시 농지 201,091,000 — 법령대로 155,166,000).
 *  - 종중 토글의 날짜 칸을 비우면 ⑧ 없이 불성립했다(201,091,000).
 *  - 취득 2015 + 종중 취득일 2000이면 사업용 186,846,000(법령대로 비사업용 240,691,000).
 *  - 도시지역 농지를 §168의8③6호(법 §104의3①1호 가목 단서)로 인용했다 — 근거는 §168의14③4호 가목.
 *
 * 입력은 화면 폼 → ⑧ → ④(`callTransferTaxAPI`) → 실제 route(⑫⑭) → 엔진. 수치는 mock 세율표 실측값이다. 근거 조문은 같은
 * 매퍼·엔진 함수를 쓰는 클라이언트 어댑터(`evaluateUnconditionalExemption`)로 본다.
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 농지 3,000㎡ · 취득가 4억 · 양도가 10억 — 재촌·자경 없음(의제가 없으면 비사업용) */
const FARM = {
  assetKind: "land", acquisitionArea: "3000", transferArea: "3000", addressJibun: "강원 홍천군 테스트리 1", fixedAcquisitionPrice: "400000000",
  standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "farmland",
} as Partial<AssetForm>;
const RURAL = { nblZoneType: "agriculture_forest" } as Partial<AssetForm>;
const URBAN = { nblZoneType: "general_residential", addressJibun: "서울 강남구 테스트동 1", nblUrbanIncorporationDate: "2000-01-01" } as Partial<AssetForm>;
const BUY = (d: string) => ({ acquisitionCause: "purchase", acquisitionDate: d }) as Partial<AssetForm>;
const GIFT = (d: string) => ({ acquisitionCause: "gift", acquisitionDate: d, publishedValueAtGift: "400000000" }) as Partial<AssetForm>;
const INH = (d: string) =>
  ({ acquisitionCause: "inheritance", acquisitionDate: d, decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "400000000" }) as Partial<AssetForm>;
/** 「종중 소유」 선언 — 취득일은 자산 취득일이다 */
const JJ = { nblExemptJongjoongOwned: true } as Partial<AssetForm>;
/** 옛 저장값 — 이제 판정에 닿지 않아야 한다: ③4호 토글(#2282 전 「종중 또는 상속」) · 별도 종중 취득일 칸 */
const OLD_4HO = { nblExemptUrbanFarmlandJongjoong: true } as Partial<AssetForm>;
const OLD_JJ_DATE = (d: string) => ({ nblExemptJongjoongAcqDate: d }) as Partial<AssetForm>;
const FOREST = { nblLandType: "forest" } as Partial<AssetForm>;
const PASTURE = { nblLandType: "pasture" } as Partial<AssetForm>;

const T = "2024-06-03";

function form(transferDate: string, ...parts: Array<Partial<AssetForm>>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.filingDate = `${transferDate.slice(0, 4)}-08-31`;
  f.contractTotalPrice = "1000000000";
  f.assets = [Object.assign({ ...makeDefaultAsset(1) }, FARM, ...parts) as AssetForm];
  return f;
}

async function run(f: TransferFormData) {
  const cap: { body?: unknown } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cap.body),
  }));
  const json = (await res.json()) as {
    data?: { result?: { totalTax?: number; nonBusinessLandJudgmentDetail?: { isNonBusinessLand: boolean } } };
  };
  return {
    status: res.status,
    issues: [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)),
    total: json.data?.result?.totalTax,
    nbl: json.data?.result?.nonBusinessLandJudgmentDetail?.isNonBusinessLand,
  };
}


const R = (d: string) => form(T, RURAL, BUY(d));
const U = (d: string) => form(T, URBAN, BUY(d));
const B_URBAN_FARM = "소득세법 시행령 §168조의14 ③ 4호 가목";
const B_FARM = "소득세법 시행령 §168조의8 ③ 6호";
const B_FOREST = "소득세법 시행령 §168조의9 ③ 8호";
const B_PASTURE = "소득세법 시행령 §168조의10 ② 2호";

describe("무조건 사업용 의제 「종중 소유」 — 선언 하나 · 근거는 지목·도시지역 · 취득일은 자산 취득일", () => {
  it.each([
    ["J0 도시 농지 · 2000 · 선언 없음", U("2000-01-01"), true, 201_091_000, undefined],
    ["J1·J12 도시 농지 · 2000 + 종중 → ③4호 가목", form(T, URBAN, BUY("2000-01-01"), JJ), false, 155_166_000, B_URBAN_FARM],
    ["J5 비도시 농지 · 2000 + 종중 → §168의8③6호", form(T, RURAL, BUY("2000-01-01"), JJ), false, 155_166_000, B_FARM],
    ["J7·J13 비도시 임야 · 2000 + 종중 → §168의9③8호", form(T, RURAL, FOREST, BUY("2000-01-01"), JJ), false, 155_166_000, B_FOREST],
    ["도시 임야 · 2000 + 종중 → §168의9③8호(법 2호에 도시지역 요건 없음)", form(T, URBAN, FOREST, BUY("2000-01-01"), JJ), false, 155_166_000, B_FOREST],
    ["J8 도시 목장 · 2000 + 종중 → §168의10②2호(각 목 외의 부분 단서)", form(T, URBAN, PASTURE, BUY("2000-01-01"), JJ), false, 155_166_000, B_PASTURE],
    ["경계: 2005-12-31 취득 + 종중 → 성립", form(T, URBAN, BUY("2005-12-31"), JJ), false, 155_166_000, B_URBAN_FARM],
    ["경계: 2006-01-01 취득 + 종중 → 불성립", form(T, URBAN, BUY("2006-01-01"), JJ), true, 201_091_000, undefined],
    ["J9 도시 농지 · 2015 + 종중 → 불성립", form(T, URBAN, BUY("2015-01-01"), JJ), true, 240_691_000, undefined],
    ["J10 도시 농지 · 2015 + 종중 + 옛 종중 취득일 2000 → 옛 칸 무시", form(T, URBAN, BUY("2015-01-01"), JJ, OLD_JJ_DATE("2000-01-01")), true, 240_691_000, undefined],
    ["옛 종중 취득일 2015 · 자산 취득 2000 + 종중 → 자산 취득일로 성립", form(T, URBAN, BUY("2000-01-01"), JJ, OLD_JJ_DATE("2015-01-01")), false, 155_166_000, B_URBAN_FARM],
    ["J2·J3 옛 ③4호 토글 + 옛 종중 취득일 2000 · 종중 선언 없음 → 무시(Q-3 a)", form(T, URBAN, BUY("2000-01-01"), OLD_4HO, OLD_JJ_DATE("2000-01-01")), true, 201_091_000, undefined],
    ["옛 ③4호 토글(#2282 전 「상속」 의미) · 2003 상속 도시 농지 → 종중으로 읽지 않는다", form(T, URBAN, INH("2003-01-01"), OLD_4HO), true, 201_091_000, undefined],
    ["비도시 농지 · 2000 · 선언 없음", R("2000-01-01"), true, 201_091_000, undefined],
  ] as const)("%s", async (_name, f, nbl, total, basis) => {
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(r.nbl).toBe(nbl);
    expect(r.total).toBe(total);
    expect(evaluateUnconditionalExemption(f.assets[0], f.transferDate).matched?.legalBasis).toBe(basis);
  });
});
