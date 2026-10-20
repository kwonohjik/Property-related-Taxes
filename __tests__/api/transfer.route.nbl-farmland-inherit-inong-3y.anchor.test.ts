/**
 * 농지 상속 3년·이농 3년(「소득세법 시행령」 §168의8③2호·3호) + 임야·목장 상속 3년의 기간 방식 (2026-10-20)
 * 계획서: docs/00-pm/nbl-farmland-inherit-inong-3y.plan.md
 *
 * 3년은 「양도일이 3년 안이면 켜지는 스위치」가 아니라 **기간**이다 — 상속개시일(이농일)부터 3년을 §168의6 기간기준의
 * 사업용 기간으로 센다(부동산거래관리과-504: 2005.7. 상속 → 2010.3. 양도, 재촌·자경 없음 → 비사업용 아님 ·
 * 서면-2019-부동산-4513).
 *
 * 종전(master `80126e4cc` 실측): 농지는 상속·이농 3년 분기가 없어 비사업용이었다(F2 302,236,000 · F3 274,780,000 ·
 * G1 267,916,000). 임야·목장은 양도일이 3년 안일 때만 적용돼 4.4년 보유(H1)는 비사업용 274,780,000이었다.
 * 아래 «사업용» 세액은 계획서 §3의 대리 실측(같은 시료에 3년 구간만큼 재촌·자경을 넣은 값)과 같다.
 *
 * 입력은 화면 폼 → ⑧ → ④(`callTransferTaxAPI`) → 실제 route(⑫⑭) → 엔진. 수치는 mock 세율표 실측값이다.
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
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 농림지역 3,000㎡ · 취득가 4억 · 양도가 10억 · 양도일 2024-06-03 — 재촌·자경 없음 */
const RURAL = {
  assetKind: "land", acquisitionArea: "3000", transferArea: "3000", addressJibun: "강원 홍천군 테스트리 1", fixedAcquisitionPrice: "400000000",
  standardPriceAtTransfer: "500000000", isNonBusinessLand: true, nblUseDetailedJudgment: true, nblZoneType: "agriculture_forest",
} as Partial<AssetForm>;
const FARM = { nblLandType: "farmland" } as Partial<AssetForm>;
const FOREST = { nblLandType: "forest" } as Partial<AssetForm>;
const PASTURE = { nblLandType: "pasture" } as Partial<AssetForm>;
const BUY = { acquisitionCause: "purchase", acquisitionDate: "2022-06-01" } as Partial<AssetForm>;
const INHERIT = (d: string) =>
  ({ acquisitionCause: "inheritance", acquisitionDate: d, decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "400000000" }) as Partial<AssetForm>;
const NON_HEIR = { nonHeirBequest: true } as Partial<AssetForm>;
/** 매매 취득 → 재촌·자경 → 이농. 이농 사실은 기존 이농 토글(§168의14③5호와 같은 입력)로 받는다 */
const FARMED = (buy: string, end: string) =>
  ({
    acquisitionCause: "purchase", acquisitionDate: buy, nblFarmingSelf: true, nblFarmerResidenceDistance: "5",
    nblBusinessUsePeriods: [{ startDate: buy, endDate: end, usageType: "farming" }],
  }) as Partial<AssetForm>;
const INONG = (d: string) => ({ nblExemptInong: true, nblExemptInongDate: d }) as Partial<AssetForm>;

function form(parts: Array<Partial<AssetForm>>, transferDate = "2024-06-03"): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.filingDate = "2024-08-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [Object.assign({ ...makeDefaultAsset(1) }, RURAL, ...parts) as AssetForm];
  return f;
}

interface NblDetail {
  isNonBusinessLand: boolean;
  warnings?: string[];
  judgmentSteps?: Array<{ id: string; status: string; detail: string; legalBasis?: string }>;
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
  const json = (await res.json()) as { data?: { result?: { totalTax?: number; nonBusinessLandJudgmentDetail?: NblDetail } } };
  const detail = json.data?.result?.nonBusinessLandJudgmentDetail;
  return {
    status: res.status,
    issues: [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)),
    total: json.data?.result?.totalTax,
    nbl: detail?.isNonBusinessLand,
    detail,
  };
}

describe("농지 상속 3년(§168의8③2호) — 상속개시일부터 3년을 사업용 기간으로 센다", () => {
  it.each([
    ["F1 매매(부정 짝)", [FARM, BUY], true, 302_236_000],
    ["F2 상속 2022-01-01 (2.4년)", [FARM, INHERIT("2022-01-01")], false, 236_511_000],
    ["F5 상속 2021-06-04 (3년 하루 전)", [FARM, INHERIT("2021-06-04")], false, 219_879_000],
    ["F5b 상속 2021-06-03 (양도일 = 3년 되는 날)", [FARM, INHERIT("2021-06-03")], false, 219_879_000],
    ["F3 상속 2020-01-01 (4.4년 · 504 유형)", [FARM, INHERIT("2020-01-01")], false, 214_335_000],
    ["F3b 상속 2019-07-01 (4.9년)", [FARM, INHERIT("2019-07-01")], false, 214_335_000],
    ["F4 상속 2017-01-01 (7.4년 — 3년을 넣어도 기간기준 미달)", [FARM, INHERIT("2017-01-01")], true, 254_188_000],
    ["F6 수유자 상속 2022-01-01 (기준-2019-법령해석재산-0324)", [FARM, INHERIT("2022-01-01"), NON_HEIR], true, 302_236_000],
  ] as const)("%s", async (_n, parts, nbl, total) => {
    const r = await run(form([...parts]));
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(r.nbl).toBe(nbl);
    expect(r.total).toBe(total);
  });

  it("판정 단계에 3년 구간과 근거 조문을 적는다", async () => {
    const r = await run(form([FARM, INHERIT("2020-01-01")]));
    const step = r.detail?.judgmentSteps?.find((s) => s.id === "farmland_deeming");
    expect(step?.status).toBe("PASS");
    expect(step?.detail).toContain("상속개시일 2020-01-01부터 3년(소득세법 시행령 §168조의8 ③ 2호)");
    expect(step?.legalBasis).toBe("소득세법 시행령 §168조의8 ③ 2호");
  });

  it("수유자 고지에 농지 상속 3년을 적는다", async () => {
    const r = await run(form([FARM, INHERIT("2022-01-01"), NON_HEIR]));
    expect(r.detail?.warnings?.join("\n")).toContain("농지 상속 3년(소득세법 시행령 §168조의8 ③ 2호)");
  });

  it("Q-4 — 1만㎡를 넘으면 «확인 필요»를 알리고 판정은 면적 전체에 적용한다", async () => {
    const big = { acquisitionArea: "12000", transferArea: "12000" } as Partial<AssetForm>;
    const r = await run(form([FARM, INHERIT("2022-01-01"), big]));
    expect(r.nbl).toBe(false);
    expect(r.detail?.warnings?.join("\n")).toContain("총 1만㎡까지만");
    const small = await run(form([FARM, INHERIT("2022-01-01")]));
    expect(small.detail?.warnings?.join("\n") ?? "").not.toContain("총 1만㎡까지만");
  });
});

describe("농지 이농 3년(§168의8③3호) — 이농일부터 3년을 사업용 기간으로 센다", () => {
  it.each([
    ["G1 매매 2019-06-01 · 자경 ~2021-01-01 · 이농 2021-01-01", [FARM, FARMED("2019-06-01", "2021-01-01"), INONG("2021-01-01")], false, 208_791_000],
    ["G0 같은 시료 · 이농 토글 없음(부정 짝)", [FARM, FARMED("2019-06-01", "2021-01-01")], true, 267_916_000],
  ] as const)("%s", async (_n, parts, nbl, total) => {
    const r = await run(form([...parts]));
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(r.nbl).toBe(nbl);
    expect(r.total).toBe(total);
  });

  it("2006.12.31. 이전 이농 + 2009.12.31.까지 양도는 종전대로 무조건 사업용(§168의14③5호)", async () => {
    const r = await run(form([FARM, FARMED("2000-01-01", "2005-06-01"), INONG("2005-06-01")], "2009-06-01"));
    expect(r.status).toBe(200);
    expect(r.nbl).toBe(false);
    expect(r.detail?.judgmentSteps?.find((s) => s.id === "unconditional_exemption")?.status).toBe("PASS");
  });

  it.each([
    ["이농일 빈칸", INONG(""), "이농일을 입력하세요"],
    ["이농일 > 양도일", INONG("2024-07-01"), "양도일(2024-06-03)보다 늦습니다"],
    ["이농일 < 취득일", INONG("2019-01-01"), "취득일(2019-06-01)보다 빠릅니다"],
  ] as const)("⑧ 이농 — %s 차단", async (_n, inong, msg) => {
    const f = form([FARM, FARMED("2019-06-01", "2021-01-01"), inong]);
    expect(JSON.stringify([0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)))).toContain(msg);
  });
});

describe("임야·목장 상속 3년(§168의9③7호·§168의10②1호) — 같은 기간 방식 (Q-5 b)", () => {
  it.each([
    ["H2 임야 · 상속 2022-01-01 (2.4년 — 종전과 같음)", [FOREST, INHERIT("2022-01-01")], false, 236_511_000],
    ["H1 임야 · 상속 2020-01-01 (4.4년)", [FOREST, INHERIT("2020-01-01")], false, 214_335_000],
    ["H4 임야 · 상속 2017-01-01 (7.4년)", [FOREST, INHERIT("2017-01-01")], true, 254_188_000],
    ["J2 목장 · 상속 2022-01-01 (2.4년 — 종전과 같음)", [PASTURE, INHERIT("2022-01-01")], false, 236_511_000],
    ["J1 목장 · 상속 2020-01-01 (4.4년)", [PASTURE, INHERIT("2020-01-01")], false, 214_335_000],
    ["J4 목장 · 상속 2017-01-01 (7.4년)", [PASTURE, INHERIT("2017-01-01")], true, 254_188_000],
  ] as const)("%s", async (_n, parts, nbl, total) => {
    const r = await run(form([...parts]));
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(r.nbl).toBe(nbl);
    expect(r.total).toBe(total);
  });
});
